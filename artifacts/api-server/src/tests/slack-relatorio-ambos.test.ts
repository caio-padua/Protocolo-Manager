/**
 * slack-relatorio-ambos.test.ts
 *
 * Confirma que POST /api/padaxor/slack/relatorio grava um registro
 * canal='ambos' no histórico em TODOS os cenários — incluindo quando
 * ambos os canais falham (o registro deve preceder o retorno 500).
 *
 * Cenários cobertos:
 *   1. Ambos entregam            → salvarHistorico('ambos', true)  + HTTP 200
 *   2. Slack falha, Telegram ok  → salvarHistorico('ambos', false) + HTTP 200
 *   3. Ambos falham              → salvarHistorico('ambos', false) + HTTP 500
 *   4. Telegram não configurado  → salvarHistorico('ambos', true)  + HTTP 200
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
    ...overrides,
  };
}

const BODY_PADRAO = {
  channelId:       "C_SLACK_TESTE",
  telegramChatId:  "123456789",
};

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/padaxor/slack/relatorio — registro canal='ambos'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reporter.buildLlmReport).mockResolvedValue(makeReport());
    vi.mocked(reporter.salvarHistorico).mockResolvedValue(undefined);
  });

  // ── Cenário 1: ambos entregam ─────────────────────────────────────────────
  it("grava salvarHistorico('ambos', true) e devolve HTTP 200 quando ambos entregam", async () => {
    vi.mocked(reporter.postSlackReport).mockResolvedValue(undefined);
    vi.mocked(reporter.postTelegramReport).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/padaxor/slack/relatorio")
      .send(BODY_PADRAO);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "ambos",
      true,
      undefined,
    );
  });

  // ── Cenário 2: Slack falha, Telegram ok ───────────────────────────────────
  it("grava salvarHistorico('ambos', false) e devolve HTTP 200 quando só Slack falha", async () => {
    vi.mocked(reporter.postSlackReport).mockRejectedValue(new Error("Slack API timeout"));
    vi.mocked(reporter.postTelegramReport).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/padaxor/slack/relatorio")
      .send(BODY_PADRAO);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true); // Telegram entregou

    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "ambos",
      false,
      expect.stringContaining("Slack: falhou"),
    );
  });

  // ── Cenário 3: ambos falham ───────────────────────────────────────────────
  it("grava salvarHistorico('ambos', false) ANTES de retornar HTTP 500 quando ambos falham", async () => {
    vi.mocked(reporter.postSlackReport).mockRejectedValue(new Error("Slack down"));
    vi.mocked(reporter.postTelegramReport).mockRejectedValue(new Error("Telegram down"));

    const res = await request(buildApp())
      .post("/api/padaxor/slack/relatorio")
      .send(BODY_PADRAO);

    // Registro deve ter sido gravado mesmo com a resposta 500
    expect(reporter.salvarHistorico).toHaveBeenCalledOnce();
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
  it("grava salvarHistorico('ambos', true) quando Telegram está ausente (skipped não é falha)", async () => {
    // Garante que a variável de ambiente não interfere neste cenário
    vi.stubEnv("PADAXOR_TELEGRAM_CHAT_ID", "");

    vi.mocked(reporter.postSlackReport).mockResolvedValue(undefined);
    vi.mocked(reporter.postTelegramReport).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/padaxor/slack/relatorio")
      .send({ channelId: "C_SLACK_TESTE" }); // sem telegramChatId no body

    vi.unstubAllEnvs();

    expect(res.status).toBe(200);

    expect(reporter.salvarHistorico).toHaveBeenCalledWith(
      expect.anything(),
      "ambos",
      true,   // Telegram skipped = ok, não falha
      undefined,
    );
    // Telegram não deve ter sido chamado
    expect(reporter.postTelegramReport).not.toHaveBeenCalled();
  });
});
