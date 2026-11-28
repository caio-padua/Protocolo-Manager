import { describe, it, expect } from "vitest";
import { classificarStatusTelegram } from "./telegram-status";

const corpoOk = { provider: "telegram", active: true, tokenStatus: { isSet: true, masked: "••••abc123" }, webhookSecretStatus: { isSet: true } };

describe("classificarStatusTelegram", () => {
  it("token no cofre e canal ativo => ok ativo", () => {
    expect(classificarStatusTelegram(200, corpoOk)).toEqual({ tipo: "ok", ativo: true, configurado: true });
  });
  it("token no cofre e canal desligado => ok, configurado, inativo", () => {
    expect(classificarStatusTelegram(200, { ...corpoOk, active: false })).toEqual({ tipo: "ok", ativo: false, configurado: true });
  });
  it("sem token => ok, nao configurado", () => {
    expect(classificarStatusTelegram(200, { ...corpoOk, tokenStatus: { isSet: false } })).toEqual({ tipo: "ok", ativo: true, configurado: false });
  });
  it("401 NUNCA vira 'nao configurado'", () => {
    expect(classificarStatusTelegram(401, { error: "x" })).toEqual({ tipo: "erro", motivo: "acesso" });
    expect(classificarStatusTelegram(403, null)).toEqual({ tipo: "erro", motivo: "acesso" });
  });
  it("500 e erro de servidor", () => {
    expect(classificarStatusTelegram(500, {})).toEqual({ tipo: "erro", motivo: "servidor" });
  });
  it("campo antigo 'configured' sozinho nao basta (formato inesperado)", () => {
    expect(classificarStatusTelegram(200, { active: true, configured: true })).toEqual({ tipo: "erro", motivo: "resposta" });
  });
  it("corpo vazio e erro de resposta", () => {
    expect(classificarStatusTelegram(200, null)).toEqual({ tipo: "erro", motivo: "resposta" });
  });
});
