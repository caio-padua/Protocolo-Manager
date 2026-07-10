import { describe, expect, it } from "vitest";
import { parsePosologia, semAcento } from "./index";

describe("parsePosologia (clone fiel do IHE)", () => {
  it("le quantidade e momento de uma tomada simples", () => {
    const p = parsePosologia("1 dose no almoco");
    expect(p.quantidade).toBe(1);
  });

  it("le quantidade com decimal por virgula", () => {
    const p = parsePosologia("1,5 dose ao deitar");
    expect(p.quantidade).toBe(1.5);
  });

  it("le quantidade com decimal por ponto", () => {
    const p = parsePosologia("2.5 ml pela manha");
    expect(p.quantidade).toBe(2.5);
  });

  it("posologia sem numero nao inventa quantidade", () => {
    const p = parsePosologia("Tomar em jejum");
    expect(p.quantidade).toBeUndefined();
  });

  it("quantidade so vale no inicio do texto (comportamento do clone IHE)", () => {
    const p = parsePosologia("Tomar 1 dose no almoco");
    expect(p.quantidade).toBeUndefined();
  });

  it("detecta via oral", () => {
    const p = parsePosologia("Tomar 1 capsula via oral no jantar");
    expect(p.via).toBe("oral");
  });

  it("detecta via sublingual", () => {
    const p = parsePosologia("Uso sublingual");
    expect(p.via).toBe("sublingual");
  });

  it("duas posologias distintas mantem quantidades separadas", () => {
    const a = parsePosologia("1 dose no cafe da manha");
    const b = parsePosologia("2 doses no jantar");
    expect(a.quantidade).toBe(1);
    expect(b.quantidade).toBe(2);
  });
});

describe("semAcento (regra do CEO: tudo sem acento)", () => {
  it("remove acentos e cedilha", () => {
    expect(semAcento("Início da Manhã, café, coração, açaí")).toBe(
      "Inicio da Manha, cafe, coracao, acai",
    );
  });

  it("preserva emojis, quebras e formatacao", () => {
    const txt = "*Período:* _Início da Tarde_\n💊 Fórmula";
    expect(semAcento(txt)).toBe("*Periodo:* _Inicio da Tarde_\n💊 Formula");
  });

  it("troca ordinais", () => {
    expect(semAcento("1º dia, 3ª dose")).toBe("1o dia, 3a dose");
  });
});
