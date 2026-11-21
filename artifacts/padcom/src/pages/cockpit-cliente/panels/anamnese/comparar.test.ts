import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/collab-auth", () => ({ getCollabToken: () => null }));
import { compararSessoes, compararAchados, podeComparar, type Resposta } from "./util";

const r = (id: number, valor: unknown, vol: Resposta["volatilidade"] = "muda"): Resposta => ({
  id, questionRowId: id, volatilidade: vol, perguntaId: "X01", pergunta: `P${id}`, bloco: "B", sistema: null, tipoResposta: null, valor, respondidoEm: "2026-01-01T00:00:00Z",
});
const multi = (...s: string[]) => ({ tipo: "multi", selecionados: s });
const esc = (n: number) => ({ tipo: "escala", escala: n, max: 10 });

describe("comparação de anamneses", () => {
  it("usa o id da pergunta (perguntaId repete) e separa igual, mudou, novo e removido", () => {
    const l = compararSessoes(
      [r(101, "Ana"), r(102, esc(3)), r(103, "x"), r(104, true)],
      [r(101, "ana "), r(102, esc(7)), r(105, "novo"), r(104, false)],
    );
    const por = Object.fromEntries(l.map((x) => [x.rowId, x.situacao]));
    expect(por).toEqual({ 101: "igual", 102: "mudou", 103: "removido", 105: "novo", 104: "mudou" });
    expect(l.find((x) => x.rowId === 102)?.delta).toBe(4);
  });
  it("lista de opções: ordem não importa; mostra o que foi acrescentado e retirado", () => {
    const l = compararSessoes([r(101, multi("Cesárea", "Apêndice")), r(102, multi("a", "b"))], [r(101, multi("Apêndice", "Cesárea", "Coluna")), r(102, multi("b", "c"))]);
    expect(l.find((x) => x.rowId === 101)).toMatchObject({ situacao: "mudou", acrescentou: ["Coluna"], retirou: [] });
    expect(l.find((x) => x.rowId === 102)).toMatchObject({ acrescentou: ["c"], retirou: ["a"] });
  });
  it("resposta vazia nos dois lados não vira diferença", () => {
    expect(compararSessoes([r(101, null)], [r(101, { tipo: "texto", texto: " " })])).toHaveLength(0);
  });
  it("achados: novos, mantidos e que saíram", () => {
    const f = (id: number, rotulo: string) => ({ id, tipo: "suspeito", rotulo, severidade: null });
    const c = compararAchados([f(1, "Hipotireoidismo"), f(2, "Anemia")], [f(3, "hipotireoidismo"), f(4, "Insônia")]);
    expect(c.novos.map((x) => x.rotulo)).toEqual(["Insônia"]);
    expect(c.mantidos).toHaveLength(1);
    expect(c.resolvidos.map((x) => x.rotulo)).toEqual(["Anemia"]);
  });
  it("nome (1), CPF (2) e idade (41) nunca entram como evolução clínica", () => {
    const l = compararSessoes(
      [r(1, "Carlucia"), r(2, "02486280111"), r(41, 38), r(110, "x")],
      [r(1, "BETE BOQUETE"), r(2, "11122233300"), r(41, 45), r(110, "y")],
    );
    expect(l.map((x) => x.rowId)).toEqual([110]);
    const marcada = { ...r(1, "BETE"), origemCadastro: true };
    expect(compararSessoes([], [marcada])).toHaveLength(0);
  });
  it("só compara sessões do mesmo cliente", () => {
    expect(podeComparar({ clientId: 11 }, { clientId: 11 })).toBe(true);
    expect(podeComparar({ clientId: 11 }, { clientId: 12 })).toBe(false);
    expect(podeComparar({ clientId: null }, { clientId: null })).toBe(false);
    expect(podeComparar(undefined, { clientId: 1 })).toBe(false);
  });
});
