/**
 * ANEXOS DE MENSAGEM — biblioteca de arquivos por clinica + interruptor por arquivo e por mensagem.
 * Um arquivo da biblioteca pode ser ligado a varias mensagens; cada ligacao tem o seu proprio interruptor.
 * So seguem no envio os arquivos com interruptor LIGADO, na ordem cadastrada. Sem ligacao = desligado.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendTelegramDocumentBuffer } from "./telegram.js";

export const ANEXO_MAX_BYTES = 10 * 1024 * 1024;
export const ANEXO_MAX_ARQUIVOS = 20;
/** Mensagens fora do catalogo de categorias que tambem aceitam anexo (a chave e o contrato com o envio). */
export const MENSAGENS_EXTRAS: Record<string, string> = { lembrete_paxmed: "Lembrete PAXMED (por período do dia)" };
export class ErroAnexo extends Error {}

export type ArquivoBiblioteca = { id: number; nome: string; mime: string; tamanho: number };
export type ArquivoNaMensagem = ArquivoBiblioteca & { ativo: boolean };

let pronto = false;
async function preparar(): Promise<void> {
  if (pronto) return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS comunicacao_anexo_arquivo (
    id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, nome TEXT NOT NULL, mime TEXT NOT NULL, tamanho INTEGER NOT NULL, dados BYTEA NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), criado_por INTEGER)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS comunicacao_anexo_uso (
    empresa_id INTEGER NOT NULL, mensagem TEXT NOT NULL, arquivo_id INTEGER NOT NULL REFERENCES comunicacao_anexo_arquivo(id) ON DELETE CASCADE,
    ativo BOOLEAN NOT NULL DEFAULT FALSE, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_por INTEGER,
    PRIMARY KEY (empresa_id, mensagem, arquivo_id))`);
  await db.execute(sql`DROP TABLE IF EXISTS comunicacao_anexo`); // rascunho de 2 posicoes fixas, substituido por esta biblioteca
  pronto = true;
}

/** Aceita so PDF, PNG ou JPEG, conferido pelos primeiros bytes (a extensao do nome nao vale como prova). */
export function detectarTipoAnexo(b: Buffer): { mime: string; ext: string } | null {
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

export async function listarBiblioteca(empresaId: number): Promise<ArquivoBiblioteca[]> {
  await preparar();
  return (await db.execute(sql`SELECT id, nome, mime, tamanho FROM comunicacao_anexo_arquivo WHERE empresa_id=${empresaId} ORDER BY id`)).rows as unknown as ArquivoBiblioteca[];
}
/** Todos os arquivos da biblioteca, cada um com o interruptor desta mensagem (desligado se nunca ligado). */
export async function arquivosDaMensagem(empresaId: number, mensagem: string): Promise<ArquivoNaMensagem[]> {
  await preparar();
  const r = await db.execute(sql`SELECT a.id, a.nome, a.mime, a.tamanho, COALESCE(u.ativo, FALSE) AS ativo
    FROM comunicacao_anexo_arquivo a LEFT JOIN comunicacao_anexo_uso u ON u.arquivo_id=a.id AND u.empresa_id=a.empresa_id AND u.mensagem=${mensagem}
    WHERE a.empresa_id=${empresaId} ORDER BY a.id`);
  return (r.rows as any[]).map((x) => ({ id: x.id, nome: x.nome, mime: x.mime, tamanho: x.tamanho, ativo: x.ativo === true }));
}
export async function adicionarArquivo(empresaId: number, nome: string, bytes: Buffer, por: number | null): Promise<ArquivoBiblioteca> {
  await preparar();
  if (bytes.length === 0) throw new ErroAnexo("arquivo vazio");
  if (bytes.length > ANEXO_MAX_BYTES) throw new ErroAnexo("arquivo maior que 10 MB");
  const tipo = detectarTipoAnexo(bytes);
  if (!tipo) throw new ErroAnexo("use um arquivo PDF, PNG ou JPEG");
  const n = ((await db.execute(sql`SELECT COUNT(*)::int AS n FROM comunicacao_anexo_arquivo WHERE empresa_id=${empresaId}`)).rows[0] as any).n as number;
  if (n >= ANEXO_MAX_ARQUIVOS) throw new ErroAnexo(`a biblioteca já tem ${ANEXO_MAX_ARQUIVOS} arquivos; remova algum antes`);
  const limpo = nome.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "anexo";
  const final = limpo.toLowerCase().endsWith(`.${tipo.ext}`) ? limpo : `${limpo.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${tipo.ext}`;
  const r = (await db.execute(sql`INSERT INTO comunicacao_anexo_arquivo (empresa_id, nome, mime, tamanho, dados, criado_por)
    VALUES (${empresaId}, ${final}, ${tipo.mime}, ${bytes.length}, ${bytes}, ${por}) RETURNING id`)).rows[0] as any;
  return { id: r.id, nome: final, mime: tipo.mime, tamanho: bytes.length };
}
export async function removerArquivo(empresaId: number, arquivoId: number): Promise<boolean> {
  await preparar();
  const r = await db.execute(sql`DELETE FROM comunicacao_anexo_arquivo WHERE empresa_id=${empresaId} AND id=${arquivoId}`);
  return (r.rowCount ?? 0) > 0;
}
export async function definirInterruptor(empresaId: number, mensagem: string, arquivoId: number, ativo: boolean, por: number | null): Promise<boolean> {
  await preparar();
  const ok = (await db.execute(sql`SELECT 1 FROM comunicacao_anexo_arquivo WHERE id=${arquivoId} AND empresa_id=${empresaId}`)).rows.length > 0;
  if (!ok) return false;
  await db.execute(sql`INSERT INTO comunicacao_anexo_uso (empresa_id, mensagem, arquivo_id, ativo, atualizado_por) VALUES (${empresaId}, ${mensagem}, ${arquivoId}, ${ativo}, ${por})
    ON CONFLICT (empresa_id, mensagem, arquivo_id) DO UPDATE SET ativo=EXCLUDED.ativo, atualizado_em=NOW(), atualizado_por=EXCLUDED.atualizado_por`);
  return true;
}

export interface ResultadoAnexos { enviados: number; status: string | null; erro?: string }
/** Envia (Telegram) os arquivos LIGADOS da mensagem, logo depois do texto. Nunca lanca: a falha volta no resultado. */
export async function enviarAnexosDaMensagem(chatId: string, empresaId: number, mensagem: string): Promise<ResultadoAnexos> {
  try {
    await preparar();
    const arqs = (await db.execute(sql`SELECT a.nome, a.mime, a.dados FROM comunicacao_anexo_arquivo a
      JOIN comunicacao_anexo_uso u ON u.arquivo_id=a.id AND u.empresa_id=a.empresa_id AND u.mensagem=${mensagem} AND u.ativo
      WHERE a.empresa_id=${empresaId} ORDER BY a.id`)).rows as any[];
    if (arqs.length === 0) return { enviados: 0, status: null };
    let enviados = 0;
    for (const a of arqs) {
      const f = await sendTelegramDocumentBuffer(chatId, Buffer.from(a.dados), a.nome, a.mime);
      if (f.sent && !f.mock) enviados += 1;
      else return { enviados, status: `recusado:${f.error ?? "mock"}`, erro: `anexo ${a.nome}: ${f.error ?? "sem token"}` };
    }
    return { enviados, status: "aceito" };
  } catch (e) {
    return { enviados: 0, status: "recusado:excecao", erro: `anexo: ${String((e as Error).message ?? e)}` };
  }
}
