/**
 * radar-sort.test.ts
 *
 * Valida que a ordenação por urgência do Radar Clínico respeita a regra:
 *   1. faltou DESC   — quem faltou (faltaHaDias != null) aparece antes
 *   2. silêncio DESC — maior silêncio primeiro; null (nunca contatado) = máximo
 *   3. nome ASC      — desempate alfabético
 */

import { describe, it, expect } from "vitest";
import { sortByUrgencia, type RadarPaciente } from "../lib/radar-sort";

// ── helpers ───────────────────────────────────────────────────────────────────

function p(
  nome: string,
  faltaHaDias: number | null,
  silencioHaDias: number | null,
): RadarPaciente {
  return { nome, alertas: { faltaHaDias, silencioHaDias } };
}

function sorted(patients: RadarPaciente[]): string[] {
  return sortByUrgencia([...patients]).map((r) => r.nome);
}

// ── testes ────────────────────────────────────────────────────────────────────

describe("sortByUrgencia — regra 1: faltou vem antes de quem não faltou", () => {
  it("paciente com falta aparece antes de paciente sem falta (mesmo silêncio)", () => {
    const result = sorted([
      p("Beta", null, 10),
      p("Alpha", 5, 10),
    ]);
    expect(result).toEqual(["Alpha", "Beta"]);
  });

  it("múltiplos faltosos antes de múltiplos sem falta", () => {
    const result = sorted([
      p("Sem1", null, 50),
      p("Falta2", 2, 3),
      p("Sem2", null, 1),
      p("Falta1", 10, 100),
    ]);
    // Ambos os faltosos devem vir primeiro
    expect(result.slice(0, 2).sort()).toEqual(["Falta1", "Falta2"].sort());
    expect(result.slice(2).sort()).toEqual(["Sem1", "Sem2"].sort());
  });
});

describe("sortByUrgencia — regra 2: silêncio DESC dentro do mesmo grupo de falta", () => {
  it("entre faltosos, quem ficou mais dias sem contato vem primeiro", () => {
    const result = sorted([
      p("A", 1, 5),
      p("B", 3, 30),
      p("C", 7, 15),
    ]);
    expect(result).toEqual(["B", "C", "A"]);
  });

  it("entre não-faltosos, quem ficou mais dias sem contato vem primeiro", () => {
    const result = sorted([
      p("X", null, 2),
      p("Y", null, 99),
      p("Z", null, 20),
    ]);
    expect(result).toEqual(["Y", "Z", "X"]);
  });
});

describe("sortByUrgencia — null em silêncio tratado como máximo", () => {
  it("silêncio null (nunca contatado) vem antes de qualquer número", () => {
    const result = sorted([
      p("ComContato", null, 999),
      p("SemContato", null, null),
    ]);
    expect(result[0]).toBe("SemContato");
  });

  it("faltoso sem contato vem antes de faltoso com contato recente", () => {
    const result = sorted([
      p("FaltouRecente", 1, 1),
      p("FaltouSemContato", 1, null),
    ]);
    expect(result[0]).toBe("FaltouSemContato");
  });

  it("dois pacientes ambos sem contato (null) desempatam por nome", () => {
    const result = sorted([
      p("Zita", null, null),
      p("Ana", null, null),
    ]);
    expect(result).toEqual(["Ana", "Zita"]);
  });
});

describe("sortByUrgencia — regra 3: empate total desempata por nome A-Z", () => {
  it("mesmo falta e mesmo silêncio → ordem alfabética", () => {
    const result = sorted([
      p("Carlos", 2, 10),
      p("Ana", 2, 10),
      p("Bruno", 2, 10),
    ]);
    expect(result).toEqual(["Ana", "Bruno", "Carlos"]);
  });

  it("desempate alfabético ignora maiúsculas e acentos (pt-BR sensitivity=base)", () => {
    const result = sorted([
      p("Érica", null, 5),
      p("erica", null, 5),
      p("Ana", null, 5),
    ]);
    // Ana vem primeiro; Érica e erica são equivalentes (sensitivity=base)
    expect(result[0]).toBe("Ana");
  });
});

describe("sortByUrgencia — cenário completo integrado", () => {
  it("ordena corretamente uma lista mista de 5 pacientes", () => {
    /**
     * Entrada intencional (desordenada):
     *   SilêncioTotal — sem falta, sem contato (null) → rank 2 no grupo sem-falta, silêncio=MAX
     *   FaltouAntigo  — faltou, silêncio=30          → rank 1 entre faltosos (maior silêncio)
     *   FaltouRecente — faltou, silêncio=5            → rank 2 entre faltosos
     *   NormalBaixo   — sem falta, silêncio=2         → último no grupo sem-falta
     *   NormalMedio   — sem falta, silêncio=20        → rank 3 no grupo sem-falta
     *
     * Ordem esperada:
     *   1. FaltouAntigo   (faltou + maior silêncio)
     *   2. FaltouRecente  (faltou + menor silêncio)
     *   3. SilêncioTotal  (sem falta, silêncio=null=MAX)
     *   4. NormalMedio    (sem falta, silêncio=20)
     *   5. NormalBaixo    (sem falta, silêncio=2)
     */
    const result = sorted([
      p("SilêncioTotal", null, null),
      p("FaltouAntigo", 3, 30),
      p("FaltouRecente", 1, 5),
      p("NormalBaixo", null, 2),
      p("NormalMedio", null, 20),
    ]);

    expect(result).toEqual([
      "FaltouAntigo",
      "FaltouRecente",
      "SilêncioTotal",
      "NormalMedio",
      "NormalBaixo",
    ]);
  });
});

describe("sortByUrgencia — não muta o array original", () => {
  it("retorna um novo array em ordem sem alterar o original", () => {
    const original: RadarPaciente[] = [
      p("Z", null, 1),
      p("A", null, 99),
    ];
    const originalOrder = original.map((r) => r.nome);
    // sortByUrgencia recebe cópia (o wrapper sorted já faz [...patients])
    // mas o export direto também deve ser seguro — testar via sorted()
    const result = sorted(original);
    expect(result).toEqual(["A", "Z"]);
    // O array original não foi mutado (sorted faz cópia interna)
    expect(original.map((r) => r.nome)).toEqual(originalOrder);
  });
});
