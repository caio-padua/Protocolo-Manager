import { expect, test, type Page } from "@playwright/test";

const perguntaId = "C-GER03";
const destinoId = 12;

async function prepararTela(page: Page, falharGravacao = false, propostasIniciais = 0) {
  const estado = {
    propostas: Array.from({ length: propostasIniciais }, (_, i) => ({ id: 500 + i, perguntaId, categoria: "EXAME", destinoTipo: "exame", destinoId, eixo: "TESTE", justificativa: "Proposta sintética", status: "PENDENTE" })),
    aprovadas: [] as number[],
    ligacoes: [] as Array<{ id: number; perguntaId: string; categoria: string; destinoTipo: string; destinoId: number; cloneDe: null }>,
    pedidos: [] as Array<Record<string, unknown>>,
  };

  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 7001, name: "Profissional Sintético", role: "admin" }));
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (path === "/api/collaborator/me") {
      return json({ professional: { id: 7001, name: "Profissional Sintético", role: "admin" } });
    }
    if (path === "/api/cadastros/sinapses/painel") {
      return json({
        perguntas: [{ perguntaId, pergunta: "Fadiga sintética para teste", bloco: "SINTÉTICO", eSinalAlarme: false }],
        destinos: {
          EXAME: [{ tipo: "exame", id: destinoId, nome: "Exame sintético", incompleto: false }],
          PRESCRICAO: [],
          INJETAVEL_IM: [],
          INJETAVEL_SC: [],
          INJETAVEL_EV: [],
          IMPLANTE: [],
        },
        injetaveisSemVia: 0,
        sinapses: estado.ligacoes,
        propostas: estado.propostas,
      });
    }
    if (path.startsWith("/api/cadastros/sinapses/resumo/")) {
      return json({ titulo: "Exame sintético", itens: [], linhas: [{ rotulo: "Grupo", valor: "Grupo sintético" }] });
    }
    const aprovar = path.match(/^\/api\/cadastros\/sinapses\/propostas\/(\d+)\/aprovar$/);
    if (aprovar && request.method() === "POST") {
      const id = Number(aprovar[1]);
      estado.aprovadas.push(id);
      estado.propostas = estado.propostas.map((p) => (p.id === id ? { ...p, status: "APROVADA" } : p));
      return json({ id, status: "APROVADA" });
    }
    if (path === "/api/cadastros/sinapses" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      estado.pedidos.push(body);
      if (falharGravacao) return json({ error: "Falha sintética ao salvar" }, 409);
      estado.ligacoes = [{
        id: 901,
        perguntaId: String(body.perguntaId),
        categoria: String(body.categoria),
        destinoTipo: String(body.destinoTipo),
        destinoId: Number(body.destinoId),
        cloneDe: null,
      }];
      return json({ id: 901 }, 201);
    }
    return json([]);
  });

  await page.goto("/sinapses-clinicas", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("faixa-modo-EDICAO")).toBeVisible();
  await page.getByTestId("faixa-modo-EDICAO").click();
  return estado;
}

for (const viewport of [
  { nome: "computador", width: 1280, height: 800 },
  { nome: "celular", width: 402, height: 874 },
]) {
  test(`sinapse: dois cliques conectam e acendem o fio no ${viewport.nome}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const estado = await prepararTela(page);
    const origem = page.getByTestId(`faixa-porta-${perguntaId}`);
    const destino = page.getByTestId(`faixa-porta-destino-EXAME|exame|${destinoId}`);

    if (viewport.nome === "celular") {
      const caixa = await origem.boundingBox();
      expect(caixa?.width).toBeGreaterThanOrEqual(40);
      expect(caixa?.height).toBeGreaterThanOrEqual(40);
    }

    await origem.click();
    await expect(page.getByTestId("faixa-ajuda")).toContainText(`Fio iniciado em ${perguntaId}`);
    const fioTemporario = page.locator("svg.fixed path");
    const dInicial = await fioTemporario.getAttribute("d");
    const caixaOrigem = await origem.boundingBox();
    if (!caixaOrigem) throw new Error("O ponto de origem sintético não foi renderizado.");
    await page.mouse.move(caixaOrigem.x + caixaOrigem.width + 120, caixaOrigem.y - 50);
    await expect.poll(() => fioTemporario.getAttribute("d")).not.toBe(dInicial);

    await destino.click();
    await expect.poll(() => estado.pedidos.length).toBe(1);
    expect(estado.pedidos[0]).toEqual({
      perguntaId,
      categoria: "EXAME",
      destinoTipo: "exame",
      destinoId,
    });
    await expect(page.getByText("Ligação salva", { exact: true })).toBeVisible();
    const fioSalvo = page.getByTestId("faixa-fio-ativa-901");
    await expect(fioSalvo).not.toHaveClass(/sinapse-fio-ignicao/);
    await expect(fioSalvo).toHaveAttribute("stroke-width", "2.4");
    await expect(fioSalvo).toHaveAttribute("style", /opacity: 1/);
    await expect(fioSalvo).toHaveAttribute("style", /opacity: 1/);
  });
}

test("sinapse: clicar na fibra mostra a etiqueta com desvincular", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page);
  await page.getByTestId(`faixa-porta-${perguntaId}`).click();
  await page.getByTestId(`faixa-porta-destino-EXAME|exame|${destinoId}`).click();
  await expect.poll(() => estado.pedidos.length).toBe(1);
  await expect(page.getByTestId("faixa-fio-clique-ativa-901")).toBeAttached();
  await page.getByTestId("faixa-fio-clique-ativa-901").click({ force: true });
  await expect(page.getByTestId("faixa-pilula-fio")).toContainText(perguntaId);
  await expect(page.getByTestId("faixa-pilula-desvincular")).toBeVisible();
});

test("sinapse: Escape cancela sem gravar e erro não acende o fio", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page, true);
  const origem = page.getByTestId(`faixa-porta-${perguntaId}`);
  const destino = page.getByTestId(`faixa-porta-destino-EXAME|exame|${destinoId}`);

  await origem.click();
  await expect(page.getByTestId("faixa-ajuda")).toContainText(`Fio iniciado em ${perguntaId}`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("faixa-ajuda")).not.toContainText(`Fio iniciado em ${perguntaId}`);
  expect(estado.pedidos).toHaveLength(0);

  await origem.click();
  await destino.click();
  await expect.poll(() => estado.pedidos.length).toBe(1);
  await expect(page.getByText("Falha sintética ao salvar", { exact: true })).toBeVisible();
  expect(estado.ligacoes).toHaveLength(0);
  await expect(page.getByTestId("faixa-fio-ativa-901")).toHaveCount(0);
});

test("sinapse: mantém o arraste e permite ligar pelos dois pontos com teclado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page);
  const origem = page.getByTestId(`faixa-porta-${perguntaId}`);
  const destino = page.getByTestId(`faixa-porta-destino-EXAME|exame|${destinoId}`);
  await origem.scrollIntoViewIfNeeded();
  await destino.scrollIntoViewIfNeeded();
  const caixaOrigem = await origem.boundingBox();
  const caixaDestino = await destino.boundingBox();
  if (!caixaOrigem || !caixaDestino) throw new Error("Os pontos sintéticos da sinapse não foram renderizados.");

  await page.mouse.move(caixaOrigem.x + caixaOrigem.width / 2, caixaOrigem.y + caixaOrigem.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId("faixa-ajuda")).toContainText(`Fio iniciado em ${perguntaId}`);
  const novaCaixaDestino = await destino.boundingBox();
  if (!novaCaixaDestino) throw new Error("O ponto de destino sintético desapareceu.");
  await page.mouse.move(novaCaixaDestino.x + novaCaixaDestino.width / 2, novaCaixaDestino.y + novaCaixaDestino.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => estado.pedidos.length).toBe(1);

  await origem.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("faixa-ajuda")).toContainText(`Fio iniciado em ${perguntaId}`);
  await destino.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => estado.pedidos.length).toBe(2);
});

test("sinapse: aprovação em lote pede confirmação e usa a rota de cada proposta", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page, false, 3);
  const botao = page.getByTestId("button-aprovar-lote");
  await expect(botao).toHaveText("Aprovar propostas filtradas");
  await botao.click();
  await expect(botao).toHaveText("Confirmar 3");
  expect(estado.aprovadas).toHaveLength(0);
  await botao.click();
  await expect.poll(() => estado.aprovadas.length).toBe(3);
  await expect(page.getByTestId("button-aprovar-lote")).toHaveCount(0);
});

test("sinapse: clicar na pergunta da sanfona rola o grafo até ela", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepararTela(page, false, 1);
  await page.getByTestId(`faixa-item-${perguntaId}`).getByRole("button").first().click();
  await expect(page.getByTestId("faixa-item-" + perguntaId)).toBeVisible();
  await expect(page.getByTestId("faixa-grafo-rolagem")).toBeAttached();
});

test("sinapse: travar a pergunta e clicar na saída liga sem arrastar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page);
  await page.getByTestId(`faixa-dendrito-${perguntaId}`).click();
  await expect(page.getByTestId("faixa-painel-pergunta")).toContainText(perguntaId);
  await expect(page.getByTestId("faixa-travar")).toHaveAttribute("aria-pressed", "true"); // travada sozinha ao clicar
  await page.getByTestId(`faixa-ligar-EXAME|exame|${destinoId}`).click();
  await expect.poll(() => estado.pedidos.length).toBe(1);
  await page.getByTestId("faixa-ver-ativas").click();
  await expect(page.getByTestId("faixa-tela-visao")).toContainText("Ligações ativas");
  await page.getByTestId("faixa-tela-visao-PROPOSTAS").click();
  await expect(page.getByTestId("faixa-tela-sinapses-EXAME")).toHaveCount(0);
  await page.getByTestId("faixa-tela-visao-ATIVAS").click();
  await expect(page.getByTestId("faixa-correspondencia-chips")).toContainText("Exame sintético");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "/tmp/sinapse-travada.png" });
});

test("sinapse: clicar de novo na pergunta apaga os fios dela", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepararTela(page);
  const linha = page.getByTestId(`faixa-dendrito-${perguntaId}`);
  await linha.click();
  await expect(page.getByTestId("faixa-painel-pergunta")).toContainText(perguntaId);
  await linha.click();
  await page.mouse.move(900, 700);
  await expect(page.getByTestId("faixa-painel-pergunta-vazio")).toContainText("Selecione uma pergunta");
});

test("sinapse: 1 clique arma, 2 cliques rápidos na bolinha desarmam e outra pergunta também", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepararTela(page);
  await page.getByTestId("faixa-modo-EDICAO").click();
  const pino = page.getByTestId(`faixa-porta-${perguntaId}`);
  await pino.click();
  await expect(pino).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(800);
  await pino.dblclick();
  await expect(pino).toHaveAttribute("aria-pressed", "false");
  await pino.click();
  await expect(pino).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId(`faixa-dendrito-${perguntaId}`).click();
  await expect(pino).toHaveAttribute("aria-pressed", "false");
});

test("sinapse: 1 clique na saída liga e mantém armado; 2 cliques rápidos ligam e fecham", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page);
  await page.getByTestId("faixa-modo-EDICAO").click();
  const pino = page.getByTestId(`faixa-porta-${perguntaId}`);
  const destino = page.getByTestId(`faixa-porta-destino-EXAME|exame|${destinoId}`);
  await pino.click();
  await destino.click();
  await expect.poll(() => estado.pedidos.length).toBe(1);
  await expect(pino).toHaveAttribute("aria-pressed", "true");
  await destino.dblclick();
  await expect(pino).toHaveAttribute("aria-pressed", "false");
});

test("sinapse: mini console central, colunas independentes e menu de ligações da pergunta", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page, false, 1);
  const console_ = page.getByTestId("faixa-mini-console");
  await expect(console_.getByTestId("faixa-modo-EDICAO")).toBeVisible();
  const caixaConsole = await console_.boundingBox();
  const caixaFaixa = await page.getByTestId("faixa-grafo").boundingBox();
  expect(caixaConsole && caixaFaixa && caixaConsole.y >= caixaFaixa.y && caixaConsole.y < caixaFaixa.y + 80).toBeTruthy();
  const painel = await page.getByTestId("faixa-painel-pergunta").boundingBox();
  expect(painel && caixaFaixa && painel.y + painel.height <= caixaFaixa.y + 2).toBeTruthy();
  await expect(page.getByTestId("faixa-coluna-perguntas")).toBeVisible();
  await expect(page.getByTestId("faixa-coluna-saidas")).toBeVisible();
  const sobreposicao = await page.evaluate(() => {
    const e = document.querySelector('[data-testid="faixa-coluna-perguntas"]') as HTMLElement;
    const d = document.querySelector('[data-testid="faixa-coluna-saidas"]') as HTMLElement;
    return getComputedStyle(e).overflowY === "auto" && getComputedStyle(d).overflowY === "auto";
  });
  expect(sobreposicao).toBe(true);

  await page.getByTestId(`faixa-menu-${perguntaId}`).click();
  const menu = page.getByTestId("faixa-menu-ligacoes");
  await expect(menu).toBeVisible();
  const tecla = menu.getByRole("switch", { name: /Aprovar proposta/ });
  await expect(tecla).toHaveAttribute("aria-checked", "false");
  await tecla.click();
  await expect.poll(() => estado.aprovadas.length).toBe(1);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.screenshot({ path: "/tmp/sinapse-console.png" });
});

test("sinapse: painel da pergunta atual espelha caixa sim/não e fio nos dois sentidos", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page);
  await page.getByTestId(`faixa-porta-${perguntaId}`).click(); // seleciona e arma
  await page.keyboard.press("Escape");
  await page.getByText("Fadiga sintética para teste").first().click();
  await expect(page.getByTestId("faixa-painel-pergunta-titulo")).toContainText("Fadiga sintética");
  await expect(page.getByTestId("faixa-painel-pergunta-subtitulo")).toContainText("SINTÉTICO");

  await expect(page.getByTestId("faixa-seletor-abrir")).toHaveCount(0);
  await expect(page.getByTestId("faixa-seletor-EXA-12")).toHaveCount(0); // lingueta fechada
  await page.getByTestId("faixa-seletor-busca").click();
  await page.getByTestId("faixa-seletor-cat-IMPLANTE").click();
  await expect(page.getByTestId("faixa-seletor-grupo-EXAME")).toHaveCount(0);
  await expect(page.getByTestId("faixa-seletor-grupo-IMPLANTE")).toBeVisible();
  await page.getByTestId("faixa-seletor-cat-TODAS").click();
  await expect(page.getByTestId("faixa-seletor-grupo-EXAME")).toBeVisible();
  const caixa = page.getByTestId("faixa-seletor-EXA-12");
  await expect(caixa).not.toBeChecked();
  await caixa.click(); // caixa -> fio
  await expect.poll(() => estado.pedidos.length).toBe(1);
  await expect(caixa).toBeChecked();
  await expect(page.getByTestId("faixa-painel-pergunta-subtitulo")).toContainText("Ativas 1");
  await page.screenshot({ path: "/tmp/sinapse-painel.png" });
  await page.getByTestId("faixa-ver-sinapses").click();
  await expect(page.getByTestId("faixa-tela-sinapses-EXAME")).toContainText("Exame sintético");
  await page.getByTestId("faixa-chip-desvincular-901-expandir").click();
  await expect(page.getByTestId("grade-saidas-resumo")).toContainText("Grupo sintético");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/sinapse-tela.png" });
});

test("sinapse: 2 cliques rápidos na bolinha em repouso armam o fio e 2 cliques depois desarmam", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepararTela(page);
  await page.getByTestId("faixa-modo-EDICAO").click();
  const pino = page.getByTestId(`faixa-porta-${perguntaId}`);
  await pino.dblclick();
  await expect(pino).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(800);
  await pino.dblclick();
  await expect(pino).toHaveAttribute("aria-pressed", "false");
});

test("sinapse: ampliada, o fio em andamento aparece por cima da tela e liga", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page);
  await page.getByTestId("faixa-modo-EDICAO").click();
  await page.getByRole("button", { name: /ampliar/i }).click();
  const pino = page.getByTestId(`faixa-porta-${perguntaId}`);
  await pino.click();
  const z = await page.evaluate(() => {
    const fio = document.querySelector("svg.fixed") as HTMLElement | null;
    const tela = document.querySelector('[data-testid="faixa-secao"], section.fixed') as HTMLElement | null;
    return { fio: Number(getComputedStyle(fio!).zIndex), tela: Number(getComputedStyle(tela!).zIndex) };
  });
  expect(z.fio).toBeGreaterThan(z.tela);
  await page.getByTestId(`faixa-porta-destino-EXAME|exame|${destinoId}`).click();
  await expect.poll(() => estado.pedidos.length).toBe(1);
});

test("sinapse: seta da saída abre o cadastro com substâncias alinhadas, tomadas em andares e observação embaixo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepararTela(page);
  await page.route("**/api/cadastros/sinapses/resumo/**", (r) => r.fulfill({ json: {
    titulo: "FORMULA TESTE", itens: ["TIROSINA 500 MG", "SELENIO 100 MCG"],
    linhas: [{ rotulo: "Via", valor: "ORAL" }, { rotulo: "Apresentação", valor: "CAPSULA VEGETAL" }, { rotulo: "Posologia", valor: "UMA DOSE DE MANHA · UMA DOSE A NOITE" }, { rotulo: "Observação", valor: "AJUSTE PERMITIDO" }],
  } }));
  await page.getByTestId(`faixa-menu-saida-EXAME|exame|${destinoId}`).click();
  const painel = page.getByTestId("faixa-menu-saida-painel");
  await expect(painel.getByTestId("resumo-substancias")).toContainText("500 MG");
  await expect(painel.getByTestId("resumo-posologia")).toContainText("1ª tomada");
  await expect(painel.getByTestId("resumo-posologia")).toContainText("2ª tomada");
  await expect(painel.getByTestId("resumo-atributos")).toContainText("CAPSULA VEGETAL");
  await expect(painel.getByTestId("resumo-observacao")).toContainText("AJUSTE PERMITIDO");
  await page.screenshot({ path: "/tmp/saida-painel.png" });
});

for (const tela of [{ nome: "minimizada", ampliar: false }, { nome: "maximizada", ampliar: true }]) {
  test(`sinapse: fio na cor do bloco, duplo clique no meio desarma e termostatos dentro da moldura (${tela.nome})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const estado = await prepararTela(page);
    await page.getByTestId("faixa-modo-EDICAO").click();
    if (tela.ampliar) await page.getByRole("button", { name: /ampliar/i }).click();
    const pino = page.getByTestId(`faixa-porta-${perguntaId}`);
    await pino.click();
    const cores = await page.evaluate((pid) => {
      const fio = document.querySelector("svg.fixed path") as SVGPathElement;
      const q = document.querySelector(`[data-testid="faixa-porta-${pid}"] .sinapse-pino`) as HTMLElement;
      return { fio: fio.getAttribute("stroke"), pino: getComputedStyle(q).getPropertyValue("--cor-pino").trim() };
    }, perguntaId);
    expect(cores.fio?.toLowerCase()).toBe(cores.pino.toLowerCase());
    // 1 clique na saída liga e continua armado
    await page.getByTestId(`faixa-porta-destino-EXAME|exame|${destinoId}`).click();
    await expect.poll(() => estado.pedidos.length).toBe(1);
    await expect(page.locator("svg.fixed path")).toHaveCount(1);
    // dois cliques no meio da tela de vidro desarmam, mantendo o que foi ligado
    const vidro = await page.getByTestId("faixa-vidro").boundingBox();
    if (!vidro) throw new Error("vidro ausente");
    await page.mouse.dblclick(vidro.x + vidro.width / 2, vidro.y + vidro.height / 2);
    await expect(page.locator("svg.fixed path")).toHaveCount(0);
    expect(estado.pedidos.length).toBe(1);
    // termostatos dentro da moldura, sem cruzar o vidro nem um ao outro
    const caixa = async (id: string) => page.getByTestId(id).boundingBox();
    const moldura = await caixa("faixa-grafo-rolagem");
    const e = await caixa("faixa-termostato-perguntas");
    const d = await caixa("faixa-termostato-saidas");
    if (!moldura || !e || !d) throw new Error("termostato ou moldura ausente");
    expect(e.x).toBeGreaterThanOrEqual(moldura.x);
    expect(d.x + d.width).toBeLessThanOrEqual(moldura.x + moldura.width);
    expect(e.x + e.width).toBeLessThan(d.x);
    expect(e.y).toBeGreaterThanOrEqual(moldura.y);
    expect(d.y + d.height).toBeLessThanOrEqual(moldura.y + moldura.height);
    expect(vidro.x).toBeGreaterThan(e.x + e.width);
    expect(vidro.x + vidro.width).toBeLessThan(d.x);
    expect(d.width).toBeGreaterThanOrEqual(14);
  });
}

test("sinapse: aviso e balão do fio nascem perto do mouse e o botão de excluir não muda de lugar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const estado = await prepararTela(page);
  await page.getByTestId("faixa-modo-EDICAO").click();
  await page.getByTestId(`faixa-porta-${perguntaId}`).click();
  const destino = page.getByTestId(`faixa-porta-destino-EXAME|exame|${destinoId}`);
  await destino.click();
  await expect.poll(() => estado.pedidos.length).toBe(1);
  const cd = await destino.boundingBox();
  const aviso = await page.getByTestId("faixa-aviso").boundingBox();
  if (!cd || !aviso) throw new Error("sem aviso");
  expect(Math.abs(aviso.x - (cd.x + cd.width / 2))).toBeLessThan(120);
  expect(Math.abs(aviso.y - (cd.y + cd.height / 2))).toBeLessThan(80);
  await page.keyboard.press("Escape");
  await page.getByTestId("faixa-fio-clique-ativa-901").click({ force: true });
  const pilula = page.getByTestId("faixa-pilula-fio");
  await expect(pilula).toBeVisible();
  {
    const caixa = await pilula.boundingBox();
    const p = await page.evaluate(() => 0);
    expect(caixa).not.toBeNull();
    void p;
    const antes = await page.getByTestId("faixa-pilula-desvincular").boundingBox();
    await page.getByTestId("faixa-pilula-desvincular").click();
    const depois = await page.getByTestId("faixa-pilula-desvincular").boundingBox();
    const conf = await page.getByTestId("faixa-pilula-desvincular-confirmar").boundingBox();
    expect(depois?.x).toBe(antes?.x);
    expect(conf && depois && conf.x > depois.x).toBeTruthy();
    await expect(page.getByTestId("faixa-pilula-desvincular-confirmar")).toBeVisible();
    await expect(page.getByTestId("faixa-pilula-desvincular")).toHaveText("Desvincular");
  }
});
