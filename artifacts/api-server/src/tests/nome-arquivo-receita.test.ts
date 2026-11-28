import { describe, expect, it } from "vitest";
import { nomeArquivoReceita, nomeLivreNaPasta } from "../lib/nome-arquivo-receita";

describe("nome da receita no Drive", () => {
  it("segue AA.MM.DD RECEITA MANIPULADA NOME, sem nada depois", () => {
    expect(nomeArquivoReceita("2026-11-22", "Dayana Ludman Alves Caldas da Silva", "manipulacao"))
      .toBe("26.11.22 RECEITA MANIPULADA DAYANA LUDMAN ALVES CALDAS DA SILVA");
  });
  it("remove acentos e símbolos do nome", () => {
    expect(nomeArquivoReceita("2026-01-05", "José  D'Ávila-Çelso", "manipulacao"))
      .toBe("26.01.05 RECEITA MANIPULADA JOSE D AVILA CELSO");
  });
  it("controlada tem rótulo próprio", () => {
    expect(nomeArquivoReceita("2026-01-05", "Ana", "controlado_isolado")).toBe("26.01.05 RECEITA CONTROLADA ANA");
  });
  it("recusa data ou nome ausente em vez de inventar", () => {
    expect(() => nomeArquivoReceita(null, "Ana")).toThrow();
    expect(() => nomeArquivoReceita("2026-01-05", "  ")).toThrow();
  });
  it("duas receitas no mesmo dia não se sobrescrevem", () => {
    const base = "26.11.22 RECEITA MANIPULADA ANA";
    expect(nomeLivreNaPasta(base, [])).toBe(`${base}.pdf`);
    expect(nomeLivreNaPasta(base, [`${base}.pdf`])).toBe(`${base} (2).pdf`);
    expect(nomeLivreNaPasta(base, [`${base}.pdf`, `${base} (2).pdf`])).toBe(`${base} (3).pdf`);
  });
});
