import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Google 100% simulado (pacote googleapis e token falsos): prova o que o código ENVIA, sem tocar na rede.
const calls = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), get: vi.fn(), remove: vi.fn() }));
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    calendar: () => ({ events: { insert: calls.insert, update: calls.update, get: calls.get, delete: calls.remove } }),
  },
}));
import {
  buildDescriptionBody, calendarEventExists, createCalendarEvent, deleteCalendarEvent, updateCalendarEvent,
  type CalendarEventData,
} from "../lib/google-calendar";

const EVENT_ID = "0123456789abcdef0123456789abcdef";
const CAL = "agenda-sintetica@example.invalid";
const data: CalendarEventData = {
  sessionId: 1, clientName: "Cliente sintético", clientCpf: "000.000.000-00", scheduledDate: "2030-03-04",
  scheduledTime: "09:00", durationMinutes: 60, weekNumber: 1, totalAppointments: 3, unit: "Local sintético",
  calendarId: CAL, procedureType: "im", procedureLabel: "Aplicacao Intramuscular", activeProcedureTypes: ["im", "iv"],
  substances: [
    { name: "IM sintética", dose: "dose 1", sessionNumber: 1, totalSessions: 3, status: "disp" },
    { name: "IV sintética", dose: "dose 2", sessionNumber: 1, totalSessions: 1, status: "disp" },
  ],
  clientEmail: "cliente@example.invalid", sessionStatus: "scheduled", rescheduleCount: 0,
};

beforeEach(() => {
  process.env.REPL_IDENTITY = "identidade-sintetica";
  process.env.REPLIT_CONNECTORS_HOSTNAME = "conectores.example.invalid";
  vi.stubGlobal("fetch", vi.fn(async () => ({
    json: async () => ({ items: [{ connector_name: "google-calendar", settings: { access_token: "token-sintetico", expires_at: null } }] }),
  })));
  for (const fn of Object.values(calls)) fn.mockReset();
  calls.insert.mockResolvedValue({ data: { id: EVENT_ID } });
  calls.update.mockResolvedValue({ data: {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Evento do Google: sem convite, sem participante, o mesmo evento é atualizado", () => {
  it("cria com o identificador reservado, sendUpdates none e sem participantes (mesmo com e-mail do cliente)", async () => {
    const id = await createCalendarEvent({ ...data, eventId: EVENT_ID });
    expect(id).toBe(EVENT_ID);
    expect(calls.insert).toHaveBeenCalledTimes(1);
    const arg = calls.insert.mock.calls[0][0];
    expect(arg.calendarId).toBe(CAL);
    expect(arg.sendUpdates).toBe("none");
    expect(arg.requestBody.id).toBe(EVENT_ID);
    expect(Object.keys(arg.requestBody)).not.toContain("attendees");
    expect(JSON.stringify(arg)).not.toContain("cliente@example.invalid");
    // Todas as substâncias da visita estão na descrição do MESMO evento.
    expect(arg.requestBody.description).toContain("[1/3] IM sintética dose 1");
    expect(arg.requestBody.description).toContain("[1/1] IV sintética dose 2");
    expect(arg.requestBody.description).toBe(buildDescriptionBody(data));
    expect(arg.requestBody.start.timeZone).toBe("America/Sao_Paulo");
  });

  it("atualiza o MESMO evento (events.update com o identificador) sem disparar convite", async () => {
    await updateCalendarEvent(EVENT_ID, CAL, data);
    expect(calls.insert).not.toHaveBeenCalled();
    const arg = calls.update.mock.calls[0][0];
    expect(arg).toMatchObject({ calendarId: CAL, eventId: EVENT_ID, sendUpdates: "none" });
    expect(Object.keys(arg.requestBody)).not.toContain("attendees");
    expect(arg.requestBody.description).toContain("IV sintética dose 2");
  });

  it("apagar também não notifica ninguém", async () => {
    await deleteCalendarEvent(EVENT_ID, CAL);
    expect(calls.remove.mock.calls[0][0]).toMatchObject({ calendarId: CAL, eventId: EVENT_ID, sendUpdates: "none" });
  });

  it("conferência do identificador: existe, não existe (404) e erro real nunca vira 'não existe'", async () => {
    calls.get.mockResolvedValueOnce({ data: { id: EVENT_ID } });
    expect(await calendarEventExists(EVENT_ID, CAL)).toBe(true);
    calls.get.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { code: 404 }));
    expect(await calendarEventExists(EVENT_ID, CAL)).toBe(false);
    calls.get.mockRejectedValueOnce(Object.assign(new Error("Backend Error"), { code: 500 }));
    await expect(calendarEventExists(EVENT_ID, CAL)).rejects.toThrow("Backend Error");
    calls.get.mockRejectedValueOnce(new Error("rede caiu"));
    await expect(calendarEventExists(EVENT_ID, CAL)).rejects.toThrow("rede caiu");
    expect(calls.get.mock.calls[0][0]).toMatchObject({ calendarId: CAL, eventId: EVENT_ID });
  });

  it("prazo da atualização cobre token + envio: o que sobra vai ao Google como limite da chamada", async () => {
    await updateCalendarEvent(EVENT_ID, CAL, data, { timeoutMs: 5000 });
    const sent = calls.update.mock.calls[0][1] as { timeout: number };
    expect(sent.timeout).toBeGreaterThan(0);
    expect(sent.timeout).toBeLessThanOrEqual(5000);
  });

  it("T-K1-12: token que demora além do prazo NÃO envia nada ao Google (sem escrita tardia com descrição velha)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
      return { json: async () => ({ items: [{ connector_name: "google-calendar", settings: { access_token: "token-sintetico", expires_at: null } }] }) };
    }));
    await expect(updateCalendarEvent(EVENT_ID, CAL, data, { timeoutMs: 30 })).rejects.toThrow("nada foi enviado");
    expect(calls.update).not.toHaveBeenCalled();
  });
});

