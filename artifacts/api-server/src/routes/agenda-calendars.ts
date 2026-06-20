import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agendaCalendarsTable } from "@workspace/db";
import {
  createCalendar,
  renameCalendar,
  deleteCalendar,
  shareCalendar,
  listCalendars,
} from "../lib/google-calendar";

const router: IRouter = Router();

const KINDS = ["geral", "medico", "enfermagem", "outro"] as const;
type Kind = (typeof KINDS)[number];
function normalizeKind(raw: unknown): Kind {
  const s = String(raw ?? "").trim().toLowerCase();
  return (KINDS as readonly string[]).includes(s) ? (s as Kind) : "outro";
}

// Confirma, via calendarList do Google, se um calendário é a agenda primária da conta.
// Em caso de falha de leitura, retorna false (o Google bloqueia primary de qualquer forma).
async function isPrimaryCalendar(googleCalendarId: string): Promise<boolean> {
  try {
    const cals = await listCalendars();
    return cals.some((c) => c.id === googleCalendarId && c.primary);
  } catch {
    return false;
  }
}

// Erro do Google indicando que o calendário já não existe (apagado manualmente).
function isGoneError(err: any): boolean {
  const code = err?.code ?? err?.response?.status;
  return code === 404 || code === 410;
}

function serialize(row: typeof agendaCalendarsTable.$inferSelect) {
  return {
    id: row.id,
    googleCalendarId: row.googleCalendarId,
    name: row.name,
    kind: row.kind,
    locationId: row.locationId ?? null,
    managedBySystem: row.managedBySystem,
    color: row.color,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET — lista as agendas do banco cruzadas com o que existe na conta Google.
// status: "synced" (existe nos dois), "orphan_db" (existe no banco, sumiu do Google).
// googleOnly: agendas na conta Google ainda NÃO importadas (candidatas a /import).
router.get("/agenda-calendars", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(agendaCalendarsTable);
    let googleCals: any[] = [];
    let connected = true;
    try {
      googleCals = await listCalendars();
    } catch {
      connected = false;
    }
    const googleById = new Map<string, any>(googleCals.map((c) => [c.id, c]));
    const knownIds = new Set(rows.map((r) => r.googleCalendarId));

    const calendars = rows.map((r) => {
      const g = googleById.get(r.googleCalendarId);
      return {
        ...serialize(r),
        status: connected ? (g ? "synced" : "orphan_db") : "unknown",
        googleSummary: g?.summary ?? null,
        primary: g?.primary ?? false,
      };
    });

    const googleOnly = googleCals
      .filter((c) => !knownIds.has(c.id))
      .map((c) => ({
        googleCalendarId: c.id,
        name: c.summary ?? c.id,
        primary: !!c.primary,
        accessRole: c.accessRole ?? null,
      }));

    res.json({ connected, calendars, googleOnly });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST — cria a agenda na conta Google E grava o espelho no banco.
router.post("/agenda-calendars", async (req, res): Promise<void> => {
  const { name, kind, locationId, color, share } = req.body as {
    name?: string;
    kind?: string;
    locationId?: number | null;
    color?: string;
    share?: string;
  };
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    res.status(400).json({ error: "Nome da agenda é obrigatório" });
    return;
  }
  try {
    const googleCalendarId = await createCalendar(trimmed);
    if (share && String(share).trim()) {
      try {
        await shareCalendar(googleCalendarId, String(share).trim(), "writer");
      } catch (shareErr: any) {
        // Compartilhar é melhor-esforço; não derruba a criação.
        console.warn("shareCalendar falhou:", shareErr.message);
      }
    }
    const [created] = await db
      .insert(agendaCalendarsTable)
      .values({
        googleCalendarId,
        name: trimmed,
        kind: normalizeKind(kind),
        locationId: typeof locationId === "number" ? locationId : null,
        ...(color ? { color } : {}),
        managedBySystem: true,
        active: true,
      })
      .returning();
    res.status(201).json(serialize(created));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT — renomeia/atualiza. Renomear no Google só quando managedBySystem=true e não primária.
router.put("/agenda-calendars/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const [row] = await db.select().from(agendaCalendarsTable).where(eq(agendaCalendarsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Agenda não encontrada" });
    return;
  }
  const { name, kind, locationId, color, active, managedBySystem } = req.body as {
    name?: string;
    kind?: string;
    locationId?: number | null;
    color?: string;
    active?: boolean;
    managedBySystem?: boolean;
  };

  const newName = name !== undefined ? String(name).trim() : row.name;
  if (!newName) {
    res.status(400).json({ error: "Nome da agenda não pode ficar vazio" });
    return;
  }

  // Renomeia no Google só se o nome mudou e a agenda é gerida pelo sistema.
  if (name !== undefined && newName !== row.name) {
    if (!row.managedBySystem) {
      res.status(409).json({
        error: "Agenda importada (não gerida pelo sistema) não pode ser renomeada no Google por aqui",
      });
      return;
    }
    // Linha vermelha: nunca renomear a agenda primária da conta.
    if (await isPrimaryCalendar(row.googleCalendarId)) {
      res.status(409).json({ error: "A agenda primária da conta não pode ser renomeada" });
      return;
    }
    try {
      await renameCalendar(row.googleCalendarId, newName);
    } catch (err: any) {
      res.status(502).json({ error: "Falha ao renomear no Google: " + err.message });
      return;
    }
  }

  const [updated] = await db
    .update(agendaCalendarsTable)
    .set({
      name: newName,
      ...(kind !== undefined ? { kind: normalizeKind(kind) } : {}),
      ...(locationId !== undefined ? { locationId: typeof locationId === "number" ? locationId : null } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
      // "Liberar gestão": ação consciente do CEO que assume o controle de uma agenda importada.
      ...(managedBySystem !== undefined ? { managedBySystem: !!managedBySystem } : {}),
    })
    .where(eq(agendaCalendarsTable.id, id))
    .returning();
  res.json(serialize(updated));
});

// DELETE — duas intenções distintas e conscientes:
//   ?keepGoogle=1  -> "remover vínculo": apaga só o espelho do banco, NUNCA toca no Google.
//                     Seguro para qualquer agenda (inclusive importada / managedBySystem=false).
//   sem flag       -> "apagar de verdade": apaga no Google E no banco. Só permitido para
//                     agendas managedBySystem=true e nunca para a primária.
// Linha vermelha: agenda importada (managedBySystem=false) NÃO é apagada do Google sem o CEO
// antes "liberar a gestão" (PUT managedBySystem=true).
router.delete("/agenda-calendars/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const [row] = await db.select().from(agendaCalendarsTable).where(eq(agendaCalendarsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Agenda não encontrada" });
    return;
  }

  const unlinkOnly = req.query.keepGoogle === "1";

  // "Remover vínculo": só limpa o espelho do banco; Google permanece intacto.
  if (unlinkOnly) {
    await db.delete(agendaCalendarsTable).where(eq(agendaCalendarsTable.id, id));
    res.json({ success: true, deletedGoogle: false, unlinked: true });
    return;
  }

  // "Apagar de verdade" exige gestão pelo sistema (ação consciente do CEO via "liberar gestão").
  if (!row.managedBySystem) {
    res.status(409).json({
      error:
        "Agenda importada protegida. Use 'Remover vínculo' (mantém no Google) ou 'Liberar gestão' antes de apagar de verdade.",
    });
    return;
  }

  // Trava: nunca apagar a agenda primária da conta.
  if (await isPrimaryCalendar(row.googleCalendarId)) {
    res.status(409).json({ error: "A agenda primária da conta não pode ser apagada" });
    return;
  }

  try {
    await deleteCalendar(row.googleCalendarId);
  } catch (err: any) {
    // Caso extremo 4: agenda sumiu do Google (órfã). Já não existe lá -> limpa o espelho.
    if (isGoneError(err)) {
      await db.delete(agendaCalendarsTable).where(eq(agendaCalendarsTable.id, id));
      res.json({ success: true, deletedGoogle: false, orphanCleaned: true });
      return;
    }
    res.status(502).json({ error: "Falha ao apagar no Google: " + err.message });
    return;
  }

  await db.delete(agendaCalendarsTable).where(eq(agendaCalendarsTable.id, id));
  res.json({ success: true, deletedGoogle: true });
});

// POST /import — registra no banco uma agenda que JÁ existe na conta Google (managedBySystem=false).
router.post("/agenda-calendars/import", async (req, res): Promise<void> => {
  const { googleCalendarId, kind, locationId, color } = req.body as {
    googleCalendarId?: string;
    kind?: string;
    locationId?: number | null;
    color?: string;
  };
  const gid = String(googleCalendarId ?? "").trim();
  if (!gid) {
    res.status(400).json({ error: "googleCalendarId é obrigatório" });
    return;
  }
  const [existing] = await db
    .select()
    .from(agendaCalendarsTable)
    .where(eq(agendaCalendarsTable.googleCalendarId, gid));
  if (existing) {
    res.status(409).json({ error: "Essa agenda já está registrada", id: existing.id });
    return;
  }
  try {
    const cals = await listCalendars();
    const g = cals.find((c) => c.id === gid);
    if (!g) {
      res.status(404).json({ error: "Agenda não encontrada na conta Google" });
      return;
    }
    const [created] = await db
      .insert(agendaCalendarsTable)
      .values({
        googleCalendarId: gid,
        name: g.summary ?? gid,
        kind: normalizeKind(kind),
        locationId: typeof locationId === "number" ? locationId : null,
        ...(color ? { color } : {}),
        managedBySystem: false,
        active: true,
      })
      .returning();
    res.status(201).json(serialize(created));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
