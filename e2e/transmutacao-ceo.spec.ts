import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Exige TRANSMUTACAO_TOKEN (token de colaborador do CEO, gerado em dev). Nenhuma mensagem real é enviada.
const token = process.env.TRANSMUTACAO_TOKEN ?? (fs.existsSync("/tmp/ceo.tok") ? fs.readFileSync("/tmp/ceo.tok", "utf8").trim() : "");
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;

test.skip(!token, "sem token do CEO");
test.use({ viewport: { width: 1366, height: 900 } });

test("transmutação: cadeados, riscado, limpeza e volta à visão CEO", async ({ page }) => {
  await page.addInitScript((t) => { localStorage.setItem("padcom_collab_token", t); }, token);
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const seletor = page.getByTestId("seletor-transmutacao").locator("select");
  await expect(seletor).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("item-travado")).toHaveCount(0);

  const rotulos: Record<string, string> = {
    empresario: "Simular: Empresário Admin Não-Médico",
    recepcao: "Simular: Recepção (Somente Leitura)",
    financeiro: "Simular: Gerente Financeiro (Sigilo Médico)",
  };
  await seletor.selectOption({ label: rotulos.financeiro });
  await expect(page.getByTestId("aviso-simulacao")).toBeVisible();
  const travados = page.getByTestId("item-travado");
  await expect(travados.first()).toBeVisible({ timeout: 20000 });
  expect(await travados.count()).toBeGreaterThan(5);
  const riscado = await travados.first().locator("span").first().evaluate((el) => getComputedStyle(el).textDecorationLine);
  expect(riscado).toContain("line-through");
  // item bloqueado não navega
  const url = page.url();
  await travados.first().click({ force: true });
  expect(page.url()).toBe(url);
  await expect(page.getByRole("link", { name: "Pagamentos" })).toBeVisible();

  // tela bloqueada acessada direto: aviso, sem o conteúdo da tela
  await page.goto(`${base}/cockpit`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("aviso-acesso-restrito")).toBeVisible({ timeout: 30000 });

  // troca de perfil: aviso some, sem mensagem residual
  await page.getByTestId("seletor-transmutacao").locator("select").selectOption({ label: rotulos.recepcao });
  await expect(page.getByTestId("aviso-acesso-restrito")).toBeVisible();
  await page.getByTestId("seletor-transmutacao").locator("select").selectOption({ label: "Dashboard Geral (Visão CEO da Plataforma)" });
  await expect(page.getByTestId("aviso-acesso-restrito")).toHaveCount(0);
  await expect(page.getByTestId("item-travado")).toHaveCount(0);
  await expect(page.getByTestId("aviso-simulacao")).toHaveCount(0);
  await page.screenshot({ path: "generated-artifacts/transmutacao-ceo.png" });
});
