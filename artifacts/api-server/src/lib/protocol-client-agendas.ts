import { and, asc, eq, inArray } from "drizzle-orm";
import {
  agendaResourcesTable,
  clientsTable,
  db,
  empresasTable,
  locationsTable,
  locationProfessionalsTable,
  professionalsTable,
} from "@workspace/db";
import { getPreferredAgendas } from "./client-preferred-agendas";

export class ClientProtocolAgendaError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 | 422 = 409,
    readonly code = "agendas_do_cliente_invalidas",
  ) {
    super(message);
  }
}

export type ProtocolAgendaOption = {
  id: number;
  name: string;
  kind: string;
  modality: string;
  professionalId: number | null;
  locationId: number;
  locationName: string;
  locationType: string;
  locationColor: string;
  locationAddress: string | null;
};

export async function loadClientProtocolAgendas(
  clientId: number,
  empresaId: number,
  { requireMedical = true }: { requireMedical?: boolean } = {},
) {
  const [client] = await db.select().from(clientsTable).where(and(
    eq(clientsTable.id, clientId),
    eq(clientsTable.empresaId, empresaId),
    eq(clientsTable.status, "active"),
  )).limit(1);
  if (!client) throw new ClientProtocolAgendaError("Cliente não encontrado.", 404, "cliente_nao_encontrado");
  if (!client.clinicaOrigemEmpresaId) {
    throw new ClientProtocolAgendaError("Defina a clínica de origem no cadastro do cliente antes de lançar o protocolo.");
  }
  if (client.clinicaOrigemEmpresaId !== empresaId) {
    throw new ClientProtocolAgendaError("A clínica de origem deste cliente não está autorizada nesta sessão.", 403);
  }

  const [clinic] = await db.select({
    id: empresasTable.id,
    name: empresasTable.nome,
  }).from(empresasTable).where(and(
    eq(empresasTable.id, client.clinicaOrigemEmpresaId),
    eq(empresasTable.tipo, "clinic"),
    eq(empresasTable.ativa, true),
    eq(empresasTable.status, "ATIVO"),
  )).limit(1);
  if (!clinic) throw new ClientProtocolAgendaError("A clínica de origem do cliente está inativa ou indisponível.");

  const preferredIds = await getPreferredAgendas(client.id);
  const permittedIds = [...new Set([
    client.agendaEnfermagemPadraoId,
    client.agendaMedicoPadraoId,
    ...preferredIds,
  ].filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0))];

  const resources: ProtocolAgendaOption[] = permittedIds.length
    ? await db.select({
        id: agendaResourcesTable.id,
        name: agendaResourcesTable.name,
        kind: agendaResourcesTable.kind,
        modality: agendaResourcesTable.modality,
        professionalId: agendaResourcesTable.professionalId,
        locationId: locationsTable.id,
        locationName: locationsTable.name,
        locationType: locationsTable.type,
        locationColor: locationsTable.color,
        locationAddress: locationsTable.address,
      }).from(agendaResourcesTable)
        .innerJoin(locationsTable, eq(locationsTable.id, agendaResourcesTable.locationId))
        .where(and(
          inArray(agendaResourcesTable.id, permittedIds),
          eq(agendaResourcesTable.active, true),
          eq(locationsTable.empresaId, client.clinicaOrigemEmpresaId),
          eq(locationsTable.active, "true"),
        ))
        .orderBy(asc(agendaResourcesTable.sortOrder), asc(agendaResourcesTable.name))
    : [];

  const byId = new Map(resources.map(resource => [resource.id, resource]));
  if (client.agendaEnfermagemPadraoId && byId.get(client.agendaEnfermagemPadraoId)?.kind !== "enfermagem") {
    throw new ClientProtocolAgendaError("A agenda padrão de enfermagem do cliente está inativa, inválida ou pertence a outra clínica.");
  }
  if (client.agendaMedicoPadraoId && byId.get(client.agendaMedicoPadraoId)?.kind !== "medico") {
    throw new ClientProtocolAgendaError("A agenda padrão médica do cliente está inativa, inválida ou pertence a outra clínica.");
  }

  const nursingAgendas = resources.filter(resource => resource.kind === "enfermagem" && resource.modality === "local");
  const medicalAgendas = resources.filter(resource => resource.kind === "medico");
  const nursingAgenda = client.agendaEnfermagemPadraoId
    ? byId.get(client.agendaEnfermagemPadraoId) ?? null
    : nursingAgendas[0] ?? null;
  const medicalAgenda = client.agendaMedicoPadraoId
    ? byId.get(client.agendaMedicoPadraoId) ?? null
    : medicalAgendas[0] ?? null;

  if (!nursingAgenda) {
    throw new ClientProtocolAgendaError(
      "O cliente não tem agenda de enfermagem padrão nem preferencial.",
      422,
      "agenda_enfermagem_indefinida",
    );
  }
  if (nursingAgenda.modality !== "local") {
    throw new ClientProtocolAgendaError(
      "A agenda de enfermagem vinculada não está habilitada para reserva local de protocolos.",
      422,
      "agenda_invalida",
    );
  }
  if (!medicalAgenda && requireMedical) {
    throw new ClientProtocolAgendaError("Vincule uma agenda médica ao cadastro do cliente antes de lançar o protocolo.");
  }

  const professionalsFor = async (agenda: ProtocolAgendaOption, kind: "enfermagem" | "medico") => {
    const query = db.select({
      id: professionalsTable.id,
      name: professionalsTable.name,
      crm: professionalsTable.crm,
      category: professionalsTable.category,
      professionalType: professionalsTable.professionalType,
      nurseType: professionalsTable.nurseType,
      homeServiceFeePerVisit: professionalsTable.homeServiceFeePerVisit,
    }).from(professionalsTable);

    const categoryFilter = kind === "enfermagem"
      ? eq(professionalsTable.category, "enfermagem")
      : eq(professionalsTable.professionalType, "medico");
    const activeFilter = and(categoryFilter, eq(professionalsTable.active, true));

    if (agenda.professionalId) {
      return query.where(and(
        eq(professionalsTable.id, agenda.professionalId),
        activeFilter,
      ));
    }

    return db.select({
      id: professionalsTable.id,
      name: professionalsTable.name,
      crm: professionalsTable.crm,
      category: professionalsTable.category,
      professionalType: professionalsTable.professionalType,
      nurseType: professionalsTable.nurseType,
      homeServiceFeePerVisit: professionalsTable.homeServiceFeePerVisit,
    }).from(locationProfessionalsTable)
      .innerJoin(professionalsTable, eq(professionalsTable.id, locationProfessionalsTable.professionalId))
      .where(and(
        eq(locationProfessionalsTable.locationId, agenda.locationId),
        activeFilter,
      ))
      .orderBy(asc(professionalsTable.name));
  };

  const [nurses, doctors] = await Promise.all([
    professionalsFor(nursingAgenda, "enfermagem"),
    medicalAgenda ? professionalsFor(medicalAgenda, "medico") : Promise.resolve([]),
  ]);

  return {
    client,
    clinic,
    resources,
    nursingAgendas,
    medicalAgendas,
    nursingAgenda,
    medicalAgenda,
    nurses,
    doctors,
  };
}
