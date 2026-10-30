import { test, expect, type Page } from "@playwright/test";

type Context = { doctor: number; clinic: number; empresa: number };
const context: Context = { doctor: 7, clinic: 8, empresa: 5 };
const key = (kind: string, patient = 42, ctx = context) =>
  `paxter:clinical-draft:v1:${ctx.empresa}:${ctx.clinic}:${ctx.doctor}:${patient}:${kind}`;
const patient = (id: number) => ({
  id, name: `Paciente Teste ${id}`, cpf: null, email: null, phone: null, birthDate: null,
});

async function setup(page: Page, ctx: Context = { ...context }) {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "fake-draft-test");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 7, name: "Médico Teste", role: "medico" }));
  });
  // ALL API requests are intercepted: no document or message reaches a real server.
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/collaborator/me") return route.fulfill({ json: {
      professional: { id: ctx.doctor, name: "Médico Teste", role: "medico" },
    } });
    if (path.match(/\/clinical-context\/\d+$/)) return route.fulfill({ json: {
      client: patient(Number(path.split("/").pop())),
      professional: { id: ctx.doctor, name: `Médico ${ctx.doctor}`, crm: "123", uf: "SP" },
      clinic: { id: ctx.clinic, empresaId: ctx.empresa, name: `Clínica ${ctx.clinic}` },
      canPrescribe: true, issue: null,
    } });
    if (path.match(/\/clients\/\d+$/)) return route.fulfill({ json: patient(Number(path.split("/").pop())) });
    if (path === "/api/catalogos/exames") return route.fulfill({ json: [
      { id: 1, nomeExame: "Hemograma Teste", codigoExame: "HEM", grupoPrincipal: "SANGUE",
        subgrupo: null, modalidade: null, materialOuSetor: null, preparo: "Jejum", ativo: true },
    ] });
    if (path === "/api/pharmacies") return route.fulfill({ json: [
      { id: 3, name: "Farmácia Teste", controlledTypes: [] },
    ] });
    if (route.request().method() !== "GET") return route.fulfill({ status: 500, json: { error: "Falha simulada" } });
    return route.fulfill({ json: [] });
  });
}

async function rawDraft(page: Page, storageKey: string) {
  return page.evaluate(k => localStorage.getItem(k), storageKey);
}

test("exames: falha preserva, recarga recupera e descarte exige confirmação", async ({ page }, info) => {
  await setup(page);
  await page.goto("/cockpit/42/exames");
  await page.getByText("Hemograma Teste", { exact: true }).click();
  await page.getByPlaceholder("Observação (opcional)…").fill("Observação mantida");
  await page.getByLabel("Gerar um documento por exame").uncheck();
  await page.getByRole("button", { name: "Gerar pedidos de exames" }).click();
  await expect(page.getByText(/Falha simulada — rascunho preservado/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Recuperar rascunho" })).toBeVisible();
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveCount(0);
  await page.getByRole("region", { name: "Rascunho clínico" }).screenshot({ path: info.outputPath("exames-recuperacao.png") });
  await page.getByRole("button", { name: "Recuperar rascunho" }).click();
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveValue("Observação mantida");
  await expect(page.getByLabel("Gerar um documento por exame")).not.toBeChecked();
  await expect(page.getByText("Selecionados (1)")).toBeVisible();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Descartar rascunho", exact: true }).click();
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveValue("Observação mantida");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Descartar rascunho", exact: true }).click();
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveValue("");
  expect(await rawDraft(page, key("exams"))).toBeNull();
});

test("receita: todos os campos e roteamentos sobrevivem à falha e à recarga", async ({ page }, info) => {
  await setup(page);
  await page.goto("/cockpit/42/prescricao");
  await page.getByRole("button", { name: "Adicionar", exact: true }).first().click();
  const ativos = page.locator("textarea").first();
  await ativos.fill("Ativo Teste 50 mg");
  await page.getByPlaceholder("CID (ex: N484 + E291 + F90)").fill("Z00");
  await page.locator('input[type="number"]').fill("45");
  const pharmacy = page.locator("select").filter({ has: page.locator('option', { hasText: "— selecione —" }) });
  await pharmacy.selectOption("3");
  await page.locator("select").filter({ has: page.locator("option", { hasText: "Usar farmácia padrão" }) }).selectOption("3");
  await page.locator("select").filter({ has: page.locator("option", { hasText: "— sem cor —" }) }).selectOption("Azul");
  await page.getByPlaceholder("14h").first().fill("15h");
  await page.getByRole("button", { name: "Emitir receitas", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Rascunho preservado" })).toBeVisible();
  const stored = JSON.parse((await rawDraft(page, key("prescription")))!);
  expect(stored).toMatchObject({ duracao: "45", cid: "Z00", defaultPharmacyId: 3 });
  expect(stored.selected[0]).toMatchObject({ ativos: "Ativo Teste 50 mg" });
  expect(stored.routing[stored.selected[0].id]).toMatchObject({ pharmacyId: 3, internalColor: "Azul" });
  await page.reload();
  await page.getByRole("button", { name: "Recuperar rascunho" }).click();
  await expect(page.locator("textarea").first()).toHaveValue("Ativo Teste 50 mg");
  await expect(page.getByPlaceholder("14h").first()).toHaveValue("15h");
  await expect(page.locator('input[type="number"]')).toHaveValue("45");
  await expect(page.getByPlaceholder("CID (ex: N484 + E291 + F90)")).toHaveValue("Z00");
  await expect(page.locator("select").filter({ has: page.locator("option", { hasText: "— sem cor —" }) })).toHaveValue("Azul");
  await page.getByRole("region", { name: "Rascunho clínico" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("receita-recuperada.png") });
});

test("rascunhos não se misturam entre pacientes, médicos, clínicas ou empresas", async ({ page }) => {
  const ctx = { ...context };
  await setup(page, ctx);
  await page.goto("/cockpit/42/exames");
  await page.getByPlaceholder("Observação (opcional)…").fill("Exclusivo do contexto original");
  for (const next of [
    { patient: 43, doctor: 7, clinic: 8, empresa: 5 },
    { patient: 42, doctor: 9, clinic: 8, empresa: 5 },
    { patient: 42, doctor: 7, clinic: 10, empresa: 5 },
    { patient: 42, doctor: 7, clinic: 8, empresa: 6 },
  ]) {
    Object.assign(ctx, next);
    await page.goto(`/cockpit/${next.patient}/exames`);
    await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Recuperar rascunho" })).toHaveCount(0);
  }
  Object.assign(ctx, context);
  await page.reload();
  await page.getByRole("button", { name: "Recuperar rascunho" }).click();
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveValue("Exclusivo do contexto original");
});

test("emissão de exames confirmada remove somente seu rascunho", async ({ page }) => {
  await setup(page);
  await page.route("**/api/exam-requests/emit", route => {
    const body = route.request().postDataJSON();
    expect(body.sendEmail).toBe(false);
    expect(body.sendWhatsapp).toBe(false);
    return route.fulfill({ json: {
      pdfs: [{ id: 91, tipoLabel: "Exame Teste", fileName: "teste.pdf", examCount: 1, url: "/fake.pdf" }],
      email: { attempted: false, success: false }, whatsapp: { attempted: false, success: false },
    } });
  });
  await page.goto("/cockpit/42/exames");
  await page.evaluate(k => localStorage.setItem(k, "outro rascunho intocado"), key("exams", 43));
  await page.getByText("Hemograma Teste", { exact: true }).click();
  await page.getByRole("button", { name: "Gerar pedidos de exames" }).click();
  await expect(page.getByText("1 PDF(s) gerado(s)")).toBeVisible();
  expect(await rawDraft(page, key("exams"))).toBeNull();
  expect(await rawDraft(page, key("exams", 43))).toBe("outro rascunho intocado");
});

test("conflito entre abas não sobrescreve a outra versão", async ({ page }) => {
  await setup(page);
  await page.goto("/cockpit/42/exames");
  await page.getByPlaceholder("Observação (opcional)…").fill("Versão da tela");
  await page.evaluate(k => localStorage.setItem(k, JSON.stringify({
    cart: {}, observacao: "Versão de outra aba", individualDocuments: true,
  })), key("exams"));
  await page.getByPlaceholder("Observação (opcional)…").fill("Não sobrescrever outra aba");
  await expect(page.getByRole("alert").filter({ hasText: "mudou em outra aba" })).toBeVisible();
  expect(JSON.parse((await rawDraft(page, key("exams")))!)).toHaveProperty("observacao", "Versão de outra aba");
});

test("descarte pendente preserva atualização mais recente de outra aba", async ({ page, context: browserContext }) => {
  await setup(page);
  await page.goto("/cockpit/42/exames");
  await page.getByPlaceholder("Observação (opcional)…").fill("Versão inicial");
  await page.reload();
  await expect(page.getByRole("button", { name: "Recuperar rascunho" })).toBeVisible();

  const other = await browserContext.newPage();
  await setup(other);
  await other.goto("/cockpit/42/exames");
  await other.getByRole("button", { name: "Recuperar rascunho" }).click();
  await other.getByPlaceholder("Observação (opcional)…").fill("Atualização clínica na segunda aba");
  const latest = await rawDraft(other, key("exams"));

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Descartar rascunho", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "outra aba alterou o rascunho" })).toBeVisible();
  expect(await rawDraft(page, key("exams"))).toBe(latest);
  await page.getByRole("button", { name: "Recuperar rascunho" }).click();
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveValue("Atualização clínica na segunda aba");
  await other.close();
});

test("formato inválido não é recuperado nem sobrescrito", async ({ page }) => {
  await setup(page);
  await page.goto("/cockpit/42/exames");
  await page.evaluate(k => localStorage.setItem(k, '{"invalido":true}'), key("exams"));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível ler" })).toBeVisible();
  await page.getByRole("button", { name: "Recuperar rascunho" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ele foi mantido" })).toBeVisible();
  expect(await rawDraft(page, key("exams"))).toBe('{"invalido":true}');
});

test("armazenamento cheio mantém os dados na tela e permite salvar novamente", async ({ page }) => {
  await setup(page);
  await page.goto("/cockpit/42/exames");
  await expect(page.getByPlaceholder("Observação (opcional)…")).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).__restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(k, v) {
      if (k.startsWith("paxter:clinical-draft:")) throw new DOMException("quota", "QuotaExceededError");
      original.call(this, k, v);
    };
  });
  await page.getByPlaceholder("Observação (opcional)…").fill("Ainda na tela");
  await expect(page.getByRole("alert").filter({ hasText: "Rascunho não salvo" })).toBeVisible();
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveValue("Ainda na tela");
  expect(await rawDraft(page, key("exams"))).toBeNull();
  await page.evaluate(() => (window as any).__restoreStorage());
  await page.getByRole("button", { name: "Tentar salvar novamente" }).click();
  expect(JSON.parse((await rawDraft(page, key("exams")))!)).toHaveProperty("observacao", "Ainda na tela");
});

test("voltar à aba e revalidar a sessão preserva alterações não salvas", async ({ page }) => {
  await setup(page);
  await page.goto("/cockpit/42/exames");
  const observation = page.getByPlaceholder("Observação (opcional)…");
  await expect(observation).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).__restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(k, v) {
      if (k.startsWith("paxter:clinical-draft:")) throw new DOMException("quota", "QuotaExceededError");
      original.call(this, k, v);
    };
  });
  await observation.fill("Edição clínica ainda não salva");
  await expect(page.getByRole("alert").filter({ hasText: "Rascunho não salvo" })).toBeVisible();
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let revalidating = false;
  await page.route("**/api/clinical-context/42", async route => {
    revalidating = true;
    await wait;
    await route.fulfill({ json: {
      client: patient(42), professional: { id: 7, name: "Médico 7", crm: "123", uf: "SP" },
      clinic: { id: 8, empresaId: 5, name: "Clínica 8" }, canPrescribe: true, issue: null,
    } });
  });
  // The app disables focus refetch globally. Check focus first, then exercise
  // an actual same-context revalidation through the session-renewal event.
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(observation).toHaveValue("Edição clínica ainda não salva");
  await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
  await expect.poll(() => revalidating).toBe(true);
  await expect(observation).toHaveCount(1);
  await expect(observation).toBeHidden();
  release();
  await expect(observation).toBeVisible();
  await expect(observation).toHaveValue("Edição clínica ainda não salva");
  await expect(page.getByRole("button", { name: "Recuperar rascunho" })).toHaveCount(0);
  await page.evaluate(() => (window as any).__restoreStorage());
  await page.getByRole("button", { name: "Tentar salvar novamente" }).click();
  expect(JSON.parse((await rawDraft(page, key("exams")))!)).toHaveProperty("observacao", "Edição clínica ainda não salva");
});

test("receita confirmada limpa o rascunho e mantém os PDFs visíveis", async ({ page }) => {
  await setup(page);
  await page.route("**/api/prescriptions/emit", route => route.fulfill({ json: {
    prescriptionId: 81, recipes: [{ id: 82, title: "Receita Teste", pdfUrl: "/fake.pdf" }],
    sncrAlerts: [], pharmacyDispatches: [],
  } }));
  await page.goto("/cockpit/42/prescricao");
  await page.getByRole("button", { name: "Adicionar", exact: true }).first().click();
  await page.locator("select").filter({ has: page.locator("option", { hasText: "— selecione —" }) }).selectOption("3");
  await page.getByRole("button", { name: "Emitir receitas", exact: true }).click();
  await expect(page.getByText("Receitas emitidas (1)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir PDF", exact: true })).toBeVisible();
  expect(await rawDraft(page, key("prescription"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Recuperar rascunho" })).toHaveCount(0);
  await expect(page.getByText("Receita (0)", { exact: true })).toBeVisible();
});

test("resposta tardia não apaga o rascunho nem aparece para outro médico", async ({ page }) => {
  const ctx = { ...context };
  await setup(page, ctx);
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route("**/api/exam-requests/emit", async route => {
    started = true;
    await wait;
    await route.fulfill({ json: {
      pdfs: [{ id: 91, tipoLabel: "Documento do médico anterior", fileName: "fake.pdf", examCount: 1, url: "/fake.pdf" }],
      email: { attempted: false, success: false }, whatsapp: { attempted: false, success: false },
    } });
  });
  await page.goto("/cockpit/42/exames");
  await page.getByText("Hemograma Teste", { exact: true }).click();
  await page.getByPlaceholder("Observação (opcional)…").fill("Médico original");
  await page.getByRole("button", { name: "Gerar pedidos de exames" }).click();
  await expect.poll(() => started).toBe(true);
  await expect(page.getByPlaceholder("Observação (opcional)…")).toBeDisabled();
  ctx.doctor = 9;
  await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
  await expect(page.getByRole("region", { name: "Rascunho clínico" })).toContainText("Médico 9");
  await page.getByPlaceholder("Observação (opcional)…").fill("Novo médico");
  release();
  await page.waitForResponse("**/api/exam-requests/emit");
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveValue("Novo médico");
  await expect(page.getByText("Documento do médico anterior")).toHaveCount(0);
  expect(JSON.parse((await rawDraft(page, key("exams")))!)).toHaveProperty("observacao", "Médico original");
});

test("identidade recusada não abre rascunho e celular permite recuperação", async ({ page }, info) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cockpit/42/exames");
  await page.getByPlaceholder("Observação (opcional)…").fill("Rascunho celular");
  await page.reload();
  await expect(page.getByRole("button", { name: "Recuperar rascunho" })).toBeVisible();
  await page.getByRole("region", { name: "Rascunho clínico" }).screenshot({ path: info.outputPath("celular-recuperacao.png") });
  await page.route("**/api/clinical-context/42", route => route.fulfill({ status: 403, json: { error: "Sem autorização nesta clínica" } }));
  await page.reload();
  await expect(page.getByText("Sem autorização nesta clínica")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recuperar rascunho" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Observação (opcional)…")).toHaveCount(0);
  expect(await rawDraft(page, key("exams"))).not.toBeNull();
});
