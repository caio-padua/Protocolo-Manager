import { expect, test } from "@playwright/test";

for (const width of [1365, 390]) {
  test(`empresa mostra apenas seus locais e abre edição em ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "sessao-sintetica");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
    });
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
      if (pathname === "/api/empresas") return route.fulfill({ json: [
        { id: 21, nome: "Empresa Alfa", tipo: "clinic", ativa: true, status: "ATIVO" },
        { id: 22, nome: "Empresa Beta", tipo: "clinic", ativa: true, status: "ATIVO" },
      ] });
      if (pathname === "/api/semantic-codes/companies") return route.fulfill({ json: [{ id: 21, nome: "Empresa Alfa" }, { id: 22, nome: "Empresa Beta" }] });
      if (pathname === "/api/semantic-codes/locations") return route.fulfill({ json: [
        { locationId: 11, empresaId: 21, name: "Local Alfa", active: true },
        { locationId: 12, empresaId: 22, name: "Local Beta", active: true },
      ] });
      if (pathname === "/api/locations") return route.fulfill({ json: [
        { id: 11, name: "Local Alfa", type: "clinic", active: true, color: "#16284a" },
        { id: 12, name: "Local Beta", type: "clinic", active: true, color: "#16284a" },
      ] });
      return route.fulfill({ json: {} });
    });
    await page.goto("/cadastros/empresas");
    await page.getByRole("button", { name: "Mostrar locais de Empresa Alfa" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Local Alfa" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Local Beta" })).toHaveCount(0);
    await page.screenshot({ path: `generated-artifacts/empresas-locais-${width}.png` });
    await page.getByRole("link", { name: "Editar local Local Alfa" }).click();
    await expect(page).toHaveURL(/\/cadastros\/clinicas\?local=11/);
    await expect(page.getByRole("dialog", { name: "EDITAR LOCAL" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("dialog").getByLabel("Nome *", { exact: true })).toHaveValue("Local Alfa");
  });
}

test("erro ao consultar vínculos não é tratado como lista vazia", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/empresas") return route.fulfill({ json: [{ id: 21, nome: "Empresa Alfa", tipo: "clinic", ativa: true, status: "ATIVO" }] });
    if (pathname === "/api/semantic-codes/companies") return route.fulfill({ status: 503, json: {} });
    if (pathname === "/api/semantic-codes/locations") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/empresas");
  await page.getByRole("button", { name: "Mostrar locais de Empresa Alfa" }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível consultar os locais");
  await expect(page.getByText("Nenhum local vinculado encontrado.")).toHaveCount(0);
});

test("novo local exige empresa e envia a seleção para autorização", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  let requests = 0;
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/semantic-codes/companies") return route.fulfill({ json: [{ id: 21, nome: "Empresa Alfa" }] });
    if (pathname === "/api/locations" && route.request().method() === "POST") {
      requests++;
      expect(route.request().headers()["x-empresa-id"]).toBe("21");
      return route.fulfill({ json: { id: 11, name: "Novo local" } });
    }
    if (pathname === "/api/locations") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/clinicas");
  await page.getByRole("button", { name: "NOVO LOCAL" }).click();
  const dialog = page.getByRole("dialog", { name: "NOVO LOCAL" });
  await dialog.getByLabel("Nome *", { exact: true }).fill("Novo local");
  await dialog.getByRole("button", { name: "SALVAR LOCAL" }).click();
  await expect(page.getByText("Selecione a empresa responsável pelo local.")).toBeVisible();
  expect(requests).toBe(0);
  await dialog.getByLabel("Empresa responsável pelo local *").click();
  await page.getByRole("option", { name: "Empresa Alfa" }).click();
  await dialog.getByRole("button", { name: "SALVAR LOCAL" }).click();
  await expect(dialog).toBeHidden();
  expect(requests).toBe(1);
});

test("recusa do servidor ao salvar local é apresentada", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/semantic-codes/companies") return route.fulfill({ json: [{ id: 21, nome: "Empresa Alfa" }] });
    if (pathname === "/api/locations" && route.request().method() === "POST") return route.fulfill({ status: 403, json: { error: "Acesso negado" } });
    if (pathname === "/api/locations") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/clinicas");
  await page.getByRole("button", { name: "NOVO LOCAL" }).click();
  const dialog = page.getByRole("dialog", { name: "NOVO LOCAL" });
  await dialog.getByLabel("Nome *", { exact: true }).fill("Novo local");
  await dialog.getByLabel("Empresa responsável pelo local *").click();
  await page.getByRole("option", { name: "Empresa Alfa" }).click();
  await dialog.getByRole("button", { name: "SALVAR LOCAL" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível salvar o local");
});
