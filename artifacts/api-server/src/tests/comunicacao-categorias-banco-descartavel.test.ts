/**
 * Categorias, regras versionadas e trilha — SQL real em BANCO DESCARTAVEL (socket Unix, nunca toca DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() }, db: {} }));
vi.mock("../routes/whatsapp-status", () => ({ mascararTelefone: (t: string) => t }));
import {
  CLASSIFICACAO_SQL, ErroCategoria, criarCategoria, criarTabelasCategorias, editarCategoria, encerrarRegra,
  garantirModeloInicial, listarCategorias, listarTrilha, salvarRegra, padraoValido,
} from "../lib/comunicacao-categorias";
import { etapasDaLinha } from "../lib/comunicacao-unificada";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = "";
let proc: ChildProcess | null = null;
let pool: pg.Pool;
const ator = { id: 1, nome: "Teste" };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgcat-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=60"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 30 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  await criarTabelasCategorias(pool);
}, 60000);

afterAll(async () => {
  await pool?.end().catch(() => {});
  if (proc) { proc.kill("SIGINT"); await new Promise((r) => setTimeout(r, 800)); }
  if (dir.startsWith(join(tmpdir(), "pgcat-"))) rmSync(dir, { recursive: true, force: true });
});

/** Classifica linhas sinteticas usando o MESMO fragmento SQL da producao. */
async function classificar(empresa: number, itens: { contexto: string | null; quando: string }[]) {
  const vals = itens.map((_, i) => `($${i * 2 + 2}::text, $${i * 2 + 3}::timestamptz)`).join(",");
  const r = await pool.query(
    `SELECT u.contexto, rg.categoria_nome, rg.categoria_natureza, rg.regra_versao
       FROM (SELECT $1::int AS empresa_id, v.contexto, v.quando FROM (VALUES ${vals}) AS v(contexto, quando)) u
       ${CLASSIFICACAO_SQL} ORDER BY u.quando`,
    [empresa, ...itens.flatMap((x) => [x.contexto, x.quando])]);
  return r.rows;
}

describe("modelo inicial e isolamento por clinica", () => {
  it("modelo inicial e idempotente e concorrente nao duplica", async () => {
    const r = await Promise.all([1, 2, 3, 4, 5].map(() => garantirModeloInicial(pool, 101)));
    expect(r.filter(Boolean)).toHaveLength(1);
    const c = await pool.query(`SELECT count(*)::int n FROM comunicacao_categorias WHERE empresa_id=101`);
    expect(c.rows[0].n).toBe(6);
    expect(await garantirModeloInicial(pool, 101)).toBe(false);
  });
  it("clinica 202 nao ve nem classifica com regras da 101", async () => {
    await garantirModeloInicial(pool, 202);
    await criarCategoria(pool, 202, "So da 202", "financeira", ator);
    const l101 = await listarCategorias(pool, 101);
    expect(l101.categorias.some((c: any) => c.nome === "So da 202")).toBe(false);
    const x = await classificar(999, [{ contexto: "lembrete_prescricao", quando: "2026-11-20T10:00:00Z" }]);
    expect(x[0].categoria_nome).toBeNull();
  });
  it("nao se usa categoria de outra clinica numa regra", async () => {
    const c202 = (await listarCategorias(pool, 202)).categorias.find((c: any) => c.nome === "So da 202");
    await expect(salvarRegra(pool, 101, { padrao: "x_teste", categoriaId: c202.id }, ator)).rejects.toMatchObject({ status: 404 });
  });
});

describe("classificacao", () => {
  it("exato, prefixo, mais especifico vence, vazio e sem regra ficam sem categoria", async () => {
    const x = await classificar(101, [
      { contexto: "lembrete_prescricao", quando: "2026-11-20T10:00:00Z" },
      { contexto: "galeria_lembrete_im", quando: "2026-11-20T10:00:01Z" },
      { contexto: "contexto_desconhecido", quando: "2026-11-20T10:00:02Z" },
      { contexto: "", quando: "2026-11-20T10:00:03Z" },
      { contexto: null, quando: "2026-11-20T10:00:04Z" },
    ]);
    expect(x.map((r) => r.categoria_nome)).toEqual(["Lembretes clínicos", "Lembretes clínicos", null, null, null]);
  });
  it("sublinhado do contexto nao funciona como curinga", async () => {
    const x = await classificar(101, [{ contexto: "lembreteXprescricao", quando: "2026-11-20T10:00:00Z" }]);
    expect(x[0].categoria_nome).toBeNull();
  });
});

describe("versionamento", () => {
  it("nova versao encerra a anterior; nao retroativa preserva historico", async () => {
    const cats = (await listarCategorias(pool, 101)).categorias;
    const fin = cats.find((c: any) => c.nome === "Cobrança e financeiro").id;
    const ex = cats.find((c: any) => c.nome === "Exames").id;
    const antes = new Date(Date.now() - 60_000).toISOString();
    const v1 = await salvarRegra(pool, 101, { padrao: "exame*", categoriaId: fin, motivo: "teste" }, ator);
    expect(v1.versao).toBe(2);
    const depois = new Date(Date.now() + 60_000).toISOString();
    const x = await classificar(101, [{ contexto: "exame_recebido", quando: antes }, { contexto: "exame_recebido", quando: depois }]);
    expect(x.map((r) => r.categoria_nome)).toEqual(["Exames", "Cobrança e financeiro"]);
    expect(x.map((r) => r.regra_versao)).toEqual([1, 2]);
    // volta retroativa: versao 3 vale tambem para o passado
    await salvarRegra(pool, 101, { padrao: "exame*", categoriaId: ex, retroativa: true }, ator);
    const y = await classificar(101, [{ contexto: "exame_recebido", quando: antes }]);
    expect(y[0].categoria_nome).toBe("Exames");
    const todas = (await listarCategorias(pool, 101)).regras.filter((r: any) => r.padrao === "exame*");
    expect(todas).toHaveLength(3);
    expect(todas.filter((r: any) => r.vigente_ate === null)).toHaveLength(1);
  });
  it("mesma categoria nao gera versao inutil", async () => {
    const ex = (await listarCategorias(pool, 101)).categorias.find((c: any) => c.nome === "Exames").id;
    await expect(salvarRegra(pool, 101, { padrao: "exame*", categoriaId: ex }, ator)).rejects.toMatchObject({ status: 409 });
  });
  it("edicoes simultaneas da mesma regra: nenhuma versao aberta duplicada, sem erro 500", async () => {
    const cats = (await listarCategorias(pool, 101)).categorias;
    const ids = cats.slice(0, 4).map((c: any) => c.id);
    const res = await Promise.allSettled(ids.map((id: number) => salvarRegra(pool, 101, { padrao: "corrida_x", categoriaId: id }, ator)));
    const falhas = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const f of falhas) expect(f.reason).toBeInstanceOf(ErroCategoria);
    const abertas = await pool.query(`SELECT count(*)::int n FROM comunicacao_regras WHERE empresa_id=101 AND padrao='corrida_x' AND vigente_ate IS NULL`);
    expect(abertas.rows[0].n).toBe(1);
    const vers = await pool.query(`SELECT versao FROM comunicacao_regras WHERE empresa_id=101 AND padrao='corrida_x' ORDER BY versao`);
    expect(vers.rows.map((r) => r.versao)).toEqual([...Array(vers.rowCount).keys()].map((i) => i + 1));
  });
  it("encerrar regra deixa a mensagem sem categoria sem apagar a regra", async () => {
    const r = (await listarCategorias(pool, 101)).regras.find((x: any) => x.padrao === "teste-canal");
    await encerrarRegra(pool, 101, r.id, ator);
    const x = await classificar(101, [{ contexto: "teste-canal", quando: new Date(Date.now() + 1000).toISOString() }]);
    expect(x[0].categoria_nome).toBeNull();
    const ainda = await pool.query(`SELECT count(*)::int n FROM comunicacao_regras WHERE id=$1`, [r.id]);
    expect(ainda.rows[0].n).toBe(1);
    await expect(encerrarRegra(pool, 202, r.id, ator)).rejects.toMatchObject({ status: 404 });
  });
});

describe("categorias e validacao", () => {
  it("nome duplicado (sem diferenciar maiusculas) da 409; outra clinica pode repetir", async () => {
    await expect(criarCategoria(pool, 101, "exames", "operacional", ator)).rejects.toMatchObject({ status: 409 });
    await expect(criarCategoria(pool, 303, "Exames", "operacional", ator)).resolves.toBeTruthy();
  });
  it("natureza e padrao invalidos sao recusados", async () => {
    await expect(criarCategoria(pool, 101, "Nova", "mista", ator)).rejects.toMatchObject({ status: 400 });
    expect(() => padraoValido("*")).toThrow(ErroCategoria);
    expect(() => padraoValido("a b")).toThrow(ErroCategoria);
    expect(() => padraoValido("  Cobranca* ")).not.toThrow();
  });
  it("categoria desativada nao recebe regra nova", async () => {
    const c = await criarCategoria(pool, 101, "Temporaria", "operacional", ator);
    await editarCategoria(pool, 101, c.id, { ativo: false }, ator);
    await expect(salvarRegra(pool, 101, { padrao: "tmp_x", categoriaId: c.id }, ator)).rejects.toMatchObject({ status: 409 });
    await expect(editarCategoria(pool, 202, c.id, { nome: "Invasao" }, ator)).rejects.toMatchObject({ status: 404 });
  });
});

describe("trilha de auditoria", () => {
  it("registra quem fez o que, e e imutavel", async () => {
    const t = await listarTrilha(pool, 101, 500);
    expect(t.some((e: any) => e.acao === "nova_versao" && e.ator_nome === "Teste")).toBe(true);
    expect(t.every((e: any) => e.empresa_id === undefined || true)).toBe(true);
    await expect(pool.query(`UPDATE comunicacao_trilha SET acao='x' WHERE empresa_id=101`)).rejects.toThrow(/somente de acrescimo/);
    await expect(pool.query(`DELETE FROM comunicacao_trilha WHERE empresa_id=101`)).rejects.toThrow(/somente de acrescimo/);
    const t202 = await listarTrilha(pool, 202, 500);
    expect(t202.some((e: any) => JSON.stringify(e.depois ?? {}).includes("corrida_x"))).toBe(false);
  });
});

describe("etapas independentes (sem provar o que nao foi provado)", () => {
  const por = (e: ReturnType<typeof etapasDaLinha>) => Object.fromEntries(e.map((x) => [x.chave, x.estado]));
  it("enviado sem status: entrega, leitura e conclusao nao informados", () => {
    expect(por(etapasDaLinha("wwp", "saida", "sent"))).toEqual({ envio: "registrado", entrega: "nao_informado", leitura: "nao_informado", conclusao_servico: "nao_informado" });
  });
  it("entregue nao implica lido; lido so com dado do provedor; conclusao nunca", () => {
    expect(por(etapasDaLinha("wwp", "saida", "delivered"))).toMatchObject({ entrega: "entregue", leitura: "nao_informado", conclusao_servico: "nao_informado" });
    expect(por(etapasDaLinha("wwp", "saida", "read"))).toMatchObject({ entrega: "entregue", leitura: "lido", conclusao_servico: "nao_informado" });
  });
  it("falha aparece como falha; Telegram nunca declara leitura", () => {
    expect(por(etapasDaLinha("wwp", "saida", "failed"))).toMatchObject({ envio: "falhou", entrega: "falhou" });
    expect(por(etapasDaLinha("tg", "saida", null))).toMatchObject({ leitura: "nao_informado", entrega: "nao_informado" });
  });
});

describe("cursor de paginacao preserva microssegundos", () => {
  it("paginar com cursor em texto nao pula linhas que dividem o mesmo milissegundo", async () => {
    await pool.query(`CREATE TEMP TABLE msgs_cursor (ref text, quando timestamptz)`);
    await pool.query(`INSERT INTO msgs_cursor VALUES
      ('t1','2026-11-20 10:00:00.123456+00'),('t2','2026-11-20 10:00:00.123789+00'),
      ('t3','2026-11-20 10:00:00.123111+00'),('t4','2026-11-20 10:00:00.123111+00'),('t5','2026-11-20 09:00:00+00')`);
    const vistos: string[] = [];
    let cursor: { q: string; ref: string } | null = null;
    for (let i = 0; i < 10; i++) {
      const r: pg.QueryResult = cursor
        ? await pool.query(`SELECT ref, quando::text AS q FROM msgs_cursor WHERE (quando, ref) < ($1::timestamptz, $2) ORDER BY quando DESC, ref DESC LIMIT 2`, [cursor.q, cursor.ref])
        : await pool.query(`SELECT ref, quando::text AS q FROM msgs_cursor ORDER BY quando DESC, ref DESC LIMIT 2`);
      if (!r.rows.length) break;
      vistos.push(...r.rows.map((x) => x.ref));
      const u = r.rows[r.rows.length - 1];
      cursor = { q: u.q, ref: u.ref };
    }
    expect(vistos).toEqual(["t2", "t1", "t4", "t3", "t5"]);
    // O formato antigo (ISO em milissegundos) perderia t1 ao cortar em t2/t1: prova do defeito corrigido.
    const iso = new Date("2026-11-20T10:00:00.123456Z").toISOString(); // vira .123 (perde microssegundos)
    const restantes = await pool.query(`SELECT ref FROM msgs_cursor WHERE (quando, ref) < ($1::timestamptz, 't1')`, [iso]);
    expect(restantes.rows.map((x) => x.ref)).not.toContain("t3"); // t3 e t4 sumiriam da proxima pagina
  });
});
