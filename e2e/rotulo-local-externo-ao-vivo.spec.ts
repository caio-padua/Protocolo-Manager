/**
 * Prova AO VIVO (somente leitura) do rótulo "Local externo" no lugar de "Outro local" / "Externos".
 * Não grava nada, não toca no Google, não envia mensagem. Só roda com E2E_AO_VIVO=1 e SESSION_SECRET.
 */
import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

const ligado = process.env.E2E_AO_VIVO === "1" && !!process.env.SESSION_SECRET;
const PROFISSIONAL_ID = Number(process.env.E2E_PROFISSIONAL_ID ?? 6);
test.skip(!ligado, "Conferência ao vivo desligada (E2E_AO_VIVO=1)");

function sessaoTemporaria(id: number, versao: number) {
  const payload = `collab:${id}:executor:${versao}:${Date.now() + 3_600_000}`;
  const sig = createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

async function entrar(page: import("@playwright/test").Page) {
  const token = sessaoTemporaria(PROFISSIONAL_ID, Number(process.env.E2E_CREDENTIAL_VERSION ?? 0));
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.addInitScript(([t, id]) => {
    localStorage.setItem("padcom_collab_token", t as string);
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id, name: "Titular", role: "medico" }));
  }, [token, PROFISSIONAL_ID]);
}

test("Agenda Configuração mostra 'Local externo' e não mostra 'Outro local'", async ({ page }) => {
  test.setTimeout(90_000);
  await entrar(page);
  await page.goto("/agenda/motor?agenda=25");
  await expect(page.getByText("Local externo", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  expect(await page.getByText("Outro local (outro endereço)").count()).toBe(0);
  await page.screenshot({ path: "generated-artifacts/rotulo-local-externo-agenda.png" });
});

test("Cadastro da empresa: a aba chama 'Local externo' e não 'Externos'", async ({ page }) => {
  test.setTimeout(90_000);
  await entrar(page);
  await page.goto("/cadastros/empresas");

  await page.getByRole("button", { name: "Editar empresa Instituto Padua" }).click();
  const dialogo = page.getByRole("dialog");
  const aba = dialogo.getByRole("tab", { name: "Local externo" });
  await expect(aba).toBeVisible({ timeout: 30_000 });
  expect(await dialogo.getByRole("tab", { name: "Externos", exact: true }).count()).toBe(0);
  await aba.click();
  await expect(dialogo.getByText("Consultório Jardins (fictício)")).toBeVisible();
  await page.screenshot({ path: "generated-artifacts/rotulo-local-externo-cadastro.png" });
});
