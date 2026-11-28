import { describe, expect, it } from "vitest";
import { profissionaisParaNovaAgenda } from "./agenda-profissionais";

const lista = [
  { id: 24, name: "MARCIO MAO VIRADA", active: true, areaId: 8 },
  { id: 2, name: "Ana Médica", active: true, areaId: 1 },
  { id: 30, name: "Inativo Bio", active: false, areaId: 8 },
  { id: 31, name: "Sem categoria", active: true, areaId: null },
];

describe("profissionaisParaNovaAgenda", () => {
  it("lista o biomédico pela categoria (id), sem agenda anterior", () => {
    expect(profissionaisParaNovaAgenda(lista, 8).map((p) => p.id)).toEqual([24]);
  });
  it("exclui inativos e sem categoria; categoria nula não lista ninguém", () => {
    expect(profissionaisParaNovaAgenda(lista, 8).some((p) => p.id === 30 || p.id === 31)).toBe(false);
    expect(profissionaisParaNovaAgenda(lista, null)).toEqual([]);
  });
  it("recusa cadastro divergente duplicado", () => {
    expect(() => profissionaisParaNovaAgenda([...lista, { id: 24, name: "OUTRO", active: true, areaId: 8 }], 8)).toThrow();
  });
});
