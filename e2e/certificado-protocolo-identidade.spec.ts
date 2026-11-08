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
      return reply({ professional: { id: 41, name: "Médico sintético", role: "medico" } });
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
    if (/\/api\/protocols\/123\/(document-pdf|carta-pdf|emit-document)$/.test(url.pathname)) {
      acessos.push({ caminho: url.pathname, autorizacao: route.request().headers().authorization ?? "" });
      return reply({ error: "Recusa sintética" }, 403);
    }
    return reply([]);
  });
  await page.goto("/protocols/123");
  return { consultasGlobais: () => consultasGlobais, acessos };
}

test("mostra o certificado pessoal, não o certificado global antigo", async ({ page }) => {
  const { consultasGlobais } = await abrirProtocolo(page);
  const painel = page.getByRole("region", { name: "Validade do certificado do médico" });
  await expect(painel.getByText("Certificado válido")).toBeVisible();
  await expect(painel.getByText(/15\/01\/2040/)).toBeVisible();
  expect(consultasGlobais()).toBe(0);
});

test("não apresenta certificado disponível quando o responsável é outro médico", async ({ page }) => {
  await abrirProtocolo(page, 42);
  const painel = page.getByRole("region", { name: "Validade do certificado do médico" });
  await expect(painel.getByText("Aguardando o médico responsável pela emissão")).toBeVisible();
  await expect(painel.getByText("Certificado válido")).toHaveCount(0);
});

test("troca de sessão oculta o estado anterior e falha nunca aparece como válido", async ({ page }) => {
  await abrirProtocolo(page);
  const painel = page.getByRole("region", { name: "Validade do certificado do médico" });
  await expect(painel.getByText("Certificado válido")).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("padcom_collab_token", "teste-sintetico-novo");
    window.dispatchEvent(new Event("collab-auth-changed"));
  });
  await expect(painel.getByText("Verificando certificado com o servidor…")).toBeVisible();
  await expect(painel.getByText("Certificado válido")).toHaveCount(0);
  await expect(painel.getByText("Certificado vencido")).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("padcom_collab_token", "teste-sintetico-falha");
    window.dispatchEvent(new Event("collab-auth-changed"));
  });
  await expect(painel.getByText("Validação indisponível")).toBeVisible();
  await expect(painel.getByText("Certificado válido")).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem("padcom_collab_token", "identidade-indisponivel");
    window.dispatchEvent(new Event("collab-auth-changed"));
  });
  await expect(painel.getByText("Validação indisponível")).toBeVisible();
  await expect(painel.getByText("Certificado válido")).toHaveCount(0);
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
