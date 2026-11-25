import { describe, expect, it } from "vitest";
import { formatarSaidaHelena, formatarCorpoHelena } from "../lib/helena-formatador";
import { FRASES_PADRAO, mapaPadrao, criarFrase, comGlobais } from "../lib/telegram-frases";

const F = comGlobais(criarFrase(mapaPadrao()), { clinica: "Instituto Pádua", primeiroNome: "Dayana" });
const ASS = F("assinatura");

const blocosOk = (t: string) => t.split("\n\n").every((b) => {
  const ls = b.split("\n");
  return ls.every((l) => /^[•]\s/.test(l)) || ls.length <= 3;
});

describe("formatador visual da Helena", () => {
  it("texto corrido sem quebra vira blocos curtos, lista com bolinha e assinatura completa", () => {
    const sujo = "Olá, Dayana! Tudo bem? Recebi sua mensagem. Vou conferir agora mesmo. Veja o que está incluído:• Análise clínica profunda• Método GPS• Planejamento estratégico. Qualquer dúvida estou aqui.";
    const r = formatarSaidaHelena(sujo, ASS);
    expect(r.endsWith(ASS)).toBe(true);
    expect(r).toContain("Helena\nAtendimento e Relacionamento\nInstituto Pádua");
    expect(r).toContain("• Análise clínica profunda\n• Método GPS\n• Planejamento estratégico");
    expect(blocosOk(r)).toBe(true);
  });
  it("é idempotente e não duplica a assinatura", () => {
    const um = formatarSaidaHelena("Olá.\n\nComo posso ajudar?", ASS);
    expect(formatarSaidaHelena(um, ASS)).toBe(um);
    expect(um.split("Encontro-me à sua inteira disposição").length - 1).toBe(1);
  });
  it("traço vira bolinha e a lista fica um item por linha", () => {
    expect(formatarCorpoHelena("Itens:\n- um\n- dois")).toBe("Itens:\n\n• um\n• dois");
  });
  it("100% das frases do catálogo, depois do formatador, respeitam blocos de até 3 linhas e terminam na assinatura", () => {
    for (const [k, def] of Object.entries(FRASES_PADRAO)) {
      const vars = Object.fromEntries(def.variaveis.map((v) => [v, v === "link" ? "https://x.test/agendar" : "Exemplo"]));
      const out = formatarSaidaHelena(F(k as never, vars), ASS);
      expect(out.endsWith(ASS), k).toBe(true);
      expect(blocosOk(out.slice(0, out.length - ASS.length).trim() || "x"), k).toBe(true);
    }
  });
});

describe("abreviações não quebram frases", () => {
  it("Dr. Caio permanece na mesma linha", () => {
    expect(formatarCorpoHelena("Como o próprio Dr. Caio costuma dizer.")).toContain("Dr. Caio");
  });
});
