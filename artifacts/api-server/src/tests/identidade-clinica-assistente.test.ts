import { describe, it, expect } from "vitest";
import { apresentacao } from "../lib/telegram-agendamento";
import { textoEncaminhado, TEXTO_ENCAMINHADO } from "../lib/atendimento-telegram";

describe("identidade: a assistente usa o nome da CLÍNICA, nunca o do sistema", () => {
  it("apresenta-se como virtual com o nome da clínica", () => {
    expect(apresentacao("Instituto Padua")).toBe("Olá! Sou a assistente virtual de Instituto Padua.");
    expect(apresentacao("Instituto Barakat")).toContain("Instituto Barakat");
  });
  it("sem nome da clínica, não inventa nome", () => {
    expect(apresentacao(undefined)).toBe("Olá! Sou a assistente virtual da clínica.");
    expect(apresentacao("  ")).toBe("Olá! Sou a assistente virtual da clínica.");
  });
  it("texto de encaminhamento troca 'da clínica' pelo nome real e nunca cita PaxMed/Paxter", () => {
    const t = textoEncaminhado("Instituto Padua");
    expect(t).toContain("assistente virtual de Instituto Padua");
    expect(t).toContain("equipe de Instituto Padua");
    expect(t).not.toMatch(/paxmed|paxter|padaxor/i);
    expect(textoEncaminhado(null)).toBe(TEXTO_ENCAMINHADO);
    expect(TEXTO_ENCAMINHADO).not.toMatch(/paxmed|paxter|padaxor/i);
  });
});
