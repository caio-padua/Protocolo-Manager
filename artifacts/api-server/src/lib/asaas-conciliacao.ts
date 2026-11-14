/**
 * Conciliacao Asaas x PaxMed por LEITURA (GET). Nada aqui cria, altera ou cancela cobranca no Asaas.
 *
 * Regras de seguranca:
 *  1. "Pago" local so nasce de uma consulta direta ao Asaas que devolve status pago, valor igual ao
 *     valor local e cobranca nao removida (mesma prova do webhook, mas obtida ativamente).
 *  2. O job automatico so toca cobrancas do livro de teste e pagamentos criados a partir da data
 *     de corte (asaas.conciliacao.desde). Casos antigos so mudam por acao explicita, por ID.
 *  3. Pedido Concierge nunca e alterado aqui (a finalizacao tem efeitos proprios: cadastro, acesso, e-mail).
 *  4. Estorno, cancelamento, valor diferente e pagamento local cancelado ficam registrados e BLOQUEADOS
 *     para decisao humana; nunca sao "corrigidos" sozinhos.
 *  5. Cada consulta grava um retrato financeiro idempotente (bruto, taxas, liquido, datas, extrato real
 *     da conta) e, quando algo muda ou bloqueia, uma linha de auditoria (sem repetir a mesma linha).
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { asaasGetCharge, asaasListExtrato, asaasListCharges, type AsaasCharge, type AsaasLancamentoExtrato } from "./asaas.js";
import { aplicarStatusTeste } from "./asaas-teste-cobrancas.js";
import { getSetting } from "./secure-settings.js";
import { brtISODate } from "./brt.js";

export const CORTE_PADRAO_JOB = "2026-11-14";
export const LIMITE_POR_VARREDURA = 50;

const REMOTO_PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const REMOTO_ESTORNO = new Set(["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"]);
const LOCAL_PAGO = new Set(["paid", "received", "confirmed", "pago"]);
const LOCAL_ABERTO = new Set(["pending", "overdue", "aguardando", "expirado"]);

export type Tabela = "payments" | "teste" | "concierge";
export type Causa =
  | "conciliado"
  | "divergencia_genuina"
  | "valor_diverge"
  | "sem_vinculo"
  | "mapeamento_status"
  | "fluxo_proprio"
  | "estorno_ou_cancelada"
  | "local_pago_sem_prova"
  | "local_cancelado_asaas_pago";

export interface LinhaLocal { tabela: Tabela; id: number; status: string; valor: number; empresaId: number | null; rotulo: string; criadoEm: string | null }
export interface VistaRemota { status: string; value: number; deleted: boolean }

const lc = (s: string) => String(s ?? "").toLowerCase();

/** Classificacao pura (sem banco, sem rede): separa ausencia de vinculo, divergencia genuina e mapeamento de status. */
export function classificar(local: LinhaLocal | null, remoto: VistaRemota): Causa {
  if (!local) return "sem_vinculo";
  if (Math.abs(local.valor - remoto.value) > 0.01) return "valor_diverge";
  const remotoPago = REMOTO_PAGO.has(remoto.status) && !remoto.deleted;
  const localPago = LOCAL_PAGO.has(lc(local.status));
  const localCancelado = ["cancelled", "cancelado", "canceled"].includes(lc(local.status));
  if (remoto.deleted || REMOTO_ESTORNO.has(remoto.status) || remoto.status === "DELETED") {
    return localCancelado ? "conciliado" : "estorno_ou_cancelada";
  }
  if (remotoPago && localCancelado) return "local_cancelado_asaas_pago";
  if (remotoPago && !localPago) return local.tabela === "concierge" ? "fluxo_proprio" : "divergencia_genuina";
  if (!remotoPago && localPago) return "local_pago_sem_prova";
  if (!remotoPago && !localPago && remoto.status === "OVERDUE" && LOCAL_ABERTO.has(lc(local.status))) {
    // Vencida no gateway: "overdue"/"expirado" local ja diz o mesmo; "pending"/"aguardando" e so rotulo diferente.
    return lc(local.status) === "overdue" || lc(local.status) === "expirado" ? "conciliado" : "mapeamento_status";
  }
  return "conciliado";
}

export const centavos = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null;

export interface AgregadoExtrato {
  recebido: number; // centavos, somente PAYMENT_RECEIVED
  taxas: number; // centavos (negativo ou zero)
  estornos: number; // centavos (negativo ou zero)
  liquido: number; // soma de tudo que o extrato lancou para a cobranca
  dataCredito: string | null;
  lancamentos: number;
}

/** Agrega os lancamentos do extrato por cobranca (funcao pura; reprocessar o mesmo extrato da o mesmo resultado). */
export function agregarExtrato(lancs: AsaasLancamentoExtrato[]): Map<string, AgregadoExtrato> {
  const m = new Map<string, AgregadoExtrato>();
  const vistos = new Set<string>();
  for (const l of lancs) {
    if (!l.paymentId) continue;
    // Duplicata: mesmo lancamento entregue duas vezes (pagina repetida) nao soma duas vezes.
    const chave = `${l.id}|${l.paymentId}|${l.tipo}|${l.data}|${l.valor}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const a = m.get(l.paymentId) ?? { recebido: 0, taxas: 0, estornos: 0, liquido: 0, dataCredito: null, lancamentos: 0 };
    const c = Math.round(l.valor * 100);
    a.lancamentos += 1;
    a.liquido += c;
    if (l.tipo === "PAYMENT_RECEIVED") { a.recebido += c; a.dataCredito = a.dataCredito ?? l.data; }
    else if (/REFUND|CHARGEBACK|REVERSAL/.test(l.tipo)) a.estornos += c;
    else a.taxas += c;
    m.set(l.paymentId, a);
  }
  return m;
}

export async function ensureAsaasConciliacaoTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS asaas_cobranca_financeiro (
      charge_id TEXT PRIMARY KEY,
      origem_tabela TEXT,
      origem_id INTEGER,
      empresa_id INTEGER,
      rotulo TEXT,
      status_asaas TEXT NOT NULL,
      billing_type TEXT,
      bruto_centavos INTEGER NOT NULL,
      liquido_api_centavos INTEGER,
      extrato_recebido_centavos INTEGER,
      extrato_taxas_centavos INTEGER,
      extrato_estornos_centavos INTEGER,
      extrato_liquido_centavos INTEGER,
      extrato_data_credito TEXT,
      data_criacao TEXT,
      data_pagamento TEXT,
      data_credito TEXT,
      data_credito_prevista TEXT,
      deletada BOOLEAN NOT NULL DEFAULT FALSE,
      causa TEXT,
      consultado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS asaas_conciliacao_log (
      id SERIAL PRIMARY KEY,
      charge_id TEXT NOT NULL,
      origem TEXT NOT NULL,
      acao TEXT NOT NULL,
      causa TEXT,
      tabela TEXT,
      local_id INTEGER,
      status_local_antes TEXT,
      status_local_depois TEXT,
      status_asaas TEXT,
      detalhe TEXT,
      ator TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_asaas_conciliacao_log_charge ON asaas_conciliacao_log (charge_id, id DESC)`);
}

/** Acha a linha local da cobranca, sem alterar nada. Teste > pagamento > Concierge. */
export async function localizarCobranca(chargeId: string): Promise<LinhaLocal | null> {
  const t: any = (await db.execute(sql`
    SELECT id, valor_centavos, COALESCE(asaas_status,'PENDING') AS st, descricao, criado_em::text AS criado
    FROM asaas_cobrancas_teste WHERE asaas_charge_id = ${chargeId} LIMIT 1`)).rows[0];
  if (t) {
    return { tabela: "teste", id: t.id, status: REMOTO_PAGO.has(t.st) ? "paid" : lc(t.st), valor: t.valor_centavos / 100, empresaId: null, rotulo: `[TESTE] ${t.descricao}`, criadoEm: t.criado };
  }
  const p: any = (await db.execute(sql`
    SELECT p.id, p.amount, p.status, p.empresa_id, p.created_at::text AS criado, c.name AS cliente
    FROM payments p LEFT JOIN clients c ON c.id = p.client_id WHERE p.asaas_charge_id = ${chargeId} LIMIT 1`)).rows[0];
  if (p) return { tabela: "payments", id: p.id, status: p.status, valor: Number(p.amount), empresaId: p.empresa_id ?? null, rotulo: p.cliente ?? `Pagamento #${p.id}`, criadoEm: p.criado };
  const s: any = (await db.execute(sql`
    SELECT id, payment_amount, payment_status FROM scheduling_requests WHERE asaas_charge_id = ${chargeId} LIMIT 1`)).rows[0];
  if (s) return { tabela: "concierge", id: s.id, status: s.payment_status, valor: Number(s.payment_amount ?? 0), empresaId: null, rotulo: `Concierge #${s.id}`, criadoEm: null };
  return null;
}

export interface ResultadoCobranca {
  chargeId: string;
  tabela: Tabela | null;
  localId: number | null;
  rotulo: string | null;
  statusAsaas: string;
  statusLocalAntes: string | null;
  statusLocalDepois: string | null;
  causa: Causa;
  acao: "nenhuma" | "aplicada" | "bloqueada";
  motivo: string | null;
  brutoCentavos: number;
  liquidoApiCentavos: number | null;
  extrato: AgregadoExtrato | null;
}

export interface OpcoesReconciliar {
  origem: "job" | "manual" | "webhook" | "auditoria";
  ator?: string;
  aplicar: boolean;
  extrato?: Map<string, AgregadoExtrato>;
  /** Injetaveis em teste (sem rede). */
  buscarCobranca?: (id: string) => Promise<AsaasCharge>;
  buscarExtrato?: (inicio: string, fim: string) => Promise<AsaasLancamentoExtrato[]>;
}

async function registrarLog(r: ResultadoCobranca, origem: string, ator: string | null, acao: string, detalhe: string | null) {
  // Idempotente: nao repete a ultima linha igual da mesma cobranca (job a cada poucos minutos nao enche o historico).
  await db.execute(sql`
    INSERT INTO asaas_conciliacao_log (charge_id, origem, acao, causa, tabela, local_id, status_local_antes, status_local_depois, status_asaas, detalhe, ator)
    SELECT ${r.chargeId}, ${origem}, ${acao}, ${r.causa}, ${r.tabela}, ${r.localId}, ${r.statusLocalAntes}, ${r.statusLocalDepois}, ${r.statusAsaas}, ${detalhe}, ${ator}
    WHERE NOT EXISTS (
      SELECT 1 FROM (SELECT acao, causa, status_asaas, status_local_antes, detalhe FROM asaas_conciliacao_log
                     WHERE charge_id = ${r.chargeId} ORDER BY id DESC LIMIT 1) u
      WHERE u.acao = ${acao} AND u.causa IS NOT DISTINCT FROM ${r.causa} AND u.status_asaas IS NOT DISTINCT FROM ${r.statusAsaas}
        AND u.status_local_antes IS NOT DISTINCT FROM ${r.statusLocalAntes} AND u.detalhe IS NOT DISTINCT FROM ${detalhe}
    )`);
}

const MOTIVO: Record<string, string> = {
  divergencia_genuina: "Asaas informa pago e o sistema nao; aplicar exige o job (dentro da data de corte) ou acao explicita por ID.",
  valor_diverge: "Valor do Asaas difere do valor local; exige decisao humana.",
  sem_vinculo: "Cobranca existe no Asaas e nao esta ligada a nenhum registro do sistema.",
  fluxo_proprio: "Pedido Concierge: a finalizacao (cadastro, acesso, e-mail) tem fluxo proprio e nao e disparada por conciliacao.",
  estorno_ou_cancelada: "Cobranca estornada/cancelada no Asaas e nao cancelada no sistema; exige decisao humana.",
  local_pago_sem_prova: "Sistema marca pago e o Asaas nao confirma; nada foi alterado.",
  local_cancelado_asaas_pago: "Sistema cancelou e o Asaas recebeu; nada foi alterado.",
};

/** Consulta UMA cobranca no Asaas, grava o retrato financeiro e (se permitido e provado) marca como pago. */
export async function reconciliarCobranca(chargeId: string, op: OpcoesReconciliar): Promise<ResultadoCobranca> {
  const ch: any = await (op.buscarCobranca ?? asaasGetCharge)(chargeId);
  const local = await localizarCobranca(chargeId);
  const remoto: VistaRemota = { status: String(ch.status ?? ""), value: Number(ch.value ?? 0), deleted: ch.deleted === true };
  const causaInicial = classificar(local, remoto);

  const bruto = centavos(ch.value) ?? 0;
  const liqApi = centavos(ch.netValue);
  const pago = REMOTO_PAGO.has(remoto.status) && !remoto.deleted;
  let ext: AgregadoExtrato | null = null;
  if (pago) {
    let mapa = op.extrato;
    if (!mapa) {
      const ini = String(ch.clientPaymentDate ?? ch.paymentDate ?? ch.dateCreated ?? brtISODate()).slice(0, 10);
      mapa = agregarExtrato(await (op.buscarExtrato ?? asaasListExtrato)(ini, brtISODate()));
    }
    ext = mapa.get(chargeId) ?? null;
  }

  const res: ResultadoCobranca = {
    chargeId, tabela: local?.tabela ?? null, localId: local?.id ?? null,
    rotulo: local?.rotulo ?? (ch.description ? String(ch.description).slice(0, 80) : null),
    statusAsaas: remoto.status, statusLocalAntes: local?.status ?? null, statusLocalDepois: local?.status ?? null,
    causa: causaInicial, acao: "nenhuma", motivo: null, brutoCentavos: bruto, liquidoApiCentavos: liqApi, extrato: ext,
  };

  // Aplicacao: somente causa "divergencia_genuina" em pagamento ou teste, com prova completa (valor igual, pago, nao removida).
  if (op.aplicar && causaInicial === "divergencia_genuina" && local) {
    const dataPg = String(ch.paymentDate ?? brtISODate()).slice(0, 10);
    if (local.tabela === "teste") {
      await aplicarStatusTeste(chargeId, remoto.status, dataPg);
      if (liqApi !== null) await db.execute(sql`UPDATE asaas_cobrancas_teste SET liquido_centavos=${liqApi} WHERE asaas_charge_id=${chargeId}`);
      res.acao = "aplicada";
    } else if (local.tabela === "payments") {
      const up: any = await db.execute(sql`
        UPDATE payments SET status='paid', paid_at=${dataPg}
        WHERE id=${local.id} AND asaas_charge_id=${chargeId} AND lower(status) IN ('pending','overdue')
        RETURNING id`);
      if (up.rows.length > 0) res.acao = "aplicada";
    }
    if (res.acao === "aplicada") {
      res.statusLocalDepois = "paid";
      res.causa = "conciliado";
      await registrarLog(res, op.origem, op.ator ?? null, "aplicada_pago", `Asaas ${remoto.status} em ${dataPg}; valor igual (${bruto} centavos).`);
    }
  } else if (causaInicial !== "conciliado" && causaInicial !== "mapeamento_status") {
    res.acao = "bloqueada";
    res.motivo = MOTIVO[causaInicial] ?? null;
    await registrarLog(res, op.origem, op.ator ?? null, "bloqueada", res.motivo);
  }

  await db.execute(sql`
    INSERT INTO asaas_cobranca_financeiro (charge_id, origem_tabela, origem_id, empresa_id, rotulo, status_asaas, billing_type, bruto_centavos,
      liquido_api_centavos, extrato_recebido_centavos, extrato_taxas_centavos, extrato_estornos_centavos, extrato_liquido_centavos, extrato_data_credito,
      data_criacao, data_pagamento, data_credito, data_credito_prevista, deletada, causa, consultado_em)
    VALUES (${chargeId}, ${local?.tabela ?? null}, ${local?.id ?? null}, ${local?.empresaId ?? null}, ${res.rotulo}, ${remoto.status}, ${ch.billingType ?? null}, ${bruto},
      ${liqApi}, ${ext?.recebido ?? null}, ${ext?.taxas ?? null}, ${ext?.estornos ?? null}, ${ext?.liquido ?? null}, ${ext?.dataCredito ?? null},
      ${ch.dateCreated ?? null}, ${ch.paymentDate ?? null}, ${ch.creditDate ?? null}, ${ch.estimatedCreditDate ?? null}, ${remoto.deleted}, ${res.causa}, NOW())
    ON CONFLICT (charge_id) DO UPDATE SET origem_tabela=EXCLUDED.origem_tabela, origem_id=EXCLUDED.origem_id, empresa_id=EXCLUDED.empresa_id,
      rotulo=EXCLUDED.rotulo, status_asaas=EXCLUDED.status_asaas, billing_type=EXCLUDED.billing_type, bruto_centavos=EXCLUDED.bruto_centavos,
      liquido_api_centavos=EXCLUDED.liquido_api_centavos, extrato_recebido_centavos=EXCLUDED.extrato_recebido_centavos,
      extrato_taxas_centavos=EXCLUDED.extrato_taxas_centavos, extrato_estornos_centavos=EXCLUDED.extrato_estornos_centavos,
      extrato_liquido_centavos=EXCLUDED.extrato_liquido_centavos, extrato_data_credito=EXCLUDED.extrato_data_credito,
      data_criacao=EXCLUDED.data_criacao, data_pagamento=EXCLUDED.data_pagamento, data_credito=EXCLUDED.data_credito,
      data_credito_prevista=EXCLUDED.data_credito_prevista, deletada=EXCLUDED.deletada, causa=EXCLUDED.causa, consultado_em=NOW()`);
  return res;
}

export async function dataDeCorteJob(): Promise<string> {
  const v = (await getSetting("asaas.conciliacao.desde"))?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : CORTE_PADRAO_JOB;
}

export interface ResumoVarredura { candidatas: number; aplicadas: number; bloqueadas: number; falhas: number; semMudanca: number }

/** Job automatico: so teste em aberto e pagamentos em aberto criados a partir do corte. Lote limitado. */
export async function varrerPendentes(opts: Pick<OpcoesReconciliar, "buscarCobranca" | "buscarExtrato" | "extrato"> = {}): Promise<ResumoVarredura> {
  const corte = await dataDeCorteJob();
  const r: any = await db.execute(sql`
    SELECT asaas_charge_id AS id FROM asaas_cobrancas_teste
      WHERE asaas_charge_id IS NOT NULL AND estado = 'criada' AND pago_em IS NULL
    UNION
    SELECT asaas_charge_id FROM payments
      WHERE asaas_charge_id IS NOT NULL AND lower(status) IN ('pending','overdue') AND created_at >= ${corte}::date
    LIMIT ${LIMITE_POR_VARREDURA}`);
  const out: ResumoVarredura = { candidatas: r.rows.length, aplicadas: 0, bloqueadas: 0, falhas: 0, semMudanca: 0 };
  for (const row of r.rows as Array<{ id: string }>) {
    try {
      const x = await reconciliarCobranca(row.id, { origem: "job", aplicar: true, ...opts });
      if (x.acao === "aplicada") out.aplicadas++; else if (x.acao === "bloqueada") out.bloqueadas++; else out.semMudanca++;
    } catch { out.falhas++; }
  }
  return out;
}

/** Auditoria SOMENTE LEITURA de tudo que existe local e remotamente (nada e aplicado). */
export async function auditarTodas(): Promise<{ resultados: ResultadoCobranca[]; falhas: Array<{ chargeId: string; erro: string }> }> {
  const remotas = await asaasListCharges(500);
  const locais: any = await db.execute(sql`
    SELECT asaas_charge_id AS id FROM asaas_cobrancas_teste WHERE asaas_charge_id IS NOT NULL
    UNION SELECT asaas_charge_id FROM payments WHERE asaas_charge_id IS NOT NULL
    UNION SELECT asaas_charge_id FROM scheduling_requests WHERE asaas_charge_id IS NOT NULL`);
  const ids = new Set<string>([...remotas.map((c) => c.id), ...(locais.rows as Array<{ id: string }>).map((x) => x.id)]);
  const extrato = agregarExtrato(await asaasListExtrato("2026-01-01", brtISODate()));
  const resultados: ResultadoCobranca[] = [];
  const falhas: Array<{ chargeId: string; erro: string }> = [];
  for (const id of ids) {
    try { resultados.push(await reconciliarCobranca(id, { origem: "auditoria", aplicar: false, extrato })); }
    catch (e) { falhas.push({ chargeId: id, erro: e instanceof Error ? e.message : String(e) }); }
  }
  return { resultados, falhas };
}

export interface LinhaExtrato {
  chargeId: string; rotulo: string | null; tabela: string | null; localId: number | null; statusAsaas: string; billingType: string | null;
  brutoCentavos: number; liquidoApiCentavos: number | null; extratoRecebidoCentavos: number | null; extratoTaxasCentavos: number | null;
  extratoEstornosCentavos: number | null; extratoLiquidoCentavos: number | null; dataCriacao: string | null; dataPagamento: string | null;
  dataCredito: string | null; dataCreditoPrevista: string | null; deletada: boolean; causa: string | null; consultadoEm: string;
  situacao: "em_aberto" | "vencida" | "paga_sem_lancamento" | "recebida_no_extrato" | "estornada" | "removida";
  liquidoApiDivergeDoExtrato: boolean;
}

/** Situacao financeira de verdade: "paga" no gateway nao e "recebida" ate existir lancamento no extrato da conta. */
export function situacaoDe(statusAsaas: string, deletada: boolean, extratoRecebido: number | null): LinhaExtrato["situacao"] {
  if (deletada || statusAsaas === "DELETED") return "removida";
  if (REMOTO_ESTORNO.has(statusAsaas)) return "estornada";
  if (REMOTO_PAGO.has(statusAsaas)) return extratoRecebido !== null ? "recebida_no_extrato" : "paga_sem_lancamento";
  return statusAsaas === "OVERDUE" ? "vencida" : "em_aberto";
}

export async function lerExtratoLocal(): Promise<{ linhas: LinhaExtrato[]; totais: Record<string, number> }> {
  const rows: any[] = (await db.execute(sql`SELECT *, consultado_em::text AS consultado FROM asaas_cobranca_financeiro ORDER BY COALESCE(data_pagamento, data_criacao) DESC, charge_id`)).rows as any[];
  const linhas: LinhaExtrato[] = rows.map((r) => {
    const liqApi = r.liquido_api_centavos as number | null;
    const liqExt = r.extrato_liquido_centavos as number | null;
    return {
      chargeId: r.charge_id, rotulo: r.rotulo, tabela: r.origem_tabela, localId: r.origem_id, statusAsaas: r.status_asaas, billingType: r.billing_type,
      brutoCentavos: r.bruto_centavos, liquidoApiCentavos: liqApi, extratoRecebidoCentavos: r.extrato_recebido_centavos, extratoTaxasCentavos: r.extrato_taxas_centavos,
      extratoEstornosCentavos: r.extrato_estornos_centavos, extratoLiquidoCentavos: liqExt, dataCriacao: r.data_criacao, dataPagamento: r.data_pagamento,
      dataCredito: r.extrato_data_credito ?? r.data_credito, dataCreditoPrevista: r.data_credito_prevista, deletada: r.deletada, causa: r.causa, consultadoEm: r.consultado,
      situacao: situacaoDe(r.status_asaas, r.deletada, r.extrato_recebido_centavos),
      liquidoApiDivergeDoExtrato: liqApi !== null && liqExt !== null && liqApi !== liqExt,
    };
  });
  const soma = (f: (l: LinhaExtrato) => number) => linhas.reduce((a, l) => a + f(l), 0);
  const totais = {
    cobrancas: linhas.filter((l) => l.situacao !== "removida").length,
    cobradoCentavos: soma((l) => (l.situacao === "removida" ? 0 : l.brutoCentavos)),
    emAbertoCentavos: soma((l) => (l.situacao === "em_aberto" || l.situacao === "vencida" ? l.brutoCentavos : 0)),
    pagasNoGatewayCentavos: soma((l) => (l.situacao === "recebida_no_extrato" || l.situacao === "paga_sem_lancamento" ? l.brutoCentavos : 0)),
    recebidoNoExtratoBrutoCentavos: soma((l) => l.extratoRecebidoCentavos ?? 0),
    taxasNoExtratoCentavos: soma((l) => l.extratoTaxasCentavos ?? 0),
    estornosNoExtratoCentavos: soma((l) => l.extratoEstornosCentavos ?? 0),
    liquidoEfetivoNoExtratoCentavos: soma((l) => l.extratoLiquidoCentavos ?? 0),
    liquidoPrometidoPelaApiCentavos: soma((l) => (l.extratoLiquidoCentavos !== null ? l.liquidoApiCentavos ?? 0 : 0)),
    pagasSemLancamentoNoExtrato: linhas.filter((l) => l.situacao === "paga_sem_lancamento").length,
  };
  return { linhas, totais };
}

export async function lerLog(chargeId?: string, limite = 100) {
  const cols = sql`id, charge_id, origem, acao, causa, tabela, local_id, status_local_antes, status_local_depois, status_asaas, detalhe, ator, criado_em::text AS criado_em`;
  const r: any = chargeId
    ? await db.execute(sql`SELECT ${cols} FROM asaas_conciliacao_log WHERE charge_id=${chargeId} ORDER BY id DESC LIMIT ${limite}`)
    : await db.execute(sql`SELECT ${cols} FROM asaas_conciliacao_log ORDER BY id DESC LIMIT ${limite}`);
  return r.rows as any[];
}
