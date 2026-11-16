import { createHash } from "node:crypto";

export function hashExamDocument(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function duplicateIngestionAction(status: string): "retry" | "skip" {
  // Mesmo um erro pode ter sido gravado após resultados parciais.
  // Não reutilizar a extração antes de existir histórico versionado.
  return "skip";
}

export function automaticExamRecoveryAllowed(): boolean {
  return false;
}
