import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  paymentsTable,
  clientsTable,
  bankAccountsTable,
  collaboratorAuditTable,
  professionalsTable,
  schedulingRequestsTable,
} from "@workspace/db";
import {
  asaasCreateCustomer,
  asaasCreateCharge,
  asaasCreateInvoice,
  asaasListMunicipalServices,
  asaasCreateTransfer,
  asaasListTransfers,
  type AsaasPixKeyType,
} from "../lib/asaas";
import { getSecret } from "../lib/secure-settings.js";
import { finalizeConciergeBooking } from "../lib/concierge-finalize.js";
import { registrarFalha } from "../lib/concierge-penalidade.js";
import { requireCollaborator } from "./collaborator.js";
import { montarAssuntoCobranca, formatBRL, formatDataBR } from "../lib/cobranca-mensagem.js";
import {
  enviarMensagemPaxter,
  absoluteBaseUrl,
  type PaxterCanal,
  type PaxterDoc,
} from "../lib/messaging/index.js";

const router: IRouter = Router();

// Garante o Customer no Asaas a partir do cliente do Manager (idempotente).
async function ensureCustomer(client: typeof clientsTable.$inferSelect): Promise<string> {
  if (client.asaasCustomerId) return client.asaasCustomerId;
  if (!client.cpf) {
    throw new Error("Cliente sem CPF — o Asaas exige CPF para cobrar.");
  }
  const customer = await asaasCreateCustomer({
    name: client.name,
    cpfCnpj: client.cpf,
    email: client.email,
    phone: client.phone,
  });
  await db
    .update(clientsTable)
    .set({ asaasCustomerId: customer.id })
    .where(eq(clientsTable.id, client.id));
  return customer.id;
}

// Erro especifico: a cobranca nasceu no Asaas mas falhou ao salvar localmente.
// Carrega o id da cobranca para conciliacao manual (nunca se perde o dinheiro).
class ChargeSaveError extends Error {
  constructor(public chargeId: string) {
    super(`Cobranca criada no Asaas mas falha ao salvar. Id para conciliacao: ${chargeId}`);
    this.name = "ChargeSaveError";
  }
}

// Valida o corpo comum dos dois lancadores. Retorna a mensagem de erro ou null.
function validateChargeInput(clientId: unknown, amount: unknown): string | null {
  if (!clientId || typeof amount !== "number" || amount <= 0) {
    return "clientId e amount (numero positivo) sao obrigatorios.";
  }
  if (amount < 5) {
    return "A pagina com todas as formas de pagamento exige no minimo R$ 5,00.";
  }
  return null;
}

// Motor UNICO de criacao de cobranca (usado pelo /charge e pelo /charge/launch).
// Cria o customer (idempotente), gera a cobranca no Asaas e grava em payments.
async function createChargeForClient(
  client: typeof clientsTable.$inferSelect,
  opts: { amount: number; description?: string | null; dueDate?: string | null },
): Promise<{
  payment: typeof paymentsTable.$inferSelect;
  charge: Awaited<ReturnType<typeof asaasCreateCharge>>;
  due: string;
}> {
  const customerId = await ensureCustomer(client);
  const due =
    opts.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.dueDate)
      ? opts.dueDate
      : new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const charge = await asaasCreateCharge({
    customerId,
    value: opts.amount,
    dueDate: due,
    description: opts.description || `Cobranca ${client.name}`,
  });

  let payment;
  try {
    [payment] = await db
      .insert(paymentsTable)
      .values({
        clientId: client.id,
        amount: opts.amount,
        method: "asaas",
        status: "pending",
        provider: "asaas",
        dueDate: due,
        description: opts.description || null,
        asaasChargeId: charge.id,
        asaasInvoiceUrl: charge.invoiceUrl,
        billingType: charge.billingType,
      })
      .returning();
  } catch {
    throw new ChargeSaveError(charge.id);
  }
  return { payment, charge, due };
}

// Cria uma cobranca avulsa (pagina hospedada "clica e paga") e salva no payments.
// Escrita financeira -> exige colaborador autenticado (padrao do app: financeiro.ts).
router.post("/asaas/charge", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const { clientId, amount, description, dueDate } = req.body || {};
    const vErr = validateChargeInput(clientId, amount);
    if (vErr) {
      res.status(400).json({ error: vErr });
      return;
    }
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Cliente nao encontrado." });
      return;
    }

    try {
      const { payment, charge } = await createChargeForClient(client, { amount, description, dueDate });
      res.status(201).json({
        id: payment.id,
        asaasChargeId: charge.id,
        invoiceUrl: charge.invoiceUrl,
        status: payment.status,
        amount,
      });
    } catch (e) {
      if (e instanceof ChargeSaveError) {
        req.log.error({ chargeId: e.chargeId }, "Cobranca Asaas criada mas falhou ao salvar no banco");
        res.status(500).json({ error: e.message });
        return;
      }
      throw e;
    }
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao criar cobranca Asaas");
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao falar com o Asaas." });
  }
});

// Lancador de Cobranca multicanal: cria a cobranca E dispara o link de pagamento
// pelos canais escolhidos (e-mail/WhatsApp/Telegram), com STATUS HONESTO por canal.
// Nunca diz "enviado" quando foi fallback/mock. O invoiceUrl sempre volta.
// Escrita financeira + disparo de mensagens -> exige colaborador autenticado.
router.post("/asaas/charge/launch", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const { clientId, amount, description, dueDate, channels, destinations } = req.body || {};
    const vErr = validateChargeInput(clientId, amount);
    if (vErr) {
      res.status(400).json({ error: vErr });
      return;
    }
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Cliente nao encontrado." });
      return;
    }
    // Pre-checa CPF (Asaas exige) para dar erro 400 claro ANTES de qualquer envio.
    if (!client.asaasCustomerId && !client.cpf) {
      res.status(400).json({ error: "Cliente sem CPF — o Asaas exige CPF para cobrar. Cadastre o CPF antes." });
      return;
    }

    let payment: typeof paymentsTable.$inferSelect;
    let charge: Awaited<ReturnType<typeof asaasCreateCharge>>;
    let due: string;
    try {
      ({ payment, charge, due } = await createChargeForClient(client, { amount, description, dueDate }));
    } catch (e) {
      if (e instanceof ChargeSaveError) {
        req.log.error({ chargeId: e.chargeId }, "Cobranca Asaas criada mas falhou ao salvar no banco");
        res.status(500).json({ error: e.message });
        return;
      }
      throw e;
    }

    const wants = {
      email: channels?.email === true,
      whatsapp: channels?.whatsapp === true,
      telegram: channels?.telegram === true,
    };
    const email = String(destinations?.email || client.email || "").trim();
    const phone = String(destinations?.phone || client.phone || "").trim();
    const telegramChatId = String(destinations?.telegramChatId || client.telegramChatId || "").trim();

    // Documento ÚNICO (Motor Hermes, Art. 66): a marca é vestida pelo motor nos
    // 3 canais a partir DESTE doc — esta rota não monta HTML/texto de marca.
    const ref = (description as string | null)?.trim();
    const doc: PaxterDoc = {
      eyebrow: "Cobrança",
      titulo: "Link de pagamento",
      paragrafos: [
        `Olá, ${client.name}. Segue a sua cobrança.`,
        `Valor: R$ ${formatBRL(amount)}.`,
        ...(ref ? [`Referente a: ${ref}.`] : []),
        `Vencimento: ${formatDataBR(due)}.`,
        `Pague com PIX, cartão ou boleto tocando no botão abaixo.`,
      ],
      botao: { label: "Pagar agora", url: charge.invoiceUrl },
      notaRodape: "Cobrança processada pelo Asaas. Qualquer dúvida, estamos à disposição.",
      assunto: montarAssuntoCobranca(),
    };

    const canais: PaxterCanal[] = [];
    if (wants.email) canais.push("EMAIL");
    if (wants.whatsapp) canais.push("WHATSAPP");
    if (wants.telegram) canais.push("TELEGRAM");

    const envio = await enviarMensagemPaxter(
      doc,
      { email, telefone: phone, telegramChatId, nome: client.name },
      canais,
      { baseUrl: absoluteBaseUrl(req) },
    );

    // Mapeia o STATUS HONESTO do motor para o formato esperado pelo front.
    // Mantém a regra: Twilio que falhou é ERRO (com link de socorro), nunca
    // mascarado como "link gerado"; fallback só quando não há credencial.
    const results: Array<{ channel: string; status: string; detail?: string }> = [];
    for (const r of envio.resultados) {
      if (r.canal === "EMAIL") {
        if (r.skipped) results.push({ channel: "email", status: "no_destination", detail: "Cliente sem e-mail." });
        else if (r.sent) results.push({ channel: "email", status: "sent", detail: email });
        else results.push({ channel: "email", status: "error", detail: r.error });
      } else if (r.canal === "WHATSAPP") {
        if (r.skipped) results.push({ channel: "whatsapp", status: "no_destination", detail: "Cliente sem telefone." });
        else if (r.sent && r.via === "twilio") results.push({ channel: "whatsapp", status: "sent", detail: phone });
        else if (r.error) results.push({ channel: "whatsapp", status: "error", detail: `${r.error} — link manual: ${r.link}` });
        else results.push({ channel: "whatsapp", status: "fallback", detail: r.link });
      } else if (r.canal === "TELEGRAM") {
        if (r.skipped) results.push({ channel: "telegram", status: "no_destination", detail: "Cliente sem Telegram (chat id)." });
        else if (r.sent && !r.mock) results.push({ channel: "telegram", status: "sent", detail: telegramChatId });
        else if (r.mock) results.push({ channel: "telegram", status: "mock", detail: "Sem token configurado: envio simulado." });
        else results.push({ channel: "telegram", status: "error", detail: r.error });
      }
    }

    res.status(201).json({
      id: payment.id,
      asaasChargeId: charge.id,
      invoiceUrl: charge.invoiceUrl,
      status: payment.status,
      amount,
      channels: results,
    });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao lancar cobranca Asaas");
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao falar com o Asaas." });
  }
});

// ----- NFS-e (Nota Fiscal de Servico) — Onda 2 -----

// Lista servicos municipais da conta Asaas (para obter o municipalServiceId).
// Leitura sensivel (config fiscal) -> exige colaborador autenticado.
router.get("/asaas/invoice/municipal-services", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const description = typeof req.query.description === "string" ? req.query.description : undefined;
    const list = await asaasListMunicipalServices(description);
    res.status(200).json({ services: list });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao listar servicos municipais Asaas");
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao falar com o Asaas." });
  }
});

// Lancador de NFS-e: cria/agenda a nota no Asaas com DATA-BIND.
// Origem: paymentId (nota vinculada a uma cobranca local que tem asaasChargeId)
// OU clientId (nota avulsa, vinculada ao customer do Asaas).
// O status retornado e SEMPRE o real do Asaas (nunca simulado). Se a conta nao
// tiver configuracao fiscal, o Asaas devolve erro e a mensagem real e exibida.
// Escrita fiscal -> exige colaborador autenticado.
router.post("/asaas/invoice/launch", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const {
      paymentId,
      clientId,
      serviceDescription,
      value,
      effectiveDate,
      observations,
      municipalServiceId,
      municipalServiceCode,
      municipalServiceName,
    } = req.body || {};

    if (typeof serviceDescription !== "string" || !serviceDescription.trim()) {
      res.status(400).json({ error: "serviceDescription (descricao do servico) e obrigatorio." });
      return;
    }
    if (typeof value !== "number" || value <= 0) {
      res.status(400).json({ error: "value (valor da nota) deve ser um numero positivo." });
      return;
    }
    const eff =
      typeof effectiveDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
        ? effectiveDate
        : new Date().toISOString().slice(0, 10);

    // Resolve o vinculo (payment OU customer).
    let paymentRef: string | undefined;
    let customerRef: string | undefined;

    if (paymentId) {
      const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
      if (!payment) {
        res.status(404).json({ error: "Cobranca (payment) nao encontrada." });
        return;
      }
      if (!payment.asaasChargeId) {
        res.status(400).json({
          error: "Esta cobranca nao tem id do Asaas — nao da para vincular a nota. Use o modo avulso por cliente.",
        });
        return;
      }
      paymentRef = payment.asaasChargeId;
    } else if (clientId) {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
      if (!client) {
        res.status(404).json({ error: "Cliente nao encontrado." });
        return;
      }
      if (!client.asaasCustomerId && !client.cpf) {
        res.status(400).json({ error: "Cliente sem CPF — o Asaas exige documento para a nota. Cadastre o CPF antes." });
        return;
      }
      customerRef = await ensureCustomer(client);
    } else {
      res.status(400).json({ error: "Informe paymentId (nota de uma cobranca) ou clientId (nota avulsa)." });
      return;
    }

    const invoice = await asaasCreateInvoice({
      payment: paymentRef,
      customer: customerRef,
      serviceDescription: serviceDescription.trim(),
      value,
      effectiveDate: eff,
      observations: typeof observations === "string" && observations.trim() ? observations.trim() : undefined,
      municipalServiceId: municipalServiceId || undefined,
      municipalServiceCode: municipalServiceCode || undefined,
      municipalServiceName: municipalServiceName || undefined,
    });

    res.status(201).json({ invoice });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao lancar NFS-e Asaas");
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao falar com o Asaas." });
  }
});

// ----- Cadastro de Bancos + Transferencias (Onda 3) -----

// Trava de seguranca: maximo por transferencia (ajustavel pelo CEO).
const TRANSFER_MAX = 5000;
const TRANSFER_MIN = 1;

function onlyDigits(s: unknown): string {
  return typeof s === "string" ? s.replace(/\D/g, "") : "";
}

// Mascara o documento/chave para a auditoria: mostra so os 4 ultimos digitos.
function maskTail(s: string): string {
  const d = s.replace(/\s/g, "");
  if (d.length <= 4) return "****";
  return `****${d.slice(-4)}`;
}

// Deriva o tipo da chave Pix quando ela e o proprio documento (CPF/CNPJ).
function pixTypeFromPerson(personType: string, pixKey: string): AsaasPixKeyType {
  const digits = pixKey.replace(/\D/g, "");
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  if (pixKey.includes("@")) return "EMAIL";
  return personType === "PJ" ? "CNPJ" : "CPF";
}

function serializeBankAccount(r: typeof bankAccountsTable.$inferSelect) {
  return {
    id: r.id,
    holderName: r.holderName,
    personType: r.personType,
    document: r.document,
    bankName: r.bankName,
    bankCode: r.bankCode,
    agency: r.agency,
    account: r.account,
    accountType: r.accountType,
    pixKey: r.pixKey,
    pixKeyType: r.pixKeyType,
    active: r.active,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

// Valida o corpo de criacao/edicao de conta. Retorna a mensagem de erro ou null.
function validateBankBody(b: any): string | null {
  if (!b || typeof b !== "object") return "Corpo invalido.";
  if (typeof b.holderName !== "string" || !b.holderName.trim()) return "Titular e obrigatorio.";
  if (b.personType !== "PF" && b.personType !== "PJ") return "Tipo deve ser PF ou PJ.";
  const doc = onlyDigits(b.document);
  if (doc.length !== 11 && doc.length !== 14) return "Documento (CPF/CNPJ) invalido.";
  if (typeof b.bankName !== "string" || !b.bankName.trim()) return "Banco e obrigatorio.";
  if (typeof b.agency !== "string" || !b.agency.trim()) return "Agencia e obrigatoria.";
  if (typeof b.account !== "string" || !b.account.trim()) return "Conta e obrigatoria.";
  return null;
}

// GET /asaas/bank-accounts — lista as contas autorizadas (whitelist).
router.get("/asaas/bank-accounts", requireCollaborator, async (_req, res): Promise<void> => {
  const rows = await db.select().from(bankAccountsTable).orderBy(desc(bankAccountsTable.active), bankAccountsTable.holderName);
  res.status(200).json({ accounts: rows.map(serializeBankAccount) });
});

// POST /asaas/bank-accounts — cria conta.
router.post("/asaas/bank-accounts", requireCollaborator, async (req, res): Promise<void> => {
  const b = req.body || {};
  const vErr = validateBankBody(b);
  if (vErr) {
    res.status(400).json({ error: vErr });
    return;
  }
  const doc = onlyDigits(b.document);
  const pixKey = (typeof b.pixKey === "string" && b.pixKey.trim()) ? b.pixKey.trim() : doc;
  const pixKeyType = (b.pixKeyType as AsaasPixKeyType) || pixTypeFromPerson(b.personType, pixKey);
  try {
    const [row] = await db
      .insert(bankAccountsTable)
      .values({
        holderName: String(b.holderName).trim(),
        personType: b.personType,
        document: doc,
        bankName: String(b.bankName).trim(),
        bankCode: typeof b.bankCode === "string" && b.bankCode.trim() ? b.bankCode.trim() : null,
        agency: String(b.agency).trim(),
        account: String(b.account).trim(),
        accountType: b.accountType === "CONTA_POUPANCA" ? "CONTA_POUPANCA" : "CONTA_CORRENTE",
        pixKey,
        pixKeyType,
        active: b.active === false ? false : true,
        note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
      })
      .returning();
    res.status(201).json({ account: serializeBankAccount(row) });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Ja existe uma conta cadastrada com este documento." });
      return;
    }
    throw e;
  }
});

// PUT /asaas/bank-accounts/:id — edita conta.
router.put("/asaas/bank-accounts/:id", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalido." });
    return;
  }
  const b = req.body || {};
  const vErr = validateBankBody(b);
  if (vErr) {
    res.status(400).json({ error: vErr });
    return;
  }
  const doc = onlyDigits(b.document);
  const pixKey = (typeof b.pixKey === "string" && b.pixKey.trim()) ? b.pixKey.trim() : doc;
  const pixKeyType = (b.pixKeyType as AsaasPixKeyType) || pixTypeFromPerson(b.personType, pixKey);
  try {
    const [row] = await db
      .update(bankAccountsTable)
      .set({
        holderName: String(b.holderName).trim(),
        personType: b.personType,
        document: doc,
        bankName: String(b.bankName).trim(),
        bankCode: typeof b.bankCode === "string" && b.bankCode.trim() ? b.bankCode.trim() : null,
        agency: String(b.agency).trim(),
        account: String(b.account).trim(),
        accountType: b.accountType === "CONTA_POUPANCA" ? "CONTA_POUPANCA" : "CONTA_CORRENTE",
        pixKey,
        pixKeyType,
        active: b.active === false ? false : true,
        note: typeof b.note === "string" && b.note.trim() ? b.note.trim() : null,
      })
      .where(eq(bankAccountsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Conta nao encontrada." });
      return;
    }
    res.status(200).json({ account: serializeBankAccount(row) });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Ja existe outra conta com este documento." });
      return;
    }
    throw e;
  }
});

// DELETE /asaas/bank-accounts/:id — desativa a conta (soft delete: sai da whitelist).
router.delete("/asaas/bank-accounts/:id", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalido." });
    return;
  }
  const [row] = await db
    .update(bankAccountsTable)
    .set({ active: false })
    .where(eq(bankAccountsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Conta nao encontrada." });
    return;
  }
  res.status(200).json({ account: serializeBankAccount(row) });
});

// POST /asaas/transfer — transfere saldo Asaas para uma conta AUTORIZADA (Pix).
// Travas, em ordem, ANTES de tocar o Asaas: confirmacao -> whitelist -> valor ->
// limite. So entao chama o provedor. Registra auditoria com destino MASCARADO.
router.post("/asaas/transfer", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const { bankAccountId, value, description, confirm } = req.body || {};

    // 1) Confirmacao obrigatoria (a UI so envia apos o passo de revisao).
    if (confirm !== true) {
      res.status(400).json({ error: "Confirmacao obrigatoria: revise e confirme a transferencia antes de enviar." });
      return;
    }
    // 2) Whitelist: a conta precisa existir e estar ativa.
    const id = Number(bankAccountId);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "bankAccountId e obrigatorio." });
      return;
    }
    const [account] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
    if (!account || !account.active) {
      res.status(404).json({ error: "Conta de destino nao autorizada (nao cadastrada ou inativa)." });
      return;
    }
    // 3) Valor positivo e minimo.
    if (typeof value !== "number" || !isFinite(value) || value < TRANSFER_MIN) {
      res.status(400).json({ error: `Valor invalido. Minimo de R$ ${TRANSFER_MIN.toFixed(2).replace(".", ",")} por transferencia.` });
      return;
    }
    // 4) Limite de seguranca por transferencia.
    if (value > TRANSFER_MAX) {
      res.status(400).json({
        error: `Acima do limite de seguranca de R$ ${TRANSFER_MAX.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por transferencia.`,
      });
      return;
    }

    const pixKey = account.pixKey || account.document;
    const pixKeyType = (account.pixKeyType as AsaasPixKeyType) || pixTypeFromPerson(account.personType, pixKey);

    // 5) Dispara no Asaas (status sempre real).
    const transfer = await asaasCreateTransfer({
      value,
      pixAddressKey: pixKey,
      pixAddressKeyType: pixKeyType,
      description: typeof description === "string" && description.trim() ? description.trim() : `Transferencia para ${account.holderName}`,
    });

    // 6) Auditoria: quem, quanto e destino MASCARADO (nunca documento/chave inteiros).
    const actor = req.collaborator!;
    const [actorProf] = await db
      .select({ name: professionalsTable.name })
      .from(professionalsTable)
      .where(eq(professionalsTable.id, actor.professionalId))
      .limit(1);
    try {
      await db.insert(collaboratorAuditTable).values({
        professionalId: actor.professionalId,
        professionalName: actorProf?.name ?? null,
        action: "write",
        method: "POST",
        path: "/asaas/transfer",
        detail: {
          bankAccountId: account.id,
          holderName: account.holderName,
          bankName: account.bankName,
          documentMasked: maskTail(account.document),
          pixKeyMasked: maskTail(pixKey),
          value,
          transferId: transfer.id,
          status: transfer.status,
        },
        ip: req.ip ?? null,
      });
    } catch {
      // auditoria nunca derruba a operacao principal
    }

    res.status(201).json({ transfer });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao transferir via Asaas");
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao falar com o Asaas." });
  }
});

// GET /asaas/transfers — historico de transferencias (status real do Asaas).
router.get("/asaas/transfers", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const max = Math.min(Number(req.query.max) || 50, 200);
    const transfers = await asaasListTransfers(max);
    res.status(200).json({ transfers });
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao listar transferencias Asaas");
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao falar com o Asaas." });
  }
});

// Webhook do Asaas: confirma pagamento sozinho. Valida o token; idempotente.
router.post("/asaas/webhook", async (req, res): Promise<void> => {
  const token = req.header("asaas-access-token");
  const expected = await getSecret("asaas.webhookToken");
  if (!expected || token !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const event: string | undefined = req.body?.event;
  const payment = req.body?.payment;
  if (!event || !payment?.id) {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    // A cobranca pode estar na tabela de pagamentos (clientes) OU amarrada a uma
    // solicitacao de agendamento Concierge (lead ainda nao cadastrado). Atualiza
    // as duas fontes que existirem; so ignora se nenhuma reconhecer o charge.
    const [row] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.asaasChargeId, payment.id));
    const [sreq] = await db
      .select()
      .from(schedulingRequestsTable)
      .where(eq(schedulingRequestsTable.asaasChargeId, payment.id));
    if (!row && !sreq) {
      // Cobranca desconhecida: nao derruba a rota (Asaas pode reenviar).
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const paidDate = payment.paymentDate || new Date().toISOString().slice(0, 10);

    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      if (row) {
        await db
          .update(paymentsTable)
          .set({ status: "paid", paidAt: paidDate })
          .where(eq(paymentsTable.id, row.id));
      }
      if (sreq) {
        await db
          .update(schedulingRequestsTable)
          .set({ paymentStatus: "pago", paidAt: sreq.paidAt ?? paidDate })
          .where(eq(schedulingRequestsTable.id, sreq.id));
        // Confirmou o pagamento: finaliza (cadastro + acesso + e-mail de chegada).
        // Idempotente (advisory lock + finalizedAt) contra o polling concorrente e
        // contra reenvio de webhook (caso extremo 4). Best-effort: nao derruba a rota.
        await finalizeConciergeBooking(sreq.id).catch((err) =>
          req.log.error({ err: String(err), id: sreq.id }, "finalizeConciergeBooking (webhook) falhou"),
        );
      }
    } else if (event === "PAYMENT_OVERDUE") {
      if (row) {
        await db.update(paymentsTable).set({ status: "overdue" }).where(eq(paymentsTable.id, row.id));
      }
      if (sreq) {
        await db
          .update(schedulingRequestsTable)
          .set({ paymentStatus: "expirado" })
          .where(eq(schedulingRequestsTable.id, sreq.id));
        // Trava de escassez: cobrança concierge expirou sem pagamento → registra falha.
        // eventId determinístico (evento:chargeId) garante idempotência contra reenvios do Asaas.
        if (sreq.path === "concierge" && sreq.entrada === "dr_caio") {
          const eventId = `${event}:${payment.id}`;
          await registrarFalha(sreq.patientCpf, eventId).catch((err: unknown) =>
            req.log.error({ err: String(err), id: sreq.id }, "registrarFalha concierge (webhook overdue) falhou"),
          );
        }
      }
    } else if (
      event === "PAYMENT_DELETED" ||
      event === "PAYMENT_REFUNDED" ||
      event === "PAYMENT_CHARGEBACK_REQUESTED"
    ) {
      if (row) {
        await db.update(paymentsTable).set({ status: "cancelled" }).where(eq(paymentsTable.id, row.id));
      }
      if (sreq) {
        await db
          .update(schedulingRequestsTable)
          .set({ paymentStatus: "cancelado" })
          .where(eq(schedulingRequestsTable.id, sreq.id));
        // Trava de escassez: cobrança concierge cancelada/estornada → registra falha.
        // eventId determinístico (evento:chargeId) garante idempotência contra reenvios do Asaas.
        if (sreq.path === "concierge" && sreq.entrada === "dr_caio") {
          const eventId = `${event}:${payment.id}`;
          await registrarFalha(sreq.patientCpf, eventId).catch((err: unknown) =>
            req.log.error({ err: String(err), id: sreq.id }, "registrarFalha concierge (webhook cancelado) falhou"),
          );
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    // Erro real: devolve 500 para o Asaas reenviar (idempotente).
    req.log.error({ err: String(err) }, "Erro no webhook Asaas");
    res.status(500).json({ error: "erro ao processar webhook" });
  }
});

export default router;
