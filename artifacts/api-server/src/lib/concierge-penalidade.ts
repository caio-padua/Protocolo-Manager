// Motor de PENALIDADE do Concierge (Dr. Caio) — proteção contra abuso de escassez.
//
// Regra do CEO (12/08/2026):
//   0 falhas → sem penalidade — oferta normal (janela mais próxima)
//   1 falha  → datas mínimas +7 dias
//   2 falhas → datas mínimas +30 dias
//   ≥3 falhas → bloqueado_permanente → via normal (sem concierge)
//
// "Falha" = cobrança concierge gerada no Asaas mas NÃO paga:
//   status virou "expirado" (PAYMENT_OVERDUE) ou "cancelado" (PAYMENT_DELETED/REFUNDED).
//
// CPF com menos de 11 dígitos é ignorado (cliente sem CPF nunca é penalizado).
// Tabela criada lazy (CREATE IF NOT EXISTS) na primeira chamada por processo.

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// ─── Mapa de estado → penalidade ─────────────────────────────────────────────
// Dias adicionados ao floorISO (data mínima da oferta) por número de falhas.
const PENALIDADE_POR_FALHAS: Record<number, number> = {
  0: 0,
  1: 7,
  2: 30,
};
const LIMITE_BLOQUEIO = 3; // a partir da 3ª falha → bloqueio permanente

export interface Penalidade {
  bloqueado: boolean;      // true = só via normal (sem concierge)
  penalidade_dias: number; // dias adicionados ao piso da oferta
  tentativas: number;      // total de falhas registradas
}

// ─── Bootstrap das tabelas (lazy, singleton por processo) ────────────────────
let _tableReady: Promise<void> | null = null;
let _auditTableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (!_tableReady) {
    _tableReady = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS concierge_penalidades (
          cpf                  TEXT        NOT NULL PRIMARY KEY,
          tentativas_falha     INTEGER     NOT NULL DEFAULT 0,
          bloqueado_permanente BOOLEAN     NOT NULL DEFAULT FALSE,
          ultima_falha_at      TIMESTAMPTZ,
          criado_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          atualizado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((err: unknown) => {
        _tableReady = null;
        throw err;
      });
  }
  return _tableReady;
}

async function ensureAuditTable(): Promise<void> {
  if (!_auditTableReady) {
    _auditTableReady = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS concierge_penalidades_auditoria (
          id                   SERIAL      PRIMARY KEY,
          cpf                  TEXT        NOT NULL,
          resetado_por         TEXT        NOT NULL DEFAULT 'CEO',
          resetado_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          tentativas_anteriores INTEGER    NOT NULL DEFAULT 0
        )
      `)
      .then(() => undefined)
      .catch((err: unknown) => {
        _auditTableReady = null;
        throw err;
      });
  }
  return _auditTableReady;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normCpf(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

type PenalidadeRawRow = { tentativas_falha: string | number; bloqueado_permanente: boolean };

function derivar(t: number, permanente: boolean): Penalidade {
  if (permanente || t >= LIMITE_BLOQUEIO) {
    return { bloqueado: true, penalidade_dias: 0, tentativas: t };
  }
  return {
    bloqueado: false,
    penalidade_dias: PENALIDADE_POR_FALHAS[t] ?? 30,
    tentativas: t,
  };
}

// ─── API pública ─────────────────────────────────────────────────────────────

/** Busca a penalidade atual de um CPF. Sem CPF → penalidade zero (fail-open). */
export async function getPenalidade(rawCpf: string | null | undefined): Promise<Penalidade> {
  const cpf = normCpf(rawCpf);
  if (cpf.length < 11) return { bloqueado: false, penalidade_dias: 0, tentativas: 0 };

  await ensureTable();

  const result = await db.execute(
    sql`SELECT tentativas_falha, bloqueado_permanente
        FROM concierge_penalidades
        WHERE cpf = ${cpf}
        LIMIT 1`,
  );
  const row = result.rows[0] as PenalidadeRawRow | undefined;
  if (!row) return { bloqueado: false, penalidade_dias: 0, tentativas: 0 };

  const t = Number(row.tentativas_falha) || 0;
  return derivar(t, Boolean(row.bloqueado_permanente));
}

export interface PenalidadeRow {
  cpf_mascarado: string;
  tentativas_falha: number;
  bloqueado_permanente: boolean;
  ultima_falha_at: string | null;
  criado_at: string;
  atualizado_at: string;
}

/**
 * Lista todas as penalidades registradas (CEO). CPF retorna mascarado.
 * Filtro opcional por CPF parcial (raw, dígitos).
 */
export async function listPenalidades(filtro?: string): Promise<PenalidadeRow[]> {
  await ensureTable();

  const digitosFiltro = (filtro ?? "").replace(/\D/g, "");

  const result = await db.execute(
    digitosFiltro.length >= 3
      ? sql`
          SELECT
            CONCAT(SUBSTRING(cpf,1,3), '.***.***-', SUBSTRING(cpf,10,2)) AS cpf_mascarado,
            tentativas_falha,
            bloqueado_permanente,
            ultima_falha_at,
            criado_at,
            atualizado_at
          FROM concierge_penalidades
          WHERE cpf ILIKE ${'%' + digitosFiltro + '%'}
          ORDER BY atualizado_at DESC
          LIMIT 200
        `
      : sql`
          SELECT
            CONCAT(SUBSTRING(cpf,1,3), '.***.***-', SUBSTRING(cpf,10,2)) AS cpf_mascarado,
            tentativas_falha,
            bloqueado_permanente,
            ultima_falha_at,
            criado_at,
            atualizado_at
          FROM concierge_penalidades
          ORDER BY atualizado_at DESC
          LIMIT 200
        `,
  );

  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    cpf_mascarado: String(r.cpf_mascarado ?? ""),
    tentativas_falha: Number(r.tentativas_falha ?? 0),
    bloqueado_permanente: Boolean(r.bloqueado_permanente),
    ultima_falha_at: r.ultima_falha_at ? String(r.ultima_falha_at) : null,
    criado_at: String(r.criado_at ?? ""),
    atualizado_at: String(r.atualizado_at ?? ""),
  }));
}

export interface AuditoriaRow {
  id: number;
  cpf_mascarado: string;
  resetado_por: string;
  resetado_at: string;
  tentativas_anteriores: number;
}

/**
 * Reseta a penalidade de um CPF: zera tentativas e remove o bloqueio.
 * Registra um evento na tabela de auditoria com quem resetou e quantas
 * tentativas existiam antes do reset.
 *
 * Executa tudo dentro de uma única transação com SELECT … FOR UPDATE para
 * garantir que:
 *   1. O contador lido em tentativas_anteriores é exatamente o que foi resetado.
 *   2. Se o INSERT de auditoria falhar, o UPDATE de reset também sofre rollback.
 *   3. Resets concorrentes não produzem leituras inconsistentes.
 *
 * Retorna false se o CPF não existir (sem erro).
 */
export async function resetarPenalidade(
  rawCpf: string,
  resetadoPor = "CEO",
): Promise<boolean> {
  const cpf = normCpf(rawCpf);
  if (cpf.length < 11) return false;

  await ensureTable();
  await ensureAuditTable();

  return db.transaction(async (tx) => {
    // Bloqueia a linha para evitar race condition entre leitura e update
    const antes = await tx.execute(
      sql`SELECT tentativas_falha FROM concierge_penalidades WHERE cpf = ${cpf} LIMIT 1 FOR UPDATE`,
    );
    const antesRow = antes.rows[0] as { tentativas_falha: number | string } | undefined;
    if (!antesRow) return false; // CPF não existe — nada a resetar

    const tentativasAnteriores = Number(antesRow.tentativas_falha) || 0;

    // Reseta a penalidade
    await tx.execute(sql`
      UPDATE concierge_penalidades
      SET
        tentativas_falha     = 0,
        bloqueado_permanente = FALSE,
        ultima_falha_at      = NULL,
        atualizado_at        = NOW()
      WHERE cpf = ${cpf}
    `);

    // Insere na auditoria — se falhar, o UPDATE acima sofre rollback integral
    await tx.execute(sql`
      INSERT INTO concierge_penalidades_auditoria
        (cpf, resetado_por, resetado_at, tentativas_anteriores)
      VALUES
        (${cpf}, ${resetadoPor}, NOW(), ${tentativasAnteriores})
    `);

    return true;
  });
}

/**
 * Lista o histórico de resets de um CPF para exibição no painel CEO.
 * CPF é mascarado na saída.
 */
export async function listAuditoriaResets(rawCpf: string): Promise<AuditoriaRow[]> {
  const cpf = normCpf(rawCpf);
  if (cpf.length < 11) return [];

  await ensureAuditTable();

  const result = await db.execute(sql`
    SELECT
      id,
      CONCAT(SUBSTRING(cpf,1,3), '.***.***-', SUBSTRING(cpf,10,2)) AS cpf_mascarado,
      resetado_por,
      resetado_at,
      tentativas_anteriores
    FROM concierge_penalidades_auditoria
    WHERE cpf = ${cpf}
    ORDER BY resetado_at DESC
    LIMIT 50
  `);

  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    cpf_mascarado: String(r.cpf_mascarado ?? ""),
    resetado_por: String(r.resetado_por ?? "CEO"),
    resetado_at: String(r.resetado_at ?? ""),
    tentativas_anteriores: Number(r.tentativas_anteriores ?? 0),
  }));
}

/**
 * Registra UMA falha para o CPF (cobrança concierge gerada e não paga).
 * Idempotente do ponto de vista da tabela — incrementa sempre que chamado.
 * O chamador é responsável por chamar apenas uma vez por evento de falha real.
 */
export async function registrarFalha(rawCpf: string | null | undefined): Promise<void> {
  const cpf = normCpf(rawCpf);
  if (cpf.length < 11) return; // CPF ausente/inválido: não penaliza

  await ensureTable();

  await db.execute(sql`
    INSERT INTO concierge_penalidades
      (cpf, tentativas_falha, bloqueado_permanente, ultima_falha_at, atualizado_at)
    VALUES
      (${cpf}, 1, FALSE, NOW(), NOW())
    ON CONFLICT (cpf) DO UPDATE
    SET
      tentativas_falha     = concierge_penalidades.tentativas_falha + 1,
      bloqueado_permanente = CASE
                               WHEN concierge_penalidades.tentativas_falha + 1 >= ${LIMITE_BLOQUEIO}
                               THEN TRUE ELSE FALSE
                             END,
      ultima_falha_at      = NOW(),
      atualizado_at        = NOW()
  `);
}
