/** Privacidade, isolamento e licenças da Base Global. Banco isolado, dados sintéticos. */
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { bancoAtendimentoIsolado } from "./helpers/pg-atendimento-isolado";
const h = vi.hoisted(() => ({ pg: null as any, db: null as any }));
vi.mock("@workspace/db", () => ({ pool: { query: (...a: any[]) => h.pg.query(...a) }, db: { execute: (...a: any[]) => h.db.execute(...a) } }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { migrarTabelasTelegramAprendiz } from "../lib/telegram-aprendiz";
import {
  migrarBaseGlobal, limparVariacaoParaBaseGlobal, criarIntencaoGlobal, definirLicenca,
  promoverVariacaoParaBaseGlobal, consultarIntencaoGlobal, alterarEstadoGlobal, painelBaseGlobal,
} from "../lib/base-global-intencoes";
let banco: Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
beforeAll(async () => {
  process.env.SESSION_SECRET ??= "segredo-de-teste";
  banco = await bancoAtendimentoIsolado(); h.pg = banco.pool; h.db = banco.db;
  await h.pg.query(`CREATE TABLE orientacoes_aprovadas(id SERIAL PRIMARY KEY,empresa_id INTEGER);
    CREATE TABLE telegram_atendimento(cliente_id INTEGER PRIMARY KEY);
    CREATE TABLE empresas(id INTEGER PRIMARY KEY,nome TEXT); INSERT INTO empresas VALUES (5,'Clínica A'),(6,'Clínica B')`);
  await migrarTabelasTelegramAprendiz(h.db); await migrarBaseGlobal(h.db);
  await criarIntencaoGlobal({ chave: "estacionamento", tronco: "recepcao", ramo: "clinica", descricao: "t", por: "teste" }, h.db);
}, 60000);
afterAll(async () => { await banco?.fechar(); });

async function inedita(empresa: number, pergunta: string) {
  const r = await h.pg.query(`INSERT INTO atendimento_perguntas_ineditas(empresa_id,canal,pergunta,pergunta_normalizada,tronco,ramo)
    VALUES($1,'whatsapp',$2,$3,'recepcao','clinica') RETURNING id`, [empresa, pergunta, pergunta.toLowerCase() + Math.random()]);
  return Number(r.rows[0].id);
}

describe("limpeza recusa em vez de remendar", () => {
  const recusas: Array<[string, string]> = [
    ["Meu CPF 123.456.789-09 está certo", "contem_numero"],
    ["Mandem para joao@email.com por favor", "contem_endereco_digital"],
    ["Quem atende é a Mariana Souza hoje", "possivel_nome_proprio"],
    ["Qual a dose do remédio para dormir", "termo_clinico"],
    ["Quanto é o valor da consulta", "termo_sensivel"],
    ["Oi", "curto_demais"],
  ];
  it.each(recusas)("recusa %s", (t, motivo) => {
    const r = limparVariacaoParaBaseGlobal(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe(motivo);
  });
  it("aceita variação genérica e devolve só texto normalizado", () => {
    const r = limparVariacaoParaBaseGlobal("Vocês têm estacionamento no local?");
    expect(r).toEqual({ ok: true, texto: "voces tem estacionamento no local" });
  });
});

describe("promoção e consumo", () => {
  it("sem licença de contribuição a promoção é recusada e auditada", async () => {
    const id = await inedita(5, "Vocês têm estacionamento no local?");
    expect(await promoverVariacaoParaBaseGlobal({ empresaId: 5, perguntaInedita: id, intencaoChave: "estacionamento", por: "t" }, h.db))
      .toEqual({ ok: false, motivo: "clinica_sem_autorizacao_de_contribuicao" });
    const a = await h.pg.query(`SELECT resultado FROM base_global_auditoria WHERE acao='promocao' ORDER BY id DESC LIMIT 1`);
    expect(a.rows[0].resultado).toBe("recusado");
  });
  it("com licença, grava só a variação limpa; origem fica em hash e sem texto de conversa", async () => {
    await definirLicenca({ empresaId: 5, contribui: true, consome: false, por: "t" }, h.db);
    const id = await inedita(5, "Vocês têm estacionamento no local?");
    const r = await promoverVariacaoParaBaseGlobal({ empresaId: 5, perguntaInedita: id, intencaoChave: "estacionamento", por: "t" }, h.db);
    expect(r.ok).toBe(true);
    const v = await h.pg.query(`SELECT texto FROM base_global_variacoes`);
    expect(v.rows.map((x: any) => x.texto)).toContain("voces tem estacionamento no local");
    const o = await h.pg.query(`SELECT origem_hash FROM base_global_origens`);
    expect(o.rows[0].origem_hash).toMatch(/^[0-9a-f]{64}$/);
    const tudo = JSON.stringify((await painelBaseGlobal(h.db)));
    expect(tudo).not.toContain(o.rows[0].origem_hash);
  });
  it("pergunta com dado pessoal não é promovida, mesmo com licença", async () => {
    const id = await inedita(5, "Meu telefone 11987654321 tem estacionamento?");
    const r = await promoverVariacaoParaBaseGlobal({ empresaId: 5, perguntaInedita: id, intencaoChave: "estacionamento", por: "t" }, h.db);
    expect(r.ok).toBe(false);
    expect((await h.pg.query(`SELECT count(*)::int n FROM base_global_variacoes`)).rows[0].n).toBe(1);
  });
  it("clínica não promove pergunta de outra clínica", async () => {
    await definirLicenca({ empresaId: 6, contribui: true, consome: false, por: "t" }, h.db);
    const idA = await inedita(5, "Vocês aceitam agendar pelo aplicativo?");
    const r = await promoverVariacaoParaBaseGlobal({ empresaId: 6, perguntaInedita: idA, intencaoChave: "estacionamento", por: "t" }, h.db);
    expect(r).toEqual({ ok: false, motivo: "pergunta_nao_encontrada_nesta_clinica" });
  });
  it("só clínica licenciada para consumir recebe a intenção; consumo é contado; desativar corta", async () => {
    expect(await consultarIntencaoGlobal(6, "Vocês têm estacionamento no local?", h.db)).toBeNull();
    await definirLicenca({ empresaId: 6, contribui: false, consome: true, por: "t" }, h.db);
    const g = await consultarIntencaoGlobal(6, "Vocês têm estacionamento no local?", h.db);
    expect(g?.chave).toBe("estacionamento");
    expect((await h.pg.query(`SELECT usos FROM base_global_consumos WHERE empresa_id=6`)).rows[0].usos).toBe("1");
    const vid = (await h.pg.query(`SELECT id FROM base_global_variacoes LIMIT 1`)).rows[0].id;
    await alterarEstadoGlobal({ tipo: "variacao", id: Number(vid), ativa: false, por: "t" }, h.db);
    expect(await consultarIntencaoGlobal(6, "Vocês têm estacionamento no local?", h.db)).toBeNull();
  });
  it("consulta com dado pessoal nunca chega à base", async () => {
    expect(await consultarIntencaoGlobal(6, "Meu cpf 12345678909 estacionamento", h.db)).toBeNull();
  });
});
