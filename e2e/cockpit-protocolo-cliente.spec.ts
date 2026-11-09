import { expect, test, type Page } from "@playwright/test";

const clients = [
  { id: 42, name: "Cliente Alpha Teste", cpf: "", phone: "", photoUrl: null, birthDate: null, status: "active" },
  { id: 43, name: "Cliente Beta Teste", cpf: "", phone: "", photoUrl: null, birthDate: null, status: "active" },
];

async function isolatedServices(page: Page, options: { denyClient?: number; delayClient?: number; denyProtocols?: boolean; excludeFromList?: number; delayPost?: number; denyPulso?: boolean; identityControl?: { deny: boolean }; listControl?: { fail: boolean; status?: number }; clinicalControl?: { fail: boolean; type?: string }; substanceList?: Array<{ id: number; name: string; unit: string; color: string; procedureType: string; doctorParticipation: boolean | null }> } = {}) {
  const created: unknown[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "isolated-test-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Profissional Teste", role: "medico" }));
  });
  await page.route("**/api/**", async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(body),
    });
    if (pathname === "/api/collaborator/me") return options.listControl?.status === 401
      ? json({ error: "Sessão inválida" }, 401)
      : json({ professional: { id: 1, name: "Profissional Teste", role: "medico" } });
    if (pathname === "/api/clients") return options.listControl?.fail
      ? json({ error: "Serviço indisponível" }, options.listControl.status ?? 503)
      : json(clients.filter(c => c.id !== options.excludeFromList));
    if (/^\/api\/clinical-context\/\d+$/.test(pathname)) {
      if (options.clinicalControl?.fail) return json({ error: "Identidade indisponível" }, 503);
      const id = Number(pathname.split("/").at(-1));
      return json({ client: clients.find(c => c.id === id), professional: { id: 3, name: "Médico Teste", crm: "123", uf: "SP", professionalType: options.clinicalControl?.type ?? "medico" }, clinic: { id: 5, empresaId: 1, name: "Clínica Teste" }, canPrescribe: true, canRequestExams: true, canPreparePrescription: true, canPrepareExamRequest: true, responsibleDoctorName: "Médico Teste", issue: null });
    }
    if (/^\/api\/clients\/\d+$/.test(pathname)) {
      const id = Number(pathname.split("/").at(-1));
      if (id === options.delayClient) await new Promise(resolve => setTimeout(resolve, 1500));
      if (id === options.denyClient || (id === 42 && options.identityControl?.deny)) return json({ error: "Acesso negado" }, 403);
      return json(clients.find(c => c.id === id) ?? { error: "Não encontrado" });
    }
    if (pathname === "/api/professionals") return json([{ id: 3, name: "Médico Teste", crm: "123", specialty: null }]);
    if (pathname.startsWith("/api/pulso-diario/") && options.denyPulso) return json({ error: "Indisponível" }, 503);
    if (pathname === "/api/locations") return json([{ id: 5, name: "Local Teste", color: "#88aa88", type: "clinic" }]);
    if (pathname === "/api/substances") return json(options.substanceList ?? [{ id: 7, name: "Substância Teste", unit: "mg", color: "#abcabc", procedureType: "im" }]);
    if (pathname === "/api/google-drive/setup-client/42" && options.identityControl) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      options.identityControl.deny = true;
      return json({ ok: true });
    }
    if (pathname === "/api/protocols" && request.method() === "POST") {
      created.push(request.postDataJSON());
      if (options.delayPost) await new Promise(resolve => setTimeout(resolve, options.delayPost));
      return json({ id: 99 }, 201);
    }
    if (pathname === "/api/protocols" && options.denyProtocols) return json({ error: "Acesso negado" }, 403);
    return json([]);
  });
  return created;
}

test("participação médica acompanha a substância e não promete reserva", async ({ page }) => {
  const substanceList = [
    { id: 7, name: "Substância A", unit: "mg", color: "#abcabc", procedureType: "im", doctorParticipation: true },
    { id: 8, name: "Substância B", unit: "mg", color: "#abcabc", procedureType: "im", doctorParticipation: false },
    { id: 9, name: "Substância C", unit: "mg", color: "#abcabc", procedureType: "im", doctorParticipation: null },
  ];
  await isolatedServices(page, { substanceList });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await form.getByRole("combobox").filter({ hasText: "Selecione o local" }).click();
  await page.getByRole("option", { name: /Local Teste/ }).click();
  await form.getByRole("combobox").filter({ hasText: "Escolha a substância" }).click();
  await page.getByRole("option", { name: /Substância A/ }).click();
  await expect(form.getByText("Participação médica:", { exact: true }).locator("..")).toContainText("Sim, participa");
  await form.getByRole("combobox").filter({ hasText: "Substância A" }).click();
  await page.getByRole("option", { name: /Substância B/ }).click();
  await expect(form.getByText("Participação médica:", { exact: true }).locator("..")).toContainText("Não participa");
  await form.getByRole("combobox").filter({ hasText: "Substância B" }).click();
  await page.getByRole("option", { name: /Substância C/ }).click();
  await expect(form.getByText("Participação médica:", { exact: true }).locator("..")).toContainText("Ainda não definida");
  await form.getByPlaceholder("Ex: 600mg, 15g").fill("1 mg");
  await form.getByRole("button", { name: "Ver Resumo" }).click();
  await expect(form.getByText("Participação médica:", { exact: true }).locator("..")).toContainText("Ainda não definida");
  await expect(form.getByText("As sessões geradas ainda não reservam horários", { exact: false })).toBeVisible();
});

test("abre o formulário existente sem sair do cliente e preserva as abas", async ({ page }) => {
  const created = await isolatedServices(page);
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await expect(form).toBeVisible();
  await expect(form.getByText("Cliente Alpha Teste")).toBeVisible();
  await expect(form.getByText("Dados Gerais")).toBeVisible();
  await expect(form.getByText("Selecionar cliente…")).toHaveCount(0);
  await expect(page).toHaveURL(/\/cockpit\/42\/protocolos$/);
  await form.getByPlaceholder("Deixe vazio para gerar automaticamente").fill("Preenchimento a preservar");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("navigation", { name: "Abas do cockpit" }).getByRole("button", { name: /Injetáveis/i }).click();
  await expect(form.getByPlaceholder("Deixe vazio para gerar automaticamente")).toHaveValue("Preenchimento a preservar");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "FECHAR CADASTRO" }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole("navigation", { name: "Abas do cockpit" }).getByRole("button", { name: /Injetáveis/i }).click();
  await expect(page).toHaveURL(/\/cockpit\/42\/injetaveis$/);
  await page.getByRole("button", { name: /Lançar novo protocolo/i }).first().click();
  await expect(page).toHaveURL(/\/cockpit\/42\/protocolos$/);
  await expect(form.getByText("Cliente Alpha Teste")).toBeVisible();
  expect(created).toHaveLength(0);
});

test("falha na lista de clientes pode ser recuperada sem recarregar a página", async ({ page }) => {
  const listControl = { fail: true };
  await isolatedServices(page, { listControl });
  await page.goto("/cockpit");
  const aviso = page.getByRole("alert").filter({ hasText: "Não foi possível carregar a lista de clientes." });
  await expect(aviso).toBeVisible();
  await expect(page.getByRole("button", { name: "Selecionar cliente…" })).toBeDisabled();
  listControl.fail = false;
  await aviso.getByRole("button", { name: "Tentar novamente" }).click();
  await page.getByRole("button", { name: "Selecionar cliente…" }).click();
  await page.getByRole("button", { name: /Cliente Alpha Teste/ }).click();
  await expect(page).toHaveURL(/\/cockpit\/42\/prescricao$/);
  await expect(page.getByRole("region", { name: "Identificação do cliente" })).toBeVisible();
});

test("sessão recusada oferece entrada e preserva o destino", async ({ page }) => {
  await isolatedServices(page, { listControl: { fail: true, status: 401 } });
  await page.goto("/cockpit");
  const aviso = page.getByRole("alert").filter({ hasText: "Seu acesso precisa ser confirmado" });
  await expect(aviso).toBeVisible();
  await expect(page.getByRole("button", { name: "Selecionar cliente…" })).toBeDisabled();
  await aviso.getByRole("button", { name: "Entrar no sistema" }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcockpit/);
});

test("o protocolo usa o médico autenticado e bloqueia enquanto a identidade falha", async ({ page }) => {
  const clinicalControl = { fail: true };
  await isolatedServices(page, { clinicalControl });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await expect(form.getByText("Não foi possível confirmar o profissional.", { exact: false })).toBeVisible();
  await expect(form.getByLabel("Médico autenticado")).toHaveCount(0);
  await expect(form.getByRole("combobox").filter({ hasText: "Selecione o médico" })).toHaveCount(0);
  clinicalControl.fail = false;
  await form.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(form.getByLabel("Médico autenticado")).toContainText("Médico Teste");
  await expect(form.getByRole("combobox").filter({ hasText: "Selecione o médico" })).toHaveCount(0);
});

test("profissional não médico conserva a escolha do responsável", async ({ page }) => {
  await isolatedServices(page, { clinicalControl: { fail: false, type: "enfermagem" } });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await expect(form.getByRole("combobox").filter({ hasText: "Selecione o médico" })).toBeVisible();
  await expect(form.getByLabel("Médico autenticado")).toHaveCount(0);
});

test("resumo bloqueia lançamento quando a identidade deixa de ser confirmada", async ({ page }) => {
  const clinicalControl = { fail: false };
  const created = await isolatedServices(page, { clinicalControl });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await expect(form.getByLabel("Médico autenticado")).toBeVisible();
  await form.getByRole("combobox").filter({ hasText: "Selecione o local" }).click();
  await page.getByRole("option", { name: /Local Teste/ }).click();
  await form.getByRole("combobox").filter({ hasText: "Escolha a substância" }).click();
  await page.getByRole("option", { name: /Substância Teste/ }).click();
  await form.getByPlaceholder("Ex: 600mg, 15g").fill("1 mg");
  await form.getByRole("button", { name: "Ver Resumo" }).click();
  clinicalControl.fail = true;
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  const aviso = form.getByRole("alert").filter({ hasText: "O lançamento está bloqueado." });
  await expect(aviso).toBeVisible();
  await expect(form.getByRole("button", { name: /Confirmar e Lançar Protocolo/ })).toBeDisabled();
  expect(created).toHaveLength(0);
  clinicalControl.fail = false;
  await aviso.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(form.getByRole("button", { name: /Confirmar e Lançar Protocolo/ })).toBeEnabled();
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`tema do cockpit alterna e persiste na largura ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await isolatedServices(page);
    await page.goto("/cockpit/42/protocolos");
    const cockpit = page.locator(".cc-shell");
    await expect(cockpit).not.toHaveClass(/dark/);
    const corClara = await page.locator(".cc-header").evaluate(el => getComputedStyle(el).backgroundImage);
    await page.getByRole("button", { name: "Mudar para tema escuro" }).click();
    await expect(cockpit).toHaveClass(/dark/);
    const corEscura = await page.locator(".cc-header").evaluate(el => getComputedStyle(el).backgroundImage);
    expect(corEscura).not.toBe(corClara);
    await expect(page.getByRole("region", { name: "Identificação do cliente" })).toContainText("Cliente Alpha Teste");
    await page.reload();
    await expect(cockpit).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Mudar para tema claro" }).click();
    await expect(cockpit).not.toHaveClass(/dark/);
  });
}

test("falha do pulso não é apresentada como ausência de registros", async ({ page }) => {
  await isolatedServices(page, { denyPulso: true });
  await page.goto("/cockpit/42/protocolos");
  await expect(page.getByText("Não foi possível consultar o pulso diário.", { exact: false })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Sem registros do cliente ainda.")).toHaveCount(0);
});

test("recusa de acesso desmonta formulário anterior mesmo após recuperar", async ({ page }) => {
  const identityControl = { deny: false };
  await isolatedServices(page, { identityControl });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await form.getByPlaceholder("Deixe vazio para gerar automaticamente").fill("Texto protegido anterior");
  await page.getByRole("button", { name: /PASTAS DO DRIVE/ }).click();
  await expect(page.getByText("Não foi possível confirmar o cliente ou seu acesso", { exact: false })).toBeVisible();
  await expect(form).toHaveCount(0);
  identityControl.deny = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  await expect(form.getByPlaceholder("Deixe vazio para gerar automaticamente")).toHaveValue("");
});

test("o formulário mostra a identidade confirmada mesmo fora da lista geral", async ({ page }) => {
  await isolatedServices(page, { excludeFromList: 43 });
  await page.goto("/cockpit/43/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  await expect(page.getByRole("region", { name: "Cadastro de protocolo" }).getByText("Cliente Beta Teste")).toBeVisible();
});

test("recusa clínica nos protocolos não aparece como lista vazia nem abre o formulário", async ({ page }) => {
  await isolatedServices(page, { denyProtocols: true });
  await page.goto("/cockpit/42/protocolos");
  await expect(page.getByRole("alert").getByText("Não foi possível consultar os protocolos", { exact: false })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Nenhum protocolo cadastrado.")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Abas do cockpit" }).getByRole("button", { name: /Protocolos/i }).click();
  await expect(page.getByRole("region", { name: "Cadastro de protocolo" })).toHaveCount(0);
});

test("durante a criação protege abas, menu, histórico e fechamento", async ({ page }) => {
  const created = await isolatedServices(page, { delayPost: 7000 });
  await page.goto("/cockpit/42/injetaveis");
  await page.getByRole("button", { name: /Lançar novo protocolo/i }).first().click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await expect(form.getByLabel("Médico autenticado")).toContainText("Médico Teste");
  await form.getByRole("combobox").filter({ hasText: "Selecione o local" }).click();
  await page.getByRole("option", { name: /Local Teste/ }).click();
  await form.getByRole("combobox").filter({ hasText: "Escolha a substância" }).click();
  await page.getByRole("option", { name: /Substância Teste/ }).click();
  await form.getByPlaceholder("Ex: 600mg, 15g").fill("1 mg");
  await form.getByRole("button", { name: "Ver Resumo" }).click();
  await form.getByRole("button", { name: /Confirmar e Lançar Protocolo/ }).click();
  await expect.poll(() => created.length).toBe(1);
  await expect(page.getByRole("button", { name: "FECHAR CADASTRO" })).toBeDisabled();
  await page.getByRole("navigation", { name: "Abas do cockpit" }).getByRole("button", { name: /Injetáveis/i }).click();
  await expect(page).toHaveURL(/\/cockpit\/42\/protocolos$/);
  await page.evaluate(() => history.back());
  await expect(page.getByText("Aguarde a conclusão do protocolo antes de sair desta tela.")).toBeVisible();
  await expect(page).toHaveURL(/\/cockpit\/42\/protocolos$/);
  await expect(form.getByText("Resumo do Protocolo")).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/cockpit\/42\/protocolos$/);
  await expect(form).toHaveCount(0, { timeout: 15000 });
  expect(created).toHaveLength(1);
});

test("erro de identidade durante o envio não interrompe nem duplica a criação", async ({ page }) => {
  const identityControl = { deny: false };
  const created = await isolatedServices(page, { delayPost: 7000, identityControl });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await expect(form.getByLabel("Médico autenticado")).toContainText("Médico Teste");
  await form.getByRole("combobox").filter({ hasText: "Selecione o local" }).click();
  await page.getByRole("option", { name: /Local Teste/ }).click();
  await form.getByRole("combobox").filter({ hasText: "Escolha a substância" }).click();
  await page.getByRole("option", { name: /Substância Teste/ }).click();
  await form.getByPlaceholder("Ex: 600mg, 15g").fill("1 mg");
  await form.getByRole("button", { name: "Ver Resumo" }).click();
  await page.getByRole("button", { name: /PASTAS DO DRIVE/ }).click();
  await form.getByRole("button", { name: /Confirmar e Lançar Protocolo/ }).click();
  await expect.poll(() => created.length).toBe(1);
  await expect(page.getByText("Não foi possível confirmar o cliente ou seu acesso", { exact: false })).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(page.getByText("Protocolo lançado!", { exact: true })).toBeVisible({ timeout: 12000 });
  identityControl.deny = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true })).toBeVisible();
  expect(created).toHaveLength(1);
});

test("a aba de protocolos e implantes abrem para o cliente da rota", async ({ page }) => {
  await isolatedServices(page);
  await page.goto("/cockpit/43/implantes");
  await page.getByRole("button", { name: /Lançar novo protocolo/i }).first().click();
  await expect(page).toHaveURL(/\/cockpit\/43\/protocolos$/);
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await expect(form.getByText("Cliente Beta Teste")).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "FECHAR CADASTRO" }).click();
  await page.getByRole("navigation", { name: "Abas do cockpit" }).getByRole("button", { name: /Cadastro/i }).click();
  await page.getByRole("navigation", { name: "Abas do cockpit" }).getByRole("button", { name: /Protocolos/i }).click();
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  await expect(page).toHaveURL(/\/cockpit\/43\/protocolos$/);
  await expect(form.getByText("Cliente Beta Teste")).toBeVisible();
  await expect(form.getByText("Cliente Alpha Teste")).toHaveCount(0);
});

test("criação simulada envia o identificador do cliente e permanece no Cockpit", async ({ page }) => {
  const created = await isolatedServices(page);
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await expect(form.getByLabel("Médico autenticado")).toContainText("Médico Teste");
  await form.getByRole("combobox").filter({ hasText: "Selecione o local" }).click();
  await page.getByRole("option", { name: /Local Teste/ }).click();
  await form.getByRole("combobox").filter({ hasText: "Escolha a substância" }).click();
  await page.getByRole("option", { name: /Substância Teste/ }).click();
  await form.getByPlaceholder("Ex: 600mg, 15g").fill("1 mg");
  await form.getByRole("button", { name: "Ver Resumo" }).click();
  await form.getByRole("button", { name: /Confirmar e Lançar Protocolo/ }).click();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({ clientId: 42, professionalId: 3, items: [{ substanceId: 7, dose: "1 mg" }] });
  await expect(form).toHaveCount(0);
  await expect(page).toHaveURL(/\/cockpit\/42\/protocolos$/);
});

test("trocar cliente descarta o formulário anterior e aguarda a nova identidade", async ({ page }) => {
  const created = await isolatedServices(page, { delayClient: 43 });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await form.getByPlaceholder("Deixe vazio para gerar automaticamente").fill("Texto do cliente anterior");
  await page.locator("header").getByRole("button", { name: /Cliente Alpha Teste/ }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: /Cliente Beta Teste/ }).click();
  await expect(page).toHaveURL(/\/cockpit\/43\/prescricao$/);
  await expect(form).toHaveCount(0);
  await expect(page.getByText("Texto do cliente anterior")).toHaveCount(0);
  await expect(page.locator("header").getByRole("button", { name: /Cliente Beta Teste/ }).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Abas do cockpit" }).getByRole("button", { name: /Protocolos/i }).click();
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  await expect(form.getByText("Cliente Beta Teste")).toBeVisible();
  await expect(form.getByPlaceholder("Deixe vazio para gerar automaticamente")).toHaveValue("");
  expect(created).toHaveLength(0);
});

test("recusa de acesso ao cliente não abre ferramentas nem finge lista vazia", async ({ page }) => {
  await isolatedServices(page, { denyClient: 42 });
  await page.goto("/cockpit/42/protocolos");
  await expect(page.getByText("Não foi possível confirmar o cliente ou seu acesso", { exact: false })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("navigation", { name: "Abas do cockpit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true })).toHaveCount(0);
  await expect(page.getByText("Nenhum protocolo cadastrado.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
});

test("trocar visualização conserva protocolo e não marca mensagens automaticamente", async ({ page }) => {
  const created = await isolatedServices(page);
  let escritasTelegram = 0;
  await page.route("**/api/telegram-inbox/**", async route => {
    if (route.request().method() !== "GET") escritasTelegram++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [], total: 0 }) });
  });
  await page.goto("/cockpit/42/protocolos");
  await page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true }).click();
  const form = page.getByRole("region", { name: "Cadastro de protocolo" });
  await form.getByPlaceholder("Deixe vazio para gerar automaticamente").fill("Rascunho visual seguro");
  await page.getByRole("button", { name: /TELAS · TODAS ABERTAS/ }).click();
  await expect(form.getByPlaceholder("Deixe vazio para gerar automaticamente")).toHaveValue("Rascunho visual seguro");
  await page.getByRole("button", { name: /FICHA CONTÍNUA/ }).click();
  await page.getByRole("button", { name: /RECOLHER TUDO/ }).click();
  await page.getByRole("button", { name: /EXPANDIR TUDO/ }).click();
  await page.getByRole("button", { name: "ABAS", exact: true }).click();
  await expect(form.getByPlaceholder("Deixe vazio para gerar automaticamente")).toHaveValue("Rascunho visual seguro");
  expect(escritasTelegram).toBe(0);
  expect(created).toHaveLength(0);
});

test("identidade e ferramentas permanecem visíveis no computador e celular", async ({ page }) => {
  await isolatedServices(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/cockpit/42/protocolos");
  await expect(page.getByRole("region", { name: "Identificação do cliente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/cockpit-identidade-computador.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("region", { name: "Identificação do cliente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "NOVO PROTOCOLO", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/cockpit-identidade-celular.png" });
});
