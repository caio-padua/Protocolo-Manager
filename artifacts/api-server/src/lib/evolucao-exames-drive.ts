/**
 * DEEx: cópia automática na pasta EXAMES do paciente, no Drive da clínica dele.
 * Nome: "AA.MM.DD DEEx DESCRITIVO EVOLUCAO EXAMES NOME DO PACIENTE.pdf" (só espaço, sem traços) (data em BRT).
 * Regras: só entra o documento DEFINITIVO (a prévia nunca vai para a pasta do paciente);
 * a raiz de clientes é a da empresa do paciente, sem cair na pasta global; arquivo existente nunca é
 * apagado (nome repetido recebe número); falha no Drive nunca impede o download do PDF.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ensureClientFolderStructure, getUniqueDriveFileName, removeDiacritics, uploadFileToDrive } from "./google-drive";
import { brtDateStr } from "./brt";
import { NOME_COMERCIAL_EVOLUCAO } from "./evolucao-exames-nome";

export type EstadoDrive = "salvo" | "falhou" | "indisponivel" | "previa";

export function nomeArquivoDeex(nomePaciente: string, previa = false, data?: Date): string {
  const paciente = removeDiacritics(nomePaciente ?? "")
    .toUpperCase()
    .replace(/[\\/:*?"<>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "PACIENTE";
  const sufixo = previa ? " PREVIA INTERNA" : "";
  return `${brtDateStr(data)} ${NOME_COMERCIAL_EVOLUCAO} DESCRITIVO EVOLUCAO EXAMES ${paciente}${sufixo}.pdf`;
}

async function raizClientesDaEmpresa(empresaId: number): Promise<string | null> {
  const r = await db.execute(sql`SELECT drive_clientes_folder_id FROM empresas WHERE id = ${empresaId} LIMIT 1`);
  const v = (r.rows as Array<{ drive_clientes_folder_id?: unknown }>)[0]?.drive_clientes_folder_id;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function arquivarDeexNoDrive(d: {
  empresaId: number;
  nomePaciente: string;
  cpf: string | null;
  pdf: Uint8Array;
}): Promise<{ estado: EstadoDrive; nome: string | null }> {
  const cpf = (d.cpf ?? "").replace(/\D/g, "");
  if (!cpf) return { estado: "indisponivel", nome: null };
  try {
    const raiz = await raizClientesDaEmpresa(d.empresaId);
    if (!raiz) return { estado: "indisponivel", nome: null };
    const estrutura = await ensureClientFolderStructure(d.nomePaciente, cpf, raiz);
    const pasta = estrutura.subfolders["EXAMES"];
    if (!pasta) return { estado: "indisponivel", nome: null };
    const nome = await getUniqueDriveFileName(pasta, nomeArquivoDeex(d.nomePaciente));
    await uploadFileToDrive(pasta, nome, "application/pdf", Buffer.from(d.pdf), true);
    return { estado: "salvo", nome };
  } catch {
    return { estado: "falhou", nome: null };
  }
}
