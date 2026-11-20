import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/collab-auth", () => ({ getCollabToken: () => null }));
import { compararSessoes, compararAchados, type Resposta } from "./util";

const r = (id: number, valor: unknown, vol: Resposta["volatilidade"] = "muda"): Resposta => ({
  id, questionRowId: id, volatilidade: vol, perguntaId: "X01", pergunta: `P${id}`, bloco: "B", sistema: null, tipoResposta: null, valor, respondidoEm: "2026-01-01T00:00:00Z",
});
const multi = (...s: string[]) => ({ tipo: "multi", selecionados: s });
const esc = (n: number) => ({ tipo: "escala", escala: n, max: 10 });

describe("comparação de anamneses", () => {
  it("usa o id da pergunta (perguntaId repete) e separa igual, mudou, novo e removido", () => {
    const l = compararSessoes(
      [r(1, "Ana"), r(2, esc(3)), r(3, "x"), r(4, true)],
      [r(1, "ana "), r(2, esc(7)), r(5, "novo"), r(4, false)],
    );
    const por = Object.fromEntries(l.map((x) => [x.rowId, x.situacao]));
    expect(por).toEqual({ 1: "igual", 2: "mudou", 3: "removido", 5: "novo", 4: "mudou" });
    expect(l.find((x) => x.rowId === 2)?.delta).toBe(4);
  });
  it("lista de opções: ordem não importa; mostra o que foi acrescentado e retirado", () => {
    const l = compararSessoes([r(1, multi("Cesárea", "Apêndice")), r(2, multi("a", "b"))], [r(1, multi("Apêndice", "Cesárea", "Coluna")), r(2, multi("b", "c"))]);
    expect(l.find((x) => x.rowId === 1)).toMatchObject({ situacao: "mudou", acrescentou: ["Coluna"], retirou: [] });
    expect(l.find((x) => x.rowId === 2)).toMatchObject({ acrescentou: ["c"], retirou: ["a"] });
  });
  it("resposta vazia nos dois lados não vira diferença", () => {
    expect(compararSessoes([r(1, null)], [r(1, { tipo: "texto", texto: " " })])).toHaveLength(0);
  });
  it("achados: novos, mantidos e que saíram", () => {
    const f = (id: number, rotulo: string) => ({ id, tipo: "suspeito", rotulo, severidade: null });
    const c = compararAchados([f(1, "Hipotireoidismo"), f(2, "Anemia")], [f(3, "hipotireoidismo"), f(4, "Insônia")]);
    expect(c.novos.map((x) => x.rotulo)).toEqual(["Insônia"]);
    expect(c.mantidos).toHaveLength(1);
    expect(c.resolvidos.map((x) => x.rotulo)).toEqual(["Anemia"]);
  });
});
