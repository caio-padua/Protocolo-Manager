import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ pool: null as any }));
vi.mock("@workspace/db", () => ({ get pool() { return state.pool; }, get db() { return null; } }));

import { aplicarAgora, formarPreco, referenciaDe, salvarConfiguracao, PARAMETROS_ZERO, validarConfiguracao, ErroPrecificacao } from "../lib/precificacao";
import { consumirAplicacao, liberarReservaProtocolo, reservarProtocolo, saldosPorSubstancia } from "../lib/estoque-reserva";
import { baixarEstoqueDaAplicacao, reservarEstoqueDoProtocolo } from "../lib/estoque-ganchos";

let banco: Awaited<ReturnType<typeof startIsolatedPostgres>>;
let db: any;
const migracao = (n: string) => readFileSync(new URL(`../../../../lib/db/migrations/${n}`, import.meta.url), "utf8");
const q = (s: string, p: unknown[] = []) => state.pool.query(s, p);

beforeAll(async () => {
  banco = await startIsolatedPostgres();
  state.pool = banco.pool;
  db = drizzle(state.pool);
  await q(`
    CREATE TABLE empresas(id integer PRIMARY KEY);
    INSERT INTO empresas VALUES (1),(2);
    CREATE TABLE professionals(id integer PRIMARY KEY);
    CREATE TABLE substances(id integer PRIMARY KEY, name text, via_uso text, price_per_unit real DEFAULT 0);
    INSERT INTO substances VALUES (10,'Coenzima Q10','IM',0),(11,'Vitamina C','SC',0);
    CREATE TABLE budget_catalog(id serial PRIMARY KEY, name text, unit_price_cents integer NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true, substance_id integer, updated_at timestamptz DEFAULT now());
    INSERT INTO budget_catalog(name, unit_price_cents, substance_id) VALUES ('Coenzima', 1, 10);
    CREATE TABLE stock_items(id serial PRIMARY KEY, substance_id integer NOT NULL, quantity real NOT NULL DEFAULT 0,
      unit text NOT NULL DEFAULT 'amp', minimum_stock real NOT NULL DEFAULT 0, lot text, expiration_date text,
      empresa_id integer, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE protocols(id serial PRIMARY KEY, empresa_id integer, client_id integer);
    CREATE TABLE protocol_items(id serial PRIMARY KEY, protocol_id integer, substance_id integer, total_sessions integer, completed_sessions integer DEFAULT 0);
    CREATE TABLE sessions(id serial PRIMARY KEY, protocol_id integer, empresa_id integer);
    CREATE TABLE substance_applications(id serial PRIMARY KEY, session_id integer, substance_id integer, status text DEFAULT 'pending');
  `);
  await q(migracao("20261111-fornecedores-cadastrados.sql"));
  await q(migracao("20261111-substance-variantes.sql"));
  await q(migracao("20261119-precificacao-estoque.sql"));
  await q(migracao("20261119-precificacao-estoque.sql")); // idempotente
  await q(`INSERT INTO fornecedores_cadastrados(empresa_id,nome) VALUES (1,'Lab A'),(1,'Lab B')`);
  await q(`INSERT INTO substance_variantes(empresa_id,substance_id,dose_total,forma,vias_fonte) VALUES (1,10,'100 mg','ampola','IM'),(1,11,'500 mg','ampola','SC')`);
  const of = (v: number, f: number, pos: number, c: number) => q(
    `INSERT INTO substance_ofertas(empresa_id,variante_id,fornecedor_id,posicao,origem_chave,documento,pagina,linha,embalagem_original,fonte_texto,quantidade_embalagem,custo_unitario_centavos,custo_embalagem_centavos)
     VALUES (1,$1,$2,$3,$4,'doc',1,1,'cx','t',1,$5,$5)`, [v, f, pos, `k${v}-${f}`, c]);
  await of(1, 1, 1, 10000); await of(1, 2, 2, 8000); await of(2, 1, 1, 5000);
}, 90_000);
afterAll(async () => { if (banco) await banco.stop(); }, 60_000);

describe("fórmula do preço", () => {
  it("margem sobre a venda, frete e perda sobre o custo", () => {
    expect(formarPreco(10000, 50, PARAMETROS_ZERO)!.venda).toBe(20000);
    const f = formarPreco(10000, 40, { ...PARAMETROS_ZERO, fretePct: 10, impostosPct: 10 })!;
    expect(f.venda).toBe(22000);
    expect(f.margemReal).toBeCloseTo(40, 5);
    expect(formarPreco(10000, 10, { ...PARAMETROS_ZERO, arredondamento: "90" })!.venda % 100).toBe(90);
  });
  it("recusa inviável e referência vazia, sem inventar número", () => {
    expect(formarPreco(10000, 90, { ...PARAMETROS_ZERO, impostosPct: 10 })).toBeNull();
    expect(formarPreco(0, 10, PARAMETROS_ZERO)).toBeNull();
    expect(referenciaDe([], "maior")).toBeNull();
    const cs = [{ custoUnitarioCentavos: 8000 }, { custoUnitarioCentavos: 10000 }];
    expect([referenciaDe(cs, "maior"), referenciaDe(cs, "menor"), referenciaDe(cs, "media")]).toEqual([10000, 8000, 9000]);
  });
  it("valida a configuração recebida", () => {
    expect(() => validarConfiguracao({ parametros: { ...PARAMETROS_ZERO, fretePct: 99 }, categorias: [] })).toThrow(ErroPrecificacao);
    expect(() => validarConfiguracao({ parametros: PARAMETROS_ZERO, categorias: [{ categoria: "XX", margemPct: 1, modo: "auto" }] })).toThrow(ErroPrecificacao);
  });
});

describe("publicação de preço", () => {
  const cfg = (modo: "auto" | "congelado", margem: number) => ({
    parametros: PARAMETROS_ZERO,
    categorias: (["IM", "SC", "IMPLANTE", "OUTRAS", "SEM_VIA"] as const).map((categoria) => ({ categoria, margemPct: margem, modo })),
  });
  it("congelado não mexe em Orçamento nem Substâncias", async () => {
    await salvarConfiguracao(state.pool, 1, null, cfg("congelado", 50));
    expect((await q(`SELECT unit_price_cents FROM budget_catalog`)).rows[0].unit_price_cents).toBe(1);
    expect((await q(`SELECT count(*)::int n FROM preco_publicado`)).rows[0].n).toBe(0);
  });
  it("aplicar agora publica e leva ao Orçamento e às Substâncias com histórico", async () => {
    const r = await aplicarAgora(state.pool, 1, null, ["IM"]);
    expect(r.publicadas).toBe(1);
    expect((await q(`SELECT unit_price_cents FROM budget_catalog`)).rows[0].unit_price_cents).toBe(20000);
    expect((await q(`SELECT price_per_unit FROM substances WHERE id=10`)).rows[0].price_per_unit).toBe(200);
    const h = await q(`SELECT alvo, antes_centavos, depois_centavos FROM preco_publicado_historico ORDER BY id`);
    expect(h.rows.map((x: any) => x.alvo)).toEqual(["matriz", "orcamento", "substancia"]);
    expect(h.rows[1]).toMatchObject({ antes_centavos: 1, depois_centavos: 20000 });
    expect((await q(`SELECT 1 FROM preco_publicado WHERE variante_id=2`)).rowCount).toBe(0); // SC continua congelada
  });
  it("auto acompanha a margem; repetir não duplica histórico", async () => {
    await salvarConfiguracao(state.pool, 1, null, { ...cfg("auto", 60) });
    expect((await q(`SELECT unit_price_cents FROM budget_catalog`)).rows[0].unit_price_cents).toBe(25000);
    const antes = (await q(`SELECT count(*)::int n FROM preco_publicado_historico`)).rows[0].n;
    await salvarConfiguracao(state.pool, 1, null, { ...cfg("auto", 60) });
    expect((await q(`SELECT count(*)::int n FROM preco_publicado_historico`)).rows[0].n).toBe(antes);
  });
  it("outra clínica não enxerga nem publica", async () => {
    const r = await aplicarAgora(state.pool, 2, null, ["IM"]);
    expect(r.publicadas).toBe(0);
  });
});

describe("estoque estático e dinâmico", () => {
  let protocolId: number; let apps: number[] = [];
  beforeAll(async () => {
    await q(`INSERT INTO stock_items(substance_id,quantity,lot,expiration_date,empresa_id) VALUES (10,6,'L-TARDE','2027-12-01',1),(10,4,'L-CEDO','2027-01-01',1)`);
    protocolId = (await q(`INSERT INTO protocols(empresa_id,client_id) VALUES (1,7) RETURNING id`)).rows[0].id;
    await q(`INSERT INTO protocol_items(protocol_id,substance_id,total_sessions) VALUES ($1,10,10)`, [protocolId]);
    const s = (await q(`INSERT INTO sessions(protocol_id,empresa_id) VALUES ($1,1) RETURNING id`, [protocolId])).rows[0].id;
    for (let i = 0; i < 3; i++) apps.push((await q(`INSERT INTO substance_applications(session_id,substance_id,status) VALUES ($1,10,'applied') RETURNING id`, [s])).rows[0].id);
  });
  const saldo = async () => (await saldosPorSubstancia(db, 1)).find((x) => x.substanciaId === 10)!;

  it("reservar 10 tira do estático e põe no dinâmico, uma vez só", async () => {
    expect(await reservarProtocolo(db, protocolId)).toEqual({ reservas: 1, unidades: 10 });
    expect(await reservarProtocolo(db, protocolId)).toEqual({ reservas: 0, unidades: 0 });
    expect(await saldo()).toMatchObject({ fisico: 10, dinamico: 10, estatico: 0, falta: 0 });
  });
  it("cada aplicação baixa 1 do dinâmico e do lote que vence primeiro, sem repetir", async () => {
    expect(await consumirAplicacao(db, apps[0])).toMatchObject({ ok: true, jaRegistrada: false, lote: "L-CEDO" });
    expect(await consumirAplicacao(db, apps[0])).toMatchObject({ ok: true, jaRegistrada: true });
    expect(await saldo()).toMatchObject({ fisico: 9, dinamico: 9, estatico: 0 });
    expect((await q(`SELECT quantity FROM stock_items WHERE lot='L-CEDO'`)).rows[0].quantity).toBe(3);
  });
  it("não consome aplicação não confirmada", async () => {
    const s = (await q(`SELECT session_id FROM substance_applications WHERE id=$1`, [apps[1]])).rows[0].session_id;
    const nova = (await q(`INSERT INTO substance_applications(session_id,substance_id,status) VALUES ($1,10,'missed') RETURNING id`, [s])).rows[0].id;
    expect(await consumirAplicacao(db, nova)).toMatchObject({ ok: false });
    expect((await saldo()).dinamico).toBe(9);
  });
  it("gancho dentro de transação: falha de estoque não derruba o registro", async () => {
    await db.transaction(async (tx: any) => {
      await baixarEstoqueDaAplicacao(tx, 999999);
      await reservarEstoqueDoProtocolo(tx, 999999);
      await baixarEstoqueDaAplicacao(tx, apps[1]);
    });
    expect((await saldo()).dinamico).toBe(8);
  });
  it("liberar devolve o que sobrou ao estático, sem mexer no físico", async () => {
    expect(await liberarReservaProtocolo(db, protocolId, 1)).toEqual({ liberadas: 1, unidades: 8 });
    expect(await liberarReservaProtocolo(db, protocolId, 1)).toEqual({ liberadas: 0, unidades: 0 });
    expect(await saldo()).toMatchObject({ fisico: 8, dinamico: 0, estatico: 8 });
  });
  it("sem lote com saldo: baixa o dinâmico mesmo assim e marca pendência", async () => {
    const p = (await q(`INSERT INTO protocols(empresa_id,client_id) VALUES (1,8) RETURNING id`)).rows[0].id;
    await q(`INSERT INTO protocol_items(protocol_id,substance_id,total_sessions) VALUES ($1,11,2)`, [p]);
    const s = (await q(`INSERT INTO sessions(protocol_id,empresa_id) VALUES ($1,1) RETURNING id`, [p])).rows[0].id;
    const a = (await q(`INSERT INTO substance_applications(session_id,substance_id,status) VALUES ($1,11,'applied') RETURNING id`, [s])).rows[0].id;
    await reservarProtocolo(db, p);
    expect(await consumirAplicacao(db, a)).toMatchObject({ ok: true, baixaFisica: false, lote: null });
    const v = (await saldosPorSubstancia(db, 1)).find((x) => x.substanciaId === 11)!;
    expect(v).toMatchObject({ fisico: 0, dinamico: 1, estatico: -1, falta: 1, semLote: 1 });
  });
});
