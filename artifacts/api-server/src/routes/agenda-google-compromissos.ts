import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { GetGoogleAgendaCommitmentsQueryParams, GetGoogleAgendaCommitmentsResponse } from "@workspace/api-zod";
import { requireCollaborator } from "./collaborator";
import {
  GOOGLE_AGENDA_FLOOR, projectImportedCommitment, type ImportedCommitment,
} from "../lib/agenda-google-projection";

const router = Router();
// A descrição importada pode conter dados clínicos sem vínculo validado.
// Até existir autorização por cliente, somente o proprietário pode consultá-la.
router.get("/agenda/google-compromissos/:id/descricao", requireCollaborator, async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (!req.tenantContext.isPlatformOwner) {
    res.status(403).json({ error: "A descrição importada exige acesso do proprietário." });
    return;
  }
  const id = Number(req.params.id);
  const value = req.query.inicio;
  const start = typeof value === "string" ? new Date(value) : new Date(NaN);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof value !== "string" ||
      !Number.isFinite(start.getTime()) || start.toISOString() !== value) {
    res.status(400).json({ error: "Identificador ou início do compromisso inválido." });
    return;
  }
  const empresaId = req.tenantContext.empresaId;
  if (!empresaId) { res.status(403).json({ error: "Selecione a empresa." }); return; }
  try {
    const result = await db.execute(sql`
      SELECT c.id, c.titulo, c.descricao, c.inicio, c.fim, c.dia_inteiro AS "diaInteiro",
        c.recorrencia, c.origem, l.name AS agenda, l.id AS "agendaId", l.color AS cor, l.agenda_papel AS papel
      FROM agenda_compromissos c JOIN locations l ON l.id = c.location_id
      WHERE c.id = ${id} AND l.empresa_id = ${empresaId} AND l.active = 'true' AND c.status = 'ativo'
      LIMIT 1
    `);
    const row = result.rows[0] as unknown as (ImportedCommitment & { descricao: string | null }) | undefined;
    const matches = row && projectImportedCommitment(row, start, new Date(start.getTime() + 1))
      .some((event) => event.inicio === value);
    if (!matches) { res.status(404).json({ error: "Compromisso não encontrado neste acesso." }); return; }
    res.json({ descricao: row.descricao ?? null });
  } catch (error) {
    req.log?.error({ err: error }, "Falha ao consultar descrição importada");
    res.status(500).json({ error: "Não foi possível consultar a descrição importada." });
  }
});

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
        CASE WHEN c.origem = 'ics' THEN
          COALESCE(c.recorrencia, '') <> '' OR
          (left(c.chave, length(c.ical_uid) + 1) = c.ical_uid || '|'
            AND length(c.chave) > length(c.ical_uid) + 1)
        ELSE COALESCE(NULLIF(source.body->>'recurringEventId', ''), '') <> ''
        END AS "belongsToSeries",
        CASE WHEN l.agenda_papel = 'pessoal' AND NOT ${req.tenantContext.isPlatformOwner} THEN 'Agenda pessoal'
          ELSE l.name END AS agenda,
        l.id AS "agendaId", l.color AS cor, l.agenda_papel AS papel
      FROM agenda_compromissos c
      JOIN locations l ON l.id = c.location_id
      LEFT JOIN agenda_google_source source ON source.location_id = c.location_id
        AND c.origem = 'google' AND c.chave = 'google:' || source.event_id
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
