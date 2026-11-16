import { createHash } from "node:crypto";

export function hashExamDocument(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function duplicateIngestionAction(status: string): "retry" | "skip" {
  return status === "erro" ? "retry" : "skip";
}
