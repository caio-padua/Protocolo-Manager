import { expect, test, type Page } from "@playwright/test";

/**
 * Niveis do cliente (Prata, Ouro, Platinum, Diamond) no Cockpit da equipe, em computador e celular.
 * Sessao de colaborador sintetica e API simulada: prova a interface, nao o servidor
 * (servidor e banco sao provados nos testes de api-server com PostgreSQL descartavel e na API real).
 */
const NIVEIS = [
  ["prata", "PRATA"], ["ouro", "OURO"], ["platinum", "PLATINUM"], ["diamond", "DIAMOND"],
] as const;

type Estado = { plano: string; classificacao: string; puts: Array<Record<string, unknown>> };

async function preparar(page: Page, plano: string): Promise<Estado> {
  const estado: Estado = { plano, classificacao: "D", puts: [] };
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 101, name: "Profissional Sintético", role: "admin" }));
  });
  const cliente = () => ({
    id: 42, name: "Cliente Sintético Nível", cpf: "52998224725", email: "nivel@example.invalid", phone: "11900000000",
    status: "active", birthDate: null, address: null, photoUrl: null, empresaId: 5, locationId: null,
    clinicaOrigemEmpresaId: 5, preferredAgendaResourceIds: [], visitPreferencesRevision: 1,
    classificacao: estado.classificacao, plano: estado.plano,
    createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z",
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/collaborator/me") return json({ professional: { id: 101, name: "Profissional Sintético", role: "admin" } });
    if (pathname === "/api/clients") return json([cliente()]);
    if (pathname === "/api/clients/42" && req.method() === "GET") return json(cliente());
    if (pathname === "/api/clients/42" && (req.method() === "PUT" || req.method() === "PATCH")) {
      const corpo = req.postDataJSON() as Record<string, unknown>;
      estado.puts.push(corpo);
      if (typeof corpo.plano === "string" && !["prata", "ouro", "platinum", "diamond"].includes(corpo.plano)) {
        return json({ error: "plano inválido" }, 400);
      }
      if (typeof corpo.plano === "string") estado.plano = corpo.plano;
      if (typeof corpo.classificacao === "string") estado.classificacao = corpo.classificacao;
      return json(cliente());
    }
    if (pathname.startsWith("/api/pulso-diario/")) return json([]);
    return json([]);
  });
  return estado;
}

// O dev server carrega devagar (chamadas ao Clerk falham sem rede): espera so o HTML e depois o elemento.
const abrir = (page: Page) => page.goto("/cockpit/42/cadastro", { waitUntil: "domcontentloaded" });
test.describe.configure({ timeout: 120_000 });

for (const [descricao, viewport] of [
  ["computador", { width: 1366, height: 900 }],
  ["celular", { width: 402, height: 874 }],
] as const) {
  test.describe(`niveis do cliente no ${descricao}`, () => {
    test.use({ viewport });

    for (const [valor, rotulo] of NIVEIS) {
      test(`faixa de identidade mostra ${rotulo} legivel`, async ({ page }) => {
        await preparar(page, valor);
        await abrir(page);
        const chip = page.locator(`.cc-grade-plan span[data-plano="${valor}"]`);
        await expect(chip).toHaveText(new RegExp(`^${rotulo}$`, "i"), { timeout: 60_000 });
        const caixa = await chip.boundingBox();
        expect(caixa).not.toBeNull();
        expect(caixa!.x).toBeGreaterThanOrEqual(0);
        expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(viewport.width);
        // texto nao cortado: largura de conteudo cabe na caixa
        const cortado = await chip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(cortado).toBe(false);
        await page.locator(".cc-identity").screenshot({ path: `generated-artifacts/niveis-${valor}-${descricao}.png` });
      });
    }

    test("Categoria lista os niveis na ordem da hierarquia e marca o atual", async ({ page }) => {
      await preparar(page, "ouro");
      await abrir(page);
      const botoes = page.getByRole("button", { pressed: undefined }).filter({ hasText: /^(Prata|Ouro|Platinum|Diamond)$/ });
      await expect(botoes.first()).toBeVisible({ timeout: 60_000 });
      // a caixa alta vem do CSS (uppercase); o texto no HTML e o nome oficial
      expect((await botoes.allInnerTexts()).map((t) => t.toLowerCase())).toEqual(["prata", "ouro", "platinum", "diamond"]);
      await expect(page.getByRole("button", { name: "Ouro", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("button", { name: "Prata", exact: true })).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByText(/Bronze|Noir|Platina\b|Ródio/i)).toHaveCount(0);
      await page.getByRole("button", { name: "Ouro", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `generated-artifacts/niveis-categoria-${descricao}.png` });
    });

    test("trocar o nivel salva so o nivel escolhido e persiste ao recarregar", async ({ page }) => {
      const estado = await preparar(page, "prata");
      await abrir(page);
      await page.getByRole("button", { name: "Diamond", exact: true }).click({ timeout: 60_000 });
      await page.getByRole("button", { name: /salvar categoria/i }).click();
      await expect.poll(() => estado.puts.length).toBe(1);
      expect(estado.puts[0]).toEqual({ classificacao: "D", plano: "diamond" });
      await page.reload();
      await expect(page.locator('.cc-grade-plan span[data-plano="diamond"]')).toHaveText(/^diamond$/i, { timeout: 60_000 });
    });

    test("nivel antigo sem equivalente aparece como A REVISAR e nao e reclassificado sozinho", async ({ page }) => {
      const estado = await preparar(page, "legado:ouro");
      await abrir(page);
      const chip = page.locator('.cc-grade-plan span[data-plano="pendente"]');
      await expect(chip).toHaveText(/^a revisar$/i, { timeout: 60_000 });
      await expect(chip).toHaveAttribute("title", /Nível anterior preservado: ouro/);
      await expect(page.getByRole("status").filter({ hasText: "Nível anterior preservado: ouro" })).toBeVisible();
      for (const nome of ["Prata", "Ouro", "Platinum", "Diamond"]) {
        await expect(page.getByRole("button", { name: nome, exact: true })).toHaveAttribute("aria-pressed", "false");
      }
      await expect(page.getByRole("button", { name: /salvar categoria/i })).toBeDisabled();
      await page.locator(".cc-identity").screenshot({ path: `generated-artifacts/niveis-pendente-${descricao}.png` });
      await page.getByRole("status").filter({ hasText: "Nível anterior preservado" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `generated-artifacts/niveis-pendente-categoria-${descricao}.png` });
      // mudar so a classificacao nao grava nivel nenhum
      await page.getByRole("button", { name: "B", exact: true }).click();
      await page.getByRole("button", { name: /salvar categoria/i }).click();
      await expect.poll(() => estado.puts.length).toBe(1);
      expect(estado.puts[0]).toEqual({ classificacao: "B" });
      expect(estado.plano).toBe("legado:ouro");
      // escolher o nivel resolve a pendencia
      await page.getByRole("button", { name: "Platinum", exact: true }).click();
      await page.getByRole("button", { name: /salvar categoria/i }).click();
      await expect.poll(() => estado.puts.length).toBe(2);
      expect(estado.puts[1]).toEqual({ classificacao: "B", plano: "platinum" });
    });
  });
}
