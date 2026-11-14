/**
 * Aba CLUB VIP da Área do Cliente (/area), celular e desktop.
 * API simulada com dados SINTÉTICOS (o servidor é provado em area-club-vip.test.ts).
 * Prova: aba no menu entre EVOLUÇÃO e COMUNICAÇÃO, quatro níveis, sem nível, erro, benefícios "em configuração",
 * convite que só navega para Meus Bolões (sem escrita), ida e volta, sem rolagem horizontal.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const NIVEIS = [["prata", "Prata"], ["ouro", "Ouro"], ["platinum", "Platinum"], ["diamond", "Diamond"]] as const;
const URL_AREA = "/area?preview_id=10&preview_name=Maria%20Sint%C3%A9tica&preview_token=fake";

async function semRolagemHorizontal(page: Page) {
  const l = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vis: window.innerWidth }));
  expect(l.doc).toBeLessThanOrEqual(l.vis + 1);
}

async function preparar(page: Page, club: { status: number; body: unknown }) {
  const escritas: string[] = [];
  await page.route("**/api/area-paciente/**", (r) => {
    const req = r.request();
    const u = new URL(req.url()).pathname;
    if (req.method() !== "GET") escritas.push(`${req.method()} ${u}`);
    if (u.endsWith("/club-vip")) return r.fulfill(json(club.body, club.status));
    if (u.endsWith("/boloes")) return r.fulfill(json({ aviso: "Aqui aparecem apenas as participações registradas pela clínica.", participacoes: [] }));
    if (u.endsWith("/resumo")) return r.fulfill(json({ client: { name: "Maria Sintética" }, protocolsCount: 0, activeProtocolsCount: 0, totalSessions: 0, completedSessions: 0, nextSession: null }));
    return r.fulfill(json([]));
  });
  return escritas;
}

for (const vp of [{ nome: "celular", width: 390, height: 844 }, { nome: "desktop", width: 1280, height: 800 }]) {
  test.describe(`Club VIP — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("aba entre EVOLUÇÃO e COMUNICAÇÃO, cabeçalho, benefícios em configuração e convite", async ({ page }) => {
      const escritas = await preparar(page, { status: 200, body: { nivel: "ouro" } });
      await page.goto(URL_AREA);
      const nav = page.locator("nav");
      await expect(nav.getByRole("button", { name: /EVOLUÇÃO/ })).toBeVisible({ timeout: 20000 });
      const rotulos = (await nav.getByRole("button").allInnerTexts()).map((t) => t.trim().toUpperCase());
      const i = rotulos.findIndex((t) => t.includes("CLUB VIP"));
      expect(i).toBeGreaterThan(-1);
      expect(rotulos[i - 1]).toContain("EVOLUÇÃO");
      expect(rotulos[i + 1]).toContain("COMUNICAÇÃO");

      await nav.getByRole("button", { name: /CLUB VIP/ }).click();
      const raiz = page.getByTestId("club-vip");
      await expect(raiz).toBeVisible();
      await expect(raiz.getByRole("heading", { name: "CLUB VIP" })).toBeVisible();
      await expect(raiz).toContainText("Um espaço de relacionamento, experiências e benefícios do Instituto Pádua");
      await expect(page.getByTestId("club-vip-nivel")).toHaveAttribute("data-nivel", "ouro");

      const areas = page.getByTestId("club-vip-area");
      await expect(areas).toHaveCount(3);
      await expect(page.getByTestId("club-vip-em-configuracao")).toHaveCount(3);
      for (const t of ["Conteúdos e orientações", "Experiências e encontros", "Relacionamento e atendimento"]) await expect(raiz).toContainText(t);

      // Nada comercial na tela. ("descontos" só pode aparecer na frase de independência do convite.)
      const texto = (await raiz.innerText()).toLowerCase();
      for (const proibido of ["r$", "upgrade", "assine", "black", "economize", "cashback"]) expect(texto).not.toContain(proibido);
      const semConvite = (await page.getByTestId("club-vip-beneficios").innerText()).toLowerCase();
      for (const proibido of ["desconto", "prioridade", "brinde", "gratuito", "grátis"]) expect(semConvite).not.toContain(proibido);

      const convite = page.getByTestId("club-vip-convite-boloes");
      await expect(convite).toContainText("Confraternização entre amigos");
      await expect(convite).toContainText("Em algumas ocasiões, o Dr. Caio e pessoas próximas organizam participações voluntárias em bolões oficiais das Loterias CAIXA");
      await expect(page.getByTestId("convite-independencia")).toContainText("facultativa");
      await expect(page.getByTestId("convite-independencia")).toContainText("Não participar não altera");
      await expect(convite).toContainText("dependem da modalidade oficial e dos comprovantes emitidos pelos canais autorizados");
      const cta = page.getByTestId("club-vip-cta-boloes");
      expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      await semRolagemHorizontal(page);
      await page.screenshot({ path: `generated-artifacts/club-vip-${vp.nome}.png`, fullPage: true });
      expect(escritas).toEqual([]);
    });

    test("CTA abre Meus Bolões existente e Voltar retorna ao Club VIP; do Início volta ao Início", async ({ page }) => {
      const escritas = await preparar(page, { status: 200, body: { nivel: "prata" } });
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /CLUB VIP/ }).click({ timeout: 20000 });
      await page.getByTestId("club-vip-cta-boloes").click();
      await expect(page.getByTestId("meus-boloes")).toBeVisible();
      await expect(page.getByTestId("boloes-vazio")).toBeVisible();
      await page.getByRole("button", { name: /Voltar ao Club VIP/ }).click();
      await expect(page.getByTestId("club-vip")).toBeVisible();

      // Caminho antigo pelo Início continua voltando ao Início.
      await page.locator("nav").getByRole("button", { name: /INÍCIO/ }).click();
      await page.getByRole("button", { name: "Meus Bolões" }).click();
      await expect(page.getByTestId("meus-boloes")).toBeVisible();
      await page.getByRole("button", { name: /Voltar ao início/ }).click();
      await expect(page.getByText("BEM-VINDO(A)")).toBeVisible();
      expect(escritas).toEqual([]);
    });

    for (const [valor, nome] of NIVEIS) {
      test(`nível ${nome} é exibido`, async ({ page }) => {
        await preparar(page, { status: 200, body: { nivel: valor } });
        await page.goto(URL_AREA);
        await page.locator("nav").getByRole("button", { name: /CLUB VIP/ }).click({ timeout: 20000 });
        const n = page.getByTestId("club-vip-nivel");
        await expect(n).toHaveAttribute("data-nivel", valor);
        await expect(n).toContainText(new RegExp(nome, "i"));
        await expect(page.getByTestId("club-vip-sem-nivel")).toHaveCount(0);
      });
    }

    test("sem nível disponível (null, valor desconhecido ou erro) nunca inventa nível", async ({ page }) => {
      await preparar(page, { status: 200, body: { nivel: null } });
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /CLUB VIP/ }).click({ timeout: 20000 });
      await expect(page.getByTestId("club-vip-sem-nivel")).toBeVisible();
      await expect(page.getByTestId("club-vip-nivel")).toHaveCount(0);

      // Valor fora dos quatro (por exemplo "black") também não vira nível na tela.
      await page.unroute("**/api/area-paciente/**");
      await preparar(page, { status: 200, body: { nivel: "black" } });
      await page.locator("nav").getByRole("button", { name: /INÍCIO/ }).click();
      await page.locator("nav").getByRole("button", { name: /CLUB VIP/ }).click();
      await expect(page.getByTestId("club-vip-sem-nivel")).toBeVisible();
      await expect(page.getByTestId("club-vip-nivel")).toHaveCount(0);
      await semRolagemHorizontal(page);
    });

    test("erro ao carregar o nível: aviso honesto, aba continua utilizável", async ({ page }) => {
      await preparar(page, { status: 500, body: { error: "x" } });
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /CLUB VIP/ }).click({ timeout: 20000 });
      await expect(page.getByTestId("club-vip-nivel-erro")).toBeVisible();
      await expect(page.getByTestId("club-vip-nivel")).toHaveCount(0);
      await expect(page.getByTestId("club-vip-cta-boloes")).toBeVisible();
    });
  });
}
