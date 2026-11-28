/**
 * Meus Jogos (jogos individuais): portal do cliente e aba "Jogos do cliente" do gestor, celular e desktop.
 * API simulada com dados SINTETICOS e com estado (servidor e banco sao provados em meus-jogos-banco-isolado.test.ts).
 * Prova (VISUAL/DADO): volante por toque, faixa com selecao/quantidade/preco do servidor, limpar, aleatorio, favorito,
 * confirmacao bloqueada quando a execucao esta indisponivel, resultados (ok e indisponivel), pedido com linha do tempo,
 * PIX sem nunca mostrar "pago" antes da confirmacao do servidor, gestor acompanhando o cliente escolhido.
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

const prec = (pares: [number, number][]) => pares.map(([quantidade, precoCentavos]) => ({ quantidade, precoCentavos }));
function catalogo(aberto: boolean) {
  const disp = (modalidade: string) => ({
    modalidade, aberto,
    motivo: aberto ? null : "execucao_indisponivel",
    mensagem: aberto ? null : "Execução indisponível: nenhum canal autorizado de registro está conectado. Nenhum pedido é aceito.",
    concurso: aberto ? { numero: 9001, data: "2026-11-21" } : null,
    prazos: aberto ? { fechamentoOficialEm: "2026-11-21T22:00:00.000Z", limiteInternoEm: "2026-11-21T18:00:00.000Z" } : null,
    fonte: { desatualizado: false, motivo: null, verificadoEm: "2026-11-15T12:00:00.000Z" },
  });
  return {
    membro: true, execucao: { disponivel: aberto, motivo: aberto ? "ok" : "Nenhum canal autorizado conectado." },
    tetoPedidoCentavos: 50000, margemMinutos: 240, metaMinutos: 30,
    modalidades: [
      { chave: "megasena", nome: "Mega-Sena", dezenaMin: 1, dezenaMax: 60, dezenasMin: 6, dezenasMax: 20, precos: prec([[6, 600], [7, 4200], [8, 16800]]), sorteios: "Quartas e sábados", fonteUrl: "https://loterias.caixa.gov.br", disponibilidade: disp("megasena") },
      { chave: "lotofacil", nome: "Lotofácil", dezenaMin: 1, dezenaMax: 25, dezenasMin: 15, dezenasMax: 20, precos: prec([[15, 350], [16, 5600]]), sorteios: "Segunda a sábado", fonteUrl: "https://loterias.caixa.gov.br", disponibilidade: disp("lotofacil") },
      { chave: "quina", nome: "Quina", dezenaMin: 1, dezenaMax: 80, dezenasMin: 5, dezenasMax: 15, precos: prec([[5, 300], [6, 1800]]), sorteios: "Segunda a sábado", fonteUrl: "https://loterias.caixa.gov.br", disponibilidade: disp("quina") },
      { chave: "lotomania", nome: "Lotomania", dezenaMin: 0, dezenaMax: 99, dezenasMin: 50, dezenasMax: 50, precos: prec([[50, 300]]), sorteios: "Segundas, quartas e sextas", fonteUrl: "https://loterias.caixa.gov.br", disponibilidade: disp("lotomania") },
    ],
  };
}

const PEDIDO = {
  id: 31, modalidade: "megasena", nome: "Mega-Sena", concurso: 9001, dataSorteio: "2026-11-21", totalCentavos: 600,
  status: "aguardando_pagamento", rotulo: "Aguardando pagamento", jogos: [{ ordem: 1, dezenas: [1, 2, 3, 4, 5, 6], precoCentavos: 600 }],
  linhaDoTempo: [
    { chave: "pedido", rotulo: "Pedido", estado: "feito" }, { chave: "pagamento", rotulo: "Pagamento", estado: "atual" },
    { chave: "fila", rotulo: "Fila", estado: "pendente" }, { chave: "registro", rotulo: "Registro", estado: "pendente" }, { chave: "comprovante", rotulo: "Comprovante", estado: "pendente" },
  ],
  prazos: { fechamentoOficialEm: "2026-11-21T22:00:00.000Z", limiteInternoEm: "2026-11-21T18:00:00.000Z", metaEfetivacaoEm: null },
  pagoEm: null, criadoEm: "2026-11-15T12:00:00.000Z", invoiceUrl: null, comprovante: null, falha: null, atrasadoNaMeta: false, podePagar: true, podeCancelar: true,
};

const RESULT = (m: string, nome: string, estado: "ok" | "indisponivel") => ({
  modalidade: m, nome, estado, atualizadoEm: estado === "ok" ? "2026-11-15T12:30:00.000Z" : null, ultimaTentativaEm: "2026-11-15T12:31:00.000Z",
  erro: estado === "ok" ? null : "fonte fora do ar", fonte: "API pública de resultados da CAIXA",
  itens: estado === "ok" ? [0, 1, 2, 3, 4].map((i) => ({ concurso: 8000 - i, data: `2026-11-${String(14 - i).padStart(2, "0")}`, dezenas: [1 + i, 10 + i, 20 + i, 30 + i, 40 + i, 50 + i] })) : [],
});

async function simularPortal(page: Page, aberto: boolean) {
  const st = { posts: [] as string[], bodies: [] as unknown[], pedidos: [] as unknown[] };
  await page.route("**/api/area-paciente/**", (r) => {
    const req = r.request(); const u = new URL(req.url()).pathname; const m = req.method();
    if (m !== "GET") { st.posts.push(`${m} ${u}`); try { st.bodies.push(req.postDataJSON()); } catch { st.bodies.push(null); } }
    if (u.endsWith("/meus-jogos")) return r.fulfill(json(catalogo(aberto)));
    if (u.endsWith("/meus-jogos/resultados")) return r.fulfill(json({ modalidades: [RESULT("megasena", "Mega-Sena", "ok"), RESULT("lotofacil", "Lotofácil", "ok"), RESULT("quina", "Quina", "indisponivel"), RESULT("lotomania", "Lotomania", "ok")] }));
    if (u.endsWith("/meus-jogos/favoritos") && m === "GET") return r.fulfill(json({ favoritos: [] }));
    if (u.endsWith("/meus-jogos/favoritos") && m === "POST") return r.fulfill(json({ ok: true, jaExistia: false }, 201));
    if (u.endsWith("/meus-jogos/pedidos") && m === "GET") return r.fulfill(json({ pedidos: st.pedidos }));
    if (u.endsWith("/meus-jogos/pedidos") && m === "POST") { st.pedidos = [PEDIDO]; return r.fulfill(json({ pedido: PEDIDO }, 201)); }
    if (u.endsWith("/pagar")) return r.fulfill(json({ ok: true, invoiceUrl: "https://sandbox.example/fatura", pix: { payload: "00020126SINTETICO", encodedImage: "" } }));
    if (u.endsWith("/grupo-vip")) return r.fulfill(json({ status: "ativo", boloes: [], participacoes: [] }));
    if (u.endsWith("/minha-categoria")) return r.fulfill(json({ nivel: "ouro" }));
    if (u.endsWith("/resumo")) return r.fulfill(json({ client: { name: "Maria Sintética" }, protocolsCount: 0, activeProtocolsCount: 0, totalSessions: 0, completedSessions: 0, nextSession: null }));
    return r.fulfill(json([]));
  });
  return st;
}

async function abrirMeusJogos(page: Page) {
  await page.goto(URL_AREA);
  await page.locator("nav").getByRole("button", { name: /GRUPO VIP/ }).click({ timeout: 20000 });
  await expect(page.getByTestId("club-vip-meus-jogos")).toBeVisible();
  await page.getByTestId("club-vip-cta-meus-jogos").click();
  await expect(page.getByTestId("meus-jogos")).toBeVisible();
}

const marcadasNoVolante = (page: Page) => page.locator('[data-testid="mj-volante"] button[aria-pressed="true"]');

for (const vp of [{ nome: "celular", width: 390, height: 844 }, { nome: "desktop", width: 1280, height: 800 }]) {
  test.describe(`Meus Jogos — ${vp.nome}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("portal: volante, faixa, limpar, aleatório, favorito; execução indisponível bloqueia a confirmação", async ({ page }) => {
      const st = await simularPortal(page, false);
      await abrirMeusJogos(page);
      await expect(page.getByTestId("mj-disponibilidade")).toHaveAttribute("data-aberto", "nao");
      await expect(page.getByTestId("mj-disponibilidade")).toContainText("Execução indisponível");

      for (const n of [3, 7, 11]) await page.getByTestId(`mj-bola-${n}`).click();
      await expect(page.getByTestId("mj-faixa-selecao")).toHaveText("03 07 11");
      await expect(page.getByTestId("mj-faixa-texto")).toContainText("Marque mais 3");
      await expect(page.getByTestId("mj-faixa-preco")).toHaveText("—");
      for (const n of [20, 25, 30]) await page.getByTestId(`mj-bola-${n}`).click();
      await expect(page.getByTestId("mj-faixa-preco")).toHaveText(/R\$\s*6,00/);
      await page.getByTestId("mj-bola-30").click(); // desmarca
      await expect(page.getByTestId("mj-bola-30")).toHaveAttribute("aria-pressed", "false");
      await page.getByTestId("mj-bola-30").click();
      await page.getByTestId("mj-bola-31").click(); // 7 dezenas
      await expect(page.getByTestId("mj-faixa-preco")).toHaveText(/R\$\s*42,00/);

      await page.getByTestId("mj-limpar").click();
      await expect(marcadasNoVolante(page)).toHaveCount(0);
      await page.getByTestId("mj-aleatorio").click();
      await expect(marcadasNoVolante(page)).toHaveCount(6);
      await expect(page.getByTestId("mj-faixa-preco")).toHaveText(/R\$\s*6,00/);

      await page.getByTestId("mj-favoritar").click();
      await expect(page.getByTestId("mj-aviso")).toContainText("favoritos");
      await page.getByTestId("mj-adicionar").click();
      await expect(page.getByTestId("mj-resumo-jogo")).toHaveCount(1);
      await expect(page.getByTestId("mj-total")).toHaveText(/R\$\s*6,00/);
      await expect(page.getByTestId("mj-revisar")).toBeDisabled();
      await expect(page.getByTestId("mj-confirmar-bloqueado")).toContainText("Execução indisponível");
      await page.screenshot({ path: `generated-artifacts/meus-jogos-volante-${vp.nome}.png`, fullPage: true });

      // Lotomania: 00 a 99, exatamente 50
      await page.getByTestId("mj-mod-lotomania").click();
      await expect(page.getByTestId("mj-bola-0")).toContainText("00");
      await expect(page.getByTestId("mj-bola-99")).toContainText("99");
      await page.getByTestId("mj-aleatorio").click();
      await expect(marcadasNoVolante(page)).toHaveCount(50);
      await expect(page.getByTestId("mj-faixa-preco")).toHaveText(/R\$\s*3,00/);
      await semRolagemHorizontal(page);

      expect(st.posts.filter((p) => p.endsWith("/meus-jogos/pedidos"))).toEqual([]); // nada foi criado
    });

    test("portal: resultados oficiais (ok) e indisponível sem dado inventado", async ({ page }) => {
      await simularPortal(page, false);
      await abrirMeusJogos(page);
      await page.getByTestId("mj-aba-resultados").click();
      await expect(page.getByTestId("mj-resultado")).toHaveCount(5);
      await expect(page.getByTestId("mj-resultados-estado")).toHaveAttribute("data-estado", "ok");
      await page.screenshot({ path: `generated-artifacts/meus-jogos-resultados-${vp.nome}.png`, fullPage: true });
      await page.getByTestId("mj-mod-quina").click();
      await expect(page.getByTestId("mj-resultados-estado")).toHaveAttribute("data-estado", "indisponivel");
      await expect(page.getByTestId("mj-resultado")).toHaveCount(0);
      await expect(page.getByTestId("mj-resultados-estado")).toContainText("indisponíveis");
      await semRolagemHorizontal(page);
    });

    test("portal: pedido confirmado, PIX gerado e estado nunca vira pago sem o servidor", async ({ page }) => {
      const st = await simularPortal(page, true);
      await abrirMeusJogos(page);
      await expect(page.getByTestId("mj-disponibilidade")).toHaveAttribute("data-aberto", "sim");
      for (const n of [1, 2, 3, 4, 5, 6]) await page.getByTestId(`mj-bola-${n}`).click();
      await page.getByTestId("mj-adicionar").click();
      await page.getByTestId("mj-revisar").click();
      await expect(page.getByTestId("mj-confirmacao")).toContainText("comprovante oficial");
      await page.getByTestId("mj-confirmar").click();
      await expect(page.getByTestId("mj-pedido")).toHaveAttribute("data-status", "aguardando_pagamento");
      const corpo = st.bodies.find((b) => b && (b as { jogos?: unknown }).jogos) as { modalidade: string; jogos: number[][]; chave: string };
      expect(corpo.modalidade).toBe("megasena");
      expect(corpo.jogos).toEqual([[1, 2, 3, 4, 5, 6]]);
      expect(corpo.chave).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
      await page.getByTestId("mj-pagar").click();
      await expect(page.getByTestId("mj-pix")).toBeVisible();
      await expect(page.getByTestId("mj-pedido-rotulo")).toHaveText("Aguardando pagamento");
      await expect(page.getByTestId("mj-baixar-comprovante")).toHaveCount(0);
      const texto = (await page.getByTestId("mj-pedidos").innerText()).toLowerCase();
      expect(texto).not.toContain("registrado com sucesso");
      await page.screenshot({ path: `generated-artifacts/meus-jogos-pedido-${vp.nome}.png`, fullPage: true });
      await semRolagemHorizontal(page);
    });

    test("gestão: selecionar cliente mostra pedidos e a execução indisponível", async ({ page }) => {
      await page.addInitScript((p) => {
        localStorage.setItem("padcom_collab_token", "e2e-fake-token");
        localStorage.setItem("padcom_collab_prof", JSON.stringify(p));
      }, PROF);
      await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: PROF })));
      await page.route("**/api/clients**", (r) => r.fulfill(json([{ id: 10, name: "Maria Sintética", cpf: "00000000191", phone: "11999990000" }])));
      const escritas: string[] = [];
      await page.route("**/api/boloes/**", (r) => {
        const m = r.request().method(); const u = new URL(r.request().url()).pathname;
        if (m !== "GET") escritas.push(`${m} ${u}`);
        if (u.endsWith("/meus-jogos/painel")) return r.fulfill(json({
          config: { margemMinutos: 240, metaMinutos: 30, tetoPedidoCentavos: 50000, fechamentoOficial: {}, fonteFechamento: null },
          execucao: { disponivel: false, motivo: "Nenhum canal autorizado de registro conectado.", ambiente: "prova isolada" },
          snapshotVerificadoEm: "2026-11-15T12:00:00.000Z",
          fontes: [{ modalidade: "megasena", nome: "Mega-Sena", fonteUrl: "https://loterias.caixa.gov.br", situacao: { desatualizado: false, motivo: null, verificadoEm: "2026-11-15T12:00:00.000Z" }, conferencia: null }],
        }));
        if (u.endsWith("/meus-jogos/cliente/10")) return r.fulfill(json({ cliente: { id: 10, nome: "Maria Sintética" }, membroAtivo: true, favoritos: 2, pedidos: [{ ...PEDIDO, motivoInterno: null, devolucaoRef: null }] }));
        if (u.endsWith("/resumo")) return r.fulfill(json({ config: { driveFolderId: null, autoAprovar: false } }));
        if (u.endsWith("/recebimentos")) return r.fulfill(json({ recebimentos: [] }));
        if (u.endsWith("/auditoria")) return r.fulfill(json({ eventos: [] }));
        if (u.endsWith("/automacao")) return r.fulfill(json({ estado: "pendente", registraJogos: false, coletaComprovantes: false, motivo: "sem acesso", ambiente: "prova isolada" }));
        if (u.endsWith("/participacoes")) return r.fulfill(json({ campanhas: [], participacoes: [] }));
        if (u.endsWith("/grupo-vip")) return r.fulfill(json({ membros: [], convitesBolao: [] }));
        return r.fulfill(json({}));
      });
      await page.goto("/boloes");
      await page.getByRole("button", { name: /Grupo VIP/ }).first().click({ timeout: 25000 });
      await expect(page.getByTestId("mj-gestor-execucao")).toHaveAttribute("data-disponivel", "nao");
      await expect(page.getByTestId("mj-gestor-execucao")).toContainText("nenhum pedido é aceito");
      const bloco = page.getByTestId("mj-gestor-cliente");
      await bloco.getByRole("button", { name: "Selecionar cliente…" }).click();
      await page.getByText("Maria Sintética").first().click();
      await expect(page.getByTestId("mj-gestor-resumo-cliente")).toContainText("participa do Grupo VIP");
      await expect(page.getByTestId("mj-gestor-pedido")).toHaveAttribute("data-status", "aguardando_pagamento");
      await expect(page.getByTestId("mj-gestor-fonte")).toHaveAttribute("data-desatualizado", "nao");
      expect(escritas).toEqual([]);
      await semRolagemHorizontal(page);
      await page.screenshot({ path: `generated-artifacts/meus-jogos-gestao-${vp.nome}.png`, fullPage: true });
    });
  });
}
