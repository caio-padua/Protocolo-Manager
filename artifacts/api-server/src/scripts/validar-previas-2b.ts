// Documento de prova sem dados de clientes; execução manual apenas em desenvolvimento.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ObjectStorageService } from "../lib/objectStorage";
import { aplicarOuroAoSimbolo } from "../lib/documentos/paxmed-ouro";
import { recortarSimbolo } from "../lib/documentos/paxmed-recortar-simbolo";
import { validarTextosEmpresa2b } from "../lib/documentos/paxmed-2b-limites";
import { prepararVisualProva, desenharCabecalhoProva, carimbarRodapesProva } from "../lib/documentos/paxmed-modelo-2b-prova";

async function main() {
  if (process.env.NODE_ENV !== "development") throw new Error("Provas disponíveis apenas em desenvolvimento.");
  const rows = await db.execute(sql`
    SELECT e.nome, i.nome_cabecalho, i.rodape_linha1, i.rodape_linha2, i.rodape_linha3,
      i.simbolo_path, i.simbolo_exemplo, i.dados_exemplo
    FROM paxmed_2b_empresa_identidade i JOIN empresas e ON e.id = i.empresa_id
    WHERE e.ativa = TRUE AND e.tipo IN ('clinic', 'genesis_seed') ORDER BY e.nome
  `);
  const storage = new ObjectStorageService();
  const out = await PDFDocument.create();
  for (let index = 0; index < rows.rows.length; index++) {
    const single = await PDFDocument.create();
    const fontSingle = await single.embedFont(StandardFonts.Helvetica);
    const boldSingle = await single.embedFont(StandardFonts.HelveticaBold);
    const entry = rows.rows[index] as Record<string, string | boolean>;
    const textos = {
      nomeCabecalho: String(entry.nome_cabecalho), rodapeLinha1: String(entry.rodape_linha1),
      rodapeLinha2: String(entry.rodape_linha2), rodapeLinha3: String(entry.rodape_linha3),
    };
    await validarTextosEmpresa2b(textos);
    const file = await storage.getObjectEntityFile(`/objects/paxmed-marcas-finais/${entry.simbolo_path}`);
    const [bytes] = await file.download();
    const visual = await prepararVisualProva(single, { textos, simboloDourado: recortarSimbolo(aplicarOuroAoSimbolo(bytes)) });
    const page = single.addPage([210 * 72 / 25.4, 297 * 72 / 25.4]);
    desenharCabecalhoProva(page, visual, fontSingle, boldSingle, "PRESCRIÇÃO MÉDICA", "PRÉVIA DE TESTE");
    if (entry.simbolo_exemplo || entry.dados_exemplo) page.drawText("IDENTIDADE DEMONSTRATIVA — CONFERIR ANTES DE UTILIZAR", {
      x: 13 * 72 / 25.4, y: 235 * 72 / 25.4, font: boldSingle, size: 8, color: rgb(0.65, 0.08, 0.08),
    });
    carimbarRodapesProva(single, visual, fontSingle);
    const [copied] = await out.copyPages(single, [0]);
    out.addPage(copied);
    console.info(`${entry.nome}: prova validada`);
  }
  writeFileSync(resolve("../../generated-artifacts/paxmed-2b-clinicas-demonstracao.pdf"), await out.save());
  console.info(`Provas geradas: ${rows.rows.length}.`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
