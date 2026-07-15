// ============================================================================
// Banner-imagem de marca PAXTER para e-mail, WhatsApp e Telegram.
// Gerado em memória com @napi-rs/canvas e cacheado.
// REGRA (skill-layout-paxter, Padrão 14): o símbolo da marca NUNCA é desenhado
// chapado — usa-se a ARTE OFICIAL 3D (medalhão de vidro dourado em
// paxter-symbol.png) + o wordmark oficial (paxter-wordmark.png), a mesma
// identidade do cabeçalho do e-mail.
//
// EFEITO FAÍSCA (glint) — decisão do CEO em 15/07/2026: a faixa de luz que
// percorre símbolo e nome nas telas do app também sai nas mensagens. Como
// e-mail/WhatsApp/Telegram não rodam CSS, a luz é RENDERIZADA em quadros:
//   - GIF animado  (e-mail + Telegram sendAnimation)        -> renderPaxterBannerGif
//   - MP4 curto    (WhatsApp via Twilio, que não aceita GIF) -> renderPaxterBannerMp4
// A luz segue a regra do motor do app (memória paxter-glint-motor-unico):
// a máscara é SEMPRE a própria arte (a luz não vaza para o fundo).
//
// Rotas públicas: GET /api/brand/paxter-banner.png | .gif | .mp4
// ============================================================================
import { createCanvas, loadImage, type Canvas, type Image } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "../logger";

let cachedPng: Buffer | null = null;
let cachedGif: Buffer | null = null;
let cachedMp4: Buffer | null = null;
// Deduplicação de geração em voo: requisições simultâneas antes de o cache
// encher compartilham a MESMA promessa (um único ffmpeg por formato).
let emVooGif: Promise<Buffer> | null = null;
let emVooMp4: Promise<Buffer> | null = null;

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

type Ctx = ReturnType<Canvas["getContext"]>;

// Desenha o caminho de um retângulo arredondado (compatível com versões do
// canvas sem ctx.roundRect nativo).
function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface Layout {
  W: number;
  H: number;
  k: number; // fator de escala relativo ao desenho-base 1200x630
  sx: number;
  sy: number;
  S: number;
  r: number;
  wmX: number;
  wmY: number;
  wmW: number;
  wmH: number;
}

let _symbol: Image | null = null;
let _wordmark: Image | null = null;
async function carregarArtes(): Promise<{ symbol: Image; wordmark: Image }> {
  if (!_symbol) _symbol = await loadImage(lerAssetMarca("paxter-symbol.png"));
  if (!_wordmark) _wordmark = await loadImage(lerAssetMarca("paxter-wordmark.png"));
  return { symbol: _symbol, wordmark: _wordmark };
}

/**
 * Desenha UM quadro do banner. `sweepT` é o progresso da faixa de luz
 * (0..1 = varrendo da esquerda para a direita; null = quadro parado, sem luz).
 */
async function desenharQuadro(canvas: Canvas, sweepT: number | null): Promise<Layout> {
  const W = canvas.width;
  const H = canvas.height;
  const k = W / 1200;
  const ctx = canvas.getContext("2d");
  const { symbol, wordmark } = await carregarArtes();

  // Fundo navy com profundidade (mesmo gradiente do cabeçalho do e-mail).
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, "#16315a");
  bg.addColorStop(0.6, "#102043");
  bg.addColorStop(1, "#0e1a34");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Brilho dourado discreto no topo (profundidade, igual ao e-mail).
  const glow = ctx.createRadialGradient(W * 0.5, -60 * k, 40 * k, W * 0.5, -60 * k, 620 * k);
  glow.addColorStop(0, "rgba(194,160,90,0.16)");
  glow.addColorStop(1, "rgba(194,160,90,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Moldura dourada dupla.
  ctx.strokeStyle = "rgba(201,162,79,0.55)";
  ctx.lineWidth = 3 * k;
  ctx.strokeRect(30 * k, 30 * k, W - 60 * k, H - 60 * k);
  ctx.strokeStyle = "rgba(201,162,79,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(44 * k, 44 * k, W - 88 * k, H - 88 * k);

  // -------- Símbolo OFICIAL 3D dentro do medalhão de vidro (Padrão 14) --------
  const S = 196 * k;
  const sx = (W - S) / 2;
  const sy = 64 * k;
  const r = 26 * k;

  // Sombra projetada do medalhão (relevo).
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 28 * k;
  ctx.shadowOffsetY = 12 * k;
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
  ctx.lineWidth = 2 * k;
  ctx.stroke();
  ctx.restore();

  // -------- Wordmark OFICIAL (ouro 3D), centralizado abaixo do símbolo --------
  const wmW = 560 * k;
  const wmH = (wmW * wordmark.height) / wordmark.width;
  const wmX = (W - wmW) / 2;
  const wmY = sy + S + 44 * k;
  ctx.drawImage(wordmark, wmX, wmY, wmW, wmH);

  // Filete dourado divisor.
  const lineW = 420 * k;
  const lineY = wmY + wmH + 30 * k;
  const filete = ctx.createLinearGradient(W / 2 - lineW / 2, 0, W / 2 + lineW / 2, 0);
  filete.addColorStop(0, "rgba(201,162,79,0)");
  filete.addColorStop(0.5, "rgba(201,162,79,0.7)");
  filete.addColorStop(1, "rgba(201,162,79,0)");
  ctx.fillStyle = filete;
  ctx.fillRect(W / 2 - lineW / 2, lineY, lineW, Math.max(2 * k, 1.5));

  // Subtítulo.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${8 * k}px`;
  } catch {
    /* versão sem letterSpacing: segue sem espaçamento extra */
  }
  ctx.fillStyle = "#c9a24f";
  ctx.font = `${Math.round(30 * k)}px Georgia, 'Times New Roman', serif`;
  ctx.fillText("CLINICAL INTELLIGENCE SYSTEM", W / 2 + 4 * k, lineY + 34 * k);
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "0px";
  } catch {
    /* noop */
  }

  const layout: Layout = { W, H, k, sx, sy, S, r, wmX, wmY, wmW, wmH };

  // -------- FAÍSCA (glint): faixa de luz diagonal mascarada pela arte --------
  if (sweepT !== null) {
    desenharLuz(ctx, layout, sweepT, wordmark);
  }

  return layout;
}

/**
 * Faixa-sol diagonal que percorre o medalhão e o nome, na cadência do motor do
 * app. Regra da memória paxter-glint-motor-unico: a máscara é SEMPRE a própria
 * arte — no medalhão a luz é recortada pelo vidro; no nome, pelo alfa do
 * wordmark (a luz não vaza para o fundo navy).
 */
function desenharLuz(ctx: Ctx, L: Layout, t: number, wordmark: Image): void {
  const { W, H, k, sx, sy, S, r, wmX, wmY, wmW, wmH } = L;
  const bandW = 150 * k; // largura da faixa de luz
  const ang = -0.42; // inclinação (radianos) — mesma diagonal do app
  // A faixa entra antes da borda esquerda e sai depois da direita.
  const x0 = -bandW * 2 + t * (W + bandW * 4);

  // 1) Luz sobre o MEDALHÃO, recortada pelo vidro arredondado.
  ctx.save();
  roundRectPath(ctx, sx, sy, S, S, r);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x0, 0);
  ctx.rotate(ang);
  const g1 = ctx.createLinearGradient(0, 0, bandW, 0);
  g1.addColorStop(0, "rgba(255,240,200,0)");
  g1.addColorStop(0.42, "rgba(255,244,214,0.44)");
  g1.addColorStop(0.5, "rgba(255,252,240,0.78)");
  g1.addColorStop(0.58, "rgba(255,244,214,0.44)");
  g1.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, -H, bandW, H * 3);
  ctx.restore();

  // 2) Luz sobre o NOME, mascarada pelo alfa do wordmark (offscreen).
  const offW = Math.ceil(wmW);
  const offH = Math.ceil(wmH);
  const off = createCanvas(offW, offH);
  const octx = off.getContext("2d");
  octx.save();
  octx.translate(-wmX, -wmY); // espaço do banner -> espaço do wordmark
  octx.translate(x0, 0);
  octx.rotate(ang);
  const g2 = octx.createLinearGradient(0, 0, bandW, 0);
  g2.addColorStop(0, "rgba(255,240,200,0)");
  g2.addColorStop(0.42, "rgba(255,244,214,0.6)");
  g2.addColorStop(0.5, "rgba(255,252,240,1)");
  g2.addColorStop(0.58, "rgba(255,244,214,0.6)");
  g2.addColorStop(1, "rgba(255,240,200,0)");
  octx.fillStyle = g2;
  octx.fillRect(0, -H, bandW, H * 3);
  octx.restore();
  // Recorta pela arte (destination-in = fica só onde o wordmark tem pixel).
  octx.globalCompositeOperation = "destination-in";
  octx.drawImage(wordmark, 0, 0, offW, offH);
  // Compõe aditivamente sobre o banner.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.9;
  ctx.drawImage(off, wmX, wmY);
  ctx.restore();
}

/** Banner ESTÁTICO (PNG) — mantido para fallback e compatibilidade. */
export async function renderPaxterBannerPng(): Promise<Buffer> {
  if (cachedPng) return cachedPng;
  const canvas = createCanvas(1200, 630);
  await desenharQuadro(canvas, null);
  cachedPng = canvas.toBuffer("image/png");
  return cachedPng;
}

// Cadência dos quadros animados (fases do motor do app, condensadas):
// varredura ~1,6 s + pausa ~2,8 s = ciclo ~4,4 s em loop infinito.
const FRAMES_SWEEP = 20;
const DELAY_SWEEP_MS = 80;
const DELAY_PAUSA_MS = 2800;
const ANIM_W = 900; // 900x472 — nítido no computador e leve no celular
const ANIM_H = 472;

async function gerarQuadros(): Promise<Canvas[]> {
  const quadros: Canvas[] = [];
  for (let i = 0; i < FRAMES_SWEEP; i++) {
    const canvas = createCanvas(ANIM_W, ANIM_H);
    await desenharQuadro(canvas, i / (FRAMES_SWEEP - 1));
    quadros.push(canvas);
  }
  return quadros;
}

// Sequência completa de quadros (varredura + pausa com o último repetido),
// compartilhada pelo GIF e pelo MP4 — os dois respiram na mesma cadência.
async function gerarSequenciaPng(): Promise<Buffer[]> {
  const quadros = await gerarQuadros();
  const fps = 1000 / DELAY_SWEEP_MS; // 12,5 quadros por segundo
  const pausaQuadros = Math.round((DELAY_PAUSA_MS / 1000) * fps);
  const pngs: Buffer[] = quadros.map((q) => q.toBuffer("image/png"));
  return [...pngs, ...Array<Buffer>(pausaQuadros).fill(pngs[pngs.length - 1])];
}

// Roda o ffmpeg do sistema alimentando PNGs pelo stdin e devolve o arquivo.
async function rodarFfmpeg(argsSaida: string[], sufixo: string, pngs: Buffer[]): Promise<Buffer> {
  const fps = 1000 / DELAY_SWEEP_MS;
  // Nome ÚNICO por execução: duas gerações simultâneas nunca disputam o mesmo arquivo.
  const tmp = path.join(tmpdir(), `paxter-banner-${process.pid}-${randomUUID()}${sufixo}`);
  const args = ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "pipe:0", ...argsSaida, tmp];
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderrTail = "";
  ff.stderr.on("data", (d: Buffer) => {
    stderrTail = (stderrTail + d.toString()).slice(-400);
  });
  // EPIPE no stdin (ffmpeg fecha a entrada cedo) NÃO pode derrubar o processo:
  // engolimos aqui e o resultado real vem do código de saída do ffmpeg.
  ff.stdin.on("error", () => undefined);
  const fim = new Promise<void>((resolve, reject) => {
    ff.on("error", (e) => reject(e));
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}: ${stderrTail}`)),
    );
  });
  // Marca a rejeição como tratada (evita "unhandled rejection" enquanto o
  // laço abaixo aguarda o drain); o `await fim` adiante ainda propaga o erro.
  fim.catch(() => undefined);
  for (const png of pngs) {
    if (!ff.stdin.writable) break;
    const ok = ff.stdin.write(png);
    // Se o ffmpeg morrer no meio, `fim` rejeita e sai do laço (o drain nunca viria).
    if (!ok) await Promise.race([new Promise((r) => ff.stdin.once("drain", r)), fim]);
  }
  ff.stdin.end();
  try {
    await fim;
    return await readFile(tmp);
  } finally {
    // Limpa o temporário TAMBÉM em falha (ffmpeg pode deixar arquivo parcial).
    await unlink(tmp).catch(() => undefined);
  }
}

/**
 * Banner ANIMADO (GIF em loop infinito) — cabeçalho do e-mail e Telegram.
 * Codificado pelo ffmpeg com paleta otimizada + dithering fino (sierra2_4a):
 * o gradiente navy sai liso, sem o serrilhado da quantização simples.
 */
export async function renderPaxterBannerGif(): Promise<Buffer> {
  if (cachedGif) return cachedGif;
  if (!emVooGif) {
    emVooGif = (async () => {
      const pngs = await gerarSequenciaPng();
      const buf = await rodarFfmpeg(
        [
          "-filter_complex",
          "[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=sierra2_4a",
          "-loop", "0",
          "-f", "gif",
        ],
        ".gif",
        pngs,
      );
      cachedGif = buf;
      return buf;
    })().finally(() => {
      emVooGif = null; // em falha, a próxima chamada tenta de novo
    });
  }
  return emVooGif;
}

/**
 * Banner ANIMADO (MP4 curto, ~4,4 s) — WhatsApp via Twilio (que não aceita GIF).
 * Se o ffmpeg falhar, o chamador degrada para o PNG estático.
 */
export async function renderPaxterBannerMp4(): Promise<Buffer> {
  if (cachedMp4) return cachedMp4;
  if (!emVooMp4) {
    emVooMp4 = (async () => {
      const pngs = await gerarSequenciaPng();
      const buf = await rodarFfmpeg(
        ["-vf", "format=yuv420p", "-movflags", "+faststart"],
        ".mp4",
        pngs,
      );
      cachedMp4 = buf;
      return buf;
    })().finally(() => {
      emVooMp4 = null;
    });
  }
  return emVooMp4;
}

/**
 * FIGURINHA ANIMADA (WebP 512x512) — experimento opção B do CEO (15/07/2026):
 * figurinha é o ÚNICO formato que toca sozinho no WhatsApp. Exigências do
 * WhatsApp: quadrado 512x512, WebP, < 500 KB, sem legenda. O cartão navy do
 * banner é desenhado centralizado sobre fundo TRANSPARENTE (letterbox), com
 * cantos arredondados — visual de figurinha de verdade.
 */
let cachedStickerWebp: Buffer | null = null;
let emVooSticker: Promise<Buffer> | null = null;

export async function renderPaxterStickerWebp(): Promise<Buffer> {
  if (cachedStickerWebp) return cachedStickerWebp;
  if (!emVooSticker) {
    emVooSticker = (async () => {
      const quadros = await gerarQuadros();
      const LADO = 512;
      const cardW = LADO;
      const cardH = LADO; // preenche o quadrado inteiro → figurinha maior na tela
      const y = 0;
      const raio = 28;
      const pngs: Buffer[] = quadros.map((q) => {
        const c = createCanvas(LADO, LADO);
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, LADO, LADO); // fundo transparente
        roundRectPath(ctx, 0, y, cardW, cardH, raio);
        ctx.save();
        ctx.clip();
        ctx.drawImage(q, 0, y, cardW, cardH);
        ctx.restore();
        return c.toBuffer("image/png");
      });
      // Só a varredura (sem a pausa longa): figurinha precisa ficar < 500 KB.
      const buf = await rodarFfmpeg(
        ["-vcodec", "libwebp", "-lossless", "0", "-q:v", "62", "-loop", "0", "-an", "-f", "webp"],
        ".webp",
        pngs,
      );
      cachedStickerWebp = buf;
      return buf;
    })().finally(() => {
      emVooSticker = null;
    });
  }
  return emVooSticker;
}

/** Pré-aquece os caches animados no boot (não bloqueia; loga falha). */
export function aquecerBannersAnimados(): void {
  renderPaxterBannerGif().catch((e) =>
    logger.warn({ err: (e as Error).message }, "[banner] falha ao pré-gerar GIF animado"),
  );
  renderPaxterBannerMp4().catch((e) =>
    logger.warn({ err: (e as Error).message }, "[banner] falha ao pré-gerar MP4 animado"),
  );
}
