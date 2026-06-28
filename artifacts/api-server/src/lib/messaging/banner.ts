// ============================================================================
// Banner-imagem de marca PAXTER para WhatsApp (MediaUrl) e Telegram (sendPhoto).
// Gerado em memória com @napi-rs/canvas (sem dependência nova) e cacheado.
// Mesma identidade do e-mail: navy + moldura ouro + wordmark serifado dourado.
// Servido pela rota GET /api/brand/paxter-banner.png.
// ============================================================================
import { createCanvas } from "@napi-rs/canvas";

let cached: Buffer | null = null;

export function renderPaxterBannerPng(): Buffer {
  if (cached) return cached;

  const W = 1200;
  const H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Fundo navy em gradiente (igual ao cabeçalho do e-mail).
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#102043");
  bg.addColorStop(0.55, "#0a162e");
  bg.addColorStop(1, "#070f1f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Moldura dourada dupla.
  ctx.strokeStyle = "rgba(201,162,79,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.strokeStyle = "rgba(201,162,79,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(44, 44, W - 88, H - 88);

  // Wordmark "PAXTER" em serifa dourada, centralizado.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const gold = ctx.createLinearGradient(0, H * 0.5 - 80, 0, H * 0.5 + 80);
  gold.addColorStop(0, "#f4dc97");
  gold.addColorStop(0.5, "#d4ad5c");
  gold.addColorStop(1, "#b88a3f");
  ctx.fillStyle = gold;
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "18px";
  } catch {
    /* versão sem letterSpacing: segue sem espaçamento extra */
  }
  ctx.font = "bold 150px Georgia, 'Times New Roman', serif";
  ctx.fillText("PAXTER", W / 2 + 9, H * 0.46);
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
  } catch {
    /* noop */
  }

  // Filete dourado divisor.
  const lineW = 360;
  const lineY = H * 0.62;
  const filete = ctx.createLinearGradient(W / 2 - lineW / 2, 0, W / 2 + lineW / 2, 0);
  filete.addColorStop(0, "rgba(201,162,79,0)");
  filete.addColorStop(0.5, "rgba(201,162,79,0.7)");
  filete.addColorStop(1, "rgba(201,162,79,0)");
  ctx.fillStyle = filete;
  ctx.fillRect(W / 2 - lineW / 2, lineY, lineW, 2);

  // Subtítulo.
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "8px";
  } catch {
    /* noop */
  }
  ctx.fillStyle = "#c9a24f";
  ctx.font = "30px Georgia, 'Times New Roman', serif";
  ctx.fillText("CLINICAL INTELLIGENCE SYSTEM", W / 2 + 4, H * 0.72);

  cached = canvas.toBuffer("image/png");
  return cached;
}
