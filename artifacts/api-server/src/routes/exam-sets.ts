import { Router, type IRouter } from "express";
import { db, catalogoExamesTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ListPersonalExamSetsResponse, UpdatePersonalExamSetResponse, CreatePersonalExamSetBody } from "@workspace/api-zod";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { examSetOwner } from "../lib/exam-sets";

const router: IRouter = Router();
const id = z.coerce.number().int().positive().safe();
const write = CreatePersonalExamSetBody.extend({
  name: z.string().trim().min(1).max(120),
  examIds: z.array(z.number().int().positive().safe()).min(1).max(100)
    .refine(ids => new Set(ids).size === ids.length, "Exames repetidos"),
}).strict();
type SavedItem = { id: number; name: string; code: string | null };
type SetRow = { id: number; name: string; items: SavedItem[]; archived: boolean };

// Authorization is revalidated on every read/write, including membership revocation.
router.use("/exam-sets/:clientId", requireCollaborator);
router.all("/exam-sets/:clientId{/:setId}", async (req, res, next): Promise<void> => {
  const clientId = id.safeParse(req.params.clientId);
  const setId = req.params.setId == null ? null : id.safeParse(req.params.setId);
  if (!clientId.success || (setId && !setId.success)) {
    res.status(400).json({ error: "Identificador inválido." }); return;
  }
  try {
    const identity = await resolveClinicalEmitter(req, clientId.data);
    res.locals.examSetScope = {
      professionalId: identity.professional.id,
      locationId: identity.clinic.id, empresaId: identity.clinic.empresaId,
    };
    res.locals.setId = setId?.data;
    next();
  } catch (error) {
    if (!(error instanceof ClinicalIdentityError)) throw error;
    res.status(error.status).json({ error: error.message });
  }
});

async function hydrate(rows: SetRow[]) {
  const ids = [...new Set(rows.flatMap(row => row.items.map(item => item.id)))];
  const catalog = ids.length ? await db.select().from(catalogoExamesTable)
    .where(inArray(catalogoExamesTable.id, ids)) : [];
  const byId = new Map(catalog.map(exam => [exam.id, exam]));
  return rows.map(row => ({ ...row, items: row.items.map(item => {
    const exam = byId.get(item.id);
    return {
      id: item.id, name: exam?.nomeExame || item.name, code: exam?.codigoExame ?? item.code,
      status: !exam ? "removed" : exam.ativo === false || !exam.nomeExame ? "inactive" : "available",
      exam: exam && exam.ativo !== false && exam.nomeExame ? exam : null,
    };
  }) }));
}

router.get("/exam-sets/:clientId", async (_req, res): Promise<void> => {
  const result = await db.execute(sql`SELECT id, name, items, archived FROM personal_exam_sets
    WHERE ${examSetOwner(res.locals.examSetScope)} ORDER BY archived, name, id`);
  res.json(ListPersonalExamSetsResponse.parse(await hydrate(result.rows as unknown as SetRow[])));
});

router.post("/exam-sets/:clientId", async (req, res): Promise<void> => {
  const body = write.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Informe nome e até 100 exames distintos." }); return; }
  const catalog = await db.select().from(catalogoExamesTable).where(inArray(catalogoExamesTable.id, body.data.examIds));
  const byId = new Map(catalog.map(exam => [exam.id, exam]));
  if (body.data.examIds.some(id => !byId.get(id)?.nomeExame || byId.get(id)?.ativo === false)) {
    res.status(422).json({ error: "Selecione somente exames disponíveis no catálogo." }); return;
  }
  const items = body.data.examIds.map(id => ({ id, name: byId.get(id)!.nomeExame, code: byId.get(id)!.codigoExame }));
  const scope = res.locals.examSetScope;
  const result = await db.execute(sql`INSERT INTO personal_exam_sets (professional_id, location_id, empresa_id, name, items)
    VALUES (${scope.professionalId}, ${scope.locationId}, ${scope.empresaId}, ${body.data.name}, ${JSON.stringify(items)}::jsonb)
    RETURNING id, name, items, archived`);
  res.status(201).json(UpdatePersonalExamSetResponse.parse((await hydrate(result.rows as unknown as SetRow[]))[0]));
});

router.patch("/exam-sets/:clientId/:setId", async (req, res): Promise<void> => {
  const body = z.union([write, z.object({ name: z.string().trim().min(1).max(120) }).strict(),
    z.object({ archived: z.literal(true) }).strict()]).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Alteração inválida." }); return; }
  const owner = examSetOwner(res.locals.examSetScope);
  const found = await db.execute(sql`SELECT id, name, items, archived FROM personal_exam_sets
    WHERE id = ${res.locals.setId} AND ${owner}`);
  const current = found.rows[0] as unknown as SetRow | undefined;
  if (!current || current.archived) { res.status(404).json({ error: "Conjunto indisponível." }); return; }
  let items = current.items;
  if ("examIds" in body.data) {
    const catalog = await db.select().from(catalogoExamesTable).where(inArray(catalogoExamesTable.id, body.data.examIds));
    const byId = new Map(catalog.map(exam => [exam.id, exam]));
    const saved = new Map(current.items.map(item => [item.id, item]));
    if (body.data.examIds.some(id => (!byId.get(id)?.nomeExame || byId.get(id)?.ativo === false) && !saved.has(id))) {
      res.status(422).json({ error: "Não é possível adicionar exames indisponíveis." }); return;
    }
    items = body.data.examIds.map(id => {
      const exam = byId.get(id);
      return exam?.nomeExame ? { id, name: exam.nomeExame, code: exam.codigoExame } : saved.get(id)!;
    });
  }
  const result = await db.execute(sql`UPDATE personal_exam_sets SET
    name = ${"name" in body.data ? body.data.name : current.name},
    items = ${JSON.stringify(items)}::jsonb, archived = ${"archived" in body.data},
    updated_at = now() WHERE id = ${current.id} AND ${owner} AND archived = false
    RETURNING id, name, items, archived`);
  if (!result.rows.length) { res.status(409).json({ error: "O conjunto foi arquivado em outra janela." }); return; }
  res.json(UpdatePersonalExamSetResponse.parse((await hydrate(result.rows as unknown as SetRow[]))[0]));
});

export default router;
