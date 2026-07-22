// ─────────────────────────────────────────────────────────────────────────────
// PUPPETEER CAPTURE — Renderiza HTML server-side e retorna PNG base64
// Usa Chromium embutido do puppeteer (instalado em ~/.cache/puppeteer)
// ─────────────────────────────────────────────────────────────────────────────
import puppeteer from "puppeteer";

/**
 * Recebe HTML completo, renderiza em headless Chromium, tira screenshot
 * do elemento #receituario e retorna PNG base64.
 */
export async function htmlToPngBase64(html: string): Promise<string> {
  // Usa o Chromium do sistema Nix (instaldo via replit.nix)
  const executablePath = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-features=VizDisplayCompositor",
    ],
  });

  try {
    const page = await browser.newPage();

    // A4 em 96dpi = 794×1123 px; deviceScaleFactor 2 para resolução de impressão
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

    // Carrega o HTML com networkidle0 para aguardar imagens
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });

    // Screenshot do elemento #receituario (captura exatamente a folha)
    const el = await page.$("#receituario");
    if (!el) throw new Error("Elemento #receituario não encontrado no HTML");

    const png = await el.screenshot({ type: "png" });
    return Buffer.from(png).toString("base64");
  } finally {
    await browser.close();
  }
}
