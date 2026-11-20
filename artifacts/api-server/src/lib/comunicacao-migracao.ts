/**
 * Migracao de boot da comunicacao unificada. Idempotente e NAO destrutiva.
 * - whatsapp_mensagens_log.direcao: linhas antigas sao todas ENVIOS (o log so gravava envios),
 *   por isso o padrao 'saida' e verdadeiro; mensagens recebidas passam a gravar 'entrada'.
 * - Backups de mensagens e historico de downloads (por clinica).
 */
import { pool } from "@workspace/db";
import { criarTabelasCategorias } from "./comunicacao-categorias";

export async function garantirTabelasComunicacao(): Promise<void> {
  await pool.query(`ALTER TABLE whatsapp_mensagens_log ADD COLUMN IF NOT EXISTS direcao TEXT NOT NULL DEFAULT 'saida'`);
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_log_direcao_check') THEN
      ALTER TABLE whatsapp_mensagens_log ADD CONSTRAINT whatsapp_log_direcao_check CHECK (direcao IN ('entrada','saida'));
    END IF; END $$`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_log_empresa_criado ON whatsapp_mensagens_log (empresa_id, criado_em DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_log_cliente ON whatsapp_mensagens_log (cliente_id)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS comunicacao_backups (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    lote TEXT NOT NULL,
    canal TEXT NOT NULL CHECK (canal IN ('TG','WWP')),
    escopo TEXT NOT NULL CHECK (escopo IN ('geral','cliente')),
    cliente_id INTEGER,
    periodo_inicio TIMESTAMPTZ,
    periodo_fim TIMESTAMPTZ,
    formato TEXT NOT NULL CHECK (formato IN ('pdf','xlsx','json')),
    nome_arquivo TEXT NOT NULL,
    mime TEXT NOT NULL,
    tamanho_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    total_mensagens INTEGER NOT NULL,
    conteudo BYTEA NOT NULL,
    gerado_por INTEGER,
    gerado_por_nome TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_comunicacao_backups_empresa ON comunicacao_backups (empresa_id, criado_em DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS comunicacao_backup_downloads (
    id SERIAL PRIMARY KEY,
    backup_id INTEGER NOT NULL REFERENCES comunicacao_backups(id),
    empresa_id INTEGER NOT NULL,
    baixado_por INTEGER,
    baixado_por_nome TEXT,
    baixado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_comunicacao_downloads_empresa ON comunicacao_backup_downloads (empresa_id, baixado_em DESC)`);
  await criarTabelasCategorias(pool);
}
