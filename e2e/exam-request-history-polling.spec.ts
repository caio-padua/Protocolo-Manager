import { test, expect, type Page, type BrowserContext } from "@playwright/test";

// All API traffic is intercepted: no clinical data or providers are touched.
async function setup(context: BrowserContext, page: Page) {
  const state = { reads: 0, writes: 0, pending: true, error: false, malformed: false };
  const professional = { id: 202, name: "Médico Sintético", role: "medico", crm: "000", uf: "SP" };
  const client = { id: 42, name: "Cliente Sintético", status: "active", email: null, phone: null, cpf: "" };
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
  });
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") state.writes++;
    const json = (body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(body),
    });
    if (path === "/api/collaborator/me") return json({ professional });
    if (path === "/api/clients") return json([client]);
    if (path === "/api/clients/42") return json(client);
    if (path === "/api/clinical-context/42") return json({
      professional, client, clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
      canPrescribe: true, issue: null,
    });
    if (path === "/api/exam-requests/42/history") {
      state.reads++;
      if (state.error) return json({ error: "Consulta indisponível." }, 503);
      return json({
        documents: [], dispatches: [], nextOffset: null,
        pendingOperations: state.malformed ? null : state.pending ? [{
          operationKey: "synthetic-pending", state: "in_progress", createdAt: "2026-10-29T15:00:00Z",
          documentIds: [91], channels: ["EMAIL"], results: [],
        }] : [],
      });
    }
    return json([]);
  });
  await page.clock.install();
  await page.goto("/cockpit/42/exames");
  const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
  await expect(panel.getByText("Operação: synthetic-pending", { exact: true })).toBeVisible();
  return { state, panel };
}

test("Histórico: atualiza conclusão de outra janela e para sem pendências", async ({ context, page }) => {
  const { state, panel } = await setup(context, page);
  let reads = state.reads;
  await page.clock.fastForward(10_001);
  await expect.poll(() => state.reads).toBe(reads + 1);
  await expect(panel.getByText("Operação: synthetic-pending", { exact: true })).toBeVisible();
  state.pending = false; // Equivalent to a completion committed by another window.
  reads = state.reads;
  await page.clock.fastForward(10_001);
  await expect.poll(() => state.reads).toBe(reads + 1);
  await expect(panel.getByText("Envios pendentes de conferência", { exact: true })).toHaveCount(0);
  reads = state.reads;
  await page.clock.fastForward(60_000);
  expect(state.reads).toBe(reads);
  expect(state.writes).toBe(0);
});

test("Histórico: pausa na aba oculta e encerra ao sair do painel", async ({ context, page }) => {
  const { state, panel } = await setup(context, page);
  const visibility = (value: "hidden" | "visible") => page.evaluate(value => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);
  await visibility("hidden");
  // Wait for React to apply enabled=false before advancing timers.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  let reads = state.reads;
  await page.clock.fastForward(60_000);
  expect(state.reads).toBe(reads);
  await visibility("visible");
  await expect.poll(() => state.reads).toBeGreaterThan(reads);
  await expect(panel.getByText("Operação: synthetic-pending", { exact: true })).toBeVisible();
  // Client-side navigation unmounts the panel without destroying the browser clock.
  await page.evaluate(() => {
    window.history.pushState(null, "", "/cockpit/42");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(panel).toHaveCount(0);
  reads = state.reads;
  await page.clock.fastForward(60_000);
  expect(state.reads).toBe(reads);
  expect(state.writes).toBe(0);
});

test("Histórico: erro não transforma pendência em falha nem impede recuperação", async ({ context, page }, testInfo) => {
  const { state, panel } = await setup(context, page);
  for (const kind of ["error", "malformed"] as const) {
    state[kind] = true;
    await page.clock.fastForward(10_001);
    await expect(panel.getByText("Não foi possível atualizar o histórico:", { exact: false })).toBeVisible();
    await expect(panel.getByText("Últimas pendências conhecidas;", { exact: false })).toBeVisible();
    await expect(panel.getByText("Operação: synthetic-pending", { exact: true })).toBeVisible();
    await expect(panel.getByText("Sem conclusão registrada", { exact: false })).toBeVisible();
    expect(state.writes).toBe(0);
    if (kind === "error") await panel.screenshot({ path: testInfo.outputPath("historico-erro.png") });
    state[kind] = false;
    await page.clock.fastForward(10_001);
    await expect(panel.getByText("Não foi possível atualizar o histórico:", { exact: false })).toHaveCount(0);
  }
  state.pending = false;
  await page.clock.fastForward(10_001);
  await expect(panel.getByText("Envios pendentes de conferência", { exact: true })).toHaveCount(0);
  expect(state.writes).toBe(0);
});
