/**
 * Linha do tempo da Agenda (Dia e Semana), no estilo do Google Agenda.
 * Rotas simuladas e relógio fixo (quinta-feira 12/11/2026, 10:20 em Brasília): nenhum dado real,
 * nenhum evento criado ou movido no Google, nenhuma mensagem enviada.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const AGORA_UTC = new Date("2026-11-12T13:20:00Z"); // 10:20 em Brasília
const HOJE = "2026-11-12";

const app = (id: number, nome: string, displayState: string, extra: object = {}) => ({
  id, substanceId: id, substanceName: nome, substanceColor: "#336699", dose: "dose sintética", procedureType: "iv",
  sessionNumber: 1, totalSessions: 4, status: "pending", availability: displayState === "prox" ? "prox" : "disp", displayState, appliedAt: null, ...extra,
});
const sessao = (id: number, p: object) => ({
  id, protocolId: 1, clientId: id, clientName: `Paciente ${id}`, clientCpf: "", scheduledDate: HOJE, scheduledTime: "10:30", status: "scheduled",
  serviceType: "clinic", unit: "Sede", weekNumber: 2, substanceApplications: [], createdAt: "2026-01-01T00:00:00Z", professionalName: "Dra. Teste", ...p,
});

const SESSOES = [
  sessao(1, { clientName: "Paciente Alfa", scheduledTime: "10:30", durationMinutes: 30, resourceId: 19, agendaNome: "AGENDA SEDE", agendaCor: "#1d4f8f",
    substanceApplications: [
      app(11, "Substância aplicada", "applied"), app(12, "Substância a aplicar", "disp"), app(13, "Substância próxima", "prox"),
      app(14, "Substância não realizada", "notPerformed"), app(15, "Substância indisponível", "unavailable"), app(16, "Substância a conferir", "review"),
    ] }),
  sessao(2, { clientName: "Paciente Beta", scheduledTime: "10:45", durationMinutes: 45, resourceId: 20, agendaNome: "AGENDA HOME CARE", agendaCor: "#7cb342", serviceType: "homecare", unit: null }),
  sessao(3, { clientName: "Paciente Gama", scheduledTime: "08:00", durationMinutes: 30, resourceId: 19, agendaNome: "AGENDA SEDE", agendaCor: "#1d4f8f", status: "completed" }),
  sessao(4, { clientName: "Paciente Delta", scheduledDate: "2026-11-13", scheduledTime: "14:00", durationMinutes: 60, resourceId: 19, agendaNome: "AGENDA SEDE", agendaCor: "#1d4f8f" }),
];

const GOOGLE = {
  desde: "2026-01-01T00:00:00Z",
  agendas: [{ id: 1, nome: "AGENDA GERAL", cor: "#9aa0a6" }],
  eventos: [
    { id: "g:1", titulo: "Reunião sintética", inicio: `${HOJE}T12:00:00.000Z`, fim: `${HOJE}T13:00:00.000Z`, data: HOJE, horario: "09:00", diaInteiro: false, agenda: "AGENDA GERAL", agendaId: 1, cor: "#9aa0a6", recorrente: false },
    { id: "g:2", titulo: "Feriado sintético", inicio: `${HOJE}T03:00:00.000Z`, fim: "2026-11-13T03:00:00.000Z", data: HOJE, horario: "Dia inteiro", diaInteiro: true, agenda: "AGENDA GERAL", agendaId: 1, cor: "#9aa0a6", recorrente: false },
  ],
};

async function base(page: Page, opcoes: { googleFalha?: boolean } = {}) {
  await page.clock.setFixedTime(AGORA_UTC);
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Recepção Teste", role: "recepcao" }));
  });
  await page.route("**/api/**", (r) => r.fulfill(json([])));
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Recepção Teste", role: "recepcao" } })));
  await page.route("**/api/sessions*", (r) => r.fulfill(json(SESSOES)));
  await page.route("**/api/agenda/google-compromissos/*/descricao*", (r) => r.fulfill(json({ descricao: "Descrição sintética do compromisso" })));
  await page.route("**/api/agenda/google-compromissos?*", (r) => (opcoes.googleFalha ? r.fulfill(json({ error: "x" }, 503)) : r.fulfill(json(GOOGLE))));
}

test("semana: eixo de horas, linha de agora, cores por agenda e sobreposição lado a lado", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agenda");
  const linha = page.getByTestId("linha-do-tempo");
  await expect(linha).toHaveAttribute("data-modo", "semana");
  await expect(linha.getByTestId("evento-s1")).toBeVisible();
  // eixo: 7h a 20h, sem poluição
  const eixo = linha.getByText("7h", { exact: true });
  await expect(eixo).toBeVisible();
  await expect(linha.getByText("12h", { exact: true })).toBeVisible();
  // linha vermelha de agora: 10:20 em Brasília, eixo começando às 7h, 64px por hora na semana = 213,3px
  const agora = linha.getByTestId("tl-agora");
  await expect(agora).toHaveCount(1);
  const topAgora = await agora.evaluate((el) => parseFloat((el as HTMLElement).style.top));
  expect(Math.abs(topAgora - 213.33)).toBeLessThanOrEqual(1);
  await expect(linha.getByTestId("tl-agora-rotulo")).toHaveText("10:20");
  // cor por agenda
  const corA = await linha.getByTestId("evento-s1").evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ev"));
  const corB = await linha.getByTestId("evento-s2").evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ev"));
  expect(corA).toBe("#1d4f8f");
  expect(corB).toBe("#7cb342");
  // 10:30–11:00 e 10:45–11:30 se sobrepõem: lado a lado, sem cobrir um ao outro
  const a = (await linha.getByTestId("evento-s1").boundingBox())!;
  const b = (await linha.getByTestId("evento-s2").boundingBox())!;
  const esquerdo = a.x < b.x ? a : b;
  const direito = a.x < b.x ? b : a;
  expect(esquerdo.x + esquerdo.width).toBeLessThanOrEqual(direito.x + 1);
  // posição vertical: 10:30 = (630-420)/60*64 = 224px abaixo do topo do dia
  const colunaTop = (await linha.getByTestId(`tl-coluna-${HOJE}`).boundingBox())!.y;
  expect(Math.abs(a.y - colunaTop - 225)).toBeLessThanOrEqual(2);
  // Google: somente leitura (data-origem), dia inteiro no cabeçalho
  await expect(linha.getByTestId("evento-gg:1")).toHaveAttribute("data-origem", "google");
  await expect(linha.getByTestId(`tl-cabecalho-${HOJE}`).getByText("Feriado sintético")).toBeVisible();
  // próximo atendimento no topo
  await expect(linha.getByTestId("proximo-atendimento")).toContainText("Paciente Alfa");
  await expect(linha.getByTestId("proximo-atendimento")).toContainText("em 10 min");
  await page.screenshot({ path: "test-results/agenda-timeline-semana.png" });
});

test("aproximação: respiração suave só no atendimento que vai começar; concluído fica apagado; movimento reduzido respeitado", async ({ page }) => {
  await base(page);
  await page.goto("/agenda");
  const linha = page.getByTestId("linha-do-tempo");
  await expect(linha.getByTestId("evento-s1")).toHaveAttribute("data-proximidade", "proxima");
  await expect(linha.getByTestId("evento-s2")).toHaveAttribute("data-proximidade", "proxima");
  await expect(linha.getByTestId("evento-s3")).toHaveAttribute("data-proximidade", "encerrada");
  await expect(linha.getByTestId("evento-s4")).toHaveAttribute("data-proximidade", "futura");
  expect(await linha.getByTestId("evento-s1").evaluate((el) => getComputedStyle(el).animationName)).toBe("tl-respira");
  expect(await linha.getByTestId("evento-s4").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  // hover: brilho de neon na cor da agenda (sem animação competindo)
  await linha.getByTestId("evento-s1").hover();
  const sombra = await linha.getByTestId("evento-s1").evaluate((el) => getComputedStyle(el).boxShadow);
  expect(sombra).toContain("rgb(29, 79, 143)");
  // quem pede menos movimento não recebe animação
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await linha.getByTestId("evento-s1").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("clique abre detalhes com os quadradinhos de cada estado de aplicação", async ({ page }) => {
  await base(page);
  await page.goto("/agenda");
  await page.getByTestId("evento-s1").click();
  const dialogo = page.getByTestId("tl-detalhe-sessao");
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole("heading", { name: /Paciente Alfa/ })).toBeVisible();
  await expect(dialogo).toContainText("AGENDA SEDE");
  await expect(dialogo).toContainText("Aplicação EV");
  const estados = ["applied", "disp", "prox", "notPerformed", "unavailable", "review"];
  for (const [i, estado] of estados.entries()) await expect(dialogo.getByTestId(`tl-aplicacao-${11 + i}`)).toHaveAttribute("data-estado", estado);
  await expect(dialogo.getByTestId("tl-aplicacao-11")).toContainText("Aplicada");
  await expect(dialogo.getByTestId("tl-aplicacao-14")).toContainText("Não aplicada");
  await expect(dialogo.getByTestId("tl-aplicacao-16")).toContainText("Conferir");
  await page.screenshot({ path: "test-results/agenda-timeline-detalhe.png" });
  // cartão completo com as ações de sempre, sob demanda
  await dialogo.getByTestId("tl-cartao-completo").click();
  await expect(dialogo.getByLabel("Confirmar Substância a aplicar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogo).toHaveCount(0);
});

test("Google na linha do tempo: cadeado, somente leitura e descrição carregada só ao abrir", async ({ page }) => {
  await base(page);
  let descricoes = 0;
  await page.route("**/api/agenda/google-compromissos/*/descricao*", (r) => { descricoes++; return r.fulfill(json({ descricao: "Descrição sintética do compromisso" })); });
  let escritas = 0;
  await page.route("**/api/**", (r) => { if (r.request().method() !== "GET") escritas++; return r.fallback(); });
  await page.goto("/agenda");
  await expect(page.getByTestId("evento-gg:1")).toBeVisible();
  expect(descricoes).toBe(0);
  await page.getByTestId("evento-gg:1").click();
  const dialogo = page.getByTestId("tl-detalhe-google");
  await expect(dialogo).toContainText("somente leitura");
  await expect(dialogo).toContainText("Descrição sintética do compromisso");
  expect(descricoes).toBe(1);
  expect(escritas).toBe(0);
});

test("falha do Google é avisada e as sessões continuam na linha do tempo", async ({ page }) => {
  await base(page, { googleFalha: true });
  await page.goto("/agenda");
  await expect(page.getByTestId("linha-do-tempo").getByRole("alert")).toContainText("Google indisponível");
  await expect(page.getByTestId("evento-s1")).toBeVisible();
  await expect(page.getByTestId("evento-gg:1")).toHaveCount(0);
});

test("legenda liga e desliga agendas; dia abre pelo cabeçalho da semana; Lista mantém os cartões de antes", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agenda");
  const linha = page.getByTestId("linha-do-tempo");
  const filtro = page.getByTestId("filtro-agendas");
  await filtro.getByRole("checkbox", { name: /HOME CARE/ }).click();
  await expect(linha.getByTestId("evento-s2")).toHaveCount(0);
  await expect(linha.getByTestId("evento-s1")).toBeVisible();
  await filtro.getByRole("checkbox", { name: /HOME CARE/ }).click();
  await expect(linha.getByTestId("evento-s2")).toBeVisible();
  // dia pelo cabeçalho
  await linha.getByRole("button", { name: /Abrir o dia 13 de novembro/ }).click();
  await expect(page.getByTestId("linha-do-tempo")).toHaveAttribute("data-modo", "dia");
  await expect(page.getByTestId("evento-s4")).toBeVisible();
  await page.screenshot({ path: "test-results/agenda-timeline-dia.png" });
  // Lista: cartões e painel do Google voltam
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(page.getByTestId("linha-do-tempo")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Compromissos importados do Google" })).toBeVisible();
});

test("link do Pit Stop abre o dia e a visão pedidos; parâmetro inválido é ignorado", async ({ page }) => {
  await base(page);
  await page.goto("/agenda?data=2026-11-12&modo=dia");
  await expect(page.getByTestId("linha-do-tempo")).toHaveAttribute("data-modo", "dia");
  await expect(page.getByTestId(`tl-cabecalho-${HOJE}`)).toBeVisible();
  await page.goto("/agenda?data=2026-02-31&modo=ano");
  await expect(page.getByTestId("linha-do-tempo")).toHaveAttribute("data-modo", "semana");
  await page.goto("/agenda?data=2026-11-12&modo=mes");
  await expect(page.getByTestId("grade-mes-google")).toBeVisible();
});

test("aviso sonoro nasce desligado, liga por clique e lembra a escolha", async ({ page }) => {
  await base(page);
  await page.goto("/agenda");
  const som = page.getByTestId("aviso-sonoro");
  await expect(som).toHaveAttribute("aria-checked", "false");
  await som.click();
  await expect(som).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("paxter_agenda_aviso_sonoro"))).toBe("1");
  await page.reload();
  await expect(page.getByTestId("aviso-sonoro")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("aviso-sonoro").click();
  expect(await page.evaluate(() => localStorage.getItem("paxter_agenda_aviso_sonoro"))).toBeNull();
});
