import { test, expect, type Page } from "@playwright/test";

const token = "synthetic-onboarding-browser-session";

async function setup(page: Page, slug: string | null, failFirst = false) {
  const sent: { body: Record<string, unknown>; authorization: string | undefined }[] = [];
  const configHeaders: (string | undefined)[] = [];
  let configAttempts = 0;
  await page.addInitScript((session) => {
    localStorage.setItem("padcom_collab_token", session);
    localStorage.setItem("padcom_collab_prof", JSON.stringify({
      id: 101, name: "Colaborador Teste", role: "admin",
    }));
  }, token);
  // No backend writes or real delivery may escape this browser suite.
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let body: unknown = [];
    let status = 200;
    if (path === "/api/collaborator/me") {
      body = { professional: { id: 101, name: "Colaborador Teste", role: "admin" } };
    } else if (path === "/api/onboarding/minha-config") {
      configAttempts++;
      configHeaders.push(req.headers().authorization);
      if (failFirst && configAttempts === 1) {
        status = 503;
        body = { error: "Falha simulada de configuração" };
      } else {
        body = { slug, clinicaNome: slug ? "Clínica Licenciada" : "Instituto Pádua" };
      }
    } else if (path === "/api/onboarding/clientes") {
      body = [{ id: 42, name: "Cliente Teste", phone: "+5500000000000", cpf: null, photoUrl: null }];
    } else if (path.endsWith("/telegram-status")) {
      body = { vinculado: true, desde: null };
    } else if (path === "/api/onboarding/enviar-guia") {
      sent.push({ body: req.postDataJSON(), authorization: req.headers().authorization });
      body = { ok: true, resultados: [
        { canal: "WHATSAPP", ok: true, mensagem: "Mensagem enviada com sucesso." },
        { canal: "TELEGRAM", ok: true, mensagem: "Mensagem enviada com sucesso." },
      ] };
    } else if (path.includes("badge")) {
      body = { naoLidas: 0 };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return { sent, configHeaders };
}

async function selectClient(page: Page) {
  await page.locator("button", { hasText: /Selecionar cliente/i }).click();
  await page.getByText("Cliente Teste", { exact: true }).first().click();
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Guia da clínica — ${viewport.width}px`, () => {
    test.use({ viewport });

    test("envia o mesmo slug do link e autenticação do colaborador", async ({ page }) => {
      const { sent, configHeaders } = await setup(page, "licenciada");
      await page.goto("/comunicacao/guia-paciente");
      await selectClient(page);
      await page.getByRole("button", { name: "WhatsApp + Telegram", exact: true }).click();
      await expect.poll(() => sent.length).toBe(1);
      expect(configHeaders).toEqual([`Bearer ${token}`]);
      expect(sent[0].authorization).toBe(`Bearer ${token}`);
      expect(sent[0].body).toMatchObject({
        clientId: 42, canais: ["WHATSAPP", "TELEGRAM"], tenantSlug: "licenciada",
      });
      const link = new URL(sent[0].body.guiaUrl as string);
      expect(link.searchParams.get("tenant")).toBe("licenciada");
      expect(link.searchParams.get("c")).toBe("42");
      await expect(page.getByText(/Clínica Licenciada — Seu Guia Digital/)).toBeVisible();
      await page.screenshot({
        path: `generated-artifacts/screenshots/guia-clinica-${viewport.width}.png`, fullPage: true,
      });
    });

    test("omite tenantSlug no fluxo legado sem clínica licenciada", async ({ page }) => {
      const { sent } = await setup(page, null);
      await page.goto("/comunicacao/guia-paciente");
      await selectClient(page);
      await page.getByRole("button", { name: "WhatsApp + Telegram", exact: true }).click();
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0].body).not.toHaveProperty("tenantSlug");
      expect(new URL(sent[0].body.guiaUrl as string).searchParams.has("tenant")).toBe(false);
    });

    test("falha de configuração bloqueia seleção e envio, com nova tentativa", async ({ page }) => {
      const { sent } = await setup(page, "licenciada", true);
      await page.goto("/comunicacao/guia-paciente");
      await expect(page.getByRole("alert").filter({ hasText: "Não foi possível confirmar sua clínica" })).toBeVisible();
      await expect(page.locator("button", { hasText: /Selecionar cliente/i })).toBeDisabled();
      expect(sent).toHaveLength(0);
      await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
      await expect(page.locator("button", { hasText: /Selecionar cliente/i })).toBeEnabled();
      await selectClient(page);
      await page.getByRole("button", { name: "WhatsApp + Telegram", exact: true }).click();
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0].body.tenantSlug).toBe("licenciada");
    });
  });
}
