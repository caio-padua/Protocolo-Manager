import { eq } from "drizzle-orm";
import { db, substanceApplicationsTable, substancesTable } from "@workspace/db";
import { durationFromProcedureTypes, type IcsEventInput } from "./ics";

// SUB-04: monta os eventos .ics (IcsEventInput) a partir de linhas de sessão.
// Helper ÚNICO usado pelo feed iCal assinado (ical.ts) e pelo onboarding ao
// fechar protocolo (protocols.ts), para não duplicar a leitura sessão->evento.
export interface SessionRowForIcs {
  id: number;
  scheduledDate: string;
  scheduledTime: string;
  weekNumber: number;
  unit: string | null;
  status: string;
}

export async function buildEventsForSessions(
  sessions: SessionRowForIcs[],
  clientName: string,
): Promise<IcsEventInput[]> {
  const events: IcsEventInput[] = [];
  for (const session of sessions) {
    const apps = await db.select().from(substanceApplicationsTable)
      .where(eq(substanceApplicationsTable.sessionId, session.id));
    const dispApps = apps.filter(a => a.availability === "disp");

    const procedureTypes: string[] = [];
    const descriptionLines: string[] = [];
    for (const app of dispApps) {
      const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (!substance) continue;
      procedureTypes.push(substance.procedureType ?? "iv");
      descriptionLines.push(
        app.sessionNumber > 0
          ? `${substance.name} ${app.sessionNumber}/${app.totalSessions}`
          : substance.name,
      );
    }

    events.push({
      sessionId: session.id,
      clientName,
      scheduledDate: session.scheduledDate,
      scheduledTime: session.scheduledTime,
      weekNumber: session.weekNumber,
      unit: session.unit,
      status: session.status,
      durationMinutes: durationFromProcedureTypes(procedureTypes),
      descriptionLines,
    });
  }
  return events;
}
