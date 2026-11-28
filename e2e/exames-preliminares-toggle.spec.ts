import { expect, test } from "@playwright/test";

const LABEL = "Exibir resultados preliminares na Área do Cliente";
const WARNING = "PRELIMINAR — NÃO CONFERIDO PELO MÉDICO";

for (const width of [390, 1280]) {
  test.describe(`Resultados preliminares — ${width}px — dados sintéticos`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("interruptor fica na configuração existente e salva sem alterar conferência humana", async ({ page, context }) => {
      const writes: unknown[] = [];
      const cfg = {
        exigirValidacaoHumana: true, exibirResultadosPreliminaresAreaCliente: false,
        triagemAtiva: true, autoCriarDescoberto: true, autoAbsorverApelidoAltaConfianca: true,
        llmGeminiAtivo: true, llmClaudeAtivo: false, llmOpenaiAtivo: false,
      };
      await context.addInitScript(() => {
        localStorage.setItem("padcom_collab_token", "sessao-sintetica");
        localStorage.setItem("padcom_collab_prof", JSON.stringify({
          id: 1, name: "Profissional Sintético", role: "medico",
        }));
      });
      // Toda a rede da aplicação é simulada: nenhuma leitura/escrita de dados reais.
      await context.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        let body: unknown = [];
        if (path === "/api/collaborator/me") body = {
          professional: { id: 1, name: "Profissional Sintético", role: "medico", category: "medico", isPlatformOwner: true },
        };
        if (path === "/api/settings/governanca") body = { matriz: {} };
        if (path === "/api/settings/exames") {
          if (route.request().method() === "PUT") {
            const change = route.request().postDataJSON();
            writes.push(change);
            Object.assign(cfg, change);
          }
          body = cfg;
        }
        await route.fulfill({ json: body });
      });
      await page.goto("/cadastros/config-exames");
      const toggle = page.getByRole("button", { name: LABEL, exact: true });
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await toggle.click();
      await expect(page.getByText("Configuração salva.", { exact: true })).toBeVisible();
      expect(writes).toEqual([{ exibirResultadosPreliminaresAreaCliente: true }]);
      expect(cfg.exigirValidacaoHumana).toBe(true);
      await page.reload();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await toggle.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `generated-artifacts/exames-preliminares/config-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });

    test("as duas planilhas do portal sinalizam preliminar e mantêm valor visível", async ({ page, context }) => {
      const columns = [
        { key: "2026-11-10|Laboratório Sintético", date: "2026-11-10", lab: "Laboratório Sintético", confLevel: "ia", conferenteName: null },
        { key: "2026-11-11|Laboratório Sintético", date: "2026-11-11", lab: "Laboratório Sintético", confLevel: "c1", conferenteName: "Equipe Sintética" },
      ];
      await context.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        let body: unknown = [];
        if (path.endsWith("/exames/evolucao")) body = {
          columns,
          analytes: [{
            key: "sintetico", name: "Analito de Teste Sintético", unit: "mg/dL",
            refLow: null, refHigh: null, zones: null, trend: null, direction: "target",
            cells: Object.fromEntries(columns.map((c) => [c.key, {
              value: "123,45", valueNum: null, unit: "mg/dL", status: null, zone: null,
              documentId: 1, refLow: null, refHigh: null,
            }])),
          }],
        };
        if (path.endsWith("/resumo")) body = {
          client: { name: "Cliente Sintético" }, totalSessions: 0, completedSessions: 0,
          nextSession: null, protocols: [], proximas: [],
        };
        await route.fulfill({ json: body });
      });
      await page.goto("/area?preview_id=1&preview_name=Cliente%20Sintetico&preview_token=sintetico");
      await page.locator("nav").getByRole("button", { name: /EVOLUÇÃO/ }).click();
      await expect(page.getByRole("alert").filter({ hasText: WARNING })).toHaveCount(2);
      await expect(page.getByText("PRELIMINAR · IA", { exact: true })).toHaveCount(2);
      await expect(page.getByText("PRELIMINAR · C1", { exact: true })).toHaveCount(2);
      await expect(page.getByText("123,45", { exact: true }).first()).toBeVisible();
      await page.getByText("Planilha Comparativa", { exact: false }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `generated-artifacts/exames-preliminares/portal-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  });
}
