import { describe, expect, it } from "vitest";
import type { AgendaDoProfissional } from "@/lib/agenda-vinculos-api";
import { vinculoDoLocal } from "./vinculo-do-local";

const agenda = (p: Partial<AgendaDoProfissional> & { id: number }): AgendaDoProfissional => ({
  name: "Agenda sintética", locationId: null, empresaId: 5, modality: "local", color: null, categoriaId: 1, categoriaNome: "Medicina",
  vinculado: false, origens: [], editavelNoCadastro: false, motivoBloqueio: null, ...p,
});

describe("vinculoDoLocal — a aba Vínculos lê as mesmas origens da Agenda Configuração", () => {
  it("titular da agenda do local aparece LIGADO mesmo sem vínculo do cadastro (caso reportado: Outro local e On line)", () => {
    const agendas = [agenda({ id: 25, locationId: 38, vinculado: true, origens: ["individual"] })];
    const r = vinculoDoLocal(agendas, 38, false);
    expect(r.ligado).toBe(true);
    expect(r.origens).toEqual(["individual"]);
    expect(r.rotuloOrigem).toBe("Titular da agenda");
    expect(r.travadoPor).toContain("Agenda Configuração");
  });

  it("só vínculo do cadastro com o local: ligado e destravado", () => {
    const r = vinculoDoLocal([agenda({ id: 1, locationId: 7, vinculado: true, origens: ["local"] })], 7, true);
    expect(r).toMatchObject({ ligado: true, travadoPor: null, origens: ["local"] });
  });

  it("titular + vínculo do cadastro: mostra as duas origens e trava (titularidade é da Agenda Configuração)", () => {
    const r = vinculoDoLocal([agenda({ id: 22, locationId: 35, vinculado: true, origens: ["individual", "local"] })], 35, true);
    expect(r.rotuloOrigem).toBe("Titular da agenda + Vínculo do cadastro");
    expect(r.travadoPor).not.toBeNull();
  });

  it("sem nenhuma origem: desligado e destravado; agenda de outro local não conta", () => {
    const agendas = [agenda({ id: 3, locationId: 9, vinculado: true, origens: ["individual"] })];
    const r = vinculoDoLocal(agendas, 10, false);
    expect(r).toEqual({ ligado: false, origens: [], travadoPor: null, rotuloOrigem: null });
  });

  it("vínculo do cadastro conhecido localmente vale mesmo se a lista de agendas ainda não chegou", () => {
    expect(vinculoDoLocal([], 4, true)).toMatchObject({ ligado: true, origens: ["local"], travadoPor: null });
  });
});
