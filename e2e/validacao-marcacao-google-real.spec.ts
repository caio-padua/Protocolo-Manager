/**
 * Validação única, de ponta a ponta, do evento completo no Google ao marcar pela Agenda Configuração.
 * ATENÇÃO: cria 1 sessão e 1 evento REAL no Google da clínica, só para o cliente fictício "TESTE VALIDACAO GOOGLE".
 * Só roda com E2E_VALIDACAO_REAL=1. Os ids criados são gravados em generated-artifacts/validacao-ids-criados.json
 * para a limpeza posterior (somente o que este teste criou).
 */
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ligado = process.env.E2E_VALIDACAO_REAL === "1" && !!process.env.SESSION_SECRET;
test.skip(!ligado, "Validação real desligada (E2E_VALIDACAO_REAL=1)");

const PROFISSIONAL_ID = Number(process.env.E2E_PROFISSIONAL_ID ?? 6);
const DATA = process.env.E2E_DATA ?? "2026-12-15";
const HORA = process.env.E2E_HORA ?? "09:00";

function sessaoTemporaria(id: number, versao: number) {
  const payload = `collab:${id}:executor:${versao}:${Date.now() + 3_600_000}`;
  const sig = createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

test("marcar cliente TESTE na AGENDA ENFERMAGEM - SEDE cria o evento completo no Google", async ({ page }) => {
  test.setTimeout(120_000);
  const token = sessaoTemporaria(PROFISSIONAL_ID, Number(process.env.E2E_CREDENTIAL_VERSION ?? 0));
  await page.setViewportSize({ width: 1365, height: 1400 });
  await page.addInitScript(([t, id]) => {
    localStorage.setItem("padcom_collab_token", t as string);
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id, name: "Titular", role: "medico" }));
  }, [token, PROFISSIONAL_ID]);

  await page.goto("/agenda/motor?agenda=23");
  const prova = page.getByTestId("agenda-simulacao");
  await expect(prova).toBeVisible({ timeout: 40_000 });
  await prova.getByRole("combobox").click();
  await page.getByRole("option", { name: "AGENDA ENFERMAGEM - SEDE", exact: true }).click();
  await prova.locator('input[type="date"]').fill(DATA);

  const marcacao = page.getByTestId("agenda-marcacao-real");
  await marcacao.getByRole("combobox").nth(0).click();
  await page.keyboard.type("Teste Validacao Google", { delay: 40 });
  await expect(page.getByRole("option", { name: /Teste Validacao Google/i })).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("Enter");
  await marcacao.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /TESTE VALIDACAO GOOGLE/i }).click();
  await marcacao.getByRole("button", { name: HORA, exact: true }).click({ timeout: 30_000 });
  await expect(marcacao.locator("#book-sync")).toBeChecked();
  await expect(marcacao.locator("#book-sim")).toBeChecked(); // padrão da tela: etiqueta [SIMULACAO]
  await page.screenshot({ path: "generated-artifacts/validacao-real-1-antes.png", fullPage: true });

  const [resposta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/agenda/book") && r.request().method() === "POST", { timeout: 60_000 }),
    marcacao.getByRole("button", { name: "Confirmar marcação" }).click(),
  ]);
  console.log("BOOK", resposta.status(), resposta.url(), (await resposta.text()).slice(0, 300));
  const corpo = JSON.parse(await resposta.text());
  writeFileSync("generated-artifacts/validacao-ids-criados.json", JSON.stringify({ status: resposta.status(), corpo }, null, 2));
  expect(resposta.status()).toBe(201);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "generated-artifacts/validacao-real-2-depois.png", fullPage: true });
  expect(corpo.googleSyncWarning ?? null).toBeNull();
  expect(corpo.googleEventId).toBeTruthy();
});
