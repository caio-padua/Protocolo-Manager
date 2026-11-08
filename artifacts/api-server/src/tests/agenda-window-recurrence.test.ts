import { describe, expect, it } from "vitest";
import { validWindowRecurrence, windowOccursOnDate } from "../lib/agenda-window-recurrence";
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
