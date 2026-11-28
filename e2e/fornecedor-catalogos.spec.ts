import { test, expect } from "@playwright/test";

// Somente leitura: abre o histórico de catálogos e baixa um arquivo; não envia nem altera nada.
for (const [nome, viewport] of [["desktop", { width: 1366, height: 900 }], ["celular", { width: 390, height: 844 }]] as const) {
  test(`catalogos do fornecedor - historico e download (${nome})`, async ({ page, request }) => {
    test.setTimeout(120_000);
    const identifier = process.env.PAXTER_OPERATOR_LOGIN_RETRY || process.env.PAXTER_OPERATOR_LOGIN;
    const password = process.env.PAXTER_OPERATOR_PASSWORD;
    if (!identifier || !password) throw new Error("Credenciais operacionais não configuradas.");
    const login = await request.post("/api/collaborator/login", { data: { identifier, password } });
    expect(login.status()).toBe(200);
    const session = await login.json();
    await page.setViewportSize(viewport);
    await page.addInitScript(({ token, professional }) => {
      localStorage.setItem("padcom_collab_token", token);
      localStorage.setItem("padcom_collab_prof", JSON.stringify(professional));
    }, session);
    await page.goto("/substances");
    await expect(page.getByTestId("topo-fornecedores-embutido")).toBeVisible({ timeout: 40_000 });
    const botao = page.getByTestId("button-catalogos-3");
    await botao.scrollIntoViewIfNeeded();
    await botao.click();
    await expect(page.getByTestId("historico-catalogos")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-testid^=catalogo-]:not([data-testid^=catalogos])")).toHaveCount(2);
    await page.getByTestId("catalogos-3").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/catalogos-${nome}.png` });
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), page.locator("[data-testid^=button-baixar-catalogo-]").first().click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
}
