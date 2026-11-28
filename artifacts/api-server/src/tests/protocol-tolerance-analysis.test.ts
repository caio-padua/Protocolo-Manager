import { describe, expect, it } from "vitest";
import { buildExactProtocolSchedule } from "../lib/protocol-exact-schedule";
import { montarGrade } from "../lib/ras-fap";

// Experimento de agenda isolado: não é o motor clínico, nem valida segurança.
// Dias inteiros relativos ao primeiro dia; a primeira dose não é deslocada.
const intervals = [7, 15, 21, 10, 40] as const;
const end = 84;
const weekly = Array.from({ length: 13 }, (_, index) => index * 7);

function experiment(margin: number, starts: readonly number[]) {
  const visits = new Set<number>();
  const results: { interval: number; expected: number; actual: number }[] = [];

  intervals.forEach((interval, index) => {
    const start = starts[index];
    let previous = -1;
    for (let expected = start, occurrence = 0; expected <= end; expected += interval, occurrence++) {
      const candidates = weekly
        .filter(day => day >= start && day > previous && Math.abs(day - expected) <= margin)
        .sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected) || a - b);
      const actual = occurrence > 0 && candidates.length ? candidates[0] : expected;
      results.push({ interval, expected, actual });
      visits.add(actual);
      previous = actual;
    }
  });

  return { visits, results };
}

describe("Análise isolada da margem de consolidação", () => {
  it.each([
    [0, 23],
    [1, 20],
    [2, 17],
    [3, 13],
    [4, 13],
    [5, 13],
  ])("com margem de %i dias registra %i visitas no cenário comum", (margin, count) => {
    const { visits, results } = experiment(margin, [0, 0, 0, 0, 0]);
    expect(visits.size).toBe(count);
    expect(results).toHaveLength(36);
    for (const entry of results) {
      expect(Math.abs(entry.actual - entry.expected)).toBeLessThanOrEqual(margin);
    }
    for (const interval of intervals) {
      const dates = results.filter(result => result.interval === interval).map(result => result.actual);
      expect(dates[0]).toBe(0);
      expect(dates.every((date, index) => index === 0 || date > dates[index - 1])).toBe(true);
    }
  });

  it("na simulação com 2.401 inícios, três e cinco dias geram as mesmas visitas", () => {
    let cases = 0;
    for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) {
      for (let c = 0; c < 7; c++) for (let d = 0; d < 7; d++) {
        const starts = [0, a, b, c, d];
        const three = experiment(3, starts);
        const five = experiment(5, starts);
        expect(three.visits.size).toBe(five.visits.size);
        intervals.forEach((interval, index) => {
          const first = three.results.find(result => result.interval === interval);
          expect(first?.actual).toBe(starts[index]);
        });
        cases++;
      }
    }
    expect(cases).toBe(2_401);
  });

  it("duas margens de cinco dias podem encurtar um intervalo de quinze para cinco", () => {
    const planned = [15, 30];
    const adjusted = [20, 25];
    expect(adjusted.map((date, index) => Math.abs(date - planned[index]))).toEqual([5, 5]);
    expect(adjusted[1] - adjusted[0]).toBe(5);
  });

  it("com uma visita semanal indisponível, cinco dias podem alcançar uma visita que três não alcançam", () => {
    const existingVisits = [0, 7, 21, 28];
    const expected = 12;
    const within = (margin: number) => existingVisits.filter(day => Math.abs(day - expected) <= margin);
    expect(within(3)).toEqual([]);
    expect(within(5)).toEqual([7]);
    // Isto prova apenas proximidade no calendário, não segurança clínica.
  });

  it("revela a divergência atual entre a grade semanal e quatro datas distintas", () => {
    const grade = montarGrade([{
      nome: "Substância sintética",
      sessoes: 4,
      frequenciaDias: 2,
      inicio: new Date(2030, 0, 7, 12),
    }], 0);
    const exact = buildExactProtocolSchedule("2030-01-07", [{
      substanceId: 1,
      dose: "dose sintética",
      totalSessions: 4,
      intervalDays: 2,
    }]);
    expect(grade).toHaveLength(1);
    expect(grade[0].contadores).toEqual(["1·2·3·4/4"]);
    expect(exact.map(appointment => appointment.date)).toEqual([
      "2030-01-07", "2030-01-09", "2030-01-11", "2030-01-13",
    ]);
  });
});
