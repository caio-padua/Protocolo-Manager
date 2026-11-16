import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { extractPdfText } from "../lib/exam-extraction/pdf-text.js";
import { hashExamDocument, duplicateIngestionAction } from "../lib/exam-extraction/ingestion-policy.js";
import { reconcileExamCandidates } from "../lib/exam-extraction/reconciliation.js";
import { ExtractedExamSchema, type ExtractedExam } from "../lib/exam-extraction/schema.js";
import {
  parseBrazilNumber,
  positiveConversionFactor,
  resolveConversion,
} from "../lib/exam-extraction/persist.js";
import { rejectUnversionedReprocessing } from "../lib/exam-extraction/reprocessing-safety.js";

function exam(overrides: Partial<ExtractedExam> = {}): ExtractedExam {
  return {
    patient: { name: "Cliente sintético", cpf: null, birthDate: null },
    collectionDate: "13/11/2026",
    labName: "Laboratório Sintético",
    analytes: [],
    confidence: 0.9,
    ...overrides,
  };
}

describe("recebimento sintético e proteção do processamento de exames", () => {
  it("lê um PDF gerado durante o teste sem usar arquivo clínico", async () => {
    const document = await PDFDocument.create();
    const page = document.addPage();
    page.drawText("LAUDO SINTÉTICO — GLICOSE 95 mg/dL", { x: 40, y: 700 });
    const buffer = Buffer.from(await document.save());

    const parsed = await extractPdfText(buffer);
    expect(parsed.pageCount).toBe(1);
    expect(parsed.text).toContain("GLICOSE 95 mg/dL");
    expect(hashExamDocument(buffer)).toBe(hashExamDocument(Buffer.from(buffer)));
    expect(hashExamDocument(buffer)).not.toBe(hashExamDocument(Buffer.from("outro arquivo sintético")));
    expect(duplicateIngestionAction("recebido")).toBe("skip");
    expect(duplicateIngestionAction("processando")).toBe("skip");
    expect(duplicateIngestionAction("erro")).toBe("retry");
  });

  it("mantém data e laboratório ausentes como nulos, sem preenchimento inventado", () => {
    const parsed = ExtractedExamSchema.parse({
      patient: {},
      analytes: [],
      confidence: 0.5,
    });
    expect(parsed.collectionDate).toBeNull();
    expect(parsed.labName).toBeNull();
    expect(parsed.patient.name).toBeNull();
  });

  it("reconcilia nomes e registra divergência de data, laboratório e valor", () => {
    const result = reconcileExamCandidates([
      {
        provider: "gemini",
        data: exam({
          analytes: [
            { name: "Glicose", value: "95", unit: "mg/dL", referenceRange: "70 a 99", method: null, history: [] },
          ],
        }),
      },
      {
        provider: "openai",
        data: exam({
          collectionDate: "14/11/2026",
          labName: "Outro Laboratório Sintético",
          analytes: [
            { name: "glicose", value: "96", unit: "mg/dL", referenceRange: "70 a 99", method: null, history: [] },
            { name: "Insulina", value: "8", unit: "µUI/mL", referenceRange: null, method: null, history: [] },
          ],
        }),
      },
    ]);

    expect(result.provisional?.analytes).toHaveLength(2);
    expect(result.provisional?.analytes[0].value).toBe("95");
    expect(result.provisional?.collectionDate).toBe("13/11/2026");
    expect(result.conflicts.map((conflict) => conflict.field)).toEqual(expect.arrayContaining([
      "collectionDate",
      "labName",
      "analito:glicose:value",
    ]));
    expect(result.conflicts.find((conflict) => conflict.field === "analito:glicose:value")?.candidates)
      .toEqual([{ provider: "gemini", value: "95" }, { provider: "openai", value: "96" }]);
  });

  it("aceita somente fatores de conversão positivos e finitos", () => {
    expect(positiveConversionFactor("10")).toBe(10);
    expect(positiveConversionFactor("0")).toBeNull();
    expect(positiveConversionFactor("-2")).toBeNull();
    expect(positiveConversionFactor("NaN")).toBeNull();
    expect(positiveConversionFactor(null)).toBeNull();

    expect(parseBrazilNumber("1.234,5")).toBe(1234.5);
    expect(resolveConversion({
      canonicalUnit: "mg/dL",
      factors: new Map([["g/l", 100]]),
    }, "g/L")).toEqual({
      factor: 100,
      unitCanonical: "mg/dL",
      converted: true,
      unknownUnit: false,
    });
    expect(resolveConversion({
      canonicalUnit: "mg/dL",
      factors: new Map(),
    }, "unidade sintética")).toMatchObject({
      factor: 1,
      unitCanonical: "unidade sintética",
      unknownUnit: true,
    });
  });

  it("bloqueia reextração sem versionamento e devolve conflito explícito", () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    rejectUnversionedReprocessing(response as never);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "EXAM_REPROCESSING_REQUIRES_VERSIONING",
    }));
  });
});
