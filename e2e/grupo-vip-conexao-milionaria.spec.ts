/**
 * Grupo VIP + Conexão Milionária: portal do cliente e aba "Grupo VIP" da Central de Bolões, celular e desktop.
 * API simulada com dados SINTÉTICOS e com estado (o servidor e o banco são provados em grupo-vip-banco-isolado.test.ts).
 * Prova (VISUAL): convite com aceite voluntário, entrada em bolão sem cobrança, escolha de jogos, cobrança Asaas lida,
 * jogo escolhido NUNCA aparece como registrado sem comprovante, natureza do comprovante, automação CAIXA "pendente".
 * Nenhuma chamada real a Asaas, CAIXA, Google ou mensagem.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const URL_AREA = "/area?preview_id=10&preview_name=Maria%20Sint%C3%A9tica&preview_token=fake";
const PROF = { id: 1, name: "Gestora Sintética", role: "admin" };

async function semRolagemHorizontal(page: Page) {
  const l = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vis: window.innerWidth }));
  expect(l.doc).toBeLessThanOrEqual(l.vis + 1);
}

const REGRAS = { dezenasPorJogo: 6, universoMax: 60, jogosPorCota: 1, esperado: 1, bolaoAberto: true };

async function simularPortal(page: Page, inicial: "convidado" | null) {
  const st = { status: inicial as string | null, participando: false, jogos: [] as number[][], posts: [] as string[], bodies: [] as unknown[] };
  await page.route("**/api/area-paciente/**", (r) => {
    const req = r.request(); const u = new URL(req.url()).pathname;
    if (req.method() !== "GET") { st.posts.push(`${req.method()} ${u}`); try { st.bodies.push(req.postDataJSON()); } catch { st.bodies.push(null); } }
    if (u.endsWith("/grupo-vip") && req.method() === "GET") {
      const ativo = st.status === "ativo";
      return r.fulfill(json({
        status: st.status,
        boloes: ativo ? [{ id: 5, nome: "Bolão Sintético de Fim de Ano", concurso: "9001", dataSorteio: "2026-12-31", valorCotaCentavos: 1500, cotasRestantes: 4, escolhaJogos: "participante", modalidade: "Mega", dezenasPorJogo: 6, universoMax: 60, jogosPorCota: 1, regrasTexto: "Regra sintética.", convite: st.participando ? "aceito" : "convidado", participacaoId: st.participando ? 77 : null }] : [],
        participacoes: st.participando ? [{
          id: 77, cotas: 1, status: "pendente_registro", campanha: { nome: "Bolão Sintético de Fim de Ano" }, comprovante: null,
          jogos: st.jogos.map((d, i) => ({ ordem: i + 1, dezenas: d, origem: "participante" })),
          situacaoJogos: st.jogos.length ? "escolhido_sem_comprovante" : "sem_jogos", natureza: null,
          cobranca: { estado: "aguardando", statusAsaas: "PENDING", brutoCentavos: 1500, dataPagamento: null, extratoConferido: false },
          escolhaJogos: "participante", regras: REGRAS,
        }] : [],
      }));
    }
    if (u.endsWith("/grupo-vip/aceitar")) { st.status = "ativo"; return r.fulfill(json({ ok: true, status: "ativo" })); }
    if (u.endsWith("/grupo-vip/recusar")) { st.status = "recusou"; return r.fulfill(json({ ok: true, status: "recusou" })); }
    if (u.endsWith("/boloes/5/entrar")) { st.participando = true; return r.fulfill(json({ ok: true, participacaoId: 77 }, 201)); }
    if (u.endsWith("/participacoes/77/jogos")) { st.jogos = (req.postDataJSON() as { jogos: number[][] }).jogos; return r.fulfill(json({ ok: true, jogos: st.jogos.length })); }
    if (u.endsWith("/boloes")) return r.fulfill(json({ aviso: "Aqui aparecem apenas as participações registradas pela clínica.", participacoes: [] }));
    if (u.endsWith("/minha-categoria")) return r.fulfill(json({ nivel: "ouro" }));
    if (u.endsWith("/resumo")) return r.fulfill(json({ client: { name: "Maria Sintética" }, protocolsCount: 0, activeProtocolsCount: 0, totalSessions: 0, completedSessions: 0, nextSession: null }));
    return r.fulfill(json([]));
  });
  return st;
}

async function sessao(page: Page) {
  await page.addInitScript((p) => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify(p));
  }, PROF);
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: PROF })));
}

for (const vp of [{ nome: "celular", width: 390, height: 844 }, { nome: "desktop", width: 1280, height: 800 }]) {
  test.describe(`Grupo VIP — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("portal: sem convite não mostra bolões e não oferece ação", async ({ page }) => {
      const st = await simularPortal(page, null);
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /GRUPO VIP/ }).click({ timeout: 20000 });
      await expect(page.getByTestId("grupo-vip-situacao")).toHaveAttribute("data-status", "sem_convite");
      await expect(page.getByTestId("grupo-vip-aceitar")).toHaveCount(0);
      await page.getByTestId("club-vip-cta-boloes").click();
      await expect(page.getByTestId("boloes-so-membros")).toBeVisible();
      await expect(page.getByTestId("bolao-disponivel")).toHaveCount(0);
      expect(st.posts).toEqual([]);
    });

    test("portal: aceitar convite, entrar no bolão, escolher jogos; jogo sem comprovante nunca aparece como registrado", async ({ page }) => {
      const st = await simularPortal(page, "convidado");
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /GRUPO VIP/ }).click({ timeout: 20000 });
      await expect(page.getByTestId("grupo-vip-situacao")).toHaveAttribute("data-status", "convidado");
      await page.screenshot({ path: `generated-artifacts/grupo-vip-convite-${vp.nome}.png`, fullPage: true });
      await page.getByTestId("grupo-vip-aceitar").click();
      await expect(page.getByTestId("grupo-vip-situacao")).toHaveAttribute("data-status", "ativo");
      const raiz = (await page.getByTestId("club-vip").innerText()).toLowerCase();
      for (const nivel of ["prata", "ouro", "platinum", "diamond"]) expect(raiz).not.toContain(nivel);

      await page.getByTestId("club-vip-cta-boloes").click();
      const disp = page.getByTestId("bolao-disponivel");
      await expect(disp).toContainText("Bolão Sintético de Fim de Ano");
      await expect(disp).toContainText("R$ 15,00");
      await expect(disp).toContainText("Você escolhe os jogos");
      await disp.getByTestId("bolao-entrar").click();
      await expect(page.getByTestId("grupo-vip-minha")).toBeVisible();
      await expect(page.getByTestId("cobranca-estado")).toHaveAttribute("data-estado", "aguardando");
      await expect(page.getByTestId("jogos-situacao")).toHaveAttribute("data-situacao", "sem_jogos");

      // jogo inválido é recusado pelo servidor real; aqui provamos o envio e a exibição sem inventar registro
      await page.getByTestId("jogos-editor").locator("textarea").fill("1 2 3 4 5 6");
      await page.getByTestId("jogos-salvar").click();
      await expect(page.getByTestId("jogos-situacao")).toHaveAttribute("data-situacao", "escolhido_sem_comprovante");
      await expect(page.getByTestId("jogos-situacao")).toContainText("NÃO estão registrados na CAIXA");
      await expect(page.getByTestId("jogos-situacao")).not.toContainText("Registrado, com comprovante");
      await expect(page.getByTestId("jogos-lista")).toContainText("01 02 03 04 05 06");
      await expect(page.getByTestId("comprovante-natureza")).toHaveCount(0);
      expect(st.posts).toEqual(["POST /api/area-paciente/grupo-vip/aceitar", "POST /api/area-paciente/grupo-vip/boloes/5/entrar", "PUT /api/area-paciente/grupo-vip/participacoes/77/jogos"]);
      expect(st.bodies[1]).toEqual({ cotas: 1 }); // nenhum id de cliente viaja no corpo
      expect(st.bodies[2]).toEqual({ jogos: [[1, 2, 3, 4, 5, 6]] });
      await semRolagemHorizontal(page);
      await page.screenshot({ path: `generated-artifacts/grupo-vip-boloes-${vp.nome}.png`, fullPage: true });
    });

    test("portal: recusar convite não libera bolões", async ({ page }) => {
      const st = await simularPortal(page, "convidado");
      await page.goto(URL_AREA);
      await page.locator("nav").getByRole("button", { name: /GRUPO VIP/ }).click({ timeout: 20000 });
      await page.getByTestId("grupo-vip-recusar").click();
      await expect(page.getByTestId("grupo-vip-situacao")).toHaveAttribute("data-status", "recusou");
      await expect(page.getByTestId("grupo-vip-aceitar")).toHaveCount(0);
      expect(st.posts).toEqual(["POST /api/area-paciente/grupo-vip/recusar"]);
    });

    test("gestão: aba Grupo VIP mostra automação CAIXA pendente, cobrança lida e comprovante sem natureza", async ({ page }) => {
      await sessao(page);
      const escritas: string[] = [];
      await page.route("**/api/clients**", (r) => r.fulfill(json([])));
      await page.route("**/api/boloes/**", (r) => {
        const m = r.request().method(); const u = new URL(r.request().url()).pathname;
        if (m !== "GET") escritas.push(`${m} ${u}`);
        if (u.endsWith("/resumo")) return r.fulfill(json({ config: { driveFolderId: null, autoAprovar: false } }));
        if (u.endsWith("/recebimentos")) return r.fulfill(json({ recebimentos: [] }));
        if (u.endsWith("/auditoria")) return r.fulfill(json({ eventos: [] }));
        if (u.endsWith("/automacao")) return r.fulfill(json({ estado: "pendente", registraJogos: false, coletaComprovantes: false, motivo: "Não há acesso autorizado para automatizar a CAIXA.", ambiente: "prova isolada" }));
        if (u.endsWith("/grupo-vip")) return r.fulfill(json({ membros: [{ id: 1, cliente: { id: 10, nome: "Maria Sintética" }, status: "ativo", convidadoEm: "2026-11-10T12:00:00Z", respondidoEm: "2026-11-11T12:00:00Z" }], convitesBolao: [] }));
        if (u.endsWith("/participacoes")) return r.fulfill(json({
          campanhas: [{ id: 5, nome: "Bolão Sintético", concurso: "9001", dataSorteio: "2026-12-31", status: "aberto", dezenasPorJogo: 6, universoMax: 60, jogosPorCota: 1, escolhaJogos: "clinica" }],
          participacoes: [{
            id: 77, cliente: { id: 10, nome: "Maria Sintética" }, campanha: { id: 5, nome: "Bolão Sintético", concurso: "9001", dataSorteio: "2026-12-31" }, cotas: 1,
            pagamento: "nao_informado", registro: "registrada", entrega: "disponivel", comprovante: { id: 3, tipo: "pdf" },
            jogos: [{ ordem: 1, dezenas: [1, 2, 3, 4, 5, 6], origem: "clinica" }], situacaoJogos: "efetivado_com_comprovante", natureza: null,
            cobranca: { estado: "confirmado", statusAsaas: "RECEIVED", brutoCentavos: 1500, dataPagamento: "2026-11-12", extratoConferido: true },
            escolhaJogos: "clinica", regras: { ...REGRAS, bolaoAberto: true },
          }],
        }));
        return r.fulfill(json({}));
      });
      await page.goto("/boloes");
      await page.getByRole("button", { name: /Grupo VIP/ }).first().click({ timeout: 25000 });
      await expect(page.getByTestId("vip-automacao")).toHaveAttribute("data-estado", "pendente");
      await expect(page.getByTestId("vip-automacao")).toContainText("comprovante oficial");
      await expect(page.getByTestId("vip-membro")).toHaveAttribute("data-status", "ativo");
      await expect(page.getByTestId("vip-cobranca-estado")).toHaveAttribute("data-estado", "confirmado");
      await expect(page.getByTestId("vip-cobranca-estado")).toContainText("conferido no extrato");
      await expect(page.getByTestId("vip-natureza")).toHaveValue("");
      await expect(page.getByTestId("vip-jogos-situacao")).toContainText("com comprovante oficial");
      await expect(page.getByTestId("vip-vincular")).toHaveCount(0); // já confirmada: nada a vincular
      await expect(page.getByTestId("gestor-jogos-salvar")).toHaveCount(0); // efetivado: jogos travados
      expect(escritas).toEqual([]);
      await semRolagemHorizontal(page);
      await page.screenshot({ path: `generated-artifacts/grupo-vip-gestao-${vp.nome}.png`, fullPage: true });
    });
  });
}
