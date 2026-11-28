export type ExamFollowupStage = "receipt" | "booking";

export type ExamFollowupIntent =
  | "received"
  | "not_received"
  | "booked"
  | "not_booked"
  | "help"
  | "ambiguous";

const RECEIPT_RECEIVED = new Set([
  "sim", "sim recebi", "recebi", "recebi sim", "ja recebi", "recebido",
]);
const RECEIPT_NOT_RECEIVED = new Set([
  "nao", "nao recebi", "ainda nao", "ainda nao recebi", "nao recebi ainda",
]);
const BOOKED = new Set([
  "sim", "marquei", "ja marquei", "agendei", "consegui marcar", "consegui agendar",
]);
const NOT_BOOKED = new Set([
  "nao", "ainda nao", "ainda nao marquei", "ainda nao agendei", "nao marquei", "nao agendei", "nao consegui",
  "nao consegui marcar", "ainda nao consegui",
]);
const HELP = new Set([
  "ajuda", "preciso de ajuda", "quero ajuda", "falar com a equipe",
  "falar com alguem", "tenho uma duvida",
]);

export function normalizeExamFollowupAnswer(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim();
}

export function classifyExamFollowupAnswer(
  stage: ExamFollowupStage,
  text: string,
): ExamFollowupIntent {
  const answer = normalizeExamFollowupAnswer(text);
  if (HELP.has(answer)) return "help";
  if (stage === "receipt") {
    if (RECEIPT_RECEIVED.has(answer)) return "received";
    if (RECEIPT_NOT_RECEIVED.has(answer)) return "not_received";
    return "ambiguous";
  }
  if (BOOKED.has(answer)) return "booked";
  if (NOT_BOOKED.has(answer)) return "not_booked";
  return "ambiguous";
}

export function isValidExamFollowupHours(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 72;
}

export function examFollowupSchedule(acceptedAt: Date, intervalHours: number): {
  receiptDueAt: Date;
  bookingDueAt: Date;
} {
  if (!Number.isFinite(acceptedAt.getTime()) || !isValidExamFollowupHours(intervalHours)) {
    throw new Error("Intervalo de acompanhamento inválido.");
  }
  return {
    receiptDueAt: new Date(acceptedAt.getTime() + intervalHours * 60 * 60 * 1000),
    bookingDueAt: new Date(acceptedAt.getTime() + 4 * 24 * 60 * 60 * 1000),
  };
}
