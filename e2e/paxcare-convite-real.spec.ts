/**
 * Prova no NAVEGADOR com servidor de teste (roteadores reais) e PostgreSQL descartável, dados sintéticos.
 * Requer: harness (api-server/src/tests/harness-navegador.test.ts) em :18999 e vite em PADCOM_BASE_URL apontando para ele.
 * Só o login do paciente e painéis alheios ao convite são simulados; as rotas de convite/contato/convites-da-vitrine são REAIS.
 */
import { test, expect, type Page } from "@playwright/test";

const JAN = (dias: number) => ({ dias, tomei: 0, esqueci: 0, esperado: 0, semRegistro: 0, percentual: null, diasComHistorico: 0, diasSemHistorico: dias, suspenso: 0, retirado: 0, diasSuspensos: 0 });
const LISTA = { esperadoPorDia: 0, janelas: [JAN(7), JAN(15), JAN(30)], historico: [] };
const H = "http://127.0.0.1:18999/api/__teste";
const sql = async (page: Page, q: string) => (await page.request.get(`${H}/sql`, { params: { q } })).json() as Promise<any[]>;
const tokCol = async (page: Page, id: number) => (await (await page.request.get(`${H}/token-colab/${id}`)).json()).token as string;
const tokPac = async (page: Page, id: number) => (await (await page.request.get(`${H}/token-paciente/${id}`)).json()).token as string;
const sem_rolagem_lateral = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const shot = (page: Page, nome: string) => page.screenshot({ path: `e2e/evidencias/convite-real/${nome}.png`, fullPage: true });
async function comoColab(page: Page, id: number | null) {
  if (id === null) return;
  const t = await tokCol(page, id);
  await page.addInitScript(([tk, pid]) => { localStorage.setItem("padcom_collab_token", tk as string); localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: pid, name: "Sintetico", role: "medico" })); }, [t, id]);
}
async function paciente(page: Page, id: number, bloqueio401 = false) {
  const token = await tokPac(page, id);
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^.*\/api\//, "/");
    const j = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.includes("/paxcare/convites-medico")) return bloqueio401 ? j({ error: "x" }, 401) : route.continue();
    if (p.endsWith("/area-paciente/login")) return j({ token, id, name: "Ana Sintetica", cpf: "00000000000", email: null, mustChangePassword: false });
    if (p.includes("/area-paciente/sessao")) return j({ ok: true });
    if (p.endsWith("/area-paciente/pre-cadastro")) return j({ completo: true, valores: {}, faltando: [] });
    if (p.endsWith("/area-paciente/resumo")) return j({ client: { name: "Ana Sintetica" }, protocolsCount: 0, activeProtocolsCount: 0, totalSessions: 0, completedSessions: 0, nextSession: null });
    if (p.endsWith("/paxcare/cofre")) return j({ itens: [], examesDaClinica: [], clinicaOrigem: null });
    if (p.endsWith("/paxcare/clinicas")) return j({ vinculos: [], disponiveis: [] });
    if (p.endsWith("/paxcare/planos")) return j({ planos: [], aviso: "" });
    if (p.endsWith("/paxcare/assinatura")) return j({ assinatura: null });
    if (p.endsWith("/medicacoes/adesao")) return j({ data: "2026-11-27", adesao: { prescrita: LISTA, propria: LISTA }, hoje: [] });
    if (p.endsWith("/area-paciente/medicacoes")) return j({ lembretePendente: false, prescritas: [], proprias: [], clinicas: [], consentimento: { versao: "1", texto: "x", hash: "x" } });
    return j({});
  });
  await page.goto("/area");
  await page.getByRole("button", { name: /entrar com senha/i }).click();
  await page.locator("input").nth(0).fill("00000000000");
  await page.locator('input[type="password"]').fill("SenhaSintetica#1");
  await page.getByRole("button", { name: /^entrar$/i }).click();
  await page.getByRole("button", { name: /PAXCARE/i }).first().click();
  await expect(page.getByTestId("convite-medico-paciente")).toBeVisible({ timeout: 20000 });
}
async function preencher(page: Page, o: { nome?: string; email?: string; crm?: string; uf?: string } = {}) {
  await page.getByLabel("Nome do médico").fill(o.nome ?? "Dr Sintetico");
  await page.getByLabel("E-mail do médico").fill(o.email ?? "dr@teste.com");
  await page.getByLabel("Número do CRM").fill(o.crm ?? "123456");
  await page.getByLabel("UF do CRM").fill(o.uf ?? "SP");
}

for (const [nome, vp] of [["desktop", { width: 1280, height: 900 }], ["celular", { width: 390, height: 844 }]] as const) {
  test.describe.serial(`convite real (${nome})`, () => {
    let link = ""; let convId = 0;
    test.use({ viewport: vp });

    test("paciente: validação, consentimento e criação do convite", async ({ page }) => {
      await paciente(page, 1);
      const criar = page.getByRole("button", { name: /criar convite/i });
      await expect(criar).toBeDisabled();
      await preencher(page);
      await page.getByTestId("convite-medico-paciente").getByRole("checkbox", { name: "Histórico" }).check();
      await expect(criar).toBeDisabled(); // falta o aceite do termo
      await expect(page.getByTestId("termo-convite")).toContainText("Autorizo");
      await page.getByLabel(/li e autorizo/i).check();
      await expect(criar).toBeEnabled();
      await shot(page, `${nome}-1-paciente-formulario`);
      await criar.click();
      await expect(page.getByTestId("link-convite")).toBeVisible({ timeout: 15000 });
      link = (await page.getByTestId("link-convite").locator("p").nth(1).innerText()).trim();
      expect(link).toMatch(/\/paxcare-convite\/[A-Za-z0-9_-]{40,60}$/);
      await shot(page, `${nome}-2-paciente-link`);
      await sem_rolagem_lateral(page);
      const tk = link.split("/").pop()!;
      const r = await sql(page, "select id, status, client_id, token_hash, consentimento_em is not null as c, comp_historico, comp_exames, comp_documentos from paxcare_convites_medico order by id desc limit 1");
      convId = r[0].id;
      expect(r[0]).toMatchObject({ status: "pendente", client_id: 1, c: true, comp_historico: true, comp_exames: false, comp_documentos: false });
      expect(r[0].token_hash).not.toContain(tk);
      await expect(page.getByTestId(`meu-convite-${convId}`)).toContainText("Aguardando o médico");
    });

    test("paciente: sessão expirada mostra erro, não lista vazia", async ({ page }) => {
      await paciente(page, 1, true);
      await expect(page.getByRole("alert").filter({ hasText: /Sessão expirada/ }).first()).toBeVisible();
      await shot(page, `${nome}-3-paciente-erro-sessao`);
    });

    test("médico sem sessão vai ao login e outro médico é recusado", async ({ page }) => {
      await page.goto(new URL(link).pathname);
      await expect(page).toHaveURL(/login/, { timeout: 45000 });
      await shot(page, `${nome}-4-medico-sem-sessao`);
    });

    test("médico errado: recusa genérica e tentativa auditada", async ({ page }) => {
      await comoColab(page, 8);
      await page.goto(new URL(link).pathname);
      await expect(page.getByText("Este convite não pode ser aberto com a sua conta.")).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole("button", { name: /^aceitar$/i })).toHaveCount(0);
      await shot(page, `${nome}-5-medico-errado`);
      const h = await sql(page, `select acao, ator from paxcare_convites_medico_hist where convite_id=${convId} and acao='negou'`);
      expect(h.length).toBeGreaterThanOrEqual(1);
      expect((await sql(page, `select status from paxcare_convites_medico where id=${convId}`))[0].status).toBe("pendente");
    });

    test("médico certo: vê, aceita e lê só o escopo liberado", async ({ page }) => {
      await comoColab(page, 7);
      await page.goto(new URL(link).pathname);
      await expect(page.getByText(/Convite de Ana/)).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(/Libera: Histórico/)).toBeVisible();
      await shot(page, `${nome}-6-medico-convite`);
      await page.getByRole("button", { name: /^aceitar$/i }).click();
      await expect(page.getByText(/Convite aceito/)).toBeVisible();
      await expect(page.getByTestId(`aceito-${convId}`)).toContainText("Ana Sintetica");
      await page.getByTestId(`aceito-${convId}`).getByRole("button", { name: /ver o que foi liberado/i }).click();
      await expect(page.getByTestId(`aceito-${convId}`).getByText("Historico da Ana")).toBeVisible();
      await expect(page.getByText("Exame da Ana")).toHaveCount(0);
      await expect(page.getByText("Documento da Ana")).toHaveCount(0);
      await expect(page.getByText(/Beto/)).toHaveCount(0);
      await shot(page, `${nome}-7-medico-cofre-escopo`);
      await sem_rolagem_lateral(page);
      const r = await sql(page, `select status, aceito_por, acesso_ate > now() as ativo from paxcare_convites_medico where id=${convId}`);
      expect(r[0]).toMatchObject({ status: "aceito", aceito_por: 7, ativo: true });
      const h = await sql(page, `select acao from paxcare_convites_medico_hist where convite_id=${convId} order by id`);
      expect(h.map((x) => x.acao)).toEqual(expect.arrayContaining(["criou", "negou", "visualizou", "aceitou", "leu_cofre"]));
      // o mesmo convite não aceita de novo
      await page.reload();
      await expect(page.getByText(/Situação: aceito/)).toBeVisible({ timeout: 45000 });
      await expect(page.getByRole("button", { name: /^aceitar$/i })).toBeDisabled();
    });

    test("paciente revoga e o médico perde o acesso na hora", async ({ page, browser }) => {
      await paciente(page, 1);
      await page.getByTestId(`meu-convite-${convId}`).getByRole("button", { name: /^revogar$/i }).click();
      await page.getByRole("button", { name: /sim, retirar/i }).click();
      await expect(page.getByTestId(`meu-convite-${convId}`)).toContainText("Revogado");
      await shot(page, `${nome}-8-paciente-revogado`);
      expect((await sql(page, `select status from paxcare_convites_medico where id=${convId}`))[0].status).toBe("revogado");
      const ctx = await browser.newContext({ viewport: vp }); const med = await ctx.newPage();
      await comoColab(med, 7);
      await med.goto("/paxcare-convite");
      await expect(med.getByText("Nenhum acesso ativo.")).toBeVisible({ timeout: 20000 });
      await shot(med, `${nome}-9-medico-sem-acesso`);
      const api = await med.request.get("http://127.0.0.1:18999/api/collaborator/paxcare/convites-aceitos/" + convId + "/cofre", { headers: { Authorization: `Bearer ${await tokCol(med, 7)}` } });
      expect(api.status()).toBe(403);
      await ctx.close();
    });

    test("isolamento: paciente 2 não vê convites do paciente 1", async ({ page }) => {
      await paciente(page, 2);
      await expect(page.getByText("Você ainda não convidou nenhum médico.")).toBeVisible();
      await shot(page, `${nome}-10-paciente2-isolado`);
    });

    test("telas administrativas: CEO vê; não-titular é barrado", async ({ page }) => {
      const base = "http://127.0.0.1:18999/api";
      const c = await page.request.post(`${base}/vitrine-contatos`, { data: { nome: `Maria Sintetica ${nome}`, email: `m-${nome}@teste.com`, clinica: "Clinica X", especialidade: "Endocrino", necessidade: "Quero conhecer o sistema", consentimento: true } });
      expect(c.status()).toBe(200);
      const v = await page.request.post(`${base}/vitrine-convites`, { data: { nome: `Medico Convidado ${nome}`, email: `c-${nome}@teste.com`, crm: "654321", uf: "SP", especialidade: "Clínica", cidade: "Cidade", consentimento: true } });
      expect(v.status()).toBeLessThan(300);
      expect((await sql(page, `select consentimento from vitrine_contatos where email='m-${nome}@teste.com'`))[0].consentimento).toBe(true);

      await comoColab(page, 1);
      await page.goto("/vitrine-contatos");
      await expect(page.getByText(`Maria Sintetica ${nome}`)).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(/consentimento: sim/).first()).toBeVisible();
      await shot(page, `${nome}-11-admin-contatos`);
      await sem_rolagem_lateral(page);
      await page.goto("/convites-paxmed");
      await expect(page.getByText(`Medico Convidado ${nome}`)).toBeVisible({ timeout: 20000 });
      await shot(page, `${nome}-12-admin-convites-paxmed`);
      await sem_rolagem_lateral(page);
      await page.goto("/paxcare-convites-medico");
      await expect(page.getByTestId("paxcare-convites-medico")).toBeVisible({ timeout: 20000 });
      await expect(page.getByText("Revogado pelo cliente").first()).toBeVisible();
      await expect(page.getByText("d***@teste.com").first()).toBeVisible();
      await shot(page, `${nome}-13-admin-convites-medico`);
      await sem_rolagem_lateral(page);
    });

    test("telas administrativas: colaborador não titular recebe 403 claro", async ({ page }) => {
      await comoColab(page, 7);
      for (const [rota, msg] of [["/vitrine-contatos", /Somente o titular/], ["/convites-paxmed", /Somente o titular/], ["/paxcare-convites-medico", /Somente o titular/]] as const) {
        await page.goto(rota);
        await expect(page.getByText(msg).first()).toBeVisible({ timeout: 20000 });
      }
      await shot(page, `${nome}-14-admin-nao-titular`);
    });
  });
}
