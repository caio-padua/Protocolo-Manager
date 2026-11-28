import { describe, expect, it } from "vitest";
import { selectClinicalDocuments } from "../lib/clinical-document-selection";
import type { IssuedDocumentSummary } from "../lib/clinical-document-share";

const doc = (documentId: number, documentType: IssuedDocumentSummary["documentType"], issuedAt: string) =>
  ({ documentId, documentType, issuedAt, label: "Documento emitido", professionalId: 1,
    signatureStatus: "signed", pdfSha256: "synthetic" });
const docs = [doc(90, "prescricao", "2026-11-22"), doc(91, "prescricao", "2026-11-22"),
  doc(40, "pedido_exames", "2026-11-20"), doc(80, "prescricao", "2026-11-18")];
describe("seleção de documentos já autorizados", () => {
  it("receita ausente não vira pedido de exame", () => {
    expect(selectClinicalDocuments([docs[2]], "segunda via da minha receita mais recente")).toEqual([]);
  });
  it("intersecta data com tipo", () => {
    expect(selectClinicalDocuments(docs, "segunda via dos exames de 22/11/2026")).toEqual([]);
    expect(selectClinicalDocuments(docs, "segunda via da receita de 18/11/2026")).toEqual([docs[3]]);
  });
  it("data inexistente não cai em documento de outro dia", () => {
    expect(selectClinicalDocuments(docs, "segunda via da receita de 17/11/2026")).toEqual([]);
  });
  it("mesma data conserva ambiguidade e permite escolher identificador explícito", () => {
    expect(selectClinicalDocuments(docs, "segunda via da última receita")).toEqual(docs.slice(0, 2));
    expect(selectClinicalDocuments(docs, "segunda via do documento 91")).toEqual([docs[1]]);
  });
  it("tipo incompatível com identificador bloqueia", () => {
    expect(selectClinicalDocuments(docs, "segunda via dos exames documento 91")).toEqual([]);
  });
  it("não retorna identificador fora da lista autorizada", () => {
    expect(selectClinicalDocuments(docs, "segunda via do documento 999")).toEqual([]);
  });
  it("escolhe data mais recente somente dentro do tipo pedido", () => {
    expect(selectClinicalDocuments(docs, "segunda via do último pedido de exames")).toEqual([docs[2]]);
  });
});
