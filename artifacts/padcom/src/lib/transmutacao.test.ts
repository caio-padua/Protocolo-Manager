import { describe, expect, it } from "vitest";
import { montarMapaPermissoes } from "../../../api-server/src/lib/perfis-permissoes";
import { PERFIS_SIMULADOS, dominioDoHref, simulaPodeVer, type PerfilMapaFront } from "./transmutacao";

// Usa o mapa REAL do servidor: a simulação visual não pode divergir da regra.
const mapa = montarMapaPermissoes() as unknown as PerfilMapaFront[];
const perfil = (simId: string) => {
  const mapaId = PERFIS_SIMULADOS.find((p) => p.id === simId)!.mapaId;
  return mapa.find((m) => m.id === mapaId) ?? null;
};

const casos: [string, string, boolean][] = [
  ["empresario", "/payments", true],
  ["empresario", "/prescricao", false],
  ["empresario", "/cockpit", false],
  ["empresario", "/padteam", true],
  ["empresario", "/ceo/cabine", false],
  ["associado", "/prescricao", true],
  ["associado", "/cockpit", true],
  ["associado", "/payments", false],
  ["associado", "/fornecedores", false],
  ["associado", "/padteam", false],
  ["associado", "/comunicacao/mensageria", true],
  ["enfermagem", "/agenda", true],
  ["enfermagem", "/cockpit", true],
  ["enfermagem", "/prescricao", false],
  ["enfermagem", "/payments", false],
  ["recepcao", "/agenda", true],
  ["recepcao", "/payments", true],
  ["recepcao", "/cockpit", false],
  ["recepcao", "/exames-cliente", false],
  ["financeiro", "/payments", true],
  ["financeiro", "/fornecedores", true],
  ["financeiro", "/stock", true],
  ["financeiro", "/cockpit", false],
  ["financeiro", "/exames-cliente", false],
  ["admin-padua", "/prescricao", true],
  ["admin-padua", "/payments", true],
  ["kleber", "/padteam", true],
  ["kleber", "/ceo/command-center", false],
];

describe("transmutação: simulação visual segue a regra real do servidor", () => {
  it.each(casos)("%s em %s => %s", (sim, href, esperado) => {
    expect(simulaPodeVer(perfil(sim), href)).toBe(esperado);
  });
  it("Dashboard é livre para todos", () => {
    for (const p of PERFIS_SIMULADOS.filter((x) => x.mapaId)) expect(simulaPodeVer(perfil(p.id), "/")).toBe(true);
  });
  it("sem mapa carregado, fecha tudo exceto o Dashboard", () => {
    expect(simulaPodeVer(null, "/payments")).toBe(false);
    expect(simulaPodeVer(null, "/")).toBe(true);
  });
  it("rota não classificada vira administrativa (conservador)", () => {
    expect(dominioDoHref("/algo-novo")).toBe("admin");
    expect(simulaPodeVer(perfil("recepcao"), "/algo-novo")).toBe(false);
  });
  it("oito opções, com visão CEO primeiro", () => {
    expect(PERFIS_SIMULADOS).toHaveLength(8);
    expect(PERFIS_SIMULADOS[0].mapaId).toBeNull();
  });
});
