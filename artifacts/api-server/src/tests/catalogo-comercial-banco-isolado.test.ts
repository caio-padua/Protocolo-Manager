/**
 * Testes do catálogo e crédito em PostgreSQL descartável.
 * Usa empresas sintéticas e valores somente de homologação; não chama provedores.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;

let pool: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }>; end: () => Promise<void> };
let catalogo: typeof import("../lib/catalogo-comercial");
let credito: typeof import("../lib/mensageria-credito");

beforeAll(async () => {
  pool = (await import("@workspace/db")).pool as unknown as typeof pool;
  await pool.query(`CREATE TABLE IF NOT EXISTS empresas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL)`);
  await pool.query(`INSERT INTO empresas (id, nome) VALUES (991, 'Clínica sintética 991'), (992, 'Clínica sintética 992') ON CONFLICT (id) DO NOTHING`);
  catalogo = await import("../lib/catalogo-comercial");
  credito = await import("../lib/mensageria-credito");
  await credito.garantirTabelasCredito();
  await catalogo.garantirCatalogo();
}, 60_000);
afterAll(async () => { try { await pool?.end(); } catch { /* ignora */ } pg.parar(); });

describe("proposta persistida e cálculos", () => {
  it("semeia os quatro planos e calcula valores anuais sem arredondamento oculto", async () => {
    const c = await catalogo.lerCatalogo();
    expect(c.planos.map((p) => p.codigo)).toEqual(["nucleo", "operacao", "automacao", "full"]);
    expect(c.planos.find((p) => p.codigo === "nucleo")?.financeiro).toMatchObject({
      totalAnualSemDescontoCentavos: 596400,
      totalAnualAntecipadoCentavos: 536760,
      equivalenteMensalAnualCentavos: 44730,
    });
    expect(c.planos.find((p) => p.codigo === "full")?.financeiro.totalCompromissoCentavos).toBe(4200000);
    expect(c.config.cambio_efetivo).toBeNull();
  });

  it("não sobrescreve preço editado ao reaplicar a proposta inicial", async () => {
    await catalogo.editarPlano("nucleo", { preco_mensal_centavos: 51234 }, "teste-isolado");
    await catalogo.aplicarProposta();
    const c = await catalogo.lerCatalogo();
    expect(c.planos.find((p) => p.codigo === "nucleo")?.preco_mensal_centavos).toBe(51234);
    const versoes = await pool.query(`SELECT versao, snapshot FROM cat_versoes WHERE entidade='plano' AND chave='nucleo'`);
    expect(versoes.rows).toHaveLength(1);
    expect(String(versoes.rows[0].snapshot.preco_mensal_centavos)).toBe("49700");
  });

  it("mantém as tarifas propostas inativas até uma ativação explícita", async () => {
    const c = await catalogo.lerCatalogo();
    expect(c.tarifas.every((t) => t.ativo === false)).toBe(true);
    const motor = await pool.query(`SELECT DISTINCT ativo FROM msg_tarifas WHERE empresa_id IS NULL`);
    expect(motor.rows.every((r) => r.ativo === false)).toBe(true);
  });

  it("não cobra módulo avulso já incluído e cobra o que ficou fora do plano", () => {
    expect(catalogo.modulosAvulsosCobraveis(["agenda", "exames"], ["agenda", "exames", "estoque"])).toEqual(["estoque"]);
  });

  it("não chama referência de fornecedor ou tarifa inativa de margem real", async () => {
    await expect(catalogo.editarConfig("cambio_efetivo", 0, "teste-isolado")).rejects.toThrow(/câmbio deve ser positivo/i);
    await catalogo.editarConfig("cambio_efetivo", 5.8, "teste-isolado");
    const m = await catalogo.analiseMargem();
    expect(m.linhas.every((l: any) => l.real.margemPct === null)).toBe(true);
    expect(m.linhas.every((l: any) => l.real.situacao !== "calculado")).toBe(true);
  });

  it("cobra frações de uso em centavos inteiros", () => {
    expect(catalogo.calcularFracionado(180, "minuto", 1)).toBe(3); // 1 segundo de minuto ativo
    expect(catalogo.calcularFracionado(190, "mil_caracteres", 1)).toBe(1);
    expect(catalogo.calcularFracionado(190, "mil_caracteres", 1000)).toBe(190);
    expect(() => catalogo.calcularFracionado(-1, "minuto", 1)).toThrow(/preço deve ser inteiro/i);
  });

  it("impede bônus, acúmulo de franquia e cobrança recorrente nesta homologação", async () => {
    await expect(catalogo.editarConfig("cobranca_recorrente_automatica", true, "teste-isolado"))
      .rejects.toThrow(/ficam desativados/i);
    await expect(catalogo.editarConfig("franquia_acumula", true, "teste-isolado"))
      .rejects.toThrow(/ficam desativados/i);
    await expect(catalogo.editarConfig("recarga_bonus_automatico", true, "teste-isolado"))
      .rejects.toThrow(/ficam desativados/i);
  });
});

describe("preço congelado no evento e franquia mensal", () => {
  it("evento conserva versão e preço mesmo depois de uma tarifa nova", async () => {
    const empresaId = 991;
    await catalogo.editarTarifa("msg_enviada", { preco_centavos: 13, ativo: true }, "teste-isolado");
    const rec = await credito.solicitarRecarga(empresaId, 1000, "teste-isolado", "teste");
    expect(await credito.confirmarRecarga(rec.id, "teste")).toMatchObject({ ok: true });
    const evento = await credito.registrarEvento({ empresaId, tipo: "enviada", chave: "catalogo-evento-v2" });
    expect(evento).toMatchObject({ ok: true, valorCobradoCentavos: 13 });
    await catalogo.editarTarifa("msg_enviada", { preco_centavos: 14 }, "teste-isolado");
    const row = await pool.query(`SELECT valor_centavos, valor_tabela_centavos, tarifa_codigo, tarifa_versao FROM msg_extrato WHERE empresa_id=$1 AND chave=$2`, [empresaId, "catalogo-evento-v2"]);
    expect(row.rows[0]).toMatchObject({ valor_centavos: "13", valor_tabela_centavos: "13", tarifa_codigo: "msg_enviada", tarifa_versao: 2 });
  });

  it("usa a franquia do contrato antes do crédito comprado e registra o abatimento", async () => {
    const empresaId = 992;
    await catalogo.editarTarifa("msg_recebida", { ativo: true }, "teste-isolado");
    const contrato = await catalogo.criarContrato({ empresaId, planoCodigo: "automacao", rotulo: "PILOTO SINTÉTICO", condicao: "anual_antecipado", por: "teste-isolado" });
    expect(String(contrato.valor_periodo_centavos)).toBe("1940760");
    const primeira = await credito.registrarEvento({ empresaId, tipo: "recebida", chave: "franquia-1" });
    expect(primeira).toMatchObject({ ok: true, valorCobradoCentavos: 0 });
    const linha = await pool.query(`SELECT valor_centavos, valor_tabela_centavos, franquia_abatida_centavos FROM msg_extrato WHERE empresa_id=$1 AND chave='franquia-1'`, [empresaId]);
    expect(linha.rows[0]).toMatchObject({ valor_centavos: "0", valor_tabela_centavos: "3", franquia_abatida_centavos: "3" });
    await credito.registrarEvento({ empresaId, tipo: "recebida", chave: "franquia-1" });
    const uso = await pool.query(`SELECT usado_centavos FROM msg_franquia_uso WHERE empresa_id=$1`, [empresaId]);
    expect(uso.rows[0].usado_centavos).toBe("3");
  });

  it("não cria contrato para empresa inexistente nem aceita condição comercial desconhecida", async () => {
    await expect(catalogo.criarContrato({ empresaId: 993, planoCodigo: "nucleo", rotulo: "não deve criar", por: "teste-isolado" }))
      .rejects.toThrow(/clínica inexistente/i);
    await expect(catalogo.criarContrato({ empresaId: 991, planoCodigo: "nucleo", rotulo: "não deve criar", condicao: "desconhecida" as never, por: "teste-isolado" }))
      .rejects.toThrow(/condição de pagamento inválida/i);
  });
});
