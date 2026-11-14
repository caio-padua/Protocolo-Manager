/**
 * Conversa de visitante (quem ainda não é cliente) em PostgreSQL descartável, dados sintéticos.
 * A base NÃO tem tabela de clientes: se a conversa tentasse ler dados de cliente, falharia.
 * Telegram e configurações são simulados; nada é enviado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

const cfg = vi.hoisted(() => ({ modo: "ligado" as string, lista: "[]" }));
const enviados = vi.hoisted(() => [] as Array<{ chat: string; texto: string }>);

vi.mock("../lib/secure-settings", () => ({
  getSetting: vi.fn(async (k: string) => (k === "atendimento.ia.modo" ? cfg.modo : k === "atendimento.visitantes.permitidos" ? cfg.lista : null)),
  getSecret: vi.fn(async () => null), getJsonSetting: vi.fn(), setSecret: vi.fn(), getSecretStatus: vi.fn(),
}));
vi.mock("../lib/telegram", () => ({
  sendTelegram: vi.fn(async (chat: string, texto: string) => { enviados.push({ chat, texto }); return { sent: true }; }),
}));
vi.mock("../lib/telegram-config", () => ({ chatAlertaOuNull: async () => "EQUIPE" }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const pg = iniciarPgDescartavel();
let store: typeof import("../lib/telegram-agendamento-store");
let pool: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }>; end: () => Promise<void> };
process.env.DATABASE_URL = pg.url;

beforeAll(async () => {
  pool = (await import("@workspace/db")).pool as unknown as typeof pool;
  await pool.query(`CREATE TABLE empresas (id int PRIMARY KEY, nome text)`);
  await pool.query(`INSERT INTO empresas VALUES (5, 'Clinica Sintetica')`);
  store = await import("../lib/telegram-agendamento-store");
  const { db } = await import("@workspace/db");
  await store.aplicarMigracaoAgendamentoTelegram(db);
}, 60_000);
afterAll(async () => { try { await pool?.end(); } catch { /* ignora */ } pg.parar(); });
beforeEach(() => { enviados.length = 0; cfg.modo = "ligado"; cfg.lista = "[]"; });

const para = (chat: string) => enviados.filter((e) => e.chat === chat).map((e) => e.texto);

describe("visitante sem senha e sem cadastro", () => {
  it("modo ligado atende qualquer pessoa nova; lista só autorizados; desligado ninguém", async () => {
    expect(await store.visitanteAutorizado("chat-novo")).toBe(true);
    cfg.modo = "lista"; expect(await store.visitanteAutorizado("chat-novo")).toBe(false);
    cfg.lista = JSON.stringify(["chat-novo"]); expect(await store.visitanteAutorizado("chat-novo")).toBe(true);
    cfg.modo = "desligado"; expect(await store.visitanteAutorizado("chat-novo")).toBe(false);
  });

  it("pergunta geral: responde, registra a mensagem e avisa a equipe", async () => {
    await store.atenderVisitante("v-geral", "Vocês atendem convênio?", 1001, 5);
    const resp = para("v-geral");
    expect(resp.length).toBe(1);
    expect(resp[0]).toContain("Clinica Sintetica");
    expect(para("EQUIPE").some((t) => t.includes("precisa da equipe"))).toBe(true);
    const { rows } = await pool.query(`SELECT direcao FROM telegram_visitante_mensagens WHERE chat_id='v-geral' ORDER BY id`);
    expect(rows.map((r) => r.direcao)).toEqual(["entrada", "saida"]);
  });

  it("pedido de agendamento: conduz a conversa pedindo a modalidade, sem reservar nada", async () => {
    await store.atenderVisitante("v-agenda", "Quero marcar uma consulta", 1002, 5);
    expect(para("v-agenda")[0]).toMatch(/online ou presencial/i);
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM telegram_pedidos_agendamento WHERE chat_id='v-agenda'`);
    expect(rows[0].n).toBe(0); // ainda é conversa; pedido só nasce com nome e telefone
  });

  it("queixa de saúde: sem orientação clínica automática, pausa e chama a equipe", async () => {
    await store.atenderVisitante("v-saude", "Estou com dor no peito forte", 1003, 5);
    const resp = para("v-saude")[0];
    expect(resp).toContain("avisei a equipe");
    expect(resp).not.toMatch(/tome|dose|medicamento/i);
    const { rows } = await pool.query(`SELECT 1 FROM telegram_agendamento_estado WHERE chave='pausa:v-saude'`);
    expect(rows.length).toBe(1);
  });

  it("entrega repetida do mesmo update não duplica resposta", async () => {
    await store.atenderVisitante("v-dup", "Quero marcar", 1004, 5);
    const n = enviados.length;
    await store.atenderVisitante("v-dup", "Quero marcar", 1004, 5);
    expect(enviados.length).toBe(n);
  });

  it("acima do limite por hora só registra, sem resposta automática", async () => {
    for (let i = 0; i < 35; i++) await pool.query(`INSERT INTO telegram_visitante_mensagens (chat_id, direcao, texto, update_id) VALUES ('v-spam','entrada','x',${5000 + i})`);
    enviados.length = 0;
    await store.atenderVisitante("v-spam", "Quero marcar", 9999, 5);
    expect(para("v-spam")).toEqual([]);
  });
});
