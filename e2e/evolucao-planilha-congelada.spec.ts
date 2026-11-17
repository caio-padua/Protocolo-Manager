import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/**
 * Área do Cliente > Evolução: cabeçalho da planilha congelado, botões de tamanho único,
 * ferramentas em sanfona e gráfico já aberto no topo. 100% sintético (API interceptada; nenhum dado real).
 */
const ZONES = [
  { key: "below", name: "ALERTA", color: "#c0392b", low: null, high: 1.0 },
  { key: "t1", name: "ATENCAO", color: "#e67e22", low: 1.0, high: 1.5 },
  { key: "t2", name: "INSUFICIENTE", color: "#d4ac0d", low: 1.5, high: 2.0 },
  { key: "t3", name: "ACEITAVEL", color: "#2e8b57", low: 2.0, high: 2.5 },
  { key: "above", name: "EXCELENTE", color: "#1e8449", low: 2.5, high: null },
];
const zonaDe = (v: number) => ZONES.find((z) => (z.low == null || v >= z.low) && (z.high == null || v < z.high)) ?? ZONES[4];

function payload() {
  const columns = Array.from({ length: 6 }, (_, i) => ({
    key: `c${i}`,
    date: new Date(Date.UTC(2026, 0, 1 + i * 30)).toISOString().slice(0, 10),
    lab: "Laboratório Sintético",
    confLevel: "c2",
    conferenteName: null,
    conferenteCargo: null,
  }));
  const analytes = Array.from({ length: 40 }, (_, a) => ({
    key: `sint_${a}`,
    name: `Analito Sintético ${String(a + 1).padStart(2, "0")}`,
    unit: "mg/dL",
    refLow: "1.5",
    refHigh: "2.5",
    direction: "higher_better",
    zones: ZONES,
    trend: "subiu",
    cells: Object.fromEntries(
      columns.map((c, i) => {
        // O primeiro analito tem MAIS pontos que os demais (o painel abre o gráfico do que tem mais pontos).
        if (a > 0 && i > 2) return [c.key, undefined];
        const v = Number((0.6 + ((i * 0.37 + a * 0.11) % 2.4)).toFixed(2));
        const z = zonaDe(v);
        return [c.key, { value: v.toFixed(2).replace(".", ","), valueNum: v, unit: "mg/dL", status: null, documentId: 1000 + i, zone: { key: z.key, name: z.name, color: z.color } }];
      }).filter(([, v]) => v !== undefined),
    ),
  }));
  return { columns, analytes };
}

async function abrir(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (path === "/api/area-paciente/exames/evolucao") return json(payload());
    if (path === "/api/area-paciente/resumo")
      return json({ client: { name: "Cliente Sintetico", cpf: null }, totalSessions: 0, completedSessions: 0, nextSession: null, protocols: [], proximas: [] });
    return json([]);
  });
  await page.goto("/area?preview_id=1&preview_name=Cliente%20Sintetico&preview_token=sintetico");
  await page.getByRole("button", { name: /EVOLUÇÃO/i }).first().click();
  await expect(page.getByTestId("evolucao-ferramentas")).toBeVisible({ timeout: 20000 });
}

fs.mkdirSync("screenshots/evolucao", { recursive: true });

for (const vp of [{ nome: "celular", width: 402, height: 874 }, { nome: "desktop", width: 1366, height: 900 }]) {
  test.describe(`Evolução congelada — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width <= 768 });

    test("cabeçalho da planilha fica preso logo abaixo da faixa superior ao rolar", async ({ page }) => {
      await abrir(page);
      const cab = page.getByTestId("evolucao-cabecalho-congelado");
      await cab.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 900));
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const topbar = document.querySelector("header")!.getBoundingClientRect();
        const c = document.querySelector("[data-testid=evolucao-cabecalho-congelado]")!.getBoundingClientRect();
        return { topbarBottom: topbar.bottom, cabTop: c.top, cabBottom: c.bottom, scrollY: window.scrollY };
      });
      expect(m.scrollY).toBeGreaterThan(300);
      // preso: encostado na base da faixa superior, sem ficar escondido embaixo dela nem solto no meio da tela
      expect(Math.abs(m.cabTop - m.topbarBottom)).toBeLessThanOrEqual(2);
      await expect(cab.getByText("Faixinha de cor")).toBeVisible();
      await expect(cab.getByText("Laboratório Sintético").first()).toBeVisible();
      await page.screenshot({ path: `screenshots/evolucao/congelada-${vp.nome}.png` });
    });

    test("cabeçalho acompanha a rolagem lateral da planilha", async ({ page }) => {
      await abrir(page);
      const mov = await page.evaluate(async () => {
        const corpo = document.querySelector<HTMLElement>("[data-testid=evolucao-planilha-corpo]")!;
        const cab = document.querySelector<HTMLElement>("[data-testid=evolucao-cabecalho-congelado] .overflow-x-auto")!;
        const largura = { corpo: corpo.scrollWidth, visivel: corpo.clientWidth, cab: cab.scrollWidth };
        corpo.scrollLeft = 120;
        await new Promise((r) => setTimeout(r, 200));
        return { largura, corpo: corpo.scrollLeft, cab: cab.scrollLeft };
      });
      expect(mov.largura.corpo, "a planilha precisa rolar para o lado neste teste").toBeGreaterThan(mov.largura.visivel);
      expect(mov.corpo).toBeGreaterThan(0);
      expect(mov.cab, JSON.stringify(mov)).toBe(mov.corpo);
    });

    test("botões das faixas e dos gráficos têm o mesmo tamanho", async ({ page }) => {
      await abrir(page);
      const caixas = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid=evolucao-ferramentas] #evolucao-ferramentas-corpo .grid button")).map((b) => {
          const r = b.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) };
        }),
      );
      expect(caixas.length).toBe(11); // 1 "Todas" + 5 faixas + 5 layouts
      expect(new Set(caixas.map((c) => c.h)).size).toBe(1);
      expect(new Set(caixas.map((c) => c.w)).size).toBe(1);
      await page.getByTestId("evolucao-ferramentas").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `screenshots/evolucao/ferramentas-${vp.nome}.png` });
    });

    test("ferramentas minimizam e maximizam", async ({ page }) => {
      await abrir(page);
      const corpo = page.locator("#evolucao-ferramentas-corpo");
      await expect(corpo).toBeVisible();
      await page.getByRole("button", { name: /Ferramentas da planilha/ }).click();
      await expect(corpo).toHaveCount(0);
      await page.getByRole("button", { name: /Ferramentas da planilha/ }).click();
      await expect(corpo).toBeVisible();
    });

    test("gráfico já aparece no topo e nada interno vaza para o cliente", async ({ page }) => {
      await abrir(page);
      await expect(page.getByText(/Gráficos abertos \(1\)/)).toBeVisible();
      const pos = await page.evaluate(() => {
        const cab = Array.from(document.querySelectorAll("span")).find((s) => /Gráficos abertos/.test(s.textContent ?? ""))!.getBoundingClientRect();
        const planilha = document.querySelector("[data-testid=evolucao-cabecalho-congelado]")!.getBoundingClientRect();
        return { graficoTop: cab.top + window.scrollY, planilhaTop: planilha.top + window.scrollY };
      });
      expect(pos.graficoTop).toBeLessThan(pos.planilhaTop);
      await expect(page.getByText("Cadastro de Faixas de TODOS os exames")).toHaveCount(0);
      await expect(page.getByText(/Envios recentes/i)).toHaveCount(0);
      await expect(page.getByTestId("deex-painel")).toHaveCount(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `screenshots/evolucao/topo-${vp.nome}.png` });
    });
  });
}

test("tema escuro: cabeçalho congelado e planilha legíveis (texto claro sobre fundo escuro)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await abrir(page);
  await page.getByRole("button", { name: "Mudar para tema escuro" }).click();
  await page.getByTestId("evolucao-cabecalho-congelado").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const lum = (c: string) => {
      const v = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      return (0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]) / 255;
    };
    const cab = document.querySelector("[data-testid=evolucao-cabecalho-congelado]") as HTMLElement;
    const rot = cab.querySelector("button[aria-pressed]") as HTMLElement;
    const nome = Array.from(document.querySelectorAll("[data-testid=evolucao-planilha-corpo] *")).find((e) => /^Analito Sintético 1\d$/.test(e.textContent?.trim() ?? "") && e.children.length === 0) as HTMLElement;
    return {
      fundoCab: lum(getComputedStyle(cab).backgroundColor),
      textoRotulo: lum(getComputedStyle(rot).color),
      textoNome: lum(getComputedStyle(nome).color),
    };
  });
  expect(m.fundoCab, "fundo do cabeçalho escuro").toBeLessThan(0.3);
  expect(m.textoRotulo, "rótulo da faixinha claro").toBeGreaterThan(0.7);
  expect(m.textoNome, "nome do exame claro").toBeGreaterThan(0.7);
  await page.getByTestId("evolucao-ferramentas").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "screenshots/evolucao/escuro-desktop.png" });
});
