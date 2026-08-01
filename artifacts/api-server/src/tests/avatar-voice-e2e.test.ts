/**
 * avatar-voice-e2e.test.ts
 *
 * Testes de integração controlada do canal VOICE do Motor Hermes.
 *
 * Cenários cobertos:
 *  1. Cache em memória: setAudioTemp + getAudioTemp entregam o buffer correto.
 *  2. Cache expirado: getAudioTemp retorna null após o TTL (simulado por clock falso).
 *  3. Canal VOICE — caminho feliz: gera MP3, cacheia, envia via WhatsApp.
 *     • Resposta contém sent:true e audioUrl preenchida.
 *     • getAudioTemp(key) retorna o buffer dentro do TTL.
 *     • registrarEnvioAvatar chamado com status:'ok'.
 *  4. Canal VOICE — sem telefone: skipped honesto (sem erro de exceção).
 *  5. Canal VOICE — ElevenLabs falha: resultado com sent:false, erro registrado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks declarados ANTES de qualquer import que os usa ────────────────────

// Módulo de DB — responde com um avatar ativo válido
vi.mock("@workspace/db", async () => {
  const { sql: realSql } = await import("drizzle-orm");
  return {
    db: {
      execute: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 7,
            empresa_id: 5,
            tipo: 1,
            nome_exibido: "Dr. Pádua",
            elevenlabs_voice_id: "voice_id_teste",
            heygen_avatar_id: null,
          },
        ],
      }),
    },
    sql: realSql,
  };
});

// ElevenLabs — retorna buffer MP3 falso (sem custo real)
vi.mock("../lib/elevenlabs", () => ({
  gerarAudio:             vi.fn(),
  checkElevenLabsStatus:  vi.fn(),
  listarVozes:            vi.fn(),
}));

// WhatsApp (Twilio) — simula envio bem-sucedido
vi.mock("../lib/whatsapp", () => ({
  sendWhatsapp:           vi.fn(),
  sendWhatsappStickerOnly: vi.fn().mockResolvedValue(undefined),
}));

// Histórico de envios de avatar — spy para verificar a gravação
vi.mock("../lib/avatar-envios", () => ({
  registrarEnvioAvatar: vi.fn().mockResolvedValue(undefined),
}));

// Metering — spy, sem efeito colateral real
vi.mock("../lib/avatar-metering", () => ({
  registrarUso:                vi.fn().mockResolvedValue(undefined),
  verificarModuloContratado:   vi.fn().mockResolvedValue({ temAcesso: true }),
}));

// Base URL pública — valor fixo para os testes
vi.mock("../lib/messaging/base-url", () => ({
  baseUrlFromEnv: vi.fn().mockReturnValue("https://test.replit.dev"),
  absoluteBaseUrl: vi.fn().mockReturnValue("https://test.replit.dev"),
}));

// Google/Gmail e Telegram — não devem ser acionados nos cenários VOICE, mas precisam existir
vi.mock("../lib/google-gmail", () => ({
  sendGmailMessage: vi.fn().mockResolvedValue({ success: false }),
}));
vi.mock("../lib/telegram", () => ({
  sendTelegramAnimation: vi.fn(),
  sendTelegramSticker:   vi.fn(),
}));

// ─── Imports (após os mocks) ──────────────────────────────────────────────────
import { getAudioTemp, setAudioTemp } from "../lib/avatar-messenger";
import { enviarMensagemPaxter }       from "../lib/messaging/engine";
import { gerarAudio }                 from "../lib/elevenlabs";
import { sendWhatsapp }               from "../lib/whatsapp";
import { sendGmailMessage }           from "../lib/google-gmail";
import { registrarEnvioAvatar }       from "../lib/avatar-envios";

// ─── Constantes de teste ──────────────────────────────────────────────────────

/** Buffer MP3 mínimo válido (3 bytes — fake). */
const FAKE_MP3 = Buffer.from([0xFF, 0xFB, 0x90]);

/** Documento de mensagem mínimo para o motor. */
const DOC_SIMPLES = {
  titulo:     "Olá, paciente",
  paragrafos: ["Seu exame de sangue chegou. Tudo dentro dos parâmetros normais."],
};

/** Destino com telefone válido (número fictício). */
const DESTINO_COM_FONE = {
  telefone:       "+5511999990000",
  email:          null,
  telegramChatId: null,
  nome:           "Maria Teste",
};

/** Destino apenas com e-mail (sem telefone) — fallback de VOICE via e-mail. */
const DESTINO_SEM_FONE_COM_EMAIL = {
  telefone:       null,
  email:          "maria@teste.com.br",
  telegramChatId: null,
  nome:           "Maria Teste",
};

/** Contexto de envio com empresa_id, avatarId e clienteId reais (IDs de teste). */
const CTX_PADRAO = {
  empresaId: 5,
  avatarId:  7,
  clienteId: 42,
  contexto:  "teste_e2e_voice",
};

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("Cache de áudio temporário (setAudioTemp / getAudioTemp)", () => {
  /**
   * Cenário 1 — Caminho feliz do cache:
   * setAudioTemp armazena o buffer e getAudioTemp o devolve íntegro.
   */
  it("armazena o buffer e o devolve pela mesma key dentro do TTL", () => {
    const key = setAudioTemp(FAKE_MP3);

    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(10); // UUID

    const recuperado = getAudioTemp(key);
    expect(recuperado).not.toBeNull();
    expect(recuperado!.equals(FAKE_MP3)).toBe(true);
  });

  /**
   * Cenário 2 — TTL expirado:
   * Simula a expiração manipulando o Date.now via vi.setSystemTime.
   * Após o TTL (5 minutos), getAudioTemp deve retornar null.
   */
  it("retorna null quando o TTL de 5 minutos já expirou", () => {
    const agora = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(agora);

    const key = setAudioTemp(FAKE_MP3);

    // Avança o relógio além dos 5 min de TTL
    vi.setSystemTime(agora + 5 * 60_000 + 1_000);

    const resultado = getAudioTemp(key);
    expect(resultado).toBeNull();

    vi.useRealTimers();
  });
});

describe("enviarMensagemPaxter — canal VOICE", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Restaura o comportamento padrão dos mocks antes de cada teste
    vi.mocked(gerarAudio).mockResolvedValue(FAKE_MP3);
    vi.mocked(sendWhatsapp).mockResolvedValue({
      sent: true,
      via:  "twilio_mock",
      link: "SM_FAKE_SID",
    });
    vi.mocked(sendGmailMessage).mockResolvedValue({ success: true });
  });

  /**
   * Cenário 3 — Caminho feliz VOICE → WhatsApp:
   * 3a. Resultado contém sent:true e audioUrl preenchida.
   * 3b. A audioUrl aponta para /api/avatares/audio-temp/:key.
   * 3c. A key na audioUrl serve o buffer correto via getAudioTemp.
   * 3d. registrarEnvioAvatar foi chamado com status:'ok'.
   */
  it("caminho feliz: sent:true, audioUrl preenchida, cache acessível, histórico gravado", async () => {
    const resultado = await enviarMensagemPaxter(
      DOC_SIMPLES,
      DESTINO_COM_FONE,
      ["VOICE"],
      CTX_PADRAO,
    );

    // ── 3a: algumEnviado e o canal VOICE marcado como sent:true ────────────
    expect(resultado.algumEnviado).toBe(true);

    const canalVoice = resultado.resultados.find(r => r.canal === "VOICE");
    expect(canalVoice).toBeDefined();
    expect(canalVoice!.sent).toBe(true);

    // ── 3b: audioUrl deve existir e apontar para /api/avatares/audio-temp/ ─
    const audioUrl: string = (canalVoice as any).audioUrl;
    expect(typeof audioUrl).toBe("string");
    expect(audioUrl).toMatch(/\/api\/avatares\/audio-temp\//);

    // ── 3c: key extraída da URL serve o buffer no cache ────────────────────
    const key = audioUrl.split("/api/avatares/audio-temp/")[1];
    expect(key).toBeTruthy();

    const bufferNaCache = getAudioTemp(key);
    expect(bufferNaCache).not.toBeNull();
    expect(bufferNaCache!.equals(FAKE_MP3)).toBe(true);

    // ── 3d: registrarEnvioAvatar foi chamado com status:'ok' ───────────────
    expect(registrarEnvioAvatar).toHaveBeenCalledOnce();
    expect(registrarEnvioAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        canal:        "VOICE",
        canalEntrega: "WHATSAPP",
        status:       "ok",
        empresaId:    5,
        avatarId:     7,
        clienteId:    42,
      }),
    );
  });

  /**
   * Cenário 4 — Sem telefone: skipped honesto.
   * O motor NÃO deve lançar exceção; deve retornar sent:false com skipped:true.
   */
  it("sem telefone: retorna skipped honesto sem lançar exceção", async () => {
    const destinoSemFone = { telefone: null, email: null, telegramChatId: null };

    const resultado = await enviarMensagemPaxter(
      DOC_SIMPLES,
      destinoSemFone,
      ["VOICE"],
      CTX_PADRAO,
    );

    expect(resultado.algumEnviado).toBe(false);

    const canalVoice = resultado.resultados.find(r => r.canal === "VOICE");
    expect(canalVoice).toBeDefined();
    expect(canalVoice!.sent).toBe(false);
    // Pode ser skipped (sem telefone sem email) — não deve ser undefined
    expect(
      (canalVoice as any).skipped === true || typeof (canalVoice as any).error === "string"
    ).toBe(true);

    // sendWhatsapp não deve ter sido chamado
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  /**
   * Cenário 5 — ElevenLabs lança erro: resultado sent:false com campo error.
   * O motor DEVE capturar a exceção e não derrubar a chamada de quem chamou.
   */
  it("quando ElevenLabs falha, retorna sent:false sem lançar exceção", async () => {
    vi.mocked(gerarAudio).mockRejectedValue(new Error("ElevenLabs: quota exceeded"));

    let erroLancado = false;
    let resultado: Awaited<ReturnType<typeof enviarMensagemPaxter>> | null = null;

    try {
      resultado = await enviarMensagemPaxter(
        DOC_SIMPLES,
        DESTINO_COM_FONE,
        ["VOICE"],
        CTX_PADRAO,
      );
    } catch {
      erroLancado = true;
    }

    expect(erroLancado).toBe(false); // motor absorve a exceção
    expect(resultado).not.toBeNull();
    expect(resultado!.algumEnviado).toBe(false);

    const canalVoice = resultado!.resultados.find(r => r.canal === "VOICE");
    expect(canalVoice).toBeDefined();
    expect(canalVoice!.sent).toBe(false);
    expect((canalVoice as any).error).toMatch(/ElevenLabs|quota/i);

    // WhatsApp nunca deve ter sido chamado
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  /**
   * Cenário 6 — VOICE via e-mail como fallback (sem telefone):
   * Quando destino.telefone=null e destino.email está preenchido, o motor deve:
   *   6a. Retornar sent:true (via "elevenlabs+gmail").
   *   6b. Chamar sendGmailMessage com anexo MP3 correto:
   *       filename="mensagem-do-seu-medico.mp3" e contentType="audio/mpeg".
   *   6c. sendWhatsapp NÃO deve ser chamado (não há telefone).
   *   6d. registrarEnvioAvatar chamado com canalEntrega:'EMAIL' e status:'ok'.
   */
  it("fallback e-mail: sent:true, anexo MP3 correto, WhatsApp não acionado, histórico com EMAIL", async () => {
    const resultado = await enviarMensagemPaxter(
      DOC_SIMPLES,
      DESTINO_SEM_FONE_COM_EMAIL,
      ["VOICE"],
      CTX_PADRAO,
    );

    // ── 6a: algumEnviado e canal VOICE marcado como sent:true ──────────────
    expect(resultado.algumEnviado).toBe(true);

    const canalVoice = resultado.resultados.find(r => r.canal === "VOICE");
    expect(canalVoice).toBeDefined();
    expect(canalVoice!.sent).toBe(true);
    expect((canalVoice as any).via).toBe("elevenlabs+gmail");

    // ── 6b: sendGmailMessage chamado com o anexo MP3 correto ───────────────
    expect(sendGmailMessage).toHaveBeenCalledOnce();

    const chamada = vi.mocked(sendGmailMessage).mock.calls[0][0];
    expect(chamada.to).toBe("maria@teste.com.br");

    const anexos: any[] = chamada.attachments ?? [];
    const mp3Anexo = anexos.find(
      (a: any) => a.filename === "mensagem-do-seu-medico.mp3",
    );
    expect(mp3Anexo).toBeDefined();
    expect(mp3Anexo.contentType).toBe("audio/mpeg");
    expect(Buffer.isBuffer(mp3Anexo.content)).toBe(true);
    expect((mp3Anexo.content as Buffer).equals(FAKE_MP3)).toBe(true);

    // ── 6c: WhatsApp não deve ter sido chamado (sem telefone) ──────────────
    expect(sendWhatsapp).not.toHaveBeenCalled();

    // ── 6d: registrarEnvioAvatar com canalEntrega:'EMAIL' e status:'ok' ────
    expect(registrarEnvioAvatar).toHaveBeenCalledOnce();
    expect(registrarEnvioAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        canal:        "VOICE",
        canalEntrega: "EMAIL",
        status:       "ok",
        empresaId:    5,
        avatarId:     7,
        clienteId:    42,
      }),
    );
  });
});
