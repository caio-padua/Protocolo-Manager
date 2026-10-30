import { test, expect, type Page } from "@playwright/test";
const target = { channel: "email", recipient: "patient@example.invalid", label: "Paciente — Paciente Teste" };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "test-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Teste", role: "medico" }));
  });
  // All API traffic is simulated. These tests cannot send to a live provider.
  await page.route("**/api/**", route => route.fulfill({ json: [] }));
  await page.route("**/api/collaborator/me", route => route.fulfill({
    json: { professional: { id: 1, name: "Teste", role: "medico" } },
  }));
  await page.route("**/api/clinical-context/*", route => route.fulfill({ json: {
    client: { id: 42, name: "Paciente Teste" }, professional: { id: 1, name: "Médico Teste", crm: "12345", uf: "SP" },
    clinic: { id: 8, empresaId: 5, name: "Clínica Teste" }, canPrescribe: true, issue: null,
  } }));
  await page.route("**/api/prescriptions", route => route.fulfill({ json: [
    { id: 71, clientId: 42, clientName: "Paciente Teste", status: "emitted" },
    { id: 72, clientId: 42, clientName: "Rascunho Teste", status: "draft" },
  ] }));
});
async function review(page: Page) {
  const region = page.getByRole("region", { name: "Prescrições emitidas", exact: true });
  await region.getByRole("button", { name: "Revisar destinatários e envios" }).click();
  return region;
}

test("confirma destinatário, bloqueia duplicação e preserva histórico ao recarregar", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const history: object[] = [];
  await page.route("**/api/prescriptions/71/delivery", async route => {
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    if (route.request().method() === "GET") return route.fulfill({ json: { targets: [target], history } });
    calls++;
    expect(route.request().postDataJSON()).toEqual({ channel: "email", recipient: target.recipient, confirmed: true });
    await wait;
    history.push({ id: 7, channel: "email", status: "accepted",
      detail: JSON.stringify(target), createdAt: "2026-10-29T12:00:00Z" });
    return route.fulfill({ json: { id: 7, status: "accepted", accepted: true, error: null, target } });
  });
  await page.goto("/prescricao");
  const region = await review(page);
  await expect(region.getByText("Rascunho Teste", { exact: false })).toHaveCount(0);
  const send = region.getByRole("button", { name: "Confirmar e enviar" });
  await expect(send).toBeDisabled();
  await region.getByRole("combobox").selectOption({ label: `EMAIL · ${target.label} · ${target.recipient}` });
  await expect(send).toBeDisabled();
  await region.getByRole("checkbox").check();
  await send.click();
  await expect(region.getByRole("button", { name: "Aguardando provedor…" })).toBeDisabled();
  release();
  await expect(region.getByRole("status")).toContainText("Aceito pelo provedor — entrega não confirmada");
  expect(calls).toBe(1);
  await expect(region.getByRole("checkbox")).not.toBeChecked();
  await page.reload();
  const refreshed = await review(page);
  await expect(refreshed.getByLabel("Resultados por canal")).toContainText(target.recipient);
  await expect(refreshed.getByLabel("Resultados por canal")).toContainText("Aceito pelo provedor");
  await page.screenshot({ path: "generated-artifacts/clinical-delivery-history.png", fullPage: true });
});

test("falha do canal não vira mensagem de enviado e exige nova confirmação", async ({ page }) => {
  await page.route("**/api/prescriptions/71/delivery", route => route.fulfill({
    json: route.request().method() === "GET" ? { targets: [target], history: [] }
      : { id: 8, status: "failed", accepted: false, error: "Serviço recusou o destinatário", target },
  }));
  await page.goto("/prescricao");
  const region = await review(page);
  await region.getByRole("combobox").selectOption({ label: `EMAIL · ${target.label} · ${target.recipient}` });
  await region.getByRole("checkbox").check();
  await region.getByRole("button", { name: "Confirmar e enviar" }).click();
  await expect(region.getByRole("status")).toContainText("Falhou — envio não confirmado");
  await expect(region.getByRole("status")).toContainText("Serviço recusou o destinatário");
  await expect(region.getByRole("button", { name: "Confirmar e enviar" })).toBeDisabled();
  await expect(region.getByText("E-mail enviado para:", { exact: false })).toHaveCount(0);
});

test("Cockpit mostra somente prescrições do paciente selecionado", async ({ page }) => {
  await page.route("**/api/clients/42", route => route.fulfill({ json: {
    id: 42, name: "Paciente Teste", email: "patient@example.invalid",
  } }));
  await page.route("**/api/prescriptions", route => route.fulfill({ json: [
    { id: 71, clientId: 42, clientName: "Paciente Teste", status: "emitted" },
    { id: 73, clientId: 43, clientName: "Outro Paciente", status: "emitted" },
  ] }));
  await page.goto("/cockpit/42/prescricao");
  const region = page.getByRole("region", { name: "Prescrições emitidas", exact: true });
  await expect(region.getByText("Paciente Teste — #71")).toBeVisible();
  await expect(region.getByText("Outro Paciente", { exact: false })).toHaveCount(0);
});

test("WhatsApp aceito e depois recusado aparece como falha ao atualizar histórico", async ({ page }) => {
  const wa = { channel: "whatsapp", recipient: "+5500000000000", label: "Paciente — Paciente Teste" };
  let status = "accepted";
  let sent = false;
  await page.route("**/api/prescriptions/71/delivery", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: {
      targets: [wa], history: sent ? [{ id: 9, channel: "whatsapp", status, createdAt: "2026-10-30T12:00:00Z",
        detail: JSON.stringify({ ...wa, whatsappLogId: 501, error: status === "failed" ? "twilio_63016" : null }) }] : [],
    } });
    sent = true;
    return route.fulfill({ json: { id: 9, status: "accepted", accepted: true, error: null, target: wa } });
  });
  await page.goto("/prescricao");
  let region = await review(page);
  await region.getByRole("combobox").selectOption({ label: `WHATSAPP · ${wa.label} · ${wa.recipient}` });
  await region.getByRole("checkbox").check();
  await region.getByRole("button", { name: "Confirmar e enviar" }).click();
  await expect(region.getByRole("status")).toContainText("Aceito pelo provedor");
  status = "failed";
  await page.reload();
  region = await review(page);
  await expect(region.getByLabel("Resultados por canal")).toContainText("Falhou — envio não confirmado");
  await expect(region.getByLabel("Resultados por canal")).toContainText("twilio_63016");
  await expect(region.getByLabel("Resultados por canal")).not.toContainText("Aceito pelo provedor");
});
