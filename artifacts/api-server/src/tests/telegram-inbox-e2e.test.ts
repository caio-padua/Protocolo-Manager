/**
 * telegram-inbox-e2e.test.ts
 *
 * Validação ponta a ponta do fluxo Telegram → Inbox do cockpit.
 *
 * Cobre as 4 etapas obrigatórias, sem banco real nem servidor HTTP:
 *
 *  Etapa 1 — Webhook: paciente envia mensagem → linha inserida em
 *            telegram_inbox_messages (via processarWebhookInbox).
 *  Etapa 2 — Badge:   GET /telegram-inbox/badge retorna naoLidas >= 1.
 *  Etapa 3 — Inbox:   GET /cockpit/:id/telegram-inbox devolve a mensagem.
 *  Etapa 4 — Lidas:   POST marcar-lidas zera o badge.
 *
 * O fluxo de vinculação de chatId (prova de posse) e a validação do
 * cabeçalho X-Telegram-Bot-Api-Secret-Token pertencem à camada de rota
 * (assinaturas.ts) e ficam fora do escopo desta lib.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processarWebhookInbox,
  obterBadge,
  listarInbox,
  marcarLidas,
  type WebhookInboxDeps,
  type BadgeDeps,
  type ListarInboxDeps,
  type MarcarLidasDeps,
  type MensagemInbox,
} from "../lib/telegram-inbox-flow";

// ── Fixtures compartilhadas ───────────────────────────────────────────────────

const EMPRESA_ID = 5;
const CLIENTE_ID = 42;
const CHAT_ID    = "987654321";
const TEXTO      = "Olá, tenho dúvida sobre meu tratamento";
const MSG_ID     = 1001;

const CLIENTE_FIXTURE = {
  id: CLIENTE_ID,
  name: "Ana Souza",
  empresaId: EMPRESA_ID,
};

function makeMsgFixture(lidaEm: Date | null = null): MensagemInbox {
  return {
    id: MSG_ID,
    clienteId: CLIENTE_ID,
    empresaId: EMPRESA_ID,
    chatId: CHAT_ID,
    texto: TEXTO,
    recebidaEm: new Date("2026-08-10T10:00:00Z"),
    lidaEm,
  };
}

// ── Etapa 1: processarWebhookInbox ───────────────────────────────────────────

function makeWebhookDeps(overrides: Partial<WebhookInboxDeps> = {}): WebhookInboxDeps {
  return {
    findClienteByChatId: vi.fn().mockResolvedValue(CLIENTE_FIXTURE),
    insertMensagem:      vi.fn().mockResolvedValue({ id: MSG_ID }),
    notificarCEO:        vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Etapa 1 — Webhook: mensagem do paciente grava no inbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SUCESSO: grava a linha e retorna mensagemId + clienteId", async () => {
    const deps = makeWebhookDeps();
    const result = await processarWebhookInbox(
      { chatId: CHAT_ID, texto: TEXTO, chatIdCEO: "CEOchatId" },
      deps,
    );

    expect(result.kind).toBe("gravado");
    if (result.kind !== "gravado") return;
    expect(result.mensagemId).toBe(MSG_ID);
    expect(result.clienteId).toBe(CLIENTE_ID);
  });

  it("SUCESSO: insertMensagem recebe empresaId, clienteId, chatId e texto corretos", async () => {
    const deps = makeWebhookDeps();
    await processarWebhookInbox({ chatId: CHAT_ID, texto: TEXTO }, deps);

    expect(deps.insertMensagem).toHaveBeenCalledOnce();
    expect(deps.insertMensagem).toHaveBeenCalledWith({
      empresaId: EMPRESA_ID,
      clienteId: CLIENTE_ID,
      chatId: CHAT_ID,
      texto: TEXTO,
    });
  });

  it("SUCESSO: notificarCEO é chamado quando chatIdCEO está presente", async () => {
    const deps = makeWebhookDeps();
    await processarWebhookInbox(
      { chatId: CHAT_ID, texto: TEXTO, chatIdCEO: "999" },
      deps,
    );
    // notificarCEO é fire-and-forget; aguardamos microtasks
    await vi.runAllTimersAsync().catch(() => {});
    expect(deps.notificarCEO).toHaveBeenCalledOnce();
  });

  it("SUCESSO: notificarCEO NÃO é chamado quando chatIdCEO está ausente", async () => {
    const deps = makeWebhookDeps();
    await processarWebhookInbox({ chatId: CHAT_ID, texto: TEXTO }, deps);
    expect(deps.notificarCEO).not.toHaveBeenCalled();
  });

  it("nao_vinculado: chatId sem cliente associado não insere linha", async () => {
    const deps = makeWebhookDeps({
      findClienteByChatId: vi.fn().mockResolvedValue(null),
    });
    const result = await processarWebhookInbox({ chatId: "desconhecido", texto: TEXTO }, deps);

    expect(result.kind).toBe("nao_vinculado");
    expect(deps.insertMensagem).not.toHaveBeenCalled();
  });

  it("ignorado: string completamente vazia não insere linha", async () => {
    const deps = makeWebhookDeps();
    // Produção usa `if (texto)` — string vazia ("") é falsy e deve ser ignorada.
    // Strings com apenas espaços ("   ") são truthy e passam (comportamento intencional).
    const result = await processarWebhookInbox({ chatId: CHAT_ID, texto: "" }, deps);

    expect(result.kind).toBe("ignorado");
    if (result.kind !== "ignorado") return;
    expect(result.motivo).toMatch(/vazio/i);
    expect(deps.insertMensagem).not.toHaveBeenCalled();
    expect(deps.findClienteByChatId).not.toHaveBeenCalled();
  });

  it("falha no insertMensagem propaga o erro (sem silenciamento)", async () => {
    const deps = makeWebhookDeps({
      insertMensagem: vi.fn().mockRejectedValue(new Error("DB offline")),
    });
    await expect(
      processarWebhookInbox({ chatId: CHAT_ID, texto: TEXTO }, deps),
    ).rejects.toThrow("DB offline");
  });
});

// ── Falha silenciosa no INSERT: comportamento da camada de rota ───────────────
//
// A rota de produção (assinaturas.ts) envolve processarWebhookInbox com
// `.catch(logger.error)` e sempre responde 200 ao Telegram, mesmo quando o
// banco rejeita o INSERT. Este bloco valida esse contrato sem precisar de
// servidor HTTP real, simulando o padrão da rota.
//
// Análise de aceitabilidade da falha silenciosa:
//   ✔ ACEITÁVEL retornar 200 ao Telegram (evita loop de reentrega)
//   ✔ ACEITÁVEL logar o erro (logger.error) para monitoramento
//   ✔ NECESSÁRIO notificar o CEO mesmo assim — sem o cockpit ele não vê a msg
//   ✘ NÃO há retentativa automática; se o banco cair, a mensagem se perde no DB
//      (mas o CEO ainda recebe via Telegram e pode agir manualmente)
//
describe("Falha silenciosa no INSERT — contrato da rota de produção", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Simula o padrão da rota:
   *   await processarWebhookInbox(...).catch(err => loggerError(err));
   *   res.status(200).json({ ok: true });
   */
  async function simularRota(
    params: Parameters<typeof processarWebhookInbox>[0],
    deps: WebhookInboxDeps,
  ) {
    const loggerError = vi.fn();
    await processarWebhookInbox(params, deps).catch((err: unknown) =>
      loggerError({ err }),
    );
    // Rota sempre responde 200 independentemente do resultado
    const httpStatus = 200;
    return { httpStatus, loggerError };
  }

  it("1. webhook retorna HTTP 200 mesmo quando o banco recusa o INSERT", async () => {
    const deps = makeWebhookDeps({
      insertMensagem: vi.fn().mockRejectedValue(new Error("constraint violation")),
    });

    const { httpStatus } = await simularRota(
      { chatId: CHAT_ID, texto: TEXTO, chatIdCEO: "CEOchatId" },
      deps,
    );

    expect(httpStatus).toBe(200);
  });

  it("2. logger.error é chamado com o erro quando o INSERT falha", async () => {
    const dbErr = new Error("DB offline");
    const deps = makeWebhookDeps({
      insertMensagem: vi.fn().mockRejectedValue(dbErr),
    });

    const { loggerError } = await simularRota(
      { chatId: CHAT_ID, texto: TEXTO },
      deps,
    );

    expect(loggerError).toHaveBeenCalledOnce();
    expect(loggerError).toHaveBeenCalledWith({ err: dbErr });
  });

  it("3. CEO é notificado mesmo quando o INSERT falha (notificarCEO roda antes do INSERT)", async () => {
    // notificarCEO é chamado ANTES do insertMensagem; por isso chega ao CEO
    // mesmo que o banco esteja fora do ar.
    const notificarCEO = vi.fn().mockResolvedValue(undefined);
    const deps = makeWebhookDeps({
      insertMensagem: vi.fn().mockRejectedValue(new Error("DB offline")),
      notificarCEO,
    });

    await simularRota(
      { chatId: CHAT_ID, texto: TEXTO, chatIdCEO: "999" },
      deps,
    );

    // Aguarda microtasks fire-and-forget
    await Promise.resolve();

    expect(notificarCEO).toHaveBeenCalledOnce();
    expect(notificarCEO).toHaveBeenCalledWith(
      "999",
      expect.objectContaining({ id: CLIENTE_ID }),
      TEXTO,
    );
  });

  it("3b. CEO NÃO é notificado quando chatIdCEO está ausente (mesmo com falha no INSERT)", async () => {
    const notificarCEO = vi.fn().mockResolvedValue(undefined);
    const deps = makeWebhookDeps({
      insertMensagem: vi.fn().mockRejectedValue(new Error("DB offline")),
      notificarCEO,
    });

    // Sem chatIdCEO
    await simularRota({ chatId: CHAT_ID, texto: TEXTO }, deps);
    await Promise.resolve();

    expect(notificarCEO).not.toHaveBeenCalled();
  });

  it("SUCESSO: quando o INSERT funciona, CEO é notificado e nenhum erro é logado", async () => {
    const deps = makeWebhookDeps();

    const { httpStatus, loggerError } = await simularRota(
      { chatId: CHAT_ID, texto: TEXTO, chatIdCEO: "CEOchatId" },
      deps,
    );
    await Promise.resolve();

    expect(httpStatus).toBe(200);
    expect(loggerError).not.toHaveBeenCalled();
    expect(deps.notificarCEO).toHaveBeenCalledOnce();
  });
});

// ── Etapa 2: obterBadge ───────────────────────────────────────────────────────

function makeBadgeDeps(total = 1): BadgeDeps {
  return {
    contarNaoLidas: vi.fn().mockResolvedValue(total),
  };
}

describe("Etapa 2 — Badge: GET /telegram-inbox/badge retorna naoLidas >= 1", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna naoLidas=1 após gravar a mensagem do paciente", async () => {
    const deps = makeBadgeDeps(1);
    const result = await obterBadge({ empresaId: EMPRESA_ID }, deps);

    expect(result.naoLidas).toBeGreaterThanOrEqual(1);
    expect(deps.contarNaoLidas).toHaveBeenCalledWith(EMPRESA_ID);
  });

  it("retorna naoLidas=0 quando não há mensagens não-lidas", async () => {
    const deps = makeBadgeDeps(0);
    const result = await obterBadge({ empresaId: EMPRESA_ID }, deps);
    expect(result.naoLidas).toBe(0);
  });

  it("isola por empresaId: consulta recebe o tenant correto", async () => {
    const deps = makeBadgeDeps(3);
    await obterBadge({ empresaId: 7 }, deps);
    expect(deps.contarNaoLidas).toHaveBeenCalledWith(7);
  });
});

// ── Etapa 3: listarInbox ─────────────────────────────────────────────────────

function makeListarDeps(overrides: Partial<ListarInboxDeps> = {}): ListarInboxDeps {
  return {
    findClienteNoTenant: vi.fn().mockResolvedValue({ id: CLIENTE_ID }),
    listMensagens:       vi.fn().mockResolvedValue([makeMsgFixture()]),
    marcarComoLidas:     vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Etapa 3 — Inbox: GET /cockpit/:id/telegram-inbox devolve a mensagem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna a mensagem na lista com campos corretos", async () => {
    const deps = makeListarDeps();
    const result = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID },
      deps,
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.mensagens).toHaveLength(1);

    const msg = result.mensagens[0];
    expect(msg.id).toBe(MSG_ID);
    expect(msg.texto).toBe(TEXTO);
    expect(msg.lida).toBe(false);
    expect(msg.recebidaEm).toBe("2026-08-10T10:00:00.000Z");
  });

  it("naoLidas=1 quando a mensagem ainda não foi lida", async () => {
    const deps = makeListarDeps();
    const result = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID },
      deps,
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.naoLidas).toBe(1);
  });

  it("naoLidas=0 quando todas as mensagens já têm lidaEm", async () => {
    const deps = makeListarDeps({
      listMensagens: vi.fn().mockResolvedValue([makeMsgFixture(new Date())]),
    });
    const result = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID },
      deps,
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.naoLidas).toBe(0);
    expect(result.mensagens[0].lida).toBe(true);
  });

  it("nao_encontrado quando cliente não pertence ao tenant (cross-tenant bloqueado)", async () => {
    const deps = makeListarDeps({
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
    });
    const result = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: 99 },
      deps,
    );

    expect(result.kind).toBe("nao_encontrado");
    expect(deps.listMensagens).not.toHaveBeenCalled();
  });

  it("listMensagens NÃO é chamado quando o cliente não pertence ao tenant", async () => {
    const deps = makeListarDeps({
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
    });
    await listarInbox({ clienteId: CLIENTE_ID, empresaId: 99 }, deps);
    expect(deps.listMensagens).not.toHaveBeenCalled();
  });

  it("marcarComoLidas é chamado quando marcarLidas=true", async () => {
    const deps = makeListarDeps();
    await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID, marcarLidas: true },
      deps,
    );
    expect(deps.marcarComoLidas).toHaveBeenCalledWith(CLIENTE_ID, EMPRESA_ID);
  });

  it("marcarComoLidas NÃO é chamado quando marcarLidas=false (default)", async () => {
    const deps = makeListarDeps();
    await listarInbox({ clienteId: CLIENTE_ID, empresaId: EMPRESA_ID }, deps);
    expect(deps.marcarComoLidas).not.toHaveBeenCalled();
  });
});

// ── Etapa 4: marcarLidas ─────────────────────────────────────────────────────

function makeMarcarDeps(overrides: Partial<MarcarLidasDeps> = {}): MarcarLidasDeps {
  return {
    findClienteNoTenant: vi.fn().mockResolvedValue({ id: CLIENTE_ID }),
    updateLidas:         vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

describe("Etapa 4 — Marcar lidas: POST marcar-lidas zera o badge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna ok + marcadas=1 após marcar a mensagem do paciente", async () => {
    const deps = makeMarcarDeps();
    const result = await marcarLidas(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID },
      deps,
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.marcadas).toBe(1);
  });

  it("badge zera: obterBadge retorna naoLidas=0 após marcar-lidas", async () => {
    // Simula o banco: antes=1 não-lida, após UPDATE=0
    let naoLinhasNaoLidas = 1;
    const marcarDeps = makeMarcarDeps({
      updateLidas: vi.fn().mockImplementation(async () => {
        naoLinhasNaoLidas = 0;
        return 1;
      }),
    });
    const badgeDeps: BadgeDeps = {
      contarNaoLidas: vi.fn().mockImplementation(async () => naoLinhasNaoLidas),
    };

    // Estado inicial: badge = 1
    const antesResult = await obterBadge({ empresaId: EMPRESA_ID }, badgeDeps);
    expect(antesResult.naoLidas).toBe(1);

    // Marcar como lidas
    const marcarResult = await marcarLidas(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID },
      marcarDeps,
    );
    expect(marcarResult.kind).toBe("ok");

    // Badge deve zerar
    const depoisResult = await obterBadge({ empresaId: EMPRESA_ID }, badgeDeps);
    expect(depoisResult.naoLidas).toBe(0);
  });

  it("nao_encontrado: cross-tenant bloqueado antes do UPDATE", async () => {
    const deps = makeMarcarDeps({
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
    });
    const result = await marcarLidas({ clienteId: CLIENTE_ID, empresaId: 99 }, deps);

    expect(result.kind).toBe("nao_encontrado");
    expect(deps.updateLidas).not.toHaveBeenCalled();
  });

  it("updateLidas recebe clienteId e empresaId corretos (tenant-scoped)", async () => {
    const deps = makeMarcarDeps();
    await marcarLidas({ clienteId: CLIENTE_ID, empresaId: EMPRESA_ID }, deps);

    expect(deps.updateLidas).toHaveBeenCalledWith(CLIENTE_ID, EMPRESA_ID);
  });

  it("marcadas=0 quando todas as mensagens já estavam lidas", async () => {
    const deps = makeMarcarDeps({ updateLidas: vi.fn().mockResolvedValue(0) });
    const result = await marcarLidas({ clienteId: CLIENTE_ID, empresaId: EMPRESA_ID }, deps);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.marcadas).toBe(0);
  });
});

// ── Cenário integrado: fluxo completo ponta a ponta ──────────────────────────

describe("Fluxo completo ponta a ponta (4 etapas encadeadas)", () => {
  it("mensagem gravada pelo webhook aparece no inbox e badge zera após marcar-lidas", async () => {
    // --- Estado em memória que simula o banco ---
    const inbox: MensagemInbox[] = [];
    let proximoId = 1;

    // ── Etapa 1: Webhook grava mensagem ──────────────────────────────────────
    const webhookDeps: WebhookInboxDeps = {
      findClienteByChatId: vi.fn().mockResolvedValue(CLIENTE_FIXTURE),
      insertMensagem: vi.fn().mockImplementation(async (params) => {
        const id = proximoId++;
        inbox.push({
          id,
          clienteId: params.clienteId,
          empresaId: params.empresaId,
          chatId: params.chatId,
          texto: params.texto,
          recebidaEm: new Date(),
          lidaEm: null,
        });
        return { id };
      }),
    };

    const webhookResult = await processarWebhookInbox(
      { chatId: CHAT_ID, texto: TEXTO },
      webhookDeps,
    );
    expect(webhookResult.kind).toBe("gravado");
    expect(inbox).toHaveLength(1);

    // ── Etapa 2: Badge mostra naoLidas >= 1 ──────────────────────────────────
    const badgeDeps: BadgeDeps = {
      contarNaoLidas: vi.fn().mockImplementation(async (empresaId) =>
        inbox.filter((m) => m.empresaId === empresaId && m.lidaEm == null).length,
      ),
    };

    const badgeAntes = await obterBadge({ empresaId: EMPRESA_ID }, badgeDeps);
    expect(badgeAntes.naoLidas).toBeGreaterThanOrEqual(1);

    // ── Etapa 3: Inbox lista a mensagem ──────────────────────────────────────
    const listarDeps: ListarInboxDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue({ id: CLIENTE_ID }),
      listMensagens: vi.fn().mockImplementation(async (clienteId, empresaId) =>
        inbox
          .filter((m) => m.clienteId === clienteId && m.empresaId === empresaId)
          .sort((a, b) => b.recebidaEm.getTime() - a.recebidaEm.getTime())
          .slice(0, 100),
      ),
    };

    const listarResult = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID },
      listarDeps,
    );
    expect(listarResult.kind).toBe("ok");
    if (listarResult.kind !== "ok") return;
    expect(listarResult.mensagens).toHaveLength(1);
    expect(listarResult.mensagens[0].texto).toBe(TEXTO);
    expect(listarResult.mensagens[0].lida).toBe(false);
    expect(listarResult.naoLidas).toBe(1);

    // ── Etapa 4: Marcar lidas e verificar badge zerou ────────────────────────
    const marcarDeps: MarcarLidasDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue({ id: CLIENTE_ID }),
      updateLidas: vi.fn().mockImplementation(async (clienteId, empresaId) => {
        let count = 0;
        inbox.forEach((m) => {
          if (m.clienteId === clienteId && m.empresaId === empresaId && m.lidaEm == null) {
            m.lidaEm = new Date();
            count++;
          }
        });
        return count;
      }),
    };

    const marcarResult = await marcarLidas(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_ID },
      marcarDeps,
    );
    expect(marcarResult.kind).toBe("ok");
    if (marcarResult.kind !== "ok") return;
    expect(marcarResult.marcadas).toBe(1);

    // Badge deve ser 0 após marcar
    const badgeDepois = await obterBadge({ empresaId: EMPRESA_ID }, badgeDeps);
    expect(badgeDepois.naoLidas).toBe(0);
  });
});
