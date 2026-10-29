import { expect, test, type Page } from "@playwright/test";

const stats = (total: number) => ({
  ok: true,
  total,
  pacientesUnicos: total - 1,
  porDevice: [{ device: "iphone", total }],
  porSecao: [{ secao: "login", total }],
  pacientes: [],
});

const panel = (page: Page) => page.locator(".panel-3d").filter({
  has: page.getByText("Onboarding Digital", { exact: true }),
});
const totalShown = (page: Page, total: number) =>
  expect(panel(page).locator(".text-3xl").first()).toHaveText(String(total));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({
      id: 1, name: "Profissional Teste", role: "medico",
    }));
  });
  // Isolate from real APIs and patient data; authentication remains in place.
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/clients*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/collaborator/me", (route) => route.fulfill({
    json: { professional: { id: 1, name: "Profissional Teste", role: "medico" } },
  }));
  await page.route("**/api/ai-usage/resumo?*", (route) => route.fulfill({ json: { ok: false } }));
  await page.route("**/api/ceo/stream", (route) => route.fulfill({
    contentType: "text/event-stream",
    body: 'data: {"ok":true,"data":[]}\n\n',
  }));
  page.on("pageerror", (error) => { throw error; });
});

test("Atualizar mostra spinner, bloqueia cliques e substitui os números sem reload", async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/onboarding/stats", async (route) => {
    requests++;
    if (requests > 1) await pending;
    await route.fulfill({ json: stats(requests === 1 ? 11 : 23) });
  });
  await page.goto("/ceo/command-center");
  await totalShown(page, 11);
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  const button = panel(page).getByRole("button", { name: "Atualizar" });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button.locator("svg")).toHaveClass(/animate-spin/);
  await expect(panel(page).getByText("Carregando…")).toBeVisible();
  release();
  await totalShown(page, 23);
  await expect(panel(page).locator(".text-3xl").nth(1)).toHaveText("22");
  await expect(button).toBeEnabled();
  await expect(button.locator("svg")).not.toHaveClass(/animate-spin/);
  await expect(panel(page).getByText("Carregando…")).toHaveCount(0);
  expect(requests).toBe(2);
  expect(navigations).toEqual([]);
  await panel(page).screenshot({ path: test.info().outputPath("onboarding-atualizado.png") });
});

test("atualiza a cada 60 segundos e para ao sair da tela", async ({ page }) => {
  await page.clock.install();
  let requests = 0;
  await page.route("**/api/onboarding/stats", (route) =>
    route.fulfill({ json: stats(10 + ++requests) }));
  await page.goto("/ceo/command-center");
  await totalShown(page, 11);
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.clock.runFor(59_000);
  expect(requests).toBe(1);
  await page.clock.runFor(1_000);
  await totalShown(page, 12);
  await page.clock.runFor(60_000);
  await totalShown(page, 13);
  expect(requests).toBe(3);
  expect(navigations).toEqual([]);
  // Client-side navigation unmounts the component without resetting the browser.
  await page.evaluate(() => {
    history.pushState(null, "", "/comunicacao/guia-paciente");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(panel(page)).toHaveCount(0);
  await page.clock.runFor(120_000);
  expect(requests).toBe(3);
});

test("falha inicial se recupera automaticamente no próximo intervalo", async ({ page }) => {
  await page.clock.install();
  let requests = 0;
  await page.route("**/api/onboarding/stats", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 500, json: { ok: false } })
      : route.fulfill({ json: stats(31) });
  });
  await page.goto("/ceo/command-center");
  await expect(panel(page).locator(".paxter-alert-red")).toBeVisible();
  await page.clock.runFor(60_000);
  await totalShown(page, 31);
  await expect(panel(page).locator(".paxter-alert-red")).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: "Atualizar" })).toBeEnabled();
  expect(requests).toBe(2);
});

for (const failure of ["http", "application", "network"] as const) {
  test(`erro ${failure} mostra alerta vermelho e permite recuperar`, async ({ page }) => {
    let fail = false;
    await page.route("**/api/onboarding/stats", (route) => {
      if (!fail) return route.fulfill({ json: stats(17) });
      if (failure === "network") return route.abort("failed");
      return route.fulfill({
        status: failure === "http" ? 500 : 200,
        // Even a misleading ok:true body must not override HTTP failure.
        json: failure === "http" ? stats(99) : { ok: false },
      });
    });
    await page.goto("/ceo/command-center");
    await totalShown(page, 17);
    const button = panel(page).getByRole("button", { name: "Atualizar" });
    fail = true;
    await button.click();
    const alert = panel(page).locator(".paxter-alert-red");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Erro/);
    await expect(button).toBeEnabled();
    await expect(button.locator("svg")).not.toHaveClass(/animate-spin/);
    fail = false;
    await button.click();
    await expect(alert).toHaveCount(0);
    await totalShown(page, 17);
  });
}
