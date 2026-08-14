/**
 * Print de tela COM sessao de colaborador.
 *
 * A tela do Manager guarda o token do Portao do Colaborador no localStorage,
 * entao um print "seco" cai no aviso de 401 e nao prova nada. Este script abre
 * a pagina num navegador de verdade, injeta a sessao e so entao fotografa —
 * e a forma honesta de provar visualmente uma tela protegida (Art. 69, nivel
 * VISUAL).
 *
 * Uso:
 *   node scripts/screenshot-tela-autenticada.mjs <rota> <arquivo.png> [largura] [altura]
 *
 * Exemplo:
 *   node scripts/screenshot-tela-autenticada.mjs /comunicacao/digital screenshots/digital.png 1500 1350
 *
 * Requer SESSION_SECRET no ambiente (o mesmo que o servidor usa para assinar).
 */
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

// Monorepo pnpm: puppeteer nao e dependencia da raiz, e sim de um artefato.
// Procuramos em quem realmente o declara em vez de fixar um caminho.
function carregarPuppeteer() {
  const bases = [
    new URL("../", import.meta.url).pathname,
    new URL("../artifacts/api-server/", import.meta.url).pathname,
    new URL("../artifacts/padcom/", import.meta.url).pathname,
  ];
  for (const base of bases) {
    try {
      return createRequire(`${base}package.json`)("puppeteer");
    } catch {
      /* tenta o proximo */
    }
  }
  throw new Error("puppeteer nao encontrado em nenhum artefato do monorepo");
}
const puppeteer = carregarPuppeteer();

const rota = process.argv[2] ?? "/";
const saida = process.argv[3] ?? "screenshots/tela.png";
const largura = Number(process.argv[4] ?? 1500);
const altura = Number(process.argv[5] ?? 1350);
const base = process.env.PREVIEW_BASE ?? "http://127.0.0.1:80";

if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET ausente — sem ele nao da para assinar a sessao.");
  process.exit(1);
}

// Mesmo formato que createCollaboratorToken emite: base64url("collab:id:papel:exp:hmac").
const exp = Date.now() + 60 * 60 * 1000;
const payload = `collab:6:executor:${exp}`;
const assinatura = crypto
  .createHmac("sha256", process.env.SESSION_SECRET)
  .update(payload)
  .digest("hex");
const token = Buffer.from(`${payload}:${assinatura}`).toString("base64url");

mkdirSync(dirname(saida), { recursive: true });

// O puppeteer nao baixa Chrome neste ambiente; usamos o chromium ja instalado.
// Resolvido pelo PATH (nao por caminho fixo do /nix/store, que muda a cada
// atualizacao do sistema).
function acharChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  } catch {
    /* segue para o proximo */
  }
  if (process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }
  throw new Error("Nenhum chromium encontrado (PATH, PUPPETEER_EXECUTABLE_PATH ou Playwright).");
}

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: acharChromium(),
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: largura, height: altura, deviceScaleFactor: 1 });
  await page.goto(`${base}${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem("padcom_collab_token", t);
    localStorage.setItem(
      "padcom_collab_prof",
      JSON.stringify({ id: 6, name: "Dr. Caio", role: "executor" }),
    );
  }, token);
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3500));

  const texto = await page.evaluate(() => document.body.innerText);
  console.log("--- texto visivel na tela ---");
  for (const linha of texto
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    console.log("  " + linha);
  }

  await page.screenshot({ path: saida, fullPage: false });
  console.log(`\nOK — print salvo em ${saida}`);
} finally {
  await browser.close();
}
