import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db, agendaResourcesTable, agendaWindowsTable, agendaExceptionsTable, locationsTable, sessionsTable,
} from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import { requireCollaborator } from "./collaborator";
import { MAX_DIAS_OCUPACAO, calcularOcupacao, datasDoPeriodo } from "../lib/agenda-ocupacao";

/**
 * Ocupação por agenda no período (leitura): "vagas ocupadas / vagas previstas" para a barrinha de cada agenda.
 * Só lê janelas, exceções e atendimentos da própria clínica; não consulta o Google nem grava nada.
 */
const router: IRouter = Router();
router.use(moduleGuard("agenda"));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({ de: z.string().regex(ISO_DATE), ate: z.string().regex(ISO_DATE) }).strict();

router.get("/agenda/ocupacao", requireCollaborator, async (req, res): Promise<void> => {
  const empresaId = req.tenantContext?.empresaId;
  if (!req.tenantContext?.authenticated || empresaId == null) { res.status(401).json({ error: "Entre com seu acesso profissional." }); return; }
  const q = querySchema.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Informe de e ate (YYYY-MM-DD)." }); return; }
  const { de, ate } = q.data;
  const dias = datasDoPeriodo(de, ate).length;
  if (dias === 0 || dias > MAX_DIAS_OCUPACAO) { res.status(400).json({ error: `Período inválido (de 1 a ${MAX_DIAS_OCUPACAO} dias).` }); return; }

  const recursos = await db.select({ id: agendaResourcesTable.id, slotMinutes: agendaResourcesTable.slotMinutes })
    .from(agendaResourcesTable).where(and(
      eq(agendaResourcesTable.active, true),
      or(
        eq(agendaResourcesTable.empresaId, empresaId),
        inArray(agendaResourcesTable.locationId, db.select({ id: locationsTable.id }).from(locationsTable).where(eq(locationsTable.empresaId, empresaId))),
      ),
    ));
  if (recursos.length === 0) { res.json([]); return; }
  const ids = recursos.map((r) => r.id);

  const [janelas, excecoes, sessoes] = await Promise.all([
    db.select().from(agendaWindowsTable).where(and(inArray(agendaWindowsTable.resourceId, ids), eq(agendaWindowsTable.active, true))),
    db.select().from(agendaExceptionsTable).where(and(
      sql`${agendaExceptionsTable.date} >= ${de} AND ${agendaExceptionsTable.date} <= ${ate}`,
      or(isNull(agendaExceptionsTable.resourceId), inArray(agendaExceptionsTable.resourceId, ids)),
    )),
    db.select({
      resourceId: sessionsTable.resourceId, date: sessionsTable.scheduledDate, time: sessionsTable.scheduledTime, durationMinutes: sessionsTable.durationMinutes,
    }).from(sessionsTable).where(and(
      inArray(sessionsTable.resourceId, ids),
      sql`${sessionsTable.scheduledDate} >= ${de} AND ${sessionsTable.scheduledDate} <= ${ate}`,
      inArray(sessionsTable.status, ["scheduled", "confirmed", "completed"]),
      eq(sessionsTable.agendaArchived, false),
    )),
  ]);

  res.json(recursos.map((r) => {
    const bloqueadas = new Set(excecoes.filter((e) => e.resourceId == null || e.resourceId === r.id).map((e) => e.date));
    const o = calcularOcupacao({
      de, ate, slotMinutes: r.slotMinutes, datasBloqueadas: bloqueadas,
      janelas: janelas.filter((j) => j.resourceId === r.id).map((j) => ({
        weekday: j.weekday, startTime: j.startTime, endTime: j.endTime, repeatWeeks: j.repeatWeeks, anchorDate: j.anchorDate,
      })),
      atendimentos: sessoes.filter((s) => s.resourceId === r.id).map((s) => ({ date: s.date, time: s.time, durationMinutes: s.durationMinutes })),
    });
    return { resourceId: r.id, capacidade: o.capacidade, ocupadas: o.ocupadas };
  }));
});

export default router;
