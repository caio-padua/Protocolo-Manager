import { test, expect } from "@playwright/test";
import fs from "node:fs";

/** Cadastro público (link por token): seção de rubrica. 100% sintético, API interceptada. */
test("cadastro público: envia a rubrica junto com o cadastro", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  let corpo = "";
  await page.route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.pathname === "/api/client-registration/info")
      return json({ id: 1, name: "Cliente Sintetico", cpf: "52998224725", email: "a@b.co", phone: "11999999999", birthDate: "1980-01-02", hasRubrica: false });
    if (u.pathname === "/api/client-registration/submit") {
      corpo = route.request().postData() ?? "";
      return json({ ok: true, photoUrl: null, rubrica: "salva" });
    }
    return json([]);
  });
  await page.goto("/cadastro?token=sintetico");
  const secao = page.getByTestId("cadastro-rubrica");
  await secao.scrollIntoViewIfNeeded();
  await expect(secao).toContainText("Sua Rubrica (opcional)");
  fs.mkdirSync("screenshots/evolucao", { recursive: true });
  // PNG mínimo válido de 1x1 para a prévia
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.getByTestId("cadastro-rubrica-arquivo").setInputFiles({ name: "rubrica.png", mimeType: "image/png", buffer: png });
  await expect(secao.getByAltText("Pré-visualização da rubrica")).toBeVisible();
  await expect(secao.getByRole("button")).toContainText("ENVIAR OUTRA RUBRICA");
  await page.screenshot({ path: "screenshots/evolucao/tmp-cadastro-rubrica.png" });
  await page.getByRole("button", { name: /ENVIAR CADASTRO/i }).click();
  await expect(page.getByText("CADASTRO ENVIADO!")).toBeVisible();
  expect(corpo).toContain('name="rubrica"');
});

test("cadastro público: arquivo que não é PNG/JPEG é recusado na tela", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const u = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(u.pathname === "/api/client-registration/info" ? { id: 1, name: "Cliente Sintetico", hasRubrica: true } : []) });
  });
  await page.goto("/cadastro?token=sintetico");
  const secao = page.getByTestId("cadastro-rubrica");
  await expect(secao).toContainText("já tem uma rubrica sua");
  await page.getByTestId("cadastro-rubrica-arquivo").setInputFiles({ name: "r.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(page.getByText("A rubrica deve ser uma imagem PNG ou JPEG.")).toBeVisible();
});
