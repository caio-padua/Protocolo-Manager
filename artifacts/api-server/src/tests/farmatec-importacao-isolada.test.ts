import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { importarFarmatec } from "../lib/farmatec-importacao";

let banco: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const migracao = (nome: string) => readFileSync(new URL(`../../../../lib/db/migrations/${nome}`, import.meta.url), "utf8");
const fonte = "FARMATEC:\n1 | 5 | Produto sintético | 10 mg | 2 ml | IM | 10 ampolas | R$5,00 | R$50,00";
const item = { origem: "farmatec-2025-09-29-p1-linha5",
  legado: { id: 202, nome: "PRODUTO SINTETICO", doseText: "10 MG / 2 ML" },
  farmatec: { nome: "Produto sintético", doseTotal: "10 mg", volume: "2 ml", vias: "IM",
    embalagem: { qtd: 10, tipo: "ampola" }, precoUnidadeCentavos: 500, precoCaixaCentavos: 5000 } };
const permissao = { ator: "agente" as const, justificativa: "Importação autorizada para teste isolado." };

beforeAll(async () => {
  banco = await startIsolatedPostgres();
  await banco.pool.query(`
    CREATE TABLE empresas(id integer PRIMARY KEY, ativa boolean, status text);
    INSERT INTO empresas VALUES (1,true,'ATIVO'),(2,true,'ATIVO');
    CREATE TABLE professionals(id integer PRIMARY KEY);
    CREATE TABLE substances(id integer PRIMARY KEY,name text,default_dose text,is_blend boolean,composicao text,
      presentation_quantity real,presentation_unit text,ampoule_volume_ml real,volume_ampola text,concentration_mg text,
      stock_quantity integer,price_per_unit integer);
    INSERT INTO substances(id,name,default_dose,is_blend,stock_quantity,price_per_unit) VALUES(202,'PRODUTO SINTETICO','10 MG / 2 ML',false,7,2000);
  `);
  await banco.pool.query(migracao("20261111-fornecedores-cadastrados.sql"));
  await banco.pool.query(migracao("20261111-substance-variantes.sql"));
  await banco.pool.query("INSERT INTO fornecedores_cadastrados(empresa_id,nome) VALUES(1,'Farmácia sintética'),(2,'Outra clínica')");
}, 60_000);
afterAll(async () => { if (banco) await banco.stop(); }, 60_000);

describe("Importação Farmatec com rastreio", () => {
  it("grava variante e oferta com histórico e preserva a ficha legada", async () => {
    expect(await importarFarmatec(banco.pool, 1, 1, [item], fonte, permissao)).toEqual([{ origem: item.origem, estado: "inserido" }]);
    const resultado = await banco.pool.query(`SELECT v.substance_id,v.dose_total,v.forma,v.volume_ml,o.quantidade_embalagem,
      o.custo_unitario_centavos,o.custo_embalagem_centavos,o.fonte_texto,o.fornecedor_id
      FROM substance_variantes v JOIN substance_ofertas o ON o.variante_id=v.id`);
    expect(resultado.rows[0]).toMatchObject({ substance_id: 202, dose_total: "10 mg", forma: "ampola", volume_ml: "2",
      quantidade_embalagem: 10, custo_unitario_centavos: 500, custo_embalagem_centavos: 5000, fornecedor_id: 1 });
    expect(resultado.rows[0].fonte_texto).toContain("Produto sintético");
    const original = (await banco.pool.query("SELECT * FROM substances WHERE id=202")).rows[0];
    expect(original).toMatchObject({ name: "PRODUTO SINTETICO", default_dose: "10 MG / 2 ML", presentation_unit: null,
      stock_quantity: 7, price_per_unit: 2000 });
    expect((await banco.pool.query("SELECT count(*)::int AS n FROM substance_variante_historico WHERE ator_tipo='agente'")).rows[0].n).toBe(1);
    expect((await banco.pool.query("SELECT count(*)::int AS n FROM substance_oferta_historico WHERE ator_tipo='agente'")).rows[0].n).toBe(1);
  });
  it("reexecuta sem duplicar e bloqueia origem adulterada", async () => {
    expect(await importarFarmatec(banco.pool, 1, 1, [item], fonte, permissao)).toEqual([{ origem: item.origem, estado: "ignorado" }]);
    expect((await importarFarmatec(banco.pool, 1, 1, [{ ...item, farmatec: { ...item.farmatec, precoCaixaCentavos: 1 } }], fonte, permissao))[0].estado).toBe("pendente");
    expect((await banco.pool.query("SELECT count(*)::int AS n FROM substance_ofertas")).rows[0].n).toBe(1);
  });
  it("não esconde edição humana em oferta previamente importada", async () => {
    await banco.pool.query("UPDATE substance_ofertas SET custo_unitario_centavos=600 WHERE origem_chave=$1", [item.origem]);
    try {
      const r = await importarFarmatec(banco.pool, 1, 1, [item], fonte, permissao);
      expect(r[0]).toMatchObject({ estado: "pendente", motivo: "Origem já registrada com dados diferentes." });
      expect((await banco.pool.query("SELECT custo_unitario_centavos FROM substance_ofertas WHERE origem_chave=$1", [item.origem])).rows[0].custo_unitario_centavos).toBe(600);
    } finally {
      await banco.pool.query("UPDATE substance_ofertas SET custo_unitario_centavos=500 WHERE origem_chave=$1", [item.origem]);
    }
  });
  it("não aceita fornecedor de outra clínica nem versão legada divergente", async () => {
    await expect(importarFarmatec(banco.pool, 1, 2, [item], fonte, permissao)).rejects.toThrow("importação foi interrompida");
    await banco.pool.query("UPDATE substances SET default_dose='20 MG / 2 ML' WHERE id=202");
    try {
      expect((await importarFarmatec(banco.pool, 1, 1, [item], fonte, permissao))[0]).toMatchObject({ estado: "pendente", motivo: "Registro legado mudou ou não existe." });
    } finally {
      await banco.pool.query("UPDATE substances SET default_dose='10 MG / 2 ML' WHERE id=202");
    }
  });
  it("não vincula fonte a uma ficha com nome ou dose diferentes", async () => {
    const dose = { ...item, legado: { ...item.legado, doseText: "20 MG / 2 ML" } };
    expect((await importarFarmatec(banco.pool, 1, 1, [dose], fonte, permissao))[0]).toMatchObject({ estado: "pendente", motivo: "Identidade ou dose da fonte divergem da ficha legada." });
    const nome = { ...item, legado: { ...item.legado, nome: "OUTRA SUBSTANCIA" } };
    expect((await importarFarmatec(banco.pool, 1, 1, [nome], fonte, permissao))[0]).toMatchObject({ estado: "pendente", motivo: "Identidade ou dose da fonte divergem da ficha legada." });
  });
  it("aceita outro volume com a mesma dose e forma comprovadas, sem misturar variantes", async () => {
    const segundaFonte = `${fonte}\n1 | 6 | Produto sintético | 10 mg | 4 ml | IM | 10 ampolas | R$5,00 | R$50,00`;
    const segundo = { ...item, origem: "farmatec-2025-09-29-p1-linha6", farmatec: { ...item.farmatec, volume: "4 ml" } };
    expect((await importarFarmatec(banco.pool, 1, 1, [segundo], segundaFonte, permissao))[0].estado).toBe("inserido");
    const r = await banco.pool.query("SELECT volume_ml FROM substance_variantes WHERE substance_id=202 ORDER BY volume_ml");
    expect(r.rows.map((x: { volume_ml: string }) => x.volume_ml)).toEqual(["2", "4"]);
  });
  it("reverte variante e oferta quando o histórico falha", async () => {
    await banco.pool.query(`CREATE FUNCTION recusar_historico_teste() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha de auditoria simulada'; END $$;
      CREATE TRIGGER falha_historico BEFORE INSERT ON substance_oferta_historico FOR EACH ROW EXECUTE FUNCTION recusar_historico_teste();`);
    try {
      await expect(importarFarmatec(banco.pool, 2, 2, [item], fonte, permissao)).rejects.toThrow("importação foi interrompida");
      expect((await banco.pool.query("SELECT count(*)::int n FROM substance_variantes WHERE empresa_id=2")).rows[0].n).toBe(0);
      expect((await banco.pool.query("SELECT count(*)::int n FROM substance_ofertas WHERE empresa_id=2")).rows[0].n).toBe(0);
      expect((await banco.pool.query("SELECT count(*)::int n FROM substance_variante_historico WHERE empresa_id=2")).rows[0].n).toBe(0);
    } finally {
      await banco.pool.query("DROP TRIGGER falha_historico ON substance_oferta_historico; DROP FUNCTION recusar_historico_teste()");
    }
  });
});
