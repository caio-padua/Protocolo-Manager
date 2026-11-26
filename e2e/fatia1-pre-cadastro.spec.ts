// Fatia 1 — pré-cadastro obrigatório em /area, com cliente fictício isolado (id 5301, CPF de teste).
import { test, expect } from "@playwright/test";
const EV = "docs/evidencias/fatia-1";
test("pré-cadastro: bloqueio, incompleto, salvamento e liberação", async ({ page }) => {
  await page.goto("/area");
  await page.getByPlaceholder("000.000.000-00").fill("11144477735");
  await page.getByPlaceholder("DD/MM/AAAA").fill("01011990");
  await page.getByRole("button", { name: /^ENTRAR/ }).first().click();
  await expect(page.getByText("COMPLETE SEU CADASTRO")).toBeVisible();
  await expect(page.getByText("Início", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${EV}/1-bloqueio-antes.png` });
  await page.getByRole("button", { name: "SALVAR E ENTRAR" }).click();
  await expect(page.getByRole("alert")).toContainText("Preencha todos os campos");
  await page.screenshot({ path: `${EV}/2-campos-incompletos.png` });
  await page.locator("input[inputmode=tel]").fill("(11) 90000-0000");
  await page.locator("input[type=email]").fill("teste.descartavel@example.com");
  await page.locator("select").selectOption("F");
  await page.locator("input").last().fill("Rua Teste 1, Centro, Sao Paulo, 01000-000");
  await page.screenshot({ path: `${EV}/3-preenchido.png` });
  await page.getByRole("button", { name: "SALVAR E ENTRAR" }).click();
  await expect(page.getByText("COMPLETE SEU CADASTRO")).toHaveCount(0);
  await expect(page.getByText("PAX CARE").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${EV}/4-liberado-depois.png` });
});
