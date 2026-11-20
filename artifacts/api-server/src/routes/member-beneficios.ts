import { Router, type IRouter, type Request } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { isPlatformOwner } from "../lib/clinical-access";
import { conceder, revogar } from "../lib/member-beneficios";
import { requireCollaborator } from "./collaborator";

const router: IRouter = Router();

function actorId(req: Request): number | null {
  const id = Number(req.collaborator?.professionalId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const Body = z.object({
  clientId: z.number().int().positive(),
  beneficio: z.enum(["pedido_exames", "receita"]),
  ambiente: z.enum(["teste", "real"]),
  motivo: z.string().trim().min(5).max(300),
  validoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict();

router.get("/member-beneficios", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor || !(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  const r = await db.execute(sql`
    SELECT b.id, b.empresa_id, b.client_id, c.name AS cliente, b.beneficio, b.status, b.ambiente, b.motivo, b.valido_ate, b.criado_em
      FROM client_member_beneficios b JOIN clients c ON c.id = b.client_id ORDER BY b.id DESC LIMIT 200`);
  const h = await db.execute(sql`SELECT beneficio_id, acao, por, em FROM client_member_beneficios_hist ORDER BY id DESC LIMIT 200`);
  res.json({ beneficios: r.rows, historico: h.rows });
});

router.post("/member-beneficios", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor || !(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  const body = Body.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dados inválidos para o benefício." }); return; }
  try {
    const row = await conceder({ clientId: body.data.clientId, kind: body.data.beneficio, ambiente: body.data.ambiente, motivo: body.data.motivo, validoAte: body.data.validoAte }, actor);
    res.status(201).json(row);
  } catch (e) {
    const m = String((e as Error).message);
    if (m === "JA_ATIVO") { res.status(409).json({ error: "Este benefício já está ativo para o cliente." }); return; }
    if (m === "CLIENTE_SEM_EMPRESA") { res.status(409).json({ error: "Cliente sem clínica vinculada." }); return; }
    req.log.error({ err: m }, "Erro ao conceder benefício Member");
    res.status(500).json({ error: "Não foi possível conceder o benefício." });
  }
});

router.delete("/member-beneficios/:id", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor || !(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Benefício inválido." }); return; }
  const row = await revogar(id, actor);
  if (!row) { res.status(404).json({ error: "Benefício ativo não encontrado." }); return; }
  res.json(row);
});

export default router;
