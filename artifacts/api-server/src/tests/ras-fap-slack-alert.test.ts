/**
 * ras-fap-slack-alert.test.ts
 *
 * Confirma que o aviso no Slack é disparado quando a geração do RAS FAP
 * falha, cobrindo os dois pontos de falha do fluxo de fechamento de protocolo:
 *
 *   1. Geração para o Drive  (context = "drive")
 *   2. Geração para o e-mail (context = "email")
 *
 * A função `notifySlackRasFapFailure` é testada de forma isolada via
 * injeção de dependência — sem Express, banco de dados ou Google Drive.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifySlackRasFapFailure } from "../lib/ras-fap-alert";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLIENT_NAME     = "Maria Oliveira";
const PROTOCOL_ID     = 42;
const PROTOCOL_TITLE  = "IV Longevidade Premium";
const SLACK_CHANNEL   = "C0BLW5S7GQL";
const ERROR_MSG       = "Chromium process exited with code 1";

function makeDeps() {
  return {
    postAlert: vi.fn().mockResolvedValue(undefined),
    logError:  vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Bloco 1 — contexto "drive" (geração/salvamento no Google Drive)
// ---------------------------------------------------------------------------

describe("notifySlackRasFapFailure — contexto drive", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => { deps = makeDeps(); });

  it("chama postAlert com channelId correto", async () => {
    await notifySlackRasFapFailure(
      "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    expect(deps.postAlert).toHaveBeenCalledOnce();
    expect(deps.postAlert.mock.calls[0][0]).toBe(SLACK_CHANNEL);
  });

  it("a mensagem contém o nome do cliente", async () => {
    await notifySlackRasFapFailure(
      "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain(CLIENT_NAME);
  });

  it("a mensagem contém o número do protocolo", async () => {
    await notifySlackRasFapFailure(
      "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain(String(PROTOCOL_ID));
  });

  it("a mensagem contém o título do protocolo", async () => {
    await notifySlackRasFapFailure(
      "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain(PROTOCOL_TITLE);
  });

  it("a mensagem contém a descrição do erro original", async () => {
    await notifySlackRasFapFailure(
      "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain(ERROR_MSG);
  });

  it("NÃO chama postAlert quando slackChannel é undefined", async () => {
    await notifySlackRasFapFailure(
      "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, undefined, deps,
    );
    expect(deps.postAlert).not.toHaveBeenCalled();
  });

  it("NÃO chama postAlert quando slackChannel é string vazia", async () => {
    await notifySlackRasFapFailure(
      "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, "", deps,
    );
    expect(deps.postAlert).not.toHaveBeenCalled();
  });

  it("não propaga exceção se postAlert lançar (fail-safe)", async () => {
    deps.postAlert.mockRejectedValue(new Error("Slack down"));
    await expect(
      notifySlackRasFapFailure(
        "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
        ERROR_MSG, SLACK_CHANNEL, deps,
      ),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bloco 2 — contexto "email" (falha ao anexar RAS FAP ao e-mail)
// ---------------------------------------------------------------------------

describe("notifySlackRasFapFailure — contexto email", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => { deps = makeDeps(); });

  it("chama postAlert com channelId correto", async () => {
    await notifySlackRasFapFailure(
      "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    expect(deps.postAlert).toHaveBeenCalledOnce();
    expect(deps.postAlert.mock.calls[0][0]).toBe(SLACK_CHANNEL);
  });

  it("a mensagem contém o nome do cliente", async () => {
    await notifySlackRasFapFailure(
      "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain(CLIENT_NAME);
  });

  it("a mensagem contém o número do protocolo", async () => {
    await notifySlackRasFapFailure(
      "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain(String(PROTOCOL_ID));
  });

  it("a mensagem contém o título do protocolo", async () => {
    await notifySlackRasFapFailure(
      "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain(PROTOCOL_TITLE);
  });

  it("a mensagem contém a descrição do erro original", async () => {
    await notifySlackRasFapFailure(
      "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toContain(ERROR_MSG);
  });

  it("a mensagem menciona que o e-mail seguiu sem o anexo", async () => {
    await notifySlackRasFapFailure(
      "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    // O CEO precisa saber que o e-mail saiu, mas sem o RAS FAP.
    expect(text.toLowerCase()).toMatch(/e-mail|email/);
  });

  it("NÃO chama postAlert quando slackChannel é undefined", async () => {
    await notifySlackRasFapFailure(
      "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, undefined, deps,
    );
    expect(deps.postAlert).not.toHaveBeenCalled();
  });

  it("não propaga exceção se postAlert lançar (fail-safe)", async () => {
    deps.postAlert.mockRejectedValue(new Error("Slack timeout"));
    await expect(
      notifySlackRasFapFailure(
        "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
        ERROR_MSG, SLACK_CHANNEL, deps,
      ),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bloco 3 — conteúdo da mensagem por contexto
// ---------------------------------------------------------------------------

describe("notifySlackRasFapFailure — diferença de conteúdo por contexto", () => {
  it("contexto drive usa label 'gerado/salvo'", async () => {
    const deps = makeDeps();
    await notifySlackRasFapFailure(
      "drive", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toMatch(/gerado|salvo/i);
  });

  it("contexto email usa label 'anexado'", async () => {
    const deps = makeDeps();
    await notifySlackRasFapFailure(
      "email", CLIENT_NAME, PROTOCOL_ID, PROTOCOL_TITLE,
      ERROR_MSG, SLACK_CHANNEL, deps,
    );
    const text: string = deps.postAlert.mock.calls[0][1];
    expect(text).toMatch(/anexado/i);
  });
});
