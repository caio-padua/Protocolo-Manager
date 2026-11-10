import { test, expect, type Page } from "@playwright/test";

// Dados sintéticos; todas as chamadas ao serviço são interceptadas.
async function abrirProtocolo(page: Page, responsavel: number | null = 41) {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "teste-sintetico-antigo");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Médico sintético", role: "medico" }));
  });
  let consultasGlobais = 0;
  const acessos: Array<{ caminho: string; autorizacao: string }> = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (url.pathname === "/api/collaborator/me") {
      if ((route.request().headers().authorization ?? "").includes("identidade-indisponivel")) {
        return reply({ error: "indisponível" }, 503);
      }
      return reply({ professional: { id: 41, name: "Médico sintético", role: "medico", category: "medico", isPlatformOwner: true } });
    }
    if (url.pathname === "/api/protocols/carta-pdf-certcheck") {
      consultasGlobais++;
      return reply({ state: "expired", cert: { validTo: "2025-01-01T12:00:00Z" } });
    }
    if (url.pathname === "/api/settings/certificate") {
      const authorization = route.request().headers().authorization ?? "";
      if (authorization.includes("teste-sintetico-novo")) {
        await new Promise(resolve => setTimeout(resolve, 800));
        return reply({ state: "expired", professionalType: "medico", validFrom: "2020-01-01T12:00:00Z", validTo: "2025-01-01T12:00:00Z" });
      }
      if (authorization.includes("teste-sintetico-falha")) {
        return reply({ state: "valid", professionalType: "medico" }, 503);
      }
      return reply({ state: "valid", professionalType: "medico", validFrom: "2020-01-01T12:00:00Z", validTo: "2040-01-15T12:00:00Z" });
    }
    if (url.pathname === "/api/protocols/123") {
      return reply({
        id: 123, title: "PROTOCOLO SINTÉTICO", clientId: 100, clientName: "CLIENTE SINTÉTICO",
        clientCpf: null, professionalId: responsavel, professionalName: "Médico sintético",
        totalSessions: 1, completedSessions: 0, status: "suggested", serviceType: "clinic",
        unit: "Clínica sintética", startDate: "2026-11-10", totalValue: 0,
        sessions: [{ id: 1, scheduledDate: "2026-11-10", scheduledTime: "10:00",
          status: "scheduled", weekNumber: 1, substanceApplications: [] }], items: [],
      });
    }
    if (url.pathname === "/api/clients/100") {
      return reply({ id: 100, name: "Cliente sintético", cpf: null, phone: null, photoUrl: null, birthDate: null });
    }
    if (url.pathname === "/api/clients") return reply([{ id: 100, name: "Cliente sintético", cpf: null, phone: null, photoUrl: null }]);
    if (url.pathname === "/api/settings/governanca") return reply({ matriz: null });
    if (url.pathname === "/api/menu") return reply({ items: [] });
    if (url.pathname === "/api/telegram-inbox/badge") return reply({ naoLidas: 0 });
    if (/\/api\/protocols\/123\/(document-pdf|carta-pdf|emit-document)$/.test(url.pathname)) {
      acessos.push({ caminho: url.pathname, autorizacao: route.request().headers().authorization ?? "" });
      return reply({ error: "Recusa sintética" }, 403);
    }
    return reply([]);
  });
  await page.goto("/protocols/123", { waitUntil: "domcontentloaded" });
  return { consultasGlobais: () => consultasGlobais, acessos };
}

test("mostra no Cockpit o certificado pessoal, não o global antigo", async ({ page }) => {
  const { consultasGlobais } = await abrirProtocolo(page);
  await expect(page.getByRole("region", { name: "Validade do certificado do médico" })).toHaveCount(0);
  await page.goto("/cockpit/100/evolucao", { waitUntil: "domcontentloaded" });
  const painel = page.locator('[aria-label^="Certificado do médico autenticado:"]');
  await expect(painel).toContainText("Certificado válido");
  expect(consultasGlobais()).toBe(0);
});

test("o detalhe de outro responsável não apresenta o certificado da conta como seu", async ({ page }) => {
  await abrirProtocolo(page, 42);
  await expect(page.getByText("PROTOCOLO SINTÉTICO").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Validade do certificado do médico" })).toHaveCount(0);
  await expect(page.getByText("Certificado válido")).toHaveCount(0);
});

test("troca de sessão oculta o estado anterior e falha nunca aparece como válido", async ({ page }) => {
  await abrirProtocolo(page);
  await page.goto("/cockpit/100/evolucao", { waitUntil: "domcontentloaded" });
  const painel = page.locator('[aria-label^="Certificado do médico autenticado:"]');
  await expect(painel).toContainText("Certificado válido");
  await page.evaluate(() => {
    localStorage.setItem("padcom_collab_token", "teste-sintetico-novo");
    window.dispatchEvent(new Event("collab-auth-changed"));
  });
  await expect(painel).not.toContainText("Certificado válido");
  await expect(painel).toContainText("Certificado vencido");
  await page.evaluate(() => {
    localStorage.setItem("padcom_collab_token", "teste-sintetico-falha");
    window.dispatchEvent(new Event("collab-auth-changed"));
  });
  await expect(painel).toContainText("Validação indisponível");
  await expect(painel).not.toContainText("Certificado válido");
  await page.evaluate(() => {
    localStorage.setItem("padcom_collab_token", "identidade-indisponivel");
    window.dispatchEvent(new Event("collab-auth-changed"));
  });
  await expect(painel).not.toContainText("Certificado válido");
  await expect(painel).toContainText("Aguardando confirmação do médico autenticado");
});

test("as três ações enviam a identificação da sessão ao serviço", async ({ page }) => {
  const { acessos } = await abrirProtocolo(page);
  await page.getByRole("button", { name: "Protocolo Completo (PDF)" }).click();
  await page.getByRole("button", { name: "Carta Premium", exact: true }).click();
  await page.getByRole("button", { name: "Emitir ao Paciente" }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect.poll(() => acessos.length).toBe(3);
  expect(acessos.map(a => a.caminho.split("/").pop()).sort()).toEqual(["carta-pdf", "document-pdf", "emit-document"]);
  expect(acessos.every(a => a.autorizacao === "Bearer teste-sintetico-antigo")).toBe(true);
});
