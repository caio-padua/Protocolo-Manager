/** Regras puras de segurança e confiabilidade do WhatsApp (sem banco, sem rede). */
import { describe, it, expect } from "vitest";
import {
  assinaturaEsperada, assinaturaTwilioValida, telefoneCanonico, statusPodeAvancar,
  autorespostaHabilitada, envioPermitidoNoModoTeste, janelaAberta, mascararTelefone, CONTENT_SID_RE,
} from "../lib/whatsapp-seguranca";

const URL_ = "https://exemplo.test/api/whatsapp/inbound";
const P = { From: "whatsapp:+5511999990000", Body: "oi", MessageSid: "SM1" };

describe("assinatura Twilio", () => {
  const ok = assinaturaEsperada("tok", URL_, P);
  it("aceita assinatura correta", () => expect(assinaturaTwilioValida("tok", ok, [URL_], P)).toBe(true));
  it("recusa ausente", () => expect(assinaturaTwilioValida("tok", undefined, [URL_], P)).toBe(false));
  it("recusa vazia", () => expect(assinaturaTwilioValida("tok", "", [URL_], P)).toBe(false));
  it("recusa inválida", () => expect(assinaturaTwilioValida("tok", "AAAA", [URL_], P)).toBe(false));
  it("recusa corpo alterado", () => expect(assinaturaTwilioValida("tok", ok, [URL_], { ...P, Body: "outro" })).toBe(false));
  it("recusa token diferente", () => expect(assinaturaTwilioValida("outro", ok, [URL_], P)).toBe(false));
  it("recusa sem token", () => expect(assinaturaTwilioValida("", ok, [URL_], P)).toBe(false));
});

describe("telefone completo", () => {
  it("canônico com e sem DDI", () => {
    expect(telefoneCanonico("(11) 99999-0000")).toBe("5511999990000");
    expect(telefoneCanonico("whatsapp:+5511999990000")).toBe("5511999990000");
  });
  it("pedaço do número não identifica", () => {
    expect(telefoneCanonico("9999-0000")).toBeNull();
    expect(telefoneCanonico("99990000")).toBeNull();
  });
  it("número internacional com + não ganha 55", () => expect(telefoneCanonico("+15715780004")).toBe("15715780004"));
  it("mascara", () => expect(mascararTelefone("5511999990000")).toBe("***0000"));
});

describe("status de entrega nunca retrocede", () => {
  it("avança", () => { expect(statusPodeAvancar("queued", "sent")).toBe(true); expect(statusPodeAvancar("sent", "delivered")).toBe(true); expect(statusPodeAvancar("delivered", "read")).toBe(true); });
  it("não volta", () => { expect(statusPodeAvancar("delivered", "sent")).toBe(false); expect(statusPodeAvancar("read", "delivered")).toBe(false); });
  it("falha tardia não apaga entrega", () => expect(statusPodeAvancar("delivered", "failed")).toBe(false));
  it("falha vale antes de entrega", () => { expect(statusPodeAvancar("sent", "undelivered")).toBe(true); expect(statusPodeAvancar("queued", "failed")).toBe(true); });
  it("falha final não é reaberta", () => expect(statusPodeAvancar("failed", "sent")).toBe(false));
});

describe("chaves de segurança", () => {
  it("resposta automática desligada por padrão", () => {
    expect(autorespostaHabilitada({})).toBe(false);
    expect(autorespostaHabilitada({ WHATSAPP_INBOUND_AUTORESPOSTA: "true" })).toBe(true);
  });
  it("modo teste: só o contato autorizado", () => {
    const env = { WHATSAPP_MODO_TESTE: "true", WHATSAPP_CONTATO_TESTE: "+55 11 99999-0000" };
    expect(envioPermitidoNoModoTeste("5511999990000", env)).toBe(true);
    expect(envioPermitidoNoModoTeste("5511988887777", env)).toBe(false);
    expect(envioPermitidoNoModoTeste("99990000", env)).toBe(false);
  });
  it("modo teste sem contato configurado bloqueia tudo", () => expect(envioPermitidoNoModoTeste("5511999990000", { WHATSAPP_MODO_TESTE: "true" })).toBe(false));
  it("fora do modo teste nada muda", () => expect(envioPermitidoNoModoTeste("5511988887777", {})).toBe(true));
  it("janela de 24 h", () => {
    const agora = new Date("2026-11-22T12:00:00Z");
    expect(janelaAberta(new Date("2026-11-22T00:00:00Z"), agora)).toBe(true);
    expect(janelaAberta(new Date("2026-11-21T11:59:00Z"), agora)).toBe(false);
    expect(janelaAberta(null, agora)).toBe(false);
  });
  it("formato do modelo aprovado", () => {
    expect(CONTENT_SID_RE.test("HX" + "a".repeat(32))).toBe(true);
    expect(CONTENT_SID_RE.test("HX123")).toBe(false);
  });
});
