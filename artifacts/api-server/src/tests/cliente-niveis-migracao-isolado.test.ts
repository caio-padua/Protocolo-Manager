/**
 * Migracao dos niveis do cliente (bronze/prata/ouro/rodio -> prata/ouro/platinum/diamond)
 * em PostgreSQL descartavel, com dados sinteticos de duas clinicas.
 * Prova: so bronze converte; valores ambiguos ficam preservados e marcados; repeticao nao muda nada;
 * rollback restaura sem sobrescrever o que a equipe alterou depois; clinicas nao se misturam.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
let pool: any;
const raiz = join(__dirname, "../../../..");
const subir = readFileSync(join(raiz, "scripts/migrations/20261125_cliente_plano_niveis.sql"), "utf8");
const descer = readFileSync(join(raiz, "scripts/migrations/rollback/20261125_cliente_plano_niveis.down.sql"), "utf8");

// [nome, empresa, plano antigo, status, apagado]
const SEMENTE: Array<[string, number, string, string, boolean]> = [
  ["A1", 1, "bronze", "active", false],
  ["A2", 1, "bronze", "active", false],
  ["A3", 1, "bronze", "inactive", false],
  ["A4", 1, "bronze", "active", true],
  ["A5", 1, "prata", "active", false],
  ["A6", 1, "ouro", "active", false],
  ["A7", 1, "rodio", "active", false],
  ["A8", 1, "platina", "active", false],
  ["A9", 1, "noir", "active", false],
  ["A10", 1, "Bronze ", "active", false],
  ["A11", 1, "platinum", "active", false],
  ["A12", 1, "diamond", "active", false],
  ["B1", 2, "bronze", "active", false],
  ["B2", 2, "ouro", "active", false],
  ["B3", 2, "rodio", "active", false],
];

async function recriar() {
  await pool.query(`DROP TABLE IF EXISTS cliente_nivel_migracao; DROP TABLE IF EXISTS clients;
    CREATE TABLE clients (id serial PRIMARY KEY, empresa_id int, name text NOT NULL, classificacao text NOT NULL DEFAULT 'D',
      plano text NOT NULL DEFAULT 'bronze', status text NOT NULL, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());`);
  for (const [nome, emp, plano, status, apagado] of SEMENTE) {
    await pool.query(
      `INSERT INTO clients (empresa_id, name, plano, status, deleted_at, classificacao) VALUES ($1,$2,$3,$4,$5,$6)`,
      [emp, nome, plano, status, apagado ? new Date("2026-01-01") : null, nome === "A1" ? "A" : "D"],
    );
  }
}
const planos = async () => Object.fromEntries((await pool.query(`SELECT name, plano FROM clients ORDER BY id`)).rows.map((r: any) => [r.name, r.plano]));
const outrasColunas = async () => (await pool.query(
  `SELECT md5(string_agg(concat_ws('|', id, empresa_id, name, classificacao, status, deleted_at, created_at), ';' ORDER BY id)) h FROM clients`)).rows[0].h;
const livro = async () => (await pool.query(`SELECT to_regclass('cliente_nivel_migracao') t`)).rows[0].t
  ? (await pool.query(`SELECT * FROM cliente_nivel_migracao ORDER BY client_id`)).rows : null;

beforeAll(async () => { pool = (await import("@workspace/db")).pool; }, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(recriar);

describe("migracao dos niveis do cliente", () => {
  it("converte so bronze; ambiguos ficam preservados e marcados; novos nomes nao sao tocados", async () => {
    const hashAntes = await outrasColunas();
    await pool.query(subir);
    expect(await planos()).toEqual({
      A1: "prata", A2: "prata", A3: "prata", A4: "prata", // bronze (inclui inativo e apagado) -> prata
      A5: "legado:prata", A6: "legado:ouro", A7: "legado:rodio", A8: "legado:platina", A9: "legado:noir",
      A10: "legado:Bronze ", // variante nao reconhecida: preservada, nunca adivinhada
      A11: "platinum", A12: "diamond",
      B1: "prata", B2: "legado:ouro", B3: "legado:rodio",
    });
    expect(await outrasColunas()).toBe(hashAntes); // nada alem de plano muda (classificacao, status, empresa, datas)
    const padrao = (await pool.query(`SELECT column_default d FROM information_schema.columns WHERE table_name='clients' AND column_name='plano'`)).rows[0].d;
    expect(padrao).toContain("prata");
  });

  it("o livro registra cada linha alterada com a clinica de origem e o motivo", async () => {
    await pool.query(subir);
    const l = (await livro())!;
    expect(l).toHaveLength(13); // 15 clientes menos platinum e diamond
    const porMotivo = (m: string, emp: number) => l.filter((r: any) => r.motivo === m && r.empresa_id === emp).length;
    expect(porMotivo("entrada_bronze_para_prata", 1)).toBe(4);
    expect(porMotivo("entrada_bronze_para_prata", 2)).toBe(1);
    expect(porMotivo("sem_equivalencia_segura_preservado", 1)).toBe(6);
    expect(porMotivo("sem_equivalencia_segura_preservado", 2)).toBe(2);
    for (const r of l) {
      const c = (await pool.query(`SELECT empresa_id FROM clients WHERE id=$1`, [r.client_id])).rows[0];
      expect(r.empresa_id).toBe(c.empresa_id); // isolamento: o livro nunca mistura clinicas
    }
  });

  it("repeticao nao muda nada, nem reinterpreta prata novo como antigo", async () => {
    await pool.query(subir);
    // a equipe define niveis novos depois da migracao
    await pool.query(`UPDATE clients SET plano='prata' WHERE name='A6'; UPDATE clients SET plano='diamond' WHERE name='B2'`);
    const antes = await planos();
    const livroAntes = await livro();
    await pool.query(subir);
    await pool.query(subir);
    expect(await planos()).toEqual(antes);
    expect(await livro()).toEqual(livroAntes);
    // cliente novo criado com o padrao nasce prata e continua prata
    await pool.query(`INSERT INTO clients (empresa_id, name, status) VALUES (1,'Novo','active')`);
    await pool.query(subir);
    expect((await planos()).Novo).toBe("prata");
  });

  it("rollback sem alteracoes posteriores restaura o estado original e permite migrar de novo", async () => {
    const original = await planos();
    const hash = await outrasColunas();
    await pool.query(subir);
    const migrado = await planos();
    await pool.query(descer);
    expect(await planos()).toEqual(original);
    expect(await outrasColunas()).toBe(hash);
    expect(await livro()).toBeNull();
    const padrao = (await pool.query(`SELECT column_default d FROM information_schema.columns WHERE table_name='clients' AND column_name='plano'`)).rows[0].d;
    expect(padrao).toContain("bronze");
    await pool.query(descer); // repetir o rollback tambem e seguro
    expect(await planos()).toEqual(original);
    await pool.query(subir);
    expect(await planos()).toEqual(migrado); // ida e volta e deterministica
  });

  it("rollback parcial nao sobrescreve o que a equipe alterou depois e preserva o livro", async () => {
    await pool.query(subir);
    await pool.query(`UPDATE clients SET plano='diamond' WHERE name='A6'; UPDATE clients SET plano='ouro' WHERE name='A1'`);
    await pool.query(descer);
    const p = await planos();
    expect(p.A6).toBe("diamond"); // escolhido pela equipe: mantido
    expect(p.A1).toBe("ouro");    // idem
    expect(p.A2).toBe("bronze");  // nao alterado depois: restaurado
    expect(p.A7).toBe("rodio");
    expect(p.A11).toBe("platinum"); expect(p.A12).toBe("diamond");
    const l = (await livro())!;
    expect(l.map((r: any) => r.client_id).length).toBe(2); // so as linhas nao restauradas ficam para conferencia
  });

  it("transacao do rollback e atomica: falha no meio nao deixa estado pela metade", async () => {
    await pool.query(subir);
    const antes = await planos();
    const quebrado = descer.replace("UPDATE clients c", "UPDATE clients_inexistente c");
    await expect(pool.query(quebrado)).rejects.toThrow();
    await pool.query("ROLLBACK").catch(() => {});
    expect(await planos()).toEqual(antes);
    expect(await livro()).not.toBeNull();
  });
});
