import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

/**
 * Histórico dos catálogos (arquivos originais) enviados por fornecedor.
 * Regra de Ouro: nada é apagado; reenviar o mesmo arquivo (mesmo conteúdo) não duplica.
 */
export async function ensureFornecedorCatalogosSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fornecedor_catalogos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      fornecedor_id INTEGER NOT NULL,
      nome_arquivo TEXT NOT NULL,
      mime TEXT NOT NULL,
      tamanho_bytes BIGINT NOT NULL,
      sha256 TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      origem TEXT NOT NULL DEFAULT 'upload',
      referencia TEXT,
      enviado_por INTEGER,
      enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fornecedor_catalogos_origem_ck CHECK (origem IN ('upload','localizado'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fornecedor_catalogos_conteudo_uq ON fornecedor_catalogos (empresa_id, fornecedor_id, sha256);
    CREATE INDEX IF NOT EXISTS fornecedor_catalogos_forn_idx ON fornecedor_catalogos (empresa_id, fornecedor_id, enviado_em DESC);
  `);
}

export class ErroCatalogo extends Error { constructor(public status: number, msg: string) { super(msg); } }

export type CatalogoRegistro = {
  id: number; fornecedorId: number; nomeArquivo: string; mime: string; tamanhoBytes: number;
  origem: "upload" | "localizado"; referencia: string | null; enviadoEm: string; enviadoPor: string | null;
};

const storage = new ObjectStorageService();
const MIMES: Record<string, string> = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

export function mimeDoNome(nome: string): string | null {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  return MIMES[ext] ?? null;
}

async function exigirFornecedor(db: Pool, empresaId: number, fornecedorId: number): Promise<void> {
  const r = await db.query("SELECT 1 FROM fornecedores_cadastrados WHERE id=$1 AND empresa_id=$2", [fornecedorId, empresaId]);
  if (!r.rowCount) throw new ErroCatalogo(404, "Fornecedor não encontrado nesta clínica.");
}

const SELECT = `SELECT c.id, c.fornecedor_id AS "fornecedorId", c.nome_arquivo AS "nomeArquivo", c.mime, c.tamanho_bytes::float8 AS "tamanhoBytes",
  c.origem, c.referencia, c.enviado_em AS "enviadoEm", p.name AS "enviadoPor"
  FROM fornecedor_catalogos c LEFT JOIN professionals p ON p.id=c.enviado_por`;

export async function listarCatalogos(db: Pool, empresaId: number, fornecedorId: number): Promise<CatalogoRegistro[]> {
  await exigirFornecedor(db, empresaId, fornecedorId);
  const r = await db.query(`${SELECT} WHERE c.empresa_id=$1 AND c.fornecedor_id=$2 ORDER BY c.enviado_em DESC, c.id DESC`, [empresaId, fornecedorId]);
  return r.rows.map((x) => ({ ...x, enviadoEm: new Date(x.enviadoEm).toISOString() }));
}

export async function guardarCatalogo(db: Pool, a: {
  empresaId: number; fornecedorId: number; nomeArquivo: string; buffer: Buffer; profissionalId: number | null;
  origem: "upload" | "localizado"; referencia?: string | null;
}): Promise<{ registro: CatalogoRegistro; jaExistia: boolean }> {
  await exigirFornecedor(db, a.empresaId, a.fornecedorId);
  const nome = a.nomeArquivo.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200);
  const mime = mimeDoNome(nome);
  if (!nome || !mime) throw new ErroCatalogo(400, "Formato não aceito. Envie PDF, planilha (.xlsx, .xls, .csv) ou imagem.");
  if (a.buffer.length === 0) throw new ErroCatalogo(400, "O arquivo está vazio.");
  const sha = createHash("sha256").update(a.buffer).digest("hex");
  const ja = await db.query(`${SELECT} WHERE c.empresa_id=$1 AND c.fornecedor_id=$2 AND c.sha256=$3`, [a.empresaId, a.fornecedorId, sha]);
  if (ja.rowCount) return { registro: { ...ja.rows[0], enviadoEm: new Date(ja.rows[0].enviadoEm).toISOString() }, jaExistia: true };
  const chave = `fornecedor-catalogos/${a.empresaId}/${a.fornecedorId}/${sha.slice(0, 16)}-${nome.replace(/[^A-Za-z0-9._-]/g, "_")}`;
  await storage.savePrivateObject(chave, a.buffer, mime);
  const ins = await db.query(
    `INSERT INTO fornecedor_catalogos (empresa_id, fornecedor_id, nome_arquivo, mime, tamanho_bytes, sha256, storage_key, origem, referencia, enviado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (empresa_id, fornecedor_id, sha256) DO NOTHING RETURNING id`,
    [a.empresaId, a.fornecedorId, nome, mime, a.buffer.length, sha, chave, a.origem, a.referencia?.trim().slice(0, 200) || null, a.profissionalId]);
  const id = ins.rows[0]?.id;
  const r = await db.query(`${SELECT} WHERE c.empresa_id=$1 AND c.fornecedor_id=$2 AND c.sha256=$3`, [a.empresaId, a.fornecedorId, sha]);
  return { registro: { ...r.rows[0], enviadoEm: new Date(r.rows[0].enviadoEm).toISOString() }, jaExistia: !id };
}

export async function lerCatalogo(db: Pool, empresaId: number, id: number): Promise<{ nome: string; mime: string; buffer: Buffer }> {
  const r = await db.query("SELECT nome_arquivo, mime, storage_key FROM fornecedor_catalogos WHERE id=$1 AND empresa_id=$2", [id, empresaId]);
  if (!r.rowCount) throw new ErroCatalogo(404, "Arquivo não encontrado.");
  try {
    return { nome: r.rows[0].nome_arquivo, mime: r.rows[0].mime, buffer: await storage.readPrivateObject(r.rows[0].storage_key) };
  } catch {
    throw new ErroCatalogo(502, "O arquivo está registrado, mas não foi possível lê-lo do armazenamento agora.");
  }
}
