/**
 * Nomenclatura oficial dos arquivos de backup de mensagens (validada pelo CEO).
 *
 * Geral:      aa.mm.dd BACKUP MSG TG GERAL        | aa.mm.dd BACKUP MSG WWP GERAL
 * Individual: aa.mm.dd BACKUP MSG TG NOME CPF 000.000.000-00
 *             aa.mm.dd BACKUP MSG WWP NOME CPF 000.000.000-00
 *
 * TG = Telegram. WWP = WhatsApp. Data em Brasília (fonte única: lib/brt.ts).
 */
import { brtDateStr } from "./brt";

export type CanalBackup = "TG" | "WWP";

function semAcentoMaiusculo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function formatarCpfParaNome(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) throw new Error("CPF invalido para nome de backup");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function nomeBackupGeral(canal: CanalBackup, data?: Date): string {
  return `${brtDateStr(data)} BACKUP MSG ${canal} GERAL`;
}

export function nomeBackupIndividual(
  canal: CanalBackup,
  cliente: { nome: string; cpf: string },
  data?: Date,
): string {
  const nome = semAcentoMaiusculo(cliente.nome);
  if (!nome) throw new Error("Nome do cliente vazio para nome de backup");
  return `${brtDateStr(data)} BACKUP MSG ${canal} ${nome} CPF ${formatarCpfParaNome(cliente.cpf)}`;
}
