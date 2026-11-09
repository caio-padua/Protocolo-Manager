import { expect, test, type Page } from "@playwright/test";

const clients = [
  { id: 42, name: "Cliente Alpha Teste", cpf: "", phone: "", photoUrl: null, birthDate: null, status: "active" },
  { id: 43, name: "Cliente Beta Teste", cpf: "", phone: "", photoUrl: null, birthDate: null, status: "active" },
];

async function isolatedServices(page: Page, options: { denyClient?: number; delayClient?: number; denyProtocols?: boolean; excludeFromList?: number; delayPost?: number; denyPulso?: boolean; identityControl?: { deny: boolean } } = {}) {
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
    if (pathname === "/api/collaborator/me") return json({ professional: { id: 1, name: "Profissional Teste", role: "medico" } });
    if (pathname === "/api/clients") return json(clients.filter(c => c.id !== options.excludeFromList));
    if (/^\/api\/clinical-context\/\d+$/.test(pathname)) {
      const id = Number(pathname.split("/").at(-1));
      return json({ client: clients.find(c => c.id === id), professional: { id: 3, name: "Médico Teste", crm: "123", uf: "SP", professionalType: "medico" }, clinic: { id: 5, empresaId: 1, name: "Clínica Teste" }, canPrescribe: true, canRequestExams: true, canPreparePrescription: true, canPrepareExamRequest: true, responsibleDoctorName: "Médico Teste", issue: null });
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
    if (pathname === "/api/substances") return json([{ id: 7, name: "Substância Teste", unit: "mg", color: "#abcabc", procedureType: "im" }]);
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
  await form.getByRole("combobox").filter({ hasText: "Selecione o médico" }).click();
  await page.getByRole("option", { name: /Médico Teste/ }).click();
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
  await form.getByRole("combobox").filter({ hasText: "Selecione o médico" }).click();
  await page.getByRole("option", { name: /Médico Teste/ }).click();
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
  await form.getByRole("combobox").filter({ hasText: "Selecione o médico" }).click();
  await page.getByRole("option", { name: /Médico Teste/ }).click();
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
