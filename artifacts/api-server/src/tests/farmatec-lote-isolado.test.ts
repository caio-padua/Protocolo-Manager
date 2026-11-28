import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { importarFarmatec } from "../lib/farmatec-importacao";

const manifestoPath = new URL("../../../../attached_assets/Pasted-MANIFESTO-DE-ENRIQUECIMENTO-PARA-AGILIZAR-reuni-os-126-_1794385893587.txt", import.meta.url);
const fontePath = new URL("../../../../attached_assets/Pasted-DADOS-EXTRA-DOS-E-CONFERIDOS-DAS-TABELAS-PEDIDAS-Use-es_1794384373497.txt", import.meta.url);
const fontesReaisDisponiveis = process.env.TESTAR_LOTE_SINTETICO !== "1" && existsSync(manifestoPath) && existsSync(fontePath);
const sinteticos = Array.from({ length: 126 }, (_, i) => ({
  origem: `farmatec-2025-09-29-p1-linha${i + 1}`,
  legado: { id: 1000 + i, nome: `PRODUTO SINTETICO ${i + 1}`, doseText: "10 MG / 2 ML" },
  farmatec: { nome: `PRODUTO SINTETICO ${i + 1}`, doseTotal: "10 mg", volume: "2 ml", vias: "IM",
    embalagem: { qtd: 10, tipo: "ampola" }, precoUnidadeCentavos: 500, precoCaixaCentavos: 5000 },
}));
const manifestText = fontesReaisDisponiveis ? readFileSync(manifestoPath, "utf8") : "";
const manifesto: Array<any> = fontesReaisDisponiveis ? JSON.parse(manifestText.slice(manifestText.indexOf("[{"))) : sinteticos;
const fonte = fontesReaisDisponiveis ? readFileSync(fontePath, "utf8") :
  `FARMATEC:\n${sinteticos.map((c, i) => `1 | ${i + 1} | ${c.farmatec.nome} | 10 mg | 2 ml | IM | 10 ampolas | R$5,00 | R$50,00`).join("\n")}`;
const migracao = (nome: string) => readFileSync(new URL(`../../../../lib/db/migrations/${nome}`, import.meta.url), "utf8");
const permissao = { ator: "agente" as const, justificativa: "Autorização de teste em banco descartável." };
let banco: Awaited<ReturnType<typeof startIsolatedPostgres>>;

beforeAll(async () => {
  banco = await startIsolatedPostgres();
  await banco.pool.query(`
    CREATE TABLE empresas(id integer PRIMARY KEY, ativa boolean, status text);
    INSERT INTO empresas VALUES (1,true,'ATIVO');
    CREATE TABLE professionals(id integer PRIMARY KEY);
    CREATE TABLE substances(id integer PRIMARY KEY,name text,default_dose text,is_blend boolean,composicao text,
      presentation_quantity real,presentation_unit text,ampoule_volume_ml real,volume_ampola text,concentration_mg text,
      stock_quantity integer,price_per_unit integer);
  `);
  await banco.pool.query(migracao("20261111-fornecedores-cadastrados.sql"));
  await banco.pool.query(migracao("20261111-substance-variantes.sql"));
  await banco.pool.query("INSERT INTO fornecedores_cadastrados(empresa_id,nome) VALUES(1,'Fonte de teste')");
  for (const c of manifesto) {
    await banco.pool.query("INSERT INTO substances(id,name,default_dose,is_blend,stock_quantity,price_per_unit) VALUES($1,$2,$3,false,7,1234)",
      [c.legado.id, c.legado.nome, c.legado.doseText]);
  }
}, 60_000);
afterAll(async () => { if (banco) await banco.stop(); }, 60_000);

describe(`Lote de 126 candidatos em banco isolado (${fontesReaisDisponiveis ? "transcrição autorizada" : "dados sintéticos"})`, () => {
  it("reconcilia o lote, não duplica em corrida nem altera o catálogo anterior", async () => {
    expect(manifesto).toHaveLength(126);
    const concorrentes = await Promise.all([
      importarFarmatec(banco.pool, 1, 1, [manifesto[0]], fonte, permissao),
      importarFarmatec(banco.pool, 1, 1, [manifesto[0]], fonte, permissao),
    ]);
    expect(concorrentes.flat().map(r => r.estado).sort()).toEqual(["ignorado", "inserido"]);
    const resultados = await importarFarmatec(banco.pool, 1, 1, manifesto, fonte, permissao);
    expect(resultados.filter(r => r.estado === "pendente")).toEqual([]);
    expect(resultados.filter(r => r.estado === "inserido")).toHaveLength(125);
    expect(resultados.filter(r => r.estado === "ignorado")).toHaveLength(1);
    expect((await importarFarmatec(banco.pool, 1, 1, manifesto, fonte, permissao)).every(r => r.estado === "ignorado")).toBe(true);
    const contagens = await banco.pool.query(`SELECT
      (SELECT count(*)::int FROM substance_variantes) AS variantes,
      (SELECT count(*)::int FROM substance_ofertas) AS ofertas,
      (SELECT count(*)::int FROM substance_variante_historico) AS historico_variantes,
      (SELECT count(*)::int FROM substance_oferta_historico) AS historico_ofertas,
      (SELECT count(*)::int FROM substances WHERE stock_quantity=7 AND price_per_unit=1234 AND presentation_unit IS NULL) AS legados`);
    expect(contagens.rows[0]).toEqual({ variantes: 126, ofertas: 126, historico_variantes: 126, historico_ofertas: 126, legados: 126 });
  }, 60_000);
});
