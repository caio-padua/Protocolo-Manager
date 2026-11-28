import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { ambienteCreditoAtual, migrarCreditoPorAmbiente } from "../lib/mensageria-credito-ambiente";

const instancia = iniciarPgDescartavel();
const pool = new pg.Pool({ connectionString: instancia.url });
afterAll(async () => { await pool.end(); instancia.parar(); });

async function legado(schema: string, misturado = false) {
  await pool.query(`CREATE SCHEMA ${schema}`);
  const scoped = new pg.Pool({ connectionString: instancia.url, options: `-c search_path=${schema}` });
  await scoped.query(`CREATE TABLE msg_carteira (empresa_id INTEGER PRIMARY KEY, saldo_centavos BIGINT NOT NULL);
    CREATE TABLE msg_recargas (id SERIAL PRIMARY KEY, ambiente TEXT, status TEXT, provedor_ref TEXT UNIQUE);
    INSERT INTO msg_carteira VALUES (2, 12345)`);
  if (misturado) await scoped.query(`INSERT INTO msg_recargas (ambiente,status) VALUES ('teste','confirmada')`);
  return scoped;
}

describe("migração financeira sem apagar ou reclassificar saldo misturado", () => {
  it("preserva saldo legado como real e aceita reaplicação sem duplicação", async () => {
    const scoped = await legado("legado_limpo");
    try {
      await migrarCreditoPorAmbiente(scoped);
      await migrarCreditoPorAmbiente(scoped);
      expect((await scoped.query(`SELECT * FROM msg_carteira`)).rows).toEqual([{ empresa_id: 2, saldo_centavos: "12345", ambiente: "real" }]);
      await scoped.query(`INSERT INTO msg_carteira (empresa_id,saldo_centavos,ambiente) VALUES (2,999,'teste')`);
      expect((await scoped.query(`SELECT COUNT(*)::int n FROM msg_carteira`)).rows[0].n).toBe(2);
    } finally { await scoped.end(); }
  });
  it("recusa legado com teste já creditado e desfaz toda a migração", async () => {
    const scoped = await legado("legado_misturado", true);
    try {
      await expect(migrarCreditoPorAmbiente(scoped)).rejects.toThrow(/exige conciliação/);
      expect((await scoped.query(`SELECT * FROM msg_carteira`)).rows).toEqual([{ empresa_id: 2, saldo_centavos: "12345" }]);
      expect((await scoped.query(`SELECT COUNT(*)::int n FROM msg_recargas`)).rows[0].n).toBe(1);
    } finally { await scoped.end(); }
  });
  it("coluna adicionada manualmente não comprova conciliação do legado", async () => {
    const scoped = await legado("legado_parcial", true);
    try {
      await scoped.query(`ALTER TABLE msg_carteira ADD COLUMN ambiente TEXT DEFAULT 'real'`);
      await expect(migrarCreditoPorAmbiente(scoped)).rejects.toThrow(/exige conciliação/);
      expect((await scoped.query(`SELECT saldo_centavos, ambiente FROM msg_carteira`)).rows)
        .toEqual([{ saldo_centavos: "12345", ambiente: "real" }]);
    } finally { await scoped.end(); }
  });
  it("produção usa carteira real e desenvolvimento usa carteira de teste", () => {
    const anterior = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production"; expect(ambienteCreditoAtual()).toBe("real");
      process.env.NODE_ENV = "development"; expect(ambienteCreditoAtual()).toBe("teste");
    } finally { process.env.NODE_ENV = anterior; }
  });
});
