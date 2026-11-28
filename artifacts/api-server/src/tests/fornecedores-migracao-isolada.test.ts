import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

let banco: Awaited<ReturnType<typeof startIsolatedPostgres>>;
beforeAll(async () => {
  banco = await startIsolatedPostgres();
  await banco.pool.query(`
    CREATE TABLE empresas(id integer PRIMARY KEY);
    INSERT INTO empresas VALUES (1),(2);
    CREATE TABLE professionals(id integer PRIMARY KEY);
    INSERT INTO professionals VALUES (9);
  `);
  const migracao = readFileSync(new URL("../../../../lib/db/migrations/20261111-fornecedores-cadastrados.sql", import.meta.url), "utf8");
  await banco.pool.query(migracao);
}, 60_000);
afterAll(async () => { if (banco) await banco.stop(); }, 60_000);

describe("migração de fornecedores", () => {
  it("mantém a empresa do fornecedor e registra autores verdadeiros", async () => {
    const { rows } = await banco.pool.query("INSERT INTO fornecedores_cadastrados(empresa_id,nome) VALUES(1,'Farmácia sintética') RETURNING id");
    const id = rows[0].id;
    await banco.pool.query("INSERT INTO fornecedor_historico(empresa_id,fornecedor_id,profissional_id,depois) VALUES(1,$1,9,'{}')", [id]);
    await banco.pool.query("INSERT INTO fornecedor_historico(empresa_id,fornecedor_id,ator_tipo,justificativa,depois) VALUES(1,$1,'agente','Solicitação autorizada','{}')", [id]);
    await expect(banco.pool.query("INSERT INTO fornecedor_historico(empresa_id,fornecedor_id,ator_tipo,depois) VALUES(1,$1,'agente','{}')", [id])).rejects.toMatchObject({ code: "23514" });
    await expect(banco.pool.query("INSERT INTO fornecedor_historico(empresa_id,fornecedor_id,profissional_id,depois) VALUES(2,$1,9,'{}')", [id])).rejects.toMatchObject({ code: "23503" });
    await expect(banco.pool.query("INSERT INTO fornecedores_cadastrados(empresa_id,nome) VALUES(1,' FARMÁCIA SINTÉTICA ')")).rejects.toMatchObject({ code: "23505" });
    const result = await banco.pool.query("SELECT count(*)::int AS total FROM fornecedor_historico");
    expect(result.rows[0].total).toBe(2);
  });
});
