import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { GetGoogleAgendaCommitmentsQueryParams, GetGoogleAgendaCommitmentsResponse } from "@workspace/api-zod";
import { requireCollaborator } from "./collaborator";
import {
  GOOGLE_AGENDA_FLOOR, projectImportedCommitment, type ImportedCommitment,
} from "../lib/agenda-google-projection";

const router = Router();
router.get("/agenda/google-compromissos", requireCollaborator, async (req, res): Promise<void> => {
  const query = GetGoogleAgendaCommitmentsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Informe de e ate no formato AAAA-MM-DD." }); return; }
  const start = new Date(`${query.data.de}T00:00:00-03:00`);
  const last = new Date(`${query.data.ate}T00:00:00-03:00`);
  const until = new Date(last.getTime() + 86_400_000);
  const validDate = (text: string, date: Date) =>
    Number.isFinite(date.getTime()) && new Date(date.getTime() - 10_800_000).toISOString().slice(0, 10) === text;
  if (!validDate(query.data.de, start) || !validDate(query.data.ate, last)
    || until <= start || until.getTime() - start.getTime() > 62 * 86_400_000) {
    res.status(400).json({ error: "O período deve conter de um a 62 dias válidos." }); return;
  }
  try {
    const empresaId = req.tenantContext.empresaId;
    if (!empresaId) { res.status(403).json({ error: "Selecione a empresa." }); return; }
    const result = await db.execute(sql`
      SELECT c.id, c.titulo, c.inicio, c.fim, c.dia_inteiro AS "diaInteiro",
        c.recorrencia, c.origem,
        CASE WHEN l.agenda_papel = 'pessoal' AND NOT ${req.tenantContext.isPlatformOwner} THEN 'Agenda pessoal'
          ELSE l.name END AS agenda,
        l.id AS "agendaId", l.color AS cor, l.agenda_papel AS papel
      FROM agenda_compromissos c
      JOIN locations l ON l.id = c.location_id
      WHERE l.empresa_id = ${empresaId} AND l.active = 'true' AND c.status = 'ativo'
        AND (c.origem = 'google_recorrente' OR (c.inicio < ${until.toISOString()}::timestamptz
          AND c.fim > ${start.toISOString()}::timestamptz))
      ORDER BY c.inicio, c.id
    `);
    const calendars = await db.execute(sql`
      SELECT l.id,
        CASE WHEN l.agenda_papel = 'pessoal' AND NOT ${req.tenantContext.isPlatformOwner} THEN 'Agenda pessoal'
          ELSE l.name END AS nome,
        l.color AS cor
      FROM locations l
      WHERE l.empresa_id = ${empresaId} AND l.active = 'true'
        AND (l.google_calendar_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM agenda_compromissos c
          WHERE c.location_id = l.id AND c.status = 'ativo'
        ))
      ORDER BY l.name, l.id
    `);
    const events = (result.rows as unknown as ImportedCommitment[]).flatMap((row) => {
      // O cadastro atual não prova titularidade pessoal: só o proprietário da plataforma vê o título.
      const safe = row.papel === "pessoal" && !req.tenantContext.isPlatformOwner
        ? { ...row, titulo: "Ocupado — compromisso pessoal" } : row;
      return projectImportedCommitment(safe, start, until);
    }).sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id));
    res.json(GetGoogleAgendaCommitmentsResponse.parse({ desde: GOOGLE_AGENDA_FLOOR, eventos: events, agendas: calendars.rows }));
  } catch (error) {
    req.log?.error({ err: error }, "Falha ao consultar compromissos importados");
    res.status(500).json({ error: "Não foi possível consultar os compromissos importados." });
  }
});

export default router;
