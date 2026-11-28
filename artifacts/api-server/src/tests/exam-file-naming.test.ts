import { describe, expect, it } from "vitest";
import {
  buildExamFileName,
  classifyExamLabel,
  classifyExamRegion,
  normalizeExamTypeLabel,
  parseExamDatePrefix,
} from "../lib/exam-file-naming";

describe("Código de Renomeação de Exames", () => {
  it("usa o prefixo existente AA.MM.DD e o rótulo LABOR", () => {
    expect(buildExamFileName({
      date: "16/11/2026",
      type: "exame_sangue",
      clientName: "João da Silva",
      extension: ".PDF",
    })).toBe("26.11.16 LABOR JOAO DA SILVA.PDF");
  });

  it("mantém as siglas históricas e normaliza os acentos", () => {
    expect(normalizeExamTypeLabel("ultrassom")).toBe("USG");
    expect(normalizeExamTypeLabel("ressonância magnética")).toBe("RMN");
    expect(normalizeExamTypeLabel("tomografia")).toBe("TC");
    expect(normalizeExamTypeLabel("raio-x")).toBe("RX");
    expect(buildExamFileName({
      date: "2026-11-16",
      type: "USG",
      region: "Tireóide",
      clientName: "Clínica São João",
      extension: "pdf",
    })).toBe("26.11.16 USG TIREOIDE CLINICA SAO JOAO.PDF");
  });

  it("preserva os nomes clínicos de cintilografias renal e miocárdica", () => {
    expect(classifyExamLabel("Cintilografia miocárdica")).toBe("CINTILOGRAFIA MIOCARDICA");
    expect(classifyExamLabel("Cintilografia renal estática")).toBe("CINTILOGRAFIA RENAL ESTATICA");
    expect(buildExamFileName({
      date: "16/11/2026",
      type: classifyExamLabel("Cintilografia renal estática")!,
      region: classifyExamRegion("Cintilografia renal estática"),
      clientName: "João da Silva",
      extension: "pdf",
    })).toBe("26.11.16 CINTILOGRAFIA RENAL ESTATICA JOAO DA SILVA.PDF");
  });

  it("reconhece modalidades e procedimentos existentes no catálogo", () => {
    expect(classifyExamLabel("Doppler colorido de carótidas")).toBe("USG");
    expect(classifyExamLabel("Cintilografia renal estática")).toBe("CINTILOGRAFIA RENAL ESTATICA");
    expect(classifyExamLabel("CYP2C19 genética")).toBe("GENETICA");
    expect(classifyExamLabel("Cápsula endoscópica")).toBe("CAPSULA ENDOSCOPICA");
    expect(classifyExamLabel("Angiotomografia coronariana")).toBe("ANGIOTOMOGRAFIA");
  });

  it("normaliza regiões e remove pontuação dos nomes finais", () => {
    expect(classifyExamRegion("Ressonância magnética da coluna lombar")).toBe("COLUNA LOMBAR");
    expect(buildExamFileName({
      date: "26.11.16",
      type: "RMN",
      region: "Coluna lombar",
      clientName: "Maria O'Connor-Souza",
      extension: ".PDF",
    })).toBe("26.11.16 RMN COLUNA LOMBAR MARIA O CONNOR SOUZA.PDF");
  });

  it("rejeita datas impossíveis e aceita as formas de data antigas", () => {
    expect(parseExamDatePrefix("31/02/2026")).toBeNull();
    expect(parseExamDatePrefix("29/02/2026")).toBeNull();
    expect(parseExamDatePrefix("29/02/2024")).toBe("24.02.29");
    expect(parseExamDatePrefix("16/11/26")).toBe("26.11.16");
  });
});
