import { createHash } from "node:crypto";
import type { sessionsTable, substanceApplicationsTable } from "@workspace/db";

export type RecoverySession = typeof sessionsTable.$inferSelect;
export type RecoveryApplication = typeof substanceApplicationsTable.$inferSelect;

export interface LegacyRecoveryAssignment {
  sessionId: number;
  date: string;
  time: string;
  applications: { substanceId: number; sessionNumber: number }[];
}

export interface LegacyRecoveryExpectation {
  snapshot: string;
  assignments: LegacyRecoveryAssignment[];
}

/** Fotografia estável de todos os campos das sessões antigas e de suas aplicações. */
export function legacyRecoverySnapshot(
  sessions: RecoverySession[],
  applications: RecoveryApplication[],
): string {
  const applicationsBySession = new Map<number, RecoveryApplication[]>();
  for (const application of applications) {
    const group = applicationsBySession.get(application.sessionId) ?? [];
    group.push(application);
    applicationsBySession.set(application.sessionId, group);
  }
  const canonical = [...sessions]
    .sort((a, b) => a.id - b.id)
    .map(session => {
      const appRows = (applicationsBySession.get(session.id) ?? [])
        .sort((a, b) => a.id - b.id)
        .map(app => [
          app.id, app.sessionId, app.substanceId, app.dose, app.sessionNumber,
          app.totalSessions, app.status, app.availability, app.appliedAt,
          app.confirmedBy, app.confirmedAt, app.notes, app.createdAt?.toISOString() ?? null,
        ]);
      return [
        session.id, session.protocolId, session.clientId, session.professionalId,
        session.resourceId, session.durationMinutes, session.scheduledDate, session.scheduledTime,
        session.status, session.unit, session.serviceType, session.weekNumber, session.notes,
        session.googleEventId, session.googleCalendarId, session.googleSyncPendingOperation,
        session.googleSyncPendingEventId, session.googleSyncPendingCalendarId,
        session.rescheduleCount, session.rescheduledAt, session.rescheduledBy, session.nurseId,
        session.serviceAddress, session.empresaId, session.agendaArchived,
        session.createdAt?.toISOString() ?? null, appRows,
      ];
    });
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
}
