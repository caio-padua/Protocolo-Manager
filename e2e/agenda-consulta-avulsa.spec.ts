/**
 * Consulta avulsa pela Agenda Diária (rota /agenda/book-avulsa), sem protocolo.
 * Rotas simuladas e relógio fixo (quinta-feira 12/11/2026, 10:20 em Brasília): nenhum dado real, nenhuma consulta gravada,
 * nenhum evento criado no Google, nenhuma mensagem enviada. A única escrita permitida é o POST simulado de /agenda/book-avulsa.
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const AGORA_UTC = new Date("2026-11-12T13:20:00Z"); // 10:20 em Brasília
const HOJE = "2026-11-12";
const URL_DIA = `/agenda?modo=dia&data=${HOJE}&visao=linha`;
const HORA_PX = 76; // linha do tempo do dia
const HORA_INI = 7;

const CLIENTES = [
  { id: 501, name: "Cliente Sintético Alfa", cpf: "00000000191", phone: "11900000001", photoUrl: null, status: "active", deletedAt: null },
  { id: 502, name: "Cliente Sintético Beta", cpf: "00000000272", phone: "11900000002", photoUrl: null, status: "active", deletedAt: null },
];
const RECURSOS = [
  { id: 19, name: "AGENDA SEDE", kind: "medico", modality: "local", color: "#1d4f8f", slotMinutes: 20, active: true, sortOrder: 1,
    professionalId: 1, professionalName: "Dra. Teste", locationId: 8, locationName: "Sede Centro" },
  { id: 21, name: "AGENDA ONLINE", kind: "enfermagem", modality: "online", color: "#7cb342", slotMinutes: 30, active: true, sortOrder: 2,
    professionalId: 2, professionalName: "Enf. Teste", locationId: null, locationName: null },
  { id: 30, name: "SALA DE EQUIPAMENTO", kind: "sala", modality: "local", color: "#999999", slotMinutes: 20, active: true, sortOrder: 3,
    professionalId: null, professionalName: null, locationId: 8, locationName: "Sede Centro" },
];
const sessaoExistente = {
  id: 1, protocolId: 1, clientId: 900, clientName: "Paciente Existente", clientCpf: "", scheduledDate: HOJE, scheduledTime: "14:00", status: "scheduled",
  serviceType: "clinic", unit: "Sede", weekNumber: 2, substanceApplications: [], createdAt: "2026-01-01T00:00:00Z", professionalName: "Dra. Teste",
  durationMinutes: 60, resourceId: 19, agendaNome: "AGENDA SEDE", agendaCor: "#1d4f8f",
};

function slotsDe(resourceId: number) {
  const passo = resourceId === 21 ? 30 : 20;
  const slots = [];
  for (let m = 7 * 60; m < 20 * 60; m += passo) {
    const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    slots.push({ time, state: resourceId === 19 && time === "09:20" ? "ocupado" : "aberto", reason: null, subBlockIndex: 0 });
  }
  return { resourceId, date: HOJE, reason: null, subBlocks: [], slots };
}

type Escrita = { metodo: string; url: string; corpo: unknown };
type Opcoes = { reservar?: (r: Route, corpo: Record<string, unknown>) => Promise<void> | void; sessoes?: unknown[] };

async function base(page: Page, opcoes: Opcoes = {}) {
  const escritas: Escrita[] = [];
  let sessoesChamadas = 0;
  await page.clock.setFixedTime(AGORA_UTC);
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Recepção Teste", role: "recepcao" }));
  });
  await page.route("**/api/**", (r) => {
    if (r.request().method() !== "GET") escritas.push({ metodo: r.request().method(), url: r.request().url(), corpo: r.request().postDataJSON?.() ?? null });
    return r.fulfill(json([]));
  });
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Recepção Teste", role: "recepcao" } })));
  await page.route("**/api/clients*", (r) => r.fulfill(json(CLIENTES)));
  await page.route("**/api/agenda/resources", (r) => r.fulfill(json(RECURSOS)));
  await page.route("**/api/agenda/slots*", (r) => {
    const id = Number(new URL(r.request().url()).searchParams.get("resourceId"));
    return r.fulfill(json(slotsDe(id)));
  });
  await page.route("**/api/sessions*", (r) => { sessoesChamadas++; return r.fulfill(json(opcoes.sessoes ?? [sessaoExistente])); });
  await page.route("**/api/agenda/google-compromissos*", (r) => r.fulfill(json({ desde: "2026-01-01T00:00:00Z", agendas: [], eventos: [] })));
  await page.route("**/api/agenda/book-avulsa", async (r) => {
    const corpo = r.request().postDataJSON() as Record<string, unknown>;
    escritas.push({ metodo: "POST", url: r.request().url(), corpo });
    if (opcoes.reservar) return opcoes.reservar(r, corpo);
    return r.fulfill(json({ session: { id: 77, protocolId: null, clientId: corpo.clientId, scheduledDate: corpo.date, scheduledTime: corpo.time, status: "scheduled" }, googleEventId: "evt-sintetico" }, 201));
  });
  return {
    reservas: () => escritas.filter((e) => e.url.endsWith("/agenda/book-avulsa")),
    outrasEscritas: () => escritas.filter((e) => !e.url.endsWith("/agenda/book-avulsa")),
    sessoesChamadas: () => sessoesChamadas,
  };
}

async function colunaDoDia(page: Page) {
  const rolagem = page.getByTestId("tl-rolagem");
  await expect(rolagem).toBeVisible();
  await expect(page.getByTestId("evento-s1")).toBeVisible(); // dados carregados: o layout parou de se mover
  await expect(page.getByTestId("tl-agora-rotulo")).toBeVisible();
  await rolagem.evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(300);
  const coluna = page.getByTestId(`tl-coluna-${HOJE}`);
  const box = (await coluna.boundingBox())!;
  return { coluna, box, yDe: (hora: number, min = 0) => box.y + (hora - HORA_INI + min / 60) * HORA_PX };
}

async function arrastar(page: Page, de: { x: number; y: number }, ate: { x: number; y: number }) {
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.mouse.move(de.x, (de.y + ate.y) / 2, { steps: 4 });
  await page.mouse.move(ate.x, ate.y, { steps: 4 });
  await page.mouse.up();
}

async function preencherCliente(page: Page, nome: string) {
  await page.getByTestId("avulsa-cliente").getByRole("combobox").or(page.getByTestId("avulsa-cliente").locator("button").first()).first().click();
  await page.getByText(nome, { exact: false }).first().click();
}

async function preencherEConfirmar(page: Page, agendaId = "19") {
  await preencherCliente(page, "Cliente Sintético Alfa");
  await page.getByTestId("avulsa-agenda").selectOption(agendaId);
}

test.describe("desktop", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1600 }); });

  test("arrastar em horário vazio abre a marcação com início e duração; campos separados; grava sem protocolo e sem convite", async ({ page }) => {
    const m = await base(page);
    await page.goto(URL_DIA);
    const { box, yDe } = await colunaDoDia(page);
    const x = box.x + box.width / 2;
    await page.mouse.move(x, yDe(9, 2));
    await page.mouse.down();
    await page.mouse.move(x, yDe(9, 20), { steps: 4 });
    await page.mouse.move(x, yDe(9, 41), { steps: 4 });
    // enquanto arrasta, o trecho aparece desenhado e rotulado
    await expect(page.getByTestId("tl-selecao")).toContainText("09:00 às 09:45");
    await page.mouse.up();

    const dialogo = page.getByTestId("consulta-avulsa-dialogo");
    await expect(dialogo).toBeVisible();
    await expect(page.getByTestId("avulsa-data")).toHaveValue(HOJE);
    await expect(page.getByTestId("avulsa-duracao")).toHaveValue("45");
    // sem agenda escolhida, nada de cadastro inventado
    await expect(page.getByTestId("avulsa-profissional")).toHaveText("—");
    // só agendas de atendimento da empresa: a sala não aparece
    await expect(page.getByTestId("avulsa-agenda").locator("option")).toHaveText(["Selecionar agenda…", "AGENDA SEDE (Médico)", "AGENDA ONLINE (Enfermagem)"]);
    await preencherCliente(page, "Cliente Sintético Alfa");
    await page.getByTestId("avulsa-agenda").selectOption("19");
    // profissional, modalidade e local em campos separados; horário cai no período de 20 em 20
    await expect(page.getByTestId("avulsa-profissional")).toHaveText("Dra. Teste");
    await expect(page.getByTestId("avulsa-modalidade")).toHaveText("Presencial na sede");
    await expect(page.getByTestId("avulsa-local")).toHaveText("Sede Centro");
    await expect(page.getByTestId("avulsa-horario")).toHaveValue("09:00");
    await expect(page.getByTestId("avulsa-resumo")).toContainText("09:00 às 09:45");
    await expect(dialogo).not.toContainText(/protocolo:|Selecionar protocolo/i);
    await page.screenshot({ path: "test-results/avulsa-desktop-dialogo.png" });

    await page.getByTestId("avulsa-confirmar").click();
    await expect(dialogo).toHaveCount(0);
    expect(m.reservas()).toHaveLength(1);
    const corpo = m.reservas()[0]!.corpo as Record<string, unknown>;
    expect(corpo).toEqual({ resourceId: 19, clientId: 501, date: HOJE, time: "09:00", durationMinutes: 45, syncGoogle: true });
    expect(corpo).not.toHaveProperty("protocolId");
    expect(m.outrasEscritas()).toEqual([]); // nenhuma outra escrita: nada de e-mail, convite ou Google direto
    await expect(page.getByText("Consulta avulsa marcada", { exact: true })).toBeVisible();
  });

  test("arrastar de baixo para cima dá o mesmo trecho", async ({ page }) => {
    await base(page);
    await page.goto(URL_DIA);
    const { box, yDe } = await colunaDoDia(page);
    const x = box.x + box.width / 2;
    await arrastar(page, { x, y: yDe(11, 44) }, { x, y: yDe(11, 2) });
    await expect(page.getByTestId("avulsa-duracao")).toHaveValue("45");
    await page.getByTestId("avulsa-agenda").selectOption("19");
    await expect(page.getByTestId("avulsa-horario")).toHaveValue("11:00");
  });

  test("clique simples abre a marcação com a duração de um período da agenda escolhida", async ({ page }) => {
    await base(page);
    await page.goto(URL_DIA);
    const { box, yDe } = await colunaDoDia(page);
    await page.mouse.click(box.x + box.width / 2, yDe(12, 27));
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeVisible();
    await page.getByTestId("avulsa-agenda").selectOption("19");
    await expect(page.getByTestId("avulsa-duracao")).toHaveValue("20");
    await expect(page.getByTestId("avulsa-horario")).toHaveValue("12:20");
    await expect(page.getByTestId("avulsa-ajuste")).toContainText("ajustado para 12:20");
    await page.getByTestId("avulsa-agenda").selectOption("21");
    await expect(page.getByTestId("avulsa-duracao")).toHaveValue("30");
    await expect(page.getByTestId("avulsa-modalidade")).toHaveText("Online");
    await expect(page.getByTestId("avulsa-local")).toContainText("online");
    await expect(page.getByTestId("avulsa-profissional")).toHaveText("Enf. Teste");
  });

  test("Escape durante o arraste cancela sem abrir nada", async ({ page }) => {
    await base(page);
    await page.goto(URL_DIA);
    const { box, yDe } = await colunaDoDia(page);
    const x = box.x + box.width / 2;
    await page.mouse.move(x, yDe(9));
    await page.mouse.down();
    await page.mouse.move(x, yDe(10), { steps: 5 });
    await expect(page.getByTestId("tl-selecao")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tl-selecao")).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
  });

  test("botão Novo agendamento (teclado): horário e duração editáveis, duração inválida trava o confirmar", async ({ page }) => {
    const m = await base(page);
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeVisible();
    await expect(page.getByTestId("avulsa-data")).toHaveValue(HOJE);
    await expect(page.getByTestId("avulsa-confirmar")).toBeDisabled();
    await expect(page.getByTestId("avulsa-faltando")).toContainText("cliente");
    await preencherCliente(page, "Cliente Sintético Beta");
    await page.getByTestId("avulsa-agenda").selectOption("19");
    // sem pedido da grade: primeiro período aberto
    await expect(page.getByTestId("avulsa-horario")).toHaveValue("07:00");
    await page.getByTestId("avulsa-horario").selectOption("15:40");
    await page.getByTestId("avulsa-duracao-60").click();
    await expect(page.getByTestId("avulsa-resumo")).toContainText("15:40 às 16:40");
    await page.getByTestId("avulsa-duracao").fill("4");
    await expect(page.getByTestId("avulsa-confirmar")).toBeDisabled();
    await expect(page.getByTestId("avulsa-faltando")).toContainText("duração");
    await page.getByTestId("avulsa-duracao").fill("500");
    await expect(page.getByTestId("avulsa-duracao")).toHaveValue("500");
    await expect(page.getByTestId("avulsa-confirmar")).toBeDisabled();
    await page.getByTestId("avulsa-duracao").fill("75");
    await expect(page.getByTestId("avulsa-confirmar")).toBeEnabled();
    await page.getByTestId("avulsa-confirmar").click();
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
    expect(m.reservas()[0]!.corpo).toEqual({ resourceId: 19, clientId: 502, date: HOJE, time: "15:40", durationMinutes: 75, syncGoogle: true });
  });

  test("período ocupado no motor: horário desabilitado e aviso de provável conflito; o servidor continua sendo quem decide", async ({ page }) => {
    await base(page);
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await page.getByTestId("avulsa-agenda").selectOption("19");
    await expect(page.getByTestId("avulsa-horario").locator("option[value='09:20']")).toBeDisabled();
    await page.getByTestId("avulsa-horario").selectOption("09:00");
    await page.getByTestId("avulsa-duracao").fill("40"); // 09:00 e 09:20: o segundo está ocupado
    await expect(page.getByTestId("avulsa-provavel-conflito")).toContainText("09:20");
    await expect(page.getByTestId("avulsa-provavel-conflito")).toContainText("ocupado");
  });

  test("empresa errada: servidor responde 404, nada é gravado e a tela explica", async ({ page }) => {
    const m = await base(page, { reservar: (r) => r.fulfill(json({ error: "Agenda não encontrada" }, 404)) });
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await preencherEConfirmar(page);
    await page.getByTestId("avulsa-confirmar").click();
    const alerta = page.getByTestId("avulsa-recusada");
    await expect(alerta).toContainText("Agenda não encontrada");
    await expect(alerta).toContainText("empresa do seu acesso");
    await expect(alerta).toContainText("Nada foi gravado");
    await expect(page.getByTestId("avulsa-confirmar")).toBeEnabled();
    expect(m.reservas()).toHaveLength(1);
  });

  test("conflito: mensagem clara do servidor, diálogo continua aberto para escolher outro horário", async ({ page }) => {
    await base(page, { reservar: (r) => r.fulfill(json({ error: "Horário já ocupado" }, 409)) });
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await preencherEConfirmar(page);
    await page.getByTestId("avulsa-confirmar").click();
    const alerta = page.getByTestId("avulsa-recusada");
    await expect(alerta).toContainText("Horário já ocupado");
    await expect(alerta).toContainText("outro horário");
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeVisible();
    await page.screenshot({ path: "test-results/avulsa-desktop-conflito.png" });
  });

  test("conflito do cliente com outra marcação: mensagem do servidor aparece sem ser reescrita", async ({ page }) => {
    await base(page, { reservar: (r) => r.fulfill(json({ error: "O cliente já tem outra marcação que se sobrepõe a este horário" }, 409)) });
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await preencherEConfirmar(page);
    await page.getByTestId("avulsa-confirmar").click();
    await expect(page.getByTestId("avulsa-recusada")).toContainText("O cliente já tem outra marcação que se sobrepõe a este horário");
  });

  test("falha do Google: consulta fica salva, aviso explícito e a agenda recarrega", async ({ page }) => {
    const aviso = "Marcação salva, mas o Google Agenda não recebeu o evento. Use Sincronizar no cartão da consulta.";
    const m = await base(page, {
      reservar: (r, c) => r.fulfill(json({ session: { id: 78, protocolId: null, clientId: c.clientId, scheduledDate: c.date, scheduledTime: c.time, status: "scheduled" }, googleEventId: null, googleSyncWarning: aviso }, 201)),
    });
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await preencherEConfirmar(page);
    const antes = m.sessoesChamadas();
    await page.getByTestId("avulsa-confirmar").click();
    const alerta = page.getByTestId("avulsa-google-aviso");
    await expect(alerta).toContainText("Consulta salva no sistema");
    await expect(alerta).toContainText(aviso);
    // não dá para confirmar de novo (duplicaria), só entender e fechar
    await expect(page.getByTestId("avulsa-confirmar")).toHaveCount(0);
    await expect.poll(() => m.sessoesChamadas()).toBeGreaterThan(antes);
    await page.screenshot({ path: "test-results/avulsa-desktop-google-aviso.png" });
    await page.getByTestId("avulsa-cancelar").click();
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
    expect(m.reservas()).toHaveLength(1);
  });

  test("Google sem confirmar o evento e sem aviso do servidor também vira aviso explícito", async ({ page }) => {
    await base(page, { reservar: (r, c) => r.fulfill(json({ session: { id: 79, protocolId: null, clientId: c.clientId, scheduledDate: c.date, scheduledTime: c.time, status: "scheduled" }, googleEventId: null }, 201)) });
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await preencherEConfirmar(page);
    await page.getByTestId("avulsa-confirmar").click();
    await expect(page.getByTestId("avulsa-google-aviso")).toContainText("não confirmou a criação do evento");
  });

  test("resultado incerto: sem resposta do servidor não repete sozinho; conferir na agenda decide", async ({ page }) => {
    let tentativas = 0;
    let gravada = false;
    const m = await base(page, { reservar: (r) => { tentativas++; return r.abort("failed"); } });
    // a conferência lê a agenda do dia: primeiro sem a consulta, depois com ela (a resposta se perdeu mas a gravação ocorreu)
    await page.route("**/api/sessions*", (r) => r.fulfill(json(gravada
      ? [sessaoExistente, { ...sessaoExistente, id: 80, protocolId: null, clientId: 501, scheduledTime: "07:00", durationMinutes: 20, resourceId: 19 }]
      : [sessaoExistente])));
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await preencherEConfirmar(page);
    await page.getByTestId("avulsa-confirmar").click();
    await expect(page.getByTestId("avulsa-incerto")).toContainText("Resultado incerto");
    await expect(page.getByTestId("avulsa-confirmar")).toBeDisabled(); // nada de repetir às cegas
    expect(tentativas).toBe(1);
    // 1) conferir: não consta, nada foi gravado, pode tentar de novo
    await page.getByTestId("avulsa-conferir").click();
    await expect(page.getByTestId("avulsa-recusada")).toContainText("não consta na agenda");
    await expect(page.getByTestId("avulsa-confirmar")).toBeEnabled();
    // 2) tenta de novo, perde a resposta de novo, e agora a consulta consta: vira "salva", sem nova gravação
    await page.getByTestId("avulsa-confirmar").click();
    await expect(page.getByTestId("avulsa-incerto")).toBeVisible();
    gravada = true;
    await page.getByTestId("avulsa-conferir").click();
    await expect(page.getByTestId("avulsa-google-aviso")).toContainText("consta na agenda");
    expect(tentativas).toBe(2);
    expect(m.outrasEscritas()).toEqual([]);
  });

  test("erro 500 do servidor também é resultado incerto, não recusa", async ({ page }) => {
    await base(page, { reservar: (r) => r.fulfill(json({ error: "falha interna" }, 500)) });
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await preencherEConfirmar(page);
    await page.getByTestId("avulsa-confirmar").click();
    await expect(page.getByTestId("avulsa-incerto")).toBeVisible();
  });

  test("clique duplo em Confirmar envia uma única marcação", async ({ page }) => {
    const m = await base(page, {
      reservar: async (r, c) => {
        await new Promise((ok) => setTimeout(ok, 700));
        await r.fulfill(json({ session: { id: 81, protocolId: null, clientId: c.clientId, scheduledDate: c.date, scheduledTime: c.time, status: "scheduled" }, googleEventId: "evt" }, 201));
      },
    });
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").click();
    await preencherEConfirmar(page);
    await page.getByTestId("avulsa-confirmar").dblclick();
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
    expect(m.reservas()).toHaveLength(1);
  });

  test("regressão: clicar numa sessão existente abre os detalhes e não a marcação; sem protocolo exigido em lugar nenhum", async ({ page }) => {
    const m = await base(page);
    await page.goto(URL_DIA);
    await page.getByTestId("evento-s1").click();
    await expect(page.getByTestId("tl-detalhe-sessao")).toBeVisible();
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
    await page.keyboard.press("Escape");
    // arrastar começando em cima de uma sessão não cria seleção
    const ev = (await page.getByTestId("evento-s1").boundingBox())!;
    await arrastar(page, { x: ev.x + ev.width / 2, y: ev.y + 10 }, { x: ev.x + ev.width / 2, y: ev.y + ev.height - 4 });
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
    expect(m.reservas()).toHaveLength(0);
  });

  test("semana: arrastar na coluna de outro dia usa a data daquela coluna", async ({ page }) => {
    await base(page);
    await page.goto(`/agenda?modo=semana&data=${HOJE}&visao=linha`);
    const rolagem = page.getByTestId("tl-rolagem");
    await rolagem.evaluate((el) => { el.scrollTop = 0; });
    const alvo = page.getByTestId("tl-coluna-2026-11-13");
    const box = (await alvo.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + (9 - HORA_INI) * 64;
    await arrastar(page, { x, y: y + 2 }, { x, y: y + 64 });
    await expect(page.getByTestId("avulsa-data")).toHaveValue("2026-11-13");
    await expect(page.getByTestId("avulsa-duracao")).toHaveValue("60");
  });
});

const sessoesCdp = new WeakMap<Page, Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>>>();

test.describe("celular", () => {
  test.use({ viewport: { width: 393, height: 851 }, hasTouch: true, isMobile: true });

  async function toque(page: Page, passos: Array<{ tipo: "touchStart" | "touchMove" | "touchEnd"; x?: number; y?: number; espera?: number }>) {
    const cdp = sessoesCdp.get(page) ?? await page.context().newCDPSession(page);
    sessoesCdp.set(page, cdp);
    for (const p of passos) {
      if (p.espera) await page.waitForTimeout(p.espera);
      await cdp.send("Input.dispatchTouchEvent", { type: p.tipo, touchPoints: p.tipo === "touchEnd" ? [] : [{ x: p.x!, y: p.y! }] });
    }
  }

  test("toque e segure e arraste seleciona o intervalo; botão e diálogo cabem na tela", async ({ page }) => {
    const m = await base(page);
    await page.goto(URL_DIA);
    await expect(page.getByTestId("novo-agendamento")).toBeVisible();
    const rolagem = page.getByTestId("tl-rolagem");
    await rolagem.evaluate((el) => { el.scrollTop = 0; });
    await page.getByTestId(`tl-coluna-${HOJE}`).scrollIntoViewIfNeeded();
    const box = (await page.getByTestId(`tl-coluna-${HOJE}`).boundingBox())!;
    const x = box.x + box.width / 2;
    const y0 = box.y + (9 - HORA_INI) * HORA_PX + 3; // 09:02
    const y1 = box.y + (9 - HORA_INI) * HORA_PX + (41 / 60) * HORA_PX; // 09:41
    const rolagemBox = (await rolagem.boundingBox())!;
    test.skip(y1 > rolagemBox.y + rolagemBox.height - 10, "trecho fora da área visível neste tamanho de tela");
    await toque(page, [
      { tipo: "touchStart", x, y: y0 },
      { tipo: "touchMove", x, y: y0 + 1, espera: 650 },
      { tipo: "touchMove", x, y: (y0 + y1) / 2, espera: 60 },
      { tipo: "touchMove", x, y: y1, espera: 60 },
    ]);
    await expect(page.getByTestId("tl-selecao")).toContainText("09:00 às 09:45");
    await toque(page, [{ tipo: "touchEnd" }]);
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeVisible();
    await expect(page.getByTestId("avulsa-duracao")).toHaveValue("45");
    // o diálogo cabe na largura do celular
    const d = (await page.getByTestId("consulta-avulsa-dialogo").boundingBox())!;
    expect(d.x).toBeGreaterThanOrEqual(0);
    expect(d.x + d.width).toBeLessThanOrEqual(393 + 1);
    await preencherCliente(page, "Cliente Sintético Alfa");
    await page.getByTestId("avulsa-agenda").selectOption("19");
    await page.screenshot({ path: "test-results/avulsa-celular-dialogo.png" });
    await page.getByTestId("avulsa-confirmar").scrollIntoViewIfNeeded();
    await page.getByTestId("avulsa-confirmar").tap();
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
    expect((m.reservas()[0]!.corpo as Record<string, unknown>).durationMinutes).toBe(45);
  });

  test("rolar a tela com o dedo NÃO abre marcação; toque curto também não", async ({ page }) => {
    const m = await base(page);
    await page.goto(URL_DIA);
    const rolagem = page.getByTestId("tl-rolagem");
    await rolagem.evaluate((el) => { el.scrollTop = 0; });
    await page.getByTestId(`tl-coluna-${HOJE}`).scrollIntoViewIfNeeded();
    const box = (await page.getByTestId(`tl-coluna-${HOJE}`).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 200;
    // dedo anda logo: é rolagem
    await toque(page, [
      { tipo: "touchStart", x, y },
      { tipo: "touchMove", x, y: y - 40, espera: 30 },
      { tipo: "touchMove", x, y: y - 90, espera: 30 },
      { tipo: "touchEnd", espera: 700 },
    ]);
    await expect(page.getByTestId("tl-selecao")).toHaveCount(0);
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
    // toque curto
    await toque(page, [{ tipo: "touchStart", x, y }, { tipo: "touchEnd", espera: 80 }]);
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toHaveCount(0);
    expect(m.reservas()).toHaveLength(0);
  });

  test("toque e segure sem mover abre a marcação com a duração da agenda", async ({ page }) => {
    await base(page);
    await page.goto(URL_DIA);
    await page.getByTestId("tl-rolagem").evaluate((el) => { el.scrollTop = 0; });
    await page.getByTestId(`tl-coluna-${HOJE}`).scrollIntoViewIfNeeded();
    const box = (await page.getByTestId(`tl-coluna-${HOJE}`).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + (8 - HORA_INI) * HORA_PX + 20; // 08:15
    await toque(page, [{ tipo: "touchStart", x, y }, { tipo: "touchEnd", espera: 650 }]);
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeVisible();
    await page.getByTestId("avulsa-agenda").selectOption("19");
    await expect(page.getByTestId("avulsa-horario")).toHaveValue("08:00");
    await expect(page.getByTestId("avulsa-duracao")).toHaveValue("20");
  });

  test("alternativa sem arraste: botão Novo agendamento funciona por toque", async ({ page }) => {
    await base(page);
    await page.goto(URL_DIA);
    await page.getByTestId("novo-agendamento").tap();
    await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeVisible();
    await expect(page.getByTestId("avulsa-duracao")).toBeVisible();
    await page.screenshot({ path: "test-results/avulsa-celular-botao.png" });
  });
});
