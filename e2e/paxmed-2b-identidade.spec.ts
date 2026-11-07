import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { aplicarOuroAoSimbolo } from "../artifacts/api-server/src/lib/documentos/paxmed-ouro";

for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
  test(`identidade empresarial 2B em ${viewport.width} pixels`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "sessao-sintetica");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
    });
    let identity = {
      nomeCabecalho: "Clínica sintética", rodapeLinha1: "Clínica sintética",
      rodapeLinha2: "Rua de teste", rodapeLinha3: "Cidade de teste", versao: 1,
    };
    const logo = aplicarOuroAoSimbolo(readFileSync(path.resolve("artifacts/padcom/src/assets/padua-dp-mask.png")));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/collaborator/me") {
        await route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
      } else if (url.pathname === "/api/empresas") {
        await route.fulfill({ json: [{ id: 21, nome: "Clínica sintética", tipo: "clinic", status: "ATIVA", ativa: true }] });
      } else if (url.pathname === "/api/paxmed-2b/empresas/21/simbolo/upload") {
        await route.fulfill({ json: { uploadId: "11111111-1111-4111-8111-111111111111", uploadUrl: "https://example.invalid/upload" } });
      } else if (url.pathname === "/api/paxmed-2b/empresas/21/simbolo") {
        await route.fulfill({ status: 200, contentType: "image/png", body: logo });
      } else if (url.pathname === "/api/paxmed-2b/empresas/21/pre-visualizacao") {
        await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" });
      } else if (url.pathname === "/api/paxmed-2b/empresas/21") {
        expect(route.request().headers()["x-empresa-id"]).toBe("21");
        if (route.request().method() === "PUT") {
          const { uploadId: _uploadId, ...textos } = route.request().postDataJSON();
          identity = { ...textos, versao: identity.versao + 1 };
        }
        await route.fulfill({ json: { identidade: identity } });
      } else if (url.pathname.startsWith("/api/semantic-codes/")) {
        await route.fulfill({ json: [] });
      } else {
        await route.fulfill({ status: 200, json: {} });
      }
    });
    await page.route("https://example.invalid/upload", (route) => route.fulfill({ status: 200 }));
    await page.goto("/cadastros/empresas");
    await page.getByRole("button", { name: "Editar empresa Clínica sintética" }).click();
    await page.getByRole("tab", { name: "Identidade dos documentos" }).click();
    const section = page.getByRole("region", { name: "Identidade nos documentos — Modelo 2B" });
    await expect(section.getByLabel("Nome no cabeçalho")).toHaveValue("Clínica sintética");
    await expect(section.getByAltText("Símbolo da empresa em dourado")).toBeVisible();
    await section.getByLabel("Nome no cabeçalho").fill("Clínica de teste");
    await section.getByLabel("Rodapé — terceira linha").fill("Cidade alterada");
    await section.getByLabel("Escolher símbolo da empresa").setInputFiles("artifacts/padcom/src/assets/padua-dp-mask.png");
    await section.getByRole("button", { name: "Salvar identidade", exact: true }).click();
    await expect(section.getByRole("status").filter({ hasText: "Identidade salva" })).toBeVisible();
    await expect(section.getByLabel("Nome no cabeçalho")).toHaveValue("Clínica de teste");
    await expect(section.getByLabel("Rodapé — terceira linha")).toHaveValue("Cidade alterada");
    const popup = page.waitForEvent("popup");
    await section.getByRole("button", { name: "Abrir prévia salva" }).click();
    await (await popup).close();
    await section.screenshot({ path: `generated-artifacts/paxmed-2b-empresa-${viewport.width}.png` });
  });
}
