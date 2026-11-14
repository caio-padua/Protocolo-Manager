/**
 * Laboratorio de cobrancas de teste em PRODUCAO (autorizado pelo titular em 14/11/2026).
 * Travas no SERVIDOR: ate 100 centavos por cobranca, ate 50 cobrancas, soma ate 5000 centavos.
 * Cada tentativa reserva uma linha (contada) ANTES de falar com o Asaas, sob trava de banco,
 * entao concorrencia ou repeticao nunca ultrapassa o teto. Recusa definitiva do Asaas (4xx)
 * libera a reserva; falha incerta (rede/5xx) continua contada ate conferencia humana.
 */
import { db, clientsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { asaasCreateCharge, asaasCreateCustomer, asaasGetCharge } from "./asaas.js";
import { brtISODate } from "./brt.js";

export const TESTE_MAX_CENTAVOS_POR_COBRANCA = 100;
export const TESTE_MAX_COBRANCAS = 50;
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
      valor_centavos INTEGER NOT NULL CHECK (valor_centavos BETWEEN 1 AND 100),
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

export async function criarCobrancaTeste(e: TesteEntrada, operador: string) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, e.clientId));
  if (!client) throw new TesteRecusado(404, "Cliente nao encontrado.");
  if (!client.asaasCustomerId && !client.cpf)
    throw new TesteRecusado(400, "Cliente sem cadastro Asaas e sem CPF.");

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
        invoice_url=${ch.invoiceUrl}, atualizado_em=NOW() WHERE id=${reservaId}`);
    return { id: reservaId, asaasChargeId: ch.id, invoiceUrl: ch.invoiceUrl, status: ch.status, valorCentavos: e.valorCentavos, vencimento: venc };
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
           t.asaas_charge_id, t.asaas_status, t.invoice_url, t.erro, t.criado_em, t.pago_em
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
