/**
 * Operação administrativa delegada: usa o motor de preferências existente.
 * Não cria sessão, não envia mensagens e não altera eventos externos.
 * A entrada é fornecida pelo operador; não há dados de clientes neste arquivo.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  agendaResourcesTable, agendaWindowsTable, agendaSettingsTable, clientsTable, collaboratorAuditTable,
  db, locationsTable, professionalsTable,
} from "@workspace/db";
import { buildVisitOptions, getVisitPreferences, setVisitPreferences } from "../lib/client-visit-preferences";
import { canonicalWindows, validWindowRecurrence } from "../lib/agenda-window-recurrence";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const inputSchema = z.object({
  // O operador obtém estes dados separadamente da ferramenta de banco em
  // environment=development; nenhum nome ou identificador é fixado no código.
  expectedDevelopmentDatabase: z.string().min(1),
  expectedDevelopmentSystemIdentifier: z.string().regex(/^\d+$/),
  empresaId: z.number().int().positive(),
  professionalId: z.number().int().positive(),
  professionalName: z.string().min(1),
  clientId: z.number().int().positive(),
  clientName: z.string().min(1),
  resourceId: z.number().int().positive(),
  resourceName: z.string().min(1),
  expectedSlotMinutes: z.literal(30),
  slotMinutes: z.literal(20),
  expectedRevision: z.number().int().nonnegative(),
  windows: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: time,
    endTime: time,
    repeatWeeks: z.union([z.literal(1), z.literal(2)]),
    anchorDate: z.string().nullable(),
  })).min(1),
  priority: z.array(z.object({
    weekday: z.number().int().min(0).max(6), time,
  })).min(1),
});
export type AuthorizedPreferenceSetupInput = z.infer<typeof inputSchema>;

// Sem login fabricado: esta função é uma operação local privilegiada,
// autorizada fora da aplicação e registrada como tal, não uma rota pública.
export async function registrarPreferenciasAutorizadas(
  database: typeof db, rawInput: AuthorizedPreferenceSetupInput,
) {
  const input = inputSchema.parse(rawInput);
  const windows = canonicalWindows(input.windows);
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (w.endTime <= w.startTime || !validWindowRecurrence(w.weekday, w.repeatWeeks, w.anchorDate) ||
        (i > 0 && windows[i - 1].weekday === w.weekday && windows[i - 1].endTime > w.startTime)) {
      throw new Error("Expediente inválido ou sobreposto.");
    }
  }
  return database.transaction(async tx => {
    if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
      throw new Error("Operação indisponível em ambiente publicado.");
    }
    const identity = await tx.execute(sql`SELECT current_database() AS name,
      (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier`);
    const target = identity.rows[0];
    if (target?.name !== input.expectedDevelopmentDatabase ||
        target?.system_identifier !== input.expectedDevelopmentSystemIdentifier) {
      throw new Error("A conexão não corresponde ao banco de desenvolvimento verificado.");
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${input.empresaId})`);
    const [professional] = await tx.select().from(professionalsTable)
      .where(eq(professionalsTable.id, input.professionalId)).for("update");
    if (!professional?.active || !professional.isPlatformOwner || professional.name !== input.professionalName) {
      throw new Error("O profissional autorizador não corresponde ao proprietário ativo.");
    }
    const [client] = await tx.select().from(clientsTable)
      .where(and(eq(clientsTable.id, input.clientId), eq(clientsTable.empresaId, input.empresaId)))
      .for("update");
    if (!client || client.name !== input.clientName || client.status !== "active" || client.deletedAt) {
      throw new Error("Cliente não corresponde ao cadastro ativo da empresa.");
    }
    const [resource] = await tx.select({ resource: agendaResourcesTable, location: locationsTable })
      .from(agendaResourcesTable)
      .innerJoin(locationsTable, eq(locationsTable.id, agendaResourcesTable.locationId))
      .where(and(eq(agendaResourcesTable.id, input.resourceId), eq(locationsTable.empresaId, input.empresaId)))
      .for("update");
    if (!resource || !resource.resource.active || resource.location.active !== "true" ||
        resource.resource.name !== input.resourceName || resource.resource.kind !== "enfermagem" ||
        resource.resource.modality !== "local" || resource.resource.slotMinutes !== input.expectedSlotMinutes) {
      throw new Error("Agenda ou duração atual não corresponde ao esperado.");
    }
    const oldWindows = await tx.select().from(agendaWindowsTable).where(and(
      eq(agendaWindowsTable.resourceId, input.resourceId), eq(agendaWindowsTable.active, true),
    ));
    if (oldWindows.length) throw new Error("A agenda já tem expediente; nenhuma janela foi substituída.");
    const previous = await getVisitPreferences(tx, input.empresaId, input.clientId);
    if (previous.revision !== input.expectedRevision || previous.preferences.nursing.weekdays.length ||
        previous.preferences.nursing.times.length || (previous.preferences.nursing.priority?.length ?? 0)) {
      throw new Error("A preferência mudou ou já tem escolhas de enfermagem; nada foi substituído.");
    }
    const [settings] = await tx.select({ blockMinutes: agendaSettingsTable.blockMinutes })
      .from(agendaSettingsTable).orderBy(agendaSettingsTable.id).limit(1);
    const blockMinutes = settings?.blockMinutes ?? agendaSettingsTable.blockMinutes.default;
    if (typeof blockMinutes !== "number" || !Number.isSafeInteger(blockMinutes) || blockMinutes <= 0) {
      throw new Error("Bloco do motor de agenda não está configurado.");
    }
    const options = buildVisitOptions(windows.map(w => ({
      name: resource.resource.name, kind: resource.resource.kind, slotMinutes: input.slotMinutes,
      weekday: w.weekday, startTime: w.startTime, endTime: w.endTime,
    })), blockMinutes);
    for (const entry of input.priority) {
      if (!options.nursing.days.some(day => day.weekday === entry.weekday && day.times.includes(entry.time))) {
        throw new Error("A preferência não pertence à grade da agenda selecionada.");
      }
    }
    await tx.update(agendaResourcesTable).set({ slotMinutes: input.slotMinutes })
      .where(eq(agendaResourcesTable.id, input.resourceId));
    await tx.insert(agendaWindowsTable).values(windows.map(w => ({
      resourceId: input.resourceId, ...w, active: true,
    })));
    const desired = {
      ...previous.preferences,
      nursing: {
        weekdays: [...new Set(input.priority.map(p => p.weekday))],
        times: input.priority.map(p => ({ ...p })),
        priority: input.priority.map(p => ({ ...p })),
      },
    };
    const saved = await setVisitPreferences(
      tx, input.empresaId, input.clientId, input.professionalId, desired, input.expectedRevision,
      { kind: "agent", label: "Replit Agent", authorizerProfessionalId: input.professionalId },
    );
    await tx.insert(collaboratorAuditTable).values({
      professionalId: null,
      professionalName: "Agente de manutenção",
      subjectProfessionalId: professional.id,
      subjectProfessionalName: professional.name,
      empresaId: input.empresaId,
      action: "agent_delegated_configuration",
      method: "AGENT",
      detail: {
        executor: "Replit Agent", authorization: "solicitação expressa do proprietário",
        authorizingProfessionalId: professional.id, clientId: input.clientId,
        resourceId: input.resourceId, preferenceRevision: saved.revision,
        previousSlotMinutes: input.expectedSlotMinutes, slotMinutes: input.slotMinutes,
        windowCount: windows.length,
      },
    });
    return { revision: saved.revision, windowCount: windows.length };
  });
}
