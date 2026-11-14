/**
 * Menu lateral do Manager: CLUBE VIP > Conexão Milionária (mesma rota /boloes), celular e desktop.
 * API simulada com dados SINTÉTICOS; nenhuma escrita. Prova: grupo novo com 1 filho, sem duplicidade com o item
 * antigo "Central de Bolões", mesma rota, sem confundir com categorias comerciais, gestão continua atrás do
 * CollaboratorGate (sem sessão ou sessão recusada pelo servidor nunca mostra a Central).
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const PROF = { id: 1, name: "Gestora Sintética", role: "admin" };

async function sessao(page: Page) {
  await page.addInitScript((p) => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify(p));
  }, PROF);
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: PROF })));
}

async function simularBoloes(page: Page) {
  const escritas: string[] = [];
  await page.route("**/api/boloes/**", (r) => {
    const m = r.request().method();
    const u = new URL(r.request().url()).pathname;
    if (m !== "GET") escritas.push(`${m} ${u}`);
    if (u.endsWith("/resumo")) return r.fulfill(json({ config: { driveFolderId: null, autoAprovar: false } }));
    if (u.endsWith("/recebimentos")) return r.fulfill(json({ recebimentos: [] }));
    if (u.endsWith("/participacoes")) return r.fulfill(json({ participacoes: [], campanhas: [] }));
    if (u.endsWith("/auditoria")) return r.fulfill(json({ eventos: [] }));
    return r.fulfill(json({}));
  });
  return escritas;
}

for (const vp of [{ nome: "celular", width: 390, height: 844 }, { nome: "desktop", width: 1280, height: 800 }]) {
  test.describe(`Menu CLUBE VIP — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("grupo CLUBE VIP com um único filho Conexão Milionária apontando para /boloes", async ({ page }) => {
      await sessao(page);
      const escritas = await simularBoloes(page);
      await page.goto("/boloes");
      await expect(page.getByTestId("central-boloes")).toBeVisible({ timeout: 20000 });
      if (vp.width < 768) await page.locator("div.md\\:hidden button").first().click();

      const aside = page.locator("nav").filter({ has: page.getByText("CLUBE VIP", { exact: true }) }).first();
      await expect(aside.getByText("CLUBE VIP", { exact: true })).toHaveCount(1);
      const links = aside.locator('a[href$="/boloes"]');
      await expect(links).toHaveCount(1); // um só link para /boloes em todo o menu
      await expect(links.first()).toContainText("Conexão Milionária");
      await expect(aside.getByText("Central de Bolões")).toHaveCount(0); // item antigo não ficou duplicado

      // Ordem e conteúdo: o grupo fica logo depois de "Área do Cliente" e tem só um filho.
      const nomes = await aside.locator("span.uppercase").allInnerTexts();
      const i = nomes.findIndex((t) => t.trim().toUpperCase() === "CLUBE VIP");
      expect(i).toBeGreaterThan(0);
      expect(nomes[i - 1].trim().toUpperCase()).toContain("ÁREA DO CLIENTE");

      // Não confunde programa com categoria comercial.
      const texto = (await aside.innerText()).toLowerCase();
      for (const nivel of ["prata", "ouro", "platinum", "diamond", "minha categoria"]) expect(texto).not.toContain(nivel);

      // O item "O Ato Médico" não leva mais a /boloes (o único link é o do CLUBE VIP, já provado acima).
      await expect(page.locator('a[href$="/boloes"]')).toHaveCount(1);
      expect(escritas).toEqual([]);
    });

    test("clicar em Conexão Milionária abre a MESMA Central existente em /boloes", async ({ page }) => {
      await sessao(page);
      await simularBoloes(page);
      await page.goto("/");
      if (vp.width < 768) await page.locator("div.md\\:hidden button").first().click();
      await page.locator('a[href$="/boloes"]').first().click();
      await expect(page).toHaveURL(/\/boloes$/);
      await expect(page.getByTestId("central-boloes")).toBeVisible({ timeout: 20000 });
    });

    test("segurança: sem sessão a Central não abre (vai para o login)", async ({ page }) => {
      const gestao: string[] = [];
      await page.route("**/api/boloes/**", (r) => { gestao.push(r.request().url()); return r.fulfill(json({}, 401)); });
      await page.goto("/boloes");
      await expect(page).toHaveURL(/\/login/, { timeout: 20000 });
      await expect(page.getByTestId("central-boloes")).toHaveCount(0);
      expect(gestao).toEqual([]); // nem consulta o backend de gestão
    });

    test("segurança: token recusado pelo servidor não mostra a Central", async ({ page }) => {
      await page.addInitScript((p) => {
        localStorage.setItem("padcom_collab_token", "token-invalido");
        localStorage.setItem("padcom_collab_prof", JSON.stringify(p));
      }, PROF);
      await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ error: "Sessão inválida" }, 401)));
      await page.route("**/api/boloes/**", (r) => r.fulfill(json({ error: "Não autorizado" }, 401)));
      await page.goto("/boloes");
      await expect(page).toHaveURL(/\/login/, { timeout: 20000 });
      await expect(page.getByTestId("central-boloes")).toHaveCount(0);
    });
  });
}
