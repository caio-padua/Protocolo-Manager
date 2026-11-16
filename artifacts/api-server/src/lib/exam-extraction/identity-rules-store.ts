/**
 * Regras de identidade por clínica: leitura da versão vigente e gravação de nova versão.
 * Versões são append-only (a tabela recusa UPDATE e DELETE). Sem versão gravada = padrão global (versão 0).
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { DEFAULT_RULES, STRICTEST_RULES, normalizeRuleConfig, type IdentityRules } from "./identity-rules.js";

export interface ActiveRules {
  version: number;
  rules: IdentityRules;
  /** true = a configuração gravada não pôde ser lida; vale o modo mais rígido (nunca o mais frouxo). */
  degraded: boolean;
}

type Rows = { rows: Array<Record<string, any>> };

export async function getActiveRules(empresaId: number | null): Promise<ActiveRules> {
  if (empresaId == null) return { version: 0, rules: DEFAULT_RULES, degraded: false };
  const result = (await db.execute(sql`
    SELECT version, config FROM exam_identity_rule_sets
    WHERE empresa_id = ${empresaId} ORDER BY version DESC LIMIT 1
  `)) as unknown as Rows;
  const row = result.rows[0];
  if (!row) return { version: 0, rules: DEFAULT_RULES, degraded: false };
  const parsed = normalizeRuleConfig(row.config);
  if (!parsed.ok) return { version: Number(row.version), rules: STRICTEST_RULES, degraded: true };
  return { version: Number(row.version), rules: parsed.config, degraded: false };
}

export interface RuleVersionRow {
  version: number;
  config: unknown;
  note: string;
  createdBy: number | null;
  createdAt: string;
}

export async function listRuleVersions(empresaId: number): Promise<RuleVersionRow[]> {
  const result = (await db.execute(sql`
    SELECT version, config, note, created_by, created_at FROM exam_identity_rule_sets
    WHERE empresa_id = ${empresaId} ORDER BY version DESC
  `)) as unknown as Rows;
  return result.rows.map((r) => ({
    version: Number(r.version),
    config: r.config,
    note: String(r.note),
    createdBy: r.created_by == null ? null : Number(r.created_by),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Grava a configuração (já validada) como a próxima versão. Concorrência: o índice único recusa versão repetida; tenta de novo. */
export async function saveRuleVersion(input: {
  empresaId: number;
  config: IdentityRules;
  createdBy: number;
  note: string;
}): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = (await db.execute(sql`
        INSERT INTO exam_identity_rule_sets (empresa_id, version, config, created_by, note)
        SELECT ${input.empresaId}, COALESCE(MAX(version), 0) + 1, ${JSON.stringify(input.config)}::jsonb, ${input.createdBy}, ${input.note}
        FROM exam_identity_rule_sets WHERE empresa_id = ${input.empresaId}
        RETURNING version
      `)) as unknown as Rows;
      return Number(result.rows[0].version);
    } catch (error) {
      const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as any).cause?.code;
      if (code !== "23505" || attempt === 2) throw error;
    }
  }
  throw new Error("Não foi possível gravar a versão das regras.");
}

/** Apelidos vigentes (não revogados) do cliente, dentro da clínica. */
export async function loadKnownAliases(empresaId: number, clientId: number): Promise<string[]> {
  const result = (await db.execute(sql`
    SELECT alias_normalized FROM exam_identity_aliases
    WHERE empresa_id = ${empresaId} AND client_id = ${clientId} AND revoked_at IS NULL
  `)) as unknown as Rows;
  return result.rows.map((r) => String(r.alias_normalized));
}

export async function recordAlias(input: {
  empresaId: number;
  clientId: number;
  alias: string;
  kinds: string[];
  documentId: number;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO exam_identity_aliases (empresa_id, client_id, alias_normalized, kinds, first_document_id)
    VALUES (${input.empresaId}, ${input.clientId}, ${input.alias}, ${JSON.stringify(input.kinds)}::jsonb, ${input.documentId})
    ON CONFLICT (client_id, alias_normalized) DO NOTHING
  `);
}

/** Revoga (sem apagar) os apelidos criados a partir de um documento cujo vínculo foi marcado como incorreto. */
export async function revokeAliasesOfDocument(empresaId: number, documentId: number): Promise<void> {
  await db.execute(sql`
    UPDATE exam_identity_aliases SET revoked_at = now()
    WHERE empresa_id = ${empresaId} AND first_document_id = ${documentId} AND revoked_at IS NULL
  `);
}
