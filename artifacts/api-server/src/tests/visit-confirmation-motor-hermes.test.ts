/**
 * K8 passa pelo motor Hermes (Código Paxter, Art. 66).
 *
 * Provas: (1) as mensagens da K8 são conteúdo puro e saem vestidas com a marca do motor, sem casco
 * montado à mão; (2) a chave nunca vai no assunto; (3) os canais reais só chamam o motor e traduzem
 * o resultado sem inventar sucesso; (4) o endereço do link vem do ajudante único.
 * Dados sintéticos apenas (Art. 82). Nenhum envio real.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ enviarMensagemPaxter: vi.fn() }));
vi.mock("../lib/messaging/engine", () => engine);
vi.mock("@workspace/db", () => ({ db: {} }));

import { clientConfirmEmail, keyMessage, KEY_SUBJECT, managerEmail } from "../lib/visit-confirmation-messages";
import { assuntoPadrao, renderPaxterEmail } from "../lib/messaging/render-email";
import { renderTelegramCaption, renderWhatsappCaption } from "../lib/messaging/render-text";
import { realChannels, WHATSAPP_LOG_OMITIDO } from "../lib/visit-confirmation-channels";
import { linkBaseUrl } from "../lib/visit-confirmation";

const BASE = "https://clinica.teste";
const KEY = "482913";
const WHEN = "09/11/2026 às 14:30";
const here = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  vi.unstubAllEnvs();
  engine.enviarMensagemPaxter.mockReset();
});

describe("K8 no motor Hermes: conteúdo", () => {
  it("a chave é a manchete, fica fora do assunto e aparece uma única vez no conteúdo", () => {
    const doc = keyMessage({ clientName: "Maria Souza", key: KEY, minutes: 10, when: WHEN });
    expect(doc.titulo).toBe(KEY);
    expect(doc.assunto).toBe(KEY_SUBJECT);
    expect(assuntoPadrao(doc)).not.toContain(KEY);
    expect(doc.paragrafos.join(" ")).not.toContain(KEY);
    expect(doc.notaRodape ?? "").not.toContain(KEY);
    expect(doc.paragrafos[0]).toBe("Olá, Maria.");
  });

  it("o e-mail da chave sai com a marca do motor (banner e rodapé), não com casco próprio", () => {
    const html = renderPaxterEmail(keyMessage({ clientName: "Maria", key: KEY, minutes: 10, when: WHEN }), BASE);
    expect(html).toContain(`${BASE}/api/brand/paxter-banner.gif`);
    expect(html).toContain("Clinical Intelligence System");
    expect(html).toContain(KEY);
    expect(html).not.toContain("#0b1f3a"); // cor do casco montado à mão que foi aposentado
  });

  it("WhatsApp e Telegram recebem a mesma chave em legenda formatada pelo motor", () => {
    const doc = keyMessage({ clientName: "Maria", key: KEY, minutes: 10, when: WHEN });
    expect(renderWhatsappCaption(doc)).toContain(`*${KEY}*`);
    expect(renderTelegramCaption(doc)).toContain(`<b>${KEY}</b>`);
  });

  it("e-mail de um clique: botão do motor com o link, lembretes numerados e assunto próprio", () => {
    const link = `${BASE}/api/confirmacao-visita/12.abcDEF`;
    const primeiro = clientConfirmEmail({ clientName: "Maria", link, when: WHEN, n: 1, total: 3 });
    expect(primeiro.botao).toEqual({ label: "Abrir e confirmar", url: link });
    expect(primeiro.assunto).toBe("Confirme a sua aplicação");
    const html = renderPaxterEmail(primeiro, BASE);
    expect(html).toContain(`href="${link}"`);
    expect(html).toContain("Só abrir não confirma nada");
    const terceiro = clientConfirmEmail({ clientName: "Maria", link, when: WHEN, n: 3, total: 3 });
    expect(terceiro.assunto).toBe("Lembrete 3 de 3: confirme a sua aplicação");
    expect(terceiro.eyebrow).toBe("Lembrete 3 de 3");
  });

  it("aviso à gestão é texto puro (sem HTML à mão) e o nome do cliente sai escapado no e-mail", () => {
    const doc = managerEmail({
      kind: "inicio", clientName: "<b>Maria</b> & Cia", when: WHEN, nurseName: "Ana",
      origin: "enfermeira", clientHasEmail: false, emailsSent: 0, emailsFailed: 0,
    });
    for (const p of [doc.titulo, ...doc.paragrafos]) expect(p).not.toMatch(/<(?!b>|\/b>)[a-z]/i);
    expect(doc.paragrafos.some((p) => p.includes("não tem e-mail cadastrado"))).toBe(true);
    const html = renderPaxterEmail(doc, BASE);
    expect(html).toContain("&lt;b&gt;Maria&lt;/b&gt; &amp; Cia");
    expect(html).not.toContain("<b>Maria</b>");
  });

  it("guarda do Art. 66: o arquivo de mensagens não monta casco de e-mail à mão", () => {
    const source = readFileSync(join(here, "../lib/visit-confirmation-messages.ts"), "utf8");
    const antesDaPaginaPublica = source.slice(0, source.indexOf("export function publicPage"));
    for (const proibido of ["<table", "<td", "<!doctype", "style=", "#c9a24b"]) {
      expect(antesDaPaginaPublica.toLowerCase()).not.toContain(proibido);
    }
  });
});

describe("K8 no motor Hermes: canais reais", () => {
  const doc = keyMessage({ clientName: "Maria", key: KEY, minutes: 10, when: WHEN });

  it("e-mail: chama o motor no canal EMAIL e devolve o resultado dele", async () => {
    engine.enviarMensagemPaxter.mockResolvedValue({ resultados: [{ canal: "EMAIL", sent: true, via: "gmail" }], algumEnviado: true });
    const r = await realChannels.sendEmail("maria@cliente.test", doc);
    expect(r.success).toBe(true);
    const [docEnviado, destino, canais] = engine.enviarMensagemPaxter.mock.calls[0];
    expect(docEnviado).toBe(doc);
    expect(destino).toEqual({ email: "maria@cliente.test" });
    expect(canais).toEqual(["EMAIL"]);
  });

  it("e-mail recusado pelo provedor vira falha com o motivo, nunca sucesso", async () => {
    engine.enviarMensagemPaxter.mockResolvedValue({ resultados: [{ canal: "EMAIL", sent: false, via: "gmail", error: "recusado" }], algumEnviado: false });
    expect(await realChannels.sendEmail("maria@cliente.test", doc)).toEqual({ success: false, error: "recusado" });
  });

  it("WhatsApp: corpo da mensagem omitido do log e relato fiel de 'twilio' ou 'link'", async () => {
    engine.enviarMensagemPaxter.mockResolvedValueOnce({ resultados: [{ canal: "WHATSAPP", sent: true, via: "twilio" }], algumEnviado: true });
    expect(await realChannels.sendWhatsapp("11999990000", doc)).toMatchObject({ sent: true, via: "twilio" });
    const ctx = engine.enviarMensagemPaxter.mock.calls[0][3];
    expect(ctx.corpoParaLog).toBe(WHATSAPP_LOG_OMITIDO);
    expect(ctx.corpoParaLog).not.toContain(KEY);
    engine.enviarMensagemPaxter.mockResolvedValueOnce({ resultados: [{ canal: "WHATSAPP", sent: false, via: "link" }], algumEnviado: false });
    expect(await realChannels.sendWhatsapp("11999990000", doc)).toMatchObject({ sent: false, via: "link" });
  });

  it("Telegram: distingue envio real de simulado e de falha", async () => {
    engine.enviarMensagemPaxter.mockResolvedValueOnce({ resultados: [{ canal: "TELEGRAM", sent: true, via: "telegram", mock: true }], algumEnviado: true });
    expect(await realChannels.sendTelegram("123", doc)).toMatchObject({ sent: true, mock: true });
    engine.enviarMensagemPaxter.mockResolvedValueOnce({ resultados: [{ canal: "TELEGRAM", sent: true, via: "telegram", mock: false }], algumEnviado: true });
    expect(await realChannels.sendTelegram("123", doc)).toMatchObject({ sent: true, mock: false });
    engine.enviarMensagemPaxter.mockResolvedValueOnce({ resultados: [{ canal: "TELEGRAM", sent: false, via: "telegram", error: "x" }], algumEnviado: false });
    expect(await realChannels.sendTelegram("123", doc)).toMatchObject({ sent: false, error: "x" });
  });

  it("motor sem resultado conta como falha, nunca como envio", async () => {
    engine.enviarMensagemPaxter.mockResolvedValue({ resultados: [], algumEnviado: false });
    expect((await realChannels.sendEmail("maria@cliente.test", doc)).success).toBe(false);
    expect((await realChannels.sendWhatsapp("11999990000", doc)).sent).toBe(false);
    expect((await realChannels.sendTelegram("123", doc)).sent).toBe(false);
  });
});

describe("K8 no motor Hermes: endereço do link", () => {
  const limpar = () => {
    for (const nome of ["PUBLIC_BASE_URL", "REPLIT_DOMAINS", "REPLIT_DEV_DOMAIN", "RAILWAY_PUBLIC_DOMAIN"]) vi.stubEnv(nome, "");
  };

  it("usa o domínio da marca quando configurado (ajudante único)", () => {
    limpar();
    vi.stubEnv("PUBLIC_BASE_URL", "https://clinica.exemplo.com.br");
    expect(linkBaseUrl()).toBe("https://clinica.exemplo.com.br");
  });

  it("usa o domínio de hospedagem quando não há domínio da marca", () => {
    limpar();
    vi.stubEnv("REPLIT_DOMAINS", "app.exemplo.repl.co,outro.repl.co");
    expect(linkBaseUrl()).toBe("https://app.exemplo.repl.co");
  });

  it("produção no Railway só com RAILWAY_PUBLIC_DOMAIN (com ou sem protocolo) continua montando o link", () => {
    limpar();
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "manager-producao.up.railway.app");
    expect(linkBaseUrl()).toBe("https://manager-producao.up.railway.app");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "https://manager-producao.up.railway.app/");
    expect(linkBaseUrl()).toBe("https://manager-producao.up.railway.app");
  });

  it("sem nenhum endereço público recusa o link (nunca monta endereço de máquina local)", () => {
    limpar();
    expect(linkBaseUrl()).toBeNull();
  });

  it.each([
    "127.0.0.1:3000", "10.0.0.5", "192.168.1.20:8080", "172.20.0.9", "169.254.1.1", "0.0.0.0", "[::1]:3000", "maquina.local",
    "localhost.", "localhost.:3000", "api.localhost", "2130706433", "0x7f.0.0.1", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[fe80::1]",
  ])(
    "recusa endereço local ou de rede privada (%s)",
    (host) => {
      limpar();
      vi.stubEnv("REPLIT_DEV_DOMAIN", host);
      expect(linkBaseUrl()).toBeNull();
    },
  );

  it("não confunde endereço público parecido com faixa privada", () => {
    limpar();
    vi.stubEnv("REPLIT_DEV_DOMAIN", "172.32.0.1");
    expect(linkBaseUrl()).toBe("https://172.32.0.1");
  });
});
