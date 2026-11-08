import { describe, expect, it } from "vitest";
import { buildExactProtocolSchedule } from "../lib/protocol-exact-schedule";
import { montarGrade, planejarPaginasRasFap } from "../lib/ras-fap";

const items = [
  { substanceId: 1, dose: "dose sintética A", startDate: "2030-01-07", totalSessions: 5, intervalDays: 7 },
  { substanceId: 2, dose: "dose sintética B", startDate: "2030-01-12", totalSessions: 3, intervalDays: 14 },
];
describe("Agenda de datas exatas, sem dados clínicos reais", () => {
  it("mantém cinco segundas e três sábados alternados como oito visitas", () => {
    const result = buildExactProtocolSchedule("2030-01-07", items);
    expect(result.map(row => row.date)).toEqual([
      "2030-01-07", "2030-01-12", "2030-01-14", "2030-01-21",
      "2030-01-26", "2030-01-28", "2030-02-04", "2030-02-09",
    ]);
    for (const row of result) for (const app of row.applications) {
      expect(new Date(`${row.date}T12:00:00Z`).getUTCDay()).toBe(app.substanceId === 1 ? 1 : 6);
      expect(app.dose).toBe(items[app.substanceId - 1].dose);
    }
    expect(result[0].upcoming.map(item => item.substanceId)).toEqual([2]);
    expect(result.at(-1)!.upcoming).toEqual([]);
  });
  it("agrupa somente aplicações do mesmo dia e preserva suas frações", () => {
    const result = buildExactProtocolSchedule("2030-01-07", items.map(item => ({ ...item, startDate: "2030-01-07" })));
    expect(result).toHaveLength(5);
    expect(result[0].applications.map(app => app.sessionNumber)).toEqual([1, 1]);
    expect(result[2].applications.map(app => app.sessionNumber)).toEqual([3, 2]);
  });
  it("não depende da ordem dos itens nem antecipa início individual", () => {
    const reversed = buildExactProtocolSchedule("2030-01-07", [...items].reverse());
    expect(reversed.map(row => row.date)).toEqual(buildExactProtocolSchedule("2030-01-07", items).map(row => row.date));
    expect(reversed[0].applications).toHaveLength(1);
  });
  it.each(["2030-02-29", "2030-13-01", "", "2030-1-07", "2030-01-07T10:00:00"])("recusa data impossível ou fora do contrato: %s", date => {
    expect(() => buildExactProtocolSchedule(date, items)).toThrow();
  });
  it.each([0, -1, 1.5, NaN])("recusa intervalo ou quantidade inválida: %s", value => {
    expect(() => buildExactProtocolSchedule("2030-01-07", [{ ...items[0], intervalDays: value }])).toThrow();
    expect(() => buildExactProtocolSchedule("2030-01-07", [{ ...items[0], totalSessions: value }])).toThrow();
  });
  it("recusa duplicidade de identidade e conjunto vazio", () => {
    expect(() => buildExactProtocolSchedule("2030-01-07", [items[0], items[0]])).toThrow();
    expect(() => buildExactProtocolSchedule("2030-01-07", [])).toThrow();
  });
  it("RAS projeta a agenda persistida sem reagrupar sábados em segundas", () => {
    const subs = items.map(item => ({
      nome: `Substância sintética ${item.substanceId}`, sessoes: item.totalSessions,
      frequenciaDias: item.intervalDays, inicio: new Date(`${item.startDate}T12:00:00`),
    }));
    const rows = buildExactProtocolSchedule("2030-01-07", items).map((row, index) => ({
      numero: index + 1, data: new Date(`${row.date}T12:00:00`),
      contadores: items.map(item => {
        const app = row.applications.find(app => app.substanceId === item.substanceId);
        return app ? `${app.sessionNumber}/${app.totalSessions}` : null;
      }),
    }));
    const printed = planejarPaginasRasFap(subs, rows)[0].linhas.filter(row => row.numero > 0);
    expect(printed).toEqual(rows);
    expect(printed[1].contadores).toEqual([null, "1/3"]);
    expect(planejarPaginasRasFap(subs)[0].linhas.filter(row => row.numero > 0))
      .toEqual(montarGrade(subs, 0));
  });
});
