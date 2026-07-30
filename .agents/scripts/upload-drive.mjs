import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "node:fs";
import path from "node:path";

const FOLDER_ID = "1_oq50UEJo45YwdDZKvuI5awNuUf9Rqke";
const FILE_NAME = "PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx";
const FILE_PATH = path.resolve(".agents/outputs", FILE_NAME);
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const connectors = new ReplitConnectors();

// 1. Verificar se já existe arquivo com mesmo nome na pasta (para substituir)
console.log("→ Listando pasta Drive...");
const listRes = await connectors.proxy(
  "google-drive",
  `/drive/v3/files?q=name='${FILE_NAME}'+and+'${FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name)`,
  { method: "GET" }
);
const listJson = await listRes.json();
const existing = listJson.files ?? [];
console.log(`  Arquivos com mesmo nome: ${existing.length}`);

// 2. Deletar versões anteriores
for (const f of existing) {
  console.log(`  Deletando versão anterior: ${f.id}`);
  await connectors.proxy("google-drive", `/drive/v3/files/${f.id}`, { method: "DELETE" });
}

// 3. Upload multipart
console.log("→ Fazendo upload...");
const fileBuffer = fs.readFileSync(FILE_PATH);
const metadata = JSON.stringify({ name: FILE_NAME, parents: [FOLDER_ID] });

// Montar body multipart manualmente
const boundary = "--------ReplotUpload1234";
const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
  Buffer.from(metadata),
  Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${MIME}\r\n\r\n`),
  fileBuffer,
  Buffer.from(`\r\n--${boundary}--`),
]);

const uploadRes = await connectors.proxy(
  "google-drive",
  "/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink",
  {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: body.toString("binary"),
  }
);
const uploadJson = await uploadRes.json();

if (uploadJson.id) {
  console.log("✓ Upload OK");
  console.log(`  ID: ${uploadJson.id}`);
  console.log(`  Nome: ${uploadJson.name}`);
  console.log(`  Tamanho: ${uploadJson.size} bytes`);
  console.log(`  Link: ${uploadJson.webViewLink}`);
} else {
  console.error("✗ Falha no upload:");
  console.error(JSON.stringify(uploadJson, null, 2));
  process.exit(1);
}
