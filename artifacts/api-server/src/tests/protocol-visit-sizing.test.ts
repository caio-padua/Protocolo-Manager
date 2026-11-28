import { describe, expect, it } from "vitest";
import { periodsForSeconds, sizeVisit } from "../lib/protocol-visit-sizing";
import {
  planProtocolWithAvailableSlots, type AvailableProtocolSlot, type ExactScheduleItem,
} from "../lib/protocol-exact-schedule";

// Dados sintéticos. 150 s = aplicação intramuscular/subcutânea de 2,5 minutos;
// 1800 s = implante ou procedimento de 30 minutos.
const IM = { durationSeconds: 150, requiresDoctor: false };
const IMPLANT = { durationSeconds: 1800, requiresDoctor: true };
const many = (count: number, base = IM) => Array.from({ length: count }, () => base);

describe("Dimensionamento da visita de enfermagem", () => {
  it("uma a seis aplicações cabem em um período de vinte minutos", () => {
    for (const count of [1, 2, 5, 6]) {
      const sizing = sizeVisit(many(count));
      expect(sizing.nursingPeriods).toBe(1);
      expect(sizing.reservedMinutes).toBe(20);
      expect(sizing.requiresDoctor).toBe(false);
    }
  });

  it("a sétima aplicação exige um segundo período adjacente", () => {
    expect(sizeVisit(many(7)).nursingPeriods).toBe(2);
    expect(sizeVisit(many(7)).reservedMinutes).toBe(40);
    expect(sizeVisit(many(12)).nursingPeriods).toBe(2);
    expect(sizeVisit(many(13)).nursingPeriods).toBe(3);
  });

  it("implante ocupa dois períodos e exige o médico", () => {
    const sizing = sizeVisit([IMPLANT]);
    expect(sizing.nursingPeriods).toBe(2);
    expect(sizing.reservedMinutes).toBe(40);
    expect(sizing.requiresDoctor).toBe(true);
  });

  it("implante mais uma aplicação comum passa de trinta minutos e pede o terceiro período", () => {
    const sizing = sizeVisit([IMPLANT, IM]);
    expect(sizing.totalSeconds).toBe(1950);
    expect(sizing.nursingPeriods).toBe(3);
    expect(sizing.requiresDoctor).toBe(true);
  });

  it("não presume participação médica desconhecida nem aceita duração inválida", () => {
    expect(() => sizeVisit([{ durationSeconds: 150, requiresDoctor: null }])).toThrow(/Participação médica/);
    expect(() => sizeVisit([{ durationSeconds: 150, requiresDoctor: undefined }])).toThrow(/Participação médica/);
    for (const durationSeconds of [0, -150, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => sizeVisit([{ durationSeconds, requiresDoctor: false }])).toThrow(/Duração/);
    }
    expect(() => sizeVisit([])).toThrow(/sem aplicações/);
  });

  it("converte tempo de procedimento em períodos inteiros, sem erro nos limites", () => {
    expect(periodsForSeconds(1)).toBe(1);
    expect(periodsForSeconds(900)).toBe(1);
    expect(periodsForSeconds(901)).toBe(2);
    expect(periodsForSeconds(1800)).toBe(2);
    expect(periodsForSeconds(1801)).toBe(3);
    expect(() => periodsForSeconds(0)).toThrow();
    expect(() => periodsForSeconds(1.5)).toThrow();
  });
});

const limits = { toleranceDays: 4, minIntervalReductionDays: 4 };
const dateAt = (base: string, day: number) =>
  new Date(Date.parse(`${base}T12:00:00Z`) + day * 86_400_000).toISOString().slice(0, 10);
const slotsFor = (start: string, days: number, extra: Partial<AvailableProtocolSlot> = {}): AvailableProtocolSlot[] =>
  Array.from({ length: days }, (_, day) => ({
    date: dateAt(start, day), time: "10:00", maxApplications: 100, capacityPeriods: 1, ...extra,
  }));
const item = (substanceId: number, intervalDays: number, totalSessions: number,
  kind: { durationSeconds: number; requiresDoctor: boolean }, startDate?: string): ExactScheduleItem =>
  ({ substanceId, dose: `Dose ${substanceId}`, intervalDays, totalSessions, startDate, ...kind });

describe("Planejamento por tempo com participação médica", () => {
  const start = "2030-01-07";

  it("os cinco intervalos do responsável continuam reunidos e cada visita cabe em um período", () => {
    const items = [7, 15, 21, 10, 40].map((interval, index) => item(index + 1, interval, 5, IM, start));
    const result = planProtocolWithAvailableSlots(start, items, slotsFor(start, 170), limits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visits.flatMap(v => v.applications)).toHaveLength(25);
    expect(result.visits.length).toBeLessThan(25);
    for (const visit of result.visits) {
      expect(visit.sizing?.nursingPeriods).toBe(1);
      expect(visit.sizing?.requiresDoctor).toBe(false);
    }
  }, 30000);

  it("sete aplicações do mesmo dia só viram uma visita se houver dois períodos livres", () => {
    const items = Array.from({ length: 7 }, (_, i) => item(i + 1, 7, 1, IM, start));
    // Um período por dia: o limite de uma visita por dia impede juntar as sete.
    const narrow = planProtocolWithAvailableSlots(start, items, slotsFor(start, 5), limits);
    expect(narrow.ok).toBe(true);
    if (narrow.ok) {
      expect(narrow.visits.length).toBeGreaterThan(1);
      for (const visit of narrow.visits) expect(visit.applications.length).toBeLessThanOrEqual(6);
    }
    const wide = planProtocolWithAvailableSlots(start, items, slotsFor(start, 5, { capacityPeriods: 2 }), limits);
    expect(wide.ok).toBe(true);
    if (wide.ok) {
      expect(wide.visits).toHaveLength(1);
      expect(wide.visits[0].applications).toHaveLength(7);
      expect(wide.visits[0].sizing?.nursingPeriods).toBe(2);
    }
  });

  it("implante só entra em horário em que o médico cobre todos os períodos reservados", () => {
    const items = [item(1, 30, 1, IMPLANT, start)];
    // Sem cobertura médica em nenhuma data: não há plano.
    expect(planProtocolWithAvailableSlots(start, items, slotsFor(start, 9, { capacityPeriods: 2 }), limits))
      .toMatchObject({ ok: false, reason: "nenhum_plano_encontrado" });

    // Médico cobre apenas 1 dos 2 períodos reservados (20 de 40 minutos): recusado.
    expect(planProtocolWithAvailableSlots(start, items,
      slotsFor(start, 9, { capacityPeriods: 2, doctorCapacityPeriods: 1 }), limits))
      .toMatchObject({ ok: false, reason: "nenhum_plano_encontrado" });

    const slots = slotsFor(start, 9, { capacityPeriods: 2 });
    slots[2].doctorCapacityPeriods = 2;
    const result = planProtocolWithAvailableSlots(start, items, slots, limits);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visits).toHaveLength(1);
    expect(result.visits[0].date).toBe(slots[2].date);
    expect(result.visits[0].sizing).toMatchObject({ nursingPeriods: 2, requiresDoctor: true });
  });

  it("implante mais aplicação comum pede três períodos de enfermagem e de médico", () => {
    const items = [item(1, 30, 1, IMPLANT, start), item(2, 30, 1, IM, start)];
    const slots = slotsFor(start, 1, { capacityPeriods: 3, doctorCapacityPeriods: 2 });
    // 1.950 s = 3 períodos reservados; o médico cobre só 2: a junção é recusada
    // e a única data não permite separar as duas ocorrências em dias diferentes.
    expect(planProtocolWithAvailableSlots(start, items, slots, limits)).toMatchObject({ ok: false });
    slots[0].doctorCapacityPeriods = 3;
    const joined = planProtocolWithAvailableSlots(start, items, slots, limits);
    expect(joined.ok).toBe(true);
    if (joined.ok) {
      expect(joined.visits).toHaveLength(1);
      expect(joined.visits[0].sizing).toMatchObject({ nursingPeriods: 3, requiresDoctor: true });
    }
  });

  it("a ocorrência que exige o médico pode chegar depois das comuns, e o médico continua obrigatório", () => {
    // Mesma data nominal: a comum (id 1) é alocada antes do implante (id 2).
    const items = [item(1, 30, 1, IM, start), item(2, 30, 1, IMPLANT, start)];
    // Dia 0: enfermagem 3 períodos, médico 2. O implante sozinho cabe (2), mas
    // implante mais a aplicação comum pedem 3 e o médico cobre só 2.
    // Dia 1: só 1 período e sem médico, suficiente para a comum.
    const slots: AvailableProtocolSlot[] = [
      { date: dateAt(start, 0), time: "10:00", maxApplications: 100, capacityPeriods: 3, doctorCapacityPeriods: 2 },
      { date: dateAt(start, 1), time: "10:00", maxApplications: 100, capacityPeriods: 1 },
    ];
    const split = planProtocolWithAvailableSlots(start, items, slots, limits);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.visits).toHaveLength(2);
    const implantVisit = split.visits.find(v => v.applications.some(app => app.substanceId === 2))!;
    expect(implantVisit.date).toBe(dateAt(start, 0));
    expect(implantVisit.applications).toHaveLength(1);
    expect(implantVisit.sizing).toMatchObject({ nursingPeriods: 2, requiresDoctor: true });
    const commonVisit = split.visits.find(v => v.applications.some(app => app.substanceId === 1))!;
    expect(commonVisit.date).toBe(dateAt(start, 1));

    // Com o médico cobrindo 3 períodos no dia 0, a junção passa a ser aceita.
    slots[0].doctorCapacityPeriods = 3;
    const joined = planProtocolWithAvailableSlots(start, items, slots, limits);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.visits).toHaveLength(1);
    expect(joined.visits[0].applications).toHaveLength(2);
    expect(joined.visits[0].sizing).toMatchObject({ nursingPeriods: 3, requiresDoctor: true });
  });

  it("recusa entradas ambíguas em vez de presumir", () => {
    const base = slotsFor(start, 3);
    // Duração informada só em parte das substâncias.
    expect(() => planProtocolWithAvailableSlots(start,
      [item(1, 7, 1, IM, start), { substanceId: 2, dose: "d", intervalDays: 7, totalSessions: 1 }], base, limits))
      .toThrow(/Duração/);
    // Participação médica indefinida.
    expect(() => planProtocolWithAvailableSlots(start,
      [{ ...item(1, 7, 1, IM, start), requiresDoctor: null }], base, limits)).toThrow(/Participação médica/);
    // Vaga sem capacidade em períodos no modo por tempo.
    expect(() => planProtocolWithAvailableSlots(start, [item(1, 7, 1, IM, start)],
      [{ date: start, time: "10:00", maxApplications: 6 }], limits)).toThrow(/capacidade em períodos/);
    // Capacidade em períodos sem duração nas substâncias.
    expect(() => planProtocolWithAvailableSlots(start,
      [{ substanceId: 1, dose: "d", intervalDays: 7, totalSessions: 1 }], base, limits))
      .toThrow(/exige a duração/);
  });

  it("sem duração nem capacidade em períodos, o modo antigo por quantidade segue igual", () => {
    const legacy = planProtocolWithAvailableSlots(start,
      [{ substanceId: 1, dose: "d", intervalDays: 7, totalSessions: 2 }],
      Array.from({ length: 14 }, (_, day) => ({ date: dateAt(start, day), time: "10:00", maxApplications: 6 })),
      limits);
    expect(legacy.ok).toBe(true);
    if (legacy.ok) {
      expect(legacy.visits).toHaveLength(2);
      for (const visit of legacy.visits) expect(visit.sizing).toBeUndefined();
    }
  });
});
