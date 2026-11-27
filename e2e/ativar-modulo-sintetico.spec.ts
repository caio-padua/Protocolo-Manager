/** Tela de módulo (informativa) com sessão de colaborador SINTÉTICA: /api simulado no navegador; prova só a tela. */
import { test, expect, type Page } from "@playwright/test";

async function abrir(page: Page, ativos: string[], modulo: string, menuOk = true) {
  await page.addInitScript(() => { localStorage.setItem("padcom_collab_token", "tok-sintetico"); });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const j = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/collaborator/me")) return j({ professional: { id: 1, name: "Colaborador Sintético", role: "admin" } });
    if (p.endsWith("/api/menu")) return menuOk ? j({ items: ativos.map((m) => ({ moduloRequerido: m })) }) : j({ error: "x" }, 503);
    return j({});
  });
  await page.goto(`/ativar-modulo/${modulo}`);
  await page.waitForTimeout(2500);
}

for (const [nome, vp] of [["desktop", { width: 1280, height: 900 }], ["celular", { width: 390, height: 844 }]] as const) {
  test(`módulo ativo mostra Plano atual e benefícios (${nome})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await abrir(page, ["agenda"], "agenda");
    await expect(page.getByTestId("beneficios-modulo")).toBeVisible();
    await expect(page.getByTestId("ativar-modulo").getByTestId("estado-plano_atual").first()).toBeVisible();
    await page.screenshot({ path: `e2e/evidencias/${nome}-modulo-ativo.png`, fullPage: true });
  });
  test(`módulo inativo mostra Recurso disponível, sem compra (${nome})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await abrir(page, ["agenda"], "financeiro");
    await expect(page.getByTestId("estado-disponivel").first()).toBeVisible();
    await expect(page.getByText(/nada foi contratado/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /comprar|contratar|assinar/i })).toHaveCount(0);
    await page.screenshot({ path: `e2e/evidencias/${nome}-modulo-inativo.png`, fullPage: true });
  });
}
test("falha do menu: nenhum estado é afirmado", async ({ page }) => {
  await abrir(page, [], "agenda", false);
  await expect(page.locator('[data-testid^="estado-"]')).toHaveCount(0);
});
