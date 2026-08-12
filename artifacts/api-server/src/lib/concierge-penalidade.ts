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

// ─── Bootstrap da tabela (lazy, singleton por processo) ──────────────────────
let _tableReady: Promise<void> | null = null;

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
        // Reseta o singleton para tentar de novo na próxima chamada.
        _tableReady = null;
        throw err;
      });
  }
  return _tableReady;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normCpf(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

type PenalidadeRow = { tentativas_falha: string | number; bloqueado_permanente: boolean };

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
  const row = result.rows[0] as PenalidadeRow | undefined;
  if (!row) return { bloqueado: false, penalidade_dias: 0, tentativas: 0 };

  const t = Number(row.tentativas_falha) || 0;
  return derivar(t, Boolean(row.bloqueado_permanente));
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
