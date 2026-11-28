import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
  test(`local leva ao editor único da empresa vinculada em ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "sessao-sintetica");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
    });
    const calls: string[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      calls.push(url.pathname);
      if (route.request().method() !== "GET") return route.fulfill({ status: 409, json: { error: "bloqueado no teste" } });
      if (url.pathname === "/api/collaborator/me") {
        await route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
      } else if (url.pathname === "/api/locations") {
        await route.fulfill({ json: [{ id: 11, name: "Local sintético", type: "clinic", active: true, color: "#16284a", empresaId: 21, empresaNome: "Empresa sintética" }] });
      } else if (url.pathname === "/api/locations/google/agendas") {
        await route.fulfill({ json: { agendas: [] } });
      } else if (url.pathname === "/api/empresas") {
        await route.fulfill({ json: [{ id: 21, nome: "Empresa sintética", tipo: "clinic", status: "ATIVO", ativa: true, modulosAtivos: {} }, { id: 11, nome: "Empresa homônima do id do local", tipo: "clinic", status: "ATIVO", ativa: true, modulosAtivos: {} }] });
      } else if (url.pathname === "/api/semantic-codes/locations") {
        await route.fulfill({ json: [{ locationId: 11, empresaId: 21 }] });
      } else if (url.pathname === "/api/semantic-codes/companies") {
        await route.fulfill({ json: [{ id: 21, nome: "Empresa sintética" }] });
      } else if (url.pathname === "/api/paxmed-2b/empresas/21") {
        expect(route.request().headers()["x-empresa-id"]).toBe("21");
        await route.fulfill({ json: { identidade: { nomeCabecalho: "Empresa sintética", rodapeLinha1: "Primeira", rodapeLinha2: "Segunda", rodapeLinha3: "Terceira", versao: 1 } } });
      } else if (url.pathname === "/api/paxmed-2b/empresas/21/simbolo") {
        await route.fulfill({ status: 200, contentType: "image/png", body: readFileSync(path.resolve("artifacts/padcom/src/assets/padua-dp-mask.png")) });
      } else if (/\/(cargos|colaboradores|contratos|locais)$/.test(url.pathname)) {
        await route.fulfill({ json: [] });
      } else {
        await route.fulfill({ json: {} });
      }
    });
    await page.goto("/cadastros/clinicas");
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "EDITAR LOCAL" });
    await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
    // Nenhum editor duplicado no local
    await expect(dialog.getByRole("region", { name: "Identidade nos documentos — Modelo 2B" })).toHaveCount(0);
    await expect(dialog.getByText("Empresa vinculada: Empresa sintética")).toBeVisible();
    expect(calls.filter((c) => c.startsWith("/api/paxmed-2b/"))).toEqual([]);

    // Alteração pendente no local: recusar mantém a janela e os dados
    await dialog.getByRole("button", { name: "Identificação" }).click();
    await dialog.getByPlaceholder("Ex: Instituto Padua — Tatuapé").fill("Alteração não salva");
    await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
    page.once("dialog", (confirmation) => confirmation.dismiss());
    await dialog.getByTestId("local-abrir-identidade-empresa").click();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/cadastros\/clinicas/);
    await dialog.getByRole("button", { name: "Identificação" }).click();
    await expect(dialog.getByPlaceholder("Ex: Instituto Padua — Tatuapé")).toHaveValue("Alteração não salva");

    // Aceitar abre a empresa exata (21, não o id do local 11) na aba de identidade
    await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByTestId("local-abrir-identidade-empresa").click();
    await expect(page).toHaveURL(/\/cadastros\/empresas\?empresa=21&aba=marca-documento/);
    const empresa = page.getByTestId("empresa-dialogo");
    await expect(empresa.getByTestId("empresa-dialogo-identificacao")).toContainText("Empresa sintética");
    const identity = empresa.getByRole("region", { name: "Identidade nos documentos — Modelo 2B" });
    await expect(identity.getByLabel("Nome no cabeçalho")).toHaveValue("Empresa sintética");
    expect(calls).not.toContain("/api/paxmed-2b/empresas/11");
    await page.screenshot({ path: `generated-artifacts/clinica-identidade-${viewport.width}.png` });
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
    if (pathname === "/api/locations/google/agendas") return route.fulfill({ json: { agendas: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/clinicas");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "EDITAR LOCAL" });
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
    if (pathname === "/api/locations/google/agendas") return route.fulfill({ json: { agendas: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/clinicas");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "EDITAR LOCAL" });
  await dialog.getByRole("button", { name: "Identidade dos documentos" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível consultar o vínculo");
  await dialog.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível confirmar uma empresa vinculada");
  expect(tentativas).toBe(2);
});

test("recusa ao carregar identidade no editor único da empresa impede edição e salvamento", async ({ page }) => {
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
    if (pathname === "/api/empresas") return route.fulfill({ json: [{ id: 21, nome: "Empresa sintética", tipo: "clinic", status: "ATIVO", ativa: true, modulosAtivos: {} }] });
    if (/\/(cargos|colaboradores|contratos|locais)$/.test(pathname)) return route.fulfill({ json: [] });
    if (pathname === "/api/paxmed-2b/empresas/21") return route.fulfill({ status: 403, json: { error: "Acesso não autorizado." } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/empresas?empresa=21&aba=marca-documento");
  const dialog = page.getByTestId("empresa-dialogo");
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
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar os locais");
  await expect(page.getByText("Nenhum local cadastrado", { exact: false })).toHaveCount(0);
});
