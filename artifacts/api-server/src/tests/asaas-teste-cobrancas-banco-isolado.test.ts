/** Travas das cobrancas de teste (R$1,00 / 50 / R$50,00) em PostgreSQL descartavel, sem rede nem Asaas. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
let t: typeof import("../lib/asaas-teste-cobrancas");
let pool: any;

beforeAll(async () => {
  pool = (await import("@workspace/db")).pool;
  t = await import("../lib/asaas-teste-cobrancas");
  await t.ensureAsaasTesteTable();
}, 60_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

const base = { clientId: 1, valorCentavos: 100, tipo: "PIX", descricao: "x", diasVencimento: 1, confirmo: true };

describe("validacao de entrada", () => {
  it.each([[0], [101], [1.5], ["50"], [-1]])("recusa valor %s", (v) => {
    expect(() => t.validarEntrada({ ...base, valorCentavos: v })).toThrow();
  });
  it("exige confirmacao, tipo valido, descricao e prazo", () => {
    expect(() => t.validarEntrada({ ...base, confirmo: false })).toThrow(/Confirmacao/);
    expect(() => t.validarEntrada({ ...base, tipo: "CARTAO" })).toThrow();
    expect(() => t.validarEntrada({ ...base, descricao: " " })).toThrow();
    expect(() => t.validarEntrada({ ...base, diasVencimento: 31 })).toThrow();
    expect(t.validarEntrada({ ...base, valorCentavos: 1 }).valorCentavos).toBe(1);
  });
});

describe("teto no servidor", () => {
  it("80 reservas simultaneas de R$1,00: exatamente 50 passam e o total fica em R$50,00", async () => {
    const r = await Promise.allSettled(Array.from({ length: 80 }, () => t.reservarTeste(t.validarEntrada(base), "2026-12-01", "teste")));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(50);
    const rs = await t.resumoTeste();
    expect(rs).toMatchObject({ cobrancas: 50, totalCentavos: 5000 });
    await expect(t.reservarTeste(t.validarEntrada({ ...base, valorCentavos: 1 }), "2026-12-01", "teste")).rejects.toThrow(/Limite/);
  });
  it("recusa definitiva libera a reserva; incerta continua contada", async () => {
    await pool.query(`UPDATE asaas_cobrancas_teste SET estado='recusada' WHERE id IN (SELECT id FROM asaas_cobrancas_teste ORDER BY id LIMIT 1)`);
    expect((await t.resumoTeste()).cobrancas).toBe(49);
    await pool.query(`UPDATE asaas_cobrancas_teste SET estado='incerta' WHERE id IN (SELECT id FROM asaas_cobrancas_teste WHERE estado='recusada')`);
    expect((await t.resumoTeste()).cobrancas).toBe(50);
  });
  it("o banco recusa valor acima de 100 centavos mesmo fora da aplicacao", async () => {
    await expect(pool.query(`INSERT INTO asaas_cobrancas_teste (client_id,valor_centavos,tipo,descricao,vencimento) VALUES (1,101,'PIX','x','2026-12-01')`)).rejects.toThrow();
  });
});
