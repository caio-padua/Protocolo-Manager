import { expect, test, type Page } from "@playwright/test";

async function servicosSinteticos(page: Page, owner: boolean, failList = false) {
  const itens: any[] = [];
  const pedidos: any[] = [];
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
      { id: 10, name: "Produto Sintético", defaultDose: "100 mg", procedureType: "im" },
      { id: 11, name: "Produto Sintético", defaultDose: "200 mg", procedureType: "im" },
    ]);
    if (path === "/api/procedimentos" && req.method() === "GET") {
      return failList ? json({ error: "Teste de indisponibilidade" }, 503) : json({ empresaId: 1, empresaNome: "Clínica Sintética", procedimentos: itens });
    }
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
  return { itens, pedidos };
}

test("cadastro sintético cria consulta sem produto e preserva seleção exata", async ({ page }) => {
  const { pedidos } = await servicosSinteticos(page, true);
  await page.goto("/procedimentos");
  await expect(page.getByText("Clínica Sintética")).toBeVisible();
  await page.getByTestId("button-new-procedimento").click();
  await page.getByTestId("input-procedimento-nome").fill("Consulta sintética");
  await page.getByTestId("button-tipo-consulta").click();
  await page.getByTestId("input-procedimento-duracao").fill("2,5");
  await page.getByTestId("button-save-procedimento").click();
  await expect(page.getByTestId("text-procedimento-nome-1")).toHaveText("Consulta sintética");
  expect(pedidos[0]).toMatchObject({ tipo: "consulta", produtoIds: [], duracaoMinutos: 2.5 });
  await page.getByTestId("button-edit-procedimento-1").click();
  await page.getByTestId("button-tipo-enfermagem").click();
  await page.getByTestId("checkbox-substancia-11").click();
  await page.getByTestId("button-save-procedimento").click();
  await page.getByText("Ver vínculos de substâncias").click();
  await expect(page.getByTestId("linked-substance-1-11")).toBeVisible();
  expect(pedidos[1]).toMatchObject({ tipo: "enfermagem", produtoIds: [11] });
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
