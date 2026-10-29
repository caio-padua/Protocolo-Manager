import { expect, test } from "@playwright/test";

// Browser contract tests only. PostgreSQL persistence and route-module restart
// are covered separately in onboarding-quota-restart.test.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({
      id: 1, name: "Profissional Teste", role: "medico",
    }));
  });
  await page.route("**/api/collaborator/me", (route) => route.fulfill({
    json: { professional: { id: 1, name: "Profissional Teste", role: "medico" } },
  }));
  await page.route("**/api/clients*", (route) => route.fulfill({
    json: [{
      id: 42, name: "Cliente Teste Guia", cpf: null,
      phone: "+5500000000000", photoUrl: null,
    }],
  }));
  await page.route("**/api/clientes/42/telegram-status", (route) =>
    route.fulfill({ json: { vinculado: true, desde: null } }));
  await page.route("**/api/onboarding/minha-config", (route) => route.fulfill({
    json: { slug: "clinica-teste", clinicaNome: "Clínica Teste" },
  }));
});

for (const canal of ["WHATSAPP", "TELEGRAM"] as const) {
  test(`${canal}: limite diário mostra banner vermelho, não cooldown`, async ({ page }) => {
    // The screen offers WhatsApp alone or both channels, not Telegram alone.
    const buttonName = canal === "WHATSAPP" ? "WhatsApp" : "WhatsApp + Telegram";
    const canais = canal === "WHATSAPP" ? ["WHATSAPP"] : ["WHATSAPP", "TELEGRAM"];
    await page.route("**/api/onboarding/enviar-guia", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ clientId: 42, canais });
      await route.fulfill({
        status: 429,
        json: { ok: false, motivo: "limite_diario", canal, error: "Limite diário atingido para este canal." },
      });
    });
    await page.goto("/comunicacao/guia-paciente");
    await page.getByRole("button", { name: /Selecionar cliente/i }).click();
    await page.getByText("Cliente Teste Guia", { exact: true }).click();
    await page.getByRole("button", { name: buttonName, exact: true }).click();

    const banner = page.locator("div.text-red-700").filter({ hasText: "Limite diário atingido" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(`(${canal})`);
    await expect(banner).toContainText("3 vezes hoje");
    await expect(page.locator("div.text-amber-700").filter({ hasText: /antes de reenviar/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: buttonName, exact: true })).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath(`limite-diario-${canal}.png`), fullPage: true });
  });
}

test("cooldown mostra banner âmbar e não limite diário", async ({ page }) => {
  await page.route("**/api/onboarding/enviar-guia", (route) => route.fulfill({
    status: 429,
    json: { ok: false, motivo: "cooldown", canal: "WHATSAPP", error: "Aguarde 60 segundos antes de reenviar." },
  }));
  await page.goto("/comunicacao/guia-paciente");
  await page.getByRole("button", { name: /Selecionar cliente/i }).click();
  await page.getByText("Cliente Teste Guia", { exact: true }).click();
  await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await expect(page.locator("div.text-amber-700").filter({ hasText: /antes de reenviar/ })).toBeVisible();
  await expect(page.locator("div.text-red-700").filter({ hasText: "Limite diário atingido" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Aguarde \d+s/ }).first()).toBeDisabled();
});
