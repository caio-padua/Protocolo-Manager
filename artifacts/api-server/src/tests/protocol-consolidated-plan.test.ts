import { describe, expect, it } from "vitest";
import { planProtocolWithAvailableSlots, type AvailableProtocolSlot, type ExactScheduleItem } from "../lib/protocol-exact-schedule";

const limits = { toleranceDays: 4, minIntervalReductionDays: 4 };
const dateAt = (base: string, day: number) =>
  new Date(Date.parse(`${base}T12:00:00Z`) + day * 86_400_000).toISOString().slice(0, 10);
const available = (start: string, days: number, maxApplications = 6): AvailableProtocolSlot[] =>
  Array.from({ length: days }, (_, day) => ({
    date: dateAt(start, day), time: "10:00", maxApplications,
  }));

describe("Planejamento consolidado com vagas explícitas e dados sintéticos", () => {
  it("preserva todas as ocorrências, margens, intervalos e capacidade em frequências diferentes", () => {
    const start = "2030-01-07";
    const items: ExactScheduleItem[] = [7, 15, 21, 10, 40].map((intervalDays, index) => ({
      substanceId: index + 1, dose: `Dose sintética ${index + 1}`,
      totalSessions: 5, intervalDays, startDate: start,
    }));
    const slots = available(start, 170, 6);
    const result = planProtocolWithAvailableSlots(start, items, slots, limits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.globallyOptimal).toBe(false);
    expect(result.visits.flatMap(v => v.applications)).toHaveLength(25);
    expect(result.visits.length).toBeLessThan(25);
    for (const visit of result.visits) {
      expect(slots.some(slot => slot.date === visit.date && slot.time === visit.time)).toBe(true);
      expect(visit.applications.length).toBeLessThanOrEqual(6);
    }
    for (const item of items) {
      const applications = result.visits.flatMap(v => v.applications
        .filter(a => a.substanceId === item.substanceId).map(a => ({ ...a, date: v.date })));
      expect(applications.map(a => a.sessionNumber)).toEqual([1, 2, 3, 4, 5]);
      expect(applications.every(a => a.dose === item.dose)).toBe(true);
      for (let i = 0; i < applications.length; i++) {
        const row = applications[i];
        expect(Math.abs((Date.parse(row.date) - Date.parse(row.nominalDate)) / 86_400_000)).toBeLessThanOrEqual(4);
        if (i === 0) expect(row.date >= item.startDate!).toBe(true);
        if (i > 0) expect((Date.parse(row.date) - Date.parse(applications[i - 1].date)) / 86_400_000)
          .toBeGreaterThanOrEqual(item.intervalDays - 4);
      }
    }
  }, 30000);

  it("não funde aplicações de frequência curta e sinaliza confirmação da rotina", () => {
    const result = planProtocolWithAvailableSlots("2030-01-07", [
      { substanceId: 1, dose: "sintética", totalSessions: 4, intervalDays: 2 },
    ], available("2030-01-07", 12), limits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visits).toHaveLength(4);
    for (let i = 1; i < result.visits.length; i++) {
      expect((Date.parse(result.visits[i].date) - Date.parse(result.visits[i - 1].date)) / 86_400_000)
        .toBeGreaterThanOrEqual(2);
    }
    expect(result.requiresRoutineConfirmation).toBe(true);
  });

  it("respeita ausência de vaga e não antecipa a primeira aplicação", () => {
    const result = planProtocolWithAvailableSlots("2030-01-07", [
      { substanceId: 1, dose: "sintética", totalSessions: 1, intervalDays: 7 },
    ], [{ date: "2030-01-06", time: "10:00", maxApplications: 6 }], limits);
    expect(result).toEqual({ ok: false, reason: "nenhum_plano_encontrado", globallyOptimal: false });
  });

  it("prefere reunião real, mas respeita a capacidade e o horário", () => {
    const items = [1, 2].map(substanceId => ({ substanceId, dose: "sintética", totalSessions: 1, intervalDays: 7 }));
    const slots = [
      { date: "2030-01-07", time: "09:00", maxApplications: 1 },
      { date: "2030-01-07", time: "10:00", maxApplications: 2, preferenceRank: 1 },
    ];
    const result = planProtocolWithAvailableSlots("2030-01-07", items, slots, limits);
    expect(result.ok && result.visits.map(v => [v.date, v.time, v.applications.length]))
      .toEqual([["2030-01-07", "10:00", 2]]);
    expect(planProtocolWithAvailableSlots("2030-01-07", items.reverse(), slots.reverse(), limits)).toEqual(result);
  });

  it("não confunde dois horários livres no mesmo dia com uma reserva adjacente", () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      ({ substanceId: i + 1, dose: "sintética", totalSessions: 1, intervalDays: 7 }));
    const slots = [
      { date: "2030-01-07", time: "09:00", maxApplications: 6 },
      { date: "2030-01-07", time: "09:20", maxApplications: 6 },
      { date: "2030-01-08", time: "09:00", maxApplications: 7 },
    ];
    const result = planProtocolWithAvailableSlots("2030-01-07", items, slots, limits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visits).toHaveLength(1);
    expect(result.visits[0].date).toBe("2030-01-08");
    expect(result.visits[0].applications).toHaveLength(7);
  });

  it("conserva alternativa de outra data mesmo com mil horários equivalentes", () => {
    const manySlots = Array.from({ length: 1000 }, (_, i) => ({
      date: "2030-01-07",
      time: `${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
      maxApplications: 1,
    }));
    manySlots.push({ date: "2030-01-08", time: "10:00", maxApplications: 2 });
    const result = planProtocolWithAvailableSlots("2030-01-07", [
      { substanceId: 1, dose: "sintética A", totalSessions: 1, intervalDays: 7 },
      { substanceId: 2, dose: "sintética B", totalSessions: 2, intervalDays: 1 },
    ], manySlots, limits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visits.map(v => [v.date, v.applications.map(a => a.substanceId)]))
      .toEqual([["2030-01-07", [2]], ["2030-01-08", [1, 2]]]);
  });

  it("interrompe busca muito ampla com resultado explícito, sem plano parcial", () => {
    const slots: AvailableProtocolSlot[] = [];
    for (let day = 0; day < 2; day++) for (let i = 0; i < 1000; i++) {
      slots.push({ date: dateAt("2030-01-07", day),
        time: `${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
        maxApplications: i + 1 });
    }
    const items = Array.from({ length: 100 }, (_, i) => ({
      substanceId: i + 1, dose: "sintética", totalSessions: 5, intervalDays: 1,
    }));
    const result = planProtocolWithAvailableSlots("2030-01-07", items, slots, limits);
    expect(result).toEqual({ ok: false, reason: "limite_busca_atingido", globallyOptimal: false });
  }, 15000);

  it("exige confirmação para duas visitas semanais mesmo sem frequência curta", () => {
    const result = planProtocolWithAvailableSlots("2030-01-07", [
      { substanceId: 1, dose: "sintética A", totalSessions: 1, intervalDays: 7, startDate: "2030-01-07" },
      { substanceId: 2, dose: "sintética B", totalSessions: 1, intervalDays: 15, startDate: "2030-01-09" },
    ], [0, 2].map(day => ({ date: dateAt("2030-01-07", day), time: "10:00", maxApplications: 6 })),
    { toleranceDays: 0, minIntervalReductionDays: 0 });
    expect(result.ok && result.requiresRoutineConfirmation).toBe(true);
    expect(result.ok && result.clinicalAndResourceValidationRequired).toBe(true);
  });

  it("respeita os sábados alternados explicitamente autorizados, inclusive no ano novo", () => {
    const dates = ["2026-12-05", "2026-12-19", "2027-01-02", "2027-01-16", "2027-01-30"];
    const result = planProtocolWithAvailableSlots("2026-12-05", [
      { substanceId: 2, dose: "sintética", totalSessions: 5, intervalDays: 15 },
    ], available("2026-12-05", 68), {
      ...limits, restrictions: [{ substanceId: 2, allowedWeekdays: [6], allowedDates: dates }],
    });
    expect(result.ok && result.visits.map(v => v.date)).toEqual(dates);
  });

  it("considera o intervalo mínimo desde a última aplicação comprovada", () => {
    const item = [{ substanceId: 2, dose: "sintética", totalSessions: 1, intervalDays: 15 }];
    const slots = available("2030-01-07", 5);
    const result = planProtocolWithAvailableSlots("2030-01-07", item, slots, {
      ...limits, restrictions: [{ substanceId: 2, lastAppliedDate: "2030-01-02" }],
    });
    expect(result).toEqual({ ok: false, reason: "nenhum_plano_encontrado", globallyOptimal: false });
    const safe = planProtocolWithAvailableSlots("2030-01-07", item, slots, {
      ...limits, restrictions: [{ substanceId: 2, lastAppliedDate: "2029-12-27" }],
    });
    expect(safe.ok && safe.visits[0].date).toBe("2030-01-07");
    expect(planProtocolWithAvailableSlots("2030-01-07", item, slots, {
      ...limits, restrictions: [{ substanceId: 2, allowedDates: [] }],
    }).ok).toBe(false);
    expect(() => planProtocolWithAvailableSlots("2030-01-07", item, slots, {
      ...limits, restrictions: [{ substanceId: 2, allowedDates: Array(5001).fill("2030-01-07") }],
    })).toThrow("limite");
    expect(() => planProtocolWithAvailableSlots("2030-01-07", item, slots, {
      ...limits, restrictions: [{ substanceId: 2, allowedWeekdays: [0, 1, 2, 3, 4, 5, 6, 0] }],
    })).toThrow("inválida");
  });

  it("mantém uma solução ao podar progressivamente os estados", () => {
    const slots: AvailableProtocolSlot[] = [];
    for (let day = 0; day < 3; day++) for (let i = 1; i <= 25; i++) {
      slots.push({ date: dateAt("2030-01-07", day), time: `09:${String(i).padStart(2, "0")}`,
        maxApplications: i });
    }
    const result = planProtocolWithAvailableSlots("2030-01-07", [1, 2].map(substanceId => ({
      substanceId, dose: "sintética", totalSessions: 1, intervalDays: 7,
    })), slots, limits);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.searchWasPruned).toBe(true);
      expect(result.visits).toHaveLength(1);
      expect(result.visits[0].applications).toHaveLength(2);
    }
  });

  it("atravessa ano novo sem mudar o fuso e rejeita vagas ou limites inválidos", () => {
    const items = [{ substanceId: 1, dose: "sintética", totalSessions: 2, intervalDays: 7 }];
    const result = planProtocolWithAvailableSlots("2030-12-30", items, available("2030-12-30", 12),
      { toleranceDays: 0, minIntervalReductionDays: 0 });
    expect(result.ok && result.visits.map(v => v.date)).toEqual(["2030-12-30", "2031-01-06"]);
    expect(() => planProtocolWithAvailableSlots("2030-12-30", items, [], { ...limits, toleranceDays: 5 })).toThrow();
    expect(() => planProtocolWithAvailableSlots("2030-12-30", items,
      [{ date: "2030-12-30", time: "10:00", maxApplications: 1 },
       { date: "2030-12-30", time: "10:00", maxApplications: 2 }], limits)).toThrow("duplicada");
  });
});
