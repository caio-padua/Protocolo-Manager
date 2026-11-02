import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { randomUUID } from "node:crypto";
import { db, professionalsTable, locationProfessionalsTable, locationsTable, agendaCalendarsTable, professionalAreasTable, professionalSpecialtiesTable } from "@workspace/db";
import { CreateProfessionalBody } from "@workspace/api-zod";
import { eq, and, inArray, isNull, or, sql } from "drizzle-orm";
import {
  isValidCpf,
  normalizeCpf,
  recordProfessionalProfileChange,
  getVerifiedGoogleEmail,
  requireCollaborator,
} from "./collaborator.js";
import { requirePlatformOwner } from "../middleware/tenantContext.js";
import { resolveClerkEnvironmentForRequest } from "../lib/clerk-environment.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router: IRouter = Router();

const CATEGORIES = ["medico", "enfermagem", "recepcao", "administrativo", "financeiro", "outro"] as const;
const DEFAULT_COMPANY_ID = 5;
type Category = (typeof CATEGORIES)[number];

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "23505";
}

function parseRouteId(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function normalizeCategory(raw: unknown): Category {
  const s = String(raw ?? "").trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(s) ? (s as Category) : "outro";
}

function formatProfessional(
  p: typeof professionalsTable.$inferSelect,
  areaNames?: Map<number, string>,
  specialtyNames?: Map<number, string>,
  includePrivate = false,
) {
  const safe = { ...p };
  delete (safe as Partial<typeof p>).passwordHash;
  delete (safe as Partial<typeof p>).clerkUserIdDev;
  delete (safe as Partial<typeof p>).clerkUserIdProd;
  delete (safe as Partial<typeof p>).loginUsername;
  delete (safe as Partial<typeof p>).credentialVersion;
  delete (safe as Partial<typeof p>).isPlatformOwner;
  delete (safe as Partial<typeof p>).empresaId;
  if (!includePrivate) {
    delete (safe as Partial<typeof p>).email;
    delete (safe as Partial<typeof p>).secondaryEmail;
    delete (safe as Partial<typeof p>).phone;
    delete (safe as Partial<typeof p>).cpf;
    delete (safe as Partial<typeof p>).cnpj;
    delete (safe as Partial<typeof p>).homeServiceFeePerVisit;
    delete (safe as Partial<typeof p>).contractType;
    delete (safe as Partial<typeof p>).signatureUrl;
  }

  return {
    ...safe,
    crm: p.crm ?? null,
    specialty: p.specialty ?? null,
    unit: p.unit ?? null,
    serviceTypes: p.serviceTypes ?? ["clinic"],
    category: p.category ?? "outro",
    professionalType: p.professionalType ?? "medico",
    areaId: p.areaId ?? null,
    specialtyId: p.specialtyId ?? null,
    registrationCouncil: p.registrationCouncil ?? null,
    registrationNumber: p.registrationNumber ?? null,
    active: p.active,
    isPrimaryDoctor: p.isPrimaryDoctor,
    areaName: p.areaId != null ? (areaNames?.get(p.areaId) ?? null) : null,
    specialtyName: p.specialtyId != null ? (specialtyNames?.get(p.specialtyId) ?? null) : null,
    // Campos de enfermagem
    nurseType: p.nurseType ?? null,
    createdAt: p.createdAt.toISOString(),
    ...(includePrivate
      ? {
          email: p.email ?? null,
          phone: p.phone ?? null,
          cpf: p.cpf ?? null,
          cnpj: p.cnpj ?? null,
          homeServiceFeePerVisit: p.homeServiceFeePerVisit ?? null,
          contractType: p.contractType ?? null,
        }
      : {}),
  };
}

async function professionalIdsForCompany(empresaId: number): Promise<number[]> {
  const [direct, linked] = await Promise.all([
    db
      .select({ id: professionalsTable.id })
      .from(professionalsTable)
      .where(eq(professionalsTable.empresaId, empresaId)),
    db
      .select({ id: locationProfessionalsTable.professionalId })
      .from(locationProfessionalsTable)
      .innerJoin(locationsTable, eq(locationProfessionalsTable.locationId, locationsTable.id))
      .where(locationCompanyCondition(empresaId)),
  ]);
  return [...new Set([...direct.map((row) => row.id), ...linked.map((row) => row.id)])];
}

function locationCompanyCondition(empresaId: number) {
  // locations.empresa_id NULL is the documented legacy/default clinic.
  return empresaId === DEFAULT_COMPANY_ID
    ? or(eq(locationsTable.empresaId, empresaId), isNull(locationsTable.empresaId))
    : eq(locationsTable.empresaId, empresaId);
}

async function belongsToRequestCompany(req: Request, professionalId: number): Promise<boolean> {
  const empresaId = req.tenantContext?.empresaId;
  if (!Number.isInteger(empresaId) || empresaId <= 0) return false;
  const allowedIds = await professionalIdsForCompany(empresaId);
  return allowedIds.includes(professionalId);
}

async function locationBelongsToRequestCompany(req: Request, locationId: number): Promise<boolean> {
  const empresaId = req.tenantContext?.empresaId;
  if (!Number.isInteger(empresaId) || empresaId <= 0) return false;
  const [location] = await db
    .select({ id: locationsTable.id })
    .from(locationsTable)
    .where(and(eq(locationsTable.id, locationId), locationCompanyCondition(empresaId)))
    .limit(1);
  return Boolean(location);
}

// Mapas id->nome do catalogo, para enriquecer a resposta sem N+1.
async function loadTaxonomyNames(): Promise<{ areas: Map<number, string>; specialties: Map<number, string> }> {
  const [areas, specialties] = await Promise.all([
    db.select({ id: professionalAreasTable.id, name: professionalAreasTable.name }).from(professionalAreasTable),
    db.select({ id: professionalSpecialtiesTable.id, name: professionalSpecialtiesTable.name }).from(professionalSpecialtiesTable),
  ]);
  return {
    areas: new Map(areas.map((a) => [a.id, a.name])),
    specialties: new Map(specialties.map((s) => [s.id, s.name])),
  };
}

router.get("/professionals", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = req.tenantContext?.empresaId;
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    res.status(403).json({ error: "Acesso à clínica não autorizado" });
    return;
  }
  const ids = await professionalIdsForCompany(empresaId);
  const professionals: (typeof professionalsTable.$inferSelect)[] = ids.length
    ? await db.select().from(professionalsTable).where(inArray(professionalsTable.id, ids))
    : [];
  const names = await loadTaxonomyNames();
  const includePrivate = req.tenantContext?.isPlatformOwner === true;
  const visible = includePrivate ? professionals : professionals.filter((p) => p.active);
  res.json(visible.map((p) => formatProfessional(p, names.areas, names.specialties, includePrivate)));
});

// PATCH /api/professionals/primary-doctor — atualiza nome/CRM/especialidade do
// médico principal (isPrimaryDoctor=true). Protegido por colaborador: o ator
// autenticado precisa ser exatamente o médico principal; qualquer outro colaborador
// recebe 403.
router.patch(
  "/professionals/primary-doctor",
  requireCollaborator,
  async (req, res): Promise<void> => {
    const actorId = req.collaborator!.professionalId;

    // Confirma que o ator é o médico principal — consulta o banco, nunca confia
    // apenas na claim do token.
    const [actor] = await db
      .select()
      .from(professionalsTable)
      .where(eq(professionalsTable.id, actorId))
      .limit(1);

    if (!actor?.isPrimaryDoctor) {
      res.status(403).json({ error: "Apenas o médico principal pode alterar estes dados" });
      return;
    }

    const { name, crm, specialty } = req.body as {
      name?: string;
      crm?: string | null;
      specialty?: string | null;
    };

    if (name !== undefined && !String(name).trim()) {
      res.status(400).json({ error: "Nome não pode ficar vazio" });
      return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(professionalsTable)
        .where(eq(professionalsTable.id, actor.id))
        .for("update")
        .limit(1);
      if (!current?.isPrimaryDoctor) return [undefined];
      const [saved] = await tx
        .update(professionalsTable)
        .set({
          ...(name !== undefined ? { name: String(name).trim() } : {}),
          ...(crm !== undefined ? { crm: crm ?? null } : {}),
          ...(specialty !== undefined ? { specialty: specialty ?? null } : {}),
        })
        .where(eq(professionalsTable.id, actor.id))
        .returning();
      if (saved) await recordProfessionalProfileChange(tx, req, current, saved);
      return [saved];
    });

    if (!updated) {
      res.status(409).json({ error: "O cadastro profissional mudou durante a operação." });
      return;
    }
    res.json(formatProfessional(updated));
  },
);

// GET /api/professionals/:id — busca um profissional por ID
router.get("/professionals/:id", requireCollaborator, async (req, res): Promise<void> => {
  const id = parseRouteId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  if (!await belongsToRequestCompany(req, id)) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const [professional] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!professional || (!req.tenantContext?.isPlatformOwner && !professional.active)) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const names = await loadTaxonomyNames();
  res.json(formatProfessional(professional, names.areas, names.specialties, req.tenantContext?.isPlatformOwner === true));
});

// ---- Catalogo de areas e especializacoes (somente leitura) ----

router.get("/professional-areas", async (req, res): Promise<void> => {
  const professionalType =
    typeof req.query.professionalType === "string" && req.query.professionalType
      ? req.query.professionalType
      : undefined;
  const rows = professionalType
    ? await db
        .select()
        .from(professionalAreasTable)
        .where(and(eq(professionalAreasTable.active, true), eq(professionalAreasTable.professionalType, professionalType)))
    : await db.select().from(professionalAreasTable).where(eq(professionalAreasTable.active, true));
  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  res.json(rows);
});

router.get("/professional-specialties", async (req, res): Promise<void> => {
  const areaId =
    typeof req.query.areaId === "string" && req.query.areaId ? parseInt(req.query.areaId) : undefined;
  const rows =
    areaId !== undefined && !Number.isNaN(areaId)
      ? await db
          .select()
          .from(professionalSpecialtiesTable)
          .where(and(eq(professionalSpecialtiesTable.active, true), eq(professionalSpecialtiesTable.areaId, areaId)))
      : await db.select().from(professionalSpecialtiesTable).where(eq(professionalSpecialtiesTable.active, true));
  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  res.json(rows.map((r) => ({ ...r, slug: r.slug ?? null })));
});

router.post("/professionals", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  // Categoria fora da lista -> 400 (caso extremo 4).
  if (req.body?.category !== undefined && req.body?.category !== null) {
    const s = String(req.body.category).trim().toLowerCase();
    if (!(CATEGORIES as readonly string[]).includes(s)) {
      res.status(400).json({ error: `Categoria inválida. Use uma de: ${CATEGORIES.join(", ")}` });
      return;
    }
  }
  const requestedPrimaryEmail = req.body?.email;
  if (typeof requestedPrimaryEmail !== "string" || !requestedPrimaryEmail.trim()) {
    res.status(400).json({ error: "E-mail principal é obrigatório para cadastrar um profissional." });
    return;
  }
  const parsed = CreateProfessionalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const emailValue = parsed.data.email;
  const normalizedEmail =
    emailValue == null || !emailValue.trim() ? null : emailValue.trim().toLowerCase();
  if (!normalizedEmail) {
    res.status(400).json({ error: "E-mail principal é obrigatório para cadastrar um profissional." });
    return;
  }
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: "E-mail inválido" });
    return;
  }
  const secondaryEmailValue =
    typeof req.body?.secondaryEmail === "string" ? req.body.secondaryEmail : null;
  const normalizedSecondaryEmail =
    secondaryEmailValue == null || !secondaryEmailValue.trim()
      ? null
      : secondaryEmailValue.trim().toLowerCase();
  if (
    normalizedSecondaryEmail &&
    (normalizedSecondaryEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedSecondaryEmail))
  ) {
    res.status(400).json({ error: "E-mail secundário inválido" });
    return;
  }
  const cpfValue = parsed.data.cpf;
  const normalizedCpf = cpfValue == null || !cpfValue.trim() ? null : normalizeCpf(cpfValue);
  if (normalizedCpf && !isValidCpf(normalizedCpf)) {
    res.status(400).json({ error: "CPF inválido" });
    return;
  }

  const values = {
    ...parsed.data,
    email: normalizedEmail,
    secondaryEmail: normalizedSecondaryEmail,
    cpf: normalizedCpf,
    category: normalizeCategory(parsed.data.category),
    role: parsed.data.role ?? "executor",
    professionalType: parsed.data.professionalType ?? "medico",
    active: parsed.data.active ?? true,
    empresaId: req.tenantContext!.empresaId,
    isPlatformOwner: false,
    credentialVersion: 0,
    ...(parsed.data.professionalType !== undefined && parsed.data.professionalType !== null
      ? { professionalType: String(parsed.data.professionalType) }
      : {}),
  };
  let professional: typeof professionalsTable.$inferSelect | undefined;
  try {
    [professional] = await db.insert(professionalsTable).values(values).returning();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "E-mail ou CPF já está vinculado a outro cadastro." });
      return;
    }
    throw error;
  }
  if (!professional) {
    res.status(500).json({ error: "Não foi possível salvar o profissional." });
    return;
  }
  const names = await loadTaxonomyNames();
  res.status(201).json(formatProfessional(professional, names.areas, names.specialties, true));
});

router.put("/professionals/:id", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const id = parseRouteId(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  if (!await belongsToRequestCompany(req, id)) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }

  const {
    name, crm, specialty, email, secondaryEmail, phone, unit, complemento, serviceTypes, category, role, active,
    professionalType, areaId, specialtyId, registrationCouncil, registrationNumber,
    nurseType, cpf, cnpj, homeServiceFeePerVisit, contractType,
  } = req.body as {
    name?: string;
    crm?: string | null;
    specialty?: string | null;
    email?: string | null;
    secondaryEmail?: string | null;
    phone?: string | null;
    unit?: string | null;
    complemento?: string | null;
    serviceTypes?: string[];
    category?: string;
    role?: string;
    active?: boolean;
    professionalType?: string | null;
    areaId?: number | null;
    specialtyId?: number | null;
    registrationCouncil?: string | null;
    registrationNumber?: string | null;
    nurseType?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    homeServiceFeePerVisit?: number | null;
    contractType?: string | null;
  };

  if (name !== undefined && !String(name).trim()) {
    res.status(400).json({ error: "Nome não pode ficar vazio" });
    return;
  }
  if (category !== undefined && category !== null) {
    const s = String(category).trim().toLowerCase();
    if (!(CATEGORIES as readonly string[]).includes(s)) {
      res.status(400).json({ error: `Categoria inválida. Use uma de: ${CATEGORIES.join(", ")}` });
      return;
    }
  }

  // Integridade do catálogo: área/especialização precisam existir e ser compatíveis.
  let areaRow: typeof professionalAreasTable.$inferSelect | undefined;
  if (areaId !== undefined && areaId !== null) {
    [areaRow] = await db.select().from(professionalAreasTable).where(eq(professionalAreasTable.id, Number(areaId)));
    if (!areaRow) {
      res.status(400).json({ error: "Área inexistente" });
      return;
    }
  }
  if (specialtyId !== undefined && specialtyId !== null) {
    const [spec] = await db
      .select()
      .from(professionalSpecialtiesTable)
      .where(eq(professionalSpecialtiesTable.id, Number(specialtyId)));
    if (!spec) {
      res.status(400).json({ error: "Especialização inexistente" });
      return;
    }
    // A especialização deve pertencer à área enviada (ou à área atual, se a área não mudou).
    const targetAreaId = areaId !== undefined && areaId !== null ? Number(areaId) : row.areaId;
    if (targetAreaId != null && spec.areaId !== targetAreaId) {
      res.status(400).json({ error: "Especialização não pertence à área informada" });
      return;
    }
  }

  const normalizedEmail =
    email === undefined ? undefined : email === null || !email.trim() ? null : email.trim().toLowerCase();
  if (normalizedEmail === null && row.email) {
    res.status(400).json({ error: "O e-mail principal existente não pode ser removido; altere-o para outro endereço." });
    return;
  }
  if (normalizedEmail && normalizedEmail.length > 254) {
    res.status(400).json({ error: "E-mail inválido" });
    return;
  }
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: "E-mail inválido" });
    return;
  }
  const normalizedSecondaryEmail =
    secondaryEmail === undefined
      ? undefined
      : secondaryEmail === null || !secondaryEmail.trim()
        ? null
        : secondaryEmail.trim().toLowerCase();
  if (
    normalizedSecondaryEmail &&
    (normalizedSecondaryEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedSecondaryEmail))
  ) {
    res.status(400).json({ error: "E-mail secundário inválido" });
    return;
  }
  if (normalizedEmail !== undefined && normalizedEmail !== row.email) {
    const environment = resolveClerkEnvironmentForRequest(req);
    const linkedGoogleUserId = environment === "production"
      ? row.clerkUserIdProd
      : environment === "development"
        ? row.clerkUserIdDev
        : null;
    if (linkedGoogleUserId) {
      let googleEmail: string | null;
      try {
        googleEmail = await getVerifiedGoogleEmail(linkedGoogleUserId);
      } catch {
        res.status(503).json({ error: "Não foi possível confirmar o e-mail Google agora." });
        return;
      }
      if (googleEmail !== normalizedEmail) {
        res.status(409).json({
          error: "O e-mail principal precisa coincidir com o e-mail Google confirmado.",
        });
        return;
      }
    }
  }
  const normalizedCpf = cpf === undefined ? undefined : cpf === null || !cpf.trim() ? null : normalizeCpf(cpf);
  if (normalizedCpf && !isValidCpf(normalizedCpf)) {
    res.status(400).json({ error: "CPF inválido" });
    return;
  }
  const credentialChanged =
    (normalizedEmail !== undefined && normalizedEmail !== row.email) ||
    (normalizedCpf !== undefined && normalizedCpf !== row.cpf) ||
    (active === false && row.active);
  let updated: typeof professionalsTable.$inferSelect | undefined;
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(professionalsTable)
        .where(eq(professionalsTable.id, id))
        .for("update")
        .limit(1);
      if (!current) return;
      [updated] = await tx
        .update(professionalsTable)
        .set({
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(crm !== undefined ? { crm } : {}),
      ...(specialty !== undefined ? { specialty } : {}),
      ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
      ...(normalizedSecondaryEmail !== undefined
        ? { secondaryEmail: normalizedSecondaryEmail }
        : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(complemento !== undefined ? { complemento } : {}),
      ...(serviceTypes !== undefined ? { serviceTypes } : {}),
      ...(category !== undefined ? { category: normalizeCategory(category) } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
      ...(professionalType !== undefined && professionalType !== null
        ? { professionalType: String(professionalType) }
        : {}),
      ...(areaId !== undefined ? { areaId: areaId === null ? null : Number(areaId) } : {}),
      ...(specialtyId !== undefined ? { specialtyId: specialtyId === null ? null : Number(specialtyId) } : {}),
      ...(registrationCouncil !== undefined ? { registrationCouncil } : {}),
      ...(registrationNumber !== undefined ? { registrationNumber } : {}),
      ...(nurseType !== undefined ? { nurseType } : {}),
      ...(normalizedCpf !== undefined ? { cpf: normalizedCpf } : {}),
      ...(cnpj !== undefined ? { cnpj } : {}),
      ...(homeServiceFeePerVisit !== undefined ? { homeServiceFeePerVisit } : {}),
      ...(contractType !== undefined ? { contractType } : {}),
      ...(credentialChanged
        ? { credentialVersion: sql`${professionalsTable.credentialVersion} + 1` }
        : {}),
        })
        .where(eq(professionalsTable.id, id))
        .returning();
      if (updated) await recordProfessionalProfileChange(tx, req, current, updated);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: "E-mail ou CPF já está vinculado a outro cadastro." });
      return;
    }
    throw error;
  }
  if (!updated) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const names = await loadTaxonomyNames();
  res.json(formatProfessional(updated, names.areas, names.specialties, true));
});

router.delete("/professionals/:id", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const id = parseRouteId(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  if (!await belongsToRequestCompany(req, id)) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }

  await db
    .update(professionalsTable)
    .set({
      active: false,
      credentialVersion: sql`${professionalsTable.credentialVersion} + 1`,
    })
    .where(eq(professionalsTable.id, id));
  res.json({ success: true, deactivated: true, message: "Profissional desativado; histórico preservado." });
});

// ---- Vínculos profissional <-> clínica <-> agenda Google (location_professionals) ----

router.get("/professionals/:id/locations", requireCollaborator, async (req, res): Promise<void> => {
  const id = parseRouteId(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  if (!await belongsToRequestCompany(req, id)) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const empresaId = req.tenantContext?.empresaId;
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    res.status(403).json({ error: "Acesso à clínica não autorizado" });
    return;
  }
  const links = await db
    .select({
      id: locationProfessionalsTable.id,
      locationId: locationProfessionalsTable.locationId,
      professionalId: locationProfessionalsTable.professionalId,
      role: locationProfessionalsTable.role,
      agendaCalendarId: locationProfessionalsTable.agendaCalendarId,
    })
    .from(locationProfessionalsTable)
    .innerJoin(locationsTable, eq(locationProfessionalsTable.locationId, locationsTable.id))
    .where(and(
      eq(locationProfessionalsTable.professionalId, id),
      locationCompanyCondition(empresaId),
    ));
  res.json(
    links.map((l) => ({
      id: l.id,
      locationId: l.locationId,
      professionalId: l.professionalId,
      role: l.role,
      agendaCalendarId: l.agendaCalendarId ?? null,
    })),
  );
});

// Cria ou atualiza o vínculo (par profissional+clínica), incluindo a agenda Google preferida.
router.post("/professionals/:id/locations", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const professionalId = parseRouteId(req.params.id);
  if (isNaN(professionalId)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  if (!await belongsToRequestCompany(req, professionalId)) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const { locationId, agendaCalendarId, role } = req.body as {
    locationId?: number;
    agendaCalendarId?: number | null;
    role?: string;
  };
  if (typeof locationId !== "number") {
    res.status(400).json({ error: "locationId é obrigatório" });
    return;
  }

  // Integridade do vínculo (SUB-03 architect, achado HIGH):
  // profissional e clínica devem existir; a agenda escolhida deve existir,
  // estar ativa e pertencer à MESMA clínica (ou ser global, locationId=null),
  // senão o evento da sessão cairia no calendário de outra clínica.
  const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, professionalId));
  if (!prof) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
  if (!loc) {
    res.status(404).json({ error: "Clínica não encontrada" });
    return;
  }
  if (!await locationBelongsToRequestCompany(req, locationId)) {
    res.status(404).json({ error: "Clínica não encontrada" });
    return;
  }
  if (agendaCalendarId !== undefined && agendaCalendarId !== null) {
    const [cal] = await db.select().from(agendaCalendarsTable).where(eq(agendaCalendarsTable.id, agendaCalendarId));
    if (!cal) {
      res.status(404).json({ error: "Agenda não encontrada" });
      return;
    }
    if (!cal.active) {
      res.status(400).json({ error: "Agenda está inativa" });
      return;
    }
    if (cal.locationId !== null && cal.locationId !== locationId) {
      res.status(400).json({ error: "A agenda escolhida pertence a outra clínica" });
      return;
    }
  }

  const [existing] = await db
    .select()
    .from(locationProfessionalsTable)
    .where(
      and(
        eq(locationProfessionalsTable.professionalId, professionalId),
        eq(locationProfessionalsTable.locationId, locationId),
      ),
    );

  if (existing) {
    const [updated] = await db
      .update(locationProfessionalsTable)
      .set({
        ...(agendaCalendarId !== undefined ? { agendaCalendarId: agendaCalendarId } : {}),
        ...(role !== undefined ? { role } : {}),
      })
      .where(eq(locationProfessionalsTable.id, existing.id))
      .returning();
    res.json(updated);
    return;
  }

  const [created] = await db
    .insert(locationProfessionalsTable)
    .values({
      locationId,
      professionalId,
      role: role ?? "executor",
      agendaCalendarId: agendaCalendarId ?? null,
    })
    .returning();
  res.status(201).json(created);
});

router.delete("/professionals/:id/locations/:locationId", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const professionalId = parseRouteId(req.params.id);
  const locationId = parseRouteId(req.params.locationId);
  if (isNaN(professionalId) || isNaN(locationId)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  if (!await belongsToRequestCompany(req, professionalId) ||
      !await locationBelongsToRequestCompany(req, locationId)) {
    res.status(404).json({ error: "Vínculo profissional-clínica não encontrado" });
    return;
  }
  await db
    .delete(locationProfessionalsTable)
    .where(
      and(
        eq(locationProfessionalsTable.professionalId, professionalId),
        eq(locationProfessionalsTable.locationId, locationId),
      ),
    );
  res.json({ success: true });
});

// ---- Assinatura/rubrica do profissional (imagem) ----
// Upload de PNG/JPEG (<=2MB) para o Object Storage privado. Guarda so o caminho
// em professionals.signature_url. Escrita protegida por colaborador.
const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // assinatura e leve; 2MB sobra
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === "image/png" || file.mimetype === "image/jpeg";
    if (!ok) {
      cb(new MulterError("LIMIT_UNEXPECTED_FILE", "file"));
      return;
    }
    cb(null, true);
  },
});

// Traduz erros do multer (tamanho/tipo) em 400 com mensagem clara.
function signatureUploadMw(req: Request, res: Response, next: NextFunction): void {
  signatureUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Imagem maior que 2 MB. Envie um arquivo menor."
          : err.code === "LIMIT_UNEXPECTED_FILE"
            ? "Arquivo invalido. Envie uma imagem PNG ou JPEG."
            : "Falha no envio do arquivo.";
      res.status(400).json({ error: msg });
      return;
    }
    if (err) {
      res.status(400).json({ error: "Falha no envio do arquivo." });
      return;
    }
    next();
  });
}

router.post(
  "/professionals/:id/signature",
  requireCollaborator,
  requirePlatformOwner,
  signatureUploadMw,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseRouteId(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Id inválido" });
      return;
    }
    if (!await belongsToRequestCompany(req, id)) {
      res.status(404).json({ error: "Profissional não encontrado" });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Envie a imagem da assinatura no campo 'file'." });
      return;
    }
    if (file.size === 0) {
      res.status(400).json({ error: "Arquivo vazio. Envie uma imagem PNG ou JPEG válida." });
      return;
    }
    const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Profissional não encontrado" });
      return;
    }

    const ext = file.mimetype === "image/png" ? "png" : "jpg";
    const relativePath = `uploads/signatures/${id}-${randomUUID()}.${ext}`;
    const objectStorageService = new ObjectStorageService();
    await objectStorageService.saveUploadObject(relativePath, file.buffer, file.mimetype);
    const signatureUrl = `/api/storage/objects/${relativePath}`;

    const [updated] = await db
      .update(professionalsTable)
      .set({ signatureUrl })
      .where(eq(professionalsTable.id, id))
      .returning();
    const names = await loadTaxonomyNames();
    res.json(formatProfessional(updated, names.areas, names.specialties));
  },
);

// ---- Foto de perfil do profissional ----
// Upload PNG/JPEG (<=4MB) para Object Storage. Caminho em professionals.photo_url.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === "image/png" || file.mimetype === "image/jpeg";
    if (!ok) {
      cb(new MulterError("LIMIT_UNEXPECTED_FILE", "file"));
      return;
    }
    cb(null, true);
  },
});

function photoUploadMw(req: Request, res: Response, next: NextFunction): void {
  photoUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "Imagem maior que 4 MB."
        : "Envie uma imagem PNG ou JPEG.";
      res.status(400).json({ error: msg });
      return;
    }
    if (err) { res.status(400).json({ error: "Falha no envio." }); return; }
    next();
  });
}

router.post(
  "/professionals/:id/photo",
  requireCollaborator,
  requirePlatformOwner,
  photoUploadMw,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseRouteId(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Id inválido" }); return; }
    if (!await belongsToRequestCompany(req, id)) {
      res.status(404).json({ error: "Profissional não encontrado" });
      return;
    }
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Envie a imagem no campo 'file'." }); return; }
    if (file.size === 0) {
      res.status(400).json({ error: "Arquivo vazio. Envie uma imagem PNG ou JPEG válida." });
      return;
    }
    const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
    if (!row) { res.status(404).json({ error: "Profissional não encontrado" }); return; }

    const ext = file.mimetype === "image/png" ? "png" : "jpg";
    const relativePath = `uploads/photos/${id}-${randomUUID()}.${ext}`;
    const objectStorageService = new ObjectStorageService();
    await objectStorageService.saveUploadObject(relativePath, file.buffer, file.mimetype);
    const photoUrl = `/api/storage/objects/${relativePath}`;

    const [updated] = await db
      .update(professionalsTable)
      .set({ photoUrl })
      .where(eq(professionalsTable.id, id))
      .returning();
    const names = await loadTaxonomyNames();
    res.json(formatProfessional(updated, names.areas, names.specialties));
  },
);

export default router;
