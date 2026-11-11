import { describe, expect, it } from "vitest";
import { janelasSobrepostas, validWindowRecurrence, windowOccursOnDate } from "../lib/agenda-window-recurrence";
import { computeAgendaSlots } from "../lib/agenda-motor";

describe("expediente quinzenal", () => {
  const saturday = { weekday: 6, repeatWeeks: 2, anchorDate: "2026-11-21" };

  it("abre a partir da referência, um sábado sim e outro não", () => {
    expect(windowOccursOnDate(saturday, "2026-11-14")).toBe(false);
    expect(windowOccursOnDate(saturday, "2026-11-21")).toBe(true);
    expect(windowOccursOnDate(saturday, "2026-11-28")).toBe(false);
    expect(windowOccursOnDate(saturday, "2026-12-05")).toBe(true);
    expect(windowOccursOnDate(saturday, "2026-12-19")).toBe(true);
    expect(windowOccursOnDate(saturday, "2027-01-02")).toBe(true);
  });

  it("não libera datas inválidas nem uma âncora em outro dia", () => {
    expect(validWindowRecurrence(6, 2, "2026-11-20")).toBe(false);
    expect(validWindowRecurrence(6, 2, "2026-02-30")).toBe(false);
    expect(validWindowRecurrence(6, 2, null)).toBe(false);
    expect(validWindowRecurrence(6, 1, "2026-11-21")).toBe(false);
    expect(windowOccursOnDate(saturday, "2026-11-22")).toBe(false);
    expect(windowOccursOnDate(saturday, "2026-02-30")).toBe(false);
  });

  it("mantém janelas semanais e respeita os bloqueios do motor", () => {
    expect(windowOccursOnDate({ weekday: 1, repeatWeeks: 1, anchorDate: null }, "2026-11-16")).toBe(true);
    const result = computeAgendaSlots({
      windows: windowOccursOnDate(saturday, "2026-11-21") ? [{ startTime: "09:00", endTime: "13:00" }] : [],
      slotMinutes: 20, settings: { blockMinutes: 120, triggerPercent: 60, minLeadHours: 0 },
      occupiedTimes: new Set(), now: new Date("2026-11-20T12:00:00Z"), date: "2026-11-21",
      isException: true,
    });
    expect(result.slots).toEqual([]);
    expect(result.reason).toBe("excecao");
  });
});

describe("mais padrões de repetição", () => {
  const sab = (repeatWeeks: number, anchorDate: string | null = null) => ({ weekday: 6, repeatWeeks, anchorDate });

  it("a cada 3 e a cada 4 semanas contam da data inicial", () => {
    expect(windowOccursOnDate(sab(3, "2026-11-21"), "2026-12-12")).toBe(true);
    expect(windowOccursOnDate(sab(3, "2026-11-21"), "2026-12-05")).toBe(false);
    expect(windowOccursOnDate(sab(4, "2026-11-21"), "2026-12-19")).toBe(true);
    expect(windowOccursOnDate(sab(4, "2026-11-21"), "2026-12-12")).toBe(false);
  });

  it("1º, 3º e último sábado do mês", () => {
    expect(windowOccursOnDate(sab(101), "2026-11-07")).toBe(true);
    expect(windowOccursOnDate(sab(101), "2026-11-14")).toBe(false);
    expect(windowOccursOnDate(sab(103), "2026-11-21")).toBe(true);
    expect(windowOccursOnDate(sab(105), "2026-11-28")).toBe(true);
    expect(windowOccursOnDate(sab(105), "2026-11-21")).toBe(false);
    // outubro de 2026 tem 5 sábados: o 4º é o dia 24 e o último é o dia 31
    expect(windowOccursOnDate(sab(105), "2026-10-31")).toBe(true);
    expect(windowOccursOnDate(sab(104), "2026-10-24")).toBe(true);
    expect(windowOccursOnDate(sab(105), "2026-10-24")).toBe(false);
    expect(windowOccursOnDate(sab(104), "2026-10-31")).toBe(false);
  });

  it("valida: mensal não leva data inicial, intervalo leva; códigos soltos são recusados", () => {
    expect(validWindowRecurrence(6, 101, null)).toBe(true);
    expect(validWindowRecurrence(6, 101, "2026-11-07")).toBe(false);
    expect(validWindowRecurrence(6, 4, "2026-11-21")).toBe(true);
    expect(validWindowRecurrence(6, 4, null)).toBe(false);
    expect(validWindowRecurrence(6, 5, "2026-11-21")).toBe(false);
    expect(validWindowRecurrence(6, 106, null)).toBe(false);
  });

  it("só acusa sobreposição quando as datas podem coincidir", () => {
    const j = (repeatWeeks: number, anchorDate: string | null, startTime: string, endTime: string) =>
      ({ weekday: 6, repeatWeeks, anchorDate, startTime, endTime });
    expect(janelasSobrepostas([j(101, null, "09:00", "13:00"), j(103, null, "09:00", "13:00")])).toBe(false);
    expect(janelasSobrepostas([j(101, null, "09:00", "13:00"), j(101, null, "12:00", "14:00")])).toBe(true);
    expect(janelasSobrepostas([j(2, "2026-11-21", "09:00", "13:00"), j(2, "2026-11-28", "09:00", "13:00")])).toBe(false);
    expect(janelasSobrepostas([j(2, "2026-11-21", "09:00", "13:00"), j(4, "2026-11-21", "10:00", "12:00")])).toBe(true);
    expect(janelasSobrepostas([j(1, null, "09:00", "13:00"), j(101, null, "10:00", "12:00")])).toBe(true);
    expect(janelasSobrepostas([j(1, null, "09:00", "13:00"), j(1, null, "14:00", "16:00")])).toBe(false);
  });
});
