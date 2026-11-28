import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CATEGORIAS, renderTexto, validarModelo, decidirFlyer, validarValor, brl, primeiroNome, ErroComunicacao, type Regra, type Categoria,
} from "../lib/comunicacao-padrao";
import { renderFlyerPaxmed } from "../lib/flyer-paxmed";

const vars = (clinica: string, nome: string, extra: Record<string, string> = {}) => ({ nome, assistente: "Helena", clinica, ...extra });

describe("texto padronizado", () => {
  it("link de pagamento: parágrafos separados por linha em branco, saudação, Helena na frase, assinatura em linhas distintas", () => {
    const t = renderTexto(CATEGORIAS.link_pagamento.texto, vars("Instituto Padua", primeiroNome("Dayana Ludman Alves"), { valor: brl(500), referencia: "Teste PaxMed", link: "https://x.test/pagar/abc" }));
    const par = t.split("\n\n");
    expect(par[0]).toBe("Dayana, tudo bem?");
    expect(par[1]).toBe("Eu sou a Helena, assistente virtual de Instituto Padua, e estou encaminhando o seu link de pagamento.");
    expect(par[2]).toBe("Valor: R$ 5,00");
    expect(par[3]).toBe("Referência: Teste PaxMed");
    expect(par[4]).toBe("Link: https://x.test/pagar/abc");
    expect(par[par.length - 1]).toBe("Helena, assistente virtual\nInstituto Padua");
    expect(t).not.toMatch(/\{\w+\}/);
  });
  it("clínicas e valores diferentes geram textos diferentes e corretos", () => {
    const a = renderTexto(CATEGORIAS.boleto.texto, vars("Clinica A", "Ana", { valor: brl(123456), referencia: "R1", vencimento: "21/11/2026", link: "https://a.test" }));
    const b = renderTexto(CATEGORIAS.boleto.texto, vars("Clinica B", "Bruno", { valor: brl(99), referencia: "R2", vencimento: "30/12/2026", link: "https://b.test" }));
    expect(a).toContain("R$ 1.234,56"); expect(a).toContain("Clinica A"); expect(a).not.toContain("Clinica B");
    expect(b).toContain("R$ 0,99"); expect(b).toContain("Bruno, tudo bem?");
  });
  it("variável sem valor derruba a renderização (nunca sai texto incompleto)", () => {
    expect(() => renderTexto(CATEGORIAS.link_pagamento.texto, vars("X", "Ana", { valor: "R$ 1,00" }))).toThrow(ErroComunicacao);
  });
  it("os 6 modelos padrão são válidos e pedido de exame não promete nem emite documento", () => {
    for (const cat of Object.keys(CATEGORIAS) as Categoria[]) expect(validarModelo(cat, CATEGORIAS[cat].texto)).toBeNull();
    expect(CATEGORIAS.pedido_exame.texto).toContain("médico");
    expect(CATEGORIAS.pedido_exame.texto).toContain("avaliação");
  });
  it("edição inválida é recusada (variável estranha, obrigatória ausente)", () => {
    expect(validarModelo("link_pagamento", CATEGORIAS.link_pagamento.texto + " {segredo}")).toMatch(/não existe/);
    expect(validarModelo("link_pagamento", CATEGORIAS.link_pagamento.texto.replace("{link}", ""))).toMatch(/obrigatória/);
  });
});

describe("critério de flyer por categoria e clínica", () => {
  const padrao: Regra[] = (Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({ empresaId: null, categoria: c, enviarFlyer: CATEGORIAS[c].flyerPadrao }));
  it("pagamento, boleto e documento recebem flyer", () => {
    for (const c of ["link_pagamento", "boleto", "documento"]) expect(decidirFlyer(padrao, 5, c)).toBe(true);
  });
  it("conversa trivial e categoria sem regra NÃO recebem flyer", () => {
    expect(decidirFlyer(padrao, 5, "conversa_trivial")).toBe(false);
    expect(decidirFlyer(padrao, 5, "saudacao")).toBe(false);
  });
  it("regra da clínica vence a padrão, sem afetar outra clínica", () => {
    const r: Regra[] = [...padrao, { empresaId: 7, categoria: "boleto", enviarFlyer: false }];
    expect(decidirFlyer(r, 7, "boleto")).toBe(false);
    expect(decidirFlyer(r, 5, "boleto")).toBe(true);
  });
});

describe("validação de valor e ambiente", () => {
  it("teste limita a R$ 5; produção aceita acima; inválidos recusados", () => {
    expect(validarValor(500, "teste")).toBe(500);
    expect(() => validarValor(501, "teste")).toThrow();
    expect(validarValor(12345, "producao")).toBe(12345);
    for (const v of [0, -1, 1.5, NaN, "5", null]) expect(() => validarValor(v, "producao")).toThrow();
  });
});

describe("flyer determinístico", () => {
  it("mesmos dados geram a mesma imagem; 1200 px de largura; altura cresce com as linhas", async () => {
    const e = { titulo: "Link de pagamento", linhas: [{ rotulo: "Valor", valor: "R$ 5,00" }, { rotulo: "Horário", valor: null }], clinica: "Instituto Padua" };
    const a = await renderFlyerPaxmed(e); const b = await renderFlyerPaxmed(e);
    expect(a.equals(b)).toBe(true);
    const w = a.readUInt32BE(16), h1 = a.readUInt32BE(20);
    expect(w).toBe(1200);
    const c = await renderFlyerPaxmed({ ...e, linhas: [...e.linhas, { rotulo: "Data", valor: "20/11/2026" }] });
    expect(c.readUInt32BE(20)).toBeGreaterThan(h1);
  });
});

describe("nenhuma IA no texto padronizado", () => {
  it("os módulos do compositor e do flyer não importam clientes de IA nem fazem chamada de IA", () => {
    for (const f of ["comunicacao-padrao.ts", "flyer-paxmed.ts"]) {
      const src = readFileSync(new URL(`../lib/${f}`, import.meta.url), "utf8");
      const imports = [...src.matchAll(/^import .* from "(.*)"/gm)].map((m) => m[1]).join("\n");
      expect(imports).not.toMatch(/openai|anthropic|gemini|llm|ai-central|openrouter|multi-ia/i);
      expect(src).not.toMatch(/api\.openai|api\.anthropic|generativelanguage|openrouter/i);
    }
  });
});
