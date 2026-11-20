import { afterAll, describe, expect, it } from "vitest";
import {
  classifyExamFollowupAnswer,
  examFollowupSchedule,
  isValidExamFollowupHours,
} from "../lib/telegram-exam-followup-state";
import {
  ativarAcompanhamentoExame,
  cancelarAcompanhamentosDoCliente,
  encerrarAcompanhamentoExame,
  ensureTelegramExamFollowupsTable,
  encerrarReservaNaoAceita,
  reservarAcompanhamentoExame,
} from "../lib/telegram-exam-followup-store";
import { isolatedPostgres } from "./helpers/isolated-postgres";

describe("respostas e horários do acompanhamento pelo Telegram", () => {
  it("aceita somente respostas curtas reconhecidas e envia o restante à equipe", () => {
    expect(classifyExamFollowupAnswer("receipt", "Já recebi!")).toBe("received");
    expect(classifyExamFollowupAnswer("receipt", "Ainda não recebi")).toBe("not_received");
    expect(classifyExamFollowupAnswer("booking", "Consegui agendar")).toBe("booked");
    expect(classifyExamFollowupAnswer("booking", "Ainda não marquei")).toBe("not_booked");
    expect(classifyExamFollowupAnswer("booking", "Preciso de ajuda")).toBe("help");
    expect(classifyExamFollowupAnswer("receipt", "Recebi, mas qual fórmula devo tomar?")).toBe("ambiguous");
  });

  it("limita o intervalo e calcula o segundo contato quatro dias após o aceite", () => {
    const acceptedAt = new Date("2026-11-20T15:00:00.000Z");
    expect(isValidExamFollowupHours(1)).toBe(true);
    expect(isValidExamFollowupHours(72)).toBe(true);
    expect(isValidExamFollowupHours(0)).toBe(false);
    expect(isValidExamFollowupHours(73)).toBe(false);
    expect(isValidExamFollowupHours(1.5)).toBe(false);
    expect(examFollowupSchedule(acceptedAt, 8)).toEqual({
      receiptDueAt: new Date("2026-11-20T23:00:00.000Z"),
      bookingDueAt: new Date("2026-11-24T15:00:00.000Z"),
    });
  });
});

describe("fila persistente com banco PostgreSQL descartável", () => {
  let database: Awaited<ReturnType<typeof isolatedPostgres>> | null = null;
  afterAll(async () => { await database?.stop(); });

  it("reserva uma única linha antes do envio e ativa somente após aceite confirmado", async () => {
    database = await isolatedPostgres();
    const syntheticDb = database;
    await ensureTelegramExamFollowupsTable(syntheticDb);
    const reservation = {
      auditId: 901,
      empresaId: 5,
      clienteId: 101,
      chatId: "chat-sintetico",
      operationKey: "op-sintetica-901",
      intervalHours: 8,
    };
    await reservarAcompanhamentoExame(syntheticDb, reservation);
    await reservarAcompanhamentoExame(syntheticDb, reservation);
    const before = await syntheticDb.pool.query(
      "SELECT state, provider_accepted_at, receipt_due_at, booking_due_at FROM telegram_exam_followups WHERE source_dispatch_audit_id=901",
    );
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0]).toMatchObject({
      state: "awaiting_dispatch",
      provider_accepted_at: null,
      receipt_due_at: null,
      booking_due_at: null,
    });

    const acceptedAt = new Date("2026-11-20T15:00:00.000Z");
    await ativarAcompanhamentoExame(syntheticDb, 901, acceptedAt, 8);
    const after = await syntheticDb.pool.query(
      "SELECT state, receipt_due_at, booking_due_at FROM telegram_exam_followups WHERE source_dispatch_audit_id=901",
    );
    expect(after.rows[0]).toMatchObject({ state: "receipt_pending" });
    expect(after.rows[0].receipt_due_at.toISOString()).toBe("2026-11-20T23:00:00.000Z");
    expect(after.rows[0].booking_due_at.toISOString()).toBe("2026-11-24T15:00:00.000Z");
  }, 60_000);

  it("encerra a reserva de envio recusado sem agendar perguntas", async () => {
    const syntheticDb = database!;
    await reservarAcompanhamentoExame(syntheticDb, {
      auditId: 902,
      empresaId: 5,
      clienteId: 101,
      chatId: "chat-sintetico",
      operationKey: "op-sintetica-902",
      intervalHours: 12,
    });
    await encerrarReservaNaoAceita(syntheticDb, 902);
    const result = await syntheticDb.pool.query(
      "SELECT state, receipt_due_at, booking_due_at, close_reason FROM telegram_exam_followups WHERE source_dispatch_audit_id=902",
    );
    expect(result.rows[0]).toMatchObject({
      state: "cancelled",
      receipt_due_at: null,
      booking_due_at: null,
      close_reason: "dispatch_not_accepted",
    });
  }, 60_000);

  it("não presume cancelamento seguro durante envio e impede encerramento concorrente", async () => {
    const syntheticDb = database!;
    await reservarAcompanhamentoExame(syntheticDb, {
      auditId: 903,
      empresaId: 5,
      clienteId: 101,
      chatId: "chat-sintetico",
      operationKey: "op-sintetica-903",
      intervalHours: 8,
    });
    await ativarAcompanhamentoExame(syntheticDb, 903, new Date("2026-11-20T15:00:00.000Z"), 8);
    await syntheticDb.pool.query(`
      UPDATE telegram_exam_followups
      SET state='receipt_sending', receipt_delivery_state='sending'
      WHERE source_dispatch_audit_id=903
    `);
    await cancelarAcompanhamentosDoCliente(syntheticDb, 101, "human_takeover");
    const interrupted = await syntheticDb.pool.query(
      "SELECT state, receipt_delivery_state, error_code FROM telegram_exam_followups WHERE source_dispatch_audit_id=903",
    );
    expect(interrupted.rows[0]).toMatchObject({
      state: "needs_review",
      receipt_delivery_state: "unknown",
      error_code: "human_takeover_during_send",
    });

    await reservarAcompanhamentoExame(syntheticDb, {
      auditId: 904,
      empresaId: 5,
      clienteId: 101,
      chatId: "chat-sintetico",
      operationKey: "op-sintetica-904",
      intervalHours: 8,
    });
    await ativarAcompanhamentoExame(syntheticDb, 904, new Date("2026-11-20T15:00:00.000Z"), 8);
    await syntheticDb.pool.query(`
      UPDATE telegram_exam_followups
      SET state='booking_sending', booking_delivery_state='sending'
      WHERE source_dispatch_audit_id=904
    `);
    const row = await syntheticDb.pool.query(
      "SELECT id FROM telegram_exam_followups WHERE source_dispatch_audit_id=904",
    );
    expect(await encerrarAcompanhamentoExame(syntheticDb, {
      id: Number(row.rows[0].id), empresaId: 5, clienteId: 101, professionalId: 77, reason: "pedido_cancelado",
    })).toBe(false);
    await syntheticDb.pool.query(`
      UPDATE telegram_exam_followups
      SET state='booking_waiting', booking_delivery_state='accepted'
      WHERE source_dispatch_audit_id=904
    `);
    expect(await encerrarAcompanhamentoExame(syntheticDb, {
      id: Number(row.rows[0].id), empresaId: 5, clienteId: 101, professionalId: 77, reason: "pedido_cancelado",
    })).toBe(true);
  }, 60_000);
});
