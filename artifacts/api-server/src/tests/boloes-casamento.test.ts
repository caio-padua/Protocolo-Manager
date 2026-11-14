/**
 * Casamento deterministico de recibos de bolao (sem banco, sem IA). Dados sinteticos.
 */
import { describe, expect, it } from "vitest";
import {
  ReciboLidoSchema, casarRecibo, nomeCompativel, normalizarConcurso, normalizarData, podeAprovarAutomaticamente,
  type Candidato, type ReciboLido,
} from "../lib/boloes-casamento";

const lido = (o: Partial<ReciboLido> = {}): ReciboLido => ({
  pareceReciboCaixa: true, concurso: "0001", dataSorteio: "2026-12-31", codigoRecibo: "ABC123", cotas: 3,
  valor: null, nomeImpresso: null, emissor: "Lotérica sintética", confianca: 0.95, ...o,
});
const cand = (id: number, o: Partial<Candidato> = {}): Candidato => ({
  participacaoId: id, clienteNome: "Maria da Silva Sintética", cotas: 3, concurso: "1", dataSorteio: "2026-12-31", campanhaNome: "Bolão sintético", ...o,
});

describe("normalizacao", () => {
  it("concurso ignora zeros a esquerda e pontuacao; data aceita formato brasileiro", () => {
    expect(normalizarConcurso("0001")).toBe("1");
    expect(normalizarConcurso("Concurso 2.950")).toBe("2950");
    expect(normalizarConcurso(null)).toBeNull();
    expect(normalizarData("31/12/2026")).toBe("2026-12-31");
    expect(normalizarData("2026-12-31T00:00:00Z")).toBe("2026-12-31");
    expect(normalizarData("lixo")).toBeNull();
  });
  it("nome: ausente nao exclui; divergente exclui; ordem e acento nao importam", () => {
    expect(nomeCompativel(null, "Qualquer Pessoa")).toBe(true);
    expect(nomeCompativel("MARIA SILVA", "Maria da Silva Sintética")).toBe(true);
    expect(nomeCompativel("Joao Souza", "Maria da Silva Sintética")).toBe(false);
    expect(nomeCompativel("Síntética Maria", "Maria Sintetica")).toBe(true);
  });
});

describe("casarRecibo", () => {
  it("exatamente uma candidata = sugerida", () => {
    const r = casarRecibo(lido(), [cand(1), cand(2, { cotas: 2 }), cand(3, { concurso: "2" })]);
    expect(r).toMatchObject({ candidatas: [1], sugerida: 1, motivos: [] });
  });
  it("duas candidatas = nunca escolhe", () => {
    const r = casarRecibo(lido(), [cand(1), cand(2, { clienteNome: "Outra Pessoa" })]);
    expect(r.sugerida).toBeNull();
    expect(r.candidatas).toEqual([1, 2]);
    expect(r.motivos).toEqual(["varias_candidatas"]);
  });
  it("nenhuma candidata e dados insuficientes sao motivos distintos", () => {
    expect(casarRecibo(lido({ concurso: "9" }), [cand(1)]).motivos).toEqual(["sem_candidata"]);
    expect(casarRecibo(lido({ concurso: null, dataSorteio: null }), [cand(1)]).motivos).toEqual(["dados_insuficientes"]);
  });
  it("campanha sem concurso cadastrado nao e confirmada por concurso", () => {
    expect(casarRecibo(lido(), [cand(1, { concurso: null })]).sugerida).toBeNull();
  });
  it("data divergente e nome divergente excluem; cotas nao lidas nao excluem", () => {
    expect(casarRecibo(lido(), [cand(1, { dataSorteio: "2027-01-01" })]).sugerida).toBeNull();
    expect(casarRecibo(lido({ nomeImpresso: "Pedro Alves" }), [cand(1)]).sugerida).toBeNull();
    expect(casarRecibo(lido({ cotas: null }), [cand(1, { cotas: 9 })]).sugerida).toBe(1);
  });
});

describe("aprovacao automatica: todas as condicoes juntas", () => {
  const ok = casarRecibo(lido(), [cand(1)]);
  it("libera quando tudo confere", () => {
    expect(podeAprovarAutomaticamente(lido(), ok, false)).toEqual({ ok: true, motivos: [] });
  });
  it.each([
    ["confianca baixa", lido({ confianca: 0.89 }), false, "confianca_baixa"],
    ["nao parece recibo", lido({ pareceReciboCaixa: false }), false, "nao_parece_recibo_caixa"],
    ["sem codigo", lido({ codigoRecibo: null }), false, "dados_insuficientes"],
    ["codigo repetido", lido(), true, "codigo_repetido"],
  ])("recusa: %s", (_n, l, repetido, motivo) => {
    const r = podeAprovarAutomaticamente(l, casarRecibo(l, [cand(1)]), repetido);
    expect(r.ok).toBe(false);
    expect(r.motivos).toContain(motivo);
  });
  it("recusa sem candidata unica", () => {
    expect(podeAprovarAutomaticamente(lido(), casarRecibo(lido(), [cand(1), cand(2)]), false).ok).toBe(false);
  });
});

describe("schema da leitura", () => {
  it("campos ausentes viram null e confianca invalida vira zero (nunca inventa)", () => {
    const r = ReciboLidoSchema.parse({ pareceReciboCaixa: "talvez", confianca: "alta" });
    expect(r).toMatchObject({ pareceReciboCaixa: false, concurso: null, cotas: null, confianca: 0 });
  });
});
