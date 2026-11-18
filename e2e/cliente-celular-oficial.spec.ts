/** Toggle "Celular oficial da empresa" no cadastro do cliente. Rede simulada, dados sintéticos. */
import { test, expect, type BrowserContext } from "@playwright/test";

async function setup(context: BrowserContext, podeAlterar: boolean) {
  const state = { ativo: false, puts: [] as unknown[], outrasEscritas: [] as string[] };
  const client = {
    id: 42, name: "Cliente Sintético", cpf: "12345678901", email: "cliente@example.invalid",
    phone: "11999999999", status: "active", locationId: null, clinicaOrigemEmpresaId: 5,
    preferredAgendaResourceIds: [], birthDate: null, address: null, notes: null, visitPreferencesRevision: 1,
    visitPreferences: { medical: { weekdays: [], times: [] }, nursing: { weekdays: [], times: [] } },
    createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z",
  };
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 101, name: "Sintético", role: "admin" }));
  });
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/collaborator/me") return json({ professional: { id: 101, name: "Sintético", role: "admin" } });
    if (path === "/api/clients/42/canal-clinica") {
      if (method === "PUT") {
        state.puts.push(route.request().postDataJSON());
        state.ativo = route.request().postDataJSON().ativo;
      }
      return json({ ativo: state.ativo, cnpj: state.ativo ? "00.000.000/0001-00" : null, empresa: state.ativo ? { nome: "Clínica Sintética", nomeFantasia: "Fantasia Sintética", razaoSocial: "CLÍNICA SINTÉTICA LTDA", cnpj: "00.000.000/0001-00", endereco: "Rua Teste, 1", numero: "1", bairro: "Centro", cidade: "São Paulo", estado: "SP", cep: "00000-000" } : null, podeAlterar });
    }
    if (path === "/api/clients/42" && method === "GET") return json(client);
    if (method !== "GET") state.outrasEscritas.push(`${method} ${path}`);
    if (path === "/api/clients/clinicas-origem") return json({ empresaAtualId: 5, clinicas: [] });
    if (path === "/api/clients/agenda-opcoes") return json({ locais: [], agendas: [], enfermagemPadraoId: null, medicoPadraoId: null });
    if (path === "/api/clients/visit-preference-options") return json({ medical: { days: [], mismatchedResources: [] }, nursing: { days: [], mismatchedResources: [] } });
    return json([]);
  });
  return state;
}

test("CEO liga a chave: CPF vira CNPJ, outros campos travam e contato continua editável", async ({ context, page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const state = await setup(context, true);
  await page.goto("/clients/42/edit");
  await expect(page.getByText("CPF *")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("canal-clinica-empresa")).toHaveCount(0);

  await page.getByTestId("canal-clinica-toggle").click();
  await expect(page.getByTestId("canal-clinica-cnpj")).toHaveText("00.000.000/0001-00");
  await expect(page.getByText("CPF *")).toBeVisible();
  await expect(page.getByTestId("canal-clinica-selo")).toContainText("Fantasia Sintética");
  await expect(page.getByTestId("canal-clinica-empresa")).toContainText("Logo não cadastrado na empresa");
  expect(state.puts).toEqual([{ ativo: true }]);
  await expect(page.getByLabel(/Celular/i).first()).toBeEnabled();
  await expect(page.locator('input[type="email"]')).toBeDisabled();
  await expect(page.locator('input[type="date"]')).toBeDisabled();
  await page.screenshot({ path: "generated-artifacts/celular-oficial-ligado.png" });

  await page.getByTestId("canal-clinica-toggle").click();
  await expect(page.getByTestId("canal-clinica-empresa")).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toBeEnabled();
  expect(state.outrasEscritas).toEqual([]);
});

test("quem não é CEO vê a chave travada", async ({ context, page }) => {
  const state = await setup(context, false);
  await page.goto("/clients/42/edit");
  await expect(page.getByTestId("canal-clinica-toggle")).toBeDisabled({ timeout: 20_000 });
  await expect(page.getByTestId("canal-clinica")).toContainText("Somente o CEO");
  expect(state.puts).toEqual([]);
});
