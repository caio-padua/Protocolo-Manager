/**
 * Conciliacao Asaas x PaxMed em PostgreSQL descartavel, sem rede e sem Asaas real (dados 100% sinteticos).
 * Prova: so marca "pago" com prova completa; legado fora do job; Concierge, estorno, valor diferente e
 * pagamento cancelado ficam bloqueados; reprocessar e idempotente; extrato real separa cobrado de recebido.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/asaas.js", () => ({
  asaasGetCharge: vi.fn(), asaasListExtrato: vi.fn(async () => []), asaasListCharges: vi.fn(async () => []),
  asaasGetCustomer: vi.fn(), asaasCreateCustomer: vi.fn(), asaasCreateCharge: vi.fn(),
}));
vi.mock("../lib/secure-settings.js", () => ({ getSetting: vi.fn(async () => null), getSecret: vi.fn(async () => null) }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
let c: typeof import("../lib/asaas-conciliacao");
let teste: typeof import("../lib/asaas-teste-cobrancas");
let pool: any;

type Ch = Record<string, any>;
const charges = new Map<string, Ch>();
const buscarCobranca = async (id: string) => {
  const x = charges.get(id);
  if (!x) throw Object.assign(new Error("Asaas erro HTTP 404"), { httpStatus: 404 });
  return x as any;
};
const lancs = (id: string, bruto: number, taxa: number, msg: number, data: string) => [
  { id: "f1", valor: bruto, tipo: "PAYMENT_RECEIVED", data, paymentId: id, descricao: null },
  { id: "f2", valor: -taxa, tipo: "PAYMENT_FEE", data, paymentId: id, descricao: null },
  { id: "f3", valor: -msg, tipo: "PAYMENT_MESSAGING_NOTIFICATION_FEE", data, paymentId: id, descricao: null },
];
const pago = (id: string, value: number, extra: Ch = {}) => ({
  id, status: "RECEIVED", value, netValue: value - 1.99, billingType: "PIX", paymentDate: "2026-11-14", creditDate: "2026-11-14",
  dateCreated: "2026-11-14", deleted: false, ...extra,
});

beforeAll(async () => {
  pool = (await import("@workspace/db")).pool;
  await pool.query(`
    CREATE TABLE clients (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE payments (id SERIAL PRIMARY KEY, client_id INT, amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      paid_at TEXT, asaas_charge_id TEXT UNIQUE, empresa_id INT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE scheduling_requests (id SERIAL PRIMARY KEY, payment_amount REAL, payment_status TEXT NOT NULL DEFAULT 'aguardando', asaas_charge_id TEXT);
  `);
  teste = await import("../lib/asaas-teste-cobrancas");
  await teste.ensureAsaasTesteTable();
  c = await import("../lib/asaas-conciliacao");
  await c.ensureAsaasConciliacaoTables();
}, 60_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(async () => {
  charges.clear();
  await pool.query(`TRUNCATE payments, scheduling_requests, clients, asaas_cobrancas_teste, asaas_cobranca_financeiro, asaas_conciliacao_log RESTART IDENTITY`);
  await pool.query(`INSERT INTO clients (name) VALUES ('Cliente Sintetico A')`);
});

const ins = (id: string, amount: number, status = "pending", criado = "2026-11-15") =>
  pool.query(`INSERT INTO payments (client_id, amount, status, asaas_charge_id, empresa_id, created_at) VALUES (1,$1,$2,$3,5,$4)`, [amount, status, id, criado]);
const statusPg = async (id: string) => (await pool.query(`SELECT status, paid_at FROM payments WHERE asaas_charge_id=$1`, [id])).rows[0];
const logs = async (id: string) => (await pool.query(`SELECT acao FROM asaas_conciliacao_log WHERE charge_id=$1 ORDER BY id`, [id])).rows.map((r: any) => r.acao);

describe("classificacao (pura)", () => {
  const L = (tabela: any, status: string, valor = 5) => ({ tabela, id: 1, status, valor, empresaId: 5, rotulo: "x", criadoEm: null });
  const R = (status: string, value = 5, deleted = false) => ({ status, value, deleted });
  it.each([
    [null, R("RECEIVED"), "sem_vinculo"],
    [L("payments", "pending"), R("RECEIVED"), "divergencia_genuina"],
    [L("teste", "pending"), R("CONFIRMED"), "divergencia_genuina"],
    [L("concierge", "aguardando"), R("RECEIVED"), "fluxo_proprio"],
    [L("payments", "pending", 5), R("RECEIVED", 6), "valor_diverge"],
    [L("payments", "paid"), R("PENDING"), "local_pago_sem_prova"],
    [L("payments", "cancelled"), R("RECEIVED"), "local_cancelado_asaas_pago"],
    [L("payments", "pending"), R("REFUNDED"), "estorno_ou_cancelada"],
    [L("payments", "cancelled"), R("REFUNDED"), "conciliado"],
    [L("payments", "pending"), R("RECEIVED", 5, true), "estorno_ou_cancelada"],
    [L("payments", "pending"), R("OVERDUE"), "mapeamento_status"],
    [L("payments", "overdue"), R("OVERDUE"), "conciliado"],
    [L("concierge", "aguardando"), R("OVERDUE"), "mapeamento_status"],
    [L("payments", "paid"), R("RECEIVED"), "conciliado"],
    [L("payments", "pending"), R("PENDING"), "conciliado"],
  ])("%#", (loc, rem, esperado) => { expect(c.classificar(loc as any, rem)).toBe(esperado); });
});

describe("extrato real (puro)", () => {
  it("liquido efetivo = recebido - taxa do Pix - taxa de mensageria (caso real de R$ 5,00)", () => {
    const m = c.agregarExtrato(lancs("pay_a", 5, 1.99, 0.99, "2026-11-14"));
    expect(m.get("pay_a")).toMatchObject({ recebido: 500, taxas: -298, estornos: 0, liquido: 202, dataCredito: "2026-11-14", lancamentos: 3 });
  });
  it("lancamento repetido (pagina duplicada) nao soma duas vezes e reprocessar da o mesmo resultado", () => {
    const l = lancs("pay_a", 5, 1.99, 0.99, "2026-11-14");
    expect(c.agregarExtrato([...l, ...l]).get("pay_a")?.liquido).toBe(202);
    expect(c.agregarExtrato(l).get("pay_a")).toEqual(c.agregarExtrato(l).get("pay_a"));
  });
  it("estorno entra em estornos e lancamento sem cobranca e ignorado", () => {
    const m = c.agregarExtrato([...lancs("pay_a", 5, 1.99, 0.99, "2026-11-14"),
      { id: "f9", valor: -5, tipo: "PAYMENT_REFUND", data: "2026-11-15", paymentId: "pay_a", descricao: null },
      { id: "f8", valor: -0.55, tipo: "INSTANT_TEXT_MESSAGE_FEE", data: "2026-11-15", paymentId: null, descricao: null }]);
    expect(m.get("pay_a")).toMatchObject({ estornos: -500, liquido: -298 });
    expect(m.size).toBe(1);
  });
  it("paga no gateway nao e recebida ate existir lancamento no extrato", () => {
    expect(c.situacaoDe("RECEIVED", false, null)).toBe("paga_sem_lancamento");
    expect(c.situacaoDe("RECEIVED", false, 500)).toBe("recebida_no_extrato");
    expect(c.situacaoDe("OVERDUE", false, null)).toBe("vencida");
    expect(c.situacaoDe("REFUNDED", false, null)).toBe("estornada");
    expect(c.situacaoDe("PENDING", true, null)).toBe("removida");
  });
});

describe("marcar pago somente com prova", () => {
  it("pagamento pendente + Asaas RECEIVED com valor igual: marca pago, grava retrato e 1 linha de auditoria", async () => {
    await ins("pay_ok", 5);
    charges.set("pay_ok", pago("pay_ok", 5));
    const extrato = c.agregarExtrato(lancs("pay_ok", 5, 1.99, 0.99, "2026-11-14"));
    const r = await c.reconciliarCobranca("pay_ok", { origem: "manual", aplicar: true, buscarCobranca, extrato });
    expect(r).toMatchObject({ acao: "aplicada", statusLocalAntes: "pending", statusLocalDepois: "paid", causa: "conciliado" });
    expect(await statusPg("pay_ok")).toEqual({ status: "paid", paid_at: "2026-11-14" });
    const f = (await pool.query(`SELECT * FROM asaas_cobranca_financeiro WHERE charge_id='pay_ok'`)).rows[0];
    expect(f).toMatchObject({ bruto_centavos: 500, liquido_api_centavos: 301, extrato_liquido_centavos: 202, extrato_taxas_centavos: -298, origem_tabela: "payments", empresa_id: 5 });
    expect(await logs("pay_ok")).toEqual(["aplicada_pago"]);
  });
  it("reprocessar e idempotente: nada muda, nenhuma linha de auditoria nova, retrato continua unico", async () => {
    await ins("pay_ok", 5);
    charges.set("pay_ok", pago("pay_ok", 5));
    const extrato = c.agregarExtrato(lancs("pay_ok", 5, 1.99, 0.99, "2026-11-14"));
    await c.reconciliarCobranca("pay_ok", { origem: "job", aplicar: true, buscarCobranca, extrato });
    const r2 = await c.reconciliarCobranca("pay_ok", { origem: "job", aplicar: true, buscarCobranca, extrato });
    expect(r2.acao).toBe("nenhuma");
    expect(await logs("pay_ok")).toEqual(["aplicada_pago"]);
    expect((await pool.query(`SELECT COUNT(*)::int n FROM asaas_cobranca_financeiro`)).rows[0].n).toBe(1);
  });
  it("auditoria (aplicar=false) nunca altera o status, mesmo com prova", async () => {
    await ins("pay_ok", 5);
    charges.set("pay_ok", pago("pay_ok", 5));
    const r = await c.reconciliarCobranca("pay_ok", { origem: "auditoria", aplicar: false, buscarCobranca, extrato: new Map() });
    expect(r).toMatchObject({ acao: "bloqueada", causa: "divergencia_genuina" });
    expect((await statusPg("pay_ok")).status).toBe("pending");
  });
  it.each([
    ["Asaas ainda PENDING", { status: "PENDING" }, "pending"],
    ["Asaas RECEIVED mas cobranca removida", { deleted: true }, "pending"],
    ["Asaas estornada", { status: "REFUNDED" }, "pending"],
    ["valor diferente (R$ 6,00 no Asaas, R$ 5,00 local)", { value: 6 }, "pending"],
    ["pagamento local cancelado, Asaas recebido", {}, "cancelled"],
  ])("NAO marca pago: %s", async (_n, extra, statusLocal) => {
    await ins("pay_x", 5, statusLocal as string);
    charges.set("pay_x", pago("pay_x", 5, extra as Ch));
    const r = await c.reconciliarCobranca("pay_x", { origem: "manual", aplicar: true, buscarCobranca, extrato: new Map() });
    expect(r.statusLocalDepois).toBe(statusLocal);
    expect((await statusPg("pay_x")).status).toBe(statusLocal);
    expect((await statusPg("pay_x")).paid_at).toBeNull();
    expect(["nenhuma", "bloqueada"]).toContain(r.acao);
  });
  it("corrida: se outro processo ja marcou pago entre a leitura e a escrita, nao grava de novo", async () => {
    await ins("pay_r", 5);
    charges.set("pay_r", pago("pay_r", 5));
    const slow = async (id: string) => { const x = await buscarCobranca(id); await pool.query(`UPDATE payments SET status='paid', paid_at='2026-11-13' WHERE asaas_charge_id=$1`, [id]); return x; };
    const r = await c.reconciliarCobranca("pay_r", { origem: "job", aplicar: true, buscarCobranca: slow, extrato: new Map() });
    expect(r.acao).toBe("nenhuma");
    expect(await statusPg("pay_r")).toEqual({ status: "paid", paid_at: "2026-11-13" });
  });
  it("Concierge nunca e alterado pela conciliacao (finalizacao tem fluxo proprio)", async () => {
    await pool.query(`INSERT INTO scheduling_requests (payment_amount, payment_status, asaas_charge_id) VALUES (150,'aguardando','pay_cc')`);
    charges.set("pay_cc", pago("pay_cc", 150));
    const r = await c.reconciliarCobranca("pay_cc", { origem: "manual", aplicar: true, buscarCobranca, extrato: new Map() });
    expect(r).toMatchObject({ acao: "bloqueada", causa: "fluxo_proprio", tabela: "concierge" });
    expect((await pool.query(`SELECT payment_status FROM scheduling_requests`)).rows[0].payment_status).toBe("aguardando");
  });
  it("cobranca do Asaas sem registro local fica 'sem_vinculo' e nada e criado", async () => {
    charges.set("pay_orf", pago("pay_orf", 5));
    const r = await c.reconciliarCobranca("pay_orf", { origem: "auditoria", aplicar: true, buscarCobranca, extrato: new Map() });
    expect(r).toMatchObject({ causa: "sem_vinculo", acao: "bloqueada", tabela: null });
    expect((await pool.query(`SELECT COUNT(*)::int n FROM payments`)).rows[0].n).toBe(0);
  });
});

describe("job automatico (varrerPendentes)", () => {
  it("respeita a data de corte: legado fica intacto; novo e conciliado; Concierge nao entra", async () => {
    await ins("pay_velho", 5, "pending", "2026-06-28");
    await ins("pay_novo", 5, "pending", "2026-11-15");
    await ins("pay_pago", 5, "paid", "2026-11-15");
    await pool.query(`INSERT INTO scheduling_requests (payment_amount, payment_status, asaas_charge_id) VALUES (150,'aguardando','pay_cc')`);
    for (const id of ["pay_velho", "pay_novo", "pay_pago", "pay_cc"]) charges.set(id, pago(id, id === "pay_cc" ? 150 : 5));
    const r = await c.varrerPendentes({ buscarCobranca, extrato: new Map() });
    expect(r).toMatchObject({ candidatas: 1, aplicadas: 1, falhas: 0 });
    expect((await statusPg("pay_novo")).status).toBe("paid");
    expect((await statusPg("pay_velho")).status).toBe("pending");
    expect((await pool.query(`SELECT payment_status FROM scheduling_requests`)).rows[0].payment_status).toBe("aguardando");
  });
  it("livro de teste: cobranca paga no Asaas vira paga; falha de rede nao altera nada e e contada", async () => {
    await pool.query(`INSERT INTO asaas_cobrancas_teste (client_id,valor_centavos,tipo,descricao,vencimento,estado,asaas_charge_id,asaas_status)
      VALUES (1,500,'PIX','t1','2026-11-17','criada','pay_t1','PENDING'),(1,500,'PIX','t2','2026-11-17','criada','pay_t2','PENDING')`);
    charges.set("pay_t1", pago("pay_t1", 5)); // pay_t2 ausente => 404
    const r = await c.varrerPendentes({ buscarCobranca, extrato: new Map() });
    expect(r).toMatchObject({ candidatas: 2, aplicadas: 1, falhas: 1 });
    const rows = (await pool.query(`SELECT asaas_charge_id, asaas_status, pago_em, liquido_centavos FROM asaas_cobrancas_teste ORDER BY id`)).rows;
    expect(rows[0]).toMatchObject({ asaas_status: "RECEIVED", pago_em: "2026-11-14", liquido_centavos: 301 });
    expect(rows[1]).toMatchObject({ asaas_status: "PENDING", pago_em: null });
    const r2 = await c.varrerPendentes({ buscarCobranca, extrato: new Map() });
    expect(r2).toMatchObject({ candidatas: 1, aplicadas: 0, falhas: 1 }); // a paga sai da fila; idempotente
  });
  it("acao explicita por ID funciona em caso legado, so naquele ID", async () => {
    await ins("pay_velho", 5, "pending", "2026-06-28");
    await ins("pay_velho2", 5, "pending", "2026-06-28");
    charges.set("pay_velho", pago("pay_velho", 5, { paymentDate: "2026-06-28" }));
    const r = await c.reconciliarCobranca("pay_velho", { origem: "manual", ator: "Caio", aplicar: true, buscarCobranca, extrato: new Map() });
    expect(r.acao).toBe("aplicada");
    expect(await statusPg("pay_velho")).toEqual({ status: "paid", paid_at: "2026-06-28" });
    expect((await statusPg("pay_velho2")).status).toBe("pending");
    expect((await pool.query(`SELECT ator, origem FROM asaas_conciliacao_log WHERE charge_id='pay_velho'`)).rows[0]).toEqual({ ator: "Caio", origem: "manual" });
  });
});

describe("cobrado x efetivamente recebido", () => {
  it("totais separam cobranca, bruto pago, taxas e liquido do extrato; liquido da API aparece como divergente", async () => {
    await ins("pay_ok", 5);
    await ins("pay_aberta", 10);
    charges.set("pay_ok", pago("pay_ok", 5));
    charges.set("pay_aberta", { id: "pay_aberta", status: "PENDING", value: 10, netValue: 8.01, billingType: "PIX", dateCreated: "2026-11-14", deleted: false });
    const extrato = c.agregarExtrato(lancs("pay_ok", 5, 1.99, 0.99, "2026-11-14"));
    await c.reconciliarCobranca("pay_ok", { origem: "auditoria", aplicar: false, buscarCobranca, extrato });
    await c.reconciliarCobranca("pay_aberta", { origem: "auditoria", aplicar: false, buscarCobranca, extrato });
    const { linhas, totais } = await c.lerExtratoLocal();
    expect(totais).toMatchObject({
      cobradoCentavos: 1500, emAbertoCentavos: 1000, pagasNoGatewayCentavos: 500, recebidoNoExtratoBrutoCentavos: 500,
      taxasNoExtratoCentavos: -298, liquidoEfetivoNoExtratoCentavos: 202, liquidoPrometidoPelaApiCentavos: 301, pagasSemLancamentoNoExtrato: 0,
    });
    expect(linhas.find((l) => l.chargeId === "pay_ok")).toMatchObject({ situacao: "recebida_no_extrato", liquidoApiDivergeDoExtrato: true });
    expect(linhas.find((l) => l.chargeId === "pay_aberta")?.situacao).toBe("em_aberto");
  });
});
