/**
 * Navegador + SERVIDOR COMPLETO (api-server/src/tests/harness-servidor-completo.test.ts em :18999, banco descartável).
 * Nenhuma rota é simulada: os tokens vêm dos logins reais (POST /api/collaborator/login e /api/area-paciente/login),
 * os dados vêm das rotas reais. O formulário de login do Manager não é percorrido aqui (token gravado como o app grava).
 */
import { test, expect, type Page } from "@playwright/test";

const API = "http://127.0.0.1:18999/api";
const SENHA = "Senha-Teste-9a!";
const shot = (page: Page, nome: string) => page.screenshot({ path: `e2e/evidencias/acolhimento/${nome}.png`, fullPage: true });
async function comoColab(page: Page, email: string, id: number) {
  const r = await page.request.post(`${API}/collaborator/login`, { data: { identifier: email, password: SENHA } });
  expect(r.status()).toBe(200);
  const t = (await r.json()).token as string;
  await page.addInitScript(([tk, pid]) => { localStorage.setItem("padcom_collab_token", tk as string); localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: pid, name: "Teste", role: "medico" })); }, [t, id]);
}
const semRolagemLateral = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test.describe.configure({ mode: "serial" });
for (const [nome, viewport] of [["desktop", { width: 1280, height: 900 }], ["celular", { width: 390, height: 844 }]] as const) {
  test.describe(nome, () => {
    test.use({ viewport });

    test("preparar dados pelas rotas reais", async ({ page }) => {
      if (nome !== "desktop") return;
      const ped = await page.request.post(`${API}/vitrine-convites`, { data: { nome: "Dr Convidado", email: "dr@teste.com", crm: "123456", uf: "SP", especialidade: "Endocrinologia", cidade: "Sao Paulo", consentimento: true } });
      expect(ped.status()).toBe(201);
      const l = await page.request.post(`${API}/area-paciente/login`, { data: { cpf: "52998224725", password: "Paciente-Teste-9a!" } });
      const tk = (await l.json()).token as string;
      const H = { Authorization: `Bearer ${tk}` };
      const termo = await (await page.request.get(`${API}/area-paciente/paxcare/convites-medico/termo`, { headers: H })).json();
      const c = await page.request.post(`${API}/area-paciente/paxcare/convites-medico`, { headers: H, data: { consentimentoHash: termo.hash, medicoNome: "Dr Convidado", medicoEmail: "dr@teste.com", conselho: "123456", uf: "SP", compartilha: { historico: true, exames: false, documentos: false } } });
      expect(c.status()).toBe(201);
    });

    test("não titular não vê a central", async ({ page }) => {
      await comoColab(page, "comum@teste.com", 2);
      await page.goto("/acolhimento");
      await expect(page.getByText("Somente o titular da plataforma vê este acompanhamento.")).toBeVisible({ timeout: 45000 });
      await expect(page.getByTestId(/^acolhimento-/)).toHaveCount(0);
      await shot(page, `${nome}-1-nao-titular`);
    });

    test("titular: lista, filtros, etapas, histórico e mensagem manual", async ({ page }) => {
      await comoColab(page, "titular@teste.com", 1);
      let enviou = 0; page.on("request", (r) => { if (/\/(enviar|send|whatsapp)/i.test(r.url()) && r.method() === "POST") enviou++; });
      await page.goto("/acolhimento");
      await expect(page.getByTestId(/^acolhimento-pedido-/).first()).toBeVisible({ timeout: 45000 });
      await expect(page.getByTestId(/^acolhimento-convite-/).first()).toBeVisible();
      await expect(page.getByTestId(/^acolhimento-cliente-/).first()).toBeVisible();
      await shot(page, `${nome}-2-lista`);
      await page.getByTestId("filtro-origem").selectOption("convite_clinico");
      await expect(page.getByTestId(/^acolhimento-pedido-/)).toHaveCount(0, { timeout: 15000 });
      await page.getByTestId("filtro-origem").selectOption("");
      await page.getByTestId("filtro-tipo").selectOption("cliente");
      const beto = page.getByTestId(/^acolhimento-cliente-/).filter({ hasText: "Beto" });
      await expect(beto).toBeVisible({ timeout: 15000 });
      await beto.getByRole("button").first().click();
      await expect(beto.getByTestId("etapas")).toContainText("Sem registro");
      await expect(beto.getByTestId("etapas")).toContainText("não prova");
      await expect(beto.getByTestId("historico")).toBeVisible();
      await beto.getByLabel("Modelo de mensagem").selectOption("cliente_definir_senha");
      const area = beto.getByLabel("Texto da mensagem (editável)");
      await expect(area).toHaveValue(/Beto/);
      await area.fill("Texto editado à mão.");
      await expect(area).toHaveValue("Texto editado à mão.");
      await semRolagemLateral(page);
      await shot(page, `${nome}-3-cliente-mensagem`);
      expect(enviou).toBe(0);
    });
  });
}
