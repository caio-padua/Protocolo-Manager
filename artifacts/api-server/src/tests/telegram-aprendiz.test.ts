import { describe, expect, it } from "vitest";
import { normalizarPerguntaAprendida, perguntaSeguraParaAprender, similaridadePerguntas } from "../lib/telegram-aprendiz";

describe("aprendizado limitado de perguntas do Telegram", () => {
  it("aceita apenas perguntas comuns de categorias explícitas", () => {
    expect(perguntaSeguraParaAprender("Como funciona o aplicativo?", "gerais", "aplicativo")).toBe(true);
    expect(perguntaSeguraParaAprender("Como funciona o aplicativo?", "duvidas", "aplicativo")).toBe(true);
    expect(perguntaSeguraParaAprender("Como funciona o aplicativo?", "clinico", null)).toBe(false);
    expect(perguntaSeguraParaAprender("Como funciona o aplicativo?", "gerais", "precos")).toBe(false);
  });

  it("recusa conteúdo clínico, comercial e identificadores pessoais", () => {
    expect(perguntaSeguraParaAprender("Qual dose devo usar no tratamento?", "gerais", "aplicativo")).toBe(false);
    expect(perguntaSeguraParaAprender("Quanto custa a consulta?", "gerais", "locais")).toBe(false);
    expect(perguntaSeguraParaAprender("Meu CPF 123.456.789-09 serve para cadastro?", "cadastro", null)).toBe(false);
    expect(perguntaSeguraParaAprender("Minha data 13/06/1990 foi cadastrada?", "cadastro", null)).toBe(false);
    expect(perguntaSeguraParaAprender("Meu telefone é 11987654321, como cadastro?", "cadastro", null)).toBe(false);
  });

  it("normaliza saudações e acentos sem aproximar perguntas diferentes", () => {
    expect(normalizarPerguntaAprendida("Oi, como funciona o aplicativo?")).toBe("como funciona o aplicativo");
    expect(similaridadePerguntas("Como funciona o aplicativo?", "O app funciona de que maneira?")).toBeLessThan(0.72);
    expect(similaridadePerguntas("Como funciona o aplicativo?", "Por favor, como funciona o aplicativo?")).toBeGreaterThanOrEqual(0.72);
  });
});
