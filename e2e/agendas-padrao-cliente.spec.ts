import { test, expect } from "@playwright/test";

test.setTimeout(90_000);

for (const viewport of [{ width: 1366, height: 900 }, { width: 402, height: 874 }]) {
  test(`agendas por tipo, gravação e releitura em ${viewport.width}`, async ({ context, page }) => {
    await page.setViewportSize(viewport);
    let client = {
      id: 42, name: "Cliente Sintético", cpf: "12345678901", email: "cliente@example.invalid",
      phone: "11999999999", status: "active", locationId: 30, clinicaOrigemEmpresaId: 5,
      agendaEnfermagemPadraoId: 23, agendaMedicoPadraoId: 22, preferredAgendaResourceIds: [],
      birthDate: null, address: null, notes: null, visitPreferencesRevision: 1,
      visitPreferences: { medical: { weekdays: [], times: [] }, nursing: { weekdays: [], times: [] } },
      createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z",
    };
    let payload: Record<string, unknown> | null = null;
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "sessao-sintetica");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 101, name: "Profissional", role: "admin" }));
    });
    await context.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (path === "/api/collaborator/me") return json({ professional: { id: 101, name: "Profissional", role: "admin" } });
      if (path === "/api/clients/42" && route.request().method() === "GET") return json(client);
      if (path === "/api/clients/42" && ["PUT", "PATCH"].includes(route.request().method())) {
        payload = route.request().postDataJSON();
        client = { ...client, ...payload };
        return json(client);
      }
      if (path === "/api/clients/clinicas-origem") return json({ empresaAtualId: 5, clinicas: [{ id: 5, nome: "Clínica A", nick: "A", razaoSocial: "CLÍNICA A" }] });
      if (path === "/api/clients/agenda-opcoes") return json({
        locais: [{ id: 30, name: "Local A" }, { id: 31, name: "Local B" }],
        agendas: [
          { id: 23, name: "Enfermagem local", kind: "enfermagem", locationId: 31 },
          { id: 19, name: "Enfermagem remoto", kind: "enfermagem", locationId: 31 },
          { id: 22, name: "Médico local", kind: "medico", locationId: 30 },
          { id: 24, name: "Médico remoto", kind: "medico", locationId: 30 },
        ],
        enfermagemPadraoId: 23, medicoPadraoId: 22,
      });
      if (path === "/api/agenda/resources") return json([]);
      if (path === "/api/clients/visit-preference-options") return json({ medical: { days: [], mismatchedResources: [] }, nursing: { days: [], mismatchedResources: [] } });
      return json([]);
    });
    await page.goto("/clients/42/edit");
    const nursing = page.getByLabel("Agenda da enfermagem padrão");
    await expect(nursing).toContainText("Enfermagem local", { timeout: 20_000 });
    await nursing.click();
    await expect(page.getByRole("option", { name: "Enfermagem remoto" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Médico remoto" })).toHaveCount(0);
    const bounds = await page.getByRole("listbox").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("option", { name: "Enfermagem remoto" }).click();
    await page.getByLabel("Agenda do médico padrão").click();
    await expect(page.getByRole("option", { name: "Enfermagem remoto" })).toHaveCount(0);
    await page.getByRole("option", { name: "Médico remoto" }).click();
    await page.getByRole("button", { name: /salvar/i }).click();
    await expect.poll(() => payload).not.toBeNull();
    expect(payload).toMatchObject({ agendaEnfermagemPadraoId: 19, agendaEnfermagemEsperada: 23, agendaMedicoPadraoId: 24, agendaMedicoEsperada: 22, clinicaOrigemEsperada: 5 });
    expect(payload).not.toHaveProperty("locationId");
    await page.goto("/clients/42/edit");
    await expect(page.getByLabel("Agenda da enfermagem padrão")).toContainText("Enfermagem remoto");
    await expect(page.getByLabel("Agenda do médico padrão")).toContainText("Médico remoto");
  });
}

test("troca de sessão com acesso recusado não exibe listas antigas", async ({ context, page }) => {
  let allow = true;
  let payload: Record<string, unknown> | null = null;
  const client = {
    id: 42, name: "Cliente Sintético", cpf: "12345678901", email: "cliente@example.invalid",
    phone: "11999999999", status: "active", locationId: 30, clinicaOrigemEmpresaId: 5,
    agendaEnfermagemPadraoId: 23, agendaMedicoPadraoId: 22, preferredAgendaResourceIds: [],
    birthDate: null, address: null, notes: null, visitPreferencesRevision: 1,
    visitPreferences: { medical: { weekdays: [], times: [] }, nursing: { weekdays: [], times: [] } },
    createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z",
  };
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 101, name: "Profissional", role: "admin" }));
  });
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/collaborator/me") return json({ professional: { id: 101, name: "Profissional", role: "admin" } });
    if (path === "/api/clients/42" && route.request().method() === "GET") return json(client);
    if (path === "/api/clients/42" && ["PUT", "PATCH"].includes(route.request().method())) {
      payload = route.request().postDataJSON();
      return json({ ...client, ...payload });
    }
    if (path === "/api/clients/clinicas-origem") return json({ empresaAtualId: 5, clinicas: [{ id: 5, nome: "Clínica A", nick: "A", razaoSocial: "CLÍNICA A" }] });
    if (path === "/api/clients/agenda-opcoes") {
      if (!allow) return json({ error: "Não autorizado" }, 403);
      return json({ locais: [{ id: 30, name: "Local A" }], agendas: [
        { id: 23, name: "Enfermagem local", kind: "enfermagem", locationId: 30 },
        { id: 22, name: "Médico local", kind: "medico", locationId: 30 },
      ], enfermagemPadraoId: 23, medicoPadraoId: 22 });
    }
    if (path === "/api/agenda/resources") return json([]);
    if (path === "/api/clients/visit-preference-options") return json({ medical: { days: [], mismatchedResources: [] }, nursing: { days: [], mismatchedResources: [] } });
    return json([]);
  });
  await page.goto("/clients/42/edit", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Agenda da enfermagem padrão")).toContainText("Enfermagem local", { timeout: 30_000 });
  allow = false;
  await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
  await expect(page.getByText(/Não foi possível carregar as agendas desta clínica/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Agenda da enfermagem padrão")).toBeDisabled();
  await expect(page.getByLabel("Agenda da enfermagem padrão")).not.toContainText("Enfermagem local");
  await page.getByLabel("Nome Completo *").fill("Cliente Sintético Atualizado");
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => payload).not.toBeNull();
  expect(payload).not.toHaveProperty("agendaEnfermagemPadraoId");
  expect(payload).not.toHaveProperty("agendaMedicoPadraoId");
});
