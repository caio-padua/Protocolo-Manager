import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  sessions: [
    { id: 1, clientId: 5, protocolId: 7, empresaId: 5, agendaArchived: false, scheduledDate: "2030-01-01", scheduledTime: "09:00", status: "scheduled", weekNumber: 1, serviceType: "clinic", createdAt: new Date("2030-01-01") },
    { id: 2, clientId: 5, protocolId: 7, empresaId: 5, agendaArchived: true, scheduledDate: "2030-01-01", scheduledTime: "10:00", status: "completed", weekNumber: 2, serviceType: "clinic", createdAt: new Date("2030-01-01") },
  ],
}));

vi.mock("@workspace/db", () => {
  const tables = {
    sessionsTable: { name: "sessions", id: "id", empresaId: "empresaId" },
    clientsTable: { name: "clients", id: "id" },
    protocolsTable: { name: "protocols", id: "id" },
    professionalsTable: { name: "professionals", id: "id" },
    substancesTable: { name: "substances", id: "id" },
    substanceApplicationsTable: { name: "applications", sessionId: "sessionId" },
    locationsTable: { name: "locations", id: "id" },
    agendaResourcesTable: { name: "resources", id: "id" },
    agendaCalendarsTable: { name: "calendars", id: "id" },
    locationProfessionalsTable: { name: "locationProfessionals", id: "id" },
    agendaWindowsTable: { name: "windows", id: "id" },
    agendaExceptionsTable: { name: "exceptions", id: "id" },
    agendaSettingsTable: { name: "settings", id: "id" },
  };
  const db = { select: () => ({ from: (table: {name: string}) => ({
      where: (condition: {column: string, value: unknown}) => {
        let rows: any[] = [];
        if (table.name === "sessions") {
          rows = condition.column === "id"
            ? data.sessions.filter(s => s.id === condition.value)
            : data.sessions.filter(s => s.empresaId === condition.value);
        } else if (table.name === "clients") rows = [{ id: 5, name: "Cliente Sintético" }];
        else if (table.name === "protocols") rows = [{ id: 7, title: "Protocolo Sintético" }];
        return Object.assign(Promise.resolve(rows), { for: async () => rows });
      },
    }) }), transaction: async (callback: (tx: any) => unknown) => callback(db) };
  return { ...tables, db };
});
vi.mock("drizzle-orm", () => ({ eq: (column: string, value: unknown) => ({ column, value }), and: () => ({}), or: () => ({}), isNull: () => ({}), inArray: () => ({}) }));
vi.mock("../middleware/moduleGuard.js", () => ({ moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
// Chamador sintético autorizado: esta suíte verifica arquivamento, não login.
vi.mock("../middleware/tenantContext.js", () => ({
  resolveEmpresaId: () => 5,
  requirePlatformOwner: (_req:unknown,_res:unknown,next:()=>void) => next(),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req:any,_res:unknown,next:()=>void) => {
    req.tenantContext={authenticated:true,empresaId:5,isPlatformOwner:true,professionalId:901};
    next();
  },
}));
vi.mock("../lib/google-calendar.js", () => ({
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  updateCalendarEventDescription: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  listCalendars: vi.fn(),
  verifyClinicAccount: vi.fn(),
}));

import sessionsRouter from "../routes/sessions.js";
import googleCalendarRouter from "../routes/google-calendar.js";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "../lib/google-calendar.js";
import { cancelBooking } from "../lib/agenda-booking.js";

const app = express();
app.use(express.json(), sessionsRouter, googleCalendarRouter);

describe("compromissos retirados preservam o histórico clínico", () => {
  it("não mostra compromisso arquivado na lista geral da agenda", async () => {
    const response = await request(app).get("/sessions?dateFrom=2030-01-01&dateTo=2030-01-01");
    expect(response.status).toBe(200);
    expect(response.body.map((s: {id: number}) => s.id)).toEqual([1]);
  });

  it("mantém sessão arquivada na consulta clínica por cliente", async () => {
    const response = await request(app).get("/sessions?clientId=5");
    expect(response.status).toBe(200);
    expect(response.body.map((s: {id: number}) => s.id)).toEqual([1, 2]);
  });

  it("impede sincronizar sessão arquivada ou alterar o Google", async () => {
    const response = await request(app).post("/google-calendar/sync-session/2");
    expect(response.status).toBe(404);
    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(updateCalendarEvent).not.toHaveBeenCalled();
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("impede cancelamento antigo de apagar o evento original no Google", async () => {
    const result = await cancelBooking(2);
    expect(result.status).toBe(404);
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
  });
});
