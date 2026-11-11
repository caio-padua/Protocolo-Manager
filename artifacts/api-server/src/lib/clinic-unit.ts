import { and, eq } from "drizzle-orm";
import { db, empresasTable, locationsTable } from "@workspace/db";
import { ClinicalIdentityError } from "./clinical-emitter";

/**
 * "Clínica" e "local da agenda" são conceitos diferentes.
 * - Clínica = a empresa do cliente (empresas.nome), usada nos documentos.
 * - Local/agenda = onde a visita acontece (locations), guardado em protocols.unit / sessions.unit.
 * resolveClinicalMember devolve o nome do local de agenda do cliente; aqui ele é trocado pelo nome da clínica.
 */
export async function nomeDaClinica(empresaId: number): Promise<string> {
  const [empresa] = await db.select({ nome: empresasTable.nome })
    .from(empresasTable).where(eq(empresasTable.id, empresaId)).limit(1);
  const nome = empresa?.nome?.trim();
  if (!nome) throw new ClinicalIdentityError(409, "A clínica vinculada ao cliente não tem nome cadastrado.");
  return nome;
}

export async function comNomeDaClinica<T extends { clinic: { empresaId: number; name?: string } }>(
  member: T,
): Promise<T & { clinic: T["clinic"] & { name: string } }> {
  return { ...member, clinic: { ...member.clinic, name: await nomeDaClinica(member.clinic.empresaId) } };
}

function normaliza(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

/** Vazio, nome da clínica ou nome de um local cadastrado da MESMA empresa. */
export async function unidadePertenceAClinica(
  empresaId: number,
  unidade: string | null | undefined,
  nomeClinica: string,
): Promise<boolean> {
  const alvo = unidade?.trim();
  if (!alvo) return true;
  if (normaliza(alvo) === normaliza(nomeClinica)) return true;
  const locais = await db.select({ nome: locationsTable.name }).from(locationsTable)
    .where(and(eq(locationsTable.empresaId, empresaId)));
  return locais.some((local) => normaliza(local.nome) === normaliza(alvo));
}

export const MENSAGEM_UNIDADE_FORA_DA_CLINICA =
  "A unidade salva no protocolo pertence a outra clínica e não corresponde à clínica vinculada ao cliente.";
