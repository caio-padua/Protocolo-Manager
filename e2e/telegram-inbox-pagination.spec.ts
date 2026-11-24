import { test, expect, type Page } from "@playwright/test";

// Dados já utilizados pelos testes existentes; nenhuma mensagem real é enviada.
const client = { id: 42, name: "Ana Silva", cpf: "123.456.789-00", phone: "(11) 91234-5678",
  photoUrl: null, birthDate: "1985-01-01", status: "active" };
const message = (id: number, owner = 42) => ({
  id, texto: `Histórico ${owner} mensagem ${id}`, recebidaEm: new Date(1760000000000 + id * 1000).toISOString(),
  lida: true, direcao: "entrada",
});

async function prepare(page: Page, failOlder = false) {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Dr. Caio", role: "medico" }));
  });
  let olderAttempts = 0;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = [];
    if (path.endsWith("/collaborator/me")) body = { professional: { id: 1, name: "Dr. Caio", role: "medico" } };
    else if (/\/clients\/\d+\/fotos-corpo$/.test(path)) body = { angulos: [], series: [] };
    else if (/\/clients\/\d+$/.test(path)) body = { ...client, id: Number(path.split("/").at(-1)) };
    else if (path.endsWith("/clients")) body = [client, { ...client, id: 43, name: "Cliente de demonstração" }];
    else if (path.includes("/pulso-diario/")) body = [];
    else if (/\/cockpit\/\d+\/telegram-inbox$/.test(path)) {
      const owner = Number(path.split("/").at(-2));
      const pagina = Number(url.searchParams.get("pagina") ?? 1);
      const quantidade = Number(url.searchParams.get("quantidade") ?? 20);
      const direcao = url.searchParams.get("direcao") ?? "todas";
      if (pagina === 2 && failOlder && ++olderAttempts === 1) {
        await route.fulfill({ status: 503, json: { error: "indisponível" } });
        return;
      }
      // Sobreposição intencional simula uma nova mensagem deslocando o OFFSET.
      const ids = pagina === 1 ? Array.from({ length: 20 }, (_, i) => 45 - i)
        : pagina === 2 ? Array.from({ length: 20 }, (_, i) => 26 - i) : [6, 5, 4, 3, 2, 1];
      if (quantidade !== 20 || direcao !== "todas") {
        const filteredIds = Array.from({ length: 150 }, (_, i) => 150 - i)
          .filter(id => direcao === "todas" || (direcao === "entrada" ? id % 2 === 1 : id % 2 === 0));
        const batch = filteredIds.slice((pagina - 1) * quantidade, pagina * quantidade);
        body = {
          mensagens: batch.map(id => ({ ...message(id, owner), direcao: id % 2 ? "entrada" : "saida" })),
          naoLidas: 0,
          temMais: filteredIds.length > pagina * quantidade,
        };
      } else body = { mensagens: ids.map(id => message(id, owner)), naoLidas: 0, temMais: pagina < 3 };
    } else if (path.includes("telegram-inbox/")) body = { ok: true };
    await route.fulfill({ status: 200, json: body });
  });
}

test("vinte recentes, páginas antigas sem duplicatas e histórico independente por cliente", async ({ page }) => {
  await prepare(page);
  await page.goto("/cockpit/42/telegram");
  const panel = page.getByRole("region", { name: "Histórico Telegram" });
  await expect(panel.locator("[data-message-id]")).toHaveCount(20);
  await expect(panel.locator("[data-message-id]").first()).toHaveAttribute("data-message-id", "26");
  await panel.getByRole("button", { name: "Ver mais antigas" }).click();
  await expect(panel.locator("[data-message-id]")).toHaveCount(39);
  await panel.getByRole("button", { name: "Ver mais antigas" }).click();
  await expect(panel.locator("[data-message-id]")).toHaveCount(45);
  await expect(panel.getByRole("button", { name: "Ver mais antigas" })).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, "", "/cockpit/43/telegram");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(panel.locator("[data-message-id]")).toHaveCount(20);
  await expect(panel.getByText(/Histórico 42 mensagem/)).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, "", "/cockpit/42/telegram");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(panel.locator("[data-message-id]")).toHaveCount(20);
  await page.screenshot({ path: "generated-artifacts/telegram-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const box = await page.locator(".fixed.inset-y-0.left-0").first().boundingBox();
    return box ? box.x + box.width : 0;
  }).toBeLessThanOrEqual(0);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "generated-artifacts/telegram-mobile.png" });
  await expect(panel.getByRole("button", { name: "Ver mais antigas" })).toBeVisible();
});

test("falha nas antigas preserva mensagens e tenta novamente a mesma página", async ({ page }) => {
  await prepare(page, true);
  await page.goto("/cockpit/42/telegram");
  const panel = page.getByRole("region", { name: "Histórico Telegram" });
  await expect(panel.locator("[data-message-id]")).toHaveCount(20);
  await panel.getByRole("button", { name: "Ver mais antigas" }).click();
  await expect(panel.getByRole("alert")).toBeVisible({ timeout: 15000 });
  await expect(panel.locator("[data-message-id]")).toHaveCount(20);
  await panel.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(panel.locator("[data-message-id]")).toHaveCount(39);
});

for (const bHasMore of [false, true]) {
  test(`resposta antiga de A não altera mensagens nem controles de B com temMais=${bHasMore}`, async ({ page }) => {
    await prepare(page);
    let releaseOlder!: () => void;
    const olderGate = new Promise<void>(resolve => { releaseOlder = resolve; });
    let olderIntercepted!: () => void;
    const olderStarted = new Promise<void>(resolve => { olderIntercepted = resolve; });
    let olderReleased!: () => void;
    const olderFinished = new Promise<void>(resolve => { olderReleased = resolve; });
    const bRequests: Array<{ pagina: number; quantidade: number; direcao: string | null }> = [];
    const bIds = Array.from({ length: 50 }, (_, i) => 1100 - i);

    await page.route("**/api/cockpit/*/telegram-inbox?*", async route => {
      const url = new URL(route.request().url());
      const owner = Number(url.pathname.split("/").at(-2));
      const pagina = Number(url.searchParams.get("pagina"));
      if (owner === 42 && pagina === 2) {
        olderIntercepted();
        await olderGate;
        try {
          await route.fulfill({ json: {
            mensagens: [message(9001, 42)], naoLidas: 999, temMais: !bHasMore,
          } });
        } finally {
          olderReleased();
        }
        return;
      }
      if (owner === 43) {
        bRequests.push({
          pagina,
          quantidade: Number(url.searchParams.get("quantidade")),
          direcao: url.searchParams.get("direcao"),
        });
        await route.fulfill({ json: {
          mensagens: (pagina === 1 ? bIds : [1050, 1049])
            .map(id => ({ ...message(id, 43), direcao: "saida" })),
          naoLidas: 0, temMais: pagina === 1 && bHasMore,
        } });
        return;
      }
      await route.fallback();
    });

    try {
      await page.goto("/cockpit/42/telegram", { waitUntil: "domcontentloaded" });
      const panel = page.getByRole("region", { name: "Histórico Telegram" });
      const messages = panel.locator("[data-message-id]");
      const olderButton = panel.getByRole("button", { name: "Ver mais antigas" });
      const quantity = panel.getByLabel("Mensagens por lote");
      const direction = panel.getByLabel("Tipo de mensagem");
      const count = panel.getByRole("status").filter({ hasText: "mensagens exibidas" });
      await expect(messages).toHaveCount(20);
      await olderButton.click();
      await olderStarted;
      await expect(olderButton).toBeDisabled();
      await expect(olderButton).toHaveAttribute("aria-busy", "true");

      // Troca de rota no mesmo documento, preservando a corrida de requisições.
      await page.evaluate(() => {
        history.pushState({}, "", "/cockpit/43/telegram");
        dispatchEvent(new PopStateEvent("popstate"));
      });
      await expect(panel.getByText("Histórico 43 mensagem 1100", { exact: true })).toBeVisible();
      await quantity.selectOption("50");
      await direction.selectOption("saida");
      await expect.poll(() => bRequests.at(-1)).toEqual({
        pagina: 1, quantidade: 50, direcao: "saida",
      });
      const assertB = async () => {
        await expect(messages).toHaveCount(50);
        await expect.poll(() => messages.evaluateAll(elements =>
          elements.map(element => Number(element.getAttribute("data-message-id"))),
        )).toEqual([...bIds].reverse());
        await expect(panel.getByText(/Histórico 42 mensagem/)).toHaveCount(0);
        await expect(quantity).toHaveValue("50");
        await expect(direction).toHaveValue("saida");
        await expect(count).toHaveText(`50 mensagens exibidas${bHasMore ? " · há mensagens mais antigas" : ""}`);
        await expect(olderButton).toHaveCount(bHasMore ? 1 : 0);
        if (bHasMore) {
          await expect(olderButton).toBeEnabled();
          await expect(olderButton).toHaveAttribute("aria-busy", "false");
        }
        await expect(panel.getByRole("button", { name: "Tentar novamente" })).toHaveCount(0);
      };
      await assertB();

      releaseOlder();
      await olderFinished;
      // Deixa o navegador processar a liberação/cancelamento e os renders seguintes.
      await page.evaluate(() => new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ));
      await assertB();
      if (bHasMore) {
        await olderButton.click();
        await expect(messages).toHaveCount(52);
        expect(bRequests.at(-1)).toEqual({ pagina: 2, quantidade: 50, direcao: "saida" });
        await expect(messages.first()).toHaveAttribute("data-message-id", "1049");
        await expect(panel.getByText(/Histórico 42 mensagem/)).toHaveCount(0);
        await expect(olderButton).toHaveCount(0);
      }
    } finally {
      releaseOlder();
    }
  });
}

test("selecionar quantidade e tipo reinicia na página recente e filtra no servidor", async ({ page }) => {
  await prepare(page);
  await page.goto("/cockpit/42/telegram");
  const panel = page.getByRole("region", { name: "Histórico Telegram" });
  await expect(panel.locator("[data-message-id]")).toHaveCount(20);
  await panel.getByLabel("Mensagens por lote").selectOption("50");
  await expect(panel.locator("[data-message-id]")).toHaveCount(50);
  await panel.getByLabel("Tipo de mensagem").selectOption("entrada");
  await expect(panel.locator("[data-message-id]")).toHaveCount(50);
  await expect(panel.locator("[data-message-id]").first()).toHaveAttribute("data-message-id", "51");
  await expect(panel.getByRole("status").filter({ hasText: "mensagens exibidas" })).toContainText("50");
  await panel.getByRole("button", { name: "Ver mais antigas" }).click();
  await expect(panel.locator("[data-message-id]")).toHaveCount(75);
  await panel.getByLabel("Tipo de mensagem").selectOption("saida");
  await expect(panel.locator("[data-message-id]")).toHaveCount(50);
  await expect(panel.locator("[data-message-id]").first()).toHaveAttribute("data-message-id", "52");
  await panel.getByLabel("Mensagens por lote").selectOption("100");
  await expect(panel.locator("[data-message-id]")).toHaveCount(75);
  await expect(panel.getByRole("button", { name: "Ver mais antigas" })).toHaveCount(0);
  await panel.getByLabel("Controles do histórico").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "generated-artifacts/telegram-filtros-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const box = await page.locator(".fixed.inset-y-0.left-0").first().boundingBox();
    return box ? box.x + box.width : 0;
  }).toBeLessThanOrEqual(0);
  await panel.getByLabel("Controles do histórico").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "generated-artifacts/telegram-filtros-mobile.png" });
  await expect(panel.getByLabel("Mensagens por lote")).toBeVisible();
  await expect(panel.getByLabel("Tipo de mensagem")).toBeVisible();
});
