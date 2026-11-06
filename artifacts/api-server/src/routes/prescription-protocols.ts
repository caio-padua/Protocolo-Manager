import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireCollaborator } from "./collaborator";

// Protocolos de prescricao: conjuntos de formulas salvos POR MEDICO.
// O dono vem sempre do token verificado, nunca do corpo da requisicao.
const router = Router();

type Row = { id: number; nome: string; formula_ids: unknown };
const toDto = (r: Row) => ({
  id: `db-${r.id}`,
  nome: r.nome,
  formulaIds: Array.isArray(r.formula_ids) ? (r.formula_ids as string[]) : [],
});

router.get("/prescription-protocols", requireCollaborator, async (req, res): Promise<void> => {
  const pid = req.collaborator!.professionalId;
  const r = await db.execute(sql`
    SELECT id, nome, formula_ids FROM prescription_protocols
    WHERE professional_id = ${pid} AND ativo ORDER BY nome ASC`);
  res.json((r.rows as Row[]).map(toDto));
});

router.post("/prescription-protocols", requireCollaborator, async (req, res): Promise<void> => {
  const pid = req.collaborator!.professionalId;
  const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : "";
  const ids: unknown = req.body?.formulaIds;
  if (!nome || nome.length > 80) {
    res.status(400).json({ error: "Informe um nome de até 80 caracteres." });
    return;
  }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 60
    || !ids.every((x) => typeof x === "string" && x.length > 0 && x.length <= 120)) {
    res.status(400).json({ error: "Informe de 1 a 60 fórmulas válidas." });
    return;
  }
  const uniq = [...new Set(ids as string[])];
  const dup = await db.execute(sql`
    SELECT 1 FROM prescription_protocols
    WHERE professional_id = ${pid} AND ativo AND lower(nome) = lower(${nome}) LIMIT 1`);
  if (dup.rows.length) {
    res.status(409).json({ error: "Você já tem um protocolo com esse nome." });
    return;
  }
  const ins = await db.execute(sql`
    INSERT INTO prescription_protocols (professional_id, nome, formula_ids)
    VALUES (${pid}, ${nome}, ${JSON.stringify(uniq)}::jsonb)
    RETURNING id, nome, formula_ids`);
  res.status(201).json(toDto(ins.rows[0] as Row));
});

// Remove da lista (ativo=false); a linha permanece no banco.
router.delete("/prescription-protocols/:id", requireCollaborator, async (req, res): Promise<void> => {
  const pid = req.collaborator!.professionalId;
  const id = Number(String(req.params.id).replace(/^db-/, ""));
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Identificador inválido." });
    return;
  }
  const r = await db.execute(sql`
    UPDATE prescription_protocols SET ativo = FALSE
    WHERE id = ${id} AND professional_id = ${pid} AND ativo RETURNING id`);
  if (!r.rows.length) {
    res.status(404).json({ error: "Protocolo não encontrado." });
    return;
  }
  res.status(204).end();
});

export default router;
