import { describe, expect, it } from "vitest";
import { atribuirNomesUnicos, nomeProcedimentoDeSubstancia, tokenDoseDaSubstancia, type SubstanciaOrigem } from "../lib/procedimentos-de-substancias";

const base = { isBlend: false, composicao: null } as const;
const sub = (id: number, name: string, procedureType: string, defaultDose: string | null, extra: Partial<SubstanciaOrigem> = {}) =>
  ({ id, name, procedureType, defaultDose, ...base, ...extra }) as SubstanciaOrigem;

describe("nome do procedimento gerado da substância", () => {
  it("junta nome limpo e dose sem espaço nem volume", () => {
    expect(nomeProcedimentoDeSubstancia(sub(1, "COENZIMA Q10", "im", "100 MG / 2 ML"))).toBe("COENZIMA Q10 100MG");
  });
  it("implante: tira 'Implante' e 'PELLET' e a lista de pellets", () => {
    expect(nomeProcedimentoDeSubstancia(sub(2, "GESTRINONA PELLET", "implant", "50 MG — 1 A 2 pellets"))).toBe("GESTRINONA 50MG");
    expect(nomeProcedimentoDeSubstancia(sub(3, "Implante Gestrinona 20mg", "implant", null))).toBe("GESTRINONA 20MG");
  });
  it("não repete a dose que já está no nome e ignora dose variável", () => {
    expect(nomeProcedimentoDeSubstancia(sub(4, "TIRZEPATIDA 5MG", "im", "5 MG"))).toBe("TIRZEPATIDA 5MG");
    expect(tokenDoseDaSubstancia("VARIAVEL MG")).toBeNull();
  });
  it("BLEND genérico usa a composição; sufixos soltos são removidos", () => {
    expect(nomeProcedimentoDeSubstancia(sub(5, "BLEND", "im", null, { isBlend: true, composicao: "TGF B3, IDP2, IGF" }))).toBe("BLEND TGF B3, IDP2, IGF");
    expect(nomeProcedimentoDeSubstancia(sub(6, "LIPOREDUCTYL -", "im", null))).toBe("LIPOREDUCTYL");
  });
  it("colisões: via só quando repete; depois o número do cadastro; nunca passa de 200 caracteres", () => {
    const nomes = atribuirNomesUnicos([
      sub(10, "PROGESTERONA", "im", "50 MG"), sub(11, "PROGESTERONA PELLET", "implant", "50 MG — 1 pellet"),
      sub(12, "BLEND", "im", null, { isBlend: true, composicao: "X".repeat(210) }),
      sub(13, "BLEND", "im", null, { isBlend: true, composicao: "X".repeat(210) }),
    ]);
    expect(nomes.get(10)).toBe("PROGESTERONA 50MG (INTRAMUSCULAR)");
    expect(nomes.get(11)).toBe("PROGESTERONA 50MG (IMPLANTE)");
    expect(nomes.get(12)!.endsWith(" #12")).toBe(true);
    expect(nomes.get(12)!.length).toBeLessThanOrEqual(200);
    expect(new Set([...nomes.values()]).size).toBe(4);
  });
});
