/**
 * Task #255 — Test script: gera um PDF com o Radar de Foco e converte para PNG.
 * Replica a lógica de drawRadarChart de pdf-signer.ts para validação visual.
 *
 * Uso: node scripts/test-radar-polygon.mjs
 * Saída: /tmp/radar-test.pdf  +  /tmp/radar-test-1.png
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { writeFileSync } from "fs";
import { execSync } from "child_process";

// ── Replica a função drawRadarChart de pdf-signer.ts ─────────────────────────
function drawRadarChart(page, fonts, cx, cy, radius, dims, labelSize = 7) {
  const n = dims.length;
  if (n < 3) return;
  const TWO_PI = Math.PI * 2;

  const pageH = page.getHeight();
  const svgY = (v) => pageH - v;

  function ang(i) { return Math.PI / 2 - (i / n) * TWO_PI; }
  function ptR(i, r) {
    const a = ang(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  const RING_C   = rgb(0.70, 0.77, 0.77);
  const AXIS_C   = rgb(0.68, 0.76, 0.76);
  const FILL_C   = rgb(0.86, 0.92, 0.87);   // mint-cream pastel
  const STROKE_C = rgb(0.72, 0.58, 0.12);   // gold
  const LBL_C    = rgb(0.08, 0.18, 0.20);   // dark navy

  // 1. Concentric scale rings
  const RING_NAMES = ["Apoio", "Foco", "Foco principal"];
  for (let ring = 1; ring <= 3; ring++) {
    const r = (ring / 3) * radius;
    const segs = [];
    for (let i = 0; i <= n; i++) {
      const p = ptR(i % n, r);
      segs.push(`${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${svgY(p.y).toFixed(1)}`);
    }
    segs.push("Z");
    try {
      page.drawSvgPath(segs.join(" "), {
        x: 0, y: pageH,
        borderColor: RING_C,
        borderWidth: ring === 3 ? 0.8 : 0.35,
        borderOpacity: 0.7,
        opacity: 0,
      });
    } catch {
      for (let i = 0; i < n; i++) {
        const p1 = ptR(i, r); const p2 = ptR((i + 1) % n, r);
        page.drawLine({ start: p1, end: p2, thickness: ring === 3 ? 0.8 : 0.35, color: RING_C, opacity: 0.7 });
      }
    }
    page.drawText(RING_NAMES[ring - 1], {
      x: cx + r + 3, y: cy - 3, size: 5.5,
      font: fonts.regular, color: RING_C
    });
  }

  // 2. Axes
  for (let i = 0; i < n; i++) {
    const outer = ptR(i, radius);
    page.drawLine({ start: { x: cx, y: cy }, end: outer, thickness: 0.35, color: AXIS_C, opacity: 0.6 });
  }

  // 3. Center dot
  page.drawCircle({ x: cx, y: cy, size: 2, color: RING_C });

  // 4. Filled data polygon — THIS IS WHAT WE ARE VALIDATING
  const dataPts = dims.map((d, i) => ptR(i, (Math.min(3, Math.max(0, d.value)) / 3) * radius));
  let polygonDrawnViaSvg = false;
  try {
    const polySegs = dataPts.map((p, i) =>
      `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${svgY(p.y).toFixed(1)}`
    );
    polySegs.push("Z");
    const pathStr = polySegs.join(" ");
    console.log("SVG path for polygon:", pathStr);
    page.drawSvgPath(pathStr, {
      x: 0, y: pageH,
      color: FILL_C, opacity: 0.42,
      borderColor: FILL_C, borderWidth: 0,
    });
    polygonDrawnViaSvg = true;
    console.log("✅ drawSvgPath (fill) succeeded");
  } catch (err) {
    console.error("❌ drawSvgPath (fill) threw:", err.message);
  }

  // Golden border on top
  for (let i = 0; i < n; i++) {
    page.drawLine({
      start: dataPts[i], end: dataPts[(i + 1) % n],
      thickness: 1.5, color: STROKE_C, opacity: 0.9
    });
  }

  // 5. Data point dots
  for (const p of dataPts) {
    page.drawCircle({ x: p.x, y: p.y, size: 3.5, color: STROKE_C });
  }

  // 6. Labels
  const LABEL_PAD = labelSize <= 6 ? 12 : 20;
  for (let i = 0; i < n; i++) {
    const a = ang(i);
    const lx = cx + (radius + LABEL_PAD) * Math.cos(a);
    const ly = cy + (radius + LABEL_PAD) * Math.sin(a);
    const label = dims[i].label;
    const lw = fonts.bold.widthOfTextAtSize(label, labelSize);
    const cosA = Math.cos(a);
    let ax = lx - lw / 2;
    if (cosA > 0.55) ax = lx + 3;
    else if (cosA < -0.55) ax = lx - lw - 3;
    page.drawText(label, { x: ax, y: ly - 3.5, size: labelSize, font: fonts.bold, color: LBL_C });
  }

  return { polygonDrawnViaSvg };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 300]);

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts   = { regular, bold };

  // Background
  page.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(0.96, 0.97, 0.97) });

  // Title
  page.drawText("Radar de Foco — Teste Task #255", {
    x: 20, y: 275, size: 10, font: bold, color: rgb(0.08, 0.18, 0.20)
  });

  // Test data: realistic values (Energia=3, Clareza=2, Imunidade=1, Ossos=2, Forca=3, Metabolica=2, Longevidade=1)
  const dims = [
    { label: "Energia",          value: 3 },
    { label: "Clareza Mental",   value: 2 },
    { label: "Imunidade",        value: 1 },
    { label: "Ossos/Art",        value: 2 },
    { label: "Forca Musc",       value: 3 },
    { label: "Metabolica",       value: 2 },
    { label: "Longevidade",      value: 1 },
  ];

  const result = drawRadarChart(page, fonts, 130, 150, 90, dims, 6);

  // Legend box
  page.drawRectangle({ x: 250, y: 220, width: 130, height: 55, color: rgb(1, 1, 1), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
  page.drawText("Legenda:", { x: 258, y: 262, size: 8, font: bold, color: rgb(0.2, 0.2, 0.2) });
  page.drawRectangle({ x: 258, y: 248, width: 12, height: 8, color: rgb(0.86, 0.92, 0.87), opacity: 0.42 });
  page.drawText("Polígono mint-cream (0.42)", { x: 273, y: 249, size: 6, font: regular, color: rgb(0.2, 0.2, 0.2) });
  page.drawLine({ start: { x: 258, y: 240 }, end: { x: 270, y: 240 }, thickness: 1.5, color: rgb(0.72, 0.58, 0.12) });
  page.drawText("Contorno dourado", { x: 273, y: 237, size: 6, font: regular, color: rgb(0.2, 0.2, 0.2) });
  page.drawLine({ start: { x: 258, y: 228 }, end: { x: 270, y: 228 }, thickness: 0.8, color: rgb(0.70, 0.77, 0.77), opacity: 0.7 });
  page.drawText("Anéis concêntricos", { x: 273, y: 225, size: 6, font: regular, color: rgb(0.2, 0.2, 0.2) });

  // Status
  page.drawText(`drawSvgPath fill: ${result?.polygonDrawnViaSvg ? "OK" : "FALLBACK"}`, {
    x: 250, y: 200, size: 7, font: bold,
    color: result?.polygonDrawnViaSvg ? rgb(0.1, 0.6, 0.2) : rgb(0.8, 0.1, 0.1)
  });

  const pdfBytes = await pdfDoc.save();
  writeFileSync("/tmp/radar-test.pdf", pdfBytes);
  console.log("PDF saved: /tmp/radar-test.pdf (" + pdfBytes.length + " bytes)");

  // Convert to PNG using pdftoppm
  try {
    execSync("pdftoppm -r 150 -png /tmp/radar-test.pdf /tmp/radar-test", { stdio: "pipe" });
    console.log("PNG saved: /tmp/radar-test-1.png");
  } catch (e) {
    console.error("pdftoppm failed:", e.message);
  }
}

main().catch(console.error);
