import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { randomUUID } from "node:crypto";
import { db, professionalsTable, locationProfessionalsTable, sessionsTable, locationsTable, agendaCalendarsTable, professionalAreasTable, professionalSpecialtiesTable } from "@workspace/db";
import { CreateProfessionalBody } from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";
import { requireCollaborator } from "./collaborator.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router: IRouter = Router();

const CATEGORIES = ["medico", "enfermagem", "recepcao", "administrativo", "financeiro", "outro"] as const;
type Category = (typeof CATEGORIES)[number];

function normalizeCategory(raw: unknown): Category {
  const s = String(raw ?? "").trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(s) ? (s as Category) : "outro";
}

function formatProfessional(
  p: typeof professionalsTable.$inferSelect,
  areaNames?: Map<number, string>,
  specialtyNames?: Map<number, string>,
) {
  return {
    ...p,
    crm: p.crm ?? null,
    specialty: p.specialty ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
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
    cpf: p.cpf ?? null,
    cnpj: p.cnpj ?? null,
    homeServiceFeePerVisit: p.homeServiceFeePerVisit ?? null,
    contractType: p.contractType ?? null,
    createdAt: p.createdAt.toISOString(),
  };
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

router.get("/professionals", async (_req, res): Promise<void> => {
  const [professionals, names] = await Promise.all([
    db.select().from(professionalsTable),
    loadTaxonomyNames(),
  ]);
  res.json(professionals.map((p) => formatProfessional(p, names.areas, names.specialties)));
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

router.post("/professionals", async (req, res): Promise<void> => {
  // Categoria fora da lista -> 400 (caso extremo 4).
  if (req.body?.category !== undefined && req.body?.category !== null) {
    const s = String(req.body.category).trim().toLowerCase();
    if (!(CATEGORIES as readonly string[]).includes(s)) {
      res.status(400).json({ error: `Categoria inválida. Use uma de: ${CATEGORIES.join(", ")}` });
      return;
    }
  }
  const parsed = CreateProfessionalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const values = {
    ...parsed.data,
    category: normalizeCategory(parsed.data.category),
    ...(parsed.data.professionalType !== undefined && parsed.data.professionalType !== null
      ? { professionalType: String(parsed.data.professionalType) }
      : {}),
  };
  const [professional] = await db.insert(professionalsTable).values(values).returning();
  const names = await loadTaxonomyNames();
  res.status(201).json(formatProfessional(professional, names.areas, names.specialties));
});

router.put("/professionals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }

  const {
    name, crm, specialty, email, phone, unit, serviceTypes, category, role, active,
    professionalType, areaId, specialtyId, registrationCouncil, registrationNumber,
    nurseType, cpf, cnpj, homeServiceFeePerVisit, contractType,
  } = req.body as {
    name?: string;
    crm?: string | null;
    specialty?: string | null;
    email?: string | null;
    phone?: string | null;
    unit?: string | null;
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

  const [updated] = await db
    .update(professionalsTable)
    .set({
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(crm !== undefined ? { crm } : {}),
      ...(specialty !== undefined ? { specialty } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(unit !== undefined ? { unit } : {}),
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
      ...(cpf !== undefined ? { cpf } : {}),
      ...(cnpj !== undefined ? { cnpj } : {}),
      ...(homeServiceFeePerVisit !== undefined ? { homeServiceFeePerVisit } : {}),
      ...(contractType !== undefined ? { contractType } : {}),
    })
    .where(eq(professionalsTable.id, id))
    .returning();
  const names = await loadTaxonomyNames();
  res.json(formatProfessional(updated, names.areas, names.specialties));
});

router.delete("/professionals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }

  // Trava: não apagar profissional com sessões vinculadas (caso extremo 2).
  const linkedSessions = await db.select().from(sessionsTable).where(eq(sessionsTable.professionalId, id));
  if (linkedSessions.length > 0) {
    res.status(409).json({
      error: `Profissional tem ${linkedSessions.length} sessão(ões) vinculada(s). Desative-o em vez de apagar.`,
    });
    return;
  }

  // Limpa vínculos com clínicas antes de apagar (não há sessões em risco).
  await db.delete(locationProfessionalsTable).where(eq(locationProfessionalsTable.professionalId, id));
  await db.delete(professionalsTable).where(eq(professionalsTable.id, id));
  res.json({ success: true });
});

// ---- Vínculos profissional <-> clínica <-> agenda Google (location_professionals) ----

router.get("/professionals/:id/locations", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const links = await db
    .select()
    .from(locationProfessionalsTable)
    .where(eq(locationProfessionalsTable.professionalId, id));
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
router.post("/professionals/:id/locations", async (req, res): Promise<void> => {
  const professionalId = parseInt(req.params.id);
  if (isNaN(professionalId)) {
    res.status(400).json({ error: "Id inválido" });
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

router.delete("/professionals/:id/locations/:locationId", async (req, res): Promise<void> => {
  const professionalId = parseInt(req.params.id);
  const locationId = parseInt(req.params.locationId);
  if (isNaN(professionalId) || isNaN(locationId)) {
    res.status(400).json({ error: "Id inválido" });
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
  signatureUploadMw,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Id inválido" });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Envie a imagem da assinatura no campo 'file'." });
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
    cb(ok ? null : new MulterError("LIMIT_UNEXPECTED_FILE", "file"), ok);
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
  photoUploadMw,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Id inválido" }); return; }
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Envie a imagem no campo 'file'." }); return; }
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
