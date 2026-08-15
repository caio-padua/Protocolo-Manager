/**
 * slack-relatorio-ambos.test.ts
 *
 * Confirma que POST /api/padaxor/slack/relatorio grava exatamente 3 registros
 * (canal='slack' + canal='telegram' + canal='ambos') quando o Telegram está
 * configurado, e exatamente 2 registros (canal='slack' + canal='ambos') quando
 * o Telegram está skipped (não configurado).
 *
 * Cenários cobertos:
 *   1. Ambos entregam            → 3 registros; ambos ok=true
 *   2. Slack falha, Telegram ok  → 3 registros; slack ok=false, ambos ok=false
 *   3. Ambos falham              → 3 registros gravados ANTES do HTTP 500
 *   4. Telegram não configurado  → 2 registros (slack + ambos); sem telegram
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ANTES dos imports das rotas ────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock("../middleware/tenantContext", () => ({
  requireCeoInstance:      (_req: unknown, _res: unknown, next: () => void) => next(),
  tenantContextMiddleware:  (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/slack-reporter", () => ({
  buildLlmReport:        vi.fn(),
  formatarRelatorioSlack: vi.fn().mockReturnValue([]),
  listarCanaisSlack:     vi.fn(),
  postSlackReport:       vi.fn(),
  postTelegramReport:    vi.fn(),
  salvarHistorico:       vi.fn(),
  consultarHistorico:    vi.fn(),
  slackGet:              vi.fn(),
  escreverCampoPlanilha: vi.fn(),
}));

vi.mock("../lib/slack-glossario", () => ({
  GLOSSARIO: [],
}));

vi.mock("../lib/google-drive", () => ({
  getGoogleDriveClientRaw:  vi.fn(),
  getGoogleSheetsClient:    vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/telegram.js", () => ({
  sendTelegram: vi.fn(),
}));

vi.mock("../lib/whatsapp.js", () => ({
  sendWhatsapp: vi.fn(),
}));

// ── Imports APÓS os mocks ─────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import slackPadaxorRouter from "../routes/slack-padaxor";
import * as reporter from "../lib/slack-reporter";
import type { LlmReport } from "../lib/slack-reporter";

// ── App mínimo de teste ───────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", slackPadaxorRouter);
  return app;
}

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<LlmReport> = {}): LlmReport {
  return {
    geradoEm:            new Date("2026-08-14T15:00:00.000Z").toISOString(),
    periodo:             "últimas 24h",
    stats:               [],
    specsAtivas:         [],
    divergencias:        [],
    totalCustoUsd:       0,
    totalChamadas:       5,
    mudancasPlanilha:    [],
    totalItensPlanilha:  0,
    itensConcluidos:     [],
    ultimoPreenchimento: null,
    ...overrides,
  };
}

const BODY_COM_TELEGRAM = {
  channelId:       "C_SLACK_TESTE",
  telegramChatId:  "123456789",
};

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/padaxor/slack/relatorio — 3 registros por disparo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reporter.buildLlmReport).mockResolvedValue(makeReport());
    vi.mocked(reporter.salvarHistorico).mockResolvedValue(undefined);
  });

  // ── Cenário 1: ambos entregam ─────────────────────────────────────────────
  it("grava 3 registros (slack+telegram+ambos, todos ok=true) quando ambos entregam", async () => {
    vi.mocked(reporter.postSlackReport).mockResolvedValue(undefined);
    vi.mocked(reporter.postTelegramReport).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/padaxor/slack/relatorio")
      .send(BODY_COM_TELEGRAM);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Exatamente 3 chamadas — sem duplicatas
    expect(reporter.salvarHistorico).toHaveBeenCalledTimes(3);

    // Registro 1: slack individual
    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "slack",
      true,
      undefined,
    );

    // Registro 2: telegram individual
    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "telegram",
      true,
      undefined,
    );

    // Registro 3: resumo consolidado
    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "ambos",
      true,
      undefined,
    );
  });

  // ── Cenário 2: Slack falha, Telegram ok ───────────────────────────────────
  it("grava 3 registros e marca slack=false/ambos=false quando só Slack falha", async () => {
    vi.mocked(reporter.postSlackReport).mockRejectedValue(new Error("Slack API timeout"));
    vi.mocked(reporter.postTelegramReport).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/padaxor/slack/relatorio")
      .send(BODY_COM_TELEGRAM);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true); // Telegram entregou

    expect(reporter.salvarHistorico).toHaveBeenCalledTimes(3);

    // slack individual com erro
    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "slack",
      false,
      expect.stringContaining("Slack API timeout"),
    );

    // telegram individual ok
    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "telegram",
      true,
      undefined,
    );

    // ambos: false (slack falhou)
    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "ambos",
      false,
      expect.stringContaining("Slack: falhou"),
    );
  });

  // ── Cenário 3: ambos falham ───────────────────────────────────────────────
  it("grava 3 registros ANTES de retornar HTTP 500 quando ambos falham", async () => {
    vi.mocked(reporter.postSlackReport).mockRejectedValue(new Error("Slack down"));
    vi.mocked(reporter.postTelegramReport).mockRejectedValue(new Error("Telegram down"));

    const res = await request(buildApp())
      .post("/api/padaxor/slack/relatorio")
      .send(BODY_COM_TELEGRAM);

    // 3 registros gravados mesmo com HTTP 500
    expect(reporter.salvarHistorico).toHaveBeenCalledTimes(3);

    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "slack",
      false,
      expect.stringContaining("Slack down"),
    );

    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "telegram",
      false,
      expect.stringContaining("Telegram down"),
    );

    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "ambos",
      false,
      expect.stringContaining("Slack: falhou"),
    );

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/falha nos dois canais/i);
  });

  // ── Cenário 4: Telegram não configurado ──────────────────────────────────
  it("grava apenas 2 registros (slack + ambos) quando Telegram está skipped — sem registro telegram", async () => {
    vi.stubEnv("PADAXOR_TELEGRAM_CHAT_ID", "");

    vi.mocked(reporter.postSlackReport).mockResolvedValue(undefined);
    vi.mocked(reporter.postTelegramReport).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/padaxor/slack/relatorio")
      .send({ channelId: "C_SLACK_TESTE" }); // sem telegramChatId no body

    vi.unstubAllEnvs();

    expect(res.status).toBe(200);

    // Exatamente 2 registros — sem telegram
    expect(reporter.salvarHistorico).toHaveBeenCalledTimes(2);

    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "slack",
      true,
      undefined,
    );

    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "ambos",
      true,
      undefined,
    );

    // Nenhum registro telegram
    const calls = vi.mocked(reporter.salvarHistorico).mock.calls;
    expect(calls.every(([, canal]) => canal !== "telegram")).toBe(true);

    // postTelegramReport não foi chamado
    expect(reporter.postTelegramReport).not.toHaveBeenCalled();
  });
});
