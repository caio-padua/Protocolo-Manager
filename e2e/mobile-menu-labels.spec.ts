import { expect, test } from "@playwright/test";

test("menu móvel mostra os nomes mesmo quando o menu do computador está recolhido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("paxter.sidebar.collapsed", "1");
  });
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") return route.abort();
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/menu"
      ? {
          items: [
            "agenda",
            "exames_lab",
            "protocolos",
            "financeiro",
            "comunicacao",
          ].map((moduloRequerido) => ({ moduloRequerido })),
        }
      : path === "/api/telegram-inbox/badge"
        ? { naoLidas: 0 }
        : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("button", { name: "Fechar menu" })).toBeVisible();
  await page.screenshot({ path: "generated-artifacts/mobile-audit/menu-mobile-after.png" });

  const navigation = page.locator("nav");
  await expect(navigation.getByText("Dashboard", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Agenda Diária", { exact: true })).toBeVisible();
});
