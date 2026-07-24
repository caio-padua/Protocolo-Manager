/**
 * brt.ts — Fuso de Brasília (BRT, UTC-3) centralizado.
 *
 * FONTE DE VERDADE de todo cálculo de data/hora baseado no horário de Brasília
 * no api-server. NUNCA use `new Date()` diretamente para gerar nomes de arquivo,
 * datas de exibição ou prefixos de data — importe daqui.
 *
 * Brasil não tem mais horário de verão desde 2019; BRT = UTC-3 fixo.
 * Usamos Intl.DateTimeFormat com "America/Sao_Paulo" que é mais semântico e
 * sobrevive a eventuais mudanças de DST sem alterar o código.
 *
 * Funções exportadas:
 *   brtNow()         → Date do instante atual (ainda em UTC internamente — use as helpers abaixo para formatar)
 *   brtDateStr()     → "YY.MM.DD"    — prefixo de nome de arquivo
 *   brtISODate()     → "YYYY-MM-DD"  — chave de data para banco (sem hora)
 *   brtDisplayDate() → "DD/MM/AAAA"  — exibição ao usuário
 *   brtDateTime()    → "DD/MM/AAAA HH:MM" — log/exibição com hora
 *   parseBrtParts()  → { year, month, day, hour, minute } em BRT
 */

const TZ = "America/Sao_Paulo";

function fmt(date: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...opts }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** Retorna o Date do instante atual (UTC internamente). Use as helpers abaixo para exibir em BRT. */
export function brtNow(): Date {
  return new Date();
}

/**
 * Partes numéricas do instante atual no fuso de Brasília.
 * Útil para construir formatos customizados sem novo parse.
 */
export function parseBrtParts(date?: Date): {
  year: string; month: string; day: string;
  hour: string; minute: string; second: string;
} {
  const d = date ?? new Date();
  const p = fmt(d, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  return {
    year: p.year ?? "",
    month: p.month ?? "",
    day: p.day ?? "",
    hour: p.hour === "24" ? "00" : (p.hour ?? "00"),
    minute: p.minute ?? "",
    second: p.second ?? "",
  };
}

/**
 * Prefixo de data para nome de arquivo: "YY.MM.DD"
 * Ex.: 26.07.24  (24 de julho de 2026, BRT)
 */
export function brtDateStr(date?: Date): string {
  const { year, month, day } = parseBrtParts(date);
  return `${year.slice(2)}.${month}.${day}`;
}

/**
 * Data ISO sem hora: "YYYY-MM-DD" em BRT.
 * Usar para datas de coleta, datas de sessão, campos de banco sem hora.
 */
export function brtISODate(date?: Date): string {
  const { year, month, day } = parseBrtParts(date);
  return `${year}-${month}-${day}`;
}

/**
 * Data para exibição ao usuário: "DD/MM/AAAA"
 * Ex.: 24/07/2026
 */
export function brtDisplayDate(date?: Date): string {
  const { year, month, day } = parseBrtParts(date);
  return `${day}/${month}/${year}`;
}

/**
 * Data + hora para log/exibição: "DD/MM/AAAA HH:MM"
 * Ex.: 24/07/2026 22:14
 */
export function brtDateTime(date?: Date): string {
  const { year, month, day, hour, minute } = parseBrtParts(date);
  return `${day}/${month}/${year} ${hour}:${minute}`;
}
