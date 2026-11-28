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

  // ---- Automacao de recebimento (aditivo; nada existente e apagado) ----
  // Pagamento e informado pela clinica: este sistema NAO cobra e NAO usa Asaas.
  await db.execute(sql`ALTER TABLE boloes_participacoes ADD COLUMN IF NOT EXISTS pagamento_status TEXT NOT NULL DEFAULT 'nao_informado'`);
  await db.execute(sql`ALTER TABLE boloes_participacoes ADD COLUMN IF NOT EXISTS pagamento_atualizado_em TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE boloes_participacoes ADD COLUMN IF NOT EXISTS pagamento_atualizado_por INTEGER`);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boloes_participacoes_pagamento_ck') THEN
        ALTER TABLE boloes_participacoes ADD CONSTRAINT boloes_participacoes_pagamento_ck
          CHECK (pagamento_status IN ('nao_informado','pendente','confirmado'));
      END IF;
    END $$`);
  // Aprovacao pelo robo nao tem profissional: o ator passa a ser texto.
  await db.execute(sql`ALTER TABLE boloes_comprovantes ALTER COLUMN validado_por DROP NOT NULL`);
  await db.execute(sql`ALTER TABLE boloes_comprovantes ADD COLUMN IF NOT EXISTS validado_ator TEXT`);
  await db.execute(sql`ALTER TABLE boloes_comprovantes ADD COLUMN IF NOT EXISTS recebimento_id INTEGER`);
  // O mesmo arquivo nao vale para duas participacoes.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_boloes_comprovante_sha_ativo
      ON boloes_comprovantes (empresa_id, sha256) WHERE revogado_em IS NULL`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS boloes_recebimentos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      origem TEXT NOT NULL,
      drive_file_id TEXT,
      nome_original TEXT,
      storage_key TEXT,
      mime TEXT,
      bytes INTEGER,
      sha256 TEXT,
      status TEXT NOT NULL DEFAULT 'recebido',
      extraido JSONB,
      motivos JSONB NOT NULL DEFAULT '[]'::jsonb,
      codigo_recibo TEXT,
      participacao_sugerida_id INTEGER,
      comprovante_id INTEGER,
      duplicado_de INTEGER,
      decidido_por TEXT,
      decidido_em TIMESTAMPTZ,
      motivo_rejeicao TEXT,
      tentativas INTEGER NOT NULL DEFAULT 0,
      criado_por INTEGER,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT boloes_recebimentos_origem_ck CHECK (origem IN ('manual','drive')),
      CONSTRAINT boloes_recebimentos_status_ck CHECK (status IN ('recebido','lendo','em_revisao','aprovado','rejeitado','duplicado'))
    )`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_boloes_receb_sha_vivo
      ON boloes_recebimentos (empresa_id, sha256) WHERE status IN ('recebido','lendo','em_revisao','aprovado')`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_boloes_receb_drive
      ON boloes_recebimentos (empresa_id, drive_file_id) WHERE drive_file_id IS NOT NULL`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_boloes_receb_status ON boloes_recebimentos (empresa_id, status, criado_em)`);
  await ensureGrupoVipTables();
  logger.info("boloes: tabelas prontas");
}

/**
 * Grupo VIP e regras do bolao (aditivo, idempotente; nada existente e alterado ou apagado).
 * O Grupo VIP e independente da categoria comercial (Prata, Ouro, Platinum, Diamond): nenhuma tabela aqui
 * le ou grava categoria. Campanha antiga nasce como rascunho: nada vira "aberto" sem decisao da clinica.
 */
async function ensureGrupoVipTables(): Promise<void> {
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aberto','encerrado'))`);
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS valor_cota_centavos INTEGER CHECK (valor_cota_centavos IS NULL OR valor_cota_centavos >= 0)`);
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS cotas_total INTEGER CHECK (cotas_total IS NULL OR cotas_total BETWEEN 1 AND 100000)`);
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS escolha_jogos TEXT NOT NULL DEFAULT 'clinica' CHECK (escolha_jogos IN ('clinica','participante'))`);
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS modalidade TEXT CHECK (modalidade IS NULL OR length(modalidade) <= 60)`);
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS dezenas_por_jogo INTEGER CHECK (dezenas_por_jogo IS NULL OR dezenas_por_jogo BETWEEN 1 AND 30)`);
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS universo_max INTEGER NOT NULL DEFAULT 60 CHECK (universo_max BETWEEN 2 AND 100)`);
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS jogos_por_cota INTEGER NOT NULL DEFAULT 1 CHECK (jogos_por_cota BETWEEN 1 AND 20)`);
  await db.execute(sql`ALTER TABLE boloes_campanhas ADD COLUMN IF NOT EXISTS regras_texto TEXT CHECK (regras_texto IS NULL OR length(regras_texto) <= 2000)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS grupo_vip_membros (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      status TEXT NOT NULL DEFAULT 'convidado' CHECK (status IN ('convidado','ativo','recusou','saiu')),
      convidado_por INTEGER,
      convidado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      respondido_em TIMESTAMPTZ,
      CONSTRAINT grupo_vip_membros_unico UNIQUE (empresa_id, client_id)
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS boloes_convites (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      campanha_id INTEGER NOT NULL REFERENCES boloes_campanhas(id),
      client_id INTEGER NOT NULL REFERENCES clients(id),
      status TEXT NOT NULL DEFAULT 'convidado' CHECK (status IN ('convidado','aceito','recusado')),
      convidado_por INTEGER,
      convidado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      respondido_em TIMESTAMPTZ,
      CONSTRAINT boloes_convites_unico UNIQUE (campanha_id, client_id)
    )`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS boloes_jogos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      participacao_id INTEGER NOT NULL REFERENCES boloes_participacoes(id),
      ordem INTEGER NOT NULL CHECK (ordem >= 1),
      dezenas INTEGER[] NOT NULL,
      origem TEXT NOT NULL CHECK (origem IN ('participante','clinica')),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT boloes_jogos_ordem_unica UNIQUE (participacao_id, ordem)
    )`);
  await db.execute(sql`ALTER TABLE boloes_participacoes ADD COLUMN IF NOT EXISTS asaas_charge_id TEXT`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_boloes_part_cobranca ON boloes_participacoes (empresa_id, asaas_charge_id) WHERE asaas_charge_id IS NOT NULL`);
  await db.execute(sql`ALTER TABLE boloes_comprovantes ADD COLUMN IF NOT EXISTS natureza TEXT CHECK (natureza IS NULL OR natureza IN ('nominativo','cota_oficial_individual'))`);
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
  comprovante: { id: number; tipo: "pdf" | "imagem"; bytes: number; validadoEm: string; integridadeCodigo: string } | null;
  /** Informado pela clinica; este sistema nao cobra. */
  pagamento: "nao_informado" | "pendente" | "confirmado";
  /** Derivado: so existe "disponivel" com comprovante ativo; "baixado" quando o proprio cliente ja baixou. */
  entrega: "indisponivel" | "disponivel" | "baixado";
  baixadoEm: string | null;
}

/**
 * Participacoes do cliente na clinica ATUAL dele. O status "registrada" so e devolvido quando ha comprovante
 * ativo: o texto da coluna sozinho nunca afirma registro.
 */
export async function listarParticipacoesDoCliente(clientId: number): Promise<ParticipacaoCliente[]> {
  const rows = (await db.execute(sql`
    SELECT p.id, p.cotas, p.status, p.registrada_em, p.pagamento_status,
           ca.nome AS campanha_nome, ca.concurso, to_char(ca.data_sorteio, 'YYYY-MM-DD') AS data_sorteio,
           co.id AS comp_id, co.mime AS comp_mime, co.bytes AS comp_bytes, co.validado_em AS comp_validado_em, left(co.sha256, 12) AS comp_integridade,
           (SELECT MAX(a.criado_em) FROM boloes_auditoria a WHERE a.comprovante_id = co.id AND a.client_id = c.id AND a.acao = 'download' AND a.resultado = 'ok') AS baixado_em
      FROM clients c
      JOIN boloes_participacoes p ON p.client_id = c.id AND p.empresa_id = c.empresa_id
      JOIN boloes_campanhas ca ON ca.id = p.campanha_id AND ca.empresa_id = p.empresa_id
 LEFT JOIN boloes_comprovantes co ON co.participacao_id = p.id AND co.empresa_id = p.empresa_id AND co.revogado_em IS NULL
     WHERE c.id = ${clientId} AND c.deleted_at IS NULL
     ORDER BY p.criado_em DESC, p.id DESC LIMIT 100`)).rows as any[];
  return rows.map((r) => {
    const temComp = r.comp_id != null;
    const status: StatusExibicao = r.status === "cancelada" ? "cancelada" : r.status === "registrada" && temComp ? "registrada" : "pendente_registro";
    const comprovanteVisivel = temComp && r.status !== "cancelada";
    return {
      id: r.id,
      pagamento: (r.pagamento_status ?? "nao_informado") as ParticipacaoCliente["pagamento"],
      entrega: !comprovanteVisivel ? "indisponivel" : r.baixado_em ? "baixado" : "disponivel",
      baixadoEm: comprovanteVisivel && r.baixado_em ? new Date(r.baixado_em).toISOString() : null,
      campanha: { nome: r.campanha_nome, concurso: r.concurso ?? null, dataSorteio: r.data_sorteio ?? null },
      cotas: r.cotas,
      status,
      registradaEm: status === "registrada" && r.registrada_em ? new Date(r.registrada_em).toISOString() : null,
      comprovante: temComp && r.status !== "cancelada"
        ? { id: r.comp_id, tipo: r.comp_mime === "application/pdf" ? "pdf" : "imagem", bytes: r.comp_bytes, validadoEm: new Date(r.comp_validado_em).toISOString(), integridadeCodigo: String(r.comp_integridade ?? "") }
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
