import { expect, test, type Page } from "@playwright/test";

const perguntaId = "C-GER03";
const destinoId = 12;

async function prepararTela(page: Page, falharGravacao = false) {
  const estado = {
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
        propostas: [],
      });
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
    await expect(fioSalvo).toHaveClass(/sinapse-fio-ignicao/);
    await expect(fioSalvo).toHaveAttribute("stroke-width", "3.5");
    await expect(fioSalvo).toHaveAttribute("style", /opacity: 0\.98/);
    await expect(fioSalvo).not.toHaveClass(/sinapse-fio-ignicao/, { timeout: 3000 });
    await expect(fioSalvo).toHaveAttribute("style", /opacity: 0\.98/);
  });
}

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
