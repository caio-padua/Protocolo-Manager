/** Travas das cobrancas de teste (R$5,00 por cobranca / 10 cobrancas / R$50,00) em PostgreSQL descartavel, sem rede nem Asaas. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

const asaasMock = vi.hoisted(() => ({ cliente: { id: "cus_x", name: "Fulana Teste", cpfCnpj: "123.456.789-09", email: "a@x.com", notificationDisabled: false, deleted: false } as any, criou: 0 }));
vi.mock("../lib/asaas.js", () => ({
  asaasGetCustomer: vi.fn(async () => asaasMock.cliente),
  asaasCreateCustomer: vi.fn(), asaasGetCharge: vi.fn(),
  asaasCreateCharge: vi.fn(async () => { asaasMock.criou++; return { id: "pay_x", invoiceUrl: "https://x/i", status: "PENDING", netValue: 3.01 }; }),
}));
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

const base = { clientId: 1, valorCentavos: 500, tipo: "PIX", descricao: "x", diasVencimento: 1, confirmo: true };

describe("validacao de entrada", () => {
  it.each([[0], [501], [1.5], ["50"], [-1]])("recusa valor %s", (v) => {
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
  it("30 reservas simultaneas de R$5,00: exatamente 10 passam e o total fica em R$50,00", async () => {
    const r = await Promise.allSettled(Array.from({ length: 30 }, () => t.reservarTeste(t.validarEntrada(base), "2026-12-01", "teste")));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(10);
    const rs = await t.resumoTeste();
    expect(rs).toMatchObject({ cobrancas: 10, totalCentavos: 5000 });
    await expect(t.reservarTeste(t.validarEntrada({ ...base, valorCentavos: 1 }), "2026-12-01", "teste")).rejects.toThrow(/Limite/);
  });
  it("recusa definitiva libera a reserva; incerta continua contada", async () => {
    await pool.query(`UPDATE asaas_cobrancas_teste SET estado='recusada' WHERE id IN (SELECT id FROM asaas_cobrancas_teste ORDER BY id LIMIT 1)`);
    expect((await t.resumoTeste()).cobrancas).toBe(9);
    await pool.query(`UPDATE asaas_cobrancas_teste SET estado='incerta' WHERE id IN (SELECT id FROM asaas_cobrancas_teste WHERE estado='recusada')`);
    expect((await t.resumoTeste()).cobrancas).toBe(10);
  });
  it("o banco recusa valor acima de 500 centavos mesmo fora da aplicacao", async () => {
    await expect(pool.query(`INSERT INTO asaas_cobrancas_teste (client_id,valor_centavos,tipo,descricao,vencimento) VALUES (1,501,'PIX','x','2026-12-01')`)).rejects.toThrow();
  });
});

describe("conferencia do titular no Asaas (somente leitura, antes de cobrar)", () => {
  const cli = { name: "Fulana Teste", cpf: "12345678909", email: "a@x.com", asaasCustomerId: "cus_x" };
  it("aceita quando nome, documento e e-mail batem e informa que o Asaas avisa o cliente", async () => {
    asaasMock.cliente = { ...asaasMock.cliente };
    expect(await t.conferirTitularAsaas(cli)).toEqual({ asaasAvisaCliente: true });
  });
  it.each([["name", "Outra Pessoa", /nome/], ["cpfCnpj", "000.000.000-00", /documento/], ["email", "b@x.com", /e-mail/], ["deleted", true, /removido/]])(
    "bloqueia divergencia de %s sem cobrar", async (campo, valor, rx) => {
      asaasMock.cliente = { ...asaasMock.cliente, [campo as string]: valor };
      await expect(t.conferirTitularAsaas(cli)).rejects.toThrow(rx as RegExp);
      asaasMock.cliente = { id: "cus_x", name: "Fulana Teste", cpfCnpj: "123.456.789-09", email: "a@x.com", notificationDisabled: false, deleted: false };
    });
  it("cadastro sem e-mail nao tem para onde enviar o link", async () => {
    await expect(t.conferirTitularAsaas({ ...cli, email: null })).rejects.toThrow(/sem e-mail/);
  });
});
