import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { aplicarOuroAoSimbolo } from "../artifacts/api-server/src/lib/documentos/paxmed-ouro";

for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
  test(`identidade 2B em ${viewport.width} pixels`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "sessao-sintetica");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
    });
    let identity = { nome: "Clínica sintética", enderecoLinha1: "Rua de teste", enderecoLinha2: "Cidade de teste", versao: 1 };
    const logo = aplicarOuroAoSimbolo(readFileSync(path.resolve("artifacts/padcom/src/assets/padua-dp-mask.png")));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/collaborator/me") {
        await route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
      } else if (url.pathname === "/api/paxmed-2b/clinicas") {
        await route.fulfill({ json: { clinicas: [{ id: 31, nome: "Clínica sintética" }] } });
      } else if (url.pathname === "/api/paxmed-2b/clinicas/31/simbolo/upload") {
        await route.fulfill({ json: { uploadId: "11111111-1111-4111-8111-111111111111", uploadUrl: "https://example.invalid/upload" } });
      } else if (url.pathname === "/api/paxmed-2b/clinicas/31/simbolo") {
        await route.fulfill({ status: 200, contentType: "image/png", body: logo });
      } else if (url.pathname === "/api/paxmed-2b/clinicas/31") {
        if (route.request().method() === "PUT") {
          identity = { ...route.request().postDataJSON(), versao: identity.versao + 1 };
        }
        await route.fulfill({ json: { identidade: identity } });
      } else if (url.pathname === "/api/receituario-modelos/ativo") {
        await route.fulfill({ json: { modelo: { id: 1, config: { designerConfig: {} } } } });
      } else if (url.pathname === "/api/locations" || url.pathname === "/api/professionals") {
        await route.fulfill({ json: [] });
      } else {
        await route.fulfill({ status: 200, json: {} });
      }
    });
    await page.route("https://example.invalid/upload", (route) => route.fulfill({ status: 200 }));
    await page.goto("/configuracoes/receituario");
    const section = page.getByRole("region", { name: "Identidade da clínica — Modelo 2B" });
    await expect(section).toBeVisible();
    await section.getByRole("combobox", { name: "Clínica", exact: true }).selectOption("31");
    await expect(section.getByLabel("Nome da clínica")).toHaveValue("Clínica sintética");
    await expect(section.getByAltText("Símbolo da clínica em dourado")).toBeVisible();
    await section.getByLabel("Nome da clínica").fill("Clínica de teste alterada");
    await section.getByLabel("Escolher símbolo da clínica").setInputFiles("artifacts/padcom/src/assets/padua-dp-mask.png");
    await section.getByRole("button", { name: "Salvar identidade do Modelo 2B" }).click();
    await expect(section.getByRole("status")).toContainText("Identidade salva para esta clínica");
    await expect(section.getByLabel("Nome da clínica")).toHaveValue("Clínica de teste alterada");
    await section.screenshot({ path: `generated-artifacts/paxmed-2b-tela-${viewport.width}.png` });
  });
}
