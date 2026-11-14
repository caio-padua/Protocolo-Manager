/**
 * Central de Bolões (gestor) e Meus Bolões (cliente) no navegador, celular e desktop.
 * API simulada com dados SINTÉTICOS (a lógica de servidor é provada nos testes de banco descartável).
 * Prova: fila de revisão, aprovação só com confirmação, três estados distintos para o cliente, sem rolagem horizontal.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

const FILA = [
  {
    id: 11, origem: "drive", nomeOriginal: "recibo-sintetico.pdf", mime: "application/pdf", bytes: 2048, status: "em_revisao",
    motivos: [{ codigo: "varias_candidatas", texto: "Mais de uma participação combina com este recibo. Escolha a correta." }],
    codigoRecibo: "SINT-1", extraido: { concurso: "0001", dataSorteio: "2026-12-31", cotas: 3, nomeImpresso: null, emissor: null, confianca: 0.93 },
    sugerida: null, criadoEm: "2026-11-14T12:00:00Z", decididoPor: null, motivoRejeicao: null, duplicadoDe: null, temArquivo: true,
  },
];
const PARTES = [
  { id: 1, cliente: { id: 10, nome: "Maria Sintética" }, campanha: { id: 1, nome: "Bolão sintético", concurso: "0001", dataSorteio: "2026-12-31" }, cotas: 3, pagamento: "confirmado", registro: "pendente_registro", entrega: "indisponivel", comprovante: null },
  { id: 2, cliente: { id: 11, nome: "João Sintético" }, campanha: { id: 1, nome: "Bolão sintético", concurso: "0001", dataSorteio: "2026-12-31" }, cotas: 3, pagamento: "nao_informado", registro: "pendente_registro", entrega: "indisponivel", comprovante: null },
];

async function semRolagemHorizontal(page: Page) {
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vis: window.innerWidth }));
  expect(largura.doc).toBeLessThanOrEqual(largura.vis + 1);
}

for (const vp of [{ nome: "celular", width: 390, height: 844 }, { nome: "desktop", width: 1280, height: 800 }]) {
  test.describe(`Central de Bolões — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("fila de revisão: aprovar exige escolha e confirmação; envia o corpo correto", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("padcom_collab_token", "e2e-fake-token");
        localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Gestora Sintética", role: "admin" }));
      });
      await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Gestora Sintética", role: "admin" } })));
      await page.route("**/api/boloes/gestao/resumo", (r) => r.fulfill(json({ config: { driveFolderId: null, autoAprovar: false } })));
      await page.route("**/api/boloes/gestao/recebimentos", (r) => r.fulfill(json({ recebimentos: FILA })));
      await page.route("**/api/boloes/gestao/participacoes", (r) => r.fulfill(json({ participacoes: PARTES, campanhas: [] })));
      await page.route("**/api/boloes/gestao/auditoria", (r) => r.fulfill(json({ eventos: [] })));
      let corpo: any = null;
      await page.route("**/api/boloes/gestao/recebimentos/11/aprovar", async (r) => { corpo = r.request().postDataJSON(); await r.fulfill(json({ comprovanteId: 99 }, 201)); });

      await page.goto("/boloes");
      await expect(page.getByTestId("central-boloes")).toBeVisible({ timeout: 20000 });
      const item = page.getByTestId("item-fila");
      await expect(item).toContainText("Mais de uma participação combina");
      await expect(item).toContainText("Pasta do Drive");
      await semRolagemHorizontal(page);
      await page.screenshot({ path: `generated-artifacts/boloes-central-${vp.nome}.png`, fullPage: true });

      const aprovar = item.getByRole("button", { name: /Aprovar e liberar/ });
      await expect(aprovar).toBeDisabled();
      await item.getByLabel("Liberar para qual participação?").selectOption("1");
      await expect(aprovar).toBeDisabled(); // falta a confirmação explícita
      await item.getByRole("checkbox").check();
      await expect(aprovar).toBeEnabled();
      const caixa = await aprovar.boundingBox();
      expect(caixa!.height).toBeGreaterThanOrEqual(44);
      await aprovar.click();
      await expect.poll(() => corpo).toEqual({ participacaoId: 1, confirmoReciboCaixaReal: true });
    });
  });

  test.describe(`Meus Bolões — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("três etapas distintas e comprovante só quando existe", async ({ page }) => {
      await page.route("**/api/area-paciente/boloes", (r) => r.fulfill(json({
        aviso: "Aqui aparecem apenas as participações registradas pela clínica.",
        participacoes: [
          { id: 1, campanha: { nome: "Bolão sintético A", concurso: "0001", dataSorteio: "2026-12-31" }, cotas: 3, status: "pendente_registro", registradaEm: null, comprovante: null, pagamento: "confirmado", entrega: "indisponivel", baixadoEm: null },
          { id: 2, campanha: { nome: "Bolão sintético B", concurso: "0002", dataSorteio: "2027-01-10" }, cotas: 2, status: "registrada", registradaEm: "2026-11-10T12:00:00Z", comprovante: { id: 5, tipo: "pdf", bytes: 4096, validadoEm: "2026-11-10T12:00:00Z", integridadeCodigo: "a1b2c3d4e5f6" }, pagamento: "nao_informado", entrega: "disponivel", baixadoEm: null },
        ],
      })));
      await page.route("**/api/area-paciente/**", (r) => {
        const u = r.request().url();
        if (u.endsWith("/boloes")) return r.fallback();
        if (u.endsWith("/resumo")) return r.fulfill(json({ client: { name: "Maria Sintética" }, protocolsCount: 0, activeProtocolsCount: 0, totalSessions: 0, completedSessions: 0, nextSession: null }));
        return r.fulfill(json([]));
      });
      await page.goto("/area?preview_id=10&preview_name=Maria%20Sint%C3%A9tica&preview_token=fake");
      await page.getByRole("button", { name: "Meus Bolões" }).click();
      const cards = page.getByTestId("bolao-card");
      await expect(cards).toHaveCount(2, { timeout: 20000 });

      const a = cards.nth(0);
      await expect(a.locator('[data-etapa="pagamento"]')).toHaveAttribute("data-estado", "feito");
      await expect(a.locator('[data-etapa="registro"]')).toHaveAttribute("data-estado", "aguarda");
      await expect(a.locator('[data-etapa="entrega"]')).toHaveAttribute("data-estado", "aguarda");
      await expect(a.getByTestId("sem-comprovante")).toBeVisible();
      await expect(a.getByRole("button", { name: /Baixar recibo/ })).toHaveCount(0);

      const b = cards.nth(1);
      await expect(b.locator('[data-etapa="pagamento"]')).toHaveAttribute("data-estado", "vazio");
      await expect(b.locator('[data-etapa="registro"]')).toHaveAttribute("data-estado", "feito");
      await expect(b).toContainText("a1b2c3d4e5f6");
      const baixar = b.getByRole("button", { name: /Baixar recibo da CAIXA/ });
      expect((await baixar.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await semRolagemHorizontal(page);
      await page.screenshot({ path: `generated-artifacts/boloes-cliente-${vp.nome}.png`, fullPage: true });
    });
  });
}
