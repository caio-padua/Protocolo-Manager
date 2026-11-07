// Execução manual, somente desenvolvimento, autorizada para preencher exemplos.
// Não sobrescreve identidade existente, não cria dados fiscais ou empresas.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { aplicarOuroAoSimbolo } from "../lib/documentos/paxmed-ouro";
import { validarTextosEmpresa2b } from "../lib/documentos/paxmed-2b-limites";

async function main() {
  if (process.env.NODE_ENV !== "development") throw new Error("Exemplos permitidos apenas em desenvolvimento.");
  const companies = await db.execute(sql`
    SELECT e.id, e.nome, e.endereco, e.numero, e.bairro, e.cidade, e.estado, e.cep
    FROM empresas e
    LEFT JOIN paxmed_2b_empresa_identidade i ON i.empresa_id = e.id
    WHERE e.ativa = TRUE AND e.status <> 'ARQUIVADA'
      AND e.tipo IN ('clinic', 'genesis_seed') AND i.empresa_id IS NULL
    ORDER BY e.id
  `);
  const storage = new ObjectStorageService();
  for (const entry of companies.rows) {
    const row = entry as Record<string, string | number | null>;
    const nome = String(row.nome ?? "").trim();
    if (!nome) throw new Error(`Empresa ${row.id}: nome ausente.`);
    const incomplete = !row.endereco || !row.numero || !row.bairro || !row.cidade || !row.estado || !row.cep;
    const street = row.endereco && row.numero ? `${row.endereco}, ${row.numero}` : "Endereço fictício";
    const line2 = `${street} - ${row.bairro || "Bairro fictício"}`;
    const line3 = row.cep && row.cidade && row.estado
      ? `CEP.: ${row.cep} - ${row.cidade} - ${row.estado}`
      : "Cidade fictícia - XX";
    const textos = { nomeCabecalho: nome, rodapeLinha1: nome, rodapeLinha2: line2, rodapeLinha3: line3 };
    await validarTextosEmpresa2b(textos);
    const parts = nome.trim().split(/\s+/);
    const initials = `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase().replace(/[^A-Z]/g, "");
    if (!initials) throw new Error(`Empresa ${row.id}: iniciais indisponíveis.`);
    const image = execFileSync("convert", [
      "-size", "320x320", "xc:none", "-stroke", "white", "-strokewidth", "5",
      "-fill", "none", "-draw", "roundrectangle 30,30 290,290 48,48",
      "-fill", "white", "-stroke", "none", "-font", "DejaVu-Serif",
      "-pointsize", "132", "-gravity", "center", "-annotate", "+0+0", initials, "PNG32:-",
    ], { maxBuffer: 2 * 1024 * 1024 });
    aplicarOuroAoSimbolo(image);
    const id = randomUUID();
    await storage.savePrivateObject(`paxmed-marcas-finais/${id}`, image, "image/png");
    const inserted = await db.execute(sql`
      INSERT INTO paxmed_2b_empresa_identidade
        (empresa_id, nome_cabecalho, rodape_linha1, rodape_linha2, rodape_linha3,
         simbolo_path, simbolo_exemplo, dados_exemplo)
      VALUES (${Number(row.id)}, ${nome}, ${nome}, ${line2}, ${line3}, ${id}, TRUE, ${incomplete})
      ON CONFLICT (empresa_id) DO NOTHING RETURNING empresa_id
    `);
    console.info(`${nome}: ${inserted.rows.length ? "exemplo criado" : "identidade existente preservada"}`);
  }
  console.info(`Empresas examinadas sem identidade: ${companies.rows.length}.`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
