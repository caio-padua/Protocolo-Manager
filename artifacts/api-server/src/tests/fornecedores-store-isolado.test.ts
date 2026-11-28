import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";
import { ErroFornecedor, listarFornecedores, salvarFornecedor } from "../lib/fornecedores-store";

let banco: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const ficha = {
  nome: "Farmácia sintética", razaoSocial: null, cnpj: null, endereco: null, telefone: null,
  email: null, site: null, instagram: null, fabricante: null, fornecedor: true,
  fonte: "fonte sintética", ativo: true,
};
beforeAll(async () => {
  banco = await startIsolatedPostgres();
  await banco.pool.query(`
    CREATE TABLE empresas(id integer PRIMARY KEY, ativa boolean NOT NULL, status text NOT NULL);
    INSERT INTO empresas VALUES (1,true,'ATIVO'),(2,true,'ATIVO'),(3,false,'SUSPENSO');
    CREATE TABLE professionals(id integer PRIMARY KEY, active boolean NOT NULL, is_platform_owner boolean NOT NULL);
    INSERT INTO professionals VALUES (9,true,true),(10,true,true),(11,true,false);
    CREATE TABLE fornecedores_cadastrados (
      id serial PRIMARY KEY, empresa_id integer NOT NULL REFERENCES empresas(id), nome text NOT NULL,
      razao_social text, cnpj text, endereco text, telefone text, email text, site text, instagram text,
      fabricante boolean, fornecedor boolean, fonte text, ativo boolean NOT NULL DEFAULT true,
      versao integer NOT NULL DEFAULT 1, criado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX fornecedores_empresa_nome_uq ON fornecedores_cadastrados(empresa_id,lower(btrim(nome)));
    CREATE UNIQUE INDEX fornecedores_empresa_id_uq ON fornecedores_cadastrados(empresa_id,id);
    CREATE TABLE fornecedor_historico (
      id serial PRIMARY KEY, empresa_id integer NOT NULL REFERENCES empresas(id),
      fornecedor_id integer NOT NULL, profissional_id integer NOT NULL REFERENCES professionals(id),
      antes jsonb, depois jsonb NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (empresa_id,fornecedor_id) REFERENCES fornecedores_cadastrados(empresa_id,id)
    );
  `);
}, 60_000);
afterAll(async () => { if (banco) await banco.stop(); }, 60_000);

describe("fornecedores — persistência isolada", () => {
  it("cria e relê com papéis desconhecidos sem inventar dados", async () => {
    const criado = await salvarFornecedor(banco.pool, 1, 9, ficha);
    expect(criado).toMatchObject({ nome: ficha.nome, empresaId: 1, fabricante: null, fornecedor: true, versao: 1 });
    expect(await listarFornecedores(banco.pool, 1)).toContainEqual(criado);
    expect(await listarFornecedores(banco.pool, 2)).toEqual([]);
    const auditoria = await banco.pool.query("SELECT antes,depois,profissional_id FROM fornecedor_historico WHERE fornecedor_id=$1", [criado.id]);
    expect(auditoria.rows).toHaveLength(1);
    expect(auditoria.rows[0]).toMatchObject({ antes: null, profissional_id: 9, depois: { nome: ficha.nome } });
  });
  it("recusa nome repetido na clínica, sem impedir outra clínica", async () => {
    await expect(salvarFornecedor(banco.pool, 1, 9, { ...ficha, nome: " FARMÁCIA SINTÉTICA " }))
      .rejects.toMatchObject({ status: 409 });
    await expect(salvarFornecedor(banco.pool, 2, 10, ficha)).resolves.toMatchObject({ empresaId: 2 });
  });
  it("impede edição por clínica diferente e clínica suspensa", async () => {
    const item = (await listarFornecedores(banco.pool, 1))[0];
    await expect(salvarFornecedor(banco.pool, 2, 10, ficha, item.id, item.versao))
      .rejects.toMatchObject({ status: 404 });
    await expect(salvarFornecedor(banco.pool, 3, 10, ficha)).rejects.toMatchObject({ status: 403 });
    await expect(salvarFornecedor(banco.pool, 1, 11, ficha)).rejects.toMatchObject({ status: 403 });
    await expect(salvarFornecedor(banco.pool, 1, 999, ficha)).rejects.toMatchObject({ status: 403 });
    await expect(banco.pool.query("INSERT INTO fornecedor_historico(empresa_id,fornecedor_id,profissional_id,depois) VALUES (2,$1,10,'{}')", [item.id]))
      .rejects.toMatchObject({ code: "23503" });
  });
  it("evita perda de atualização e mantém histórico", async () => {
    const item = (await listarFornecedores(banco.pool, 1))[0];
    const resultados = await Promise.allSettled([
      salvarFornecedor(banco.pool, 1, 9, { ...ficha, fonte: "Alteração A" }, item.id, item.versao),
      salvarFornecedor(banco.pool, 1, 9, { ...ficha, fonte: "Alteração B" }, item.id, item.versao),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusa = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(recusa.reason).toBeInstanceOf(ErroFornecedor);
    expect(recusa.reason.status).toBe(409);
    const atual = (await listarFornecedores(banco.pool, 1))[0];
    expect(atual.versao).toBe(2);
    const revisoes = await banco.pool.query("SELECT antes,depois FROM fornecedor_historico WHERE fornecedor_id=$1 ORDER BY id", [item.id]);
    expect(revisoes.rows).toHaveLength(2);
    expect(revisoes.rows[1].antes.versao).toBe(1);
    expect(revisoes.rows[1].depois.versao).toBe(2);
  });
  it("recusa campos inesperados e versão ausente", async () => {
    await expect(salvarFornecedor(banco.pool, 1, 9, { ...ficha, empresaId: 2 })).rejects.toMatchObject({ status: 400 });
    await expect(salvarFornecedor(banco.pool, 1, 9, ficha, 1)).rejects.toMatchObject({ status: 400 });
  });
  it("reverte cadastro quando falha a gravação do histórico", async () => {
    await banco.pool.query(`CREATE FUNCTION falhar_historico_sintetico() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.depois->>'nome'='Teste de rollback' THEN RAISE EXCEPTION 'falha simulada'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER historico_sintetico BEFORE INSERT ON fornecedor_historico
      FOR EACH ROW EXECUTE FUNCTION falhar_historico_sintetico();`);
    await expect(salvarFornecedor(banco.pool, 1, 9, { ...ficha, nome: "Teste de rollback" })).rejects.toThrow();
    expect((await listarFornecedores(banco.pool, 1)).some((f) => f.nome === "Teste de rollback")).toBe(false);
    const item = (await listarFornecedores(banco.pool, 1))[0];
    await expect(salvarFornecedor(banco.pool, 1, 9, { ...ficha, nome: "Teste de rollback" }, item.id, item.versao)).rejects.toThrow();
    expect((await listarFornecedores(banco.pool, 1))[0]).toMatchObject({ id: item.id, nome: item.nome, versao: item.versao });
  });
});
