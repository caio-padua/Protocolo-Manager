// Rotas PÚBLICAS da marca PAXTER (imagens + pré-visualização de e-mail).
// Precisam ficar acessíveis sem sessão porque são buscadas por provedores
// externos (Twilio MediaUrl, Telegram sendPhoto) e abertas pelo cliente de
// e-mail ao renderizar o cabeçalho. Registradas ANTES do portão de colaborador
// no barril de rotas.
import { Router, type IRouter } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderPaxterBannerPng } from "../lib/messaging/banner.js";
import { renderPaxterEmail } from "../lib/messaging/render-email.js";
import { absoluteBaseUrl } from "../lib/messaging/base-url.js";
import { docAmostraBoasVindas } from "../lib/messaging/sample-doc.js";
import { enviarMensagemPaxter } from "../lib/messaging/index.js";
import { getGmailAddress } from "../lib/google-gmail.js";

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

router.get("/brand/paxter-banner.png", (_req, res): void => {
  const png = renderPaxterBannerPng();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.end(png);
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
  const body = (req.body ?? {}) as { to?: string; whats?: string };
  const to = String(body.to ?? "").trim();
  const whats = String(body.whats ?? "").trim();

  const canais: ("EMAIL" | "WHATSAPP")[] = [];
  let email: string | null = null;
  if (whats) canais.push("WHATSAPP");
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
    docAmostraBoasVindas(),
    { email, telefone: whats || null, nome: "Dr. Caio" },
    canais,
    { baseUrl: absoluteBaseUrl(req) },
  );
  res.json({ resultados: envio.resultados });
});

export default router;
