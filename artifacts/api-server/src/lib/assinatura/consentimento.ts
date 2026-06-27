/**
 * Onda 4 — Nervo do CONSENTIMENTO (Paxter), NATIVO.
 *
 * Um consentimento está ATIVO quando existe uma solicitação CONCLUÍDA (assinada)
 * para o paciente cujo `escopo` casa com o ato pedido. O escopo amarra o
 * documento ao ato (ex.: "PROTOCOLO:123" ou um tipo "TCLE").
 *
 * A TRAVA é ADITIVA: só morde quando o toggle `travaConsentimentoAtiva` está
 * LIGADO (default OFF). Desligada, assertConsentimento nunca lança — nada quebra.
 */

import { and, desc, eq } from "drizzle-orm";
import {
  db,
  assinaturaSolicitacoesTable,
  assinaturaTogglesAdminTable,
} from "@workspace/db";

export interface ConsentimentoStatus {
  ativo: boolean;
  escopo: string | null;
  solicitacaoId?: number;
  tipoDoc?: string;
  titulo?: string | null;
  concluidoEm?: Date | null;
  travaLigada: boolean;
}

/** Verifica se há consentimento assinado (CONCLUIDO) para paciente+escopo. */
export async function consentimentoAtivo(
  pacienteId: number,
  escopo?: string | null,
): Promise<ConsentimentoStatus> {
  const tog = await db
    .select({ trava: assinaturaTogglesAdminTable.travaConsentimentoAtiva })
    .from(assinaturaTogglesAdminTable)
    .where(eq(assinaturaTogglesAdminTable.id, 1))
    .limit(1);
  const travaLigada = Boolean(tog[0]?.trava);

  const escopoLimpo = escopo?.trim() || null;
  const filtros = [
    eq(assinaturaSolicitacoesTable.pacienteId, pacienteId),
    eq(assinaturaSolicitacoesTable.status, "CONCLUIDO"),
  ];
  if (escopoLimpo) filtros.push(eq(assinaturaSolicitacoesTable.escopo, escopoLimpo));

  const rows = await db
    .select({
      id: assinaturaSolicitacoesTable.id,
      tipoDoc: assinaturaSolicitacoesTable.tipoDoc,
      titulo: assinaturaSolicitacoesTable.titulo,
      concluidoEm: assinaturaSolicitacoesTable.concluidoEm,
    })
    .from(assinaturaSolicitacoesTable)
    .where(and(...filtros))
    .orderBy(desc(assinaturaSolicitacoesTable.concluidoEm))
    .limit(1);

  const hit = rows[0];
  if (!hit) return { ativo: false, escopo: escopoLimpo, travaLigada };
  return {
    ativo: true,
    escopo: escopoLimpo,
    solicitacaoId: hit.id,
    tipoDoc: hit.tipoDoc,
    titulo: hit.titulo,
    concluidoEm: hit.concluidoEm,
    travaLigada,
  };
}

/** Erro semântico para a trava (a rota traduz para HTTP 409). */
export class ConsentimentoPendenteError extends Error {
  constructor(public readonly escopo: string | null) {
    super("consentimento_pendente: nao ha documento assinado para este ato");
    this.name = "ConsentimentoPendenteError";
  }
}

/**
 * Trava ADITIVA. Se o toggle estiver LIGADO e não houver consentimento ativo,
 * lança ConsentimentoPendenteError. Desligado: no-op (nunca quebra fluxo legado).
 */
export async function assertConsentimento(
  pacienteId: number,
  escopo?: string | null,
): Promise<void> {
  const st = await consentimentoAtivo(pacienteId, escopo);
  if (st.travaLigada && !st.ativo) {
    throw new ConsentimentoPendenteError(st.escopo);
  }
}
