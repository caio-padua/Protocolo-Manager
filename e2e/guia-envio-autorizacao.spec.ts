import { expect, test } from "@playwright/test";

// Every API call is intercepted. No client data or external messaging service
// is contacted by these browser checks.
test.describe("Guia — token e recusa de autorização", () => {
  for (const status of [200, 403, 404, 500]) {
    test(`envio apresenta corretamente a resposta ${status}`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("padcom_collab_token", "e2e-fake-token");
        localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 500, name: "Colaborador Teste", role: "medico" }));
      });
      const sends: { authorization: string | undefined; body: Record<string, unknown> }[] = [];
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        let body: unknown = {};
        let responseStatus = 200;
        if (url.pathname === "/api/collaborator/me") {
          body = { professional: { id: 500, name: "Colaborador Teste", role: "medico", category: "medico", isPrimaryDoctor: true } };
        } else if (url.pathname === "/api/onboarding/clientes") {
          body = [{ id: 42, name: "Ana Silva", cpf: null, phone: "test-phone-42", photoUrl: null }];
        } else if (url.pathname === "/api/onboarding/minha-config") {
          body = { slug: "clinica-teste", clinicaNome: "Clínica Teste" };
        } else if (url.pathname === "/api/onboarding/enviar-guia") {
          sends.push({
            authorization: route.request().headers()["authorization"],
            body: route.request().postDataJSON(),
          });
          responseStatus = status;
          body = status === 200
            ? { ok: true, resultados: [{ canal: "WHATSAPP", ok: true, mensagem: "Mensagem enviada com sucesso." }] }
            : { ok: false, error: "Envio recusado pela autorização da clínica." };
        }
        await route.fulfill({ status: responseStatus, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto("/comunicacao/guia-paciente");
      await page.getByRole("button", { name: /Selecionar cliente/ }).click();
      await page.getByText("Ana Silva", { exact: true }).click();
      await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
      await expect.poll(() => sends.length).toBe(1);
      expect(sends[0].authorization).toBe("Bearer e2e-fake-token");
      expect(sends[0].body).toMatchObject({ clientId: 42, canais: ["WHATSAPP"] });
      expect(sends[0].body).not.toHaveProperty("empresaId");
      if (status === 200) {
        await expect(page.getByText("Mensagem enviada com sucesso.")).toBeVisible();
      } else {
        await expect(page.getByText("Envio recusado pela autorização da clínica.", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Mensagem enviada com sucesso.")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "WhatsApp", exact: true })).toBeEnabled();
      }
    });
  }
});
