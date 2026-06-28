import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, clientsTable } from "@workspace/db";
import {
  asaasCreateCustomer,
  asaasCreateCharge,
  asaasCreateInvoice,
  asaasListMunicipalServices,
} from "../lib/asaas";
import { getSecret } from "../lib/secure-settings.js";
import { sendWhatsapp } from "../lib/whatsapp.js";
import { sendTelegram } from "../lib/telegram.js";
import { sendGmailMessage } from "../lib/google-gmail.js";
import { requireCollaborator } from "./collaborator.js";
import {
  montarTextoCobranca,
  montarHtmlCobranca,
  montarAssuntoCobranca,
} from "../lib/cobranca-mensagem.js";

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

    const msg = {
      nomeCliente: client.name,
      valor: amount,
      descricao: (description as string | null) ?? null,
      vencimento: due,
      invoiceUrl: charge.invoiceUrl,
    };
    const texto = montarTextoCobranca(msg);

    const results: Array<{ channel: string; status: string; detail?: string }> = [];

    if (wants.email) {
      if (!email) {
        results.push({ channel: "email", status: "no_destination", detail: "Cliente sem e-mail." });
      } else {
        const r = await sendGmailMessage({ to: email, subject: montarAssuntoCobranca(), html: montarHtmlCobranca(msg) });
        results.push(
          r.success
            ? { channel: "email", status: "sent", detail: email }
            : { channel: "email", status: "error", detail: r.error },
        );
      }
    }

    if (wants.whatsapp) {
      if (!phone) {
        results.push({ channel: "whatsapp", status: "no_destination", detail: "Cliente sem telefone." });
      } else {
        const r = await sendWhatsapp(phone, texto);
        // HONESTIDADE: "fallback" so quando NAO ha credencial (link manual sem
        // erro). Twilio configurado mas que falhou e ERRO (com link de socorro),
        // nunca mascarar como "link gerado".
        if (r.sent && r.via === "twilio") {
          results.push({ channel: "whatsapp", status: "sent", detail: phone });
        } else if (r.error) {
          results.push({ channel: "whatsapp", status: "error", detail: `${r.error} — link manual: ${r.link}` });
        } else {
          results.push({ channel: "whatsapp", status: "fallback", detail: r.link });
        }
      }
    }

    if (wants.telegram) {
      if (!telegramChatId) {
        results.push({ channel: "telegram", status: "no_destination", detail: "Cliente sem Telegram (chat id)." });
      } else {
        const r = await sendTelegram(telegramChatId, texto);
        if (r.sent && !r.mock) results.push({ channel: "telegram", status: "sent", detail: telegramChatId });
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
    const [row] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.asaasChargeId, payment.id));
    if (!row) {
      // Cobranca desconhecida: nao derruba a rota (Asaas pode reenviar).
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      await db
        .update(paymentsTable)
        .set({ status: "paid", paidAt: payment.paymentDate || new Date().toISOString().slice(0, 10) })
        .where(eq(paymentsTable.id, row.id));
    } else if (event === "PAYMENT_OVERDUE") {
      await db.update(paymentsTable).set({ status: "overdue" }).where(eq(paymentsTable.id, row.id));
    } else if (
      event === "PAYMENT_DELETED" ||
      event === "PAYMENT_REFUNDED" ||
      event === "PAYMENT_CHARGEBACK_REQUESTED"
    ) {
      await db.update(paymentsTable).set({ status: "cancelled" }).where(eq(paymentsTable.id, row.id));
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    // Erro real: devolve 500 para o Asaas reenviar (idempotente).
    req.log.error({ err: String(err) }, "Erro no webhook Asaas");
    res.status(500).json({ error: "erro ao processar webhook" });
  }
});

export default router;
