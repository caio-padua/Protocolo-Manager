import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "test-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Teste", role: "medico" }));
  });
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/collaborator/me", (route) => route.fulfill({
    json: { professional: { id: 1, name: "Teste", role: "medico" } },
  }));
  await page.route("**/api/prescriptions", (route) => route.fulfill({ json: [
    { id: 71, clientId: 42, clientName: "Paciente Teste", status: "emitted" },
    { id: 72, clientId: 42, clientName: "Rascunho Teste", status: "draft" },
  ] }));
});

test("bloqueia duplicação, aguarda e mostra destinatários reais", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route("**/api/prescriptions/71/reenviar-email", async (route) => {
    calls++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    await wait;
    await route.fulfill({ json: { emailSent: true, destinatarios: ["ceo@example.com", "paciente@example.com"] } });
  });
  await page.goto("/prescricao");
  const history = page.getByRole("region", { name: "Prescrições emitidas", exact: true });
  await expect(history.getByText("Rascunho Teste", { exact: false })).toHaveCount(0);
  await history.getByRole("button", { name: "Reenviar e-mail" }).click();
  await expect(history.getByRole("button", { name: "Reenviando…" })).toBeDisabled();
  await expect(history.getByText(/dezenas de segundos/)).toBeVisible();
  release();
  await expect(history.getByRole("status")).toContainText("ceo@example.com · paciente@example.com");
  expect(calls).toBe(1);
});

test("falhas ficam na linha e permitem nova tentativa sem falso sucesso", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/prescriptions/71/reenviar-email", (route) => {
    calls++;
    return route.fulfill(calls === 1
      ? { status: 422, json: { error: "Prescrição sem itens — nada a enviar" } }
      : calls === 2 ? { json: { emailSent: false, destinatarios: ["ceo@example.com"] } }
      : { json: { emailSent: true, destinatarios: ["ceo@example.com"] } });
  });
  await page.goto("/prescricao");
  const history = page.getByRole("region", { name: "Prescrições emitidas", exact: true });
  const button = history.getByRole("button", { name: "Reenviar e-mail" });
  await button.click();
  await expect(history.getByRole("alert")).toContainText("Prescrição sem itens");
  await button.click();
  await expect(history.getByRole("alert")).toContainText("não confirmou o envio");
  await expect(history.getByText("E-mail enviado para:", { exact: false })).toHaveCount(0);
  await button.click();
  await expect(history.getByRole("status")).toContainText("E-mail enviado para: ceo@example.com");
});

test("cockpit mostra apenas prescrições do paciente selecionado", async ({ page }) => {
  await page.route("**/api/clients/42", (route) => route.fulfill({ json: {
    id: 42, name: "Paciente Teste", email: "patient@example.com",
  } }));
  await page.route("**/api/prescriptions", (route) => route.fulfill({ json: [
    { id: 71, clientId: 42, clientName: "Paciente Teste", status: "emitted" },
    { id: 73, clientId: 43, clientName: "Outro Paciente", status: "emitted" },
  ] }));
  await page.goto("/cockpit/42/prescricao");
  const history = page.getByRole("region", { name: "Prescrições emitidas", exact: true });
  await expect(history.getByRole("button", { name: "Reenviar e-mail" })).toBeVisible();
  await expect(history).toContainText("Paciente Teste");
  await expect(history).not.toContainText("Outro Paciente");
});
