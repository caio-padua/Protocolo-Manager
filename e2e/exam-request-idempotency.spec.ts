import { test, expect, type Page } from "@playwright/test";

const client = { id: 42, name: "Cliente Sintético", email: "synthetic@example.invalid",
  phone: "00000000000", cpf: "", status: "active", birthDate: null, photoUrl: null };
const professional = { id: 202, name: "Médico Sintético", role: "medico", crm: "000", uf: "SP" };
const document = { id: 91, tipoLabel: "Outros", fileName: "Pedido sintético.pdf", examCount: 1,
  createdAt: "2026-10-29T15:00:00Z", url: "/api/exam-requests/file/synthetic" };

async function selectAndConfirm(page: Page) {
  const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
  await expect(panel).toBeVisible();
  await panel.getByRole("checkbox", { name: "Selecionar documento 91 para envio" }).check();
  await panel.getByRole("checkbox", { name: "E-mail", exact: true }).check();
  await panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false }).check();
  await panel.getByRole("button", { name: "Confirmar envio", exact: true }).click();
  return panel;
}

for (const scenario of ["duas-janelas", "resposta-perdida", "resultado-desconhecido"] as const) {
  test(`Pedidos: recuperar operação sem novo envio — ${scenario}`, async ({ context, page }, testInfo) => {
    let calls = 0;
    let acceptedOperations = 0;
    let previousKey: string | undefined;
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
    });
    // Every API call is intercepted; these tests never reach real providers/data.
    await context.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      if (path === "/api/collaborator/me") return json({ professional });
      if (path === "/api/clients") return json([client]);
      if (path === "/api/clients/42") return json(client);
      if (path === "/api/clinical-context/42") return json({
        professional, client, clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
        canPrescribe: true, issue: null,
      });
      if (path === "/api/exam-requests/42/history") return json({ documents: [document], dispatches: [], pendingOperations: [], nextOffset: null });
      if (path === "/api/exam-requests/send") {
        calls++;
        const body = route.request().postDataJSON();
        expect(body).toMatchObject({ clientId: 42, documentIds: [91], channels: ["EMAIL"], confirmed: true });
        expect(body.operationKey).toMatch(/^[a-f0-9]{64}$/);
        const replayed = previousKey !== undefined;
        if (previousKey) expect(body.operationKey).toBe(previousKey);
        else { previousKey = body.operationKey; acceptedOperations++; }
        if (scenario === "resposta-perdida" && calls === 1) return route.abort();
        const needsReview = scenario === "resultado-desconhecido";
        return json({
          operationKey: previousKey, replayed, state: needsReview ? "needs_review" : "completed", needsReview,
          message: needsReview ? "Operação pendente de conferência. Não reenvie automaticamente."
            : replayed ? "Operação anterior recuperada. Nenhuma mensagem foi reenviada." : "Operação registrada.",
          results: [{ channel: "EMAIL", success: !needsReview, auditId: 808,
            ...(needsReview ? { error: "Falha de comunicação; confira o provedor." } : {}) }],
        });
      }
      return json([]);
    });
    await page.goto("/cockpit/42/exames");
    let panel = await selectAndConfirm(page);
    if (scenario === "duas-janelas") {
      await expect(panel.getByText("Operação registrada", { exact: true })).toBeVisible();
      const second = await context.newPage();
      await second.goto("/cockpit/42/exames");
      panel = await selectAndConfirm(second);
      await expect(panel.getByText("Operação anterior", { exact: true })).toBeVisible();
      await second.reload();
      panel = await selectAndConfirm(second);
      await expect(panel.getByText("Nenhuma mensagem foi reenviada.", { exact: false })).toBeVisible();
    } else if (scenario === "resposta-perdida") {
      await expect(panel.getByRole("alert")).toContainText("atualize o histórico");
      await panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false }).check();
      await panel.getByRole("button", { name: "Confirmar envio", exact: true }).click();
      await expect(panel.getByText("Operação anterior", { exact: true })).toBeVisible();
    } else {
      await expect(panel.getByRole("alert")).toContainText("Confira o histórico e o provedor");
      await panel.getByRole("button", { name: "Consultar esta operação" }).click();
      await expect(panel.getByText("Operação anterior", { exact: true })).toBeVisible();
    }
    expect(acceptedOperations).toBe(1);
    await panel.screenshot({ path: testInfo.outputPath("operacao-anterior.png") });
  });
}

test("Pedidos: pendências visíveis após recarga sem selecionar arquivos ou canais", async ({ context, page }, testInfo) => {
  let posts = 0;
  let pending = true;
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
  });
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (route.request().method() === "POST") posts++;
    if (path === "/api/collaborator/me") return json({ professional });
    if (path === "/api/clients") return json([client]);
    if (path === "/api/clients/42") return json(client);
    if (path === "/api/clinical-context/42") return json({
      professional, client, clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
      canPrescribe: true, issue: null,
    });
    if (path === "/api/exam-requests/42/history") {
      const older = new URL(route.request().url()).searchParams.get("offset") === "20";
      return json({ documents: older ? [] : [document], dispatches: [], nextOffset: older ? null : 20,
        pendingOperations: pending ? [{
          operationKey: "synthetic-reserved-operation", state: "in_progress", createdAt: document.createdAt,
          documentIds: [91, 92], channels: ["EMAIL", "TELEGRAM"],
          results: [{ channel: "EMAIL", success: true, auditId: 808 }],
        }, {
          operationKey: "synthetic-review-operation", state: "needs_review", createdAt: document.createdAt,
          documentIds: [93], channels: ["WHATSAPP"], results: [],
        }] : [],
      });
    }
    return json([]);
  });
  await page.goto("/cockpit/42/exames");
  const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
  const warning = panel.getByRole("alert");
  await expect(warning).toContainText("Envios pendentes de conferência");
  await expect(warning).toContainText("Documentos: 91, 92");
  await expect(warning).toContainText("Canais: E-mail, Telegram");
  await expect(warning).toContainText("Aceito pelo provedor; entrega não confirmada.");
  await expect(warning).toContainText("Sem confirmação de resultado");
  await expect(warning).toContainText("Requer conferência");
  await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await page.reload();
  await expect(warning).toBeVisible();
  await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Mais antigos", exact: true }).click();
  await expect(panel.getByText("Nenhum pedido registrado", { exact: false })).toBeVisible();
  await expect(warning).toContainText("synthetic-reserved-operation");
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: testInfo.outputPath("pendencias-mobile.png") });
  pending = false;
  await panel.getByRole("button", { name: "Atualizar histórico" }).click();
  await expect(warning).toHaveCount(0);
  expect(posts).toBe(0);
});
