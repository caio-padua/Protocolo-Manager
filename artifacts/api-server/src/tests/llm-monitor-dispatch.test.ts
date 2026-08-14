/**
 * llm-monitor-dispatch.test.ts
 *
 * Testes de integração controlada do Monitor Horário de LLMs.
 *
 * Cenários cobertos:
 *  1. Caminho feliz: Slack e Telegram recebem o relatório.
 *  2. Falha do Slack: Telegram ainda recebe (fail-safe independente).
 *  3. Falha do Telegram: Slack não é afetado (fail-safe independente).
 *  4. Falha do buildLlmReport: nenhum canal é acionado.
 *  5. telegramChatId vazio: Telegram ignorado, Slack funciona normalmente.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runLlmMonitorJob,
  type LlmMonitorDeps,
  type LlmMonitorConfig,
} from "../lib/llm-monitor-dispatch";
import type { LlmReport } from "../lib/slack-reporter";

// ---------------------------------------------------------------------------
// Relatório mínimo válido para os testes
// ---------------------------------------------------------------------------
function makeReport(overrides: Partial<LlmReport> = {}): LlmReport {
  return {
    geradoEm:           new Date().toISOString(),
    periodo:            "última 1h",
    stats:              [],
    specsAtivas:        [],
    divergencias:       [],
    totalCustoUsd:      0,
    totalChamadas:      0,
    mudancasPlanilha:   [],
    totalItensPlanilha: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Configuração-padrão reutilizada nos testes
// ---------------------------------------------------------------------------
const CONFIG_PADRAO: LlmMonitorConfig = {
  channelId:       "C_SLACK_TESTE",
  telegramChatId:  "123456789",
};

// Logger mudo — não polui a saída dos testes
const LOGGER_MUDO = {
  info:  vi.fn(),
  warn:  vi.fn(),
  error: vi.fn(),
};

// ---------------------------------------------------------------------------
// Helper: monta um conjunto de deps com mocks customizáveis
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<LlmMonitorDeps> = {}): LlmMonitorDeps {
  return {
    buildLlmReport:    vi.fn().mockResolvedValue(makeReport()),
    postSlackReport:   vi.fn().mockResolvedValue(undefined),
    postTelegramReport: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe("runLlmMonitorJob — dual-canal fail-safe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Cenário 1: caminho feliz ─────────────────────────────────────────────
  it("chama buildLlmReport, postSlackReport e postTelegramReport com sucesso", async () => {
    const deps = makeDeps();

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(deps.buildLlmReport).toHaveBeenCalledOnce();
    expect(deps.buildLlmReport).toHaveBeenCalledWith(1); // janela padrão de 1h

    expect(deps.postSlackReport).toHaveBeenCalledOnce();
    expect(deps.postSlackReport).toHaveBeenCalledWith(
      CONFIG_PADRAO.channelId,
      expect.objectContaining({ periodo: "última 1h" })
    );

    expect(deps.postTelegramReport).toHaveBeenCalledOnce();
    // 3º argumento = slackFallbackChannelId (undefined quando não configurado no config)
    expect(deps.postTelegramReport).toHaveBeenCalledWith(
      CONFIG_PADRAO.telegramChatId,
      expect.objectContaining({ periodo: "última 1h" }),
      undefined
    );

    expect(result.reportBuilt).toBe(true);
    expect(result.slackOk).toBe(true);
    expect(result.telegramOk).toBe(true);
    expect(result.telegramSkipped).toBe(false);
    expect(result.slackError).toBeUndefined();
    expect(result.telegramError).toBeUndefined();
  });

  // ── Cenário 2: Slack falha — Telegram ainda recebe ───────────────────────
  it("quando Slack lança erro, Telegram ainda recebe a mensagem", async () => {
    const erroSlack = new Error("Slack API timeout");
    const deps = makeDeps({
      postSlackReport: vi.fn().mockRejectedValue(erroSlack),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    // Relatório foi construído
    expect(result.reportBuilt).toBe(true);

    // Slack falhou mas não explodiu o processo
    expect(result.slackOk).toBe(false);
    expect(result.slackError).toBe("Slack API timeout");

    // Telegram ainda foi chamado e funcionou
    expect(deps.postTelegramReport).toHaveBeenCalledOnce();
    expect(result.telegramOk).toBe(true);
    expect(result.telegramError).toBeUndefined();
  });

  // ── Cenário 3: Telegram falha — Slack não é afetado ─────────────────────
  it("quando Telegram lança erro, Slack não é afetado", async () => {
    const erroTelegram = new Error("Telegram bot blocked");
    const deps = makeDeps({
      postTelegramReport: vi.fn().mockRejectedValue(erroTelegram),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    // Relatório foi construído
    expect(result.reportBuilt).toBe(true);

    // Slack funcionou normalmente
    expect(deps.postSlackReport).toHaveBeenCalledOnce();
    expect(result.slackOk).toBe(true);
    expect(result.slackError).toBeUndefined();

    // Telegram falhou mas não derrubou o Slack
    expect(result.telegramOk).toBe(false);
    expect(result.telegramError).toBe("Telegram bot blocked");
  });

  // ── Cenário 4: buildLlmReport falha — nenhum canal é acionado ────────────
  it("quando buildLlmReport falha, nenhum canal é acionado", async () => {
    const deps = makeDeps({
      buildLlmReport: vi.fn().mockRejectedValue(new Error("DB offline")),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(result.reportBuilt).toBe(false);
    expect(deps.postSlackReport).not.toHaveBeenCalled();
    expect(deps.postTelegramReport).not.toHaveBeenCalled();
    expect(result.slackOk).toBe(false);
    expect(result.telegramOk).toBe(false);
  });

  // ── Cenário 5: telegramChatId vazio — Telegram ignorado ──────────────────
  it("quando telegramChatId está vazio, Telegram é ignorado e Slack funciona", async () => {
    const deps = makeDeps();
    const config: LlmMonitorConfig = {
      ...CONFIG_PADRAO,
      telegramChatId: "",
    };

    const result = await runLlmMonitorJob(config, deps, LOGGER_MUDO);

    expect(result.reportBuilt).toBe(true);
    expect(result.slackOk).toBe(true);
    expect(result.telegramSkipped).toBe(true);
    expect(deps.postTelegramReport).not.toHaveBeenCalled();
  });

  // ── Cenário 6: ambos falham — resultado registra os dois erros ───────────
  it("quando ambos os canais falham, ambos os erros são registrados", async () => {
    const deps = makeDeps({
      postSlackReport:   vi.fn().mockRejectedValue(new Error("Slack down")),
      postTelegramReport: vi.fn().mockRejectedValue(new Error("Telegram down")),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(result.reportBuilt).toBe(true);
    expect(result.slackOk).toBe(false);
    expect(result.telegramOk).toBe(false);
    expect(result.slackError).toBe("Slack down");
    expect(result.telegramError).toBe("Telegram down");
  });

  // ── Cenário 7: janela de coleta customizada é repassada ao buildLlmReport ─
  it("respeita horas customizadas na configuração", async () => {
    const deps = makeDeps();
    const config: LlmMonitorConfig = { ...CONFIG_PADRAO, horas: 24 };

    await runLlmMonitorJob(config, deps, LOGGER_MUDO);

    expect(deps.buildLlmReport).toHaveBeenCalledWith(24);
  });

  // ── Cenário 8: slackFallbackChannelId é repassado ao postTelegramReport ──
  // (Task 34 — quando Telegram falha após retentativas, avisa o Slack)
  it("repassa slackFallbackChannelId ao postTelegramReport quando configurado", async () => {
    const deps = makeDeps();
    const config: LlmMonitorConfig = {
      ...CONFIG_PADRAO,
      slackFallbackChannelId: "C_SLACK_FALLBACK",
    };

    await runLlmMonitorJob(config, deps, LOGGER_MUDO);

    expect(deps.postTelegramReport).toHaveBeenCalledWith(
      CONFIG_PADRAO.telegramChatId,
      expect.objectContaining({ periodo: "última 1h" }),
      "C_SLACK_FALLBACK"
    );
  });
});

// ---------------------------------------------------------------------------
// Testes do canal gravado em salvarHistorico — as 4 combinações possíveis
// ---------------------------------------------------------------------------
describe("runLlmMonitorJob — canal gravado no salvarHistorico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Combinação 1: ambos entregaram → canal = "ambos"
  it("grava canal='ambos' quando Slack e Telegram entregam", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ salvarHistorico });

    await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(salvarHistorico).toHaveBeenCalledOnce();
    expect(salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "ambos",
      true,
      undefined,
    );
  });

  // Combinação 2: só Slack entregou → canal = "slack"
  it("grava canal='slack' quando apenas Slack entrega (Telegram falha)", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      postTelegramReport: vi.fn().mockRejectedValue(new Error("Telegram bot blocked")),
      salvarHistorico,
    });

    await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(salvarHistorico).toHaveBeenCalledOnce();
    expect(salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "slack",
      false,
      expect.stringContaining("Slack: OK"),
    );
  });

  // Combinação 3: só Telegram entregou → canal = "telegram"
  it("grava canal='telegram' quando apenas Telegram entrega (Slack falha)", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      postSlackReport: vi.fn().mockRejectedValue(new Error("Slack API down")),
      salvarHistorico,
    });

    await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(salvarHistorico).toHaveBeenCalledOnce();
    expect(salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "telegram",
      false,
      expect.stringContaining("Telegram: OK"),
    );
  });

  // Combinação 4: nenhum entregou → canal = "nenhum"
  it("grava canal='nenhum' quando ambos os canais falham", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      postSlackReport:    vi.fn().mockRejectedValue(new Error("Slack down")),
      postTelegramReport: vi.fn().mockRejectedValue(new Error("Telegram down")),
      salvarHistorico,
    });

    await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(salvarHistorico).toHaveBeenCalledOnce();
    expect(salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "nenhum",
      false,
      expect.stringContaining("Slack: falhou"),
    );
  });

  // Bônus: Telegram não configurado → canal = "slack" (não "ambos")
  it("grava canal='slack' quando Telegram não está configurado", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ salvarHistorico });
    const config: LlmMonitorConfig = { ...CONFIG_PADRAO, telegramChatId: "" };

    await runLlmMonitorJob(config, deps, LOGGER_MUDO);

    expect(salvarHistorico).toHaveBeenCalledOnce();
    expect(salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "slack",
      true,
      undefined,
    );
  });
});
