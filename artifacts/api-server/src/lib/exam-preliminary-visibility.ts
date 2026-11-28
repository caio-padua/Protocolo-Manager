import {
  appSettingsTable,
  collaboratorAuditTable,
  db,
  professionalsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSetting } from "./secure-settings";

const SETTING_PREFIX = "exames.exibirResultadosPreliminaresAreaCliente.empresa.";

export function chaveVisibilidadePreliminarExames(empresaId: number): string {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) {
    throw new Error("Clínica inválida para a configuração de exames preliminares.");
  }
  return `${SETTING_PREFIX}${empresaId}`;
}

/** Configuração ausente, desconhecida ou clínica inválida sempre significa desligado. */
export async function lerVisibilidadePreliminarExames(empresaId: number | null): Promise<boolean> {
  if (empresaId === null || !Number.isSafeInteger(empresaId) || empresaId <= 0) return false;
  return (await getSetting(chaveVisibilidadePreliminarExames(empresaId))) === "true";
}

/**
 * Persiste a opção da clínica e a trilha de auditoria na mesma transação.
 * O chamador precisa obter clínica e autor de uma sessão validada no servidor.
 */
export async function salvarVisibilidadePreliminarExames(input: {
  empresaId: number;
  habilitado: boolean;
  professionalId: number;
}): Promise<{ valorAnterior: boolean | null }> {
  const key = chaveVisibilidadePreliminarExames(input.empresaId);
  if (!Number.isSafeInteger(input.professionalId) || input.professionalId <= 0) {
    throw new Error("Autor inválido para a configuração de exames preliminares.");
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ value: appSettingsTable.value })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, key))
      .limit(1);
    const [actor] = await tx
      .select({ name: professionalsTable.name })
      .from(professionalsTable)
      .where(eq(professionalsTable.id, input.professionalId))
      .limit(1);
    if (!actor) throw new Error("Autor não encontrado para a trilha de auditoria.");

    const valorAnterior =
      current?.value === "true" ? true : current?.value === "false" ? false : null;
    await tx
      .insert(appSettingsTable)
      .values({ key, value: String(input.habilitado) })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: String(input.habilitado) },
      });
    await tx.insert(collaboratorAuditTable).values({
      professionalId: input.professionalId,
      professionalName: actor.name,
      empresaId: input.empresaId,
      action: "write",
      method: "PUT",
      path: "/settings/exames",
      detail: {
        setting: "exibirResultadosPreliminaresAreaCliente",
        previousValue: valorAnterior,
        newValue: input.habilitado,
      },
    });

    return { valorAnterior };
  });
}
