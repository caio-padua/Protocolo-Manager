import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Pasta temporária DEDICADA (ignorada pelo git). Apagada e recriada a cada execução.
const SAIDA = path.join(__dirname, "..", ".tmp-output");

test.beforeAll(() => {
  fs.rmSync(SAIDA, { recursive: true, force: true });
  fs.mkdirSync(SAIDA, { recursive: true });
});

test("abre página local, navega, captura imagem e baixa PDF inofensivo", async ({ page, baseURL }) => {
  // Trava de segurança: qualquer pedido fora de 127.0.0.1 é bloqueado e reprovado.
  const externos: string[] = [];
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1") return route.continue();
    externos.push(route.request().url());
    return route.abort();
  });

  // 1) abre a página inicial
  await page.goto("/");
  await expect(page).toHaveTitle(/Página inicial/);
  await expect(page.locator("#titulo")).toHaveText("Página de teste local");

  // 2) navega para a segunda página clicando no link
  await page.click("#ir-segunda");
  await expect(page).toHaveURL(`${baseURL}/segunda`);
  await expect(page.locator("#titulo")).toHaveText("Segunda página de teste");

  // 3) captura imagem da página
  const png = path.join(SAIDA, "segunda-pagina.png");
  await page.screenshot({ path: png, fullPage: true });
  expect(fs.statSync(png).size).toBeGreaterThan(1000);

  // 4) baixa o PDF de teste para a pasta temporária dedicada
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#baixar-pdf")]);
  expect(download.suggestedFilename()).toBe("arquivo-teste.pdf");
  const destino = path.join(SAIDA, "arquivo-teste.pdf");
  await download.saveAs(destino);
  const bytes = fs.readFileSync(destino);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.toString("latin1")).toContain("TESTE INOFENSIVO");
  expect(bytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);

  // 5) nenhum pedido externo foi tentado
  expect(externos).toEqual([]);
});
