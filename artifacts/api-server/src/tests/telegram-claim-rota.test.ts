/**
 * Deduplicação em TODOS os fluxos do webhook do Telegram (rota real; banco, Telegram e
 * cofre simulados). A semântica SQL da reivindicação está em
 * telegram-claim-banco-descartavel.test.ts; aqui a reivindicação é uma réplica em memória
 * com as MESMAS regras, para provar o comportamento da rota em cada fluxo.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const claimStore = vi.hoisted(() => new Map<string, "processando" | "concluido">());
const claimCalls = vi.hoisted(() => ({ concluir: [] as string[], liberar: [] as string[] }));
// Resolver do chat de alerta simulado: lê o ambiente (equivale ao processo com o cofre hidratado).
// A regra real (cofre > ambiente, validação numérica) é provada em telegram-config.test.ts.
vi.mock("../lib/telegram-config", () => ({
  chatIdValido: () => true,
  chatAlertaOuNull: async () => process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null,
  resolverChatAlerta: async () => {
    const c = process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null;
    return { chatId: c, fonte: c ? "ambiente" : "ausente", motivo: c ? null : "ausente" };
  },
}));
vi.mock("../lib/telegram-update-claim", async (orig) => ({
  ...(await orig<typeof import("../lib/telegram-update-claim")>()),
  reivindicarUpdate: vi.fn(async (_e: unknown, bot: string, id: number) => {
    const k = `${bot}:${id}`;
    const st = claimStore.get(k);
    if (!st) { claimStore.set(k, "processando"); return "reivindicado"; }
    return st === "concluido" ? "ja_concluido" : "em_andamento";
  }),
  concluirUpdate: vi.fn(async (_e: unknown, bot: string, id: number) => { claimStore.set(`${bot}:${id}`, "concluido"); claimCalls.concluir.push(`${bot}:${id}`); }),
  liberarUpdate: vi.fn(async (_e: unknown, bot: string, id: number) => {
    const k = `${bot}:${id}`;
    if (claimStore.get(k) === "processando") claimStore.delete(k);
    claimCalls.liberar.push(k);
  }),
}));

vi.mock("../lib/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const estado = vi.hoisted(() => ({
  vinculado: [] as unknown[],
  senhas: [] as unknown[],
  falhaSelect: null as null | { code: string },
}));
const mockExecute = vi.hoisted(() => vi.fn());
vi.mock("@workspace/db", async () => {
  const { respostaOutboxFake } = await import("./helpers/outbox-sql-fake");
  const chain = () => {
    const result = Promise.resolve(estado.senhas);
    const c: Record<string, unknown> & PromiseLike<unknown[]> = {
      from: vi.fn(() => c), where: vi.fn(() => c),
      limit: vi.fn(async () => {
        if (estado.falhaSelect) throw Object.assign(new Error("db fora"), estado.falhaSelect);
        return estado.vinculado;
      }),
      then: result.then.bind(result),
    };
    return c;
  };
  return {
    db: { select: () => chain(), execute: (...a: unknown[]) => respostaOutboxFake(a[0]) ?? mockExecute(...a) },
    clientsTable: {}, assinaturaTogglesAdminTable: {}, secureSettingsTable: {}, appSettingsTable: {},
  };
});
vi.mock("../lib/secure-settings.js", () => ({
  getSecret: vi.fn(async (k: string) => (k === "telegram.webhookSecret" ? "segredo-teste" : null)),
  getSecretStatus: vi.fn(), setSecret: vi.fn(), getSetting: vi.fn(), getJsonSetting: vi.fn(),
}));
const mockSend = vi.hoisted(() => vi.fn());
vi.mock("../lib/telegram.js", () => ({ sendTelegram: (...a: unknown[]) => mockSend(...a), getTelegramBotInfo: vi.fn() }));
vi.mock("../lib/slack-reporter.js", () => ({ postSlackAlert: vi.fn() }));
const mockConsumir = vi.hoisted(() => vi.fn());
vi.mock("../lib/telegram-magic-link", async (orig) => ({
  ...(await orig<typeof import("../lib/telegram-magic-link")>()),
  consumirLinkMagico: (...a: unknown[]) => mockConsumir(...a),
}));
vi.mock("../lib/assinatura/service.js", () => ({ enviarAssinatura: vi.fn(), receberWebhook: vi.fn(), listarTimeline: vi.fn(), obterPdfAssinado: vi.fn(), processarNotificacoes: vi.fn(), listarTemplates: vi.fn(), upsertTemplate: vi.fn() }));
vi.mock("../lib/assinatura/consentimento.js", () => ({ consentimentoAtivo: vi.fn(), assertConsentimento: vi.fn(), ConsentimentoPendenteError: class extends Error {} }));
vi.mock("../lib/assinatura/clausulas.js", () => ({ listarClausulas: vi.fn(), upsertClausula: vi.fn(), desativarClausula: vi.fn() }));
vi.mock("../lib/assinatura/contexto.js", () => ({ contextoPaciente: vi.fn() }));
vi.mock("../routes/collaborator.js", () => ({
  requireCollaborator: (_q: unknown, _s: unknown, n: () => void) => n(),
  collaboratorGuard: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a) => a), and: vi.fn((...a) => a), desc: vi.fn(), asc: vi.fn(), isNull: vi.fn(), gt: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

import express from "express";
import request from "supertest";
import { telegramWebhookRouter } from "../routes/assinaturas.js";
import { logger } from "../lib/logger.js";
import { linhaOutboxFake, configOutboxFake } from "./helpers/outbox-sql-fake";
import * as configTelegram from "../lib/telegram-config";

const app = () => { const a = express(); a.use(express.json()); a.use((q, _s, n) => { q.log = logger; n(); }); a.use(telegramWebhookRouter); return a; };
const enviar = (body: unknown) => request(app()).post("/webhooks/telegram").set("x-telegram-bot-api-secret-token", "segredo-teste").send(body as object);
const msg = (updateId: number, text: string, chat = 9001) => ({ update_id: updateId, message: { message_id: 1, chat: { id: chat }, text, date: 1 } });
const aguardar = () => new Promise<void>((r) => setTimeout(r, 30));
const sqlTexto = (q: { strings: readonly string[] }) => q.strings.join("?");
const escritas = (trecho: string) => mockExecute.mock.calls.map((c) => c[0]).filter((q) => sqlTexto(q).includes(trecho));

beforeEach(() => {
  vi.clearAllMocks();
  claimStore.clear(); claimCalls.concluir.length = 0; claimCalls.liberar.length = 0;
  estado.vinculado = []; estado.senhas = []; estado.falhaSelect = null;
  process.env["PADAXOR_TELEGRAM_CHAT_ID"] = "CEO_CHAT";
  linhaOutboxFake["chat_id_destino"] = "CEO_CHAT";
  configOutboxFake.reivindica = true; configOutboxFake.falhaRegistro = null;
  process.env["TELEGRAM_BOT_TOKEN"] = "111222333:token-sintetico-de-teste";
  mockSend.mockResolvedValue({ sent: true, mock: false });
  mockExecute.mockImplementation(async (q) => (sqlTexto(q).includes("INSERT INTO telegram_inbox_messages") ? { rows: [{ id: 1 }] } : { rows: [] }));
  mockConsumir.mockResolvedValue({ status: "vinculado", nome: "Ana Lima" });
});

describe("reentrega do MESMO update em cada fluxo: efeito acontece uma única vez", () => {
  it("F1 senha de validação (vínculo): 1 UPDATE e 1 boas-vindas; reentrega não repete nada", async () => {
    estado.senhas = [{ id: 7, name: "Ana Lima", vp: "SENHA123" }];
    expect((await enviar(msg(100, "SENHA123"))).status).toBe(200);
    await aguardar();
    expect(escritas("UPDATE clients SET telegram_chat_id")).toHaveLength(1);
    const enviosPrimeira = mockSend.mock.calls.length;
    expect(enviosPrimeira).toBeGreaterThan(0);

    expect((await enviar(msg(100, "SENHA123"))).status).toBe(200);
    await aguardar();
    expect(escritas("UPDATE clients SET telegram_chat_id")).toHaveLength(1);
    expect(mockSend.mock.calls.length).toBe(enviosPrimeira);
  });

  it("F2 chat sem vínculo e sem senha: instrução enviada uma vez só", async () => {
    await enviar(msg(101, "oi"));
    await aguardar();
    const n = mockSend.mock.calls.length;
    expect(n).toBe(1);
    await enviar(msg(101, "oi"));
    await aguardar();
    expect(mockSend.mock.calls.length).toBe(1);
  });

  it("F3 link mágico (/start TOKEN): consome o token uma vez; reentrega NÃO manda 'não foi possível ativar'", async () => {
    await enviar(msg(102, "/start abcdef1234567890xyz"));
    await aguardar();
    expect(mockConsumir).toHaveBeenCalledTimes(1);
    mockConsumir.mockResolvedValue({ status: "invalido" }); // o que a 2ª tentativa devolveria sem dedupe
    await enviar(msg(102, "/start abcdef1234567890xyz"));
    await aguardar();
    expect(mockConsumir).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls.some((c) => String(c[1]).includes("Não foi possível ativar"))).toBe(false);
  });

  it("F4 /start de cliente já vinculado: resposta uma vez só", async () => {
    estado.vinculado = [{ id: 7, name: "Ana Lima", cpf: "1", empresaId: 5 }];
    await enviar(msg(103, "/start"));
    await enviar(msg(103, "/start"));
    await aguardar();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("F5 mensagem de cliente vinculado: gravada e repassada uma vez só", async () => {
    estado.vinculado = [{ id: 7, name: "Ana Lima", cpf: "12345678900", empresaId: 5 }];
    await enviar(msg(104, "preciso de ajuda"));
    await enviar(msg(104, "preciso de ajuda"));
    await aguardar();
    expect(escritas("INSERT INTO telegram_inbox_messages")).toHaveLength(1);
    expect(mockSend.mock.calls.filter((c) => c[0] === "CEO_CHAT")).toHaveLength(1);
  });
});

describe("chave por identidade do bot", () => {
  it("B1 mesmo update_id em bots diferentes: ambos processam (sem colisão)", async () => {
    await enviar(msg(200, "oi"));
    process.env["TELEGRAM_BOT_TOKEN"] = "999888777:outro-token-sintetico";
    await enviar(msg(200, "oi"));
    await aguardar();
    expect([...claimStore.keys()].sort()).toEqual(["111222333:200", "999888777:200"]);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
  it("B2 o token nunca aparece em log nem na chave (só a parte numérica)", async () => {
    await enviar(msg(201, "oi"));
    await aguardar();
    const tudo = JSON.stringify([...claimStore.keys(), (logger.info as any).mock.calls, (logger.warn as any).mock.calls, (logger.error as any).mock.calls]);
    expect(tudo).not.toContain("token-sintetico");
  });
});

describe("falhas, concorrência e reinício", () => {
  it("registro durável do atendimento falha: inbox permanece e reentrega duplicada recupera antes do aceite",async()=>{
    estado.vinculado=[{id:7,name:"Nome Sintético",empresaId:5}];
    let falha=true;
    mockExecute.mockImplementation(async(q)=>{
      const texto=sqlTexto(q);
      if(texto.includes("INSERT INTO telegram_atendimento_respostas")&&falha) throw Object.assign(new Error("banco sintético indisponível"),{code:"ECONNREFUSED"});
      if(texto.includes("INSERT INTO telegram_inbox_messages")) return {rows:falha?[{id:77}]:[]};
      if(texto.includes("SELECT id FROM telegram_inbox_messages")) return {rows:[{id:77}]};
      return {rows:[]};
    });
    expect((await enviar(msg(299,"ENTRADA SINTÉTICA"))).status).toBe(500);
    expect(claimStore.has("111222333:299")).toBe(false);
    expect(escritas("INSERT INTO telegram_inbox_messages")).toHaveLength(1);
    falha=false;
    expect((await enviar(msg(299,"ENTRADA SINTÉTICA"))).status).toBe(200);
    expect(escritas("INSERT INTO telegram_atendimento_respostas")).toHaveLength(2);
    expect(claimStore.get("111222333:299")).toBe("concluido");
  });
  it("X1 falha técnica passageira: 500, reivindicação LIBERADA, reentrega processa de verdade", async () => {
    estado.falhaSelect = { code: "ECONNREFUSED" };
    expect((await enviar(msg(300, "oi"))).status).toBe(500);
    await aguardar();
    expect(claimCalls.liberar).toEqual(["111222333:300"]);
    expect(claimStore.has("111222333:300")).toBe(false);

    estado.falhaSelect = null;
    expect((await enviar(msg(300, "oi"))).status).toBe(200);
    await aguardar();
    expect(claimStore.get("111222333:300")).toBe("concluido");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("X2 reentrega durante processamento recente (estado 'processando'): 500, nunca 200 (a mensagem não se perde)", async () => {
    claimStore.set("111222333:301", "processando");
    const res = await enviar(msg(301, "oi"));
    expect(res.status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
    expect(escritas("INSERT INTO telegram_inbox_messages")).toHaveLength(0);
  });

  it("X3 falha estrutural ao gravar libera reivindicação para recuperação (500)", async () => {
    estado.vinculado = [{ id: 7, name: "Ana", cpf: "1", empresaId: 5 }];
    mockExecute.mockImplementation(async (q) => {
      if (sqlTexto(q).includes("INSERT INTO telegram_inbox_messages")) throw Object.assign(new Error("fk"), { code: "23503" });
      return { rows: [] };
    });
    expect((await enviar(msg(302, "texto sigiloso do paciente"))).status).toBe(500);
    await aguardar();
    expect(claimCalls.concluir).toEqual([]);
    expect(claimStore.has("111222333:302")).toBe(false);
    const logs = JSON.stringify([(logger.error as any).mock.calls, (logger.warn as any).mock.calls, (logger.info as any).mock.calls]);
    expect(logs).not.toContain("texto sigiloso");
  });

  it("X4 duas entregas simultâneas do mesmo update: só uma executa os efeitos", async () => {
    estado.senhas = [{ id: 7, name: "Ana Lima", vp: "SENHA123" }];
    const [a, b] = await Promise.all([enviar(msg(303, "SENHA123")), enviar(msg(303, "SENHA123"))]);
    await aguardar();
    // A repetida vê 'concluído' (200) ou 'em andamento' (500, pede nova tentativa); nunca repete efeito.
    expect([a.status, b.status].every((x) => x === 200 || x === 500)).toBe(true);
    expect([a.status, b.status]).toContain(200);
    expect(escritas("UPDATE clients SET telegram_chat_id")).toHaveLength(1);
  });
});

describe("eventos sem chat e sem update_id", () => {
  it("E1 evento sem mensagem (ex.: callback_query): 200, nenhum efeito, log só com o tipo", async () => {
    const res = await enviar({ update_id: 400, callback_query: { id: "x", data: "dado-sensivel" } });
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ tipo: "callback_query" }, expect.stringContaining("ignorado"));
    expect(JSON.stringify((logger.info as any).mock.calls)).not.toContain("dado-sensivel");
  });
  it("E2 sem update_id válido: processa sem dedupe e registra aviso", async () => {
    await enviar({ message: { chat: { id: 9001 }, text: "oi", date: 1 } });
    await aguardar();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(claimStore.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("sem update_id"));
  });
});

describe("repasse ao chat de alerta: registro durável antes do 200", () => {
  const vinc = () => { estado.vinculado = [{ id: 7, name: "Ana Lima", cpf: "12345678900", empresaId: 5 }]; };

  it("D1 falha TRANSITÓRIA ao registrar no outbox: 500 (Telegram reentrega), claim liberada; reentrega recupera o repasse", async () => {
    vinc();
    configOutboxFake.falhaRegistro = Object.assign(new Error("db fora"), { code: "ECONNREFUSED" });
    expect((await enviar(msg(500, "oi"))).status).toBe(500);
    await aguardar();
    expect(claimCalls.liberar).toEqual(["111222333:500"]);
    expect(mockSend).not.toHaveBeenCalled();

    configOutboxFake.falhaRegistro = null;
    mockExecute.mockImplementation(async (q) => (sqlTexto(q).includes("INSERT INTO telegram_inbox_messages") ? { rows: [] } : { rows: [{ id: 1 }] })); // inbox já salva = duplicada
    expect((await enviar(msg(500, "oi"))).status).toBe(200);
    await aguardar();
    expect(mockSend.mock.calls.filter((c) => c[0] === "CEO_CHAT")).toHaveLength(1);
  });

  it("D2 falha estrutural no outbox: 500, sem envio direto e ERROR sem texto", async () => {
    vinc();
    configOutboxFake.falhaRegistro = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    expect((await enviar(msg(501, "texto sigiloso"))).status).toBe(500);
    await aguardar();
    expect(mockSend).not.toHaveBeenCalled();
    expect((logger.error as any).mock.calls.some((c: unknown[]) => String(c[1]).includes("outbox indisponível"))).toBe(true);
    expect(JSON.stringify((logger.error as any).mock.calls)).not.toContain("texto sigiloso");
  });

  it.each(["destino_alterado", "cofre_indisponivel"])(
    "webhook → outbox → processador: %s após registro não envia",
    async (falha) => {
      vinc();
      let chamadas = 0;
      const spy = vi.spyOn(configTelegram, "resolverChatAlerta").mockImplementation(async () => {
        chamadas++;
        if (chamadas === 1) return { chatId: "CEO_CHAT", fonte: "cofre", motivo: null };
        return falha === "destino_alterado"
          ? { chatId: "OUTRO_DESTINO", fonte: "cofre", motivo: null }
          : { chatId: null, fonte: "ausente", motivo: "cofre_indisponivel" };
      });
      try {
        expect((await enviar(msg(505, "teste sintetico"))).status).toBe(200);
        await aguardar();
        expect(chamadas).toBeGreaterThanOrEqual(2);
        expect(mockSend).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ estado: falha === "destino_alterado" ? "esgotado" : "incerto" }),
          expect.stringContaining("não aceito"),
        );
      } finally { spy.mockRestore(); }
    },
  );

  it("D3 ACK só depois do fechamento: ao receber o 200, a reivindicação já está concluída", async () => {
    vinc();
    const res = await enviar(msg(502, "oi"));
    expect(res.status).toBe(200);
    expect(claimCalls.concluir).toEqual(["111222333:502"]); // sem aguardar nada depois da resposta
  });

  it("D4 cofre do segredo indisponível: 500 (reentrega), nenhum efeito", async () => {
    const { getSecret } = await import("../lib/secure-settings.js");
    (getSecret as any).mockRejectedValueOnce(Object.assign(new Error("cofre fora"), { code: "ECONNREFUSED" }));
    expect((await enviar(msg(503, "oi"))).status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("vínculo ambíguo (mesmo chat em mais de um cliente)", () => {
  it("V1 não escolhe cliente, não grava no prontuário, guarda pendência e avisa o chat de alerta; reentrega não reavisa", async () => {
    estado.vinculado = [{ id: 7, name: "Ana Lima", cpf: "1", empresaId: 5 }, { id: 8, name: "Ana Lima Filha", cpf: "2", empresaId: 5 }];
    mockExecute.mockImplementation(async (q) => (sqlTexto(q).includes("INSERT INTO telegram_vinculo_pendencias") ? { rows: [{ id: 1 }] } : { rows: [] }));
    expect((await enviar(msg(700, "mensagem sintetica"))).status).toBe(200);
    await aguardar();
    expect(escritas("INSERT INTO telegram_vinculo_pendencias")).toHaveLength(1);
    expect(escritas("INSERT INTO telegram_inbox_messages")).toHaveLength(0);
    const avisos = mockSend.mock.calls.filter((c) => c[0] === "CEO_CHAT");
    expect(avisos).toHaveLength(1);
    expect(String(avisos[0][1])).not.toContain("mensagem sintetica"); // aviso sem conteúdo clínico
    // reentrega: pendência já existe (INSERT não devolve linha) => sem novo aviso
    mockSend.mockClear();
    mockExecute.mockImplementation(async () => ({ rows: [] }));
    estado.vinculado = [{ id: 7, name: "Ana Lima", cpf: "1", empresaId: 5 }, { id: 8, name: "Ana Lima Filha", cpf: "2", empresaId: 5 }];
    expect((await enviar(msg(700, "mensagem sintetica"))).status).toBe(200);
    await aguardar();
    expect(mockSend.mock.calls.filter((c) => c[0] === "CEO_CHAT")).toHaveLength(0);
  });
});
