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
    await page.mouse.move(caixaOrigem.x + caixaOrigem.width + 120, caixaOrigem.y + 50);
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
    await expect(fioSalvo).toHaveAttribute("stroke-width", "2");
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
  await expect(page.getByTestId("faixa-correspondencia-atual")).toContainText(perguntaId);
  await page.getByTestId("faixa-travar").click();
  await expect(page.getByTestId("faixa-travar")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId(`faixa-ligar-EXAME|exame|${destinoId}`).click();
  await expect.poll(() => estado.pedidos.length).toBe(1);
  await expect(page.getByTestId("faixa-correspondencia-chips")).toContainText("Exame sintético");
  await page.screenshot({ path: "/tmp/sinapse-travada.png" });
});

test("sinapse: clicar de novo na pergunta apaga os fios dela", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepararTela(page);
  const linha = page.getByTestId(`faixa-dendrito-${perguntaId}`);
  await linha.click();
  await expect(page.getByTestId("faixa-correspondencia-atual")).toContainText(perguntaId);
  await linha.click();
  await page.mouse.move(900, 700);
  await expect(page.getByTestId("faixa-correspondencia-atual")).toContainText("Escolha uma pergunta");
});

test("sinapse: clicar de novo no pino ou noutra pergunta desarma o fio", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepararTela(page);
  await page.getByTestId("faixa-modo-EDICAO").click();
  const pino = page.getByTestId(`faixa-porta-${perguntaId}`);
  await pino.click();
  await expect(pino).toHaveAttribute("aria-pressed", "true");
  await pino.click();
  await expect(pino).toHaveAttribute("aria-pressed", "false");
  await pino.click();
  await expect(pino).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId(`faixa-dendrito-${perguntaId}`).click();
  await expect(pino).toHaveAttribute("aria-pressed", "false");
});
