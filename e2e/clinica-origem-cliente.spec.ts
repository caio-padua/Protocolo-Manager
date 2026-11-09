import { test, expect, type BrowserContext } from "@playwright/test";

async function setup(context: BrowserContext, failClinics = false) {
  const client = {
    id: 42, name: "Cliente Sintético", cpf: "12345678901", email: "cliente@example.invalid",
    phone: "11999999999", status: "active", locationId: 30, clinicaOrigemEmpresaId: 5,
    preferredAgendaResourceIds: [], birthDate: null, address: null, notes: null,
    visitPreferencesRevision: 1,
    visitPreferences: { medical: { weekdays: [], times: [] }, nursing: { weekdays: [], times: [] } },
    createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z",
  };
  const state = { payload: null as Record<string, unknown> | null, client };
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 101, name: "Profissional Sintético", role: "admin" }));
  });
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/collaborator/me") return json({ professional: { id: 101, name: "Profissional Sintético", role: "admin" } });
    if (path === "/api/clients/42" && method === "GET") return json(state.client);
    if (path === "/api/clients/42" && (method === "PUT" || method === "PATCH")) {
      state.payload = route.request().postDataJSON();
      state.client = { ...state.client, ...state.payload };
      return json(state.client);
    }
    if (path === "/api/clients/clinicas-origem") {
      if (failClinics) return json({ error: "Indisponível" }, 503);
      await new Promise(resolve => setTimeout(resolve, 150));
      return json({ empresaAtualId: 5, clinicas: [
        { id: 5, nome: "Clínica Sintética A", nick: "A", razaoSocial: "CLÍNICA A LIMITADA" },
        { id: 6, nome: "Clínica Sintética B", nick: "B", razaoSocial: "CLÍNICA B LIMITADA" },
      ] });
    }
    if (path === "/api/locations") return json([{ id: 30, name: "Local sintético", active: true }]);
    if (path === "/api/agenda/resources") return json([]);
    if (path === "/api/clients/visit-preference-options") return json({
      medical: { days: [], mismatchedResources: [] }, nursing: { days: [], mismatchedResources: [] },
    });
    return json([]);
  });
  return state;
}

for (const [description, viewport] of [
  ["computador", { width: 1366, height: 900 }],
  ["celular", { width: 402, height: 874 }],
] as const) {
  test(`seleciona e relê a clínica de origem no ${description}`, async ({ context, page }) => {
    await page.setViewportSize(viewport);
    const state = await setup(context);
    await page.goto("/clients/42/edit");
    const field = page.getByLabel("Clínica de Origem");
    await expect(field).toContainText("Clínica Sintética A (CLÍNICA A LIMITADA)", { timeout: 20_000 });
    await field.click();
    const list = page.getByRole("listbox");
    const bounds = await list.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("option", { name: "Clínica Sintética B (CLÍNICA B LIMITADA)" }).click();
    await page.getByRole("button", { name: /salvar/i }).click();
    await expect.poll(() => state.payload).not.toBeNull();
    expect(state.payload?.clinicaOrigemEmpresaId).toBe(6);
    expect(state.payload?.clinicaOrigemEsperada).toBe(5);
    expect(state.payload).not.toHaveProperty("locationId");
    await page.goto("/clients/42/edit");
    await expect(page.getByLabel("Clínica de Origem")).toContainText("Clínica Sintética B (CLÍNICA B LIMITADA)");
  });
}

test("falha ao listar clínicas preserva o vínculo ao salvar outro campo", async ({ context, page }) => {
  const state = await setup(context, true);
  await page.goto("/clients/42/edit");
  await expect(page.getByText("Não foi possível carregar as clínicas.")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Nome Completo *").fill("Cliente Sintético Alterado");
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => state.payload).not.toBeNull();
  expect(state.payload).not.toHaveProperty("clinicaOrigemEmpresaId");
  expect(state.payload).not.toHaveProperty("locationId");
});

test("novo cadastro inicia com a empresa da sessão", async ({ context, page }) => {
  await setup(context);
  await page.goto("/clients/new");
  await expect(page.getByLabel("Clínica de Origem")).toContainText("Clínica Sintética A (CLÍNICA A LIMITADA)", { timeout: 20_000 });
});
