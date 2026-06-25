import { z } from "zod";

/** String que tolera chave ausente ou null no JSON do modelo; ambos viram null. */
const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => v ?? null);

export const ExtractedHistoryPointSchema = z.object({
  date: nullableString.describe("Data do resultado histórico, formato DD/MM/AAAA"),
  value: nullableString.describe("Valor exatamente como impresso, com vírgula decimal"),
  unit: nullableString,
});

export const ExtractedAnalyteSchema = z.object({
  name: z.string().describe("Nome do analito/exame exatamente como impresso"),
  value: nullableString.describe("Valor atual exatamente como impresso, com vírgula decimal"),
  unit: nullableString.describe("Unidade impressa, ex.: g/dL, ng/mL, mg/dL"),
  referenceRange: nullableString.describe("Faixa de referência impressa, ex.: 13,0 a 17,0"),
  method: nullableString.describe("Método, quando impresso"),
  history: z.array(ExtractedHistoryPointSchema).optional().transform((v) => v ?? []),
});

export const ExtractedPatientSchema = z.object({
  name: nullableString,
  cpf: nullableString.describe("CPF como impresso (com ou sem pontuação)"),
  birthDate: nullableString.describe("Data de nascimento DD/MM/AAAA"),
});

export const ExtractedExamSchema = z.object({
  patient: ExtractedPatientSchema,
  collectionDate: nullableString.describe("Data da coleta DD/MM/AAAA"),
  labName: nullableString.describe("Nome do laboratório, ex.: DASA, Fleury"),
  analytes: z.array(ExtractedAnalyteSchema),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confiança global da extração, 0 a 1"),
});

export type ExtractedHistoryPoint = z.infer<typeof ExtractedHistoryPointSchema>;
export type ExtractedAnalyte = z.infer<typeof ExtractedAnalyteSchema>;
export type ExtractedPatient = z.infer<typeof ExtractedPatientSchema>;
export type ExtractedExam = z.infer<typeof ExtractedExamSchema>;
