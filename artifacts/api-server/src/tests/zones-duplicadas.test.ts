import { expect, it } from "vitest";
import { classifyIntoZones, overrideZones } from "../lib/exam-extraction/zones";

const rows = [
  { ordem: 1, faixaName: "Baixo", low: null, high: 10, color: "red" },
  { ordem: 2, faixaName: "Atenção", low: 10, high: 20, color: "yellow" },
  { ordem: 3, faixaName: "Bom", low: 20, high: 30, color: "green" },
  { ordem: 4, faixaName: "Alvo", low: 30, high: 40, color: "blue" },
  { ordem: 5, faixaName: "Alto", low: 40, high: null, color: "red" },
];

it("representa cópias idênticas uma única vez sem alterar a entrada", () => {
  const entrada = [...rows, ...rows.map((r) => ({ ...r }))];
  const zones = overrideZones(entrada);
  expect(entrada).toHaveLength(10);
  expect(zones?.map((z) => z.key)).toEqual(["below", "t1", "t2", "t3", "above"]);
  expect(classifyIntoZones(25, zones)).toMatchObject({ key: "t2", name: "Bom" });
});

it("não elimina faixas com dados diferentes na mesma ordem", () => {
  const entrada = [...rows, { ...rows[2], high: 31 }];
  expect(overrideZones(entrada)).toHaveLength(6);
});
