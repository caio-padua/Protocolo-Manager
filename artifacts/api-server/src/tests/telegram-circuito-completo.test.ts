/**
 * Circuito completo do Telegram (Fase 1B): update -> segredo do webhook -> clínica -> usuário -> autorização da homologação
 * -> deduplicação persistente (chat+update_id) -> classificação determinística antes da IA -> fonte local -> adaptador de envio
 * (api.telegram.org simulado) -> id da resposta -> estado final -> ficha. Banco descartável, dados sintéticos, nada real enviado.
 */
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { bancoCircuitoCompleto } from "./helpers/pg-circuito-completo";

const h = vi.hoisted(() => ({
  pg: null as any, db: null as any, secrets: {} as Record<string, string>, settings: {} as Record<string, string>,
  fetch: vi.fn(), ia: vi.fn(),
  envio: "ok" as "ok" | "500" | "rede",
  enviados: [] as Array<{ chat: string; text: string }>, tentativas: [] as string[], seq: 0,
}));
vi.stubGlobal("fetch", h.fetch);
vi.mock("@workspace/db", async () => {
  const real = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  const viaPool = (m: string) => (...a: any[]) => (h.db as any)[m](...a);
  return { ...real, pool: { query: (...a: any[]) => h.pg.query(...a), connect: (...a: any[]) => h.pg.connect(...a) },
    db: new Proxy({}, { get: (_t, k: string) => viaPool(k) }) };
});
vi.mock("../lib/secure-settings", () => ({
  getSecret: vi.fn(async (k: string) => h.secrets[k] ?? null),
  setSecret: vi.fn(async (k: string, v: string) => { h.secrets[k] = v; }),
  getSecretStatus: vi.fn(async (k: string) => ({ isSet: Boolean(h.secrets[k]) })),
  getSetting: vi.fn(async (k: string) => h.settings[k] ?? null),
  setSetting: vi.fn(async (k: string, v: string) => { h.settings[k] = v; }),
}));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: (...a: any[]) => { if (process.env.DEBUG_CIRCUITO) console.log("LOGERR", ...a); }, debug: vi.fn() } }));
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_q: any, _r: any, n: () => void) => n() }));
vi.mock("../middleware/messageClinic", () => ({ requireMessageClinic: (_q: any, _r: any, n: () => void) => n() }));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: { messages: { create: (...a: any[]) => h.ia(...a) } } }));
vi.mock("../lib/slack-reporter.js", () => ({ postSlackAlert: vi.fn(async () => true) }));

process.env.TELEGRAM_BOT_TOKEN = "123456789:TOKEN_FALSO_SO_TESTE";
const CEO = "900000001", TG_DAYANA = "700000012", TG_CARLUCIA = "700000011", TG_DOIS = "700000099", TG_B = "700000055";
const SEGREDO = "segredo-webhook-teste";
const HELENA = "Olá!\n\nMe chamo Helena,\nAssistente virtual do Instituto Pádua.\n\nTudo bem?\n\nComo eu poderia te ajudar?";
const ESCLARECER = (o: string) => `Entendi mais de um pedido na sua mensagem:\n\n${o}\n\nSobre qual deles você quer falar primeiro? Responda com uma frase curta.`;
const NAO_RECONHECIDA = "Recebi sua mensagem, mas não tenho uma resposta autorizada para essa pergunta.\n\nRegistrei o pedido para a equipe da clínica analisar. Esta mensagem não é uma avaliação clínica.";

let b: Awaited<ReturnType<typeof bancoCircuitoCompleto>>;
let app: express.Express;
let proc: typeof import("../lib/atendimento-telegram-store");
let tenant: any = { authenticated: true, empresaId: 5, isPlatformOwner: true, perfilPlataforma: "admin", professionalId: 7 };
let cDayana = 0, cCarlucia = 0, cDois = 0, cB = 0, upd = 100000;

async function montar() {
  const { telegramWebhookRouter } = await import("../routes/assinaturas");
  const controle = (await import("../routes/atendimento-controle")).default;
  const a = express(); a.use(express.json());
  a.use((req, _r, nx) => { (req as any).tenantContext = tenant; nx(); });
  a.use("/api", telegramWebhookRouter); a.use("/api", controle);
  return a;
}
function providerFetch() {
  h.fetch.mockImplementation(async (url: string, init?: any) => {
    const u = String(url);
    const resp = (status: number, json: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json });
    if (u.includes("api.telegram.org") && u.includes("sendMessage")) {
      const body = JSON.parse(init.body);
      h.tentativas.push(String(body.chat_id));
      if (String(body.chat_id) !== CEO) {
        if (h.envio === "500") return resp(500, {});
        if (h.envio === "rede") throw new Error("rede caiu");
      }
      h.enviados.push({ chat: String(body.chat_id), text: String(body.text) });
      return resp(200, { ok: true, result: { message_id: 5000 + ++h.seq } });
    }
    return resp(404, null);
  });
}
const update = (chat: string, texto: string | null, id = ++upd, extra: any = {}) => ({
  update_id: id, ...(extra.edited ? { edited_message: { chat: { id: Number(chat) }, text: texto ?? undefined } }
    : { message: { message_id: id, chat: { id: Number(chat) }, ...(texto === null ? { photo: [] } : { text: texto }), ...extra.msg } }),
});
const enviarUpdate = (corpo: unknown, segredo: string | null = SEGREDO) => {
  const r = request(app).post("/api/webhooks/telegram");
  if (segredo) r.set("x-telegram-bot-api-secret-token", segredo);
  return r.send(corpo as object);
};
const processar = async () => { await proc.processarAtendimentosPendentes(); };
const falar = async (chat: string, texto: string, id = ++upd) => { const r = await enviarUpdate(update(chat, texto, id)); await processar(); return r; };
const dump = () => JSON.stringify(h.enviados.map((x) => [x.chat, x.text.slice(0, 80)]));
const paraChat = (c: string) => h.enviados.filter((x) => x.chat === c);
const respostas = async () => (await b.pool.query(`SELECT * FROM telegram_atendimento_respostas ORDER BY inbox_message_id`)).rows;
const fichas = async (q = "") => (await request(app).get(`/api/atendimento/fichas?porPagina=100${q}`)).body;
const limparTudo = async () => {
  for (const t of ["atendimento_ficha_evento", "atendimento_ficha"]) await b.pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  await b.pool.query(`DELETE FROM atendimento_ficha_evento`); await b.pool.query(`DELETE FROM atendimento_ficha`);
  for (const t of ["atendimento_ficha_evento", "atendimento_ficha"]) await b.pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  for (const t of ["telegram_atendimento_respostas", "telegram_inbox_messages", "telegram_updates_processados", "telegram_atendimento", "atendimento_controle", "atendimento_controle_log"])
    await b.pool.query(`DELETE FROM ${t}`);
};

beforeAll(async () => {
  b = await bancoCircuitoCompleto();
  h.pg = b.pool; h.db = b.db;
  await b.pool.query(`INSERT INTO empresas (id,nome,endereco,bairro,cidade,estado,cep) VALUES
    (5,'Instituto Padua','Rua Sintetica 100','Centro','Sao Paulo','SP','01000-000'),
    (6,'Clinica Dois','Avenida Dois 200','Bairro Dois','Rio de Janeiro','RJ','20000-000')`);
  const ins = async (nome: string, chat: string, emp: number) => Number((await b.pool.query(
    `INSERT INTO clients (name,phone,empresa_id,status,telegram_chat_id) VALUES ($1,$2,$3,'active',$4) RETURNING id`, [nome, `55${chat}`, emp, chat])).rows[0].id);
  cDayana = await ins("Dayana Sintetica", TG_DAYANA, 5);
  cCarlucia = await ins("Carlucia Sintetica", TG_CARLUCIA, 5);
  cB = await ins("Cliente B Sintetico", TG_B, 5);
  cDois = await ins("Paciente Dois Sintetico", TG_DOIS, 6);
  const { semearFrases } = await import("../lib/telegram-frases");
  await semearFrases(b.db);
  const { ambienteCreditoAtual, garantirTabelasCredito } = await import("../lib/mensageria-credito");
  await garantirTabelasCredito();
  for (const emp of [5, 6]) await b.pool.query(`INSERT INTO msg_carteira (empresa_id,ambiente,saldo_centavos,isento) VALUES ($1,$2,0,TRUE) ON CONFLICT DO NOTHING`, [emp, ambienteCreditoAtual()]);
  await (await import("../lib/atendimento-ficha")).garantirFicha();
  await (await import("../lib/atendimento-controle")).garantirControle?.();
  proc = await import("../lib/atendimento-telegram-store");
  app = await montar();
}, 180_000);
afterAll(async () => { await b?.fechar(); });

beforeEach(async () => {
  h.secrets = { "telegram.webhookSecret": SEGREDO, "telegram.botToken": process.env.TELEGRAM_BOT_TOKEN!, "telegram.ceoChatId": CEO };
  h.settings = { "atendimento.ia.modo": "lista", "atendimento.ia.permitidos": JSON.stringify([cDayana, cCarlucia, cDois]), "telegram.active": "true" };
  h.envio = "ok"; h.enviados.length = 0; h.tentativas.length = 0; h.ia.mockReset(); h.ia.mockRejectedValue(new Error("IA_NAO_DEVE_SER_CHAMADA"));
  providerFetch();
  tenant = { authenticated: true, empresaId: 5, isPlatformOwner: true, perfilPlataforma: "admin", professionalId: 7 };
  await limparTudo();
  await b.pool.query(`INSERT INTO telegram_atendimento (cliente_id,modo,motivo) VALUES ($1,'humano','teste_homologacao')`, [cCarlucia]);
  await b.pool.query(`UPDATE empresas SET endereco='Rua Sintetica 100' WHERE id=5`);
});

describe("circuito Telegram: porta de entrada", () => {
  it("1. segredo do webhook ausente ou errado: nada é gravado nem respondido", async () => {
    await enviarUpdate(update(TG_DAYANA, "Oi"), null).expect(200);
    await enviarUpdate(update(TG_DAYANA, "Oi"), "errado").expect(200);
    await processar();
    expect(h.enviados).toHaveLength(0);
    expect((await b.pool.query(`SELECT COUNT(*)::int n FROM telegram_inbox_messages`)).rows[0].n).toBe(0);
  });
  it("2. saudação e identidade devolvem EXATAMENTE a apresentação da Helena, sem IA", async () => {
    for (const t of ["Olá", "Com quem estou falando?"]) {
      h.enviados.length = 0;
      await falar(TG_DAYANA, t);
      expect(paraChat(TG_DAYANA), t + dump()).toEqual([{ chat: TG_DAYANA, text: HELENA }]);
    }
    expect(h.ia).not.toHaveBeenCalled();
  });
  it("3. endereço vem da clínica correta e acompanha a mudança da fonte, sem cache", async () => {
    await falar(TG_DAYANA, "Qual o endereço da clínica?");
    expect(paraChat(TG_DAYANA)[0].text).toContain("Rua Sintetica 100");
    await b.pool.query(`UPDATE empresas SET endereco='Rua Nova 999' WHERE id=5`);
    await falar(TG_DAYANA, "Qual o endereço da clínica?");
    expect(paraChat(TG_DAYANA)[1].text).toContain("Rua Nova 999");
    expect(paraChat(TG_DAYANA)[1].text).not.toContain("Rua Sintetica 100");
    await falar(TG_DOIS, "Qual o endereço da clínica?");
    expect(paraChat(TG_DOIS)[0].text).toContain("Avenida Dois 200");
    expect(paraChat(TG_DOIS)[0].text).not.toContain("Rua N");
  });
  it("4. 'Não quero remarcar; quero o endereço' responde o endereço", async () => {
    await falar(TG_DAYANA, "Não quero remarcar; quero o endereço");
    expect(paraChat(TG_DAYANA)).toHaveLength(1);
    expect(paraChat(TG_DAYANA)[0].text).toContain("Rua Sintetica 100");
  });
  it("5. dois pedidos: mesma política do WhatsApp (pergunta curta autorizada, nada escolhido em silêncio)", async () => {
    await falar(TG_DAYANA, "Quero remarcar e saber o endereço");
    expect(paraChat(TG_DAYANA)).toEqual([{ chat: TG_DAYANA, text: ESCLARECER("• agendar ou remarcar uma consulta\n• saber o endereço da clínica") }]);
  });
  it("6. pergunta desconhecida: texto institucional exato + alerta à equipe sem o texto do cliente", async () => {
    await falar(TG_DAYANA, "Vocês aceitam pagamento em bitcoin na terça?");
    expect(paraChat(TG_DAYANA)).toEqual([{ chat: TG_DAYANA, text: NAO_RECONHECIDA }]);
    const alerta = paraChat(CEO).filter((x) => /não reconhecida/.test(x.text));
    expect(alerta, dump()).toHaveLength(1);
    expect(alerta[0].text).toMatch(/pergunta não reconhecida/);
    expect(alerta[0].text).not.toMatch(/bitco/i);
  });
});

describe("circuito Telegram: repetição, reinício, falha e incerteza", () => {
  it("7. update repetido (mesmo update_id) gera uma única resposta, inclusive com a repetição simultânea", async () => {
    const id = ++upd;
    await enviarUpdate(update(TG_DAYANA, "Qual o endereço?", id)).expect(200);
    await processar();
    await enviarUpdate(update(TG_DAYANA, "Qual o endereço?", id)).expect(200);
    await Promise.all([enviarUpdate(update(TG_DAYANA, "Qual o endereço?", id)), enviarUpdate(update(TG_DAYANA, "Qual o endereço?", id))]);
    await Promise.all([processar(), processar()]);
    expect(paraChat(TG_DAYANA)).toHaveLength(1);
    expect((await b.pool.query(`SELECT COUNT(*)::int n FROM telegram_inbox_messages WHERE direcao='entrada'`)).rows[0].n).toBe(1);
  });
  it("8. reinício depois de receber e antes de enviar: só o envio pendente é recuperado, uma vez", async () => {
    await enviarUpdate(update(TG_DAYANA, "Qual o endereço?")).expect(200);
    expect(paraChat(TG_DAYANA)).toHaveLength(0);
    vi.resetModules();
    proc = await import("../lib/atendimento-telegram-store");
    app = await montar();
    await processar(); await processar();
    expect(paraChat(TG_DAYANA)).toHaveLength(1);
    expect(paraChat(TG_DAYANA)[0].text).toContain("Rua Sintetica 100");
  });
  it("9. falha temporária (HTTP 500): tenta de novo sem reclassificar, e a resposta sai uma única vez", async () => {
    h.envio = "500";
    await falar(TG_DAYANA, "Qual o endereço?");
    expect(h.tentativas.filter((c) => c === TG_DAYANA)).toHaveLength(1); // a tentativa que o Telegram recusou
    expect(paraChat(TG_DAYANA)).toHaveLength(0);
    let r = (await respostas())[0];
    expect(r.estado).toBe("falhou");
    const planoAntes = JSON.stringify(r.plano);
    h.enviados.length = 0; h.envio = "ok";
    await processar();
    expect(paraChat(TG_DAYANA)).toHaveLength(0); // recuo ainda não venceu
    await b.pool.query(`UPDATE telegram_atendimento_respostas SET proxima_tentativa_em=NOW()`);
    await processar(); await processar();
    expect(paraChat(TG_DAYANA)).toHaveLength(1);
    r = (await respostas())[0];
    expect(r.estado).toBe("concluido");
    expect(JSON.stringify(r.plano)).toBe(planoAntes);
    const f = (await fichas()).itens[0];
    expect(f.estado_final).toBe("enviado");
    const d = (await request(app).get(`/api/atendimento/fichas/${f.id}`)).body;
    expect(d.linhaDoTempo.map((x: any) => x.estado ?? x.resultado)).toEqual(expect.arrayContaining(["pendente", "enviado"]));
  });
  it("10. resultado incerto (rede caiu depois de chamar o Telegram) nunca é reenviado sozinho", async () => {
    h.envio = "rede";
    await falar(TG_DAYANA, "Qual o endereço?");
    expect((await respostas())[0].estado).toBe("incerto");
    h.envio = "ok"; h.enviados.length = 0;
    await b.pool.query(`UPDATE telegram_atendimento_respostas SET proxima_tentativa_em=NOW()`);
    await processar(); await processar();
    expect(h.enviados).toHaveLength(0);
    expect((await fichas()).itens[0].estado_final).toBe("incerto");
  });
});

describe("circuito Telegram: fonte e isolamento", () => {
  it("11. fonte editada, inativada ou revogada nunca reaproveita a resposta antiga", async () => {
    const o = await b.pool.query(`INSERT INTO orientacoes_aprovadas (empresa_id,tema,perguntas_exemplo,resposta,status)
      VALUES (5,'estacionamento','tem estacionamento no local|onde estaciono o carro','Temos estacionamento conveniado ao lado.','aprovada') RETURNING id`);
    await falar(TG_DAYANA, "Tem estacionamento no local?");
    expect(paraChat(TG_DAYANA)[0].text).toBe("Temos estacionamento conveniado ao lado.");
    await b.pool.query(`UPDATE orientacoes_aprovadas SET status='inativa' WHERE id=$1`, [o.rows[0].id]);
    await falar(TG_DAYANA, "Tem estacionamento no local?");
    expect(paraChat(TG_DAYANA).filter((x) => x.text === "Temos estacionamento conveniado ao lado.")).toHaveLength(1);
    await b.pool.query(`UPDATE orientacoes_aprovadas SET status='aprovada',resposta='Estacionamento novo na rua de trás.' WHERE id=$1`, [o.rows[0].id]);
    await falar(TG_DAYANA, "Tem estacionamento no local?");
    expect(paraChat(TG_DAYANA).at(-1)?.text).toBe("Estacionamento novo na rua de trás.");
  });
  it("12. orientação de uma clínica nunca responde a cliente de outra", async () => {
    await b.pool.query(`INSERT INTO orientacoes_aprovadas (empresa_id,tema,perguntas_exemplo,resposta,status)
      VALUES (5,'estacionamento','tem estacionamento no local','Estacionamento exclusivo do Instituto.','aprovada')`);
    await falar(TG_DOIS, "Tem estacionamento no local?");
    expect(paraChat(TG_DOIS).map((x) => x.text)).not.toContain("Estacionamento exclusivo do Instituto.");
  });
  it("13. dois usuários ao mesmo tempo não compartilham contexto nem resposta", async () => {
    await b.pool.query(`INSERT INTO telegram_atendimento (cliente_id,modo,motivo) VALUES ($1,'ia','teste') ON CONFLICT DO NOTHING`, [cB]);
    h.settings["atendimento.ia.permitidos"] = JSON.stringify([cDayana, cB, cDois]);
    await Promise.all([enviarUpdate(update(TG_DAYANA, "Qual o endereço?")), enviarUpdate(update(TG_B, "Com quem estou falando?")), enviarUpdate(update(TG_DOIS, "Qual o endereço?"))]);
    await Promise.all([processar(), processar()]);
    expect(paraChat(TG_DAYANA)).toHaveLength(1); expect(paraChat(TG_B)).toHaveLength(1); expect(paraChat(TG_DOIS)).toHaveLength(1);
    expect(paraChat(TG_DAYANA)[0].text).toContain("Rua Sintetica 100");
    expect(paraChat(TG_B)[0].text).toBe(HELENA);
    expect(paraChat(TG_DOIS)[0].text).toContain("Avenida Dois 200");
  });
  it("14. bot próprio, mensagem sem texto, evento editado/incompatível: ignorados e registrados com motivo auditável", async () => {
    await enviarUpdate({ update_id: ++upd, my_chat_member: { chat: {} } }).expect(200);
    await enviarUpdate(update(TG_DAYANA, null)).expect(200);
    await enviarUpdate(update(TG_DAYANA, "Qual o endereço?", ++upd, { msg: { from: { is_bot: true, id: 123456789 } } })).expect(200);
    await processar();
    const inb = (await b.pool.query(`SELECT texto FROM telegram_inbox_messages WHERE direcao='entrada'`)).rows;
    expect(paraChat(TG_DAYANA)).toHaveLength(0);
    expect(inb).toHaveLength(0);
    const ig = (await fichas("&estado=ignorado")).itens;
    expect(ig.map((x: any) => x.motivo).sort()).toEqual(["mensagem_de_bot", "mensagem_sem_texto"]);
  });
  it("15. Carlúcia em modo humano: mensagem preservada, nenhuma resposta, ficha com o motivo", async () => {
    await falar(TG_CARLUCIA, "Qual o endereço?");
    expect(paraChat(TG_CARLUCIA)).toHaveLength(0);
    expect((await b.pool.query(`SELECT COUNT(*)::int n FROM telegram_inbox_messages WHERE chat_id=$1 AND direcao='entrada'`, [TG_CARLUCIA])).rows[0].n).toBe(1);
    const f = (await fichas()).itens[0];
    expect(f).toMatchObject({ canal: "telegram", estado_final: "bloqueado" });
  });
});

describe("circuito Telegram: paridade com o WhatsApp, IA e ficha", () => {
  it("16. mesma pergunta no Telegram e no WhatsApp: mesma intenção, mesma fonte, mesma versão do texto", async () => {
    const { classificarIntencaoWhatsapp } = await import("../lib/atendimento-whatsapp");
    const { versaoDaFonte } = await import("../lib/atendimento-ficha");
    const { carregarFrases } = await import("../lib/telegram-frases");
    expect(classificarIntencaoWhatsapp("Qual o endereço da clínica?")).toBe("endereco");
    await falar(TG_DAYANA, "Qual o endereço da clínica?");
    const f = (await fichas()).itens[0];
    expect(f).toMatchObject({ canal: "telegram", intencao_principal: "endereco", fonte_chave: "atendimento_endereco", ia_usada: false });
    const esperado = (await carregarFrases())("atendimento_endereco", { endereco: paraChat(TG_DAYANA)[0].text.split("\n\n")[0] });
    expect(f.fonte_versao).toBe(versaoDaFonte(paraChat(TG_DAYANA)[0].text));
    expect(esperado.length).toBeGreaterThan(0);
  });
  it("17. custo de IA é zero no determinístico, e a IA (quando chamada) só devolve chave da lista fechada", async () => {
    await falar(TG_DAYANA, "Qual o endereço da clínica?");
    await falar(TG_DAYANA, "Olá");
    expect(h.ia).not.toHaveBeenCalled();
    expect((await fichas()).itens.every((x: any) => x.ia_usada === false)).toBe(true);
    h.ia.mockReset();
    h.ia.mockResolvedValue({ content: [{ type: "text", text: "chave_inventada_fora_da_lista" }], usage: { input_tokens: 1, output_tokens: 1 } });
    h.enviados.length = 0;
    await falar(TG_DAYANA, "Vocês aceitam pagamento em bitcoin na terça?");
    expect(paraChat(TG_DAYANA)).toEqual([{ chat: TG_DAYANA, text: NAO_RECONHECIDA }]);
  });
  it("ficha: contato mascarado, uma ficha por update, resposta e id do provedor, sem número completo", async () => {
    await falar(TG_DAYANA, "Qual o endereço?");
    const l = await fichas();
    expect(l.itens).toHaveLength(1);
    expect(l.itens[0]).toMatchObject({ canal: "telegram", contato_mascarado: "***0012", estado_final: "enviado" });
    const d = (await request(app).get(`/api/atendimento/fichas/${l.itens[0].id}`)).body;
    expect(d.ficha.resposta_id).toMatch(/^50\d\d$/);
    expect(JSON.stringify([l, d])).not.toContain(TG_DAYANA);
    tenant = { authenticated: true, empresaId: 6, isPlatformOwner: false, perfilPlataforma: "admin", professionalId: 9 };
    expect((await fichas()).itens).toHaveLength(0);
  });
  it("interruptores valem para o Telegram: canal desligado e emergência bloqueiam; canal do WhatsApp não afeta", async () => {
    const ctl = (c: object) => request(app).put("/api/atendimento/controle").send(c);
    await ctl({ escopo: "canal", canal: "whatsapp", ligado: false, motivo: "teste whatsapp off" });
    await falar(TG_DAYANA, "Qual o endereço?");
    expect(paraChat(TG_DAYANA)).toHaveLength(1);
    await ctl({ escopo: "canal", canal: "telegram", ligado: false, motivo: "teste telegram off" });
    await falar(TG_DAYANA, "Qual o endereço?");
    expect(paraChat(TG_DAYANA)).toHaveLength(1);
    await ctl({ escopo: "canal", canal: "telegram", ligado: true, motivo: "religar telegram" });
    await ctl({ escopo: "clinica", bloqueioEmergencial: true, motivo: "emergência teste" });
    await falar(TG_DAYANA, "Qual o endereço?");
    expect(paraChat(TG_DAYANA)).toHaveLength(1);
  });
});
