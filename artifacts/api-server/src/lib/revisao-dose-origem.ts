/** Contrato interno: IDs e revisões são obtidos em registros e requisição validados. */
export type OrigemDoseAnterior = { id: number; revisaoConfirmada: string };
export type ConferenciaDose = { id: number; revisaoObservada: string };

type ConsultaTransacional = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: { id: number; revisao_dose: string }[] }>;
};

export class ErroRevisaoDose extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

function validarRevisao(valor: string): boolean {
  return typeof valor === "string" && /^(0|[1-9]\d{0,18})$/.test(valor)
    && BigInt(valor) <= 9223372036854775807n;
}

/**
 * Deve ser chamada dentro da transação que salvará o procedimento.
 * A comprovação da identidade e da autorização do médico cabe ao chamador.
 * As travas permanecem até COMMIT/ROLLBACK da transação do chamador.
 */
export async function conferirRevisaoDose(
  tx: ConsultaTransacional,
  anterior: OrigemDoseAnterior | null,
  proximaId: number | null,
  conferencias: ConferenciaDose[],
  medicoConfirmou: boolean,
): Promise<{ proximaRevisao: string | null }> {
  if ((proximaId !== null && (!Number.isSafeInteger(proximaId) || proximaId <= 0)) ||
      (medicoConfirmou !== true && medicoConfirmou !== false) || !Array.isArray(conferencias)) {
    throw new ErroRevisaoDose("Dados de revisão inválidos; atualize e confira novamente.");
  }
  const ids = [...new Set([anterior?.id, proximaId].filter((id): id is number => id != null))].sort((a, b) => a - b);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      (anterior && !validarRevisao(anterior.revisaoConfirmada)) ||
      conferencias.some((c) => !c || typeof c !== "object" || !Number.isSafeInteger(c.id) || c.id <= 0 || !validarRevisao(c.revisaoObservada)) ||
      new Set(conferencias.map((c) => c.id)).size !== conferencias.length) {
    throw new ErroRevisaoDose("Dados de revisão inválidos; atualize e confira novamente.");
  }
  if (!ids.length) return { proximaRevisao: null };
  let bloqueadas: { rows: { id: number; revisao_dose: string }[] };
  try {
    bloqueadas = await tx.query(
      "SELECT id,revisao_dose FROM substances WHERE id=ANY($1::integer[]) ORDER BY id FOR SHARE", [ids],
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        (error.code === "42703" || error.code === "42P01")) {
      throw new ErroRevisaoDose("A proteção de revisão da dose não está instalada.", 503);
    }
    throw error;
  }
  const atual = new Map(bloqueadas.rows.map((r) => [r.id, r.revisao_dose]));
  if (atual.size !== ids.length) throw new ErroRevisaoDose("A origem da dose não está disponível; não foi possível salvar.");

  const origemAlterada = anterior !== null && atual.get(anterior.id) !== anterior.revisaoConfirmada;
  const origemMudou = anterior?.id !== (proximaId ?? undefined);
  const obrigatorias = new Set<number>();
  if (anterior && (origemAlterada || origemMudou)) obrigatorias.add(anterior.id);
  if (proximaId !== null && (!anterior || origemMudou || origemAlterada)) obrigatorias.add(proximaId);
  if (obrigatorias.size) {
    if (medicoConfirmou !== true) throw new ErroRevisaoDose("É necessária nova conferência médica da dose.");
    for (const id of obrigatorias) {
      const revisao = conferencias.find((c) => c.id === id)?.revisaoObservada;
      if (revisao !== atual.get(id)) {
        throw new ErroRevisaoDose("A origem mudou desde a conferência; atualize e confira novamente.");
      }
    }
  }
  return { proximaRevisao: proximaId == null ? null : atual.get(proximaId)! };
}
