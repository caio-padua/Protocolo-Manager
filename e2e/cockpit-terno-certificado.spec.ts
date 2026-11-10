import { expect, test, type Page } from "@playwright/test";

type CertificateScenario = "valid" | "expired" | "unavailable" | "nonDoctor";

async function isolateServices(page: Page, scenario: CertificateScenario = "valid") {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica-sem-acesso");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 45, name: "Profissional Exemplo", role: "medico" }));
    localStorage.setItem("paxter.sidebar.collapsed", "0");
    localStorage.setItem("paxter.cockpit.theme", "light");
  });
  await page.route("**/api/**", async route => {
    if (route.request().method() !== "GET") return route.abort();
    const path = new URL(route.request().url()).pathname;
    const respond = (body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(body),
    });
    if (path === "/api/collaborator/me") return respond({ professional: {
      id: 45, name: "Profissional Exemplo", role: "medico",
      category: "medico", isPlatformOwner: true, photoUrl: null,
    } });
    if (path === "/api/settings/certificate") {
      if (scenario === "unavailable") return respond({ error: "Indisponível" }, 503);
      return respond({
        state: scenario === "expired" ? "expired" : "valid",
        professionalType: scenario === "nonDoctor" ? "enfermagem" : "medico",
        validFrom: null, validTo: null,
      });
    }
    if (path === "/api/clients/999") return respond({
      id: 999, name: "Cliente Exemplo", cpf: null, phone: null,
      email: null, address: null, photoUrl: null, birthDate: null,
    });
    if (path === "/api/clients") return respond([{
      id: 999, name: "Cliente Exemplo", cpf: null, phone: null, photoUrl: null,
    }]);
    if (path === "/api/settings/governanca") return respond({ matriz: null });
    if (path === "/api/menu") return respond({ items: [] });
    if (path === "/api/telegram-inbox/badge") return respond({ naoLidas: 0 });
    return respond([]);
  });
}

test("tecido e régua acompanham menu e rolagem sem mudar as ferramentas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await isolateServices(page);
  await page.goto("/cockpit/999/evolucao", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cc-identity")).toBeVisible();
  await expect(page.locator(".cc-rail-item")).toHaveCount(12);
  await expect(page.getByRole("status", { name: /Certificado do médico autenticado: Certificado válido/ })).toBeVisible();
  const geometry = () => page.evaluate(() => {
    const button = document.querySelector('[aria-label="Recolher menu"], [aria-label="Expandir menu"]')!;
    const side = button.parentElement!.getBoundingClientRect();
    const shell = document.querySelector(".cc-shell")!.getBoundingClientRect();
    return { gap: shell.left - side.right, width: side.width };
  });
  const expanded = await geometry();
  expect(Math.abs(expanded.gap)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();
  await expect.poll(async () => (await geometry()).width).toBeLessThan(expanded.width);
  expect(Math.abs((await geometry()).gap)).toBeLessThanOrEqual(1);
  const sameFabric = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".cc-shell")!).backgroundImage ===
    getComputedStyle(document.querySelector(".cc-rail-wrap")!).backgroundImage,
  );
  expect(sameFabric).toBe(true);
  await page.evaluate(() => {
    (document.querySelector(".cc-workspace-background") as HTMLElement).style.minHeight = "2200px";
    window.scrollTo(0, 600);
  });
  await expect.poll(async () => page.locator(".cc-rail-wrap").evaluate(el => el.getBoundingClientRect().top)).toBeCloseTo(0, 0);
  await expect(page.getByRole("status", { name: /Certificado do médico autenticado: Certificado válido/ })).toBeInViewport();
  const actionNames = await page.locator(".cc-action strong").allTextContents();
  expect(actionNames.map(name => name.trim())).toEqual([
    "NOVO AGENDAMENTO", "EVOLUÇÃO", "PASTAS DO DRIVE", "EDITAR CADASTRO",
  ]);
});

for (const [scenario, expected] of [
  ["expired", "Certificado vencido"],
  ["unavailable", "Validação indisponível"],
  ["nonDoctor", "Aguardando confirmação do médico autenticado"],
] as const) {
  test(`o indicador não apresenta ${scenario} como certificado válido`, async ({ page }) => {
    await isolateServices(page, scenario);
    await page.goto("/cockpit/999/evolucao", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status", { name: `Certificado do médico autenticado: ${expected}` })).toBeVisible();
    await expect(page.getByRole("status", { name: /Certificado do médico autenticado: Certificado válido/ })).toHaveCount(0);
  });
}

test("identidade e ferramentas permanecem acessíveis no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await isolateServices(page);
  await page.goto("/cockpit/999/evolucao", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cc-identity")).toBeVisible();
  await expect(page.locator(".cc-rail-item")).toHaveCount(12);
  await expect(page.locator(".cc-rail-wrap")).toBeVisible();
});
