import { z } from "zod";

// ============================================================================
// Trajetoria do Exame Uploadado — Trilha de IMAGEM (schema de extracao)
// Laudo de imagem e texto LIVRE descritivo (USG, RMN, TC, densitometria, raio-x).
// Um unico PDF pode ser CONJUGADO (varios exames no mesmo arquivo) -> "exams" e
// uma LISTA. Cada campo tolera chave ausente (o modelo omite em vez de mandar null).
// ============================================================================

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => v ?? null);

export const ExtractedImageFindingSchema = z.object({
  // rotulo do achado como o laudo descreve (ex.: "Lobo direito", "Conclusao")
  field: z.string().describe("Nome/rotulo do achado como aparece no laudo"),
  // nivel anatomico quando se aplica (RMN de coluna: "L4-L5"); senao null
  level: nullableString.describe("Nivel anatomico, ex.: L4-L5; null se nao se aplica"),
  // valor/descricao textual do achado
  value: nullableString.describe("Descricao/valor do achado, texto livre"),
});

export const ExtractedImageExamSchema = z.object({
  // tipo do exame por CONTEUDO: usg | rmn | tc | densitometria | rx | outro
  examType: z
    .string()
    .describe("Tipo do exame de imagem: usg, rmn, tc, densitometria, rx ou outro"),
  // setor/aba: ultrassom | ressonancia | tomografia | densitometria | radiografia
  sector: nullableString.describe("Setor: ultrassom, ressonancia, tomografia, densitometria, radiografia"),
  title: nullableString.describe("Titulo do exame, ex.: Ultrassonografia da tireoide"),
  collectionDate: nullableString.describe("Data do exame DD/MM/AAAA"),
  labName: nullableString.describe("Nome do laboratorio/clinica de imagem"),
  conclusion: nullableString.describe("Impressao diagnostica / conclusao do laudo"),
  comparativo: nullableString.describe("Comparacao com exame anterior (antes/depois qualitativo)"),
  findings: z.array(ExtractedImageFindingSchema).optional().transform((v) => v ?? []),
});

export const ExtractedImageReportSchema = z.object({
  patient: z.object({
    name: nullableString,
    cpf: nullableString.describe("CPF como impresso"),
    birthDate: nullableString.describe("Data de nascimento DD/MM/AAAA"),
  }),
  // lista: 1 PDF pode conter varios exames de imagem (laudo conjugado)
  exams: z.array(ExtractedImageExamSchema),
  confidence: z.number().min(0).max(1).describe("Confianca global da extracao, 0 a 1"),
});

export type ExtractedImageFinding = z.infer<typeof ExtractedImageFindingSchema>;
export type ExtractedImageExam = z.infer<typeof ExtractedImageExamSchema>;
export type ExtractedImageReport = z.infer<typeof ExtractedImageReportSchema>;
