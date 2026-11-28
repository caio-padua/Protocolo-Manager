import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toCivilDate } from "@/lib/civil-date";

/** Formatação só de exibição das datas do Pit Stop (a data e a hora oficiais vêm do servidor, em Brasília). */
export const fmtData = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "sem data");
export const fmtDiaSemana = (iso: string | null | undefined) => (iso ? format(toCivilDate(iso), "EEE dd/MM", { locale: ptBR }) : "sem data");
export const fmtDataHora = (data: string | null | undefined, hora: string | null | undefined) =>
  data ? `${fmtDiaSemana(data)} ${hora ?? ""}`.trim() : "sem data";
/** "3 dias depois", "1 dia antes", "na data nominal". */
export function fmtDiferenca(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return "sem comparação";
  if (dias === 0) return "na data nominal";
  const n = Math.abs(dias);
  return `${n} dia${n === 1 ? "" : "s"} ${dias < 0 ? "antes" : "depois"}`;
}
export const fmtDias = (n: number | null | undefined) => (n === null || n === undefined ? "sem anterior" : `${n} dia${n === 1 ? "" : "s"}`);
/** Dia de hoje em Brasília (só para destacar/ocultar dias no calendário; o servidor decide o que vale). */
export const hojeBrt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
