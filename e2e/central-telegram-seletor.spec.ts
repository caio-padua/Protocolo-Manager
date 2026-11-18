/** Central Telegram usa o seletor padrão de cliente. Rede simulada, dados sintéticos. */
import { test, expect } from "@playwright/test";

test("seletor padrão abre a conversa e o título usa o nome atual", async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 101, name: "Sintético", role: "admin" }));
  });
  const escritas: string[] = [];
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (method !== "GET") escritas.push(`${method} ${path}`);
    if (path === "/api/collaborator/me") return json({ professional: { id: 101, name: "Sintético", role: "admin" } });
    if (path === "/api/telegram-inbox/conversas") return json({ conversas: [
      { clienteId: 1, nome: "Ana Sintética", naoLidas: 0, total: 1, ultimaEm: "2026-11-17T20:00:00Z", ultimaTexto: "oi", ultimaDirecao: "entrada" } ] });
    if (path === "/api/clients") return json([
      { id: 1, name: "Ana Sintética", cpf: "11111111111", phone: "11900000001", photoUrl: null },
      { id: 2, name: "Bruno Sintético", cpf: "22222222222", phone: "11900000002", photoUrl: null } ]);
    if (path === "/api/telegram-inbox/painel-operacional") return json({ canalAtivo: true, webhook: null, vinculados: 0 });
    if (path === "/api/telegram-inbox/visitantes") return json({ pedidos: [], conversas: [] });
    if (path.includes("/telegram-inbox")) return json({ mensagens: [], itens: [] });
    return json([]);
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/central-telegram");
  await expect(page.getByTestId("central-seletor-cliente")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByPlaceholder("Buscar cliente")).toHaveCount(0);
  await page.getByTestId("central-seletor-cliente").getByRole("button").first().click();
  await page.getByRole("button", { name: /Bruno Sintético/ }).click();
  await expect(page.getByTestId("central-conversa-titulo")).toHaveText("Bruno Sintético");
  await page.getByRole("button", { name: /Ana Sintética/ }).click();
  await expect(page.getByTestId("central-conversa-titulo")).toHaveText("Ana Sintética");
  // O painel já marcava como lidas ao abrir; nenhuma mensagem é enviada.
  expect(escritas.filter((e) => !e.endsWith("/marcar-lidas"))).toEqual([]);
});
