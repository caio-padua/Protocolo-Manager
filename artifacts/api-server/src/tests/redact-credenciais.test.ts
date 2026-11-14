import { describe, it, expect } from "vitest";
import { redigir, redigirTexto, redigirPorValor, nomeEhSensivel } from "../lib/redact";

const TOK = "1234567890:" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

describe("redacao de credenciais", () => {
  it("pega nomes em qualquer caixa e separador", () => {
    for (const n of ["botToken", "BOT_TOKEN", "bot-token", "Authorization", "apiKey", "API_KEY", "Senha", "webhookSecret", "access_token"])
      expect(nomeEhSensivel(n)).toBe(true);
    expect(nomeEhSensivel("nome")).toBe(false);
  });
  it("mascara por nome, por valor e dentro de URL/erro", () => {
    const o = redigir({ BotToken: TOK, url: `https://api.telegram.org/bot${TOK}/getMe`, ok: 1, nested: { Senha: "x1y2z3w4" } });
    const s = JSON.stringify(o);
    expect(s).not.toContain(TOK);
    expect(s).not.toContain("x1y2z3w4");
    expect(o.ok).toBe(1);
    expect(redigir(new Error(`falhou ${TOK}`)).message).not.toContain(TOK);
    expect(redigirTexto(`access_token=abcdef123456`)).not.toContain("abcdef123456");
  });
  it("rede de resposta nao quebra contratos (so valor)", () => {
    const r = redigirPorValor({ token: "ok-curto", texto: `x ${TOK}` }) as { token: string; texto: string };
    expect(r.token).toBe("ok-curto");
    expect(r.texto).not.toContain(TOK);
  });
});
