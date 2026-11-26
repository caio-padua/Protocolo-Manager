import { test, expect } from "@playwright/test";

// Somente leitura: não cria, edita nem desativa nada.
for (const [nome, viewport] of [["desktop", { width: 1366, height: 900 }], ["celular", { width: 390, height: 844 }]] as const) {
  test(`substancias e fornecedores - cadastro (${nome})`, async ({ page, request }) => {
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
    await expect(page.getByRole("heading", { name: "Substâncias e Fornecedores — Cadastro" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("button-nova-substancia")).toBeVisible();
    const painel = page.getByTestId("painel-fornecedores");
    await expect(painel).toBeVisible();
    await expect(page.getByTestId("topo-fornecedores-embutido")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `/tmp/subst-${nome}-1.png` });
    await page.getByTestId("button-toggle-painel-fornecedores").click();
    await expect(page.getByTestId("topo-fornecedores-embutido")).toHaveCount(0);
    await page.getByTestId("button-toggle-painel-fornecedores").click();
    await expect(page.getByTestId("topo-fornecedores-embutido")).toBeVisible();
    // Prévia da lista do fornecedor (somente leitura: nada é aprovado nem gravado).
    const enviar = page.locator("[data-testid^=button-enviar-lista-]").first();
    await enviar.scrollIntoViewIfNeeded();
    await enviar.click();
    const csv = "Produto;Dose;Volume;Qtd na caixa;Preço da caixa;Via\nSubstancia Inedita E2E Prévia;100 mg;2;5;300,00;EV\nSem preco;10 mg;;1;;IM\n";
    await page.locator("[data-testid^=input-lista-]").first().setInputFiles({ name: "lista.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByTestId("previa-lista")).toContainText("1 novas", { timeout: 30_000 });
    await expect(page.getByTestId("previa-lista")).toContainText("1 inválidas");
    await expect(page.getByTestId("button-aplicar-lista")).toBeDisabled();
    await page.screenshot({ path: `/tmp/subst-${nome}-3.png` });
    await page.getByRole("button", { name: "Fechar envio de lista" }).click();
    await page.getByTestId("button-nova-substancia").click();
    await expect(page.getByTestId("form-nova-substancia")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).first().click();
    const primeira = page.locator("p.text-xl.font-black.uppercase").first();
    await primeira.click();
    await expect(page.locator("[data-testid^=valores-fornecedor-]").first()).toBeVisible({ timeout: 30_000 });
    await page.locator("[data-testid^=valores-fornecedor-]").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/subst-${nome}-2.png` });
  });
}
