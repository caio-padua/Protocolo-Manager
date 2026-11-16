import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/**
 * Regressão visual da Área do Cliente > Evolução de Exames (gráfico "Abaixo da linha").
 * 100% sintético: cliente fictício em modo preview, API inteira interceptada (nenhuma chamada real,
 * nenhum dado de paciente, nenhuma IA). Capturas em screenshots/evolucao/.
 */
const ZONES = [
  { key: "below", name: "ALERTA", color: "#c0392b", low: null, high: 1.0 },
  { key: "t1", name: "ATENCAO", color: "#e67e22", low: 1.0, high: 1.5 },
  { key: "t2", name: "INSUFICIENTE", color: "#d4ac0d", low: 1.5, high: 2.0 },
  { key: "t3", name: "ACEITAVEL", color: "#2e8b57", low: 2.0, high: 2.5 },
  { key: "above", name: "EXCELENTE", color: "#1e8449", low: 2.5, high: null },
];
const ZONES_GRANDES = ZONES.map((z) => ({ ...z, low: z.low == null ? null : z.low * 100, high: z.high == null ? null : z.high * 100 }));
const zonaDe = (v: number, zs: typeof ZONES) =>
  zs.find((z) => (z.low == null || v >= z.low) && (z.high == null || v < z.high)) ?? zs[4];

function payload(n: number) {
  const columns = Array.from({ length: n }, (_, i) => ({
    key: `c${i}`,
    date: new Date(Date.UTC(2024, 0, 1 + i * 20)).toISOString().slice(0, 10),
    lab: "Laboratório Sintético",
    confLevel: "c1",
    conferenteName: null,
    conferenteCargo: null,
  }));
  const mk = (key: string, name: string, unit: string, zs: typeof ZONES, f: (i: number) => number, dec: number) => ({
    key,
    name,
    unit,
    refLow: String(zs[2].low),
    refHigh: String(zs[3].high),
    direction: "higher_better",
    zones: zs,
    trend: n > 1 ? "subiu" : null,
    cells: Object.fromEntries(
      columns.map((c, i) => {
        const v = Number(f(i).toFixed(dec));
        const z = zonaDe(v, zs);
        return [c.key, { value: v.toFixed(dec).replace(".", ","), valueNum: v, unit, status: null, documentId: 1000 + i, zone: { key: z.key, name: z.name, color: z.color } }];
      }),
    ),
  });
  return {
    columns,
    analytes:
      n === 0
        ? []
        : [
            mk("sint_a", "Analito Sintético A", "mg/dL", ZONES, (i) => 0.6 + ((i * 0.37) % 2.4), 2),
            mk("sint_b", "Analito Sintético B", "ng/mL", ZONES_GRANDES, (i) => 80 + ((i * 37) % 240), 0),
          ],
  };
}

async function abrir(page: Page, n: number) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (path === "/api/area-paciente/exames/evolucao") return json(payload(n));
    if (path === "/api/area-paciente/resumo")
      return json({ client: { name: "Cliente Sintetico", cpf: null }, totalSessions: 0, completedSessions: 0, nextSession: null, protocols: [], proximas: [] });
    return json([]);
  });
  await page.goto("/area?preview_id=1&preview_name=Cliente%20Sintetico&preview_token=sintetico");
  await page.getByRole("button", { name: /EVOLUÇÃO/i }).first().click();
  await expect(page.getByText(n === 0 ? /Nenhum exame para este cliente ainda/i : /Gráficos/i).first()).toBeVisible({ timeout: 20000 });
}

const VIEWPORTS = [402, 768, 1366, 1649];
const CENARIOS = [0, 1, 2, 30];
fs.mkdirSync("screenshots/evolucao", { recursive: true });

for (const w of VIEWPORTS) {
  test.describe(`Evolução ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 }, hasTouch: w <= 768 });

    for (const n of CENARIOS) {
      test(`${n} coleta(s)`, async ({ page }) => {
        await abrir(page, n);

        if (n === 0) {
          await expect(page.getByText(/Nenhum exame para este cliente ainda/i)).toBeVisible();
          await page.screenshot({ path: `screenshots/evolucao/${w}-${n}-vazio.png` });
          const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(sobra, "rolagem lateral da página").toBeLessThanOrEqual(0);
          return;
        }

        await page.getByRole("button", { name: "Abaixo da linha" }).click();
        const linha = page.getByRole("button", { name: /Analito Sintético A/ }).first();
        if (w <= 768) await linha.tap();
        else await linha.click();
        const cartao = page.locator("[data-evolucao-cartao]").first();
        await expect(cartao).toBeVisible();
        await cartao.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);

        const m = await page.evaluate(() => {
          const wrap = document.querySelector("[data-evolucao-cartao]") as HTMLElement;
          const card = wrap.querySelector("section") as HTMLElement;
          const tv = wrap.querySelector(".screen-tv-3d") as HTMLElement;
          const moldura = wrap.parentElement!.closest(".overflow-x-auto") as HTMLElement;
          const r = (e: Element) => e.getBoundingClientRect();
          const mr = r(moldura);
          const cr = r(card);
          const tr = r(tv);
          const svg = wrap.querySelector("svg.recharts-surface") as SVGElement;
          const sr = r(svg);
          const eixo = wrap.querySelector(".recharts-yAxis") as SVGGElement;
          const eixoR = r(eixo);
          const ticks = Array.from(eixo.querySelectorAll("text")).map((t) => {
            const b = r(t);
            return { txt: t.textContent ?? "", left: b.left, right: b.right };
          });
          // sobreposição: o cartão não pode cruzar nenhuma linha (role=button) da planilha
          const linhas = Array.from(document.querySelectorAll("[role=button]")).filter((e) => !wrap.contains(e));
          const cruza = linhas.some((e) => {
            const b = r(e);
            return b.width > 0 && b.height > 0 && !(b.bottom <= cr.top + 0.5 || b.top >= cr.bottom - 0.5 || b.right <= cr.left || b.left >= cr.right);
          });
          const rol = wrap.querySelector(".scroll-gold") as HTMLElement;
          return {
            folgaDireita: mr.right - cr.right,
            folgaEsquerda: cr.left - mr.left,
            folgaTvDireita: cr.right - tr.right,
            larguraEixo: eixoR.width,
            ticks,
            svgLeft: sr.left,
            cruza,
            paginaSobra: document.documentElement.scrollWidth - window.innerWidth,
            rolSW: rol.scrollWidth,
            rolCW: rol.clientWidth,
            rolSL: rol.scrollLeft,
            cardW: cr.width,
          };
        });

        await page.screenshot({ path: `screenshots/evolucao/${w}-${n}-aberto.png` });
        console.log(`[${w}px/${n}] eixoY=${Math.round(m.larguraEixo)}px cartao=${Math.round(m.cardW)}px folgaDir=${m.folgaDireita.toFixed(1)} rol=${m.rolSW}/${m.rolCW}`);

        expect(m.folgaDireita, "borda direita dentro da moldura").toBeGreaterThanOrEqual(0);
        expect(m.folgaEsquerda, "borda esquerda dentro da moldura").toBeGreaterThanOrEqual(0);
        expect(m.folgaTvDireita, "inset bevel dentro do cartão").toBeGreaterThanOrEqual(0);
        expect(m.cruza, "cartão sobrepõe linha da planilha").toBe(false);
        expect(m.paginaSobra, "rolagem lateral da página").toBeLessThanOrEqual(0);
        expect(m.larguraEixo, "faixa do eixo Y menor que os 44px antigos").toBeLessThan(44);
        for (const t of m.ticks) {
          expect(t.txt.length, "rótulo do eixo Y vazio").toBeGreaterThan(0);
          expect(t.left, `rótulo "${t.txt}" truncado à esquerda`).toBeGreaterThanOrEqual(m.svgLeft - 0.5);
        }
        if (n === 30) {
          expect(m.rolSW, "30 coletas devem rolar por dentro do gráfico").toBeGreaterThan(m.rolCW);
          expect(m.rolSL, "abre na última coleta").toBeGreaterThan(0);
        } else {
          expect(m.rolSW, "poucas coletas cabem sem rolagem").toBeLessThanOrEqual(m.rolCW + 1);
        }

        // Interação: toque (<=768) ou mouse (>=1366) sobre o gráfico não pode quebrar nada.
        const area = page.locator("[data-evolucao-cartao] .recharts-surface").first();
        const box = (await area.boundingBox())!;
        const pontoA = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.5 };
        const pontoB = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.5 };
        if (w <= 768) {
          await page.touchscreen.tap(pontoA.x, pontoA.y);
          await page.touchscreen.tap(pontoB.x, pontoB.y);
        } else {
          await page.mouse.move(pontoA.x, pontoA.y);
          await page.mouse.move(pontoB.x, pontoB.y);
        }
        await expect(cartao).toBeVisible();
        const sobraDepois = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(sobraDepois, "rolagem lateral após interação").toBeLessThanOrEqual(0);
        await page.screenshot({ path: `screenshots/evolucao/${w}-${n}-interacao.png` });
      });
    }
  });
}

// Analito B (rótulos de 3 dígitos + unidade) e barra inferior: toque/mouse em 3 coletas.
for (const w of [402, 1366]) {
  test.describe(`Analito B ${w}px`, () => {
    test.use({ viewport: { width: w, height: 900 }, hasTouch: w <= 768 });
    test("eixo Y sem truncar e barra inferior segue as 3 coletas", async ({ page }) => {
      await abrir(page, 3);
      await page.getByRole("button", { name: "Abaixo da linha" }).click();
      const linha = page.getByRole("button", { name: /Analito Sintético B/ }).first();
      if (w <= 768) await linha.tap(); else await linha.click();
      const cartao = page.locator("[data-evolucao-cartao]").first();
      await expect(cartao).toBeVisible();
      await cartao.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const eixo = await page.evaluate(() => {
        const wrap = document.querySelector("[data-evolucao-cartao]")!;
        const svgL = wrap.querySelector("svg.recharts-surface")!.getBoundingClientRect().left;
        const ticks = Array.from(wrap.querySelectorAll(".recharts-yAxis text")).map((t) => ({ txt: t.textContent ?? "", left: t.getBoundingClientRect().left }));
        return { svgL, ticks, unidade: wrap.textContent?.includes("ng/mL") ?? false };
      });
      expect(eixo.unidade, "unidade ng/mL visível").toBe(true);
      expect(eixo.ticks.some((t) => /^\d{3}$/.test(t.txt)), "há rótulo de 3 dígitos").toBe(true);
      for (const t of eixo.ticks) expect(t.left, `rótulo ${t.txt}`).toBeGreaterThanOrEqual(eixo.svgL - 0.5);
      const box = (await page.locator("[data-evolucao-cartao] .recharts-surface").first().boundingBox())!;
      const esperado = ["80", "117", "154"];
      const vistos = new Set<string>();
      for (let f = 0.12; f <= 0.9; f += 0.04) {
        const x = box.x + box.width * f, y = box.y + box.height * 0.5;
        if (w <= 768) await page.touchscreen.tap(x, y); else await page.mouse.move(x, y);
        const v = (await page.getByTestId("evo-valor").first().textContent())!.trim();
        expect(esperado, `valor da barra "${v}"`).toContain(v);
        vistos.add(v);
      }
      expect([...vistos].sort(), "as 3 coletas aparecem na barra").toEqual([...esperado].sort());
      await page.screenshot({ path: `screenshots/evolucao/${w}-3-analitoB-barra.png` });
    });
  });
}
