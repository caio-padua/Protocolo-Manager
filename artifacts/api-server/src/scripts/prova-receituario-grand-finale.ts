// Prova offline com dados fictícios; não usa prontuário, banco ou serviços externos.
import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { generateReceituarioPdfV2 } from "../lib/receituario-pdf";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Prova indisponível em produção.");
  process.env.NODE_ENV = "test";
  const destino = process.argv[2];
  if (!destino) throw new Error("Informe o caminho do documento de prova.");
  const especial = process.argv[3] === "especial" || process.argv[3] === "especial-longo";
  const longo = process.argv[3] === "especial-longo";
  // Amostra para o Instituto Pádua: mesma silhueta oficial adotada no sistema,
  // com cor dourada e canal de transparência originais preservados.
  const simbolo = PNG.sync.read(await readFile(new URL("../../../padcom/src/assets/padua-dp-mask.png", import.meta.url)));
  for (let n = 0; n < simbolo.data.length; n += 4) {
    simbolo.data[n] = 214; simbolo.data[n + 1] = 175; simbolo.data[n + 2] = 88;
  }
  const pdf = await generateReceituarioPdfV2({
    homologacao: true, modelo2bProva: true, modeloGrandFinaleProva: true,
    identidade2bProva: {
      simboloDourado: PNG.sync.write(simbolo),
      nomeImagem: await readFile(new URL("../../../padcom/src/assets/padua-wordmark.png", import.meta.url)),
      textos: {
        nomeCabecalho: "Instituto Pádua",
        rodapeLinha1: "Instituto Pádua",
        rodapeLinha2: "Endereço fictício",
        rodapeLinha3: "Cidade fictícia",
      },
    },
    assinaturaDigitalEstado: "sem_certificado_vencido",
    medicoName: "Profissional fictício", medicoCrm: "12345/SP",
    clinicaNome: "Instituto Pádua", clinicaEndereco: "Rua Exemplo, 10",
    pacienteNome: "Cliente fictício", pacienteEndereco: "Rua Teste, 20",
    dataEmissao: "2026-11-09", tipoReceita: especial ? "especial" : "simples",
    formulas: Array.from({ length: especial ? 1 : 6 }, (_, index) => ({
      nome: `Fórmula de demonstração ${index + 1}`,
      ativos: longo
        ? Array.from({ length: 42 }, (_, i) => `Item fictício ${i + 1} para conferir a paginação.`).join("\n")
        : "Conteúdo fictício para conferir a aparência.",
      posologia: "Não é uma receita e não deve ser dispensada.",
    })),
  });
  await writeFile(destino, pdf);
}

main().catch((error) => { console.error("Falha na prova:", error.message); process.exitCode = 1; });
