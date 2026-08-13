/**
 * Pré-visualização SEGURA do PDF do protocolo.
 *
 * Existe porque a rota GET /api/protocols/:id/document-pdf tem efeitos colaterais
 * reais: sobe o arquivo no Google Drive e ENVIA E-MAIL AO PACIENTE. Usá-la para
 * conferir aparência manda mensagem de verdade para uma pessoa de verdade.
 *
 * Este script chama apenas a montagem do layout + assinatura e escreve o arquivo
 * em disco. Não envia e-mail, não sobe no Drive, não dispara cadernos jurídicos.
 *
 * Uso:  node scripts/preview-protocol-pdf.mjs <protocolId> <arquivoDeSaida>
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const [, , protocolIdArg, outArg] = process.argv;
const protocolId = Number(protocolIdArg);
const outPath = outArg || `/tmp/protocolo-${protocolId}-preview.pdf`;

if (!Number.isFinite(protocolId)) {
  console.error("Uso: node scripts/preview-protocol-pdf.mjs <protocolId> [saida.pdf]");
  process.exit(1);
}

// O bundle de produção concentra tudo em dist/index.mjs; importamos o módulo
// compilado para reusar exatamente o mesmo código que a rota usa.
const distUrl = pathToFileURL(new URL("../dist/index.mjs", import.meta.url).pathname).href;

const mod = await import(distUrl);
const generate = mod.generateProtocolDocumentPdf ?? mod.default?.generateProtocolDocumentPdf;

if (typeof generate !== "function") {
  console.error("generateProtocolDocumentPdf não está exportado pelo bundle.");
  console.error("Exports disponíveis:", Object.keys(mod).slice(0, 40).join(", "));
  process.exit(2);
}

const { pdfBytes } = await generate({ protocolId });
fs.writeFileSync(outPath, Buffer.from(pdfBytes));
console.log(`OK ${outPath} (${fs.statSync(outPath).size} bytes)`);
process.exit(0);
