import { test, expect } from "@playwright/test";

async function preparar(page: import("@playwright/test").Page) {
  await page.route("**/api/**", route => route.abort());
  await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/src/pages/protocols/new.tsx`);
  await page.setContent(`<div id="root"></div><script type="module">
    import RefreshRuntime from "/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import("/@fs/${process.cwd()}/e2e/fixtures/protocolo-seletor-isolado.tsx");
  </script>`);
  await expect(page.getByRole("button", { name: "Escolher substância" })).toBeVisible();
}

for (const tela of ["celular", "computador"] as const) {
  test.describe(tela, () => {
    test.use(tela === "celular" ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
    test("pesquisa homônimos e seleciona o cadastro exato com dose comprovada", async ({ page }) => {
      await preparar(page);
      const ativar = async (locator: import("@playwright/test").Locator) => tela === "celular" ? locator.tap() : locator.click();
      await ativar(page.getByRole("button", { name: "Escolher substância" }));
      await page.getByRole("textbox", { name: "Buscar substância" }).fill("coenzima");
      await expect(page.getByRole("button", { name: /Coenzima Q10 — 100 mg/ })).toBeVisible();
      await ativar(page.getByRole("button", { name: /Coenzima Q10 — 50 mg/ }));
      await expect(page.getByTestId("identidade")).toHaveText("2");
      await expect(page.getByLabel("Dose por aplicação")).toHaveValue("50 mg");
      await ativar(page.getByRole("button", { name: "Trocar filtro" }));
      await expect(page.getByRole("button", { name: "Escolher substância" })).toContainText("50 mg");
    });
    test("dose ambígua permanece vazia e pesquisa não escolhe automaticamente", async ({ page }) => {
      await preparar(page);
      await page.getByRole("button", { name: "Escolher substância" }).click();
      await page.getByRole("textbox", { name: "Buscar substância" }).fill("ADEK");
      await expect(page.getByTestId("identidade")).toHaveText("nenhuma");
      const option = page.getByRole("button", { name: /ADEK/ });
      await expect(option).toContainText("dose não confirmada");
      if (tela === "celular") await option.tap(); else await option.click();
      await expect(page.getByTestId("identidade")).toHaveText("3");
      await expect(page.getByLabel("Dose por aplicação")).toHaveValue("");
    });
    test("lista longa rola até o último item", async ({ page }) => {
      await preparar(page);
      await page.getByRole("button", { name: "Escolher substância" }).click();
      const list = page.getByLabel("Resultados de substâncias");
      await expect.poll(() => list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      if (tela === "celular") {
        const box = await list.boundingBox();
        if (!box) throw new Error("Lista de resultados sem dimensão");
        const cdp = await page.context().newCDPSession(page);
        const x = box.x + box.width / 2;
        const bottom = box.y + box.height * 0.8;
        const top = box.y + box.height * 0.2;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: bottom }] });
        for (let step = 1; step <= 8; step++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: bottom + (top - bottom) * step / 8 }] });
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        await cdp.detach();
      }
      await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const last = page.getByRole("button", { name: /Substância 217/ });
      await expect(last).toBeVisible();
      if (tela === "celular") await last.tap(); else await last.click();
      await expect(page.getByTestId("identidade")).toHaveText("217");
    });
    test("teclado abre, pesquisa e seleciona sem mover foco manualmente", async ({ page }) => {
      await preparar(page);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      const search = page.getByRole("textbox", { name: "Buscar substância" });
      await expect(search).toBeFocused();
      await page.keyboard.type("ADEK");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("identidade")).toHaveText("3");
    });
  });
}
