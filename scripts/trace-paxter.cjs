/* Vetorização da logo PAXTER: detecta faixas de ouro, recorta símbolo e palavra,
   e traça cada um com potrace (carbono da imagem -> SVG paths). */
const path = require("path");
const fs = require("fs");
const potracePath = require.resolve("potrace");
const { Potrace } = require(potracePath);
const jimpPath = require.resolve("jimp", { paths: [path.dirname(potracePath)] });
const Jimp = require(jimpPath);

const SRC = "attached_assets/LOGO_PAXTER_0_(PRINCIPAL)_1782172364110.png";
const OUT = "/tmp/paxter-trace";
fs.mkdirSync(OUT, { recursive: true });

function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

async function main() {
  const img = await Jimp.read(SRC);
  const W = img.bitmap.width, H = img.bitmap.height;
  const TH = 78; // luminance threshold for "gold"
  // row profile
  const rows = new Array(H).fill(0);
  const colsAll = new Array(W).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const b = img.bitmap.data;
      if (lum(b[idx], b[idx + 1], b[idx + 2]) > TH) { rows[y]++; }
    }
  }
  const maxRow = Math.max(...rows);
  const active = rows.map((c) => c > maxRow * 0.02);
  // group bands
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
  // for each band compute x bounds
  const result = bands.map(([y0, y1]) => {
    let x0 = W, x1 = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const b = img.bitmap.data;
        if (lum(b[idx], b[idx + 1], b[idx + 2]) > TH) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      }
    }
    return { y0, y1, x0, x1, h: y1 - y0, w: x1 - x0 };
  });
  console.log("IMG", W, "x", H);
  console.log("BANDS:");
  result.forEach((r, i) => console.log(`  [${i}] y ${r.y0}-${r.y1} (h${r.h})  x ${r.x0}-${r.x1} (w${r.w})`));

  async function traceCrop(name, region, threshold, turd) {
    const pad = 6;
    const x0 = Math.max(0, region.x0 - pad), y0 = Math.max(0, region.y0 - pad);
    const x1 = Math.min(W - 1, region.x1 + pad), y1 = Math.min(H - 1, region.y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const crop = img.clone().crop(x0, y0, cw, ch);
    const tracer = new Potrace({
      threshold: threshold,
      blackOnWhite: false, // gold (bright) is foreground on dark bg
      turdSize: turd,
      optTolerance: 0.4,
      alphaMax: 1.0,
    });
    await new Promise((res, rej) => {
      tracer.loadImage(crop, (err) => err ? rej(err) : res());
    });
    const d = tracer.getPathTag().match(/ d="([^"]*)"/)?.[1] || "";
    const svg = tracer.getSVG();
    fs.writeFileSync(path.join(OUT, name + ".svg"), svg);
    fs.writeFileSync(path.join(OUT, name + ".d.txt"), d);
    console.log(`TRACED ${name}: viewBox ${cw}x${ch}, d length ${d.length}`);
    return { name, cw, ch, dLen: d.length };
  }

  // band[0] = symbol, band[1] = PAXTER word (verify from print)
  if (result[0]) await traceCrop("symbol", result[0], 60, 60);
  if (result[1]) await traceCrop("wordmark", result[1], 70, 30);
  console.log("DONE -> ", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
