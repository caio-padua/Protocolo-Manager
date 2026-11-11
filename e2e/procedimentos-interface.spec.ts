import { expect, test, type Page } from "@playwright/test";

async function servicosSinteticos(page: Page, owner: boolean, failList = false, servidorAtualizado = true) {
  const itens: any[] = [];
  const pedidos: any[] = [];
  const controle = { rejeitarGravacao: false, autorizacoes: [] as string[] };
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica-sem-acesso-real");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Profissional de teste", role: "medico" }));
  });
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path === "/api/collaborator/me") return json({ professional: { id: 1, name: "Profissional de teste", role: "medico", isPlatformOwner: owner } });
    if (path === "/api/substances") return json([
      { id: 10, name: "Produto Sintético - 100 MG / 2 ML", defaultDose: "100 mg / 2 mL", procedureType: "im", durationMinutes: 2.5 },
      { id: 11, name: "Produto Sintético - 200 MG / 2 ML", defaultDose: "200 mg / 2 mL", procedureType: "im", durationMinutes: null },
      { id: 12, name: "ADEK", defaultDose: "A + D + E + K", procedureType: "im", durationMinutes: 151 / 60 },
      { id: 13, name: "Produto simples - 75 MG", defaultDose: "75 mg", procedureType: "im", durationMinutes: 2.5 },
    ]);
    if (path.startsWith("/api/procedimentos")) {
      const autorizacao = req.headers()["authorization"] ?? "";
      controle.autorizacoes.push(autorizacao);
      if (!["Bearer sessao-sintetica-sem-acesso-real", "Bearer sessao-sintetica-renovada"].includes(autorizacao)
        || (controle.rejeitarGravacao && req.method() !== "GET")) return json({ error: "Sessão não reconhecida." }, 401);
    }
    if (path === "/api/procedimentos" && req.method() === "GET") {
      return failList ? json({ error: "Teste de indisponibilidade" }, 503) : json({ empresaId: 1, empresaNome: "Clínica Sintética", ...(servidorAtualizado ? { duracaoSegundosHabilitada: true, profissionaisNecessariosHabilitado: true } : {}), procedimentos: itens });
    }
    if (path === "/api/procedimentos/opcoes-profissionais") return json({
      locais: [{ id: 8, name: "Local sintético" }],
      areas: [{ id: 1, name: "Medicina" }, { id: 2, name: "Enfermagem" }],
      profissionais: [
        { id: 1, nome: "Médico sintético", areaId: 1, localId: 8, agendas: [] },
        { id: 2, nome: "Enfermagem sintética", areaId: 2, localId: 8, agendas: [] },
      ],
    });
    if (path === "/api/procedimentos" && req.method() === "POST") {
      const item = { ...req.postDataJSON(), id: itens.length + 1, empresaId: 1 };
      pedidos.push(item);
      itens.push(item);
      return json(item, 201);
    }
    const match = path.match(/^\/api\/procedimentos\/(\d+)$/);
    if (match && req.method() === "PUT") {
      const index = itens.findIndex(item => item.id === Number(match[1]));
      itens[index] = { ...req.postDataJSON(), id: Number(match[1]), empresaId: 1 };
      pedidos.push(itens[index]);
      return json(itens[index]);
    }
    return json([]);
  });
  return { itens, pedidos, controle };
}

async function selecionarEquipe(page: Page, area = "2") {
  await page.getByRole("button", { name: "Adicionar categoria necessária" }).click();
  await page.getByLabel("Local da clínica").last().selectOption("8");
  await page.getByLabel("Categoria profissional").last().selectOption(area);
  await page.getByLabel(area === "1" ? "Selecionar Médico sintético" : "Selecionar Enfermagem sintética").last().click();
}

test("servidor antigo mantém a leitura e bloqueia gravação incompatível", async ({ page }) => {
  const { pedidos } = await servicosSinteticos(page, true, false, false);
  await page.goto("/procedimentos");
  await expect(page.getByTestId("aviso-servidor-desatualizado")).toBeVisible();
  await page.getByTestId("button-new-procedimento").click();
  await page.getByTestId("checkbox-substancia-10").click();
  await page.getByTestId("button-save-procedimento").click();
  await expect(page.getByTestId("error-procedimento-form")).toContainText("serviço de procedimentos ainda não está atualizado");
  await expect(page.getByTestId("input-procedimento-nome")).toHaveValue("Produto Sintético");
  expect(pedidos).toHaveLength(0);
});

test("sugere nome sem apresentação e duração exata do produto escolhido", async ({ page }) => {
  const { pedidos } = await servicosSinteticos(page, true);
  await page.goto("/procedimentos");
  await page.getByTestId("button-new-procedimento").click();
  await selecionarEquipe(page);
  await page.getByTestId("checkbox-substancia-10").click();
  await expect(page.getByTestId("input-procedimento-nome")).toHaveValue("Produto Sintético");
  await expect(page.getByTestId("input-procedimento-duracao")).toHaveValue("2,5");
  await page.getByTestId("input-procedimento-dose").fill("100 mg");
  await page.getByTestId("button-save-procedimento").click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toMatchObject({ nome: "Produto Sintético", duracaoMinutos: 2.5, produtoIds: [10] });
});

test("mostra detalhes de homônimos e só preenche dose simples inequívoca", async ({ page }) => {
  await servicosSinteticos(page, true);
  await page.goto("/procedimentos");
  await page.getByTestId("button-new-procedimento").click();
  const primeiro = page.getByTestId("row-substancia-10");
  const segundo = page.getByTestId("row-substancia-11");
  await primeiro.getByText("Detalhes da apresentação").click();
  await segundo.getByText("Detalhes da apresentação").click();
  await expect(primeiro).toContainText("100 mg / 2 mL");
  await expect(segundo).toContainText("200 mg / 2 mL");
  await expect(page.getByTestId("checkbox-substancia-10")).not.toBeChecked();
  await expect(page.getByTestId("checkbox-substancia-11")).not.toBeChecked();
  await page.getByTestId("checkbox-substancia-13").click();
  await expect(page.getByTestId("input-procedimento-dose")).toHaveValue("75 mg");
  await page.getByTestId("input-procedimento-dose").fill("50 mg");
  await expect(page.getByTestId("input-procedimento-dose")).toHaveValue("50 mg");
});

test("duração ausente exige preenchimento e não escolhe outra apresentação", async ({ page }) => {
  const { pedidos } = await servicosSinteticos(page, true);
  await page.goto("/procedimentos");
  await page.getByTestId("button-new-procedimento").click();
  await selecionarEquipe(page);
  await page.getByTestId("checkbox-substancia-11").click();
  await page.getByTestId("input-procedimento-dose").fill("200 mg");
  await expect(page.getByTestId("input-procedimento-duracao")).toHaveValue("");
  await expect(page.getByTestId("aviso-duracao-produto")).toBeVisible();
  await page.getByTestId("button-save-procedimento").click();
  await expect(page.getByTestId("error-procedimento-form")).toContainText("Informe a duração");
  expect(pedidos).toHaveLength(0);
  await page.getByTestId("input-procedimento-duracao").fill("3");
  await page.getByTestId("button-save-procedimento").click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0].produtoIds).toEqual([11]);
});

test("ao trocar produto, sugestão automática não fica vinculada ao anterior", async ({ page }) => {
  await servicosSinteticos(page, true);
  await page.goto("/procedimentos");
  await page.getByTestId("button-new-procedimento").click();
  await page.getByTestId("checkbox-substancia-10").click();
  await expect(page.getByTestId("input-procedimento-duracao")).toHaveValue("2,5");
  await page.getByTestId("checkbox-substancia-11").click();
  await page.getByTestId("checkbox-substancia-10").click();
  await expect(page.getByTestId("input-procedimento-duracao")).toHaveValue("");
  await expect(page.getByTestId("aviso-duracao-produto")).toBeVisible();
  await expect(page.getByTestId("checkbox-substancia-11")).toBeChecked();
});

test("preserva nome e duração editados e vincula ADEK como um produto", async ({ page }) => {
  const { pedidos } = await servicosSinteticos(page, true);
  await page.goto("/procedimentos");
  await page.getByTestId("button-new-procedimento").click();
  await selecionarEquipe(page);
  await page.getByTestId("input-procedimento-nome").fill("Nome revisado");
  await page.getByTestId("input-procedimento-duracao").fill("4");
  await page.getByTestId("checkbox-substancia-12").click();
  await page.getByText("Confirmei que a dose está ausente ou será definida depois.").click();
  await expect(page.getByTestId("input-procedimento-nome")).toHaveValue("Nome revisado");
  await expect(page.getByTestId("input-procedimento-duracao")).toHaveValue("4");
  await page.getByTestId("button-save-procedimento").click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toMatchObject({ nome: "Nome revisado", duracaoMinutos: 4, produtoIds: [12] });
});

test("erro de sessão preserva os campos e o reenvio usa credencial renovada", async ({ page }) => {
  const { pedidos, controle } = await servicosSinteticos(page, true);
  await page.goto("/procedimentos");
  await page.getByTestId("button-new-procedimento").click();
  await selecionarEquipe(page);
  await page.getByTestId("checkbox-substancia-10").click();
  await page.getByTestId("input-procedimento-dose").fill("100 mg");
  controle.rejeitarGravacao = true;
  await page.getByTestId("button-save-procedimento").click();
  await expect(page.getByTestId("error-procedimento-form")).toContainText("sessão profissional");
  await expect(page.getByTestId("input-procedimento-nome")).toHaveValue("Produto Sintético");
  await expect(page.getByTestId("input-procedimento-duracao")).toHaveValue("2,5");
  await expect(page.getByTestId("checkbox-substancia-10")).toBeChecked();
  expect(pedidos).toHaveLength(0);
  controle.rejeitarGravacao = false;
  await page.evaluate(() => localStorage.setItem("padcom_collab_token", "sessao-sintetica-renovada"));
  await page.getByTestId("button-save-procedimento").click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(controle.autorizacoes).toContain("Bearer sessao-sintetica-renovada");
});

test("cadastro sintético cria consulta sem produto e preserva seleção exata", async ({ page }) => {
  const { pedidos } = await servicosSinteticos(page, true);
  await page.goto("/procedimentos");
  await expect(page.getByText("Clínica Sintética")).toBeVisible();
  await page.getByTestId("button-new-procedimento").click();
  await page.getByTestId("input-procedimento-nome").fill("Consulta sintética");
  await selecionarEquipe(page, "1");
  await page.getByTestId("input-procedimento-duracao").fill("2,5");
  await page.getByTestId("button-save-procedimento").click();
  await expect(page.getByTestId("text-procedimento-nome-1")).toHaveText("Consulta sintética");
  expect(pedidos[0]).toMatchObject({ tipo: null, produtoIds: [], duracaoMinutos: 2.5 });
  await page.getByTestId("button-edit-procedimento-1").click();
  await page.getByTestId("checkbox-substancia-11").click();
  await page.getByTestId("input-procedimento-dose").fill("200 mg");
  await page.getByTestId("button-save-procedimento").click();
  await page.getByText("Ver vínculos de substâncias").click();
  await expect(page.getByTestId("linked-substance-1-11")).toBeVisible();
  expect(pedidos[1]).toMatchObject({ tipo: null, produtoIds: [11], dose: "200 mg" });
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("button-inactivate-procedimento-1").click();
  await page.getByTestId("select-filter-status").selectOption("inativos");
  await expect(page.getByTestId("button-reactivate-procedimento-1")).toBeVisible();
});

test("perfil sem administração visualiza sem criar", async ({ page }) => {
  await servicosSinteticos(page, false);
  await page.goto("/procedimentos");
  await expect(page.getByTestId("notice-read-only")).toBeVisible();
  await expect(page.getByTestId("button-new-procedimento")).toHaveCount(0);
});

test("falha de leitura não é apresentada como catálogo vazio", async ({ page }) => {
  await servicosSinteticos(page, true, true);
  await page.goto("/procedimentos");
  await expect(page.getByTestId("error-list-procedimentos")).toBeVisible();
  await expect(page.getByTestId("text-total-procedimentos")).toHaveText("—");
  await expect(page.getByTestId("empty-procedimentos")).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`interface sintética se ajusta em ${width} pixels`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await servicosSinteticos(page, true);
    await page.goto("/procedimentos");
    await expect(page.getByTestId("button-new-procedimento")).toBeVisible();
    await page.getByTestId("button-new-procedimento").click();
    await expect(page.getByTestId("input-procedimento-nome")).toBeVisible();
    await page.locator("main").last().screenshot({ path: `/tmp/procedimentos-sintetico-${width}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    if (width > 900) {
      await page.getByRole("button", { name: "Recolher menu" }).click();
      await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();
    }
  });
}
