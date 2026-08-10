/**
 * radar-mensagem.test.ts
 *
 * Testes de unidade da lógica de envio rápido do Radar Clínico.
 * Cobre os três canais (WhatsApp, Telegram, E-mail) nos caminhos:
 *  - Entrega com sucesso + histórico gravado
 *  - Entrega com sucesso + falha ao gravar histórico (historyStored=false)
 *  - Canais sem dado do paciente (422)
 *  - Telegram mock/sem token (422)
 *  - WhatsApp sem Twilio → link (422)
 *  - WhatsApp Twilio configurado mas falha → link de fallback (502)
 *  - Mapeamento de código Twilio legível (63015, 63016)
 *  - Canal inválido (400)
 *  - Paciente não encontrado (404)
 *  - Validação de campos obrigatórios (400)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enviarMensagemRadar,
  type RadarMensagemDeps,
  type ClienteBasico,
  type WhatsappResult,
  type TelegramResult,
  type GmailResult,
} from "../lib/radar-mensagem";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENTE_COMPLETO: ClienteBasico = {
  id: 42,
  name: "Mariana Costa",
  phone: "(11) 98222-3344",
  email: "mariana@exemplo.com",
  telegram_chat_id: "987654321",
};

const CLIENTE_SEM_TELEFONE: ClienteBasico = { ...CLIENTE_COMPLETO, phone: null };
const CLIENTE_SEM_EMAIL: ClienteBasico    = { ...CLIENTE_COMPLETO, email: null };
const CLIENTE_SEM_TELEGRAM: ClienteBasico = { ...CLIENTE_COMPLETO, telegram_chat_id: null };

const PARAMS_BASE = { clientId: 42, empresaId: 5, mensagem: "Olá, Dr. Caio aqui!" };

// ── Deps padrão (tudo OK) ────────────────────────────────────────────────────

function makeDeps(overrides: Partial<RadarMensagemDeps> = {}): RadarMensagemDeps {
  return {
    getCliente:   vi.fn().mockResolvedValue(CLIENTE_COMPLETO),
    sendWhatsapp: vi.fn().mockResolvedValue({ sent: true, via: "twilio", link: "https://wa.me/..." } as WhatsappResult),
    sendTelegram: vi.fn().mockResolvedValue({ sent: true, mock: false } as TelegramResult),
    sendGmail:    vi.fn().mockResolvedValue({ success: true } as GmailResult),
    saveHistory:  vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 1 — Validação de entrada
// ─────────────────────────────────────────────────────────────────────────────
describe("enviarMensagemRadar — validação de entrada", () => {
  it("retorna 400 quando clientId está ausente", async () => {
    const r = await enviarMensagemRadar({ clientId: 0, canal: "email", mensagem: "oi", empresaId: 5 }, makeDeps());
    expect(r.kind).toBe("400");
  });

  it("retorna 400 quando canal está vazio", async () => {
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "" }, makeDeps());
    expect(r.kind).toBe("400");
  });

  it("retorna 400 quando mensagem está vazia", async () => {
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "email", mensagem: "" }, makeDeps());
    expect(r.kind).toBe("400");
  });

  it("retorna 400 para canal inválido", async () => {
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "fax" }, makeDeps());
    expect(r.kind).toBe("400");
    if (r.kind === "400") expect(r.error).toMatch(/Canal inválido/);
  });

  it("retorna 404 quando paciente não existe no tenant", async () => {
    const deps = makeDeps({ getCliente: vi.fn().mockResolvedValue(null) });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "email" }, deps);
    expect(r.kind).toBe("404");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 2 — Canal WhatsApp
// ─────────────────────────────────────────────────────────────────────────────
describe("enviarMensagemRadar — WhatsApp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SUCESSO: retorna ok + historyStored=true quando Twilio entrega", async () => {
    const deps = makeDeps();
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "whatsapp" }, deps);

    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.historyStored).toBe(true);
    expect(deps.sendWhatsapp).toHaveBeenCalledWith(CLIENTE_COMPLETO.phone, PARAMS_BASE.mensagem);
    expect(deps.saveHistory).toHaveBeenCalledOnce();
    const saveCall = (deps.saveHistory as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saveCall.via).toBe("twilio");
  });

  it("SUCESSO historyStored=false: avisa quando INSERT no histórico falha", async () => {
    const deps = makeDeps({
      saveHistory: vi.fn().mockRejectedValue(new Error("DB offline")),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "whatsapp" }, deps);

    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.historyStored).toBe(false);
      expect(r.historyError).toMatch(/DB offline/);
    }
  });

  it("422: paciente sem telefone", async () => {
    const deps = makeDeps({ getCliente: vi.fn().mockResolvedValue(CLIENTE_SEM_TELEFONE) });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "whatsapp" }, deps);
    expect(r.kind).toBe("422");
    if (r.kind === "422") expect(r.error).toMatch(/sem telefone/);
  });

  it("422 + link: WhatsApp sem Twilio devolve link wa.me manual", async () => {
    const waLink = "https://wa.me/5511982223344?text=Ol%C3%A1";
    const deps = makeDeps({
      sendWhatsapp: vi.fn().mockResolvedValue({
        sent: false, via: "link", link: waLink,
      } as WhatsappResult),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "whatsapp" }, deps);

    expect(r.kind).toBe("422");
    if (r.kind === "422") {
      expect(r.error).toMatch(/Twilio sem credenciais/);
      expect(r.link).toBe(waLink);
    }
    expect(deps.saveHistory).not.toHaveBeenCalled();
  });

  it("502 + link: Twilio configurado mas rejeita entrega (ex.: 63015)", async () => {
    const waLink = "https://wa.me/5511982223344?text=Ol%C3%A1";
    const deps = makeDeps({
      sendWhatsapp: vi.fn().mockResolvedValue({
        sent: false, via: "twilio", link: waLink, error: "twilio_63015",
      } as WhatsappResult),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "whatsapp" }, deps);

    expect(r.kind).toBe("502");
    if (r.kind === "502") {
      // Mensagem deve estar em português, não o código técnico
      expect(r.error).not.toBe("twilio_63015");
      expect(r.error).toMatch(/24 h/);
      // Link de fallback incluso para o médico enviar manualmente
      expect(r.link).toBe(waLink);
    }
    expect(deps.saveHistory).not.toHaveBeenCalled();
  });

  it("502 + link: mapeamento legível do código 63016 (janela expirada)", async () => {
    const waLink = "https://wa.me/55119teste";
    const deps = makeDeps({
      sendWhatsapp: vi.fn().mockResolvedValue({
        sent: false, via: "twilio", link: waLink, error: "twilio_63016",
      } as WhatsappResult),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "whatsapp" }, deps);

    expect(r.kind).toBe("502");
    if (r.kind === "502") {
      expect(r.error).toMatch(/janela de 24 h/);
      expect(r.link).toBe(waLink);
    }
  });

  it("502 + link: erro desconhecido do Twilio mantém código original mas inclui link", async () => {
    const waLink = "https://wa.me/55119nao-mapeado";
    const deps = makeDeps({
      sendWhatsapp: vi.fn().mockResolvedValue({
        sent: false, via: "twilio", link: waLink, error: "twilio_99999",
      } as WhatsappResult),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "whatsapp" }, deps);
    expect(r.kind).toBe("502");
    if (r.kind === "502") {
      expect(r.error).toBe("twilio_99999"); // código não mapeado fica como está
      expect(r.link).toBe(waLink);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 3 — Canal Telegram
// ─────────────────────────────────────────────────────────────────────────────
describe("enviarMensagemRadar — Telegram", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SUCESSO: retorna ok + historyStored=true quando bot entrega", async () => {
    const deps = makeDeps();
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "telegram" }, deps);

    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.historyStored).toBe(true);
    expect(deps.sendTelegram).toHaveBeenCalledWith(
      CLIENTE_COMPLETO.telegram_chat_id,
      PARAMS_BASE.mensagem,
    );
    const saveCall = (deps.saveHistory as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saveCall.via).toBe("telegram");
  });

  it("422: paciente sem chatId vinculado", async () => {
    const deps = makeDeps({ getCliente: vi.fn().mockResolvedValue(CLIENTE_SEM_TELEGRAM) });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "telegram" }, deps);
    expect(r.kind).toBe("422");
    if (r.kind === "422") expect(r.error).toMatch(/sem Telegram vinculado/);
  });

  it("422: Telegram sem token (mock=true) — honesto, não silencia", async () => {
    const deps = makeDeps({
      sendTelegram: vi.fn().mockResolvedValue({ sent: true, mock: true } as TelegramResult),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "telegram" }, deps);

    expect(r.kind).toBe("422");
    if (r.kind === "422") expect(r.error).toMatch(/Bot Token/);
    expect(deps.saveHistory).not.toHaveBeenCalled();
  });

  it("502: bot configurado mas API rejeita a mensagem", async () => {
    const deps = makeDeps({
      sendTelegram: vi.fn().mockResolvedValue({
        sent: false, mock: false, error: "telegram_http_403: bot blocked by user",
      } as TelegramResult),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "telegram" }, deps);

    expect(r.kind).toBe("502");
    if (r.kind === "502") expect(r.error).toMatch(/403/);
    expect(deps.saveHistory).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloco 4 — Canal E-mail
// ─────────────────────────────────────────────────────────────────────────────
describe("enviarMensagemRadar — E-mail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SUCESSO: retorna ok + historyStored=true quando Gmail entrega", async () => {
    const deps = makeDeps();
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "email" }, deps);

    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.historyStored).toBe(true);
    expect(deps.sendGmail).toHaveBeenCalledOnce();
    const [to, subject] = (deps.sendGmail as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(to).toBe(CLIENTE_COMPLETO.email);
    expect(subject).toMatch(CLIENTE_COMPLETO.name);
    const saveCall = (deps.saveHistory as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saveCall.via).toBe("gmail");
  });

  it("422: paciente sem e-mail cadastrado", async () => {
    const deps = makeDeps({ getCliente: vi.fn().mockResolvedValue(CLIENTE_SEM_EMAIL) });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "email" }, deps);
    expect(r.kind).toBe("422");
    if (r.kind === "422") expect(r.error).toMatch(/sem e-mail/);
  });

  it("502: Gmail rejeita o envio", async () => {
    const deps = makeDeps({
      sendGmail: vi.fn().mockResolvedValue({ success: false, error: "Gmail API 429" } as GmailResult),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "email" }, deps);

    expect(r.kind).toBe("502");
    if (r.kind === "502") expect(r.error).toMatch(/429/);
    expect(deps.saveHistory).not.toHaveBeenCalled();
  });

  it("escapa HTML na mensagem antes de enviar por e-mail", async () => {
    const deps = makeDeps();
    await enviarMensagemRadar(
      { ...PARAMS_BASE, canal: "email", mensagem: "<b>Urgente</b> & crítico" },
      deps,
    );
    const [, , html] = (deps.sendGmail as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<b>");
  });

  it("converte quebras de linha em <br> no corpo HTML", async () => {
    const deps = makeDeps();
    await enviarMensagemRadar(
      { ...PARAMS_BASE, canal: "email", mensagem: "Linha 1\nLinha 2" },
      deps,
    );
    const [, , html] = (deps.sendGmail as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(html).toContain("<br>");
  });

  it("SUCESSO historyStored=false: avisa quando INSERT falha após e-mail entregue", async () => {
    const deps = makeDeps({
      saveHistory: vi.fn().mockResolvedValue(false),
    });
    const r = await enviarMensagemRadar({ ...PARAMS_BASE, canal: "email" }, deps);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.historyStored).toBe(false);
  });
});
