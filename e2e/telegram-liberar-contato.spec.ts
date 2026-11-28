import { test, expect, type Page } from "@playwright/test";

/** Liberar Telegram no cadastro do cliente + porta de entrada na Central Telegram. Tudo sintético, API interceptada. */
async function preparar(page: Page, opts: { vinculado?: boolean } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "token-sintetico-sem-validade-real");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Profissional Sintético", role: "medico" }));
  });
  const posts: string[] = [];
  await page.route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    const m = route.request().method();
    const json = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (m !== "GET") {
      posts.push(`${m} ${p}`);
      if (p.endsWith("/telegram-link")) return json({ url: "https://t.me/Paduaclinica_bot?start=TOKENSINTETICOTOKENSINTETICO123", expiraEm: "2026-11-24T21:00:00Z" });
      if (p.endsWith("/client-registration/send-link/2361"))
        return json({ link: "https://exemplo.test/cadastro?token=abc", emailSent: true, resultados: [
          { canal: "EMAIL", sent: true }, { canal: "WHATSAPP", sent: false, error: "twilio_63015", link: "https://wa.me/5511000000000" }, { canal: "TELEGRAM", sent: false, skipped: true } ] });
      return json({});
    }
    if (p.endsWith("/collaborator/me")) return json({ professional: { id: 1, name: "Profissional Sintético", role: "medico" } });
    if (p.endsWith("/clients/2361/comunicacao")) return json({ botUsername: "Paduaclinica_bot", botLink: "https://t.me/Paduaclinica_bot", telegram: { vinculado: !!opts.vinculado, senhaGerada: false, senha: null, senhaGeradaEm: null, codigoRepetido: false }, contato: { temEmail: true, temTelefone: true }, areaCliente: { temCpf: true, temDataNascimento: true, temSenhaPropria: false } });
    if (p.endsWith("/clients/clinicas-origem")) return json({ clinicas: [], atual: null });
    if (p.endsWith("/clients/visit-preference-options")) return json({ opcoes: [], options: [] });
    if (p.endsWith("/clients/2361")) return json({ id: 2361, name: "Cliente Sintetico", email: "cliente@exemplo.test", phone: "11999999999", cpf: "52998224725", status: "active", empresaId: 5, birthDate: "1980-01-02" });
    if (p.endsWith("/telegram-inbox/painel-operacional")) return json({ bot: { usuario: "Paduaclinica_bot", link: "https://t.me/Paduaclinica_bot" }, canalAtivo: true, webhook: { consultado: true, saudavel: true, pendentes: 0, ultimoErro: null }, vinculados: 2, modos: { atendimentoIa: "lista", lembretes: "lista", atendimentoLista: 2, lembretesLista: 2 } });
    if (p.endsWith("/telegram-inbox/conversas")) return json({ conversas: [] });
    if (p.endsWith("/telegram-inbox/visitantes")) return json({ pedidos: [], conversas: [] });
    return json([]);
  });
  return posts;
}

for (const vp of [{ nome: "notebook", w: 1366, h: 768 }, { nome: "celular", w: 390, h: 844 }]) {
  test(`cadastro do cliente (${vp.nome}): canais visíveis e Liberar Telegram gera link e QR`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const posts = await preparar(page);
    await page.goto("/clients/2361/edit");
    await page.getByRole("tab", { name: /FOTO E ASSINATURA/i }).click();
    await expect(page.getByTestId("canal-telegram")).toContainText("Ainda não vinculado");
    await page.getByRole("button", { name: "LINK DE CADASTRO", exact: true }).click();
    await expect(page.getByTestId("canal-whatsapp")).toContainText("Falhou");
    await page.getByTestId("liberar-telegram").click();
    const painel = page.getByTestId("telegram-link-painel");
    await expect(painel).toBeVisible();
    await expect(painel.locator("svg").first()).toBeVisible();
    await expect(painel).toContainText("expira em");
    expect(posts.some((x) => x.endsWith("/clients/2361/telegram-link"))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await painel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `generated-artifacts/telegram-cliente-${vp.nome}.png` });
  });
}

test("cadastro do cliente: Telegram já vinculado não oferece liberar de novo", async ({ page }) => {
  await preparar(page, { vinculado: true });
  await page.goto("/clients/2361/edit");
  await page.getByRole("tab", { name: /FOTO E ASSINATURA/i }).click();
  await expect(page.getByTestId("canal-telegram")).toContainText("Liberado");
  await expect(page.getByTestId("liberar-telegram")).toHaveCount(0);
});

for (const vp of [{ nome: "notebook", w: 1366, h: 768 }, { nome: "celular", w: 390, h: 844 }]) {
  test(`Central Telegram (${vp.nome}): porta de entrada com QR e estado real`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await preparar(page);
    await page.goto("/central-telegram");
    const porta = page.getByTestId("porta-entrada-telegram");
    await expect(porta).toContainText("@Paduaclinica_bot");
    await expect(porta).toContainText("Funcionando");
    await expect(porta).toContainText("só clientes autorizados");
    await expect(porta.locator("svg").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `generated-artifacts/telegram-central-${vp.nome}.png` });
  });
}
