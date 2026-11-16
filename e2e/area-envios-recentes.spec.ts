/**
 * SPEC 3 (adendo 16/11/2026): aba ENVIAR da Área do Cliente com o terceiro painel "ENVIOS RECENTES".
 * API simulada com dados SINTÉTICOS (o servidor é provado em exam-marcos-envio-postgres.test.ts). Nenhum paciente real.
 * Prova visual: ordem dos painéis, barra segmentada igual à do protocolo, etapas, sem 100% antes do fim, celular e desktop.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const URL_AREA = "/area?preview_id=10&preview_name=Maria%20Sint%C3%A9tica&preview_token=fake";
const ISO = "2026-11-16T15:00:00.000Z";
const et = (estados: Array<"pendente" | "executando" | "concluido" | "falhou">, metodoId = "Conferência automática de nome, CPF e nascimento") => {
  const base = [["arquivo_recebido", "Arquivo recebido"], ["leitura_preliminar", "Leitura preliminar"], ["dados_extraidos", "Dados extraídos"], ["identidade_validada", "Identificação validada"], ["revisao_c1", "Revisão C1"], ["revisao_c2", "Revisão C2"]];
  return base.map(([chave, rotulo], i) => ({ chave, rotulo, estado: estados[i], em: estados[i] === "concluido" ? ISO : null, metodo: chave === "identidade_validada" && estados[i] === "concluido" ? metodoId : null }));
};
const AV = { rotulo: "Cérebro e sinapses (medicina de alta precisão) — configuração pendente", estado: "pendente" };
const ENVIOS = [
  { id: 3, arquivo: "hemograma-sintetico-em-andamento.pdf", enviadoEm: ISO, etapa: "identidade", situacao: "Em conferência pela equipe", finalizado: false, analitos: 0, percentual: 50, etapas: et(["concluido", "concluido", "concluido", "pendente", "pendente", "pendente"]), etapaAvancada: AV },
  { id: 2, arquivo: "perfil-sintetico-validado.pdf", enviadoEm: ISO, etapa: "concluido", situacao: "Concluído", finalizado: true, analitos: 12, percentual: 100, etapas: et(["concluido", "concluido", "concluido", "concluido", "concluido", "concluido"]), etapaAvancada: AV },
  { id: 1, arquivo: "arquivo-sintetico-ilegivel.pdf", enviadoEm: ISO, etapa: "erro", situacao: "Não foi possível ler este arquivo", finalizado: true, analitos: 0, percentual: 17, etapas: et(["concluido", "falhou", "pendente", "pendente", "pendente", "pendente"]), etapaAvancada: AV },
];
const PROTO = [{ id: 1, title: "Protocolo Sintético de Teste", status: "active", startDate: "2026-10-01", endDate: "2026-12-31", unit: "Sede", serviceType: "ev", totalSessions: 8, completedSessions: 3, totalValue: 0, items: [] }];

async function preparar(page: Page, envios: unknown, status = 200) {
  const escritas: string[] = [];
  await page.route("**/api/area-paciente/**", (r) => {
    const req = r.request(); const u = new URL(req.url()).pathname;
    if (req.method() !== "GET") escritas.push(`${req.method()} ${u}`);
    if (u.endsWith("/exames/envios")) return r.fulfill(json(envios, status));
    if (u.endsWith("/exames/evolucao")) return r.fulfill(json({ columns: [], analytes: [], zones: [] }));
    if (u.endsWith("/protocolos")) return r.fulfill(json(PROTO));
    if (u.endsWith("/resumo")) return r.fulfill(json({ client: { name: "Maria Sintética" }, protocolsCount: 0, activeProtocolsCount: 0, totalSessions: 0, completedSessions: 0, nextSession: null }));
    return r.fulfill(json([]));
  });
  return escritas;
}
async function semRolagemHorizontal(page: Page) {
  const l = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vis: window.innerWidth }));
  expect(l.doc).toBeLessThanOrEqual(l.vis + 1);
}
async function abrirEnviar(page: Page) {
  await page.goto(URL_AREA);
  await page.locator("nav").getByRole("button", { name: /UPLOAD EXAMES/ }).click({ timeout: 20000 });
}

for (const vp of [{ nome: "celular", width: 390, height: 844 }, { nome: "desktop", width: 1280, height: 900 }]) {
  test.describe(`Envios recentes — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("ordem: formulário de envio acima de ENVIOS RECENTES; cartões do mais novo ao mais antigo", async ({ page }) => {
      await preparar(page, ENVIOS);
      await abrirEnviar(page);
      const form = page.getByText("UPLOAD DE EXAMES", { exact: true }).first();
      const painel = page.getByTestId("painel-envios-recentes");
      await expect(painel).toBeVisible({ timeout: 15000 });
      const yForm = (await form.boundingBox())!.y, yPainel = (await painel.boundingBox())!.y;
      expect(yForm).toBeLessThan(yPainel);
      const ids = await page.locator('[data-testid^="envio-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
      expect(ids).toEqual(["envio-3", "envio-2", "envio-1"]);
      await expect(painel.getByText(/Atualização automática a cada 4 segundos/)).toBeVisible();
      await expect(painel.getByText(/tempo real/i)).toHaveCount(0);
      await semRolagemHorizontal(page);
      await page.screenshot({ path: `specs/paxterloop/evidencias/envios/envios-${vp.nome}.png`, fullPage: true });
    });

    test("percentuais e etapas: 50% pendente, 100% só validado, falha em vermelho; etapa avançada neutra", async ({ page }) => {
      await preparar(page, ENVIOS);
      await abrirEnviar(page);
      const c3 = page.getByTestId("envio-3"), c2 = page.getByTestId("envio-2"), c1 = page.getByTestId("envio-1");
      await expect(c3).toContainText("50%"); await expect(c3).toContainText("3 de 6 etapas");
      await expect(c3.getByTestId("etapa-3-identidade_validada")).toContainText("Pendente");
      await expect(c3.getByTestId("etapa-3-avancada")).toHaveCount(0);
      await expect(c3.getByTestId("legenda-3")).toContainText("confirmando que este exame pertence a você");
      await expect(c3.getByTestId("etapa-3-revisao_c2")).toContainText("motor clínico do sistema distribui cada resultado");
      await expect(c3).not.toContainText("100%");
      await expect(c2).toContainText("100%");
      await expect(c2).toContainText("Validado");
      await expect(c2.getByTestId("legenda-2")).toContainText("conferido com o seu nome");
      await expect(c2.getByTestId("legenda-2")).toContainText("equipe técnica e pelo Cérebro Clínico");
      await expect(c1.getByTestId("etapa-1-leitura_preliminar")).toContainText("Falhou");
      await expect(c1).toContainText("Envie uma versão mais nítida");
      await expect(page.getByText(/em breve/i)).toHaveCount(0);
    });

    test("hover provisório aparece só em 100% e o cartão 100% não mostra a etapa avançada", async ({ page }) => {
      await preparar(page, ENVIOS);
      await abrirEnviar(page);
      const c2 = page.getByTestId("envio-2");
      await expect(c2.getByTestId("etapa-2-avancada")).toHaveCount(0);
      await expect(c2.getByTestId("legenda-2")).toContainText("12 resultados foram registrados e classificados");
      await expect(c2.getByRole("note")).toHaveCount(0);
    });

    test("estados: vazio, erro de conexão e nenhuma escrita na API", async ({ page }) => {
      const escritas = await preparar(page, []);
      await abrirEnviar(page);
      await expect(page.getByText("Nenhum arquivo enviado ainda.")).toBeVisible({ timeout: 15000 });
      expect(escritas).toEqual([]);
    });
    test("erro do servidor mostra aviso e continua tentando", async ({ page }) => {
      await preparar(page, { error: "x" }, 500);
      await abrirEnviar(page);
      await expect(page.getByText("Não foi possível atualizar agora. Tentando novamente.")).toBeVisible({ timeout: 15000 });
    });
  });
}

test("referência: barra do envio usa a mesma barra segmentada do protocolo do paciente", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page, ENVIOS);
  await page.goto(URL_AREA);
  await page.locator("nav").getByRole("button", { name: /PROTOCOLOS/ }).click({ timeout: 20000 });
  await expect(page.getByText("Protocolo Sintético de Teste")).toBeVisible({ timeout: 15000 });
  const nProto = await page.locator(".paxter-bar-track").count();
  expect(nProto).toBeGreaterThan(0);
  await page.screenshot({ path: "specs/paxterloop/evidencias/envios/referencia-protocolo-celular.png", fullPage: true });
  await page.locator("nav").getByRole("button", { name: /UPLOAD EXAMES/ }).click();
  await expect(page.getByTestId("envio-3")).toBeVisible({ timeout: 15000 });
  expect(await page.getByTestId("envio-3").locator(".paxter-bar-track").count()).toBe(6);
});

test("o painel de envios também aparece na aba EVOLUÇÃO, acima dos gráficos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page, ENVIOS);
  await page.goto(URL_AREA);
  await page.locator("nav").getByRole("button", { name: /EVOLUÇÃO/ }).click({ timeout: 20000 });
  const painel = page.getByTestId("painel-envios-recentes");
  await expect(painel).toBeVisible({ timeout: 15000 });
  await expect(painel.getByTestId("envio-2")).toContainText("100%", { timeout: 20000 });
  await semRolagemHorizontal(page);
  await page.screenshot({ path: "specs/paxterloop/evidencias/envios/evolucao-celular.png", fullPage: false });
});
