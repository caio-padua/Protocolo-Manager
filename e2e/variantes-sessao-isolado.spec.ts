import { test, expect } from "@playwright/test";

async function preparar(page: import("@playwright/test").Page) {
  await page.route("**/api/**", route => route.abort());
  await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/src/pages/substances/VariantesSubstancia.tsx`);
  await page.setContent(`<div id="root"></div><script type="module">
    import RefreshRuntime from "/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import("/@fs/${process.cwd()}/e2e/fixtures/variantes-sessao.tsx");
  </script>`);
  await expect.poll(() => page.evaluate(() => (window as any).pendentes?.length ?? 0)).toBe(1);
}

for (const acao of ["Trocar sessão", "Trocar ficha"]) {
  test(`resposta antiga não aparece após ${acao.toLowerCase()}`, async ({ page }) => {
    await preparar(page);
    await page.getByRole("button", { name: acao }).click();
    await expect.poll(() => page.evaluate(() => (window as any).pendentes.length)).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => (window as any).pendentes.slice(1).forEach((_: unknown, i: number) =>
      (window as any).responder(i + 1, "Fornecedor novo")));
    await expect(page.getByText("Fornecedor novo")).toBeVisible();
    await page.evaluate(() => (window as any).responder(0, "Fornecedor antigo"));
    await expect(page.getByText("Fornecedor antigo")).toHaveCount(0);
    await expect(page.getByText("Fornecedor novo")).toBeVisible();
  });
}
