import { describe, it, expect } from "vitest";
import { escaparHtmlTelegram, marcadoresPendentes, normalizarQuebras, LIMITE_RESPOSTA } from "../lib/orientacao-texto";

describe("orientacao-texto", () => {
  it("escapa só <, > e & e preserva quebras, linhas em branco e emojis", () => {
    const t = "Olá!\n\nTudo bem? 📅 13.11.2026 - sexta-feira\n⏰ 09:30 & <b>x</b>";
    const e = escaparHtmlTelegram(t);
    expect(e).toBe("Olá!\n\nTudo bem? 📅 13.11.2026 - sexta-feira\n⏰ 09:30 &amp; &lt;b&gt;x&lt;/b&gt;");
    expect(e.split("\n")).toHaveLength(4);
  });
  it("normaliza CRLF para LF sem perder linhas em branco", () => {
    expect(normalizarQuebras("a\r\n\r\nb\rc")).toBe("a\n\nb\nc");
  });
  it("detecta marcadores pendentes e ignora texto final", () => {
    expect(marcadoresPendentes("Olá, [nome]! {{horarios}} [data e dia da semana]")).toEqual(["[nome]", "[data e dia da semana]", "{{horarios}}"]);
    expect(marcadoresPendentes("Olá, Maria! Às 09:30.")).toEqual([]);
  });
  it("limite cabe numa mensagem do Telegram", () => { expect(LIMITE_RESPOSTA).toBeLessThanOrEqual(4096); });
});
