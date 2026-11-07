import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
  test(`abre a identidade vinculada na clínica em ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "sessao-sintetica");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
    });
    const calls: string[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      calls.push(url.pathname);
      if (url.pathname === "/api/collaborator/me") {
        await route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
      } else if (url.pathname === "/api/locations") {
        await route.fulfill({ json: [{ id: 11, name: "Local sintético", type: "clinic", active: true, color: "#16284a" }] });
      } else if (url.pathname === "/api/semantic-codes/locations") {
        await route.fulfill({ json: [{ locationId: 11, empresaId: 21 }] });
      } else if (url.pathname === "/api/semantic-codes/companies") {
        await route.fulfill({ json: [{ id: 21, nome: "Empresa sintética" }] });
      } else if (url.pathname === "/api/paxmed-2b/empresas/21") {
        expect(route.request().headers()["x-empresa-id"]).toBe("21");
        await route.fulfill({ json: { identidade: { nomeCabecalho: "Empresa sintética", rodapeLinha1: "Primeira", rodapeLinha2: "Segunda", rodapeLinha3: "Terceira", versao: 1 } } });
      } else if (url.pathname === "/api/paxmed-2b/empresas/21/simbolo") {
        await route.fulfill({ status: 200, contentType: "image/png", body: readFileSync(path.resolve("artifacts/padcom/src/assets/padua-dp-mask.png")) });
      } else {
        await route.fulfill({ json: {} });
      }
    });
    await page.goto("/cadastros/clinicas");
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "EDITAR CLÍNICA" });
    await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
    const identity = dialog.getByRole("region", { name: "Identidade nos documentos — Modelo 2B" });
    await expect(identity.getByLabel("Nome no cabeçalho")).toHaveValue("Empresa sintética");
    await expect(dialog.getByText("Empresa vinculada: Empresa sintética")).toBeVisible();
    await expect(dialog.getByText("Uma identidade compartilhada pelos locais desta empresa.", { exact: false })).toBeVisible();
    await identity.getByLabel("Nome no cabeçalho").fill("Alteração não salva");
    await dialog.getByRole("button", { name: "Contato e agenda" }).click();
    await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
    await expect(identity.getByLabel("Nome no cabeçalho")).toHaveValue("Alteração não salva");
    expect(calls).not.toContain("/api/paxmed-2b/empresas/11");
    page.once("dialog", (confirmation) => confirmation.dismiss());
    await dialog.getByRole("button", { name: "CANCELAR" }).click();
    await expect(dialog).toBeVisible();
    await expect(identity.getByLabel("Nome no cabeçalho")).toHaveValue("Alteração não salva");
    await dialog.screenshot({ path: `generated-artifacts/clinica-identidade-${viewport.width}.png` });
  });
}

test("sem vínculo não escolhe empresa por suposição", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  const calls: string[] = [];
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    calls.push(pathname);
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/locations") return route.fulfill({ json: [{ id: 11, name: "Local sintético", type: "clinic", active: true, color: "#16284a" }] });
    if (pathname === "/api/semantic-codes/locations") return route.fulfill({ json: [] });
    if (pathname === "/api/semantic-codes/companies") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/clinicas");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "EDITAR CLÍNICA" });
  await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível confirmar uma empresa vinculada");
  expect(calls.filter((call) => call.startsWith("/api/paxmed-2b/empresas/"))).toEqual([]);
});

test("falha de rede permite nova tentativa sem supor ausência de vínculo", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  let tentativas = 0;
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/locations") return route.fulfill({ json: [{ id: 11, name: "Local sintético", type: "clinic", active: true, color: "#16284a" }] });
    if (pathname === "/api/semantic-codes/locations") {
      tentativas++;
      return tentativas === 1 ? route.fulfill({ status: 503, json: { error: "Falha temporária" } }) : route.fulfill({ json: [] });
    }
    if (pathname === "/api/semantic-codes/companies") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/clinicas");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "EDITAR CLÍNICA" });
  await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível consultar o vínculo");
  await dialog.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível confirmar uma empresa vinculada");
  expect(tentativas).toBe(2);
});

test("recusa ao carregar identidade impede edição e salvamento", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/locations") return route.fulfill({ json: [{ id: 11, name: "Local sintético", type: "clinic", active: true, color: "#16284a" }] });
    if (pathname === "/api/semantic-codes/locations") return route.fulfill({ json: [{ locationId: 11, empresaId: 21 }] });
    if (pathname === "/api/semantic-codes/companies") return route.fulfill({ json: [{ id: 21, nome: "Empresa sintética" }] });
    if (pathname === "/api/paxmed-2b/empresas/21") return route.fulfill({ status: 403, json: { error: "Acesso não autorizado." } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/clinicas");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "EDITAR CLÍNICA" });
  await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
  const identity = dialog.getByRole("region", { name: "Identidade nos documentos — Modelo 2B" });
  await expect(identity.getByRole("alert")).toContainText("Acesso não autorizado.");
  await expect(identity.getByLabel("Nome no cabeçalho")).toBeDisabled();
  await expect(identity.getByRole("button", { name: "Salvar identidade" })).toBeDisabled();
});

test("falha ao listar clínicas não é apresentada como cadastro vazio", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/locations") return route.fulfill({ status: 503, json: { error: "Falha temporária" } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/clinicas");
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar as clínicas");
  await expect(page.getByText("Nenhuma clínica cadastrada", { exact: false })).toHaveCount(0);
});
