import { test, expect, type BrowserContext } from "@playwright/test";

async function setup(context: BrowserContext, options: { resourcesFail?: boolean; visitOptionsFail?: boolean; stale?: boolean } = {}) {
  const client = {
    id: 42, name: "Cliente Sintético", cpf: "12345678901", email: "cliente@example.invalid",
    phone: "11999999999", status: "active", locationId: 8, preferredAgendaResourceIds: [11],
    birthDate: null, address: null, notes: null, createdAt: "2026-01-01T12:00:00Z",
    updatedAt: "2026-01-01T12:00:00Z",
    visitPreferencesRevision: 7,
    visitPreferences: {
      medical: { weekdays: [1], times: [{ weekday: 1, time: "09:00" }] },
      nursing: { weekdays: [], times: [] },
    },
  };
  const professional = { id: 101, name: "Profissional Sintético", role: "admin" };
  const state = { reads: 0, payload: null as Record<string, unknown> | null };
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 101, name: "Profissional Sintético", role: "admin" }));
  });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/collaborator/me") return json({ professional });
    if (path === "/api/clients/42" && method === "GET") { state.reads++; return json(client); }
    if (path === "/api/clients/42" && (method === "PUT" || method === "PATCH")) {
      state.payload = route.request().postDataJSON();
      if (options.stale) return json({ error: "A preferência mudou." }, 409);
      return json({ ...client, ...state.payload });
    }
    if (path === "/api/clients/visit-preference-options") {
      if (options.visitOptionsFail) return json({ error: "Indisponível" }, 503);
      return json({
        medical: { days: [{ weekday: 1, times: ["09:00", "10:00"] }], mismatchedResources: [] },
        nursing: { days: [{ weekday: 1, times: ["09:00", "09:20"] }], mismatchedResources: [] },
      });
    }
    if (path === "/api/locations") return json([{ id: 8, name: "Local sintético" }]);
    if (path === "/api/agenda/resources") {
      if (options.resourcesFail) return json({ error: "Indisponível" }, 503);
      return json([
        { id: 11, name: "Agenda sintética A", locationId: 8, active: true, sortOrder: 1 },
        { id: 12, name: "Agenda sintética B", locationId: 8, active: true, sortOrder: 2 },
      ]);
    }
    return json([]);
  });
  return state;
}

test("falha ao carregar agendas não apaga a seleção ao editar outro dado", async ({ context, page }) => {
  const state = await setup(context, { resourcesFail: true });
  await page.goto("/clients/42/edit");
  await expect(page.getByText("Não foi possível carregar as agendas. Suas seleções anteriores foram preservadas.")).toBeVisible({ timeout: 20_000 });
  const name = page.getByLabel("Nome Completo *");
  await name.fill("Cliente Sintético Atualizado");
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => state.payload).not.toBeNull();
  expect(state.payload).not.toHaveProperty("preferredAgendaResourceIds");
  expect(state.payload).not.toHaveProperty("locationId");
});

test("salva dia e horário de enfermagem sem alterar consulta", async ({ context, page }) => {
  const state = await setup(context);
  await page.goto("/clients/42/edit");
  const days = page.getByRole("group", { name: "Dias preferenciais — enfermagem" });
  await days.getByRole("button", { name: "Segunda" }).click();
  const times = page.getByRole("group", { name: "Horários de Segunda — enfermagem" });
  await times.getByRole("button", { name: "09:20" }).click();
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => state.payload).not.toBeNull();
  expect(state.payload?.visitPreferencesRevision).toBe(7);
  expect(state.payload?.visitPreferences).toEqual({
    medical: { weekdays: [1], times: [{ weekday: 1, time: "09:00" }] },
    nursing: { weekdays: [1], times: [{ weekday: 1, time: "09:20" }] },
  });
});

test("falha nas opções preserva preferências salvas e não as envia sem alteração", async ({ context, page }) => {
  const state = await setup(context, { visitOptionsFail: true });
  await page.goto("/clients/42/edit");
  await expect(page.getByText(/As preferências já registradas foram preservadas/)).toBeVisible();
  const medical = page.getByRole("group", { name: "Dias preferenciais — consultas" });
  await expect(medical.getByRole("button", { name: "Segunda" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Nome Completo *").fill("Cliente Sintético Atualizado");
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => state.payload).not.toBeNull();
  expect(state.payload).not.toHaveProperty("visitPreferences");
});

test("conflito de versão não apaga a seleção ainda não salva", async ({ context, page }) => {
  const state = await setup(context, { stale: true });
  await page.goto("/clients/42/edit");
  await page.getByRole("group", { name: "Dias preferenciais — enfermagem" }).getByRole("button", { name: "Segunda" }).click();
  const time = page.getByRole("group", { name: "Horários de Segunda — enfermagem" }).getByRole("button", { name: "09:20" });
  await time.click();
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => state.payload).not.toBeNull();
  await expect(page.getByText(/Não foi possível salvar o cadastro/)).toBeVisible();
  await expect(time).toHaveAttribute("aria-pressed", "true");
});

test("releitura do cliente não apaga escolhas que ainda não foram salvas", async ({ context, page }) => {
  const state = await setup(context);
  await page.goto("/clients/42/edit");
  const agenda = page.getByRole("button", { name: "Agenda sintética B" });
  await expect(agenda).toBeVisible();
  await agenda.click();
  await expect(agenda).toHaveAttribute("aria-pressed", "true");
  const previous = state.reads;
  // Dispara a releitura como numa reconexão sem interromper o carregamento
  // independente da biblioteca de autenticação hospedada fora do aplicativo.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => state.reads).toBeGreaterThan(previous);
  await expect(agenda).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => state.payload).not.toBeNull();
  expect(state.payload?.preferredAgendaResourceIds).toEqual([11, 12]);
});

test("lista não confunde sessão ausente com ausência de clientes", async ({ context, page }) => {
  await context.route("**/api/**", async route => route.fulfill({
    status: 401, contentType: "application/json", body: JSON.stringify({ error: "Não autorizado" }),
  }));
  await page.goto("/clients");
  await expect(page.getByRole("alert")).toContainText("Entre com seu acesso profissional");
  await expect(page.getByText("Nenhum cliente encontrado")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ENTRAR", exact: true })).toBeVisible();
});

test("cadastro informa ausência de acesso em vez de afirmar que cliente não existe", async ({ context, page }) => {
  await context.route("**/api/**", async route => route.fulfill({
    status: 401, contentType: "application/json", body: JSON.stringify({ error: "Não autorizado" }),
  }));
  await page.goto("/clients/42/edit");
  await expect(page.getByRole("alert")).toContainText("Entre com seu acesso profissional");
  await expect(page.getByText("Cliente não encontrado")).toHaveCount(0);
});

for (const viewport of [{ name: "computador", width: 1280, height: 900 }, { name: "celular", width: 390, height: 844 }]) {
  test(`preferências são utilizáveis no ${viewport.name}`, async ({ context, page }) => {
    await setup(context);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/clients/42/edit");
    const section = page.getByRole("region", { name: "Preferências para visitas à clínica" });
    await expect(section.getByRole("group", { name: "Dias preferenciais — enfermagem" })).toBeVisible();
    await section.getByRole("group", { name: "Dias preferenciais — enfermagem" }).getByRole("button", { name: "Segunda" }).click();
    await expect(section.getByRole("button", { name: "09:20" })).toBeVisible();
    expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await section.screenshot({ path: `generated-artifacts/preferencias-visitas-${viewport.name}.png` });
  });
}
