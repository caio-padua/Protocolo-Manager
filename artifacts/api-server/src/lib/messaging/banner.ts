// ============================================================================
// Banner-imagem de marca PAXTER para WhatsApp (MediaUrl) e Telegram (sendPhoto).
// Gerado em memória com @napi-rs/canvas e cacheado.
// REGRA (skill-layout-paxter, Padrão 14): o símbolo da marca NUNCA é desenhado
// chapado — usa-se a ARTE OFICIAL 3D (medalhão de vidro dourado em
// paxter-symbol.png) + o wordmark oficial (paxter-wordmark.png), a mesma
// identidade do cabeçalho do e-mail. Servido por GET /api/brand/paxter-banner.png.
// ============================================================================
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import path from "node:path";

let cached: Buffer | null = null;

// Resolve um asset de marca em dev (src) e em produção/dist (bundle).
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

export async function renderPaxterBannerPng(): Promise<Buffer> {
  if (cached) return cached;

  const W = 1200;
  const H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Fundo navy com profundidade (mesmo gradiente do cabeçalho do e-mail).
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, "#16315a");
  bg.addColorStop(0.6, "#102043");
  bg.addColorStop(1, "#0e1a34");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Brilho dourado discreto no topo (profundidade, igual ao e-mail).
  const glow = ctx.createRadialGradient(W * 0.5, -60, 40, W * 0.5, -60, 620);
  glow.addColorStop(0, "rgba(194,160,90,0.16)");
  glow.addColorStop(1, "rgba(194,160,90,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Moldura dourada dupla.
  ctx.strokeStyle = "rgba(201,162,79,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.strokeStyle = "rgba(201,162,79,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(44, 44, W - 88, H - 88);

  // -------- Símbolo OFICIAL 3D dentro do medalhão de vidro (Padrão 14) --------
  const symbol = await loadImage(lerAssetMarca("paxter-symbol.png"));
  const S = 196; // lado do medalhão
  const sx = (W - S) / 2;
  const sy = 64;
  const r = 26; // raio do vidro

  // Sombra projetada do medalhão (relevo).
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#0c1730";
  roundRectPath(ctx, sx, sy, S, S, r);
  ctx.fill();
  ctx.restore();

  // Clipe arredondado e desenho da arte (cover-fit) dentro do medalhão.
  ctx.save();
  roundRectPath(ctx, sx, sy, S, S, r);
  ctx.clip();
  const scale = Math.max(S / symbol.width, S / symbol.height);
  const dw = symbol.width * scale;
  const dh = symbol.height * scale;
  ctx.drawImage(symbol, sx + (S - dw) / 2, sy + (S - dh) / 2, dw, dh);
  // Verniz de vidro: leve luz diagonal no topo do medalhão.
  const verniz = ctx.createLinearGradient(sx, sy, sx, sy + S);
  verniz.addColorStop(0, "rgba(255,255,255,0.16)");
  verniz.addColorStop(0.35, "rgba(255,255,255,0.03)");
  verniz.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = verniz;
  ctx.fillRect(sx, sy, S, S);
  ctx.restore();

  // Borda dourada do medalhão (anel premium).
  ctx.save();
  roundRectPath(ctx, sx + 0.5, sy + 0.5, S - 1, S - 1, r);
  ctx.strokeStyle = "rgba(201,162,79,0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // -------- Wordmark OFICIAL (ouro 3D), centralizado abaixo do símbolo --------
  const wordmark = await loadImage(lerAssetMarca("paxter-wordmark.png"));
  const wmW = 560;
  const wmH = (wmW * wordmark.height) / wordmark.width;
  const wmX = (W - wmW) / 2;
  const wmY = sy + S + 44;
  ctx.drawImage(wordmark, wmX, wmY, wmW, wmH);

  // Filete dourado divisor.
  const lineW = 420;
  const lineY = wmY + wmH + 30;
  const filete = ctx.createLinearGradient(W / 2 - lineW / 2, 0, W / 2 + lineW / 2, 0);
  filete.addColorStop(0, "rgba(201,162,79,0)");
  filete.addColorStop(0.5, "rgba(201,162,79,0.7)");
  filete.addColorStop(1, "rgba(201,162,79,0)");
  ctx.fillStyle = filete;
  ctx.fillRect(W / 2 - lineW / 2, lineY, lineW, 2);

  // Subtítulo.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "8px";
  } catch {
    /* versão sem letterSpacing: segue sem espaçamento extra */
  }
  ctx.fillStyle = "#c9a24f";
  ctx.font = "30px Georgia, 'Times New Roman', serif";
  ctx.fillText("CLINICAL INTELLIGENCE SYSTEM", W / 2 + 4, lineY + 34);
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
  } catch {
    /* noop */
  }

  cached = canvas.toBuffer("image/png");
  return cached;
}

// Desenha o caminho de um retângulo arredondado (compatível com versões do
// canvas sem ctx.roundRect nativo).
function roundRectPath(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
