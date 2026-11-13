// Interpreta a resposta de GET /api/settings/telegram para o cartao da
// Central de Auditoria. Regra de status honesto: erro de acesso ou de rede
// NUNCA vira "nao configurado" — sao estados distintos.

export type StatusTelegram =
  | { tipo: "ok"; ativo: boolean; configurado: boolean }
  | { tipo: "erro"; motivo: "acesso" | "servidor" | "rede" | "resposta" };

export function classificarStatusTelegram(httpStatus: number, corpo: unknown): StatusTelegram {
  if (httpStatus === 401 || httpStatus === 403) return { tipo: "erro", motivo: "acesso" };
  if (httpStatus < 200 || httpStatus >= 300) return { tipo: "erro", motivo: "servidor" };
  if (!corpo || typeof corpo !== "object") return { tipo: "erro", motivo: "resposta" };
  const c = corpo as { active?: unknown; tokenStatus?: { isSet?: unknown } | null };
  if (typeof c.active !== "boolean" || !c.tokenStatus || typeof c.tokenStatus.isSet !== "boolean") {
    return { tipo: "erro", motivo: "resposta" };
  }
  return { tipo: "ok", ativo: c.active, configurado: c.tokenStatus.isSet };
}

export function mensagemErroTelegram(motivo: "acesso" | "servidor" | "rede" | "resposta"): string {
  switch (motivo) {
    case "acesso": return "O servidor recusou a consulta (sem acesso). Entre novamente com sua conta de colaborador.";
    case "servidor": return "O servidor respondeu com erro ao consultar o Telegram.";
    case "rede": return "Não foi possível falar com o servidor agora.";
    case "resposta": return "O servidor devolveu uma resposta fora do formato esperado.";
  }
}
