/**
 * Laboratorio de cobrancas de teste em PRODUCAO (autorizado pelo titular).
 * 14/11/2026 (1a ordem): ate R$ 1,00 por cobranca, 50 cobrancas. 14/11/2026 (ordem posterior, vigente):
 * ate R$ 5,00 por cobranca (minimo do Asaas de producao), ate 10 cobrancas, soma ate R$ 50,00.
 * Travas no SERVIDOR: ate 500 centavos por cobranca, ate 10 cobrancas, soma ate 5000 centavos.
 * Cada tentativa reserva uma linha (contada) ANTES de falar com o Asaas, sob trava de banco,
 * entao concorrencia ou repeticao nunca ultrapassa o teto. Recusa definitiva do Asaas (4xx)
 * libera a reserva; falha incerta (rede/5xx) continua contada ate conferencia humana.
 */
import { db, clientsTable } from "@workspace/db";
import { logger } from "./logger.js";
import { eq, sql } from "drizzle-orm";
import { asaasCreateCharge, asaasCreateCustomer, asaasGetCharge, asaasGetCustomer } from "./asaas.js";
import { sendGmailMessage } from "./google-gmail.js";
import { sendTelegram, sendTelegramPhotoBuffer } from "./telegram.js";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual.js";
import { brtISODate } from "./brt.js";
import { emitirLinkTeste, flyerDoLink } from "./cobranca-link.js";

export const TESTE_MAX_CENTAVOS_POR_COBRANCA = 500;
export const TESTE_MAX_COBRANCAS = 10;
export const TESTE_MAX_TOTAL_CENTAVOS = 5000;
export const TESTE_TIPOS = ["PIX", "BOLETO", "UNDEFINED"] as const;
export type TesteTipo = (typeof TESTE_TIPOS)[number];

const LOCK_KEY = 20261114;
const PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

export class TesteRecusado extends Error {
  constructor(public codigo: number, msg: string) { super(msg); }
}

export async function ensureAsaasTesteTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS asaas_cobrancas_teste (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      valor_centavos INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      vencimento TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'reservada',
      asaas_charge_id TEXT UNIQUE,
      asaas_status TEXT,
      invoice_url TEXT,
      erro TEXT,
      criado_por TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pago_em TEXT
    )`);
  // Evolucao aditiva e idempotente: teto por cobranca (troca da restricao antiga de 100 centavos),
  // valor liquido informado pelo Asaas e registro de entrega do link por canal.
  await db.execute(sql`ALTER TABLE asaas_cobrancas_teste DROP CONSTRAINT IF EXISTS asaas_cobrancas_teste_valor_centavos_check`);
  await db.execute(sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asaas_cobrancas_teste_valor_max_500') THEN
      ALTER TABLE asaas_cobrancas_teste ADD CONSTRAINT asaas_cobrancas_teste_valor_max_500 CHECK (valor_centavos BETWEEN 1 AND 500);
    END IF; END $$`);
  await db.execute(sql`ALTER TABLE asaas_cobrancas_teste
    ADD COLUMN IF NOT EXISTS liquido_centavos INTEGER,
    ADD COLUMN IF NOT EXISTS link_email_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS link_telegram_em TIMESTAMPTZ`);
}

export interface TesteEntrada {
  clientId: number;
  valorCentavos: number;
  tipo: TesteTipo;
  descricao: string;
  diasVencimento: number;
  confirmo: boolean;
}

export function validarEntrada(b: any): TesteEntrada {
  const v = b?.valorCentavos;
  if (!Number.isInteger(v) || v < 1 || v > TESTE_MAX_CENTAVOS_POR_COBRANCA)
    throw new TesteRecusado(400, `valorCentavos deve ser inteiro entre 1 e ${TESTE_MAX_CENTAVOS_POR_COBRANCA}.`);
  if (!Number.isInteger(b?.clientId) || b.clientId <= 0) throw new TesteRecusado(400, "clientId obrigatorio.");
  if (!TESTE_TIPOS.includes(b?.tipo)) throw new TesteRecusado(400, "tipo deve ser PIX, BOLETO ou UNDEFINED.");
  const descricao = String(b?.descricao ?? "").trim().slice(0, 120);
  if (!descricao) throw new TesteRecusado(400, "descricao obrigatoria.");
  const dias = b?.diasVencimento ?? 1;
  if (!Number.isInteger(dias) || dias < 1 || dias > 30) throw new TesteRecusado(400, "diasVencimento deve estar entre 1 e 30.");
  if (b?.confirmo !== true) throw new TesteRecusado(400, "Confirmacao explicita de cobranca REAL em producao e obrigatoria.");
  return { clientId: b.clientId, valorCentavos: v, tipo: b.tipo, descricao, diasVencimento: dias, confirmo: true };
}

export async function resumoTeste() {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS qtd, COALESCE(SUM(valor_centavos),0)::int AS total
    FROM asaas_cobrancas_teste WHERE estado <> 'recusada'`);
  const row: any = r.rows[0];
  return {
    cobrancas: row.qtd as number,
    totalCentavos: row.total as number,
    maxCobrancas: TESTE_MAX_COBRANCAS,
    maxTotalCentavos: TESTE_MAX_TOTAL_CENTAVOS,
    maxCentavosPorCobranca: TESTE_MAX_CENTAVOS_POR_COBRANCA,
  };
}

/** Reserva contada sob trava de banco: nada ultrapassa o teto, mesmo com chamadas simultaneas. */
export async function reservarTeste(e: TesteEntrada, venc: string, operador: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
    const r: any = (await tx.execute(sql`
      SELECT COUNT(*)::int AS qtd, COALESCE(SUM(valor_centavos),0)::int AS total
      FROM asaas_cobrancas_teste WHERE estado <> 'recusada'`)).rows[0];
    if (r.qtd + 1 > TESTE_MAX_COBRANCAS)
      throw new TesteRecusado(409, `Limite de ${TESTE_MAX_COBRANCAS} cobrancas de teste atingido.`);
    if (r.total + e.valorCentavos > TESTE_MAX_TOTAL_CENTAVOS)
      throw new TesteRecusado(409, "Limite total de R$ 50,00 em cobrancas de teste atingido.");
    const ins: any = await tx.execute(sql`
      INSERT INTO asaas_cobrancas_teste (client_id, valor_centavos, tipo, descricao, vencimento, criado_por)
      VALUES (${e.clientId}, ${e.valorCentavos}, ${e.tipo}, ${e.descricao}, ${venc}, ${operador})
      RETURNING id`);
    return ins.rows[0].id as number;
  });
}

const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");
const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

/**
 * Conferencia SOMENTE LEITURA: o cliente no Asaas precisa ser a mesma pessoa e ter o mesmo e-mail do
 * cadastro local. Divergencia bloqueia ANTES de reservar ou cobrar; nada e corrigido por inferencia.
 * Devolve se o Asaas avisara o cliente por conta propria (e-mail/SMS do proprio Asaas).
 */
export async function conferirTitularAsaas(client: { name: string; cpf: string | null; email: string | null; asaasCustomerId: string | null }) {
  if (!client.asaasCustomerId) return { asaasAvisaCliente: false };
  if (!client.email) throw new TesteRecusado(409, "Cadastro sem e-mail: o link nao tem para onde ir.");
  const a = await asaasGetCustomer(client.asaasCustomerId).catch((err: any) => {
    throw new TesteRecusado(502, `Nao foi possivel conferir o cliente no Asaas (${err?.message ?? "erro"}).`);
  });
  const diverge: string[] = [];
  if (a.deleted) diverge.push("cliente removido no Asaas");
  if (norm(a.name) !== norm(client.name)) diverge.push("nome");
  if (soDigitos(a.cpfCnpj) !== soDigitos(client.cpf)) diverge.push("documento");
  if (norm(a.email) !== norm(client.email)) diverge.push("e-mail");
  if (diverge.length)
    throw new TesteRecusado(409, `Cadastro local e cliente do Asaas divergem (${diverge.join(", ")}). Nada foi cobrado nem alterado; a correcao exige decisao do titular.`);
  return { asaasAvisaCliente: !a.notificationDisabled };
}

export async function criarCobrancaTeste(e: TesteEntrada, operador: string) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, e.clientId));
  if (!client) throw new TesteRecusado(404, "Cliente nao encontrado.");
  if (!client.asaasCustomerId && !client.cpf)
    throw new TesteRecusado(400, "Cliente sem cadastro Asaas e sem CPF.");
  const { asaasAvisaCliente } = await conferirTitularAsaas(client);

  const hoje = new Date(`${brtISODate()}T12:00:00-03:00`);
  const venc = brtISODate(new Date(hoje.getTime() + e.diasVencimento * 86400000));

  const reservaId = await reservarTeste(e, venc, operador);

  // 2) Chamada externa fora da trava.
  try {
    const customerId =
      client.asaasCustomerId ??
      (await asaasCreateCustomer(
        { name: client.name, cpfCnpj: client.cpf!, email: client.email, phone: client.phone },
        "producao",
        { semNotificacao: true },
      )).id;
    if (!client.asaasCustomerId)
      await db.update(clientsTable).set({ asaasCustomerId: customerId }).where(eq(clientsTable.id, client.id));
    const ch = await asaasCreateCharge({
      customerId,
      value: e.valorCentavos / 100,
      dueDate: venc,
      description: `[TESTE PAXMED #${reservaId}] ${e.descricao}`,
      externalReference: `teste_paxmed_${reservaId}`,
      billingType: e.tipo,
    });
    await db.execute(sql`
      UPDATE asaas_cobrancas_teste SET estado='criada', asaas_charge_id=${ch.id}, asaas_status=${ch.status},
        invoice_url=${ch.invoiceUrl}, liquido_centavos=${typeof ch.netValue === "number" ? Math.round(ch.netValue * 100) : null},
        atualizado_em=NOW() WHERE id=${reservaId}`);
    return {
      id: reservaId, asaasChargeId: ch.id, invoiceUrl: ch.invoiceUrl, status: ch.status, valorCentavos: e.valorCentavos, vencimento: venc,
      liquidoCentavos: typeof ch.netValue === "number" ? Math.round(ch.netValue * 100) : null,
      taxaCentavos: typeof ch.netValue === "number" ? e.valorCentavos - Math.round(ch.netValue * 100) : null,
      asaasAvisaCliente,
    };
  } catch (err: any) {
    const definitiva = typeof err?.httpStatus === "number" && err.httpStatus >= 400 && err.httpStatus < 500;
    await db.execute(sql`
      UPDATE asaas_cobrancas_teste SET estado=${definitiva ? "recusada" : "incerta"},
        erro=${String(err?.message ?? err).slice(0, 300)}, atualizado_em=NOW() WHERE id=${reservaId}`);
    throw new TesteRecusado(definitiva ? 422 : 502, definitiva
      ? `Asaas recusou: ${err.message}`
      : `Resultado incerto (id ${reservaId}); a reserva continua contada ate conferencia.`);
  }
}

export async function listarTeste() {
  const r = await db.execute(sql`
    SELECT t.id, t.client_id, c.name AS cliente, t.valor_centavos, t.tipo, t.descricao, t.vencimento, t.estado,
           t.asaas_charge_id, t.asaas_status, t.invoice_url, t.erro, t.criado_em, t.pago_em,
           t.liquido_centavos, t.link_email_em, t.link_telegram_em
    FROM asaas_cobrancas_teste t LEFT JOIN clients c ON c.id = t.client_id ORDER BY t.id DESC`);
  return r.rows as any[];
}

export async function aplicarStatusTeste(chargeId: string, status: string, pagoEm?: string | null) {
  await db.execute(sql`
    UPDATE asaas_cobrancas_teste SET asaas_status=${status}, atualizado_em=NOW(),
      pago_em = CASE WHEN ${PAGO.has(status)} THEN COALESCE(pago_em, ${pagoEm ?? brtISODate()}) ELSE pago_em END
    WHERE asaas_charge_id=${chargeId}`);
}

export async function sincronizarTeste(): Promise<{ consultadas: number; falhas: number }> {
  const r = await db.execute(sql`
    SELECT asaas_charge_id FROM asaas_cobrancas_teste
    WHERE asaas_charge_id IS NOT NULL AND (pago_em IS NULL)`);
  let falhas = 0;
  for (const row of r.rows as any[]) {
    try {
      const c: any = await asaasGetCharge(row.asaas_charge_id);
      await aplicarStatusTeste(row.asaas_charge_id, String(c.status), c.paymentDate ?? null);
      if (typeof c.netValue === "number")
        await db.execute(sql`UPDATE asaas_cobrancas_teste SET liquido_centavos=${Math.round(c.netValue * 100)} WHERE asaas_charge_id=${row.asaas_charge_id}`);
    } catch { falhas++; }
  }
  return { consultadas: r.rows.length, falhas };
}

export async function linhasLocaisTeste() {
  const r = await db.execute(sql`
    SELECT id, valor_centavos, asaas_status, estado, asaas_charge_id, invoice_url, vencimento, descricao
    FROM asaas_cobrancas_teste WHERE asaas_charge_id IS NOT NULL`);
  return r.rows as any[];
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface EnvioLinkResultado {
  email: "aceito" | "ja_enviado" | "recusado" | "sem_email" | "nao_solicitado";
  telegram: "aceito" | "ja_enviado" | "recusado" | "sem_vinculo";
  detalhe: string[];
}

/**
 * Envia o link da cobranca de teste SOMENTE ao e-mail e ao Telegram ja registrados no cadastro do titular
 * da cobranca (destino nunca vem do navegador). Cada canal e enviado no maximo uma vez: "aceito" so e
 * gravado quando o provedor confirma; resposta perdida exige conferencia humana, nunca reenvio automatico.
 * Aceito pelo provedor NAO e recebido pelo paciente.
 */
export async function enviarLinkCobrancaTeste(id: number, opts: { somenteTelegram?: boolean } = {}): Promise<EnvioLinkResultado> {
  const r: any = (await db.execute(sql`
    SELECT id, client_id, valor_centavos, descricao, vencimento, estado, asaas_status, invoice_url, pago_em, link_email_em, link_telegram_em
    FROM asaas_cobrancas_teste WHERE id=${id}`)).rows[0];
  if (!r) throw new TesteRecusado(404, "Cobranca de teste nao encontrada.");
  if (r.estado !== "criada" || !r.invoice_url) throw new TesteRecusado(409, "Cobranca ainda nao foi criada no Asaas.");
  if (r.pago_em || PAGO.has(String(r.asaas_status))) throw new TesteRecusado(409, "Cobranca ja paga: nao ha link a enviar.");
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, r.client_id));
  if (!c) throw new TesteRecusado(404, "Cliente nao encontrado.");

  const out: EnvioLinkResultado = { email: "sem_email", telegram: "sem_vinculo", detalhe: [] };
  const titulo = `[TESTE] Cobranca de teste PaxMed #${r.id}`;
  const resumo = `${brl(r.valor_centavos)} · vence em ${String(r.vencimento).split("-").reverse().join("/")}`;

  // E-mail
  if (opts.somenteTelegram) out.email = "nao_solicitado";
  else if (r.link_email_em) out.email = "ja_enviado";
  else if (c.email) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a2540">
      <p style="background:#fff3cd;border:1px solid #e0c36a;padding:10px;border-radius:6px"><strong>TESTE autorizado.</strong> Esta e uma cobranca real de valor de teste, criada com sua autorizacao.</p>
      <h2 style="margin:12px 0">${esc(titulo)}</h2>
      <p>${esc(r.descricao)}</p><p><strong>${esc(resumo)}</strong></p>
      <p><a href="${esc(r.invoice_url)}" style="display:inline-block;background:#0b1b3a;color:#e6c47a;padding:10px 18px;border-radius:6px;text-decoration:none">Abrir a cobranca</a></p>
      <p style="font-size:12px;color:#667">Se voce nao reconhece este teste, nao pague e avise a clinica.</p></div>`;
    const env = await sendGmailMessage({ to: c.email, subject: titulo, html });
    if (env.success) {
      await db.execute(sql`UPDATE asaas_cobrancas_teste SET link_email_em=NOW() WHERE id=${id} AND link_email_em IS NULL`);
      out.email = "aceito";
    } else { out.email = "recusado"; out.detalhe.push(env.error ?? "e-mail nao confirmado"); }
  }

  // Telegram (somente vinculo atual e unico)
  if (r.link_telegram_em) out.telegram = "ja_enviado";
  else if (c.telegramChatId && c.empresaId != null
    && await vinculoTelegramAtualUnico(db, { clienteId: c.id, empresaId: c.empresaId, chatId: c.telegramChatId })) {
    const paginaPagamento = await emitirLinkTeste(id);
    const [emp] = c.empresaId != null ? (await db.execute(sql`SELECT nome FROM empresas WHERE id=${c.empresaId}`)).rows as { nome: string }[] : [];
    const texto = `<b>${esc(titulo)}</b>\n${emp?.nome ? esc(emp.nome) + "\n" : ""}TESTE autorizado: cobranca real de valor de teste.\n${esc(resumo)}\nAbra a tela de pagamento (valor e situacao atualizados):\n${esc(paginaPagamento)}`;
    const env = await sendTelegram(c.telegramChatId, texto);
    if (env.sent && !env.mock) {
      await db.execute(sql`UPDATE asaas_cobrancas_teste SET link_telegram_em=NOW() WHERE id=${id} AND link_telegram_em IS NULL`);
      await db.execute(sql`INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, recebida_em, direcao, lida_em)
        VALUES (${c.empresaId}, ${c.id}, ${c.telegramChatId}, ${`[TESTE] link da cobranca de teste #${r.id} enviado`}, NOW(), 'saida', NOW())`);
      out.telegram = "aceito";
    } else { out.telegram = "recusado"; out.detalhe.push(env.error ?? "telegram nao confirmado"); }
  }
  logger.info({ id, email: out.email, telegram: out.telegram }, "Link de cobranca de teste: resultado por canal");
  return out;
}

/**
 * Envia SOMENTE pelo Telegram a tela de pagamento (valor e situacao vem do Asaas ao abrir) de uma cobranca
 * de teste ja existente, qualquer situacao. Nao cria cobranca, nao envia e-mail, nao altera status.
 */
export async function enviarTelaPagamentoTeste(id: number): Promise<{ telegram: "aceito" | "recusado" | "sem_vinculo"; url?: string; erro?: string }> {
  const r: any = (await db.execute(sql`SELECT id, client_id, valor_centavos, estado, asaas_charge_id FROM asaas_cobrancas_teste WHERE id=${id}`)).rows[0];
  if (!r) throw new TesteRecusado(404, "Cobranca de teste nao encontrada.");
  if (r.estado !== "criada" || !r.asaas_charge_id) throw new TesteRecusado(409, "Cobranca ainda nao foi criada no Asaas.");
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.id, r.client_id));
  if (!c) throw new TesteRecusado(404, "Cliente nao encontrado.");
  if (!(c.telegramChatId && c.empresaId != null
    && await vinculoTelegramAtualUnico(db, { clienteId: c.id, empresaId: c.empresaId, chatId: c.telegramChatId }))) return { telegram: "sem_vinculo" };
  const url = await emitirLinkTeste(id);
  const png = await flyerDoLink(url.split("/pagar/")[1]);
  const legenda = `<b>PaxMed · Pagamento</b>\nValor e situação atualizados na tela:\n${esc(url)}`;
  const env = await sendTelegramPhotoBuffer(c.telegramChatId, png, `flyer-comunicacao-paxmed-pagamento-${id}.png`, legenda);
  if (!(env.sent && !env.mock)) return { telegram: "recusado", erro: env.error };
  await db.execute(sql`INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, recebida_em, direcao, lida_em)
    VALUES (${c.empresaId}, ${c.id}, ${c.telegramChatId}, ${`[TESTE] tela de pagamento da cobranca de teste #${id} enviada`}, NOW(), 'saida', NOW())`);
  return { telegram: "aceito", url };
}
