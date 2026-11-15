/**
 * Área do Cliente (/area): abas MINHA CATEGORIA e GRUPO VIP, celular e desktop.
 * API simulada com dados SINTÉTICOS (o servidor é provado em area-minha-categoria.test.ts).
 * Prova: as duas abas são independentes; o GRUPO VIP não mostra nem consulta nível comercial; MINHA CATEGORIA mostra
 * só o nível cadastrado (4 níveis, sem nível, erro); CONVITES ESPECIAIS / CONEXÃO MILIONÁRIA só navega para
 * Meus Bolões (sem escrita); ida e volta; sem rolagem horizontal.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const NIVEIS = [["prata", "Prata"], ["ouro", "Ouro"], ["platinum", "Platinum"], ["diamond", "Diamond"]] as const;
const URL_AREA = "/area?preview_id=10&preview_name=Maria%20Sint%C3%A9tica&preview_token=fake";

async function semRolagemHorizontal(page: Page) {
  const l = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vis: window.innerWidth }));
  expect(l.doc).toBeLessThanOrEqual(l.vis + 1);
}

async function preparar(page: Page, categoria: { status: number; body: unknown }) {
  const escritas: string[] = [];
  const leituras: string[] = [];
  await page.route("**/api/area-paciente/**", (r) => {
    const req = r.request();
    const u = new URL(req.url()).pathname;
    if (req.method() !== "GET") escritas.push(`${req.method()} ${u}`);
    else leituras.push(u);
    if (u.endsWith("/minha-categoria")) return r.fulfill(json(categoria.body, categoria.status));
    if (u.endsWith("/boloes")) return r.fulfill(json({ aviso: "Aqui aparecem apenas as participações registradas pela clínica.", participacoes: [] }));
    if (u.endsWith("/resumo")) return r.fulfill(json({ client: { name: "Maria Sintética" }, protocolsCount: 0, activeProtocolsCount: 0, totalSessions: 0, completedSessions: 0, nextSession: null }));
    return r.fulfill(json([]));
  });
  return { escritas, leituras };
}

for (const vp of [{ nome: "celular", width: 390, height: 844 }, { nome: "desktop", width: 1280, height: 800 }]) {
  test.describe(`Minha Categoria e Grupo VIP — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("menu: MINHA CATEGORIA e GRUPO VIP são abas separadas entre EVOLUÇÃO e COMUNICAÇÃO", async ({ page }) => {
      await preparar(page, { status: 200, body: { nivel: "ouro" } });
      await page.goto(URL_AREA);
      const nav = page.locator("nav");
      await expect(nav.getByRole("button", { name: /EVOLUÇÃO/ })).toBeVisible({ timeout: 20000 });
      const rotulos = (await nav.getByRole("button").allInnerTexts()).map((t) => t.trim().toUpperCase());
      const cat = rotulos.findIndex((t) => t.includes("MINHA CATEGORIA"));
      const club = rotulos.findIndex((t) => t.includes("GRUPO VIP"));
      expect(cat).toBeGreaterThan(-1);
      expect(club).toBe(cat + 1);
      expect(rotulos[cat - 1]).toContain("EVOLUÇÃO");
      expect(rotulos[club + 1]).toContain("COMUNICAÇÃO");
      // Menu antigo preservado.
      for (const r of ["INÍCIO", "PROTOCOLOS", "AGENDA", "DOCUMENTOS", "ENVIAR", "DÚVIDAS", "SUPORTE"]) {
        expect(rotulos.some((t) => t.includes(r))).toBe(true);
      }
    });

    test("GRUPO VIP: sem nível comercial, sem consulta de nível, com CONVITES ESPECIAIS e CONEXÃO MILIONÁRIA", async ({ page }) => {
      // O servidor devolveria "ouro" se fosse perguntado: a tela não pode perguntar nem mostrar.
      const { escritas, leituras } = await preparar(page, { status: 200, body: { nivel: "ouro" } });
      await page.goto(URL_AREA);
      const nav = page.locator("nav");
      await nav.getByRole("button", { name: /GRUPO VIP/ }).click({ timeout: 20000 });
      const raiz = page.getByTestId("club-vip");
      await expect(raiz).toBeVisible();
      await expect(raiz.getByRole("heading", { name: "GRUPO VIP" })).toBeVisible();
      await expect(page.getByTestId("club-vip-como-funciona")).toContainText("por convite");
      await expect(page.getByTestId("club-vip-como-funciona")).toContainText("livre e espontânea vontade");
      await expect(page.getByTestId("club-vip-como-funciona")).toContainText("não depende da sua categoria");

      // Nenhum nível comercial dentro do Grupo VIP.
      await expect(page.getByTestId("club-vip-nivel-card")).toHaveCount(0);
      await expect(page.getByTestId("club-vip-nivel")).toHaveCount(0);
      await expect(page.getByTestId("club-vip-sem-nivel")).toHaveCount(0);
      await expect(page.getByTestId("minha-categoria-nivel")).toHaveCount(0);
      const texto = (await raiz.innerText()).toLowerCase();
      for (const nivel of ["prata", "ouro", "platinum", "diamond", "nível", "nivel"]) expect(texto).not.toContain(nivel);
      // Nenhuma leitura de categoria/nível ao abrir o Grupo VIP.
      expect(leituras.filter((u) => /minha-categoria|club-vip/.test(u))).toEqual([]);

      // Benefícios continuam "em configuração", sem nada comercial.
      await expect(page.getByTestId("club-vip-area")).toHaveCount(3);
      await expect(page.getByTestId("club-vip-em-configuracao")).toHaveCount(3);
      for (const proibido of ["r$", "upgrade", "assine", "black", "economize", "cashback"]) expect(texto).not.toContain(proibido);
      const beneficios = (await page.getByTestId("club-vip-beneficios").innerText()).toLowerCase();
      for (const proibido of ["desconto", "prioridade", "brinde", "gratuito", "grátis"]) expect(beneficios).not.toContain(proibido);

      // CONVITES ESPECIAIS > CONEXÃO MILIONÁRIA.
      const secao = page.getByTestId("club-vip-convites-especiais");
      await expect(secao.getByRole("heading", { name: "CONVITES ESPECIAIS" })).toBeVisible();
      const convite = page.getByTestId("club-vip-convite-boloes");
      await expect(secao).toContainText("Convites opcionais");
      await expect(convite.getByRole("heading", { name: "CONEXÃO MILIONÁRIA" })).toBeVisible();
      await expect(convite).toContainText("bolões oficiais das Loterias CAIXA");
      const indep = page.getByTestId("convite-independencia");
      await expect(indep).toContainText("facultativo");
      await expect(indep).toContainText("separado dos serviços médicos");
      await expect(indep).toContainText("categoria");
      await expect(indep).toContainText("tratamentos, mensalidades e descontos");
      await expect(indep).toContainText("Não participar não altera");
      await expect(convite).toContainText("não emite bilhete, não faz aposta e não cobra");
      const cta = page.getByTestId("club-vip-cta-boloes");
      await expect(cta).toContainText("Consultar Meus Bolões");
      expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      await semRolagemHorizontal(page);
      await page.screenshot({ path: `generated-artifacts/club-vip-${vp.nome}.png`, fullPage: true });
      expect(escritas).toEqual([]);
    });

    test("CONEXÃO MILIONÁRIA abre Meus Bolões existente e Voltar retorna ao Grupo VIP; do Início volta ao Início", async ({ page }) => {
      const { escritas } = await preparar(page, { status: 200, body: { nivel: "prata" } });
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /GRUPO VIP/ }).click({ timeout: 20000 });
      await page.getByTestId("club-vip-cta-boloes").click();
      await expect(page.getByTestId("meus-boloes")).toBeVisible();
      await expect(page.getByTestId("boloes-vazio")).toBeVisible();
      await page.getByRole("button", { name: /Voltar ao Grupo VIP/ }).click();
      await expect(page.getByTestId("club-vip")).toBeVisible();

      // Caminho antigo pelo Início continua voltando ao Início.
      await page.locator("nav").getByRole("button", { name: /INÍCIO/ }).click();
      await page.getByRole("button", { name: "Meus Bolões" }).click();
      await expect(page.getByTestId("meus-boloes")).toBeVisible();
      await page.getByRole("button", { name: /Voltar ao início/ }).click();
      await expect(page.getByText("BEM-VINDO(A)")).toBeVisible();
      expect(escritas).toEqual([]);
    });

    test("MINHA CATEGORIA: aba independente, sem convite, sem benefício e sem preço", async ({ page }) => {
      const { escritas, leituras } = await preparar(page, { status: 200, body: { nivel: "ouro" } });
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /MINHA CATEGORIA/ }).click({ timeout: 20000 });
      const raiz = page.getByTestId("minha-categoria");
      await expect(raiz.getByRole("heading", { name: "MINHA CATEGORIA" })).toBeVisible();
      await expect(page.getByTestId("minha-categoria-nivel")).toHaveAttribute("data-nivel", "ouro");
      await expect(page.getByTestId("minha-categoria-notas")).toContainText("independente do Grupo VIP");
      expect(leituras.filter((u) => u.endsWith("/minha-categoria"))).toHaveLength(1);

      // Nada de Grupo VIP, bolões, benefícios inventados ou preço dentro de Minha Categoria.
      await expect(page.getByTestId("club-vip")).toHaveCount(0);
      await expect(page.getByTestId("club-vip-convite-boloes")).toHaveCount(0);
      const texto = (await raiz.innerText()).toLowerCase();
      for (const proibido of ["r$", "desconto", "upgrade", "brinde", "prioridade", "cashback", "bolão", "bolões", "conexão milionária", "black"]) {
        expect(texto).not.toContain(proibido);
      }
      await semRolagemHorizontal(page);
      await page.screenshot({ path: `generated-artifacts/minha-categoria-${vp.nome}.png`, fullPage: true });
      expect(escritas).toEqual([]);
    });

    for (const [valor, nome] of NIVEIS) {
      test(`MINHA CATEGORIA exibe o nível ${nome}`, async ({ page }) => {
        await preparar(page, { status: 200, body: { nivel: valor } });
        await page.goto(URL_AREA);
        await page.locator("nav").getByRole("button", { name: /MINHA CATEGORIA/ }).click({ timeout: 20000 });
        const n = page.getByTestId("minha-categoria-nivel");
        await expect(n).toHaveAttribute("data-nivel", valor);
        await expect(n).toContainText(new RegExp(nome, "i"));
        await expect(page.getByTestId("minha-categoria-sem-nivel")).toHaveCount(0);
      });
    }

    test("MINHA CATEGORIA sem nível (null ou valor desconhecido) nunca inventa nível", async ({ page }) => {
      await preparar(page, { status: 200, body: { nivel: null } });
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /MINHA CATEGORIA/ }).click({ timeout: 20000 });
      await expect(page.getByTestId("minha-categoria-sem-nivel")).toBeVisible();
      await expect(page.getByTestId("minha-categoria-nivel")).toHaveCount(0);

      // Valor fora dos quatro (por exemplo "black") também não vira nível na tela.
      await page.unroute("**/api/area-paciente/**");
      await preparar(page, { status: 200, body: { nivel: "black" } });
      await page.locator("nav").getByRole("button", { name: /INÍCIO/ }).click();
      await page.locator("nav").getByRole("button", { name: /MINHA CATEGORIA/ }).click();
      await expect(page.getByTestId("minha-categoria-sem-nivel")).toBeVisible();
      await expect(page.getByTestId("minha-categoria-nivel")).toHaveCount(0);
      await semRolagemHorizontal(page);
    });

    test("MINHA CATEGORIA com erro de carga: aviso honesto; o Grupo VIP continua utilizável", async ({ page }) => {
      await preparar(page, { status: 500, body: { error: "x" } });
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /MINHA CATEGORIA/ }).click({ timeout: 20000 });
      await expect(page.getByTestId("minha-categoria-erro")).toBeVisible();
      await expect(page.getByTestId("minha-categoria-nivel")).toHaveCount(0);
      await page.locator("nav").getByRole("button", { name: /GRUPO VIP/ }).click();
      await expect(page.getByTestId("club-vip-cta-boloes")).toBeVisible();
    });
  });
}
