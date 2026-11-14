/** Atendimento por IA com SQL real em BANCO DESCARTÁVEL (socket em /tmp; nunca toca DATABASE_URL). Dados sintéticos. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const h = vi.hoisted(() => ({ db: null as any, enviados: [] as { chat: string; texto: string }[], settings: {} as Record<string, string>,
  noEnvio:null as null|((chat:string)=>Promise<void>), pg: null as any }));
vi.mock("@workspace/db", () => ({
  db: { execute: (...a: unknown[]) => h.db.execute(...a) },
  // O crédito da mensageria usa o mesmo banco descartável (Instituto, empresa 5, é isento).
  pool: { query: (...a: unknown[]) => h.pg.query(...a), connect: () => h.pg.connect() },
}));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: {} }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: async (k: string) => h.settings[k] ?? null }));
vi.mock("../lib/telegram", () => ({ sendTelegram: async (chat: string, texto: string) => { h.enviados.push({ chat, texto }); await h.noEnvio?.(chat); return { sent: true, mock: false }; } }));
vi.mock("../lib/telegram-config", () => ({ chatAlertaOuNull: async () => "ALERTA" }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: () => ({ headers: {} }) }));

import { aplicarMigracaoAtendimento, depsReaisAtendimento, pausarParaHumano, devolverParaIA, lerConfigAtendimento,
  atenderMensagemTelegram,processarAtendimentosPendentes,pausarAtendimentoDuravel } from "../lib/atendimento-telegram-store";
import { processarAtendimento } from "../lib/atendimento-telegram";

const PG_BIN = process.env.PG_BIN_DIR ?? "/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin";
let dir = ""; let proc: ChildProcess | null = null; let pool: pg.Pool;
const base = { empresaId: 5, clienteId: 1, clienteNome: "Paciente Sintetico", chatId: "C1" };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pgatend-"));
  const dados = join(dir, "dados");
  execFileSync(join(PG_BIN, "initdb"), ["-D", dados, "-A", "trust", "-U", "teste"], { stdio: "ignore" });
  proc = spawn(join(PG_BIN, "postgres"), ["-D", dados, "-c", "listen_addresses=", "-k", dir, "-c", "max_connections=60"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) { if (existsSync(join(dir, ".s.PGSQL.5432"))) break; await new Promise((r) => setTimeout(r, 250)); }
  pool = new pg.Pool({ host: dir, user: "teste", database: "postgres", max: 30 });
  for (let i = 0; i < 80; i++) { try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  await pool.query(`CREATE TABLE clients(id integer primary key,empresa_id integer,telegram_chat_id text);
    INSERT INTO clients VALUES(1,5,'C1'),(2,5,'C2'),(3,7,'C3');
    CREATE TABLE telegram_inbox_messages (id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL DEFAULT 0, cliente_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL, texto TEXT NOT NULL, recebida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), lida_em TIMESTAMPTZ, direcao TEXT NOT NULL DEFAULT 'entrada', update_id BIGINT)`);
  h.db = drizzle(pool);
  h.pg = pool;
  await aplicarMigracaoAtendimento(h.db);
  await pool.query(`INSERT INTO orientacoes_aprovadas (empresa_id,tema,perguntas_exemplo,resposta,status) VALUES
    (5,'Jejum antes do exame','preciso de jejum para exame de sangue, quantas horas de jejum','APROVADA: jejum de 8 horas.','aprovada'),
    (5,'Jejum rascunho','jejum exame sangue horas rascunho','RASCUNHO NAO PODE SAIR','rascunho'),
    (7,'Jejum outra clinica','jejum exame sangue horas de jejum','OUTRA CLINICA NAO PODE SAIR','aprovada')`);
  h.settings = { "atendimento.ia.modo": "ligado" };
}, 60000);
afterAll(async () => { await pool?.end(); proc?.kill("SIGTERM"); if (dir) rmSync(dir, { recursive: true, force: true }); });

const run = (id: number, texto: string, over: Partial<typeof base> = {}) =>
  processarAtendimento(depsReaisAtendimento(5), { ...base, ...over, inboxMessageId: id, texto });

describe("SQL real", () => {
  it("migração é idempotente", async () => { await aplicarMigracaoAtendimento(h.db); await aplicarMigracaoAtendimento(h.db); });

  it("só orientação APROVADA da PRÓPRIA empresa sai; envia, grava saída e desfecho", async () => {
    h.enviados.length = 0;
    expect(await run(101, "quantas horas de jejum para o exame de sangue?")).toBe("orientacao_enviada");
    expect(h.enviados).toEqual([{ chat: "C1", texto: "APROVADA: jejum de 8 horas." }]);
    const s = await pool.query(`SELECT direcao, texto FROM telegram_inbox_messages`);
    expect(s.rows).toEqual([{ direcao: "saida", texto: "APROVADA: jejum de 8 horas." }]);
    const r = await pool.query(`SELECT desfecho FROM telegram_atendimento_respostas WHERE inbox_message_id=101`);
    expect(r.rows[0].desfecho).toBe("orientacao_enviada");
  });

  it("20 entregas simultâneas da mesma mensagem = 1 resposta", async () => {
    h.enviados.length = 0;
    const rs = await Promise.all(Array.from({ length: 20 }, () => run(102, "quantas horas de jejum para o exame de sangue?")));
    expect(rs.filter((x) => x === "orientacao_enviada")).toHaveLength(1);
    expect(rs.filter((x) => x === "ja_tratado")).toHaveLength(19);
    expect(h.enviados.filter((e) => e.chat === "C1")).toHaveLength(1);
  });

  it("profissional assumiu = pausa; devolver à IA retoma", async () => {
    await pausarParaHumano(h.db, 1, "profissional_assumiu", 6);
    h.enviados.length = 0;
    expect(await run(103, "quantas horas de jejum para o exame de sangue?")).toBe("pausado_humano");
    expect(h.enviados).toHaveLength(0);
    await devolverParaIA(h.db, 1, 6);
    expect(await run(104, "quantas horas de jejum para o exame de sangue?")).toBe("orientacao_enviada");
  });

  it("queixa clínica pausa a IA, alerta com prioridade e não envia texto antes da revisão", async () => {
    await devolverParaIA(h.db, 2, null);
    h.enviados.length = 0;
    expect(await run(105, "passei mal depois da aplicação, muita tontura", { clienteId: 2, chatId: "C2" })).toBe("queixa_encaminhada");
    expect(h.enviados.map((e) => e.chat)).toEqual(["ALERTA"]);
    expect(h.enviados[0].texto).toMatch(/PRIORIDADE/);
    const m = await pool.query(`SELECT modo, motivo FROM telegram_atendimento WHERE cliente_id=2`);
    expect(m.rows[0]).toEqual({ modo: "humano", motivo: "queixa_clinica" });
    // próxima mensagem da mesma pessoa não recebe resposta automática (IA pausada)
    expect(await run(106, "quantas horas de jejum para o exame de sangue?", { clienteId: 2, chatId: "C2" })).toBe("pausado_humano");
  });

  it("configuração ilegível ou ausente = desligado", async () => {
    h.settings = {};
    expect((await lerConfigAtendimento()).modo).toBe("desligado");
    h.settings = { "atendimento.ia.modo": "lista", "atendimento.ia.permitidos": "{x" };
    expect((await lerConfigAtendimento()).modo).toBe("desligado");
    h.settings = { "atendimento.ia.modo": "ligado" };
  });
});

describe("consumidor real do atendimento com banco descartável e somente transporte simulado",()=>{
  const entrada=async(id:number,texto:string,cid=1,empresaId=5)=>{
    h.settings={"atendimento.ia.modo":"ligado"};h.enviados.length=0;h.noEnvio=null;
    await devolverParaIA(h.db,cid,null);
    await pool.query(`INSERT INTO telegram_inbox_messages(id,empresa_id,cliente_id,chat_id,texto,direcao)
      VALUES($1,$2,$3,$4,$5,'entrada')`,[id,empresaId,cid,`C${cid}`,texto]);
    const e={...base,inboxMessageId:id,texto,clienteId:cid,empresaId,chatId:`C${cid}`};
    await atenderMensagemTelegram(e);return e;
  };
  it("clínica sem crédito: mensagem preservada, nenhuma resposta; após recarga de teste a resposta sai e é cobrada",async()=>{
    const c=await import("../lib/mensageria-credito");
    await c.definirTarifa({empresaId:null,tipo:"recebida",valorCentavos:10,ativo:true,por:"teste"});
    await c.definirTarifa({empresaId:null,tipo:"enviada",valorCentavos:20,ativo:true,por:"teste"});
    await c.definirTarifa({empresaId:null,tipo:"solucionada",valorCentavos:50,ativo:true,por:"teste"});
    await entrada(301,"quantas horas de jejum para o exame de sangue?",3,7);
    await processarAtendimentosPendentes();await processarAtendimentosPendentes();
    expect(h.enviados.filter(x=>x.chat==="C3")).toHaveLength(0); // sem saldo: nada sai
    const preserv=await pool.query(`SELECT 1 FROM telegram_inbox_messages WHERE id=301`);
    expect(preserv.rows).toHaveLength(1); // a mensagem do cliente continua para a equipe
    expect((await pool.query(`SELECT COUNT(*)::int n FROM msg_extrato WHERE empresa_id=7`)).rows[0].n).toBe(0);
    const r=await c.solicitarRecarga(7,200,"teste","teste");
    await c.confirmarRecarga(r.id,"teste");
    await processarAtendimentosPendentes();await processarAtendimentosPendentes();
    expect(h.enviados.filter(x=>x.chat==="C3")).toHaveLength(1); // retomada: responde uma vez
    const tipos=(await pool.query(`SELECT tipo_evento FROM msg_extrato WHERE empresa_id=7 AND natureza='consumo' ORDER BY id`)).rows.map(x=>x.tipo_evento);
    expect(tipos).toEqual(["recebida","enviada","solucionada"]);
    expect(Number((await pool.query(`SELECT saldo_centavos s FROM msg_carteira WHERE empresa_id=7`)).rows[0].s)).toBe(200-80);
    // Instituto (empresa 5) continua isento e sem débito.
    expect(Number((await pool.query(`SELECT saldo_centavos s FROM msg_carteira WHERE empresa_id=5`)).rows[0].s)).toBe(0);
  });
  it("enfileira sem enviar; mesmo consumidor existente planeja, aprova e registra uma resposta",async()=>{
    await entrada(201,"quantas horas de jejum para o exame de sangue?");
    expect(h.enviados).toHaveLength(0);
    await processarAtendimentosPendentes();await processarAtendimentosPendentes();
    expect(h.enviados).toEqual([{chat:"C1",texto:"APROVADA: jejum de 8 horas."}]);
    const r=await pool.query("SELECT estado,orientacao_id FROM telegram_atendimento_respostas WHERE inbox_message_id=201");
    expect(r.rows[0]).toEqual({estado:"concluido",orientacao_id:"1"});
  });
  it("profissional assume após o alerta: não é sobrescrito e não há resposta automática",async()=>{
    await entrada(202,"dúvida sem orientação correspondente");
    h.noEnvio=async chat=>{if(chat==="ALERTA")await pausarParaHumano(h.db,1,"profissional_assumiu",6);};
    await processarAtendimentosPendentes();h.noEnvio=null;
    expect(h.enviados.map(e=>e.chat)).toEqual(["ALERTA"]);
    expect((await pool.query("SELECT ultimo_erro FROM telegram_atendimento_respostas WHERE inbox_message_id=202")).rows[0].ultimo_erro).toBe("resposta_nao_autorizada");
    expect((await pool.query("SELECT alterado_por FROM telegram_atendimento WHERE cliente_id=1")).rows[0].alterado_por).toBe(6);
  });
  it("aprovação retirada depois do plano impede o envio do texto antigo",async()=>{
    await entrada(203,"quantas horas de jejum para o exame de sangue?");
    const plano={pausa:null,alerta:null,resposta:"APROVADA: jejum de 8 horas.",orientacaoId:1,desfecho:"orientacao_enviada"};
    await pool.query("UPDATE telegram_atendimento_respostas SET plano=$1 WHERE inbox_message_id=203",[plano]);
    await pool.query("UPDATE orientacoes_aprovadas SET status='rascunho' WHERE id=1");
    await processarAtendimentosPendentes();expect(h.enviados).toHaveLength(0);
    expect((await pool.query("SELECT ultimo_erro FROM telegram_atendimento_respostas WHERE inbox_message_id=203")).rows[0].ultimo_erro).toBe("resposta_nao_autorizada");
    await pool.query("UPDATE orientacoes_aprovadas SET status='aprovada' WHERE id=1");
  });
  it("origem de clínica diferente não pausa nem envia",async()=>{
    await entrada(204,"dúvida sintética",3,5);
    await processarAtendimentosPendentes();expect(h.enviados).toHaveLength(0);
    expect((await pool.query("SELECT ultimo_erro FROM telegram_atendimento_respostas WHERE inbox_message_id=204")).rows[0].ultimo_erro).toBe("vinculo_origem_alterado");
    expect((await pool.query("SELECT modo FROM telegram_atendimento WHERE cliente_id=3")).rows[0].modo).toBe("ia");
  });
  it.each(["desvinculado","duplicado","dono_antigo","legitimo"])("pausa atômica: %s no instante do efeito",async(caso)=>{
    const id=205+["desvinculado","duplicado","dono_antigo","legitimo"].indexOf(caso);
    const e=await entrada(id,"teste sintético da pausa");
    await pool.query("UPDATE telegram_atendimento_respostas SET estado='processando',dono='dono-sintetico' WHERE inbox_message_id=$1",[id]);
    try{
      if(caso==="desvinculado")await pool.query("UPDATE clients SET telegram_chat_id=NULL WHERE id=1");
      if(caso==="duplicado")await pool.query("UPDATE clients SET telegram_chat_id='C1' WHERE id=3");
      await pausarAtendimentoDuravel(e,"teste_sintetico",caso==="dono_antigo"?"dono-expirado":"dono-sintetico");
      expect((await pool.query("SELECT modo FROM telegram_atendimento WHERE cliente_id=1")).rows[0].modo)
        .toBe(caso==="legitimo"?"humano":"ia");
      expect(h.enviados).toHaveLength(0);
    }finally{
      await pool.query("UPDATE clients SET telegram_chat_id='C1' WHERE id=1");
      await pool.query("UPDATE clients SET telegram_chat_id='C3' WHERE id=3");
      await pool.query("UPDATE telegram_atendimento_respostas SET estado='esgotado' WHERE inbox_message_id=$1",[id]);
    }
  });
});
