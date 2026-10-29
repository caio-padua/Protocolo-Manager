import { test, expect } from "@playwright/test";

test("reset exige CPF compatível com a linha e confirmação explícita", async ({ page }, testInfo) => {
  // Synthetic identities only. Every API request is intercepted: no real resets.
  const clients = [
    { id: 901, name: "Cliente Correto Teste", cpf: "123.456.123-45" },
    { id: 902, name: "Cliente Errado Teste", cpf: "123.456.987-65" },
    { id: 903, name: "Cliente Sem CPF Teste", cpf: null },
  ].map(c => ({ ...c, phone: null, photoUrl: null, status: "active", deletedAt: null }));
  const resets: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({
      id: 1, name: "CEO Teste", role: "medico",
    }));
  });
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") {
      resets.push(url.pathname);
      return route.fulfill({ json: { ok: true, message: "Reset simulado." } });
    }
    if (url.pathname === "/api/collaborator/me") {
      return route.fulfill({ json: { professional: { id: 1, name: "CEO Teste", role: "medico" } } });
    }
    if (url.pathname === "/api/clients") return route.fulfill({ json: clients });
    if (url.pathname === "/api/admin/concierge-penalidade") {
      return route.fulfill({ json: { ok: true, total: 1, rows: [{
        cpf_mascarado: "***.***.123-45", nome_paciente: "Cliente Correto Teste",
        tentativas_falha: 3, bloqueado_permanente: true,
        ultima_falha_at: null, criado_at: "2026-01-01T12:00:00Z",
        atualizado_at: "2026-01-01T12:00:00Z",
      }] } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/ceo/concierge-penalidades");
  await page.getByRole("button", { name: "Resetar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const reset = dialog.getByRole("button", { name: "Resetar", exact: true });
  const warning = dialog.getByText(/O CPF deste cliente não corresponde/);
  const confirmation = dialog.getByRole("checkbox");
  const select = async (name: string) => {
    await dialog.locator('button[aria-haspopup="dialog"]').click();
    await page.getByPlaceholder("Buscar por nome, CPF ou telefone…").fill(name);
    await page.getByRole("button", { name: new RegExp(name, "i") }).last().click();
    await expect(page.getByPlaceholder("Buscar por nome, CPF ou telefone…")).toBeHidden();
  };
  await expect(reset).toBeDisabled();
  await confirmation.check();
  await select("Cliente Errado Teste");
  await expect(warning).toBeVisible();
  await expect(reset).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("cpf-incompativel.png") });
  expect(resets).toEqual([]);

  await select("Cliente Correto Teste");
  await expect(warning).toHaveCount(0);
  await expect(reset).toBeEnabled();
  await confirmation.uncheck();
  await expect(reset).toBeDisabled();
  await confirmation.check();
  await expect(reset).toBeEnabled();

  // Changing back to an incompatible identity must immediately close the gate.
  await select("Cliente Errado Teste");
  await expect(warning).toBeVisible();
  await expect(reset).toBeDisabled();
  await select("Cliente Sem CPF Teste");
  await expect(dialog.getByText("O cliente selecionado não possui CPF cadastrado.")).toBeVisible();
  await expect(reset).toBeDisabled();
  expect(resets).toEqual([]);

  await select("Cliente Correto Teste");
  await expect(reset).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("cpf-compativel.png") });
  await reset.click();
  await expect(page.getByText("Reset simulado.")).toBeVisible();
  expect(resets).toEqual(["/api/admin/concierge-penalidade/12345612345"]);

  await page.getByRole("button", { name: "Resetar", exact: true }).click();
  await expect(confirmation).not.toBeChecked();
  await expect(reset).toBeDisabled();
  await expect(dialog.getByText("Selecionar cliente…", { exact: true })).toBeVisible();
});
