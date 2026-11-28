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
      simboloExemplo: true, dadosExemplo: false,
    };
    const logo = aplicarOuroAoSimbolo(readFileSync(path.resolve("artifacts/padcom/src/assets/padua-dp-mask.png")));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/collaborator/me") {
        await route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
      } else if (url.pathname === "/api/empresas") {
        expect(route.request().headers().authorization).toBe("Bearer sessao-sintetica");
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
          identity = { ...textos, simboloExemplo: false, dadosExemplo: false, versao: identity.versao + 1 };
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
    await expect(section.getByText("Símbolo demonstrativo, não oficial.", { exact: false })).toBeVisible();
    await section.getByLabel("Nome no cabeçalho").fill("Clínica de teste");
    await section.getByRole("button", { name: "Linhas do rodapé" }).click();
    await section.getByLabel("Rodapé — terceira linha").fill("Cidade alterada");
    await section.getByRole("button", { name: "Símbolo e nome" }).click();
    await section.getByLabel("Escolher símbolo da empresa").setInputFiles("artifacts/padcom/src/assets/padua-dp-mask.png");
    await expect(section.getByRole("img", { name: "Prévia dourada do símbolo escolhido" })).toBeVisible();
    await section.getByRole("button", { name: "Prévia", exact: true }).click();
    await expect(section.getByRole("img", { name: "Prévia aproximada do cabeçalho" })).toContainText("Clínica de teste");
    await section.getByRole("button", { name: "Ampliar prévia" }).click();
    await expect(section.getByRole("button", { name: "Reduzir prévia" })).toBeVisible();
    await section.getByRole("button", { name: "Reduzir prévia" }).click();
    await section.getByRole("button", { name: "Salvar identidade", exact: true }).click();
    await expect(section.getByRole("status").filter({ hasText: "Identidade salva" })).toBeVisible();
    await section.getByRole("button", { name: "Símbolo e nome" }).click();
    await expect(section.getByLabel("Nome no cabeçalho")).toHaveValue("Clínica de teste");
    await section.getByRole("button", { name: "Linhas do rodapé" }).click();
    await expect(section.getByLabel("Rodapé — terceira linha")).toHaveValue("Cidade alterada");
    const popup = page.waitForEvent("popup");
    await section.getByRole("button", { name: "Abrir prévia salva" }).click();
    await (await popup).close();
    await section.screenshot({ path: `generated-artifacts/paxmed-2b-empresa-${viewport.width}.png` });
  });
}

test("a edição empresarial envia a sessão e salva somente a empresa escolhida", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  let saved = false;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/empresas") {
      expect(req.headers().authorization).toBe("Bearer sessao-sintetica");
      return route.fulfill({ json: [{ id: 21, nome: "Clínica sintética", tipo: "clinic", status: "ATIVO", ativa: true, cnae: "86.30-5/01", regimeTributario: "simples_nacional" }] });
    }
    if (pathname === "/api/empresas/21" && req.method() === "PUT") {
      expect(req.headers().authorization).toBe("Bearer sessao-sintetica");
      expect(req.postDataJSON().nome).toBe("Clínica alterada");
      saved = true;
      return route.fulfill({ json: { id: 21 } });
    }
    if (pathname.startsWith("/api/semantic-codes/")) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/empresas");
  await page.getByRole("button", { name: "Editar empresa Clínica sintética" }).click();
  const dialog = page.getByRole("dialog", { name: "EDITAR EMPRESA" });
  await dialog.getByLabel("Nome no Sistema").fill("Clínica alterada");
  await dialog.getByRole("button", { name: "SALVAR EMPRESA" }).click();
  await expect(dialog).toBeHidden();
  expect(saved).toBe(true);
});

test("campos fiscais faltantes são exibidos em vez de falhar em silêncio", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (pathname === "/api/empresas") return route.fulfill({ json: [{ id: 21, nome: "Clínica sintética", tipo: "clinic", status: "ATIVO", ativa: true }] });
    if (pathname.startsWith("/api/semantic-codes/")) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto("/cadastros/empresas");
  await page.getByRole("button", { name: "Editar empresa Clínica sintética" }).click();
  const dialog = page.getByRole("dialog", { name: "EDITAR EMPRESA" });
  await dialog.getByRole("button", { name: "SALVAR EMPRESA" }).click();
  await expect(dialog.getByRole("tab", { name: "Fiscal e CNAE" })).toHaveAttribute("data-state", "active");
  await expect(dialog.getByText("Informe o CNAE completo no padrão 00.00-0/00")).toBeVisible();
  await expect(dialog.getByText("Selecione o regime tributário")).toBeVisible();
});
