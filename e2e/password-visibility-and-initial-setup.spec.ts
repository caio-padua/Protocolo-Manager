import { test, expect } from "@playwright/test";

test("login mostra e oculta a senha digitada em celular e computador", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/collaborator/bootstrap-status") {
      return route.fulfill({ json: { needsBootstrap: false, staff: [] } });
    }
    return route.fulfill({ json: {} });
  });

  for (const viewport of [{ width: 402, height: 874 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    const password = page.getByTestId("input-password");
    const toggle = page.getByTestId("toggle-password-visibility-login");

    await expect(password).toHaveAttribute("type", "password");
    await password.fill("synthetic-login-password");
    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  }
});

test("Meu Acesso cria primeira senha apenas na conta da sessão", async ({ page }) => {
  let submittedBody: unknown;
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "synthetic-session-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({
      id: 41,
      name: "Profissional Sintético",
      role: "medico",
    }));
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/collaborator/me") {
      return route.fulfill({
        json: {
          professional: {
            id: 41,
            name: "Profissional Sintético",
            role: "Médico",
            category: "medico",
            cpf: null,
            email: "medico@example.test",
            crm: "CRM/SP 12345",
            registrationCouncil: "CRM",
            registrationNumber: "12345",
            loginUsername: "medico-sintetico",
            hasPassword: false,
            active: true,
            googleLinked: false,
          },
        },
      });
    }
    if (path === "/api/collaborator/initial-password" && request.method() === "POST") {
      submittedBody = request.postDataJSON();
      return route.fulfill({
        json: {
          ok: true,
          token: "synthetic-replacement-session-token",
          professional: {
            id: 41,
            name: "Profissional Sintético",
            role: "medico",
          },
        },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/configuracoes/meu-acesso");
  await expect(page.getByRole("heading", { name: "Meu Acesso" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar primeira senha" })).toBeVisible();

  const password = page.getByTestId("input-initial-password");
  const confirmation = page.getByTestId("input-initial-password-confirm");
  const reveal = page.getByTestId("toggle-password-visibility-initial");
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("synthetic-first-password");
  await confirmation.fill("synthetic-first-password");
  await reveal.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(reveal).toHaveAttribute("aria-pressed", "true");

  const initialPasswordRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/collaborator/initial-password"),
  );
  await page.getByTestId("toggle-password-visibility-initial").click();
  await page.getByRole("button", { name: "Criar primeira senha" }).click();
  const request = await initialPasswordRequest;
  expect(request.postDataJSON()).toEqual({ newPassword: "synthetic-first-password" });
  expect((await request.response())?.status()).toBe(200);
  await expect(
    page.getByText("Primeira senha cadastrada. As outras sessões foram encerradas.", { exact: true }),
  ).toBeVisible();
  expect(submittedBody).toEqual({ newPassword: "synthetic-first-password" });
  await expect(page.getByRole("button", { name: "Salvar nova senha" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("padcom_collab_token"))).toBe(
    "synthetic-replacement-session-token",
  );
});
