import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { iniciarFabrica } from "../lib/documentos/padrao";
import { generateExamRequestPdf } from "../lib/exam-request-pdf";
import { generateRecipePdf } from "../lib/prescription-pdf";
import { generateReceituarioPdfV2 } from "../lib/receituario-pdf";

function extrairTexto(bytes: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), "paxmed2b-"));
  try {
    const file = join(dir, "prova.pdf");
    writeFileSync(file, bytes);
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).split("\f").filter((s) => s.trim());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const header = {
  emissor: "instituto_padua" as const,
  titulo: "SOLICITAÇÃO DE EXAMES",
  subtitulo: "EXAMES — SANGUE / LABORATORIAL",
};

describe("Modelo 2B: prova sem dados clínicos", () => {
  it.each([1, 2, 3, 10])("conta corretamente as %i páginas e carimba uma vez", async (count) => {
    const fab = await iniciarFabrica({ modeloProva: "paxmed-2b-sintetico" });
    for (let i = 0; i < count; i++) fab.novaPagina(header);
    fab.carimbarRodape();
    fab.carimbarRodape();
    const bytes = await fab.finalizar();
    const paginas = extrairTexto(bytes);
    expect(paginas).toHaveLength(count);
    paginas.forEach((p, i) => {
      expect(p).toContain(`Página ${i + 1} de ${count}`);
      expect(p).toContain("DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA");
      expect(p).toContain("Sem verificação");
      expect(p).toContain("SEM QR");
      expect(p.match(/Instituto Pádua/g)).toHaveLength(1);
    });
    expect(() => fab.novaPagina(header)).toThrow();
  });

  it("recusa título que não cabe e emissor diferente", async () => {
    const fab = await iniciarFabrica({ modeloProva: "paxmed-2b-sintetico" });
    expect(() => fab.novaPagina({ ...header, titulo: "TÍTULO EXTENSO ".repeat(30) })).toThrow(/excede/);
    expect(() => fab.novaPagina({ ...header, emissor: "paxter" })).toThrow(/exclusiva/);
  });

  it("recusa uso em produção e documento sem identificação de teste", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(iniciarFabrica({ modeloProva: "paxmed-2b-sintetico" })).rejects.toThrow(/produção/);
    } finally {
      vi.unstubAllEnvs();
    }
    await expect(generateExamRequestPdf({
      modelo2bProva: true, tipo: "sangue", tipoLabel: "SANGUE / LABORATORIAL",
      clientName: "Cliente sintético", dateBR: "07/11/2026", items: [],
    })).rejects.toThrow(/homologação/);
  });

  it("gera solicitação sintética multipágina preservando todos os itens", async () => {
    const items = Array.from({ length: 48 }, (_, i) => ({ nomeExame: `Exame sintético ${i + 1}`, preparo: "Somente para teste." }));
    const bytes = await generateExamRequestPdf({
      homologacao: true, modelo2bProva: true, tipo: "sangue", tipoLabel: "SANGUE / LABORATORIAL",
      clientName: "Cliente sintético", professionalName: "Profissional sintético",
      dateBR: "07/11/2026", items,
    });
    const document = await PDFDocument.load(bytes);
    const paginas = extrairTexto(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(paginas).toHaveLength(document.getPageCount());
    for (let i = 1; i <= items.length; i++) {
      expect(paginas.join("\n")).toContain(`Exame sintético ${i}`);
    }
    paginas.forEach((p, i) => expect(p).toContain(`Página ${i + 1} de ${paginas.length}`));
  });

  it("gera receita sintética com o modelo, sem conteúdo clínico verdadeiro", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ name: `Fórmula de teste ${i + 1}`, ativos: "Conteúdo fictício" }));
    const bytes = await generateRecipePdf({
      recipeType: "manipulacao", pharmacyId: null, anvisaType: null, anvisaColor: null,
      anvisaColorName: null, internalColor: null, needsSncr: false, title: "Teste", items,
    }, { clientName: "Cliente fictício", dateBR: "07/11/2026", homologationNotice: true, modelo2bProva: true });
    const paginas = extrairTexto(bytes);
    expect(paginas.length).toBeGreaterThan(1);
    for (let i = 1; i <= items.length; i++) {
      expect(paginas.join("\n")).toContain(`Fórmula de teste ${i}`);
    }
    paginas.forEach((p, i) => {
      expect(p).toContain("PRESCRIÇÃO MÉDICA");
      expect(p).toContain(`Página ${i + 1} de ${paginas.length}`);
      expect(p).toContain("DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA");
      expect(p).not.toContain("personalizadas e foram elaboradas");
    });
  });

  it("usa o motor real de receita na prova, sem perder itens e com rodapé único", async () => {
    const formulas = Array.from({ length: 24 }, (_, i) => ({
      nome: `FORMULA FICTICIA ${String(i + 1).padStart(2, "0")}`,
      ativos: "CONTEUDO DE TESTE",
      posologia: "NAO DISPENSAR",
    }));
    const bytes = await generateReceituarioPdfV2({
      modelo2bProva: true, homologacao: true, assinaturaDigitalEstado: "sem_certificado_vencido",
      medicoName: "MEDICO FICTICIO", medicoCrm: "REGISTRO FICTICIO", clinicaNome: "CLINICA FICTICIA",
      pacienteNome: "CLIENTE FICTICIO", dataEmissao: "2026-11-07", tipoReceita: "simples", formulas,
    });
    const paginas = extrairTexto(bytes);
    expect(paginas.length).toBeGreaterThan(1);
    for (const formula of formulas) expect(paginas.join("\n")).toContain(formula.nome);
    paginas.forEach((p, i) => {
      expect(p).toContain("PRESCRIÇÃO MÉDICA");
      expect(p).toContain("DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA");
      expect(p.match(new RegExp(`Página ${i + 1} de ${paginas.length}`, "g"))).toHaveLength(1);
      expect(p).toContain("SEM QR");
    });
  });

  it("impede a prova no motor real sem homologação ou em produção", async () => {
    const data = {
      modelo2bProva: true, assinaturaDigitalEstado: "sem_certificado_vencido" as const,
      medicoName: "MÉDICO FICTÍCIO", medicoCrm: "TESTE", clinicaNome: "CLÍNICA FICTÍCIA",
      formulas: [],
    };
    await expect(generateReceituarioPdfV2(data)).rejects.toThrow(/homologação sintética/);
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(generateReceituarioPdfV2({ ...data, homologacao: true })).rejects.toThrow(/fora de produção/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
