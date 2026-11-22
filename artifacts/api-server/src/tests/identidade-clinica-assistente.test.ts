import { describe, it, expect } from "vitest";
import { apresentacao } from "../lib/telegram-agendamento";
import { comGlobais, criarFrase, mapaPadrao, FRASES_PADRAO } from "../lib/telegram-frases";

describe("identidade: a assistente usa o nome da CLÍNICA, nunca o do sistema", () => {
  const frase = comGlobais(criarFrase(mapaPadrao()), {});
  it("apresenta-se como virtual com o nome da clínica", () => {
    expect(apresentacao(frase, "Instituto Padua")).toContain("Instituto Padua");
    expect(apresentacao(frase, "Instituto Barakat")).toContain("Instituto Barakat");
  });
  it("sem nome da clínica, não inventa nome", () => {
    expect(apresentacao(frase)).toContain("assistente virtual da clínica");
    expect(apresentacao(frase, "  ")).not.toContain("PaxMed");
  });
  it("encaminhamento é um texto editável com o nome real da clínica", () => {
    const t = comGlobais(criarFrase(mapaPadrao()), { clinica: "Instituto Padua" })("sem_orientacao_encaminhada");
    expect(t).toContain("equipe de Instituto Padua");
    expect(t).not.toMatch(/paxmed|paxter|padaxor/i);
    expect(FRASES_PADRAO.sem_orientacao_encaminhada.texto).toContain("{clinica}");
  });
});
