import { expect, test } from "@playwright/test";

test("a tela reúne as ferramentas sem perder a busca ao recolher", async ({ page, context }) => {
  let writes = 0;
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Profissional sintético", role: "medico" }));
  });
  await context.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") writes++;
    const path = new URL(route.request().url()).pathname;
    const professional = { id: 1, name: "Profissional sintético", role: "medico", category: "medico", isPlatformOwner: true };
    let body: unknown = [];
    if (path === "/api/collaborator/me") body = { professional };
    if (path === "/api/settings/governanca") body = { matriz: {} };
    if (path === "/api/menu") body = { modulos: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/cadastros/cadastro-exames");
  const search = page.getByPlaceholder("Buscar exame...");
  await expect(search).toBeVisible();
  await search.fill("teste sintético");
  await page.getByTestId("toggle-catalogo").click();
  await expect(search).toBeHidden();
  await page.getByTestId("toggle-catalogo").click();
  await expect(search).toHaveValue("teste sintético");
  await page.getByTestId("toggle-faixas").click();
  await expect(page.getByTestId("toggle-faixas")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("A edição das faixas nesta nova tela está bloqueada", { exact: false })).toBeVisible();
  await expect(page.getByText("A importação dos documentos de fichas e do compêndio", { exact: false })).toBeVisible();
  expect(writes).toBe(0);
});

test("recusa acesso quando os dados de permissão não chegam", async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 2, name: "Colaborador sintético", role: "enfermagem" }));
  });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/collaborator/me") {
      return route.fulfill({ json: { professional: { id: 2, name: "Colaborador sintético", role: "enfermagem", category: "enfermagem", isPlatformOwner: false } } });
    }
    if (path === "/api/settings/governanca") return route.fulfill({ status: 503, json: { error: "indisponível" } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/cadastros/cadastro-exames");
  await expect(page.getByRole("alert")).toContainText("Não foi possível autorizar");
  await expect(page.getByPlaceholder("Buscar exame...")).toHaveCount(0);
});

test("envia a sessão ao salvar um exame sintético", async ({ page, context }) => {
  let autorizacao: string | undefined;
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Profissional sintético", role: "medico" }));
  });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/cadastros/exames" && route.request().method() === "POST") {
      autorizacao = route.request().headers().authorization;
      return route.fulfill({ status: autorizacao === "Bearer sessao-sintetica" ? 201 : 401, json: { id: 1 } });
    }
    if (path === "/api/collaborator/me") {
      return route.fulfill({ json: { professional: { id: 1, name: "Profissional sintético", role: "medico", category: "medico", isPlatformOwner: true } } });
    }
    if (path === "/api/settings/governanca") return route.fulfill({ json: { matriz: {} } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/cadastros/cadastro-exames");
  await page.getByRole("button", { name: "Novo exame" }).click();
  await page.getByPlaceholder("EX: EXAMSANGUE0001").fill("SINTETICO01");
  await page.getByPlaceholder("Ex.: Hemograma completo").fill("Exame sintético");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => autorizacao).toBe("Bearer sessao-sintetica");
  await expect(page.getByText("Exame criado", { exact: true })).toBeVisible();
});
