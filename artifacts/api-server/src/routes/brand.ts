// Rotas PÚBLICAS da marca PAXTER (imagens + pré-visualização de e-mail).
// Precisam ficar acessíveis sem sessão porque são buscadas por provedores
// externos (Twilio MediaUrl, Telegram sendPhoto) e abertas pelo cliente de
// e-mail ao renderizar o cabeçalho. Registradas ANTES do portão de colaborador
// no barril de rotas.
import { Router, type IRouter } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderPaxterBannerPng, renderPaxterBannerGif, renderPaxterBannerMp4, renderPaxterStickerWebp } from "../lib/messaging/banner.js";
import { renderPaxterEmail } from "../lib/messaging/render-email.js";
import { absoluteBaseUrl } from "../lib/messaging/base-url.js";
import { docAmostraBoasVindas } from "../lib/messaging/sample-doc.js";
import { blocoTabelaSubstancias, type ItemTabelaSubstancia } from "../lib/messaging/substance-table.js";
import type { PaxterDoc } from "../lib/messaging/types.js";
import { enviarMensagemPaxter } from "../lib/messaging/index.js";
import { getGmailAddress } from "../lib/google-gmail.js";
import { getSecret } from "../lib/secure-settings.js";

const router: IRouter = Router();

// Resolve um asset de marca. Em produção/dev-workflow o servidor roda do bundle
// (dist), então `${__dirname}/assets` (o build copia ./assets -> dist/assets).
// Em execução avulsa (tsx), o __dirname é src/routes; cobrimos os dois com
// múltiplos candidatos. Lança se faltar em todos.
function lerAssetMarca(nome: string): Buffer {
  const candidatos = [
    path.join(__dirname, "assets", nome),
    path.resolve(__dirname, "../assets", nome),
    path.resolve(__dirname, "../../assets", nome),
    path.resolve(__dirname, "../../../assets", nome),
  ];
  let ultimoErro: unknown;
  for (const p of candidatos) {
    try {
      return readFileSync(p);
    } catch (err) {
      ultimoErro = err;
    }
  }
  throw ultimoErro;
}

router.get("/brand/paxter-banner.png", async (_req, res): Promise<void> => {
  try {
    const png = await renderPaxterBannerPng();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(png);
  } catch {
    // Falta de asset oficial não pode virar rejeição assíncrona silenciosa.
    res.status(500).type("text/plain").end("banner indisponível");
  }
});

// Banner ANIMADO (faísca) em GIF — cabeçalho do e-mail e Telegram (sendAnimation).
// Se o ffmpeg falhar, degrada para o PNG estático (o e-mail nunca chega com
// imagem quebrada no cabeçalho — só perde a animação).
router.get("/brand/paxter-banner.gif", async (_req, res): Promise<void> => {
  try {
    const gif = await renderPaxterBannerGif();
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(gif);
  } catch {
    try {
      const png = await renderPaxterBannerPng();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(png);
    } catch {
      res.status(500).type("text/plain").end("banner indisponível");
    }
  }
});

// Banner ANIMADO (faísca) em MP4 — WhatsApp via Twilio (que não aceita GIF).
router.get("/brand/paxter-banner.mp4", async (_req, res): Promise<void> => {
  try {
    const mp4 = await renderPaxterBannerMp4();
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(mp4);
  } catch {
    res.status(500).type("text/plain").end("banner animado indisponível");
  }
});

// FIGURINHA animada (WebP 512x512) — experimento opção B: único formato que
// toca sozinho no WhatsApp (enviado sem legenda, como sticker).
router.get("/brand/paxter-sticker.webp", async (_req, res): Promise<void> => {
  try {
    const webp = await renderPaxterStickerWebp();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(webp);
  } catch {
    res.status(500).type("text/plain").end("figurinha indisponível");
  }
});

// Símbolo e wordmark usados no CABEÇALHO do e-mail Paxter (render-email.ts).
// Sem estas rotas o e-mail chega com o cabeçalho quebrado.
router.get("/brand/paxter-symbol.png", (_req, res): void => {
  try {
    const png = lerAssetMarca("paxter-symbol.png");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(png);
  } catch {
    res.status(404).end();
  }
});

router.get("/brand/paxter-wordmark.png", (_req, res): void => {
  try {
    const png = lerAssetMarca("paxter-wordmark.png");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(png);
  } catch {
    res.status(404).end();
  }
});

// Pré-visualização do e-mail Paxter no navegador (mesmo HTML que é enviado).
// Link rápido para o CEO conferir o layout sem depender da caixa de entrada.
router.get("/brand/email-preview", (req, res): void => {
  const html = renderPaxterEmail(docAmostraBoasVindas(), absoluteBaseUrl(req));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// Envio de TESTE da amostra Paxter para validação (e-mail e/ou WhatsApp).
// Trava de segurança: rota SOMENTE-DESENVOLVIMENTO — em produção responde 404
// (não vira vetor de envio quando publicado). A ferramenta definitiva de
// modelos (autenticada, no painel) entra depois do aval do CEO.
//   - sem corpo: AUTOENVIO de e-mail para a própria conta Gmail conectada.
//   - { to }: e-mail para o endereço informado (validação do CEO).
//   - { whats }: WhatsApp para o telefone informado (formato E.164, ex.: +55119...).
router.post("/brand/email-test", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).end();
    return;
  }
  const body = (req.body ?? {}) as {
    to?: string;
    whats?: string;
    titulo?: string;
    eyebrow?: string;
    substancias?: Array<Partial<ItemTabelaSubstancia>>;
  };
  const to = String(body.to ?? "").trim();
  const whats = String(body.whats ?? "").trim();

  // Documento a enviar: por padrão a AMOSTRA fixa; se o corpo trouxer
  // `substancias`, monta um documento de validação com essas substâncias pelo
  // MESMO renderer único (cartões alinhados). Só-desenvolvimento, para o CEO
  // conferir um cenário específico sem precisar criar protocolo real.
  let doc = docAmostraBoasVindas();
  const subsIn = Array.isArray(body.substancias) ? body.substancias : null;
  if (subsIn && subsIn.length > 0) {
    const itens: ItemTabelaSubstancia[] = subsIn.map(s => ({
      nome: String(s.nome ?? "").trim() || "Substância",
      dose: s.dose != null ? String(s.dose) : undefined,
      sessao: s.sessao != null ? String(s.sessao) : undefined,
      sessaoLabel: s.sessaoLabel != null ? String(s.sessaoLabel) : undefined,
      frequencia: s.frequencia != null ? String(s.frequencia) : undefined,
      status: s.status === "applied" || s.status === "notApplied" ? s.status : undefined,
      cor: s.cor != null ? String(s.cor) : undefined,
    }));
    const tabela = blocoTabelaSubstancias(itens);
    const custom: PaxterDoc = {
      eyebrow: String(body.eyebrow ?? "Olá, Dr. Caio"),
      titulo: String(body.titulo ?? "Seu protocolo"),
      paragrafos: [
        "E-mail de amostra para validação do padrão visual PAXTER.",
        "Abaixo, as substâncias do protocolo em cartões com as informações alinhadas:",
      ],
      blocosHtml: [tabela],
      notaRodape: "Mensagem de AMOSTRA — apenas para validação do layout.",
      assunto: String(body.titulo ?? "PAXTER | Amostra de protocolo"),
    };
    doc = custom;
  }

  const canais: ("EMAIL" | "WHATSAPP")[] = [];
  let email: string | null = null;
  if (whats) {
    const dig = whats.replace(/\D/g, "");
    if (dig.length < 10 || dig.length > 15) {
      res.status(400).json({ error: "destino (whats) inválido — use E.164, ex.: +55119..." });
      return;
    }
    canais.push("WHATSAPP");
  }
  if (to) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      res.status(400).json({ error: "destino (to) inválido" });
      return;
    }
    email = to;
    canais.push("EMAIL");
  }
  // Sem nenhum destino informado -> autoenvio de e-mail para a conta conectada.
  if (canais.length === 0) {
    email = await getGmailAddress();
    if (!email) {
      res.status(503).json({ error: "Gmail não conectado" });
      return;
    }
    canais.push("EMAIL");
  }

  const envio = await enviarMensagemPaxter(
    doc,
    { email, telefone: whats || null, nome: "Dr. Caio" },
    canais,
    { baseUrl: absoluteBaseUrl(req) },
  );
  res.json({ resultados: envio.resultados });
});

// Diagnóstico SOMENTE-DESENVOLVIMENTO: pergunta ao Twilio o STATUS REAL das
// últimas mensagens WhatsApp para um destino. O `sent:true` do envio só prova
// que o Twilio ACEITOU; a entrega real (delivered/undelivered/failed) e o
// código de erro só aparecem aqui. Também revela se o remetente é o número de
// SANDBOX (+14155238886), que exige o destinatário ter "entrado" no sandbox.
function maskTail(s: string): string {
  const d = s.replace(/\D/g, "");
  return d.length <= 4 ? "****" : `…${d.slice(-4)}`;
}
router.get("/brand/whatsapp-status", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).end();
    return;
  }
  const raw = String((req.query.to as string) ?? "").trim();
  const dig = raw.replace(/\D/g, "");
  if (dig.length < 10 || dig.length > 15) {
    res.status(400).json({ error: "informe ?to= em E.164, ex.: 11946554000" });
    return;
  }
  const sid = (await getSecret("TWILIO_ACCOUNT_SID")) || process.env.TWILIO_ACCOUNT_SID || "";
  const token = (await getSecret("TWILIO_AUTH_TOKEN")) || process.env.TWILIO_AUTH_TOKEN || "";
  if (!sid || !token) {
    res.status(503).json({ error: "credenciais Twilio ausentes" });
    return;
  }
  const e164 = dig.length === 11 ? `+55${dig}` : `+${dig}`;
  const url =
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json` +
    `?To=${encodeURIComponent(`whatsapp:${e164}`)}&PageSize=5`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) {
    res.status(502).json({ error: "Twilio respondeu erro", twilioStatus: r.status });
    return;
  }
  const data = (await r.json()) as { messages?: Record<string, unknown>[] };
  const SANDBOX = "+14155238886";
  const msgs = (data.messages ?? []).map((m) => {
    const from = String(m.from ?? "").replace("whatsapp:", "");
    return {
      status: m.status,
      errorCode: m.error_code,
      errorMessage: m.error_message,
      dataEnvio: m.date_sent,
      deRemetente: maskTail(from),
      ehSandbox: from === SANDBOX,
    };
  });
  res.json({ destino: maskTail(e164), total: msgs.length, mensagens: msgs });
});

export default router;
