import { test, expect, type BrowserContext } from "@playwright/test";

// Rede simulada: valida a tela do campo (estados, acessibilidade, motivo obrigatorio); a regra do servidor tem teste proprio.
async function setup(context: BrowserContext, sexoInicial: "M" | "F" | null) {
  const estado = { sexo: sexoInicial as "M" | "F" | null, historico: [] as unknown[], put: null as Record<string, unknown> | null };
  const client = { id: 42, name: "Cliente Sintético", cpf: "12345678901", email: "c@example.invalid", phone: "11999999999", status: "active",
    locationId: null, clinicaOrigemEmpresaId: 5, preferredAgendaResourceIds: [], birthDate: null, address: null, notes: null, visitPreferencesRevision: 1,
    visitPreferences: { medical: { weekdays: [], times: [] }, nursing: { weekdays: [], times: [] } }, createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z" };
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 101, name: "Profissional Sintético", role: "admin" }));
  });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (b: unknown, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (path === "/api/collaborator/me") return json({ professional: { id: 101, name: "Profissional Sintético", role: "admin" } });
    if (path === "/api/clients/42" && method === "GET") return json(client);
    if (path === "/api/collaborator/clients/42/sexo-biologico") {
      if (method === "PUT") {
        const b = route.request().postDataJSON();
        estado.put = b;
        estado.historico = [{ id: 1, valorAnterior: estado.sexo, valorNovo: b.sexo, motivo: b.motivo, criadoEm: "2026-11-21T12:00:00Z" }, ...estado.historico];
        estado.sexo = b.sexo;
        return json({ sexo: estado.sexo, mudou: true, historico: estado.historico });
      }
      return json({ sexo: estado.sexo, historico: estado.historico });
    }
    if (path === "/api/clients/clinicas-origem") return json({ empresaAtualId: 5, clinicas: [{ id: 5, nome: "Clínica Sintética A", nick: "A", razaoSocial: "CLÍNICA A LIMITADA", cnpj: null }] });
    if (path === "/api/locations") return json([{ id: 30, name: "Local sintético", active: true }]);
    if (path === "/api/clients/agenda-opcoes") return json({ locais: [], agendas: [], enfermagemPadraoId: null, medicoPadraoId: null });
    if (path === "/api/clients/visit-preference-options") return json({ medical: { days: [], mismatchedResources: [] }, nursing: { days: [], mismatchedResources: [] } });
    return json([]);
  });
  return estado;
}

for (const vp of [{ n: "celular", w: 390, h: 844 }, { n: "desktop", w: 1280, h: 900 }]) {
  test(`sexo registrado: corrigir exige motivo e grava (${vp.n})`, async ({ page, context }) => {
    const estado = await setup(context, "M");
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto("/clients/42/edit", { waitUntil: "networkidle" });
    const grupo = page.getByRole("radiogroup", { name: "Sexo registrado ao nascimento" });
    await grupo.scrollIntoViewIfNeeded();
    await expect(grupo.getByRole("radio", { name: "Masculino" })).toHaveAttribute("aria-checked", "true");
    await expect(grupo.getByRole("radio", { name: "Feminino" })).toBeDisabled();
    await page.screenshot({ path: `/tmp/shots/cad-${vp.n}-1.png` });
    await page.getByRole("button", { name: "Corrigir" }).click();
    await grupo.getByRole("radio", { name: "Feminino" }).click();
    const salvar = page.getByRole("button", { name: "Salvar", exact: true }).last();
    await expect(salvar).toBeDisabled();
    await page.getByLabel(/Motivo da correção/).fill("Conferido no documento");
    await page.screenshot({ path: `/tmp/shots/cad-${vp.n}-2.png` });
    await expect(salvar).toBeEnabled();
    await salvar.click();
    await expect(grupo.getByRole("radio", { name: "Feminino" })).toHaveAttribute("aria-checked", "true");
    expect(estado.put).toEqual({ sexo: "F", motivo: "Conferido no documento" });
    await page.getByRole("button", { name: /Ver histórico/ }).click();
    await expect(page.getByText(/Masculino para Feminino\. Motivo: Conferido no documento/)).toBeVisible();
    await page.screenshot({ path: `/tmp/shots/cad-${vp.n}-3.png` });
  });
}
test("sexo registrado: vazio permite escolher e pede motivo", async ({ page, context }) => {
  const estado = await setup(context, null);
  await page.goto("/clients/42/edit", { waitUntil: "networkidle" });
  const grupo = page.getByRole("radiogroup", { name: "Sexo registrado ao nascimento" });
  await grupo.scrollIntoViewIfNeeded();
  await grupo.getByRole("radio", { name: "Feminino" }).click();
  await page.getByLabel(/Motivo do registro/).fill("Informado pelo cliente");
  await page.getByRole("button", { name: "Salvar", exact: true }).last().click();
  await expect(grupo.getByRole("radio", { name: "Feminino" })).toHaveAttribute("aria-checked", "true");
  expect(estado.put).toEqual({ sexo: "F", motivo: "Informado pelo cliente" });
});
