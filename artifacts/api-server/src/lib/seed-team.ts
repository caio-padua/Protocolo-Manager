import {
  db,
  professionalsTable,
  professionalAreasTable,
  professionalSpecialtiesTable,
  agendaResourcesTable,
  agendaWindowsTable,
  locationsTable,
  locationProfessionalsTable,
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

// Colaborador administrativo (recepcao/administrativo/financeiro): nao_medico,
// SEM conselho e SEM recurso de agenda -> nunca aparece ao cliente. Idempotente
// por nome. Guarda category + role (cargo) para a identidade "Sobrenome, Nome (Cargo)".
async function ensureNonAgendaStaff(opts: {
  name: string;
  category: string;
  role: string;
  areaId: number;
  specialtyId: number;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.name, opts.name))
    .limit(1);

  const fields = {
    category: opts.category,
    role: opts.role,
    professionalType: "nao_medico",
    areaId: opts.areaId,
    specialtyId: opts.specialtyId,
    registrationCouncil: null,
    registrationNumber: null,
    crm: null,
    specialty: null,
    isPrimaryDoctor: false,
    active: true,
    serviceTypes: [] as string[],
  };

  if (existing) {
    await db.update(professionalsTable).set(fields).where(eq(professionalsTable.id, existing.id));
  } else {
    await db.insert(professionalsTable).values({ name: opts.name, ...fields });
  }
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

// Cria (idempotente, por nome) uma enfermeira com campos Home Nurse e vínculo
// com clínicas via location_professionals.
async function ensureNurse(opts: {
  name: string;
  areaId: number;
  specialtyId: number;
  registrationNumber: string;
  nurseType: "fisica" | "home";
  cpf: string;
  cnpj?: string;
  homeServiceFeePerVisit?: number;
  contractType: "clt" | "pj" | "mei";
  locationIds: number[];       // clínicas vinculadas
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.name, opts.name))
    .limit(1);

  const fields = {
    category: "enfermagem" as const,
    professionalType: "nao_medico",
    areaId: opts.areaId,
    specialtyId: opts.specialtyId,
    registrationCouncil: "COREN",
    registrationNumber: opts.registrationNumber,
    crm: `COREN ${opts.registrationNumber}`,
    specialty: "Enfermagem",
    isPrimaryDoctor: false,
    active: true,
    serviceTypes: opts.nurseType === "home" ? ["home", "presencial"] : ["presencial"],
    nurseType: opts.nurseType,
    cpf: opts.cpf,
    cnpj: opts.cnpj ?? null,
    homeServiceFeePerVisit: opts.homeServiceFeePerVisit ?? null,
    contractType: opts.contractType,
  };

  let professionalId: number;
  if (existing) {
    await db.update(professionalsTable).set(fields).where(eq(professionalsTable.id, existing.id));
    professionalId = existing.id;
  } else {
    const [created] = await db.insert(professionalsTable).values({ name: opts.name, ...fields }).returning();
    professionalId = created.id;
  }

  // Vínculos com clínicas (idempotente via onConflictDoNothing com índice único).
  for (const locationId of opts.locationIds) {
    const [lp] = await db
      .select()
      .from(locationProfessionalsTable)
      .where(
        and(
          eq(locationProfessionalsTable.professionalId, professionalId),
          eq(locationProfessionalsTable.locationId, locationId),
        ),
      )
      .limit(1);
    if (!lp) {
      await db.insert(locationProfessionalsTable).values({
        professionalId,
        locationId,
        role: "enfermagem",
      });
    }
  }
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
  const recepcaoId = await upsertArea("Recepção", "nao_medico", 5);
  const administrativoId = await upsertArea("Administrativo", "nao_medico", 6);
  const financeiroId = await upsertArea("Financeiro", "nao_medico", 7);
  log("Áreas garantidas (Medicina, Enfermagem, Psicologia, Nutrição, Recepção, Administrativo, Financeiro).");

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
  const recepcaoAtendimentoId = await upsertSpecialty(recepcaoId, "Atendimento", 1);
  const administrativoGestaoId = await upsertSpecialty(administrativoId, "Gestão", 1);
  const financeiroContasId = await upsertSpecialty(financeiroId, "Contas a Receber", 1);
  log("Especializações garantidas para as 7 áreas.");

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

  // 4-B. ENFERMEIRAS Home Nurse (seed ficcional — CEO substitui depois).
  // Busca ids das 3 clínicas-base para vincular as itinerantes.
  const [tatuape] = await db.select({ id: locationsTable.id }).from(locationsTable).where(eq(locationsTable.name, "Clínica Tatuapé")).limit(1);
  const [mooca]   = await db.select({ id: locationsTable.id }).from(locationsTable).where(eq(locationsTable.name, "Clínica Mooca")).limit(1);
  const [nurseCare] = await db.select({ id: locationsTable.id }).from(locationsTable).where(eq(locationsTable.name, "Nurse Care Domiciliar")).limit(1);

  const tatuapeId   = tatuape?.id   ?? 1;
  const moocaId     = mooca?.id     ?? 2;
  const nurseCareId = nurseCare?.id ?? 3;

  // Fernanda Lima — Física, fixa na Tatuapé, CLT
  await ensureNurse({
    name: "Enf. Fernanda Lima",
    areaId: enfermagemId,
    specialtyId: enf.estetica,
    registrationNumber: "SP 111001",
    nurseType: "fisica",
    cpf: "111.222.333-01",
    contractType: "clt",
    locationIds: [tatuapeId],
  });

  // Carla Menezes — Física, fixa na Mooca, CLT
  await ensureNurse({
    name: "Enf. Carla Menezes",
    areaId: enfermagemId,
    specialtyId: enf.integrativa,
    registrationNumber: "SP 111002",
    nurseType: "fisica",
    cpf: "222.333.444-02",
    contractType: "clt",
    locationIds: [moocaId],
  });

  // Juliana Torres — Home/Itinerante, MEI, taxa R$ 250/visita, vinculada a 3 clínicas
  await ensureNurse({
    name: "Enf. Juliana Torres",
    areaId: enfermagemId,
    specialtyId: enf.domiciliar,
    registrationNumber: "SP 111003",
    nurseType: "home",
    cpf: "333.444.555-03",
    cnpj: "33.444.555/0001-03",
    homeServiceFeePerVisit: 250,
    contractType: "mei",
    locationIds: [tatuapeId, moocaId, nurseCareId],
  });

  // Ana Beatriz — Home/Itinerante, PJ, taxa R$ 300/visita, vinculada a todas
  await ensureNurse({
    name: "Enf. Ana Beatriz",
    areaId: enfermagemId,
    specialtyId: enf.domiciliar,
    registrationNumber: "SP 111004",
    nurseType: "home",
    cpf: "444.555.666-04",
    cnpj: "44.555.666/0001-04",
    homeServiceFeePerVisit: 300,
    contractType: "pj",
    locationIds: [tatuapeId, moocaId, nurseCareId],
  });

  log("Enfermeiras criadas: Fernanda Lima (física/Tatuapé), Carla Menezes (física/Mooca), Juliana Torres (home/MEI), Ana Beatriz (home/PJ).");

  // 5. ADMINISTRATIVO (recepcao/administrativo/financeiro): sem agenda, sem
  // conselho. Cargos ficticios prontos — o CEO so troca os nomes.
  await ensureNonAgendaStaff({
    name: "Recep. Beatriz Nunes",
    category: "recepcao",
    role: "Recepcionista",
    areaId: recepcaoId,
    specialtyId: recepcaoAtendimentoId,
  });
  await ensureNonAgendaStaff({
    name: "Adm. Otávio Ramos",
    category: "administrativo",
    role: "Gerente Administrativo",
    areaId: administrativoId,
    specialtyId: administrativoGestaoId,
  });
  await ensureNonAgendaStaff({
    name: "Fin. Larissa Coelho",
    category: "financeiro",
    role: "Analista Financeiro",
    areaId: financeiroId,
    specialtyId: financeiroContasId,
  });
  log("Administrativo criado: Recep. Beatriz Nunes, Adm. Otávio Ramos, Fin. Larissa Coelho (sem agenda).");

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
