/**
 * Operação local delegada. Não cria protocolo, aplicação, documento ou evento.
 * Todos os dados clínicos e identificadores são fornecidos pelo operador.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  catalogoInjetaveisTable, catalogoItensTable, collaboratorAuditTable, db,
  professionalsTable, substancesTable,
} from "@workspace/db";
import { travarCatalogoClinico } from "../lib/catalogo-via-confirmada";

const inputSchema = z.object({
  expectedDevelopmentDatabase: z.string().min(1),
  expectedDevelopmentSystemIdentifier: z.string().regex(/^\d+$/),
  professionalId: z.number().int().positive(),
  professionalName: z.string().min(1),
  empresaId: z.number().int().positive(),
  codigoPadcom: z.string().min(1),
  name: z.string().min(1),
  substanceId: z.number().int().positive(),
  catalogId: z.number().int().positive(),
  injectableId: z.number().int().positive(),
  previousVia: z.string().min(1),
  // Esta operação é limitada à via que o médico autorizou expressamente.
  requestedVia: z.literal("IM"),
  expectedDose: z.string().min(1),
  expectedInjectableDose: z.string().min(1),
  expectedInjectableVolume: z.string().min(1),
});
export type ConfirmarViaCatalogoInput = z.infer<typeof inputSchema>;

export async function confirmarViaCatalogoAutorizada(
  database: typeof db, rawInput: ConfirmarViaCatalogoInput,
) {
  const input = inputSchema.parse(rawInput);
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
    await travarCatalogoClinico(tx);
    const [professional] = await tx.select().from(professionalsTable)
      .where(eq(professionalsTable.id, input.professionalId)).for("update");
    if (!professional?.active || !professional.isPlatformOwner || professional.name !== input.professionalName ||
        professional.professionalType !== "medico" || professional.empresaId !== input.empresaId ||
        !(professional.crm?.trim() || professional.registrationNumber?.trim())) {
      throw new Error("O profissional autorizador não corresponde ao médico proprietário ativo da empresa.");
    }
    const substances = await tx.select().from(substancesTable)
      .where(eq(substancesTable.codigoPadcom, input.codigoPadcom)).for("update");
    const items = await tx.select().from(catalogoItensTable)
      .where(eq(catalogoItensTable.codigoPadcom, input.codigoPadcom)).for("update");
    const injectables = await tx.select().from(catalogoInjetaveisTable)
      .where(eq(catalogoInjetaveisTable.codigoPadcom, input.codigoPadcom)).for("update");
    if (substances.length !== 1 || items.length !== 1 || injectables.length !== 1) {
      throw new Error("O código não identifica exatamente um registro em cada fonte.");
    }
    const [substance] = substances;
    const [item] = items;
    const [injectable] = injectables;
    if (substance.id !== input.substanceId || item.id !== input.catalogId ||
        injectable.id !== input.injectableId ||
        substance.name !== input.name || item.nome !== input.name ||
        injectable.nomeAmpola !== input.name || injectable.nomeExibicao !== input.name ||
        substance.procedureType !== "im" || item.categoria !== "injetavel_im" ||
        substance.defaultDose !== input.expectedDose || item.posologia !== input.expectedDose ||
        injectable.dosagem !== input.expectedInjectableDose ||
        injectable.volume !== input.expectedInjectableVolume ||
        substance.viaUso !== input.previousVia || item.viaUso !== input.previousVia ||
        injectable.via !== input.previousVia || item.viaUsoRevisada || injectable.viaRevisada) {
      throw new Error("A identidade, a dose, a classificação ou a via anterior não corresponde ao esperado.");
    }
    await tx.update(catalogoItensTable)
      .set({ viaUso: input.requestedVia, viaUsoRevisada: true })
      .where(eq(catalogoItensTable.id, item.id));
    await tx.update(catalogoInjetaveisTable)
      .set({ via: input.requestedVia, viaRevisada: true })
      .where(eq(catalogoInjetaveisTable.id, injectable.id));
    await tx.update(substancesTable).set({ viaUso: input.requestedVia })
      .where(eq(substancesTable.id, substance.id));
    await tx.insert(collaboratorAuditTable).values({
      professionalId: null, professionalName: "Agente de manutenção",
      subjectProfessionalId: professional.id, subjectProfessionalName: professional.name,
      empresaId: input.empresaId, action: "agent_delegated_clinical_catalog_confirmation",
      method: "AGENT",
      detail: {
        executor: "Replit Agent", authorization: "solicitação expressa do proprietário",
        authorizingProfessionalId: professional.id, codigoPadcom: input.codigoPadcom,
        substanceId: substance.id, catalogId: item.id, injectableId: injectable.id,
        previousVia: input.previousVia, confirmedVia: input.requestedVia,
      },
    });
    return { substanceId: substance.id, catalogId: item.id, injectableId: injectable.id };
  });
}
