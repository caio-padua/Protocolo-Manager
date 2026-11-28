import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedPostgres } from "./helpers/isolated-postgres";

const h = vi.hoisted(() => ({
  database: null as any,
  settings: {} as Record<string, string>,
  sendPaxter: vi.fn(),
  sendTelegram: vi.fn(),
  alertChat: vi.fn(async () => "chat-equipe-sintetico"),
}));

vi.mock("@workspace/db", () => ({
  db: {
    execute: (...args: unknown[]) => h.database.execute(...args),
    transaction: (callback: (tx: unknown) => Promise<unknown>) => h.database.transaction(callback),
  },
}));
vi.mock("../lib/secure-settings", () => ({
  getSetting: async (key: string) => h.settings[key] ?? null,
}));
vi.mock("../lib/messaging/engine.js", () => ({
  enviarMensagemPaxter: (...args: unknown[]) => h.sendPaxter(...args),
}));
vi.mock("../lib/messaging/base-url.js", () => ({
  baseUrlFromEnv: () => "https://paxmed.example.invalid",
}));
vi.mock("../lib/telegram", () => ({
  sendTelegram: (...args: unknown[]) => h.sendTelegram(...args),
}));
vi.mock("../lib/telegram-config", () => ({
  chatAlertaOuNull: () => h.alertChat(),
}));
vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { processarAcompanhamentosExamesPendentes } from "../lib/telegram-exam-followup-worker";

let database: Awaited<ReturnType<typeof isolatedPostgres>>;
const CLIENT_ID = 77;
const COMPANY_ID = 5;
const CHAT_ID = "chat-cliente-sintetico";

beforeAll(async () => {
  database = await isolatedPostgres();
  h.database = database;
  await database.pool.query(`
    CREATE TABLE empresas (
      id INTEGER PRIMARY KEY, ativa BOOLEAN NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nome TEXT NOT NULL,
      status TEXT NOT NULL, deleted_at TIMESTAMPTZ, telegram_chat_id TEXT
    );
    CREATE TABLE collaborator_audit (
      id BIGINT PRIMARY KEY, action TEXT NOT NULL, detail JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE exam_request_pdfs (
      id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL
    );
    CREATE TABLE telegram_atendimento (
      cliente_id INTEGER PRIMARY KEY, modo TEXT NOT NULL, motivo TEXT,
      alterado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), alterado_por INTEGER
    );
    CREATE TABLE telegram_inbox_messages (
      id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, cliente_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL, texto TEXT NOT NULL, recebida_em TIMESTAMPTZ NOT NULL,
      direcao TEXT NOT NULL, lida_em TIMESTAMPTZ
    );
    CREATE TABLE telegram_atendimento_respostas (
      inbox_message_id BIGINT PRIMARY KEY, desfecho TEXT NOT NULL, fechado_em TIMESTAMPTZ,
      estado TEXT NOT NULL, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), dono TEXT
    );
  `);
}, 60_000);

afterAll(async () => { await database?.stop(); });

beforeEach(async () => {
  vi.clearAllMocks();
  h.settings = {
    "telegram.active": "true",
    [`telegram.examFollowup.intervalHours.${COMPANY_ID}`]: "8",
  };
  h.alertChat.mockResolvedValue("chat-equipe-sintetico");
  h.sendPaxter.mockImplementation(async (_doc, _destination, channels) => ({
    resultados: [{ canal: channels[0], sent: true, mock: false, skipped: false, via: "telegram" }],
  }));
  h.sendTelegram.mockResolvedValue({ sent: true, mock: false });
  await database.pool.query(`
    TRUNCATE telegram_exam_followups, telegram_inbox_messages, telegram_atendimento_respostas,
      telegram_atendimento, collaborator_audit, exam_request_pdfs, clients, empresas
      RESTART IDENTITY
  `);
  await database.pool.query(
    "INSERT INTO empresas(id, ativa, status) VALUES ($1, true, 'ATIVO')",
    [COMPANY_ID],
  );
  await database.pool.query(
    "INSERT INTO clients(id, empresa_id, nome, status, telegram_chat_id) VALUES ($1, $2, 'Cliente Sintético', 'active', $3)",
    [CLIENT_ID, COMPANY_ID, CHAT_ID],
  );
});

async function criarCaso(
  auditId: number,
  state: "receipt_pending" | "receipt_waiting" | "receipt_sending" = "receipt_pending",
) {
  const documentId = 9000 + auditId;
  const detail = {
    state: "provider_accepted",
    clientId: CLIENT_ID,
    empresaId: COMPANY_ID,
    documentIds: [documentId],
    acceptedMessages: 1,
    plannedMessages: 1,
    providerAcceptedAt: "2026-11-20T12:00:00.000Z",
  };
  await database.pool.query(
    "INSERT INTO collaborator_audit(id, action, detail, created_at) VALUES ($1, 'exam_request_dispatch', $2::jsonb, NOW())",
    [auditId, JSON.stringify(detail)],
  );
  await database.pool.query("INSERT INTO exam_request_pdfs(id, client_id) VALUES ($1, $2)", [documentId, CLIENT_ID]);
  await database.pool.query(
    `INSERT INTO telegram_exam_followups
      (source_dispatch_audit_id, empresa_id, cliente_id, chat_id, operation_key, interval_hours,
       provider_accepted_at, receipt_due_at, booking_due_at, state, receipt_delivery_state,
       receipt_sent_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 8, NOW()-interval '8 hours',
       NOW()-interval '1 minute', NOW()+interval '4 days', $6, $7,
       CASE WHEN $6='receipt_waiting' THEN NOW()-interval '1 minute' ELSE NULL END,
       CASE WHEN $6='receipt_sending' THEN NOW()-interval '6 minutes' ELSE NOW() END)`,
    [auditId, COMPANY_ID, CLIENT_ID, CHAT_ID, `op-sintetica-${auditId}`, state,
      state === "receipt_waiting" ? "accepted" : state === "receipt_sending" ? "sending" : "not_sent"],
  );
  return { auditId, documentId };
}

async function inserirResposta(texto: string) {
  const result = await database.pool.query(
    `INSERT INTO telegram_inbox_messages
      (empresa_id, cliente_id, chat_id, texto, recebida_em, direcao)
     VALUES ($1, $2, $3, $4, NOW(), 'entrada') RETURNING id`,
    [COMPANY_ID, CLIENT_ID, CHAT_ID, texto],
  );
  return Number(result.rows[0].id);
}

async function caso(auditId: number) {
  const result = await database.pool.query(
    "SELECT * FROM telegram_exam_followups WHERE source_dispatch_audit_id=$1",
    [auditId],
  );
  return result.rows[0];
}

describe("trabalhador do acompanhamento de exames, com banco e dados sintéticos", () => {
  it("envia uma pergunta após o prazo e não repete após executar novamente", async () => {
    await criarCaso(101);
    await processarAcompanhamentosExamesPendentes();
    expect(h.sendPaxter).toHaveBeenCalledTimes(1);
    expect(h.sendPaxter.mock.calls[0][2]).toEqual(["TELEGRAM"]);
    expect(h.sendPaxter.mock.calls[0][0].paragrafos.join(" ")).toContain("recebeu o pedido");
    expect(await caso(101)).toMatchObject({
      state: "receipt_waiting",
      receipt_delivery_state: "accepted",
    });
    await vi.resetModules();
    const workerAfterRestart = await import("../lib/telegram-exam-followup-worker");
    await workerAfterRestart.processarAcompanhamentosExamesPendentes();
    expect(h.sendPaxter).toHaveBeenCalledTimes(1);
  });

  it("registra recebimento, mantém a pergunta do quarto dia e encaminha ajuda à equipe", async () => {
    await criarCaso(102, "receipt_waiting");
    await inserirResposta("Sim, recebi");
    await processarAcompanhamentosExamesPendentes();
    expect(await caso(102)).toMatchObject({
      state: "booking_pending",
      receipt_answer: "received",
      receipt_ack_state: "accepted",
    });
    expect((await database.pool.query(
      "SELECT estado, desfecho FROM telegram_atendimento_respostas",
    )).rows[0]).toMatchObject({ estado: "concluido", desfecho: "exam_followup_receipt_received" });

    await database.pool.query(
      "UPDATE telegram_exam_followups SET booking_due_at=NOW()-interval '1 minute' WHERE source_dispatch_audit_id=102",
    );
    await processarAcompanhamentosExamesPendentes();
    expect(h.sendPaxter).toHaveBeenCalledTimes(1);
    expect(h.sendPaxter.mock.calls[0][0].paragrafos.join(" ")).toContain("conseguiu agendar");
    expect(await caso(102)).toMatchObject({ state: "booking_waiting", booking_delivery_state: "accepted" });

    await inserirResposta("Preciso de ajuda");
    await processarAcompanhamentosExamesPendentes();
    expect(await caso(102)).toMatchObject({
      state: "needs_review",
      booking_answer: "help",
      team_alert_state: "accepted",
      booking_ack_state: "accepted",
    });
    expect((await database.pool.query(
      "SELECT modo, motivo FROM telegram_atendimento WHERE cliente_id=$1",
      [CLIENT_ID],
    )).rows[0]).toMatchObject({ modo: "humano", motivo: "exam_followup_help" });

    await processarAcompanhamentosExamesPendentes();
    expect(h.sendPaxter).toHaveBeenCalledTimes(1);
    expect(h.sendTelegram).toHaveBeenCalledTimes(3);
  });

  it("não repete envio incerto e recupera etapa interrompida para conferência", async () => {
    await criarCaso(103);
    h.sendPaxter.mockResolvedValue({
      resultados: [{ canal: "TELEGRAM", sent: false, mock: false, skipped: false, via: "telegram" }],
    });
    await processarAcompanhamentosExamesPendentes();
    expect(await caso(103)).toMatchObject({
      state: "needs_review",
      receipt_delivery_state: "unknown",
    });
    await processarAcompanhamentosExamesPendentes();
    expect(h.sendPaxter).toHaveBeenCalledTimes(1);

    await criarCaso(104, "receipt_sending");
    await processarAcompanhamentosExamesPendentes();
    expect(await caso(104)).toMatchObject({
      state: "needs_review",
      receipt_delivery_state: "unknown",
      error_code: "receipt_send_interrupted",
    });
    expect(h.sendPaxter).toHaveBeenCalledTimes(1);
  });

  it("bloqueia chat duplicado, clínica desativada e Telegram desligado", async () => {
    await criarCaso(105);
    await database.pool.query(
      "INSERT INTO clients(id, empresa_id, nome, status, telegram_chat_id) VALUES (78, 6, 'Outro Cliente Sintético', 'active', $1)",
      [CHAT_ID],
    );
    await processarAcompanhamentosExamesPendentes();
    expect(await caso(105)).toMatchObject({ state: "cancelled", close_reason: "telegram_link_not_unique" });
    expect(h.sendPaxter).not.toHaveBeenCalled();

    await database.pool.query("DELETE FROM clients WHERE id=78");
    await criarCaso(106);
    h.settings[`telegram.examFollowup.intervalHours.${COMPANY_ID}`] = "off";
    await processarAcompanhamentosExamesPendentes();
    expect(await caso(106)).toMatchObject({ state: "cancelled", close_reason: "clinic_disabled" });
    expect(h.sendPaxter).not.toHaveBeenCalled();

    await criarCaso(107);
    h.settings[`telegram.examFollowup.intervalHours.${COMPANY_ID}`] = "8";
    h.settings["telegram.active"] = "false";
    await processarAcompanhamentosExamesPendentes();
    expect(await caso(107)).toMatchObject({ state: "cancelled", close_reason: "telegram_disabled" });
    expect(h.sendPaxter).not.toHaveBeenCalled();
  });
});
