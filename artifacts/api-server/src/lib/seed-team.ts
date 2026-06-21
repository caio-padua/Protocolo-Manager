import {
  db,
  professionalsTable,
  professionalAreasTable,
  professionalSpecialtiesTable,
  agendaResourcesTable,
  agendaWindowsTable,
  locationsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

type SeedLog = (msg: string) => void;
const noopLog: SeedLog = () => {};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Janelas padrao: seg-sex 08-12 e 14-20, sab 08-12 (11 janelas), igual ao motor
// existente. Idempotente: so cria se o recurso ainda nao tem janela.
const STANDARD_WINDOWS: Array<{ weekday: number; startTime: string; endTime: string }> = [
  ...[1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, startTime: "08:00", endTime: "12:00" },
    { weekday, startTime: "14:00", endTime: "20:00" },
  ]),
  { weekday: 6, startTime: "08:00", endTime: "12:00" },
];

async function upsertArea(
  name: string,
  professionalType: string,
  sortOrder: number,
): Promise<number> {
  const slug = slugify(name);
  const [existing] = await db
    .select()
    .from(professionalAreasTable)
    .where(eq(professionalAreasTable.slug, slug))
    .limit(1);
  if (existing) {
    await db
      .update(professionalAreasTable)
      .set({ name, professionalType, defaultPaymentArm: "sinal25", active: true, sortOrder })
      .where(eq(professionalAreasTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(professionalAreasTable)
    .values({ name, slug, professionalType, defaultPaymentArm: "sinal25", active: true, sortOrder })
    .returning();
  return created.id;
}

async function upsertSpecialty(areaId: number, name: string, sortOrder: number): Promise<number> {
  const [existing] = await db
    .select()
    .from(professionalSpecialtiesTable)
    .where(and(eq(professionalSpecialtiesTable.areaId, areaId), eq(professionalSpecialtiesTable.name, name)))
    .limit(1);
  if (existing) {
    await db
      .update(professionalSpecialtiesTable)
      .set({ slug: slugify(name), active: true, sortOrder })
      .where(eq(professionalSpecialtiesTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(professionalSpecialtiesTable)
    .values({ areaId, name, slug: slugify(name), active: true, sortOrder })
    .returning();
  return created.id;
}

async function ensureWindows(resourceId: number): Promise<void> {
  const existing = await db
    .select({ id: agendaWindowsTable.id })
    .from(agendaWindowsTable)
    .where(eq(agendaWindowsTable.resourceId, resourceId))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(agendaWindowsTable).values(STANDARD_WINDOWS.map((w) => ({ resourceId, ...w })));
}

async function ensureLocation(name: string, address: string): Promise<number> {
  const [existing] = await db.select().from(locationsTable).where(eq(locationsTable.name, name)).limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(locationsTable)
    .values({ name, type: "clinic", address })
    .returning();
  return created.id;
}

// Cria (idempotente, por nome) recurso presencial + recurso online de um
// profissional nao-medico, cada um com as janelas padrao.
async function ensureResource(
  name: string,
  kind: string,
  modality: string,
  professionalId: number,
  locationId: number | null,
): Promise<number> {
  const [existing] = await db
    .select()
    .from(agendaResourcesTable)
    .where(eq(agendaResourcesTable.name, name))
    .limit(1);
  let resourceId: number;
  if (existing) {
    await db
      .update(agendaResourcesTable)
      .set({ kind, modality, professionalId, locationId, active: true })
      .where(eq(agendaResourcesTable.id, existing.id));
    resourceId = existing.id;
  } else {
    const [created] = await db
      .insert(agendaResourcesTable)
      .values({ name, kind, modality, professionalId, locationId, active: true })
      .returning();
    resourceId = created.id;
  }
  await ensureWindows(resourceId);
  return resourceId;
}

// Cria (idempotente, por nome) um profissional nao-medico completo, com agenda
// presencial (endereco proprio ficticio) + online e janelas.
async function ensureNonDoctor(opts: {
  name: string;
  areaId: number;
  specialtyId: number;
  council: string;
  registrationNumber: string;
  resourceKind: string;
  presentialResourceName: string;
  onlineResourceName: string;
  locationName: string;
  locationAddress: string;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.name, opts.name))
    .limit(1);

  const fields = {
    category: "outro" as const,
    professionalType: "nao_medico",
    areaId: opts.areaId,
    specialtyId: opts.specialtyId,
    registrationCouncil: opts.council,
    registrationNumber: opts.registrationNumber,
    crm: `${opts.council} ${opts.registrationNumber}`,
    isPrimaryDoctor: false,
    active: true,
    serviceTypes: ["clinic", "online"],
  };

  let professionalId: number;
  if (existing) {
    await db.update(professionalsTable).set(fields).where(eq(professionalsTable.id, existing.id));
    professionalId = existing.id;
  } else {
    const [created] = await db
      .insert(professionalsTable)
      .values({ name: opts.name, ...fields })
      .returning();
    professionalId = created.id;
  }

  const locationId = await ensureLocation(opts.locationName, opts.locationAddress);
  await ensureResource(opts.presentialResourceName, opts.resourceKind, "local", professionalId, locationId);
  await ensureResource(opts.onlineResourceName, opts.resourceKind, "online", professionalId, null);
}

export async function runSeedTeam(log: SeedLog = noopLog): Promise<void> {
  // 1. AREAS
  const medicinaId = await upsertArea("Medicina", "medico", 1);
  const enfermagemId = await upsertArea("Enfermagem", "nao_medico", 2);
  const psicologiaId = await upsertArea("Psicologia", "nao_medico", 3);
  const nutricaoId = await upsertArea("Nutrição", "nao_medico", 4);
  log("Áreas garantidas (Medicina, Enfermagem, Psicologia, Nutrição).");

  // 2. ESPECIALIZACOES
  const med = {
    integrativa: await upsertSpecialty(medicinaId, "Integrativa", 1),
    cardiologia: await upsertSpecialty(medicinaId, "Cardiologia", 2),
    endocrinologia: await upsertSpecialty(medicinaId, "Endocrinologia", 3),
    clinica: await upsertSpecialty(medicinaId, "Clínica Médica", 4),
    dermatologia: await upsertSpecialty(medicinaId, "Dermatologia", 5),
  };
  const enf = {
    integrativa: await upsertSpecialty(enfermagemId, "Integrativa", 1),
    estetica: await upsertSpecialty(enfermagemId, "Estética", 2),
    domiciliar: await upsertSpecialty(enfermagemId, "Domiciliar", 3),
  };
  const psi = {
    psicossomatica: await upsertSpecialty(psicologiaId, "Psicossomática", 1),
    clinica: await upsertSpecialty(psicologiaId, "Clínica", 2),
    comportamental: await upsertSpecialty(psicologiaId, "Comportamental", 3),
  };
  const nut = {
    esportiva: await upsertSpecialty(nutricaoId, "Esportiva", 1),
    clinica: await upsertSpecialty(nutricaoId, "Clínica", 2),
    funcional: await upsertSpecialty(nutricaoId, "Funcional", 3),
  };
  log("Especializações garantidas para as 4 áreas.");

  // 3. MEDICOS — Dr. Caio (id 6, primario) + substituicao de Bruno/Helena por UPDATE.
  await db
    .update(professionalsTable)
    .set({
      professionalType: "medico",
      category: "medico",
      areaId: medicinaId,
      specialtyId: med.endocrinologia,
      registrationCouncil: "CRM",
      registrationNumber: "SP 123456",
      crm: "CRM SP 123456",
      specialty: "Endocrinologia",
      isPrimaryDoctor: true,
      active: true,
    })
    .where(eq(professionalsTable.id, 6));

  await db
    .update(professionalsTable)
    .set({
      name: "Dr. Kleber Lemos",
      professionalType: "medico",
      category: "medico",
      areaId: medicinaId,
      specialtyId: med.integrativa,
      registrationCouncil: "CRM",
      registrationNumber: "SP 234567",
      crm: "CRM SP 234567",
      specialty: "Integrativa",
      isPrimaryDoctor: false,
      active: true,
    })
    .where(eq(professionalsTable.id, 7));

  await db
    .update(professionalsTable)
    .set({
      name: "Dra. Fernanda Manzieri",
      professionalType: "medico",
      category: "medico",
      areaId: medicinaId,
      specialtyId: med.cardiologia,
      registrationCouncil: "CRM",
      registrationNumber: "SP 345678",
      crm: "CRM SP 345678",
      specialty: "Cardiologia",
      isPrimaryDoctor: false,
      active: true,
    })
    .where(eq(professionalsTable.id, 8));
  log("Médicos atualizados: Dr. Caio (Endocrinologia), Dr. Kleber Lemos (Integrativa), Dra. Fernanda Manzieri (Cardiologia).");

  // Renomeia recursos/locais herdados de Bruno/Helena para os novos medicos
  // (preserva ids, agendas e janelas — substituicao, nunca apagar+recriar).
  await db.update(agendaResourcesTable).set({ name: "Dr. Kleber Lemos — Presencial (Pinheiros)" }).where(eq(agendaResourcesTable.id, 9));
  await db.update(agendaResourcesTable).set({ name: "Dr. Kleber Lemos — Online" }).where(eq(agendaResourcesTable.id, 10));
  await db.update(agendaResourcesTable).set({ name: "Dra. Fernanda Manzieri — Presencial (Moema)" }).where(eq(agendaResourcesTable.id, 11));
  await db.update(agendaResourcesTable).set({ name: "Dra. Fernanda Manzieri — Online" }).where(eq(agendaResourcesTable.id, 12));
  await db.update(locationsTable).set({ name: "Consultório Dr. Kleber Lemos — Pinheiros" }).where(eq(locationsTable.id, 16));
  await db.update(locationsTable).set({ name: "Consultório Dra. Fernanda Manzieri — Moema" }).where(eq(locationsTable.id, 17));

  // 6. LEGADO interno (Ana 1, Carlos 2, Fernanda 3): nao_medico, Enfermagem +
  // especializacao, registro ficticio. Sem agenda -> nao aparecem ao paciente.
  await db
    .update(professionalsTable)
    .set({
      professionalType: "nao_medico",
      category: "enfermagem",
      areaId: enfermagemId,
      specialtyId: enf.domiciliar,
      registrationCouncil: "COREN",
      registrationNumber: "SP 100001",
      crm: "COREN SP 100001",
      specialty: "Domiciliar",
      isPrimaryDoctor: false,
    })
    .where(eq(professionalsTable.id, 1));
  await db
    .update(professionalsTable)
    .set({
      professionalType: "nao_medico",
      category: "enfermagem",
      areaId: enfermagemId,
      specialtyId: enf.estetica,
      registrationCouncil: "COREN",
      registrationNumber: "SP 100002",
      crm: "COREN SP 100002",
      specialty: "Estética",
      isPrimaryDoctor: false,
    })
    .where(eq(professionalsTable.id, 2));
  await db
    .update(professionalsTable)
    .set({
      professionalType: "nao_medico",
      category: "enfermagem",
      areaId: enfermagemId,
      specialtyId: enf.integrativa,
      registrationCouncil: "COREN",
      registrationNumber: "SP 100003",
      crm: "COREN SP 100003",
      specialty: "Integrativa",
      isPrimaryDoctor: false,
    })
    .where(eq(professionalsTable.id, 3));
  log("Legado interno (Ana, Carlos, Fernanda) preenchido como nao_medico/Enfermagem (sem agenda).");

  // 4. NAO-MEDICOS novos: agenda presencial (endereco ficticio) + online + janelas.
  await ensureNonDoctor({
    name: "Enf. Mariana Prado",
    areaId: enfermagemId,
    specialtyId: enf.integrativa,
    council: "COREN",
    registrationNumber: "SP 456789",
    resourceKind: "enfermagem",
    presentialResourceName: "Enf. Mariana Prado — Presencial (Tatuapé)",
    onlineResourceName: "Enf. Mariana Prado — Online",
    locationName: "Consultório Enf. Mariana Prado — Tatuapé",
    locationAddress: "Rua Tuiuti, 1500, Tatuapé, São Paulo - SP, CEP 03307-000",
  });
  await ensureNonDoctor({
    name: "Psic. Rafael Toledo",
    areaId: psicologiaId,
    specialtyId: psi.psicossomatica,
    council: "CRP",
    registrationNumber: "06/567890",
    resourceKind: "psicologia",
    presentialResourceName: "Psic. Rafael Toledo — Presencial (Pinheiros)",
    onlineResourceName: "Psic. Rafael Toledo — Online",
    locationName: "Consultório Psic. Rafael Toledo — Pinheiros",
    locationAddress: "Rua dos Pinheiros, 800, Pinheiros, São Paulo - SP, CEP 05422-001",
  });
  await ensureNonDoctor({
    name: "Nutr. Camila Esteves",
    areaId: nutricaoId,
    specialtyId: nut.esportiva,
    council: "CRN",
    registrationNumber: "3/67890",
    resourceKind: "nutricao",
    presentialResourceName: "Nutr. Camila Esteves — Presencial (Moema)",
    onlineResourceName: "Nutr. Camila Esteves — Online",
    locationName: "Consultório Nutr. Camila Esteves — Moema",
    locationAddress: "Alameda dos Anapurus, 1200, Moema, São Paulo - SP, CEP 04087-005",
  });
  log("Não-médicos criados: Enf. Mariana Prado, Psic. Rafael Toledo, Nutr. Camila Esteves (presencial + online).");

  log("Seed da equipe concluído.");
}

// Runner direto: tsx src/lib/seed-team.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeedTeam((m) => console.log(m))
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
