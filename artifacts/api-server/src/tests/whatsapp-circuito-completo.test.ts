/**
 * Circuito completo do WhatsApp (Fase 1B, ordem A).
 * Evento equivalente ao webhook da Evolution -> rota real -> cérebro real -> fonte local real -> adaptador de envio
 * (provedor simulado) -> registro. Banco descartável com o esquema real; dados 100% sintéticos; nenhuma mensagem real.
 * Só o provedor externo, o cofre de segredos, a rede (dns) e a IA (contador) são simulados.
 */
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { bancoCircuitoCompleto } from "./helpers/pg-circuito-completo";

const h = vi.hoisted(() => ({
  pg: null as any, db: null as any,
  secrets: {} as Record<string, string>, settings: {} as Record<string, string>,
  fetch: vi.fn(), ia: vi.fn(),
  envio: "ok" as "ok" | "503" | "desconectado",
  enviados: [] as Array<{ number: string; text: string }>, seq: 0,
}));
vi.stubGlobal("fetch", h.fetch);
vi.mock("@workspace/db", async () => {
  const real = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  return { ...real, pool: { query: (...a: any[]) => h.pg.query(...a), connect: (...a: any[]) => h.pg.connect(...a) },
    db: { execute: (...a: any[]) => h.db.execute(...a), select: (...a: any[]) => h.db.select(...a),
      insert: (...a: any[]) => h.db.insert(...a), update: (...a: any[]) => h.db.update(...a),
      transaction: (...a: any[]) => h.db.transaction(...a) } };
});
vi.mock("../lib/secure-settings", () => ({
  getSecret: vi.fn(async (k: string) => h.secrets[k] ?? null),
  setSecret: vi.fn(async (k: string, v: string) => { h.secrets[k] = v; }),
  getSecretStatus: vi.fn(async (k: string) => ({ isSet: Boolean(h.secrets[k]) })),
  getSetting: vi.fn(async (k: string) => h.settings[k] ?? null),
  setSetting: vi.fn(async (k: string, v: string) => { h.settings[k] = v; }),
}));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: (...a: any[]) => { if (process.env.DEBUG_CIRCUITO) console.log("LOGERR", ...a); }, debug: vi.fn() } }));
vi.mock("node:dns/promises", () => ({ default: { lookup: vi.fn(async () => [{ address: "203.0.113.10" }]) } }));
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_q: any, _r: any, n: () => void) => n() }));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: { messages: { create: (...a: any[]) => h.ia(...a) } } }));

const DAYANA = "5511900000012", CARLUCIA = "5511900000011", CLINICA2 = "5521900000099", TERCEIRO = "5511900000077";
process.env.EVOLUTION_CONTATOS_AUTORIZADOS = [DAYANA, CARLUCIA, CLINICA2].join(",");
delete process.env.EVOLUTION_HOMOLOGACAO;
process.env.EVOLUTION_AGRUPAMENTO_TESTE = "1";

let b: Awaited<ReturnType<typeof bancoCircuitoCompleto>>;
let app: express.Express;
let mod: typeof import("../routes/evolution");
let tenant: any = { authenticated: true, empresaId: 5, isPlatformOwner: true };
let clienteDayana = 0, clienteCarlucia = 0, clienteDois = 0;
let n = 0;

function montar(m: typeof mod) {
  const a = express(); a.use(express.json());
  a.use((req, _r, nx) => { (req as any).tenantContext = tenant; nx(); });
  a.use("/api", m.evolutionWebhookRouter); a.use("/api", m.default);
  return a;
}
function providerFetch() {
  h.fetch.mockImplementation(async (url: string, init?: any) => {
    const u = String(url);
    const resp = (status: number, json: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json });
    if (u.includes("connectionState")) return resp(200, { instance: { state: h.envio === "desconectado" ? "close" : "open" } });
    if (u.includes("sendText")) {
      if (h.envio === "503") return resp(503, { error: "indisponivel" });
      const body = JSON.parse(init.body);
      h.enviados.push({ number: body.number, text: body.text });
      return resp(200, { key: { id: `PROV-${++h.seq}` } });
    }
    return resp(404, null);
  });
}
const evento = (instancia: string, de: string, texto: string | null, id: string, extra: any = {}) => ({
  event: "messages.upsert", instance: instancia,
  data: { key: { remoteJid: `${de}@s.whatsapp.net`, id, fromMe: false, ...extra.key }, message: texto === null ? {} : { conversation: texto } },
});
const novoId = () => `EVT-${Date.now()}-${++n}`;
const enviarEvento = (emp: number, corpo: unknown, token?: string) =>
  request(app).post(`/api/evolution/webhook/${emp}/${token ?? (emp === 5 ? "tok5" : "tok6")}`).send(corpo as object);
const saidas = async (contato?: string) => (await b.pool.query(
  `SELECT * FROM evolution_mensagens WHERE direcao='saida' ${contato ? "AND contato=$1" : ""} ORDER BY id`, contato ? [contato] : [])).rows;
const entradas = async () => (await b.pool.query(`SELECT * FROM evolution_mensagens WHERE direcao='entrada' ORDER BY id`)).rows;
const esperar = async (cond: () => Promise<boolean>, ms = 6000) => {
  const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 50)); } return false;
};
const HELENA = "Olá!\n\nMe chamo Helena,\nAssistente virtual do Instituto Pádua.\n\nTudo bem?\n\nComo eu poderia te ajudar?";

beforeAll(async () => {
  b = await bancoCircuitoCompleto();
  h.pg = b.pool; h.db = b.db;
  await b.pool.query(`INSERT INTO empresas (id,nome,endereco,bairro,cidade,estado,cep) VALUES
    (5,'Instituto Padua','Rua Sintetica 100','Centro','Sao Paulo','SP','01000-000'),
    (6,'Clinica Dois','Avenida Dois 200','Bairro Dois','Rio de Janeiro','RJ','20000-000')`);
  const ins = async (nome: string, tel: string, emp: number) => Number((await b.pool.query(
    `INSERT INTO clients (name,phone,empresa_id,status) VALUES ($1,$2,$3,'active') RETURNING id`, [nome, tel, emp])).rows[0].id);
  clienteDayana = await ins("Dayana Sintetica", DAYANA.slice(2), 5);
  clienteCarlucia = await ins("Carlucia Sintetica", CARLUCIA.slice(2), 5);
  clienteDois = await ins("Paciente Dois Sintetico", CLINICA2.slice(2), 6);
  mod = await import("../routes/evolution");
  const ev = await import("../lib/evolution");
  await ev.garantirTabelasEvolution();
  for (const [emp, inst] of [[5, "inst5"], [6, "inst6"]] as const) {
    await b.pool.query(`INSERT INTO evolution_instancias (empresa_id,base_url,instance_name) VALUES ($1,'https://evo.exemplo.com',$2)`, [emp, inst]);
    await b.pool.query(`INSERT INTO evolution_homologacao_config (empresa_id,motor_ativo,agrupamento_ms) VALUES ($1,TRUE,0)
      ON CONFLICT (empresa_id) DO UPDATE SET motor_ativo=TRUE,agrupamento_ms=0`, [emp]);
  }
  const { semearFrases } = await import("../lib/telegram-frases");
  await semearFrases(b.db);
  app = montar(mod);
}, 120_000);
afterAll(async () => { await b?.fechar(); });

beforeEach(async () => {
  h.secrets = { "evolution.apiKey.5": "k5", "evolution.webhookToken.5": "tok5", "evolution.apiKey.6": "k6", "evolution.webhookToken.6": "tok6" };
  h.settings = { "atendimento.ia.modo": "ligado" };
  h.envio = "ok"; h.enviados.length = 0; h.ia.mockReset(); h.ia.mockRejectedValue(new Error("IA_NAO_DEVE_SER_CHAMADA"));
  providerFetch();
  tenant = { authenticated: true, empresaId: 5, isPlatformOwner: true };
  await b.pool.query(`DELETE FROM evolution_mensagens`);
  await b.pool.query(`DELETE FROM telegram_atendimento`);
  await b.pool.query(`UPDATE evolution_homologacao_config SET agrupamento_ms=0`);
  await b.pool.query(`UPDATE empresas SET endereco='Rua Sintetica 100' WHERE id=5`);
  await b.pool.query(`INSERT INTO telegram_atendimento (cliente_id,modo,motivo) VALUES ($1,'humano','teste_homologacao')`, [clienteCarlucia]);
  mod.agrupadorEvolution.cancelarTodos();
});

describe("circuito WhatsApp: saudação e fonte local", () => {
  it("saudação/identidade devolve EXATAMENTE o texto aprovado, sem IA", async () => {
    for (const t of ["Oi", "Com quem estou falando?"]) {
      await b.pool.query(`DELETE FROM evolution_mensagens`);
      h.enviados.length = 0;
      await enviarEvento(5, evento("inst5", DAYANA, t, novoId())).expect(200);
      expect(h.enviados).toHaveLength(1);
      expect(h.enviados[0].number).toBe(DAYANA);
      expect(h.enviados[0].text).toBe(HELENA);
    }
    expect(h.ia).not.toHaveBeenCalled();
  });
  it("endereço vem da fonte local vigente e muda sem cache quando o cadastro muda", async () => {
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço da clínica?", novoId())).expect(200);
    expect(h.enviados[0].text).toContain("Rua Sintetica 100");
    await b.pool.query(`UPDATE empresas SET endereco='Rua Nova 999' WHERE id=5`);
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço da clínica?", novoId())).expect(200);
    expect(h.enviados[1].text).toContain("Rua Nova 999");
    expect(h.enviados[1].text).not.toContain("Rua Sintetica 100");
    expect(h.ia).not.toHaveBeenCalled();
  });
  it("'Não quero remarcar, quero o endereço' responde o endereço, não remarcação", async () => {
    await enviarEvento(5, evento("inst5", DAYANA, "Não quero remarcar, quero o endereço", novoId())).expect(200);
    expect(h.enviados).toHaveLength(1);
    expect(h.enviados[0].text).toContain("Rua Sintetica 100");
  });
  it("'Quero remarcar e saber o endereço' não escolhe uma intenção arbitrária em silêncio", async () => {
    await enviarEvento(5, evento("inst5", DAYANA, "Quero remarcar e saber o endereço", novoId())).expect(200);
    const e = (await entradas())[0];
    const plano = e.plano_atendimento;
    expect(plano).toBeTruthy();
    // Aceito: responde as duas coisas, ou pergunta/encaminha. Não aceito: só o endereço como se fosse a única intenção.
    const txt = h.enviados[0]?.text ?? "";
    const respondeSoEndereco = txt.includes("Rua Sintetica 100") && !/remar/i.test(txt);
    expect(respondeSoEndereco).toBe(false);
  });
  it("pergunta desconhecida: não inventa, não usa IA e registra a dúvida/encaminhamento", async () => {
    await enviarEvento(5, evento("inst5", DAYANA, "Vocês aceitam pagamento em bitcoin na terça?", novoId())).expect(200);
    const txt = h.enviados[0]?.text ?? "";
    expect(txt).not.toMatch(/bitcoin|aceitamos/i);
    expect(h.ia).not.toHaveBeenCalled();
    const e = (await entradas())[0];
    expect(e.desfecho_atendimento).toBeTruthy();
  });
});

describe("circuito WhatsApp: deduplicação, eco e eventos vazios", () => {
  it("evento duplicado gera uma única resposta", async () => {
    const id = novoId();
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", id)).expect(200);
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", id)).expect(200);
    expect(h.enviados).toHaveLength(1);
    expect(await saidas(DAYANA)).toHaveLength(1);
  });
  it("deduplicação sobrevive a reinício (módulos recarregados, mesmo banco)", async () => {
    const id = novoId();
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", id)).expect(200);
    vi.resetModules();
    const novo = await import("../routes/evolution");
    app = montar(novo); mod = novo;
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", id)).expect(200);
    expect(h.enviados).toHaveLength(1);
    expect(await entradas()).toHaveLength(1);
  });
  it("eco de mensagem própria, conteúdo vazio, grupo e confirmação de entrega não geram resposta", async () => {
    await enviarEvento(5, evento("inst5", DAYANA, "oi", novoId(), { key: { fromMe: true } })).expect(200);
    await enviarEvento(5, evento("inst5", DAYANA, null, novoId())).expect(200);
    await enviarEvento(5, { event: "messages.upsert", instance: "inst5", data: { key: { remoteJid: "1203@g.us", id: novoId(), fromMe: false }, message: { conversation: "oi" } } }).expect(200);
    await enviarEvento(5, { event: "messages.update", instance: "inst5", data: { keyId: "PROV-X", status: "DELIVERY_ACK" } }).expect(200);
    expect(h.enviados).toHaveLength(0);
    expect(await entradas()).toHaveLength(0);
  });
  it("contato fora da homologação é ignorado sem registro nem resposta", async () => {
    await enviarEvento(5, evento("inst5", TERCEIRO, "Oi", novoId())).expect(200);
    expect(h.enviados).toHaveLength(0);
    expect(await entradas()).toHaveLength(0);
  });
});

describe("circuito WhatsApp: falha temporária, reenvio e reinício", () => {
  it("provedor desconectado (nada saiu): fica pendente e o reenvio sai UMA vez, sem reclassificar", async () => {
    h.envio = "desconectado";
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", novoId())).expect(200);
    expect(h.enviados).toHaveLength(0);
    let e = (await entradas())[0];
    expect(e.processamento).toBe("envio_pendente");
    const planoAntes = JSON.stringify(e.plano_atendimento);
    h.envio = "ok";
    expect(await mod.recuperarEnviosPendentesEvolution(10, 0)).toBe(1);
    expect(await mod.recuperarEnviosPendentesEvolution(10, 0)).toBe(0);
    expect(h.enviados).toHaveLength(1);
    expect(h.enviados[0].text).toContain("Rua Sintetica 100");
    e = (await entradas())[0];
    expect(e.processamento).toBe("concluido");
    expect(JSON.stringify(e.plano_atendimento)).toBe(planoAntes);
    expect(await saidas(DAYANA)).toHaveLength(1);
    expect(h.ia).not.toHaveBeenCalled();
  });
  it("resultado incerto (HTTP 503 após chamar o provedor) nunca é reenviado sozinho", async () => {
    h.envio = "503";
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", novoId())).expect(200);
    expect((await entradas())[0].processamento).toBe("incerto");
    h.envio = "ok";
    expect(await mod.recuperarEnviosPendentesEvolution(10, 0)).toBe(0);
    expect(h.enviados).toHaveLength(0);
  });
  it("reinício entre decisão e envio: só o envio pendente é recuperado, uma vez", async () => {
    // Estado deixado por um processo que caiu depois de gravar o plano e antes de enviar.
    const plano = { resposta: "Resposta decidida antes da queda.", desfecho: "operacional_enviada", pausa: null, alerta: null, orientacaoId: null, caminhoResolucao: "regra" };
    const r = await b.pool.query(`INSERT INTO evolution_mensagens (empresa_id,instancia,direcao,contato,corpo,provider_id,status,contexto,processamento,cliente_id,plano_atendimento,atualizado_em)
      VALUES (5,'inst5','entrada',$1,'Qual o endereço?',$2,'recebida','inbound','processando',$3,$4::jsonb,NOW()-interval '5 minutes') RETURNING id`,
      [DAYANA, novoId(), clienteDayana, JSON.stringify(plano)]);
    vi.resetModules();
    const novo = await import("../routes/evolution"); mod = novo; app = montar(novo);
    expect(await novo.recuperarEnviosPendentesEvolution(10, 60)).toBe(1);
    expect(await novo.recuperarEnviosPendentesEvolution(10, 60)).toBe(0);
    expect(h.enviados).toEqual([{ number: DAYANA, text: "Resposta decidida antes da queda." }]);
    const s = await saidas(DAYANA);
    expect(s).toHaveLength(1);
    expect(Number(s[0].mensagem_origem_id)).toBe(Number(r.rows[0].id));
    expect(h.ia).not.toHaveBeenCalled();
  });
  it("o banco recusa uma segunda saída do motor para a mesma origem", async () => {
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", novoId())).expect(200);
    const s = (await saidas(DAYANA))[0];
    await expect(b.pool.query(`INSERT INTO evolution_mensagens (empresa_id,instancia,direcao,contato,corpo,status,contexto,mensagem_origem_id)
      VALUES (5,'inst5','saida',$1,'duplicada','incerto','motor_evolution',$2)`, [DAYANA, s.mensagem_origem_id])).rejects.toThrow();
  });
});

describe("circuito WhatsApp: agrupamento por clínica", () => {
  const definir = (ms: unknown) => request(app).put("/api/evolution/homologacao/agrupamento").send({ agrupamentoMs: ms });
  it("configuração: 0 e 12000 aceitos; inválidos recusados; persiste e é lida de novo após reinício", async () => {
    expect((await definir(0)).status).toBe(200);
    expect((await definir(12000)).status).toBe(200);
    for (const ruim of [12001, -1, 1.5, "abc", null]) expect((await definir(ruim)).status).toBe(400);
    expect((await definir(300)).status).toBe(200);
    vi.resetModules();
    const novo = await import("../routes/evolution"); mod = novo; app = montar(novo);
    const g = await request(app).get("/api/evolution/homologacao/agrupamento");
    expect(g.body.agrupamentoMs).toBe(300);
    const doBanco = await b.pool.query(`SELECT agrupamento_ms FROM evolution_homologacao_config WHERE empresa_id=5`);
    expect(Number(doBanco.rows[0].agrupamento_ms)).toBe(300);
  });
  it("zero: responde imediatamente, dentro da própria chamada", async () => {
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", novoId())).expect(200);
    expect(h.enviados).toHaveLength(1);
  });
  it("fragmentos dentro da janela viram UMA entrada, na ordem; fora da janela viram atendimentos separados", async () => {
    await b.pool.query(`UPDATE evolution_homologacao_config SET agrupamento_ms=400 WHERE empresa_id=5`);
    await enviarEvento(5, evento("inst5", DAYANA, "Boa tarde", novoId())).expect(200);
    await new Promise((r) => setTimeout(r, 120));
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", novoId())).expect(200);
    expect(await esperar(async () => (await saidas(DAYANA)).length >= 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const e1 = await entradas();
    expect(e1.filter((x) => x.processamento === "agrupada")).toHaveLength(1);
    expect(await saidas(DAYANA)).toHaveLength(1);
    expect(h.enviados).toHaveLength(1);
    // fora da janela
    await b.pool.query(`DELETE FROM evolution_mensagens`); h.enviados.length = 0;
    await enviarEvento(5, evento("inst5", DAYANA, "Boa tarde", novoId())).expect(200);
    expect(await esperar(async () => (await saidas(DAYANA)).length >= 1)).toBe(true);
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", novoId())).expect(200);
    expect(await esperar(async () => (await saidas(DAYANA)).length >= 2)).toBe(true);
    expect(h.enviados).toHaveLength(2);
    expect((await entradas()).filter((x) => x.processamento === "agrupada")).toHaveLength(0);
  });
});

describe("circuito WhatsApp: isolamento", () => {
  it("Carlúcia em modo humano não recebe resposta; Dayana sim; nada cruza os contextos", async () => {
    await enviarEvento(5, evento("inst5", CARLUCIA, "Qual o endereço?", novoId())).expect(200);
    await enviarEvento(5, evento("inst5", DAYANA, "Qual o endereço?", novoId())).expect(200);
    expect(await saidas(CARLUCIA)).toHaveLength(0);
    expect(await saidas(DAYANA)).toHaveLength(1);
    expect(h.enviados.map((x) => x.number)).toEqual([DAYANA]);
    const c = (await entradas()).find((x) => x.contato === CARLUCIA)!;
    expect(c.desfecho_atendimento).toBe("pausado_humano");
  });
  it("Carlúcia volta ao automático só quando o modo humano é desfeito, e a reversão ao humano funciona sem apagar histórico", async () => {
    await b.pool.query(`UPDATE telegram_atendimento SET modo='ia' WHERE cliente_id=$1`, [clienteCarlucia]);
    await enviarEvento(5, evento("inst5", CARLUCIA, "Qual o endereço?", novoId())).expect(200);
    expect(h.enviados).toHaveLength(1);
    expect(h.enviados[0].number).toBe(CARLUCIA);
    await b.pool.query(`UPDATE telegram_atendimento SET modo='humano' WHERE cliente_id=$1`, [clienteCarlucia]);
    await enviarEvento(5, evento("inst5", CARLUCIA, "Qual o endereço?", novoId())).expect(200);
    expect(h.enviados).toHaveLength(1);
    expect((await entradas()).filter((x) => x.contato === CARLUCIA)).toHaveLength(2);
  });
  it("duas clínicas não compartilham fonte, instância, segredo nem resposta", async () => {
    await enviarEvento(6, evento("inst6", CLINICA2, "Qual o endereço?", novoId())).expect(200);
    expect(h.enviados).toHaveLength(1);
    expect(h.enviados[0].text).toContain("Avenida Dois 200");
    expect(h.enviados[0].text).not.toContain("Rua Sintetica");
    expect((await saidas()).every((s: any) => Number(s.empresa_id) === 6)).toBe(true);
    // token da clínica 5 na clínica 6 é recusado; instância trocada é ignorada; contato da clínica 6 na 5 não é paciente de lá
    await enviarEvento(6, evento("inst6", CLINICA2, "oi", novoId()), "tok5").expect(403);
    await enviarEvento(6, evento("inst5", CLINICA2, "oi", novoId())).expect(200);
    await enviarEvento(5, evento("inst5", CLINICA2, "oi", novoId())).expect(200);
    expect(h.enviados.filter((x) => x.text.includes("Rua Sintetica"))).toHaveLength(0);
    expect((await entradas()).filter((x) => Number(x.empresa_id) === 5 && x.contato === CLINICA2).every((x: any) => x.processamento !== "concluido")).toBe(true);
  });
});

describe("circuito WhatsApp: fonte aprovada editada ou revogada", () => {
  it("orientação aprovada é usada; depois de revogada ou editada, a resposta antiga não é reutilizada", async () => {
    const ins = await b.pool.query(`INSERT INTO orientacoes_aprovadas (empresa_id,tema,perguntas_exemplo,resposta,status)
      VALUES (5,'estacionamento','tem estacionamento no local|onde estaciono o carro','Temos estacionamento conveniado ao lado.','aprovada') RETURNING id`);
    const id = ins.rows[0].id;
    await enviarEvento(5, evento("inst5", DAYANA, "Tem estacionamento no local?", novoId())).expect(200);
    expect(h.enviados[0]?.text).toBe("Temos estacionamento conveniado ao lado.");
    await b.pool.query(`UPDATE orientacoes_aprovadas SET status='inativa' WHERE id=$1`, [id]);
    await enviarEvento(5, evento("inst5", DAYANA, "Tem estacionamento no local?", novoId())).expect(200);
    expect(h.enviados.slice(1).map((x) => x.text)).not.toContain("Temos estacionamento conveniado ao lado.");
    expect(h.enviados.filter((x) => x.text === "Temos estacionamento conveniado ao lado.")).toHaveLength(1);
    await b.pool.query(`UPDATE orientacoes_aprovadas SET status='aprovada',resposta='Estacionamento novo na rua de trás.' WHERE id=$1`, [id]);
    await enviarEvento(5, evento("inst5", DAYANA, "Tem estacionamento no local?", novoId())).expect(200);
    expect(h.enviados.at(-1)?.text).toBe("Estacionamento novo na rua de trás.");
    expect(h.ia).not.toHaveBeenCalled();
  });
});
