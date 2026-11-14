import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Meus Boloes (Area do Cliente): base minima, somente leitura para o cliente.
 * NAO vende, NAO cobra, NAO gera bilhete: so guarda o que a clinica registrou e o recibo REAL da CAIXA
 * ja recebido e validado pelo titular da plataforma. Criacao aditiva e idempotente (Regra de Ouro).
 */

export const BOLOES_COMPROVANTE_MAX_BYTES = 10 * 1024 * 1024;
export const BOLOES_AVISO =
  "Esta lista mostra apenas participações registradas pela clínica. O comprovante oficial é o recibo da CAIXA, arquivo real já recebido e validado.";

export async function ensureBoloesTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS boloes_campanhas (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      concurso TEXT,
      data_sorteio DATE,
      criado_por INTEGER,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT boloes_campanhas_nome_ck CHECK (length(btrim(nome)) BETWEEN 1 AND 120)
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS boloes_participacoes (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      campanha_id INTEGER NOT NULL REFERENCES boloes_campanhas(id),
      client_id INTEGER NOT NULL REFERENCES clients(id),
      cotas INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente_registro',
      registrada_em TIMESTAMPTZ,
      criado_por INTEGER,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT boloes_participacoes_cotas_ck CHECK (cotas BETWEEN 1 AND 1000),
      CONSTRAINT boloes_participacoes_status_ck CHECK (status IN ('pendente_registro','registrada','cancelada')),
      CONSTRAINT boloes_participacoes_unica UNIQUE (campanha_id, client_id)
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_boloes_part_cliente ON boloes_participacoes (client_id, empresa_id)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS boloes_comprovantes (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      participacao_id INTEGER NOT NULL REFERENCES boloes_participacoes(id),
      storage_key TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      validado_por INTEGER NOT NULL,
      validado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revogado_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT boloes_comprovantes_mime_ck CHECK (mime IN ('application/pdf','image/png','image/jpeg')),
      CONSTRAINT boloes_comprovantes_bytes_ck CHECK (bytes > 0)
    )`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_boloes_comprovante_ativo
      ON boloes_comprovantes (participacao_id) WHERE revogado_em IS NULL`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS boloes_auditoria (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER,
      client_id INTEGER,
      ator TEXT NOT NULL,
      acao TEXT NOT NULL,
      participacao_id INTEGER,
      comprovante_id INTEGER,
      resultado TEXT NOT NULL,
      detalhe TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_boloes_aud_cliente ON boloes_auditoria (client_id, criado_em)`);
  logger.info("boloes: tabelas prontas");
}

export interface AuditoriaBolao {
  empresaId?: number | null;
  clientId?: number | null;
  ator: string;
  acao: string;
  participacaoId?: number | null;
  comprovanteId?: number | null;
  resultado: "ok" | "negado" | "erro";
  detalhe?: string;
}

export async function auditarBolao(a: AuditoriaBolao, tx: Pick<typeof db, "execute"> = db): Promise<void> {
  await tx.execute(sql`
    INSERT INTO boloes_auditoria (empresa_id, client_id, ator, acao, participacao_id, comprovante_id, resultado, detalhe)
    VALUES (${a.empresaId ?? null}, ${a.clientId ?? null}, ${a.ator}, ${a.acao}, ${a.participacaoId ?? null},
            ${a.comprovanteId ?? null}, ${a.resultado}, ${a.detalhe ? a.detalhe.slice(0, 300) : null})`);
}

export type TipoComprovante = { mime: "application/pdf" | "image/png" | "image/jpeg"; ext: "pdf" | "png" | "jpg" };

/** Tipo conferido pelos BYTES (o tipo declarado pelo navegador nao vale). */
export function detectarTipoComprovante(buf: Buffer): TipoComprovante | null {
  if (buf.length < 8) return null;
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

export const sha256Hex = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export type StatusExibicao = "pendente_registro" | "registrada" | "cancelada";

export interface ParticipacaoCliente {
  id: number;
  campanha: { nome: string; concurso: string | null; dataSorteio: string | null };
  cotas: number;
  status: StatusExibicao;
  registradaEm: string | null;
  comprovante: { id: number; tipo: "pdf" | "imagem"; bytes: number; validadoEm: string } | null;
}

/**
 * Participacoes do cliente na clinica ATUAL dele. O status "registrada" so e devolvido quando ha comprovante
 * ativo: o texto da coluna sozinho nunca afirma registro.
 */
export async function listarParticipacoesDoCliente(clientId: number): Promise<ParticipacaoCliente[]> {
  const rows = (await db.execute(sql`
    SELECT p.id, p.cotas, p.status, p.registrada_em,
           ca.nome AS campanha_nome, ca.concurso, to_char(ca.data_sorteio, 'YYYY-MM-DD') AS data_sorteio,
           co.id AS comp_id, co.mime AS comp_mime, co.bytes AS comp_bytes, co.validado_em AS comp_validado_em
      FROM clients c
      JOIN boloes_participacoes p ON p.client_id = c.id AND p.empresa_id = c.empresa_id
      JOIN boloes_campanhas ca ON ca.id = p.campanha_id AND ca.empresa_id = p.empresa_id
 LEFT JOIN boloes_comprovantes co ON co.participacao_id = p.id AND co.empresa_id = p.empresa_id AND co.revogado_em IS NULL
     WHERE c.id = ${clientId} AND c.deleted_at IS NULL
     ORDER BY p.criado_em DESC, p.id DESC LIMIT 100`)).rows as any[];
  return rows.map((r) => {
    const temComp = r.comp_id != null;
    const status: StatusExibicao = r.status === "cancelada" ? "cancelada" : r.status === "registrada" && temComp ? "registrada" : "pendente_registro";
    return {
      id: r.id,
      campanha: { nome: r.campanha_nome, concurso: r.concurso ?? null, dataSorteio: r.data_sorteio ?? null },
      cotas: r.cotas,
      status,
      registradaEm: status === "registrada" && r.registrada_em ? new Date(r.registrada_em).toISOString() : null,
      comprovante: temComp && r.status !== "cancelada"
        ? { id: r.comp_id, tipo: r.comp_mime === "application/pdf" ? "pdf" : "imagem", bytes: r.comp_bytes, validadoEm: new Date(r.comp_validado_em).toISOString() }
        : null,
    };
  });
}

export interface ComprovanteAutorizado {
  id: number; empresaId: number; participacaoId: number; storageKey: string; mime: string; bytes: number; sha256: string;
}

/** Posse conferida no SQL: cliente do token + clinica atual do cliente + participacao nao cancelada. */
export async function comprovanteDoCliente(clientId: number, comprovanteId: number): Promise<ComprovanteAutorizado | null> {
  const r: any = (await db.execute(sql`
    SELECT co.id, co.empresa_id, co.participacao_id, co.storage_key, co.mime, co.bytes, co.sha256
      FROM clients c
      JOIN boloes_participacoes p ON p.client_id = c.id AND p.empresa_id = c.empresa_id AND p.status <> 'cancelada'
      JOIN boloes_comprovantes co ON co.participacao_id = p.id AND co.empresa_id = p.empresa_id AND co.revogado_em IS NULL
     WHERE c.id = ${clientId} AND c.deleted_at IS NULL AND co.id = ${comprovanteId}`)).rows[0];
  if (!r) return null;
  return { id: r.id, empresaId: r.empresa_id, participacaoId: r.participacao_id, storageKey: r.storage_key, mime: r.mime, bytes: r.bytes, sha256: r.sha256 };
}
