/**
 * Vitrines por domínio + login + redirecionamentos, contra o servidor de DESENVOLVIMENTO.
 * Os domínios paxmed.com.br e paxcare.com.br são só mapeados para o servidor local dentro do navegador do teste
 * (nada sai para a internet, nenhum DNS é alterado). Não envia mensagem, não grava dado de cliente.
 * Login real do operador (credenciais vêm do ambiente; nunca impressas) apenas para provar o destino pós-login.
 */
import { test, expect, chromium, type Browser } from "@playwright/test";

const PORTA = new URL(process.env.PADCOM_BASE_URL || "http://localhost:18148").port || "18148";
const MED = `http://paxmed.com.br:${PORTA}`;
const CARE = `http://paxcare.com.br:${PORTA}`;

let nav: Browser;
test.beforeAll(async () => {
  nav = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--host-resolver-rules=MAP paxmed.com.br 127.0.0.1:${PORTA}, MAP paxcare.com.br 127.0.0.1:${PORTA}`],
  });
});
test.afterAll(async () => { await nav?.close(); });

test.describe("paxmed.com.br", () => {
  test("raiz mostra a vitrine dourada; botões levam a /login e /area", async () => {
    const p = await nav.newPage();
    await p.goto(`${MED}/`, { waitUntil: "load", timeout: 90_000 });
    await expect(p.getByText("enquanto você cuida").first()).toBeVisible({ timeout: 30_000 });
    const hrefs = await p.$$eval("a", (as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toContain("/login");
    expect(hrefs).toContain("/area");
    const html = (await p.content()).toLowerCase();
    expect(html).not.toContain("padaxor");
    expect(html).not.toContain("parxis.com.br");
    await p.close();
  });

  test("rodapé: marca PAXMED e contatos paxmed.com.br", async () => {
    const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto(`${MED}/`, { waitUntil: "load", timeout: 90_000 });
    const rodape = p.locator("footer");
    await rodape.scrollIntoViewIfNeeded();
    await expect(rodape).toContainText("contato@paxmed.com.br");
    await expect(rodape).toContainText("paxmed.com.br");
    await expect(rodape.locator('img[alt="PAXMED"]').first()).toHaveAttribute("src", /paxmed-symbol-champagne\.png$/);
    await rodape.screenshot({ path: "/tmp/med-rodape.png" });
    await p.close();
  });

  test("botão Área do Médico / Clínica leva ao login do Manager", async () => {
    const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto(`${MED}/`, { waitUntil: "load", timeout: 90_000 });
    await p.locator('a[href="/login"]').first().click();
    await expect(p).toHaveURL(`${MED}/login`);
    await expect(p.getByTestId("input-username")).toBeVisible({ timeout: 30_000 });
    await p.close();
  });

  test("/dashboard abre o painel do Manager; /portal vai para /area", async () => {
    const p = await nav.newPage();
    await p.goto(`${MED}/dashboard`, { waitUntil: "load", timeout: 90_000 });
    await expect(p.getByRole("link", { name: "Dashboard" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(p).toHaveURL(`${MED}/dashboard`);
    await p.goto(`${MED}/portal`, { waitUntil: "load" });
    await expect(p).toHaveURL(`${MED}/area`, { timeout: 30_000 });
    await p.close();
  });

  test("senha inválida não entra (usuário inexistente, sem travar conta real)", async () => {
    const p = await nav.newPage();
    await p.goto(`${process.env.PADCOM_BASE_URL || "http://localhost:18148"}/login`, { waitUntil: "load", timeout: 90_000 });
    await p.getByTestId("input-username").fill("usuario.sintetico.inexistente@exemplo.invalid");
    await p.getByTestId("input-password").fill("SenhaSinteticaErrada#1");
    await p.getByTestId("button-entrar").click();
    await expect(p.getByTestId("text-error")).toBeVisible({ timeout: 30_000 });
    await expect(p).toHaveURL(/\/login/);
    await p.close();
  });

  test("sessão real do operador (login por API) abre /dashboard com o painel do Manager", async ({ page, request }) => {
    const identifier = process.env.PAXTER_OPERATOR_LOGIN_RETRY || process.env.PAXTER_OPERATOR_LOGIN;
    const password = process.env.PAXTER_OPERATOR_PASSWORD;
    test.skip(!identifier || !password, "credenciais do operador ausentes no ambiente");
    const login = await request.post("/api/collaborator/login", { data: { identifier, password } });
    expect(login.status()).toBe(200);
    const sessao = await login.json();
    await page.addInitScript(({ token, professional }) => {
      localStorage.setItem("padcom_collab_token", token);
      localStorage.setItem("padcom_collab_prof", JSON.stringify(professional));
    }, sessao);
    await page.goto("/dashboard", { waitUntil: "load" });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible({ timeout: 40_000 });
    await page.screenshot({ path: "/tmp/med-dashboard.png" });
  });
});

test.describe("paxcare.com.br e demais endereços", () => {
  test("raiz = vitrine PAXCARE; /area e /login = Manager", async () => {
    const p = await nav.newPage();
    await p.goto(`${CARE}/`, { waitUntil: "load", timeout: 90_000 });
    await expect(p.getByText("finalmente inteira").first()).toBeVisible({ timeout: 30_000 });
    await p.goto(`${CARE}/login`, { waitUntil: "load" });
    await expect(p.getByTestId("input-username")).toBeVisible({ timeout: 30_000 });
    await p.close();
  });

  test("endereço do Manager (sem domínio de vitrine): / segue sendo o painel e /dashboard também", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "load" });
    await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible({ timeout: 30_000 });
    await page.goto("/", { waitUntil: "load" });
    await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("API: acesso negado sem credencial válida (dev, somente leitura)", () => {
  const forjado = Buffer.from(`1:${Date.now() + 3_600_000}:${"0".repeat(64)}`).toString("base64url");
  for (const [rotulo, caminho, cab] of [
    ["paciente sem token", "/api/area-paciente/medicacoes", {}],
    ["paciente com token forjado", "/api/area-paciente/medicacoes", { Authorization: `Bearer ${forjado}` }],
    ["clínica sem token (fila)", "/api/cockpit-medicacoes/fila", {}],
    ["clínica sem token (cliente 1)", "/api/cockpit/1/medicacoes", {}],
    ["clínica com token forjado", "/api/cockpit/1/medicacoes", { Authorization: `Bearer ${forjado}` }],
  ] as const) {
    test(rotulo, async ({ request }) => {
      const r = await request.get(caminho, { headers: cab as Record<string, string> });
      expect([401, 403]).toContain(r.status());
    });
  }
});
