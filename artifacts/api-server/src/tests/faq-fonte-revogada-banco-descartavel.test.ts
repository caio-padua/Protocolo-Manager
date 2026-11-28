/** Regressão: resposta editada NÃO sobrevive a fonte revogada. Banco isolado, dados sintéticos. */
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { bancoAtendimentoIsolado } from "./helpers/pg-atendimento-isolado";
const h = vi.hoisted(() => ({ pg: null as any, db: null as any }));
vi.mock("@workspace/db", () => ({ pool: { query: (...a: any[]) => h.pg.query(...a) }, db: { execute: (...a: any[]) => h.db.execute(...a) } }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { migrarTabelasTelegramAprendiz, buscarFaqAprendida } from "../lib/telegram-aprendiz";
import { fonteAtendimentoAindaAutorizada } from "../lib/atendimento-resposta-autorizada";
let banco: Awaited<ReturnType<typeof bancoAtendimentoIsolado>>;
beforeAll(async () => {
  banco = await bancoAtendimentoIsolado(); h.pg = banco.pool; h.db = banco.db;
  await h.pg.query(`CREATE TABLE orientacoes_aprovadas(id SERIAL PRIMARY KEY,empresa_id INTEGER,tema TEXT,resposta TEXT,status TEXT,categoria TEXT,subcategoria TEXT)`);
  await h.pg.query(`CREATE TABLE telegram_atendimento(cliente_id INTEGER PRIMARY KEY,modo TEXT,motivo TEXT,alterado_por INTEGER)`);
  await migrarTabelasTelegramAprendiz(h.db);
}, 60000);
afterAll(async () => { await banco?.fechar(); });

let seq = 0;
async function faq(empresa: number, status: string, editada: boolean, respostaOrient = "Resposta aprovada original.") {
  const n = ++seq;
  const o = await h.pg.query(`INSERT INTO orientacoes_aprovadas(empresa_id,tema,resposta,status) VALUES($1,'t',$2,$3) RETURNING id`, [empresa, respostaOrient, status]);
  const f = await h.pg.query(
    `INSERT INTO telegram_faq_aprendidas(empresa_id,pergunta,pergunta_normalizada,resposta,resposta_fonte,resposta_editada,orientacao_id)
     VALUES($1,'Como funciona o app?',$2,'Resposta editada pela equipe.','Resposta aprovada original.',$3,$4) RETURNING id`,
    [empresa, `como funciona o app ${n}`, editada, o.rows[0].id]);
  return { orientacao: o.rows[0].id as number, faq: f.rows[0].id as number, norm: `como funciona o app ${n}` };
}

describe("fonte revogada e resposta editada", () => {
  it("editada com fonte aprovada continua valendo", async () => {
    const x = await faq(5, "aprovada", true, "Fonte mudou depois da edição.");
    expect(await buscarFaqAprendida(5, x.norm)).not.toBeNull();
  });
  it("editada com fonte revogada deixa de ser usada", async () => {
    const x = await faq(5, "revogada", true);
    expect(await buscarFaqAprendida(5, x.norm)).toBeNull();
  });
  it("não editada com fonte alterada deixa de ser usada", async () => {
    const x = await faq(5, "aprovada", false, "Fonte diferente.");
    expect(await buscarFaqAprendida(5, x.norm)).toBeNull();
  });
  it("autorização de saída revalida: fonte revogada depois do planejamento bloqueia o envio", async () => {
    const x = await faq(5, "aprovada", true);
    await h.pg.query(`UPDATE orientacoes_aprovadas SET status='revogada' WHERE id=$1`, [x.orientacao]);
    const ok = await fonteAtendimentoIsolada(x.faq);
    expect(ok).toBe(false);
  });
  it("outra clínica nunca enxerga a pergunta aprendida", async () => {
    const x = await faq(5, "aprovada", true);
    expect(await buscarFaqAprendida(6, x.norm)).toBeNull();
  });
});

async function fonteAtendimentoIsolada(faqId: number) {
  return fonteAtendimentoAindaAutorizada(
    h.db,
    { inboxMessageId: 1, empresaId: 5, clienteId: 1, clienteNome: "S", chatId: "x", texto: "q", canal: "telegram" } as any,
    { faqId, resposta: "Resposta editada pela equipe.", orientacaoId: null, caminhoResolucao: "cardapio" } as any,
    false,
  );
}
