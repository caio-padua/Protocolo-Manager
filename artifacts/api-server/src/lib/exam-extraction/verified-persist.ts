/**
 * Caminho único para gravar uma extração de exame laboratorial no prontuário
 * a partir de importadores (Drive em massa, vigia do Drive): primeiro o porteiro de
 * identidade, depois (só se confirmada) o registro dos resultados.
 */
import type { ExtractedExam } from "./schema.js";
import { finalizeDocument, persistExtractedResults } from "./persist.js";
import { runIdentityGate } from "./identity-gate.js";

export type VerifiedPersistOutcome =
  | { incorporated: true; analytes: number }
  | { incorporated: false; verdict: "revisao" | "contradicao" };

export async function persistExtractionIfIdentityConfirmed(input: {
  documentId: number;
  clientId: number;
  extracted: ExtractedExam;
  modelUsed: string;
  /** Texto do laudo, quando o importador o tem (detector de dois pacientes). */
  evidenceText?: string | null;
}): Promise<VerifiedPersistOutcome> {
  const gate = await runIdentityGate({ ...input, pipeline: [] });
  if (gate.quarantined) {
    return { incorporated: false, verdict: gate.assessment.verdict === "contradicao" ? "contradicao" : "revisao" };
  }
  await finalizeDocument(input.documentId, input.extracted, input.modelUsed);
  const summary = await persistExtractedResults({
    documentId: input.documentId,
    clientId: input.clientId,
    extracted: input.extracted,
  });
  return { incorporated: true, analytes: summary.resultsInserted };
}
