import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { randomUUID } from "node:crypto";
import { db, professionalsTable, locationProfessionalsTable, locationsTable, agendaCalendarsTable, professionalAreasTable, professionalSpecialtiesTable, professionalEmpresasTable, empresasTable, professionalWorkAreasTable, professionalCategoryHistoryTable } from "@workspace/db";
import { CreateProfessionalBody, CreateProfessionalAreaBody, CreateProfessionalWorkAreaBody } from "@workspace/api-zod";
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
import { HEALTH_CATEGORY_SLUGS, includeRequiredWorkAreas, normalizedCatalogName, professionalCategoryIdentity, saveWorkAreaLinks, WorkAreaError, workAreaIdsSchema } from "../lib/professional-work-areas.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  LIMITE_EMPRESAS_POR_PROFISSIONAL,
  VinculoEmpresaError,
  aplicarVinculosEmpresa,
  carregarVinculosEmpresa,
  empresaEfetivaDoLocal,
  empresaIdsDoProfissional,
  empresasElegiveis,
  profissionaisAdicionaisDaEmpresa,
  validarLocalParaProfissional,
  type VinculoEmpresa,
} from "../lib/professional-empresas.js";

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
  const [direct, linked, additional] = await Promise.all([
    db
      .select({ id: professionalsTable.id })
      .from(professionalsTable)
      .where(eq(professionalsTable.empresaId, empresaId)),
    db
      .select({ id: locationProfessionalsTable.professionalId })
      .from(locationProfessionalsTable)
      .innerJoin(locationsTable, eq(locationProfessionalsTable.locationId, locationsTable.id))
      .where(locationCompanyCondition(empresaId)),
    // Vínculo empresarial adicional (posições 2 a 5) também coloca o profissional no Corpo Clínico.
    profissionaisAdicionaisDaEmpresa(empresaId),
  ]);
  return [...new Set([...direct.map((row) => row.id), ...linked.map((row) => row.id), ...additional])];
}

/**
 * Empresas visíveis para as agendas do profissional: o dono da plataforma vê todas as
 * empresas em que o profissional está cadastrado; os demais, só a empresa da sessão.
 */
async function companiesVisibleForAgendas(req: Request, professionalId: number): Promise<Set<number> | null> {
  const requestCompany = req.tenantContext?.empresaId;
  if (!Number.isInteger(requestCompany) || requestCompany <= 0) return null;
  if (req.tenantContext?.isPlatformOwner === true) {
    const own = await empresaIdsDoProfissional(professionalId);
    own.add(requestCompany);
    return own;
  }
  return new Set([requestCompany]);
}

type VinculosDoProfissional = {
  originariaId: number;
  originariaNome: string | null;
  lista: { ordem: number; empresaId: number; nome: string; papel: VinculoEmpresa["papel"] }[];
};

// Resumo de vínculos para a lista (somente quem pode ver dados privados).
async function vinculosEmLote(
  rows: { id: number; empresaId: number | null }[],
): Promise<Map<number, VinculosDoProfissional>> {
  const result = new Map<number, VinculosDoProfissional>();
  if (!rows.length) return result;
  const [extras, companies] = await Promise.all([
    db
      .select({
        professionalId: professionalEmpresasTable.professionalId,
        empresaId: professionalEmpresasTable.empresaId,
        ordem: professionalEmpresasTable.ordem,
      })
      .from(professionalEmpresasTable)
      .where(inArray(professionalEmpresasTable.professionalId, rows.map((row) => row.id))),
    db.select({ id: empresasTable.id, nome: empresasTable.nome }).from(empresasTable),
  ]);
  const names = new Map(companies.map((company) => [company.id, company.nome]));
  for (const row of rows) {
    const originariaId = row.empresaId ?? DEFAULT_COMPANY_ID;
    const adicionais = extras
      .filter((extra) => extra.professionalId === row.id)
      .sort((a, b) => a.ordem - b.ordem);
    result.set(row.id, {
      originariaId,
      originariaNome: names.get(originariaId) ?? null,
      lista: [
        { ordem: 1, empresaId: originariaId, nome: names.get(originariaId) ?? `Empresa ${originariaId}`, papel: "originario" as const },
        ...adicionais.map((extra) => ({
          ordem: extra.ordem,
          empresaId: extra.empresaId,
          nome: names.get(extra.empresaId) ?? `Empresa ${extra.empresaId}`,
          papel: "adicional" as const,
        })),
      ],
    });
  }
  return result;
}

function resumoDeVinculos(entry: VinculosDoProfissional | undefined) {
  if (!entry) return {};
  return {
    empresaOriginariaId: entry.originariaId,
    empresaOriginariaNome: entry.originariaNome,
    empresasVinculadas: entry.lista,
  };
}

function nomesDosVinculos(vinculos: VinculoEmpresa[]) {
  return {
    empresaOriginariaNome: vinculos[0]?.nome ?? null,
    empresasAdicionaisNomes: vinculos.slice(1).map((vinculo) => vinculo.nome),
  };
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
  const vinculos = includePrivate ? await vinculosEmLote(visible) : null;
  res.json(visible.map((p) => ({
    ...formatProfessional(p, names.areas, names.specialties, includePrivate),
    ...(vinculos ? resumoDeVinculos(vinculos.get(p.id)) : {}),
  })));
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
  const includePrivate = req.tenantContext?.isPlatformOwner === true;
  const vinculos = includePrivate ? await vinculosEmLote([professional]) : null;
  res.json({
    ...formatProfessional(professional, names.areas, names.specialties, includePrivate),
    ...(vinculos ? resumoDeVinculos(vinculos.get(professional.id)) : {}),
  });
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

router.post("/professional-areas", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const parsed = CreateProfessionalAreaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Informe o nome e o tipo da categoria." }); return; }
  const name = parsed.data.name.trim().replace(/\s+/g, " ");
  const slug = normalizedCatalogName(name);
  if (name.length < 2 || !slug) { res.status(400).json({ error: "Nome de categoria inválido." }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const identity = professionalCategoryIdentity(name);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`category:${identity}`}))`);
      const existing = await tx.select({ id: professionalAreasTable.id, name: professionalAreasTable.name, slug: professionalAreasTable.slug }).from(professionalAreasTable);
      if (existing.some((row) => professionalCategoryIdentity(row.name) === identity || professionalCategoryIdentity(row.slug) === identity)) {
        throw new WorkAreaError(409, "Já existe uma categoria com esse nome.");
      }
      const [created] = await tx.insert(professionalAreasTable).values({
        name, slug, professionalType: parsed.data.professionalType, active: true,
      }).returning();
      await tx.insert(professionalCategoryHistoryTable).values({
        categoryId: created.id, actorId: req.tenantContext.professionalId!,
      });
      return created;
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof WorkAreaError) { res.status(error.status).json({ error: error.message }); return; }
    if (isUniqueConstraintError(error)) { res.status(409).json({ error: "Já existe uma categoria com esse nome." }); return; }
    throw error;
  }
});

router.get("/professional-work-areas", requireCollaborator, async (_req, res): Promise<void> => {
  const rows = await db.select({ id: professionalWorkAreasTable.id, name: professionalWorkAreasTable.name, slug: professionalWorkAreasTable.slug })
    .from(professionalWorkAreasTable).where(eq(professionalWorkAreasTable.active, true));
  rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  res.json(rows.map(({ id, name, slug }) => ({ id, name, requiredForCategories: slug === "saude" ? HEALTH_CATEGORY_SLUGS : [] })));
});

router.post("/professional-work-areas", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const parsed = CreateProfessionalWorkAreaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Informe o nome da área." }); return; }
  const name = parsed.data.name.trim().replace(/\s+/g, " ");
  const slug = normalizedCatalogName(name);
  if (name.length < 2 || !slug) { res.status(400).json({ error: "Nome de área inválido." }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`workarea:${slug}`}))`);
      const existing = await tx.select({ name: professionalWorkAreasTable.name, slug: professionalWorkAreasTable.slug }).from(professionalWorkAreasTable);
      if (existing.some((row) => row.slug === slug || normalizedCatalogName(row.name) === slug)) {
        throw new WorkAreaError(409, "Já existe uma área com esse nome.");
      }
      const [created] = await tx.insert(professionalWorkAreasTable).values({
        name, slug, createdBy: req.tenantContext.professionalId!,
      }).returning();
      return created;
    });
    res.status(201).json({ id: result.id, name: result.name });
  } catch (error) {
    if (error instanceof WorkAreaError) { res.status(error.status).json({ error: error.message }); return; }
    if (isUniqueConstraintError(error)) { res.status(409).json({ error: "Já existe uma área com esse nome." }); return; }
    throw error;
  }
});

router.get("/professionals/:id/work-areas", requireCollaborator, async (req, res): Promise<void> => {
  const id = parseRouteId(req.params.id);
  if (!id || !await belongsToRequestCompany(req, id)) { res.status(404).json({ error: "Profissional não encontrado." }); return; }
  const rows = await db.execute(sql`
    SELECT work_area_id FROM professional_work_area_links
    WHERE empresa_id=${req.tenantContext.empresaId} AND professional_id=${id} AND active=TRUE
    ORDER BY work_area_id
  `);
  res.json(rows.rows.map((row) => Number(row.work_area_id)));
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

  // Vínculo originário: padrão = empresa da sessão; a escolha explícita precisa ser empresa elegível.
  const requestedOriginaria: unknown = req.body?.empresaOriginariaId;
  let empresaOriginariaId = req.tenantContext!.empresaId;
  if (requestedOriginaria !== undefined && requestedOriginaria !== null) {
    if (typeof requestedOriginaria !== "number" || !Number.isSafeInteger(requestedOriginaria) || requestedOriginaria <= 0) {
      res.status(400).json({ error: "Vínculo originário inválido" });
      return;
    }
    if (requestedOriginaria !== empresaOriginariaId) {
      const eligible = await empresasElegiveis([requestedOriginaria]);
      if (!eligible.has(requestedOriginaria)) {
        res.status(400).json({ error: "Empresa inexistente, inativa ou não permitida para vínculo de profissional" });
        return;
      }
    }
    empresaOriginariaId = requestedOriginaria;
  }

  const { workAreaIds, ...professionalData } = parsed.data;
  if (workAreaIds !== undefined && !workAreaIdsSchema.safeParse(workAreaIds).success) {
    res.status(400).json({ error: "Áreas de atuação inválidas ou repetidas." }); return;
  }
  const values = {
    ...professionalData,
    email: normalizedEmail,
    secondaryEmail: normalizedSecondaryEmail,
    cpf: normalizedCpf,
    category: normalizeCategory(parsed.data.category),
    role: parsed.data.role ?? "executor",
    professionalType: parsed.data.professionalType ?? "medico",
    active: parsed.data.active ?? true,
    empresaId: empresaOriginariaId,
    isPlatformOwner: false,
    credentialVersion: 0,
    ...(parsed.data.professionalType !== undefined && parsed.data.professionalType !== null
      ? { professionalType: String(parsed.data.professionalType) }
      : {}),
  };
  let professional: typeof professionalsTable.$inferSelect | undefined;
  try {
    await db.transaction(async (tx) => {
      [professional] = await tx.insert(professionalsTable).values(values).returning();
      if (professional) {
        const required = await includeRequiredWorkAreas(tx, empresaOriginariaId, professional.id, professional.areaId, workAreaIds);
        if (required !== undefined) await saveWorkAreaLinks(tx, empresaOriginariaId, professional.id, req.tenantContext.professionalId!, required);
      }
    });
  } catch (error) {
    if (error instanceof WorkAreaError) { res.status(error.status).json({ error: error.message }); return; }
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
    professionalType, areaId, specialtyId, workAreaIds, registrationCouncil, registrationNumber,
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
    workAreaIds?: number[];
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
  if (workAreaIds !== undefined && !workAreaIdsSchema.safeParse(workAreaIds).success) {
    res.status(400).json({ error: "Áreas de atuação inválidas ou repetidas." }); return;
  }
  if (category !== undefined && category !== null) {
    const s = String(category).trim().toLowerCase();
    if (!(CATEGORIES as readonly string[]).includes(s)) {
      res.status(400).json({ error: `Categoria inválida. Use uma de: ${CATEGORIES.join(", ")}` });
      return;
    }
  }
  const requestedOriginaria: unknown = (req.body as { empresaOriginariaId?: unknown }).empresaOriginariaId;
  if (requestedOriginaria !== undefined &&
      (typeof requestedOriginaria !== "number" || !Number.isSafeInteger(requestedOriginaria) || requestedOriginaria <= 0)) {
    res.status(400).json({ error: "Vínculo originário inválido" });
    return;
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
      const changes = {
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
      };
      // Corpo só com o vínculo originário não altera o perfil (set vazio é erro no Drizzle).
      if (Object.keys(changes).length === 0) {
        updated = current;
      } else {
        [updated] = await tx
          .update(professionalsTable)
          .set(changes)
          .where(eq(professionalsTable.id, id))
          .returning();
      }
      if (updated && updated !== current) await recordProfessionalProfileChange(tx, req, current, updated);
      if (updated && (workAreaIds !== undefined || areaId !== undefined)) {
        const required = await includeRequiredWorkAreas(tx, req.tenantContext.empresaId, id, updated.areaId, workAreaIds);
        if (required !== undefined) await saveWorkAreaLinks(tx, req.tenantContext.empresaId, id, req.tenantContext.professionalId!, required);
      }
      if (updated && requestedOriginaria !== undefined) {
        const resultado = await aplicarVinculosEmpresa(tx, id, { originariaId: requestedOriginaria as number });
        if (resultado.mudou) {
          await recordProfessionalProfileChange(
            tx, req,
            { id, name: updated.name, ...nomesDosVinculos(resultado.antes) },
            { id, name: updated.name, ...nomesDosVinculos(resultado.depois) },
          );
        }
      }
    });
  } catch (error) {
    if (error instanceof WorkAreaError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof VinculoEmpresaError) {
      res.status(error.status).json(error.body);
      return;
    }
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

// ---- Vínculo empresarial: originário (posição 1) + até 4 empresas adicionais ----

router.get("/professionals/:id/empresas", requireCollaborator, async (req, res): Promise<void> => {
  const id = parseRouteId(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  if (!await belongsToRequestCompany(req, id)) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const vinculos = await carregarVinculosEmpresa(id);
  if (!vinculos) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  // Quem não é dono da plataforma só enxerga o vínculo com a empresa da própria sessão.
  const visiveis = req.tenantContext?.isPlatformOwner === true
    ? vinculos
    : vinculos.filter((vinculo) => vinculo.empresaId === req.tenantContext?.empresaId);
  res.json({ professionalId: id, limite: LIMITE_EMPRESAS_POR_PROFISSIONAL, vinculos: visiveis });
});

router.put("/professionals/:id/empresas", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const id = parseRouteId(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  if (!await belongsToRequestCompany(req, id)) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const body = (req.body ?? {}) as { originariaId?: unknown; adicionaisIds?: unknown };
  if (body.originariaId === undefined && body.adicionaisIds === undefined) {
    res.status(400).json({ error: "Informe originariaId e/ou adicionaisIds" });
    return;
  }
  try {
    const resultado = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: professionalsTable.id, name: professionalsTable.name })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, id))
        .for("update")
        .limit(1);
      if (!current) throw new VinculoEmpresaError(404, { error: "Profissional não encontrado" });
      const aplicado = await aplicarVinculosEmpresa(tx, id, {
        ...(body.originariaId !== undefined ? { originariaId: body.originariaId as number } : {}),
        ...(body.adicionaisIds !== undefined ? { adicionaisIds: body.adicionaisIds as number[] } : {}),
      });
      if (aplicado.mudou) {
        await recordProfessionalProfileChange(
          tx, req,
          { id, name: current.name, ...nomesDosVinculos(aplicado.antes) },
          { id, name: current.name, ...nomesDosVinculos(aplicado.depois) },
        );
      }
      return aplicado;
    });
    res.json({ professionalId: id, limite: LIMITE_EMPRESAS_POR_PROFISSIONAL, vinculos: resultado.depois, mudou: resultado.mudou });
  } catch (error) {
    if (error instanceof VinculoEmpresaError) {
      res.status(error.status).json(error.body);
      return;
    }
    throw error;
  }
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
  const visibleCompanies = await companiesVisibleForAgendas(req, id);
  if (!visibleCompanies) {
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
      locationEmpresaId: locationsTable.empresaId,
    })
    .from(locationProfessionalsTable)
    .innerJoin(locationsTable, eq(locationProfessionalsTable.locationId, locationsTable.id))
    .where(eq(locationProfessionalsTable.professionalId, id));
  res.json(
    links
      .filter((l) => visibleCompanies.has(empresaEfetivaDoLocal(l.locationEmpresaId)))
      .map((l) => ({
        id: l.id,
        locationId: l.locationId,
        professionalId: l.professionalId,
        role: l.role,
        agendaCalendarId: l.agendaCalendarId ?? null,
        empresaId: empresaEfetivaDoLocal(l.locationEmpresaId),
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
  const visibleCompanies = await companiesVisibleForAgendas(req, professionalId);
  if (!visibleCompanies || !visibleCompanies.has(empresaEfetivaDoLocal(loc.empresaId))) {
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

  // Novo acesso só nasce em empresa em que o profissional está cadastrado.
  const decision = await validarLocalParaProfissional(professionalId, locationId);
  if (!decision.permitido) {
    res.status(decision.status).json({ error: decision.erro, ...(decision.code ? { code: decision.code } : {}) });
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
  const [targetLocation] = await db
    .select({ empresaId: locationsTable.empresaId })
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId))
    .limit(1);
  const visibleCompanies = await companiesVisibleForAgendas(req, professionalId);
  if (!await belongsToRequestCompany(req, professionalId) ||
      !targetLocation ||
      !visibleCompanies ||
      !visibleCompanies.has(empresaEfetivaDoLocal(targetLocation.empresaId))) {
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
