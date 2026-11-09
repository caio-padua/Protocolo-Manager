// Prova offline com dados fictícios; não usa prontuário, banco ou serviços externos.
import { writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { generateReceituarioPdfV2 } from "../lib/receituario-pdf";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Prova indisponível em produção.");
  process.env.NODE_ENV = "test";
  const destino = process.argv[2];
  if (!destino) throw new Error("Informe o caminho do documento de prova.");
  const especial = process.argv[3] === "especial";
  const simbolo = new PNG({ width: 40, height: 40 });
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const n = (y * 40 + x) * 4;
    const raio = Math.hypot(x - 19.5, y - 19.5);
    simbolo.data[n] = 214; simbolo.data[n + 1] = 175; simbolo.data[n + 2] = 88;
    simbolo.data[n + 3] = raio > 12 && raio < 19 ? 255 : 0;
  }
  const pdf = await generateReceituarioPdfV2({
    homologacao: true, modelo2bProva: true, modeloGrandFinaleProva: true,
    identidade2bProva: {
      simboloDourado: PNG.sync.write(simbolo),
      textos: {
        nomeCabecalho: "Clínica Exemplo",
        rodapeLinha1: "Clínica Exemplo",
        rodapeLinha2: "Endereço fictício",
        rodapeLinha3: "Cidade fictícia",
      },
    },
    assinaturaDigitalEstado: "sem_certificado_vencido",
    medicoName: "Profissional fictício", medicoCrm: "12345/SP",
    clinicaNome: "Clínica Exemplo", clinicaEndereco: "Rua Exemplo, 10",
    pacienteNome: "Cliente fictício", pacienteEndereco: "Rua Teste, 20",
    dataEmissao: "2026-11-09", tipoReceita: especial ? "especial" : "simples",
    formulas: Array.from({ length: especial ? 1 : 6 }, (_, index) => ({
      nome: `Fórmula de demonstração ${index + 1}`,
      ativos: "Conteúdo fictício para conferir a aparência.",
      posologia: "Não é uma receita e não deve ser dispensada.",
    })),
  });
  await writeFile(destino, pdf);
}

main().catch((error) => { console.error("Falha na prova:", error.message); process.exitCode = 1; });
