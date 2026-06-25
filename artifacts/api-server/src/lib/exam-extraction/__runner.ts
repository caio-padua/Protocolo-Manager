import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractPdfText, compactExamText } from "./pdf-text";
import { extractExamFromText } from "./extract";

const PDF_PATH = resolve(
  process.cwd(),
  "../../attached_assets/797224511850_1782392825450.pdf",
);

const EXPECTED = [
  { aliases: ["hemoglobina"], value: "18,4", unit: "g/dL" },
  { aliases: ["ferritina"], value: "617,3", unit: "ng/mL" },
  { aliases: ["proteína c reativa", "proteina c reativa", "pcr"], value: "0,29", unit: "mg/dL" },
  { aliases: ["ferro"], value: "123", unit: "µg/dL" },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

async function main() {
  console.log("== ENV check ==");
  console.log("BASE_URL set:", !!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL);
  console.log("API_KEY set:", !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY);

  const buffer = await readFile(PDF_PATH);
  console.log(`\n== PDF lido: ${buffer.length} bytes ==`);

  const t0 = Date.now();
  const pdf = await extractPdfText(buffer);
  console.log(
    `Texto extraído: ${pdf.charCount} chars, ${pdf.pageCount} páginas, enough=${pdf.enough} (${Date.now() - t0}ms)`,
  );

  const compact = compactExamText(pdf.text);
  console.log(
    `Compactado: ${compact.charCount} chars (reducao ${(100 - (compact.charCount / pdf.charCount) * 100).toFixed(0)}%)`,
  );

  const t1 = Date.now();
  const { data, modelUsed, escalated } = await extractExamFromText(pdf.text);
  console.log(
    `\n== Gemini OK (${modelUsed}, escalated=${escalated}, ${Date.now() - t1}ms) ==`,
  );
  console.log("Paciente:", JSON.stringify(data.patient));
  console.log("Coleta:", data.collectionDate, "| Lab:", data.labName);
  console.log("Confiança:", data.confidence);
  console.log("Total de analitos:", data.analytes.length);

  console.log("\n== Conferência de valores-chave ==");
  let pass = 0;
  for (const exp of EXPECTED) {
    const found = data.analytes.find((a) =>
      exp.aliases.some((al) => norm(a.name).includes(norm(al))),
    );
    const ok = !!found && norm(found.value).includes(norm(exp.value));
    console.log(
      `${ok ? "OK " : "XX "} ${exp.aliases[0]}: esperado ${exp.value} ${exp.unit} -> ${
        found ? `${found.value} ${found.unit ?? ""} (hist:${found.history.length})` : "NÃO ENCONTRADO"
      }`,
    );
    if (ok) pass++;
  }
  console.log(`\nResultado: ${pass}/${EXPECTED.length} valores-chave conferidos`);

  console.log("\n== Amostra (primeiros 12 analitos) ==");
  for (const a of data.analytes.slice(0, 12)) {
    console.log(`- ${a.name}: ${a.value} ${a.unit ?? ""} | ref: ${a.referenceRange ?? "-"}`);
  }
}

main().catch((err) => {
  console.error("ERRO (message):", err?.message ?? String(err));
  if (err?.name) console.error("ERRO (name):", err.name);
  if (err?.stack) console.error("ERRO (stack):", String(err.stack).split("\n").slice(0, 6).join("\n"));
  process.exit(1);
});
