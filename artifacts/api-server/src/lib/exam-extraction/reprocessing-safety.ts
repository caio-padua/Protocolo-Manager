import type { Response } from "express";

export const UNVERSIONED_REPROCESSING_ERROR =
  "Reextração bloqueada para preservar resultados anteriores; o histórico versionado ainda não está disponível.";

export function rejectUnversionedReprocessing(res: Response) {
  return res.status(409).json({
    code: "EXAM_REPROCESSING_REQUIRES_VERSIONING",
    error: UNVERSIONED_REPROCESSING_ERROR,
  });
}
