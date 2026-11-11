import { expect, test } from "@playwright/test";

for (const width of [1365, 390]) {
  test(`abas do cadastro empresarial identificam a seleção em ${width} pixels`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "sessao-sintetica");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
    });
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/collaborator/me") {
        return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
      }
      if (pathname === "/api/empresas") {
        return route.fulfill({ json: [{ id: 21, nome: "Empresa sintética", tipo: "clinic", status: "ATIVO", ativa: true }] });
      }
      if (pathname === "/api/paxmed-2b/empresas/21") {
        return route.fulfill({ json: { identidade: null } });
      }
      if (pathname === "/api/empresas/21/contratos") return route.fulfill({ json: [] });
      if (pathname.startsWith("/api/semantic-codes/")) return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });
    await page.goto("/cadastros/empresas");
    await page.getByRole("button", { name: "Editar empresa Empresa sintética" }).click();
    const dialog = page.getByRole("dialog", { name: "EDITAR EMPRESA" });
    const tabList = dialog.getByRole("tablist", { name: "Seções do cadastro empresarial" });
    const labels = [
      "Dados", "Classificação", "Endereço", "Identidade", "Fiscal e CNAE",
      "Notas fiscais", "Origem", "Integrações", "Contratos",
    ];
    for (const label of labels) {
      const active = tabList.getByRole("tab", { name: label, exact: true });
      await active.click();
      await expect(active).toHaveAttribute("aria-selected", "true");
      await expect(tabList.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
      await expect(active).toHaveCSS("background-image", /rgb\(230, 222, 201\)/);
      await expect(active).not.toHaveCSS("background-image", /rgb\(34, 64, 106\)/);
      expect(await active.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("inset");
    }
    await tabList.getByRole("tab", { name: "Identidade", exact: true }).click();
    const section = dialog.getByRole("region", { name: "Identidade nos documentos — Modelo 2B" });
    const buttons = section.getByRole("group", { name: "Etapas da identidade" });
    for (const label of ["Símbolo e nome", "Linhas do rodapé", "Prévia"]) {
      const active = buttons.getByRole("button", { name: label, exact: true });
      await active.click();
      await expect(active).toHaveAttribute("aria-pressed", "true");
      await expect(buttons.locator('[aria-pressed="true"]')).toHaveCount(1);
      await expect(active).toHaveCSS("background-image", /rgb\(230, 222, 201\)/);
      await expect(active).not.toHaveCSS("background-image", /rgb\(34, 64, 106\)/);
    }
    await buttons.getByRole("button", { name: "Símbolo e nome" }).click();
    await dialog.screenshot({ path: `generated-artifacts/empresa-abas-ativas-${width}.png` });
  });
}
