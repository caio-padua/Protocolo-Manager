import { test, expect } from "@playwright/test";

test("histórico sem resets sai do carregamento e mostra estado vazio", async ({ page }) => {
  // Synthetic data only; every API request is intercepted. No real resets.
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({
      id: 1, name: "CEO Teste", role: "medico",
    }));
  });
  let releaseHistory: (() => void) | undefined;
  let historyRequests = 0;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/concierge-penalidade/12345612345/historico") {
      historyRequests++;
      // Keep the response pending until the test has observed the loading UI.
      await new Promise<void>(resolve => { releaseHistory = resolve; });
      return route.fulfill({ json: { ok: true, rows: [] } });
    }
    if (url.pathname === "/api/collaborator/me") {
      return route.fulfill({ json: { professional: { id: 1, name: "CEO Teste", role: "medico" } } });
    }
    if (url.pathname === "/api/clients") {
      return route.fulfill({ json: [{
        id: 901, name: "Cliente Histórico Teste", cpf: "123.456.123-45",
        phone: null, photoUrl: null, status: "active", deletedAt: null,
      }] });
    }
    if (url.pathname === "/api/admin/concierge-penalidade") {
      return route.fulfill({ json: { ok: true, total: 1, rows: [{
        cpf_mascarado: "***.***.123-45", nome_paciente: "Cliente Histórico Teste",
        tentativas_falha: 3, bloqueado_permanente: true,
        ultima_falha_at: null, criado_at: "2026-01-01T12:00:00Z",
        atualizado_at: "2026-01-01T12:00:00Z",
      }] } });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/ceo/concierge-penalidades");
  const historyButton = page.getByTitle("Ver histórico de resets", { exact: true });
  const empty = page.getByText("Nenhum reset registrado para este CPF.", { exact: true });
  const loading = page.getByText("Carregando histórico…", { exact: true });

  {
    await historyButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('button[aria-haspopup="dialog"]').click();
    await page.getByPlaceholder("Buscar por nome, CPF ou telefone…").fill("Cliente Histórico Teste");
    await page.getByRole("button", { name: /Cliente Histórico Teste/i }).last().click();
    await dialog.getByRole("button", { name: "Ver histórico", exact: true }).click();

    await expect(loading).toBeVisible();
    await expect.poll(() => historyRequests).toBe(1);
    await expect(empty).toHaveCount(0);
    releaseHistory!();
    await expect(empty).toBeVisible();
    await expect(loading).toHaveCount(0);
    const historyRow = empty.locator("xpath=ancestor::tr[1]");
    await expect(historyRow.locator(".animate-spin")).toHaveCount(0);
    await expect(historyRow.locator("table")).toHaveCount(0);
    await expect(historyRow).toContainText("Histórico de resets — ***.***.123-45");

  }
});
