/**
 * Política de transição dos links LEGADOS de exame.
 * - Desligada por padrão: sem registro em app_settings, nenhum legado vence (comportamento atual).
 * - Ligada: o prazo (90 dias) conta da DATA DE ATIVAÇÃO gravada, nunca da emissão antiga.
 *   Por isso documento sem data de criação não exige presumir nada: o relógio dele é o da ativação.
 * - A ativação é explícita, auditada e só por dono da plataforma. Esta política NÃO foi ativada em produção.
 */
export const CHAVE_POLITICA_LEGADO = "exame.link.legado.politica";
export const PRAZO_LEGADO_DIAS = 90;

export type PoliticaLegado = { ativadaEm: string; dias: number; ativadaPor: string } | null;
export type StatusLegado =
  | { estado: "sem_politica" }
  | { estado: "em_transicao"; expiraEm: string; diasRestantes: number }
  | { estado: "expirado"; expiraEm: string };

export function lerPolitica(valor: unknown): PoliticaLegado {
  try {
    const o = typeof valor === "string" ? JSON.parse(valor) : valor;
    if (!o || typeof o !== "object") return null;
    const { ativadaEm, dias, ativadaPor } = o as Record<string, unknown>;
    const t = typeof ativadaEm === "string" ? Date.parse(ativadaEm) : NaN;
    if (!Number.isFinite(t) || !Number.isInteger(dias) || (dias as number) < 1 || (dias as number) > 3650) return null;
    return { ativadaEm: new Date(t).toISOString(), dias: dias as number, ativadaPor: String(ativadaPor ?? "") };
  } catch { return null; } // registro ilegível = sem política (não vence ninguém por engano)
}

export function statusLegado(p: PoliticaLegado, agora = Date.now()): StatusLegado {
  if (!p) return { estado: "sem_politica" };
  const fim = Date.parse(p.ativadaEm) + p.dias * 86_400_000;
  if (agora > fim) return { estado: "expirado", expiraEm: new Date(fim).toISOString() };
  return { estado: "em_transicao", expiraEm: new Date(fim).toISOString(), diasRestantes: Math.ceil((fim - agora) / 86_400_000) };
}
