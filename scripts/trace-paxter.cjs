/* Opcao A (decisao CEO):
   - SIMBOLO: NAO tracar. Recortar os pixels originais do PNG-mestre (intacto) -> PNG.
   - PALAVRA PAXTER: tracar LETRA POR LETRA (paths SVG individuais), carbono da imagem.
   Gera o modulo _shared/paxterVectorPaths.ts diretamente. */
const path = require("path");
const fs = require("fs");
const potracePath = require.resolve("potrace");
const { Potrace } = require(potracePath);
const jimpPath = require.resolve("jimp", { paths: [path.dirname(potracePath)] });
const Jimp = require(jimpPath);

const SRC = "attached_assets/LOGO_PAXTER_0_(PRINCIPAL)_1782172364110.png";
const OUT = "/tmp/paxter-trace";
const ASSET_RAW = "artifacts/mockup-sandbox/src/assets/paxter-symbol-raw.png";
const TS_OUT = "artifacts/mockup-sandbox/src/components/mockups/_shared/paxterVectorPaths.ts";
const LETTER_IDS = ["p", "a", "x", "t", "e", "r"];
fs.mkdirSync(OUT, { recursive: true });

function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

async function main() {
  const img = await Jimp.read(SRC);
  const W = img.bitmap.width, H = img.bitmap.height;
  const b = img.bitmap.data;
  const TH = 78;
  const isGold = (x, y) => { const i = (y * W + x) * 4; return lum(b[i], b[i + 1], b[i + 2]) > TH; };

  // perfil de linhas -> bandas (simbolo em cima, palavra embaixo)
  const rows = new Array(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isGold(x, y)) rows[y]++;
  const maxRow = Math.max(...rows);
  const active = rows.map((c) => c > maxRow * 0.02);
  const bands = [];
  let start = -1;
  for (let y = 0; y < H; y++) {
    if (active[y] && start < 0) start = y;
    if ((!active[y] || y === H - 1) && start >= 0) {
      const end = active[y] ? y : y - 1;
      if (end - start > 8) bands.push([start, end]);
      start = -1;
    }
  }
  const bandBox = ([y0, y1]) => {
    let x0 = W, x1 = 0;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (isGold(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    return { y0, y1, x0, x1 };
  };
  const symBand = bandBox(bands[0]);
  const wordBand = bandBox(bands[1]);
  console.log("IMG", W, "x", H);
  console.log("SYMBOL band", symBand);
  console.log("WORD band", wordBand);

  // ---- SIMBOLO: recorte cru dos pixels originais (sem tracar) ----
  const sPad = 8;
  const sx0 = Math.max(0, symBand.x0 - sPad), sy0 = Math.max(0, symBand.y0 - sPad);
  const sx1 = Math.min(W - 1, symBand.x1 + sPad), sy1 = Math.min(H - 1, symBand.y1 + sPad);
  const sw = sx1 - sx0 + 1, sh = sy1 - sy0 + 1;
  await img.clone().crop(sx0, sy0, sw, sh).writeAsync(ASSET_RAW);
  console.log(`SYMBOL crop -> ${ASSET_RAW} (${sw}x${sh}) origem master (${sx0},${sy0})`);

  // ---- PALAVRA: segmentar em letras por colunas e tracar cada uma ----
  const wPad = 4;
  const wTop = Math.max(0, wordBand.y0 - wPad), wBot = Math.min(H - 1, wordBand.y1 + wPad);
  const wLeft = Math.max(0, wordBand.x0 - wPad); // origem X do conjunto da palavra
  const wRight = Math.min(W - 1, wordBand.x1 + wPad);
  const wH = wBot - wTop + 1;
  const wWfull = wRight - wLeft + 1;

  // perfil de colunas dentro da faixa da palavra
  const cols = new Array(W).fill(0);
  for (let x = 0; x < W; x++) for (let y = wordBand.y0; y <= wordBand.y1; y++) if (isGold(x, y)) cols[x]++;
  const colOn = cols.map((c) => c >= 2);
  const MIN_GAP = 3;   // colunas vazias minimas entre letras
  const MIN_RUN = 12;  // largura minima de uma letra
  let runs = [];
  let s = -1, gap = 0;
  for (let x = wordBand.x0; x <= wordBand.x1 + 1; x++) {
    if (colOn[x]) {
      if (s < 0) s = x;
      gap = 0;
    } else {
      if (s >= 0) {
        gap++;
        if (gap >= MIN_GAP || x > wordBand.x1) {
          const e = x - gap;
          if (e - s + 1 >= MIN_RUN) runs.push([s, e]);
          s = -1; gap = 0;
        }
      }
    }
  }
  // forcar 6 letras: dividir o bloco mais largo no vale (coluna minima) ate ter 6
  const TARGET = 6;
  let guard = 0;
  while (runs.length < TARGET && guard++ < 20) {
    let wi = 0;
    for (let i = 1; i < runs.length; i++) if ((runs[i][1] - runs[i][0]) > (runs[wi][1] - runs[wi][0])) wi = i;
    const [x0, x1] = runs[wi];
    let best = -1, bestVal = Infinity;
    for (let x = x0 + MIN_RUN; x <= x1 - MIN_RUN; x++) {
      if (cols[x] < bestVal) { bestVal = cols[x]; best = x; }
    }
    if (best < 0) break;
    runs.splice(wi, 1, [x0, best - 1], [best + 1, x1]);
  }
  console.log(`WORD letras detectadas: ${runs.length}`, runs.map(([a, c]) => `${a}-${c}`).join("  "));
  if (runs.length !== 6) console.warn(`AVISO: esperava 6 letras, achei ${runs.length}.`);

  async function traceLetter(x0, x1) {
    const lx0 = Math.max(0, x0 - wPad), lx1 = Math.min(W - 1, x1 + wPad);
    const cw = lx1 - lx0 + 1;
    const crop = img.clone().crop(lx0, wTop, cw, wH);
    const tracer = new Potrace({ threshold: 70, blackOnWhite: false, turdSize: 24, optTolerance: 0.35, alphaMax: 1.0 });
    await new Promise((res, rej) => tracer.loadImage(crop, (err) => err ? rej(err) : res()));
    const d = tracer.getPathTag().match(/ d="([^"]*)"/)?.[1] || "";
    return { d, ox: lx0 - wLeft, w: cw };
  }

  const letters = [];
  for (let i = 0; i < runs.length; i++) {
    const id = LETTER_IDS[i] || `l${i}`;
    const { d, ox, w } = await traceLetter(runs[i][0], runs[i][1]);
    letters.push({ id, d, ox, w });
    console.log(`  letra ${id}: ox ${ox} w ${w} dLen ${d.length}`);
  }

  // ---- emitir o modulo TS ----
  const ts = `// AUTO-GERADO por scripts/trace-paxter.cjs — NAO editar a mao.
// Opcao A (CEO): SIMBOLO = imagem original recortada (intacta, ver paxter-symbol-raw.png /
// processada sem fundo em paxter-symbol-original.png). PALAVRA PAXTER = paths SVG por letra
// (carbono da imagem de referencia), winding nonzero (vazados corretos).

// Simbolo: dimensao do recorte e origem no PNG-mestre.
export const SYMBOL_VB = { w: ${sw}, h: ${sh}, ox: ${sx0}, oy: ${sy0} };

// Palavra PAXTER: caixa do conjunto (origem ${wLeft},${wTop}) e cada letra como path.
export const WORD_VB = { w: ${wWfull}, h: ${wH}, ox: ${wLeft}, oy: ${wTop} };

export interface PaxterLetter { id: string; d: string; ox: number; w: number; }

export const WORD_LETTERS: PaxterLetter[] = [
${letters.map((l) => `  { id: "${l.id}", ox: ${l.ox}, w: ${l.w}, d: "${l.d}" },`).join("\n")}
];
`;
  fs.writeFileSync(TS_OUT, ts);
  console.log(`MODULO -> ${TS_OUT} (${letters.length} letras)`);
  console.log("DONE");
}
main().catch((e) => { console.error(e); process.exit(1); });
