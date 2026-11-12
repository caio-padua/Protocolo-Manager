/**
 * Conferência AO VIVO (somente leitura) entre o cadastro do profissional e a Agenda Configuração, com os dados reais
 * da clínica no ambiente de desenvolvimento. Não grava nada, não toca no Google, não envia mensagem.
 * Só roda com E2E_AO_VIVO=1 e SESSION_SECRET disponível (gera uma sessão temporária do titular).
 */
import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

const ligado = process.env.E2E_AO_VIVO === "1" && !!process.env.SESSION_SECRET;
const PROFISSIONAL_ID = Number(process.env.E2E_PROFISSIONAL_ID ?? 6);

function sessaoTemporaria(id: number, versao: number) {
  const payload = `collab:${id}:executor:${versao}:${Date.now() + 3_600_000}`;
  const sig = createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

test.skip(!ligado, "Conferência ao vivo desligada (E2E_AO_VIVO=1)");

test("Aba Vínculos do profissional mostra exatamente as agendas que a Agenda Configuração liga a ele", async ({ page, request }) => {
  test.setTimeout(90_000);
  const versao = Number(process.env.E2E_CREDENTIAL_VERSION ?? 0);
  const token = sessaoTemporaria(PROFISSIONAL_ID, versao);
  const api = process.env.E2E_API_URL ?? "http://localhost:8080";
  const cabecalho = { Authorization: `Bearer ${token}` };

  // Fonte: o que o servidor diz que está ligado a este profissional.
  const resposta = await request.get(`${api}/api/professionals/${PROFISSIONAL_ID}/agendas`, { headers: cabecalho });
  expect(resposta.status()).toBe(200);
  const { agendas } = await resposta.json() as { agendas: { id: number; name: string; vinculado: boolean }[] };
  const ligadas = agendas.filter((a) => a.vinculado).map((a) => a.name);
  expect(ligadas.length).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.addInitScript(([t, id]) => {
    localStorage.setItem("padcom_collab_token", t as string);
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id, name: "Titular", role: "medico" }));
  }, [token, PROFISSIONAL_ID]);
  await page.goto("/professionals");
  await page.locator(`[aria-label^="Editar "]`).filter({ hasText: "" }).first().waitFor();
  await page.getByRole("button", { name: /^Editar .*Pádua/ }).first().click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "VÍNCULOS" }).click();
  await expect(dialogo.getByRole("switch").first()).toBeVisible();

  // Cada agenda ligada no servidor aparece LIGADA na tela (linha da agenda com o botão marcado).
  for (const nome of ligadas) {
    const linha = dialogo.locator("div").filter({ has: page.getByText(nome, { exact: true }) }).filter({ has: page.getByRole("switch") }).last();
    await linha.scrollIntoViewIfNeeded();
    await expect(linha.getByRole("switch"), `agenda "${nome}" deveria aparecer ligada no cadastro`).toBeChecked();
  }
  // E nenhuma agenda desligada no servidor aparece ligada.
  for (const a of agendas.filter((x) => !x.vinculado)) {
    const linha = dialogo.locator("div").filter({ has: page.getByText(a.name, { exact: true }) }).filter({ has: page.getByRole("switch") }).last();
    if (await linha.count() === 0) continue;
    await expect(linha.getByRole("switch"), `agenda "${a.name}" não deveria aparecer ligada`).not.toBeChecked();
  }
  await dialogo.getByTestId("agendas-sem-local").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "generated-artifacts/vinculos-ao-vivo-sem-local.png" });
  await dialogo.locator(`[data-testid^="origem-local-"]`).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "generated-artifacts/vinculos-ao-vivo-locais.png" });
});
