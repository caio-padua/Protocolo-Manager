// Gera exclusivamente um documento fictício para conferência visual offline.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateExamRequestPdf } from "../lib/exam-request-pdf";
import { generateRecipePdf } from "../lib/prescription-pdf";

async function main() {
  const destination = process.argv[2];
  if (!destination) throw new Error("Informe um caminho para a prova sintética.");
  const kind = process.argv[3] ?? "exames";
  if (kind !== "exames" && kind !== "receita") throw new Error("Selecione exames ou receita.");
  const exam = () => generateExamRequestPdf({
    homologacao: true,
    modelo2bProva: true,
    tipo: "sangue",
    tipoLabel: "SANGUE / LABORATORIAL",
    clientName: "CLIENTE FICTÍCIO",
    professionalName: "PROFISSIONAL FICTÍCIO",
    professionalCrm: "REGISTRO FICTÍCIO",
    dateBR: "07/11/2026",
    items: Array.from({ length: 25 }, (_, i) => ({
      nomeExame: `Exame de demonstração ${String(i + 1).padStart(2, "0")}`,
      preparo: "Informação fictícia para conferência visual da paginação.",
    })),
  });
  const recipe = () => generateRecipePdf({
    recipeType: "manipulacao", pharmacyId: null, anvisaType: null, anvisaColor: null,
    anvisaColorName: null, internalColor: null, needsSncr: false, title: "Teste",
    items: Array.from({ length: 22 }, (_, i) => ({
      name: `Fórmula de demonstração ${String(i + 1).padStart(2, "0")}`,
      ativos: "Conteúdo fictício para demonstração.",
    })),
  }, {
    homologationNotice: true, modelo2bProva: true, clientName: "CLIENTE FICTÍCIO",
    professionalName: "PROFISSIONAL FICTÍCIO", dateBR: "07/11/2026",
  });
  const bytes = await (kind === "exames" ? exam() : recipe());
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

main().catch((error) => {
  console.error("Não foi possível gerar a prova sintética:", error.message);
  process.exitCode = 1;
});
