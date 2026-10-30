import { test, expect, type Page } from "@playwright/test";

const patient = { id: 42, name: "Paciente de Teste", cpf: "", phone: "", email: null, status: "active", photoUrl: null };
const exam = (id: number, ativo = true) => ({
  id, nomeExame: `Exame ${id}`, codigoExame: `COD${id}`, ativo, grupoPrincipal: "CARDIO",
  subgrupo: null, modalidade: "CARDIO", materialOuSetor: "FUNCIONAL", preparo: null,
});

async function setup(page: Page) {
  const catalog = [exam(1), exam(2), exam(3, false)];
  let sets: any[] = [{
    id: 1, name: "Cardiologia pessoal", archived: false,
    items: [
      { id: 1, name: "Exame 1", code: "COD1", status: "available", exam: exam(1) },
      { id: 3, name: "Exame 3", code: "COD3", status: "inactive", exam: null },
      { id: 4, name: "Exame removido", code: "COD4", status: "removed", exam: null },
    ],
  }];
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 20, name: "Médico de Teste", role: "medico" }));
  });
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (req.method() !== "GET") writes.push(path);
    if (path === "/api/collaborator/me") return json({ professional: { id: 20, name: "Médico de Teste", role: "medico" } });
    if (path === "/api/clients/42") return json(patient);
    if (path === "/api/clients") return json([patient]);
    if (path === "/api/catalogos/exames") return json(catalog);
    if (path === "/api/clinical-context/42") return json({
      professional: { id: 20, name: "Médico de Teste", crm: "000", uf: "SP" },
      client: patient, clinic: { id: 30, empresaId: 40, name: "Clínica de Teste" }, canPrescribe: true, issue: null,
    });
    if (path === "/api/exam-requests/42/history") return json({ documents: [], dispatches: [], nextOffset: null });
    if (path.startsWith("/api/exam-sets/42")) {
      expect(req.headers().authorization).toBe("Bearer e2e-fake-token");
      if (req.method() === "GET") return json(sets);
      const body = req.postDataJSON();
      const previous = sets.find(set => path.endsWith(`/${set.id}`));
      const saved = {
        id: previous?.id ?? 2, name: body.name ?? previous?.name,
        archived: body.archived ?? false,
        items: body.examIds ? body.examIds.map((id: number) => {
          const available = catalog.find(exam => exam.id === id && exam.ativo);
          return available ? { id, name: available.nomeExame, code: available.codigoExame, status: "available", exam: available }
            : previous?.items.find((item: any) => item.id === id);
        }) : previous?.items,
      };
      sets = previous ? sets.map(set => set.id === previous.id ? saved : set) : [...sets, saved];
      return json(saved, previous ? 200 : 201);
    }
    return json([]);
  });
  await page.goto("/cockpit/42/exames");
  const panel = page.getByRole("region", { name: "Meus conjuntos de exames" });
  await expect(panel.getByText("Cardiologia pessoal", { exact: true })).toBeVisible();
  return { panel, writes };
}

test("applying marks only available IDs, keeps client, and never issues or sends", async ({ page }, testInfo) => {
  const { panel, writes } = await setup(page);
  await expect(panel.getByText(/Exame 3.*Desativado/)).toBeVisible();
  await expect(panel.getByText(/Exame removido.*Removido do catálogo/)).toBeVisible();
  await panel.getByRole("button", { name: "Aplicar às caixinhas" }).click();
  await expect(panel.getByRole("status")).toContainText("Nenhum pedido emitido ou enviado");
  await expect(panel.getByRole("status")).toContainText("Não selecionados");
  await expect(page.getByText("Selecionados (1)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Exame 1", { exact: false }).last()).toBeChecked();
  await expect(page.getByRole("button", { name: "Gerar pedidos de exames" })).toBeEnabled();
  await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
  expect(writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("conjunto-aplicado.png"), fullPage: true });
});

test("create from selection, rename, edit, archive and reload without changing patient or history", async ({ page }) => {
  const { panel, writes } = await setup(page);
  await panel.getByRole("button", { name: "Aplicar às caixinhas" }).click();
  await panel.getByRole("button", { name: "Salvar seleção como conjunto" }).click();
  await panel.getByLabel("Nome do conjunto").fill("Meu novo conjunto");
  await panel.getByRole("button", { name: "Salvar conjunto", exact: true }).click();
  await expect(panel.getByText("Meu novo conjunto", { exact: true })).toBeVisible();
  const newSet = panel.locator("div.concave-3d").filter({ has: page.getByText("Meu novo conjunto", { exact: true }) }).first();
  await newSet.getByRole("button", { name: "Editar / renomear" }).click();
  await panel.getByLabel("Nome do conjunto").fill("Cardiologia revisada");
  await panel.getByLabel("Exame 2", { exact: true }).check();
  await panel.getByRole("button", { name: "Salvar conjunto", exact: true }).click();
  await expect(panel.getByText("Cardiologia revisada", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Recuperar rascunho", exact: true }).click();
  await expect(page.getByText("Selecionados (1)", { exact: true })).toBeVisible();
  const revised = panel.locator("div.concave-3d").filter({ has: page.getByText("Cardiologia revisada", { exact: true }) }).first();
  await expect(revised).toContainText("Exame 2");
  page.once("dialog", dialog => dialog.accept());
  await revised.getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(panel.getByText("Cardiologia revisada", { exact: true })).toHaveCount(0);
  await panel.getByLabel("Mostrar arquivados").check();
  await expect(panel.getByText("Cardiologia revisada — Arquivado", { exact: true })).toBeVisible();
  expect(writes).toEqual(["/api/exam-sets/42", "/api/exam-sets/42/2", "/api/exam-sets/42/2"]);
  await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
});

test("small screen keeps actions usable and unavailable IDs removable while editing", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 402, height: 874 });
  const { panel } = await setup(page);
  await panel.getByRole("button", { name: "Editar / renomear" }).click();
  await panel.getByLabel(/Exame removido.*não será aplicado/).uncheck();
  await panel.getByLabel(/Exame 3.*não será aplicado/).uncheck();
  await panel.getByRole("button", { name: "Salvar conjunto", exact: true }).click();
  await expect(panel.getByText(/Exame removido.*Removido/)).toHaveCount(0);
  const width = await panel.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  const bounds = await panel.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(402);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("conjuntos-mobile.png") });
});

for (const failure of ["network", "503"] as const) {
  test(`unsaved applied selection survives transient identity ${failure}, but not authorization refusal`, async ({ page }) => {
    const { panel, writes } = await setup(page);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as any).restoreClinicalStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("paxter:clinical-draft:")) throw new DOMException("Full", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    await panel.getByRole("button", { name: "Aplicar às caixinhas" }).click();
    const observation = page.getByPlaceholder("Observação (opcional)…");
    await observation.fill("Única cópia em memória");
    await expect(page.getByText(/Rascunho não salvo neste navegador/)).toBeVisible();
    let mode: string = failure;
    await page.route("**/api/clinical-context/42", route => {
      if (mode === "ok") return route.fallback();
      if (mode === "network") return route.abort();
      return route.fulfill({ status: Number(mode), json: { error: "Revalidação indisponível" } });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
    await expect(page.getByRole("button", { name: "Validar identidade", exact: true })).toBeVisible();
    // The only copy must remain mounted, hidden and disabled until revalidated.
    await expect(observation).toHaveCount(1);
    await expect(observation).toBeHidden();
    await expect(observation).toBeDisabled();
    mode = "ok";
    await page.getByRole("button", { name: "Validar identidade", exact: true }).click();
    await expect(observation).toBeVisible();
    await expect(observation).toHaveValue("Única cópia em memória");
    await expect(page.getByText("Selecionados (1)", { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    // A confirmed denial must still remove the private editor, not just hide it.
    mode = "403";
    await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
    await expect(page.getByText("Revalidação indisponível", { exact: true })).toBeVisible();
    await expect(observation).toHaveCount(0);
    await page.evaluate(() => (window as any).restoreClinicalStorage());
  });
}
