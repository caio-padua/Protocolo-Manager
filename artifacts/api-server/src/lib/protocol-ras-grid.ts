import { db, sessionsTable, substanceApplicationsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

export interface PersistedRasRow {
  number: number;
  date: string;
  counters: (string | null)[];
}

/** Exact protocols use the recorded agenda. Legacy weekly printing is untouched. */
export async function loadProtocolRasGrid(
  protocol: { id: number; schedulingMode: string },
  substanceIds: number[],
): Promise<PersistedRasRow[] | undefined> {
  if (protocol.schedulingMode !== "exact") return undefined;
  if (!substanceIds.length || new Set(substanceIds).size !== substanceIds.length) {
    throw new Error("RASP: identificação ambígua das substâncias");
  }
  const sessions = await db.select().from(sessionsTable)
    .where(eq(sessionsTable.protocolId, protocol.id))
    .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.id));
  if (!sessions.length) throw new Error("RASP: valide o protocolo antes de emitir a grade");
  const rows: PersistedRasRow[] = [];
  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    const apps = (await db.select().from(substanceApplicationsTable)
      .where(eq(substanceApplicationsTable.sessionId, session.id)))
      .filter(app => app.availability === "disp");
    if (!apps.length || apps.some(app => !substanceIds.includes(app.substanceId))) {
      throw new Error("RASP: aplicações inconsistentes com o protocolo");
    }
    rows.push({
      number: session.weekNumber,
      date: session.scheduledDate,
      counters: substanceIds.map(id => {
        const occurrences = apps.filter(app => app.substanceId === id)
          .sort((a, b) => a.sessionNumber - b.sessionNumber);
        if (!occurrences.length) return null;
        const total = occurrences[0].totalSessions;
        if (occurrences.some(app => app.totalSessions !== total ||
            app.sessionNumber < 1 || app.sessionNumber > total)) {
          throw new Error("RASP: contagem de aplicações inconsistente");
        }
        return `${occurrences.map(app => app.sessionNumber).join("·")}/${total}`;
      }),
    });
  }
  if (!rows.length) throw new Error("RASP: não há sessões ativas para impressão");
  return rows;
}
