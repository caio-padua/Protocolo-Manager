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
import { GoogleConflito, conferirEventoRemoto } from "../lib/google-conflito";

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
  // Evento legado, sem marca do sistema: não há base para provar edição remota, então a atualização segue.
  calls.get.mockResolvedValue({ data: { status: "confirmed" } });
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

// Conflito de edição concorrente: o sistema nunca sobrescreve em silêncio o que alguém mudou direto no Google.
describe("Conflito com o Google: leitura antes da escrita, marca privada e decisão humana", () => {
  /** Estado do evento no Google logo depois de o sistema gravá-lo (o que o Google devolveria em events.get). */
  const remotoComoGravado = (body: any) => ({
    status: "confirmed", summary: body.summary, description: body.description,
    start: { dateTime: body.start.dateTime.replace("Z", "+00:00") }, end: { dateTime: body.end.dateTime.replace("Z", "+00:00") },
    extendedProperties: body.extendedProperties,
  });
  const criarEPegarRemoto = async () => {
    await createCalendarEvent({ ...data, eventId: EVENT_ID });
    return remotoComoGravado(calls.insert.mock.calls[0][0].requestBody);
  };

  it("o evento criado leva a marca privada (hash) e nenhum dado clínico dentro dela", async () => {
    await createCalendarEvent({ ...data, eventId: EVENT_ID });
    const body = calls.insert.mock.calls[0][0].requestBody;
    const marca = body.extendedProperties.private.paxterFp as string;
    expect(marca).toMatch(/^[0-9a-f]{24}$/);
    expect(JSON.stringify(body.extendedProperties)).not.toContain("sintético");
    expect(JSON.stringify(body.extendedProperties)).not.toContain("000.000.000-00");
  });

  it("sem alteração remota: atualiza o mesmo evento e regrava a marca", async () => {
    calls.get.mockResolvedValue({ data: await criarEPegarRemoto() });
    await updateCalendarEvent(EVENT_ID, CAL, { ...data, weekNumber: 2 });
    expect(calls.get).toHaveBeenCalledWith({ calendarId: CAL, eventId: EVENT_ID }, undefined);
    expect(calls.update).toHaveBeenCalledTimes(1);
    expect(calls.update.mock.calls[0][0].requestBody.extendedProperties.private.paxterFp).toMatch(/^[0-9a-f]{24}$/);
  });

  it("alguém mudou o horário no Google: bloqueia, devolve o horário remoto e NÃO chama events.update", async () => {
    const remoto = await criarEPegarRemoto();
    calls.get.mockResolvedValue({ data: { ...remoto, start: { dateTime: "2030-03-04T14:00:00-03:00" }, end: { dateTime: "2030-03-04T15:00:00-03:00" } } });
    const erro = await updateCalendarEvent(EVENT_ID, CAL, data).catch((e) => e);
    expect(erro).toBeInstanceOf(GoogleConflito);
    expect(erro.tipo).toBe("alterado");
    expect(erro.remoto.inicio).toBe("2030-03-04T17:00:00.000Z");
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("alguém mudou só o título no Google: também é conflito", async () => {
    const remoto = await criarEPegarRemoto();
    calls.get.mockResolvedValue({ data: { ...remoto, summary: "Título editado no Google" } });
    await expect(updateCalendarEvent(EVENT_ID, CAL, data)).rejects.toBeInstanceOf(GoogleConflito);
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("alguém editou só a descrição no Google: NÃO é conflito (texto pode ser normalizado pelo Google)", async () => {
    const remoto = await criarEPegarRemoto();
    calls.get.mockResolvedValue({ data: { ...remoto, description: "descrição reescrita" } });
    await updateCalendarEvent(EVENT_ID, CAL, data);
    expect(calls.update).toHaveBeenCalledTimes(1);
  });

  it("evento apagado no Google: conflito 'apagado', nada é recriado nem regravado", async () => {
    calls.get.mockResolvedValue({ data: { status: "cancelled" } });
    const erro = await updateCalendarEvent(EVENT_ID, CAL, data).catch((e) => e);
    expect(erro).toBeInstanceOf(GoogleConflito);
    expect(erro.tipo).toBe("apagado");
    expect(calls.update).not.toHaveBeenCalled();
    expect(calls.insert).not.toHaveBeenCalled();
  });

  it("decisão humana (forcar): grava por cima sem reler e deixa a marca nova", async () => {
    await updateCalendarEvent(EVENT_ID, CAL, data, { forcar: true });
    expect(calls.get).not.toHaveBeenCalled();
    expect(calls.update).toHaveBeenCalledTimes(1);
  });

  it("falha ao LER o evento nunca vira escrita às cegas", async () => {
    calls.get.mockRejectedValue(Object.assign(new Error("Backend Error"), { code: 500 }));
    await expect(updateCalendarEvent(EVENT_ID, CAL, data)).rejects.toThrow("Backend Error");
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("conferirEventoRemoto: sem marca não prova nada; dia inteiro movido é detectado", () => {
    expect(conferirEventoRemoto({ status: "confirmed", summary: "x" }).tipo).toBe("sem_marca");
    expect(conferirEventoRemoto({
      status: "confirmed", summary: "x", start: { date: "2030-03-05" }, end: { date: "2030-03-06" },
      extendedProperties: { private: { paxterFp: "000000000000000000000000" } },
    }).tipo).toBe("alterado");
  });
});

