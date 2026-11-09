import { test, expect, type BrowserContext } from "@playwright/test";

async function setup(context: BrowserContext, options: { resourcesFail?: boolean; visitOptionsFail?: boolean; stale?: boolean; multiDay?: boolean } = {}) {
  const client = {
    id: 42, name: "Cliente Sintético", cpf: "12345678901", email: "cliente@example.invalid",
    phone: "11999999999", status: "active", locationId: 8, clinicaOrigemEmpresaId: 5, preferredAgendaResourceIds: [11],
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
        nursing: { days: [
          { weekday: 1, times: ["09:00", "09:20"] },
          ...(options.multiDay ? [{ weekday: 3, times: ["10:00"] }, { weekday: 5, times: ["11:20"] }] : []),
        ], mismatchedResources: [] },
      });
    }
    if (path === "/api/locations") return json([{ id: 8, name: "Local sintético" }]);
    if (path === "/api/clients/clinicas-origem") return json({
      empresaAtualId: 5, clinicas: [{ id: 5, nome: "Clínica Sintética", nick: null, razaoSocial: "CLÍNICA SINTÉTICA" }],
    });
    if (path === "/api/clients/agenda-opcoes") return json({
      locais: [{ id: 8, name: "Local sintético" }], agendas: [
        { id: 11, name: "Enfermagem Sintética", kind: "enfermagem", locationId: 8 },
        { id: 12, name: "Médico Sintético", kind: "medico", locationId: 8 },
      ],
      enfermagemPadraoId: null, medicoPadraoId: null,
    });
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
    nursing: { weekdays: [1], times: [{ weekday: 1, time: "09:20" }], priority: [{ weekday: 1, time: "09:20" }] },
  });
});

test("permite selecionar três dias e um horário diferente em cada dia", async ({ context, page }) => {
  const state = await setup(context, { multiDay: true });
  await page.goto("/clients/42/edit");
  const days = page.getByRole("group", { name: "Dias preferenciais — enfermagem" });
  for (const day of ["Segunda", "Quarta", "Sexta"]) await days.getByRole("button", { name: day }).click();
  for (const [day, time] of [["Segunda", "09:20"], ["Quarta", "10:00"], ["Sexta", "11:20"]]) {
    await page.getByRole("group", { name: `Horários de ${day} — enfermagem` }).getByRole("button", { name: time }).click();
  }
  const order = page.getByLabel("Ordem de preferência — enfermagem");
  await order.getByRole("button", { name: "Subir Sexta às 11:20" }).click();
  await order.getByRole("button", { name: "Subir Sexta às 11:20" }).click();
  await expect(order.getByText("1ª — Sexta às 11:20")).toBeVisible();
  await expect(order.getByText("2ª — Segunda às 09:20")).toBeVisible();
  await expect(order.getByText("3ª — Quarta às 10:00")).toBeVisible();
  await page.getByRole("region", { name: "Preferências para visitas à clínica" })
    .screenshot({ path: "generated-artifacts/preferencias-visitas-tres-dias.png" });
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => state.payload).not.toBeNull();
  expect(state.payload?.visitPreferences).toEqual({
    medical: { weekdays: [1], times: [{ weekday: 1, time: "09:00" }] },
    nursing: { weekdays: [1, 3, 5], times: [
      { weekday: 1, time: "09:20" },
      { weekday: 3, time: "10:00" },
      { weekday: 5, time: "11:20" },
    ], priority: [
      { weekday: 5, time: "11:20" },
      { weekday: 1, time: "09:20" },
      { weekday: 3, time: "10:00" },
    ] },
  });
});

test("escolha antiga sem ordem só recebe posição por ação explícita", async ({ context, page }) => {
  const state = await setup(context);
  await page.goto("/clients/42/edit");
  const order = page.getByLabel("Ordem de preferência — consultas");
  await expect(order.getByText("Nenhuma ordem definida.")).toBeVisible();
  await order.getByRole("button", { name: "Adicionar à ordem Segunda às 09:00" }).click();
  await expect(order.getByText("1ª — Segunda às 09:00")).toBeVisible();
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect.poll(() => state.payload).not.toBeNull();
  expect((state.payload?.visitPreferences as any).medical.priority).toEqual([{ weekday: 1, time: "09:00" }]);
});

test("ordem de três preferências permanece utilizável no celular", async ({ context, page }) => {
  await setup(context, { multiDay: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clients/42/edit");
  const days = page.getByRole("group", { name: "Dias preferenciais — enfermagem" });
  for (const day of ["Segunda", "Quarta", "Sexta"]) await days.getByRole("button", { name: day }).click();
  for (const [day, time] of [["Segunda", "09:20"], ["Quarta", "10:00"], ["Sexta", "11:20"]]) {
    await page.getByRole("group", { name: `Horários de ${day} — enfermagem` }).getByRole("button", { name: time }).click();
  }
  const order = page.getByLabel("Ordem de preferência — enfermagem");
  await order.getByRole("button", { name: "Subir Sexta às 11:20" }).click();
  await expect(order.getByText("2ª — Sexta às 11:20")).toBeVisible();
  expect(await order.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const label = await order.getByText("2ª — Sexta às 11:20").boundingBox();
  const action = await order.getByRole("button", { name: "Subir Sexta às 11:20" }).boundingBox();
  expect(label && action && label.y + label.height <= action.y).toBe(true);
  await order.screenshot({ path: "generated-artifacts/preferencias-ordenadas-celular.png" });
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
