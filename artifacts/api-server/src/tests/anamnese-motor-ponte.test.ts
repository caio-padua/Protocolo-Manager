import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("../lib/motor-anamnese.js", () => ({ computeMotor: vi.fn(), gatilhoBate: vi.fn() }));
import { respostasV2ParaMotor, valorParaMotor } from "../lib/anamnese-motor-ponte";
import { buildFindings } from "../lib/anamnese-findings-adapter";

const P = (id: number, perguntaId: string | null, tipoResposta = "SIM NAO", opcoes: unknown = null) => ({ id, perguntaId, pergunta: `P${id}`, tipoResposta, opcoes });
describe("ponte V2 para o motor", () => {
  it("converte boolean, single (por label ou valor), escala e numero", () => {
    expect(valorParaMotor({ tipo: "boolean", bool: true }, null)).toEqual({ ok: true, valor: "sim" });
    expect(valorParaMotor({ tipo: "boolean", bool: false }, null)).toEqual({ ok: true, valor: "nao" });
    expect(valorParaMotor({ tipo: "single", opcao: "Mais da metade" }, [{ label: "Mais da metade", valor: 2 }])).toEqual({ ok: true, valor: 2 });
    expect(valorParaMotor({ tipo: "escala", escala: 3 }, null)).toEqual({ ok: true, valor: 3 });
  });
  it("multi-selecao e texto nunca sao avaliados em silencio", () => {
    expect(valorParaMotor({ tipo: "multi", selecionados: ["A"] }, null).ok).toBe(false);
    expect(valorParaMotor({ tipo: "texto", texto: "x" }, null).ok).toBe(false);
    expect(valorParaMotor(null, null).ok).toBe(false);
  });
  it("identificador de pergunta repetido: usa a resposta mais recente e declara o conflito", () => {
    const r = respostasV2ParaMotor([P(1, "DUP"), P(2, "DUP")], [
      { questionRowId: 1, valor: { tipo: "boolean", bool: true }, respondidoEm: "2026-01-01T00:00:00Z" },
      { questionRowId: 2, valor: { tipo: "boolean", bool: false }, respondidoEm: "2026-02-01T00:00:00Z" },
    ]);
    expect(r.respostasMotor).toEqual([{ perguntaId: "DUP", valor: "nao" }]);
    expect(r.conflitos).toEqual([{ perguntaId: "DUP", questionRowIds: [2, 1], usada: 2 }]);
    expect(r.origem.get("DUP")).toBe(2);
  });
  it("pergunta inexistente ou sem identificador vai para nao avaliadas", () => {
    const r = respostasV2ParaMotor([P(1, null)], [{ questionRowId: 1, valor: { tipo: "boolean", bool: true } }, { questionRowId: 99, valor: { tipo: "boolean", bool: true } }]);
    expect(r.respostasMotor).toHaveLength(0);
    expect(r.naoAvaliadas).toHaveLength(2);
  });
});
describe("adaptador de achados (nao e o motor)", () => {
  const q = (id: number, bloco: string, alarme = false) => ({ id, perguntaId: `Q${id}`, pergunta: `PERGUNTA ${id}`, bloco, sistema: null, eSinalAlarme: alarme, pesoGravidade: 1, tipoResposta: null });
  it("multi com so opcoes negativas nao gera achado; com opcao real gera", () => {
    expect(buildFindings([q(1, "ANTECEDENTES")], [{ questionRowId: 1, valor: { tipo: "multi", selecionados: ["Nenhuma", "Nao tenho"] } }])).toHaveLength(0);
    expect(buildFindings([q(1, "ANTECEDENTES")], [{ questionRowId: 1, valor: { tipo: "multi", selecionados: ["Nenhuma", "Penicilina"] } }])).toHaveLength(1);
  });
  it("opcoes negativas em single nao viram achado", () => {
    for (const op of ["Não", "Nenhuma", "Nunca", "Não sei", "Não tenho"]) expect(buildFindings([q(2, "DOENCAS", true)], [{ questionRowId: 2, valor: { tipo: "single", opcao: op } }])).toHaveLength(0);
  });
});
