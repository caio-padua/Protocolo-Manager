import { describe, expect, it } from "vitest";
import { projectImportedCommitment, type ImportedCommitment } from "../lib/agenda-google-projection";

const row: ImportedCommitment = {
  id: 1, titulo: "Exemplo sintético", inicio: "2026-09-02T13:45:00Z", fim: "2026-09-02T14:15:00Z",
  diaInteiro: false, origem: "google_recorrente", agenda: "Agenda sintética", papel: "local", cor: "#123456",
  recorrencia: JSON.stringify({
    version: 1, start: "2026-08-19T10:45:00-03:00", end: "2026-08-19T11:15:00-03:00",
    lines: ["RRULE:FREQ=WEEKLY;BYDAY=WE"], excluded: ["2026-09-09T10:45:00-03:00"],
  }),
};
const from = new Date("2026-09-01T00:00:00-03:00");
const until = new Date("2026-10-01T00:00:00-03:00");
describe("projeção da agenda Google", () => {
  it("expande série antiga sem importar agosto, e respeita exceções", () => {
    const result = projectImportedCommitment(row, from, until);
    expect(result.map((event) => event.data)).toEqual(["2026-09-02", "2026-09-16", "2026-09-23", "2026-09-30"]);
    expect(result.every((event) => event.horario === "10:45")).toBe(true);
  });
  it("consulta anterior ao corte não mostra compromissos", () => {
    expect(projectImportedCommitment(row, new Date("2026-08-01"), new Date("2026-08-31"))).toEqual([]);
  });
  it("regra infinita funciona em ano futuro sem materializar décadas", () => {
    expect(projectImportedCommitment(row, new Date("2035-09-01"), new Date("2035-10-01")).length).toBeGreaterThan(0);
  });
  it("evento comum não se repete nem aparece no período errado", () => {
    const once = { ...row, origem: "google", recorrencia: null };
    expect(projectImportedCommitment(once, from, until)).toHaveLength(1);
    expect(projectImportedCommitment(once, new Date("2035-01-01"), new Date("2035-02-01"))).toEqual([]);
  });
  it("dia inteiro mantém a data de Brasília e término exclusivo", () => {
    const day = { ...row, origem: "google", recorrencia: null, diaInteiro: true,
      inicio: "2026-09-02T00:00:00-03:00", fim: "2026-09-03T00:00:00-03:00" };
    expect(projectImportedCommitment(day, from, until)[0].horario).toBe("Dia inteiro");
    expect(projectImportedCommitment(day, new Date(day.fim), until)).toEqual([]);
  });
});
