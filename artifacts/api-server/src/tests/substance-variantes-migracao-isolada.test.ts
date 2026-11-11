import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

let banco: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const migration = (nome: string) =>
  readFileSync(new URL(`../../../../lib/db/migrations/${nome}`, import.meta.url), "utf8");

beforeAll(async () => {
  banco = await startIsolatedPostgres();
  await banco.pool.query(`
    CREATE TABLE empresas(id integer PRIMARY KEY);
    INSERT INTO empresas VALUES (1),(2);
    CREATE TABLE professionals(id integer PRIMARY KEY);
    INSERT INTO professionals VALUES (9);
    CREATE TABLE substances(id integer PRIMARY KEY, name text, default_dose text, stock_quantity integer, price_per_unit integer);
    INSERT INTO substances VALUES (202,'Substância sintética','10 MG / 2 ML',7,2000);
  `);
  await banco.pool.query(migration("20261111-fornecedores-cadastrados.sql"));
  await banco.pool.query(migration("20261111-substance-variantes.sql"));
  await banco.pool.query("INSERT INTO fornecedores_cadastrados(empresa_id,nome) VALUES(1,'Fornecedor sintético'),(2,'Fornecedor outra clínica')");
}, 60_000);
afterAll(async () => { if (banco) await banco.stop(); }, 60_000);

describe("variantes e ofertas — migração isolada", () => {
  let variante: number;
  it("preserva o produto legado ao criar duas variantes da mesma dose", async () => {
    const result = await banco.pool.query(`INSERT INTO substance_variantes
      (empresa_id,substance_id,dose_total,forma,volume_ml,vias_fonte)
      VALUES (1,202,'10 mg','ampola',2,'IM'),(1,202,'10 mg','ampola',4,'IM') RETURNING id`);
    expect(result.rows).toHaveLength(2);
    variante = result.rows[0].id;
    const original = await banco.pool.query("SELECT * FROM substances WHERE id=202");
    expect(original.rows[0]).toMatchObject({ default_dose: "10 MG / 2 ML", stock_quantity: 7, price_per_unit: 2000 });
  });
  it("conserva origem e valores e limita a cinco ofertas, inclusive simultâneas", async () => {
    const inserir = (posicao: number, origem: string) => banco.pool.query(`INSERT INTO substance_ofertas
      (empresa_id,variante_id,fornecedor_id,posicao,origem_chave,documento,pagina,linha,embalagem_original,fonte_texto,quantidade_embalagem,custo_unitario_centavos,custo_embalagem_centavos)
      VALUES (1,$1,1,$2,$3,'Documento sintético',1,1,'10 ampolas','Fonte sintética',10,500,5000)`, [variante, posicao, origem]);
    await Promise.all([1, 2, 3, 4, 5].map(n => inserir(n, `origem-${n}`)));
    await expect(inserir(6, "origem-seis")).rejects.toMatchObject({ code: "23514" });
    await expect(inserir(1, "outra-origem")).rejects.toMatchObject({ code: "23505" });
    await expect(inserir(2, "origem-1")).rejects.toMatchObject({ code: "23505" });
    expect((await banco.pool.query("SELECT count(*)::int AS n FROM substance_ofertas WHERE variante_id=$1", [variante])).rows[0].n).toBe(5);
  });
  it("recusa fornecedor de outra clínica e preserva preço de embalagem com desconto", async () => {
    const segunda = (await banco.pool.query("SELECT id FROM substance_variantes WHERE volume_ml=4")).rows[0].id;
    const insert = `INSERT INTO substance_ofertas(empresa_id,variante_id,fornecedor_id,posicao,origem_chave,documento,pagina,linha,embalagem_original,fonte_texto,quantidade_embalagem,custo_unitario_centavos,custo_embalagem_centavos)
      VALUES(1,$1,$2,1,$3,'Documento sintético',1,1,'10 ampolas','Fonte sintética',10,500,$4)`;
    await expect(banco.pool.query(insert, [segunda, 2, "empresa-cruzada", 5000])).rejects.toMatchObject({ code: "23503" });
    await banco.pool.query(insert, [segunda, 1, "preco-desconto", 4500]);
    expect((await banco.pool.query("SELECT custo_embalagem_centavos FROM substance_ofertas WHERE origem_chave='preco-desconto'")).rows[0].custo_embalagem_centavos).toBe(4500);
  });
  it("exige autoria válida e a mesma clínica no histórico", async () => {
    const oferta = (await banco.pool.query("SELECT id FROM substance_ofertas LIMIT 1")).rows[0].id;
    await banco.pool.query("INSERT INTO substance_oferta_historico(empresa_id,oferta_id,ator_tipo,justificativa,depois) VALUES(1,$1,'agente','Importação autorizada','{}')", [oferta]);
    await expect(banco.pool.query("INSERT INTO substance_oferta_historico(empresa_id,oferta_id,ator_tipo,depois) VALUES(1,$1,'agente','{}')", [oferta])).rejects.toMatchObject({ code: "23514" });
    await expect(banco.pool.query("INSERT INTO substance_oferta_historico(empresa_id,oferta_id,ator_tipo,profissional_id,depois) VALUES(2,$1,'profissional',9,'{}')", [oferta])).rejects.toMatchObject({ code: "23503" });
  });
});
