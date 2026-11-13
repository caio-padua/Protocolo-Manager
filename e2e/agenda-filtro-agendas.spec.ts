/**
 * Filtro único de agendas da Agenda Diária: grupos por categoria, "só esta", limpar, recolher,
 * mesma escolha em Dia/Semana, Mês e Lista, valendo para sessões do sistema E compromissos do Google.
 * Rotas simuladas e relógio fixo (12/11/2026, 10:20 em Brasília): nenhum dado real, nada criado no Google.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const HOJE = "2026-11-12";

const agenda = (id: number, name: string, modality: string, categoryName: string, color: string) => ({
  id, name, kind: "x", modality, color, slotMinutes: 30, active: true, sortOrder: id, categoryName, canManage: true, locationId: null, professionalId: null,
});
const RECURSOS = [
  agenda(22, "MEDICO - SEDE", "local", "Medicina", "#1d4f8f"),
  agenda(24, "MEDICO - ON LINE", "online", "Medicina", "#039be5"),
  agenda(29, "MEDICO - HOME CARE", "home_care", "Medicina", "#7cb342"),
  agenda(23, "ENFERMAGEM - SEDE", "local", "Enfermagem", "#e67c73"),
  agenda(27, "ENFERMAGEM - HOME CARE", "home_care", "Enfermagem", "#f6bf26"),
];
const sessao = (id: number, resourceId: number, nome: string, cor: string, hora: string) => ({
  id, protocolId: 1, clientId: id, clientName: `Paciente ${id}`, clientCpf: "", scheduledDate: HOJE, scheduledTime: hora, status: "scheduled",
  serviceType: "clinic", unit: "Sede", weekNumber: 2, substanceApplications: [], createdAt: "2026-01-01T00:00:00Z", durationMinutes: 30,
  resourceId, agendaNome: nome, agendaCor: cor,
});
const SESSOES = [
  sessao(1, 22, "MEDICO - SEDE", "#1d4f8f", "09:00"),
  sessao(2, 23, "ENFERMAGEM - SEDE", "#e67c73", "10:00"),
  sessao(3, 24, "MEDICO - ON LINE", "#039be5", "11:00"),
];
const ev = (id: string, titulo: string, agendaId: number, agendaRecursoId: number | null, nome: string, cor: string, h: string) => ({
  id, titulo, inicio: `${HOJE}T${h}:00-03:00`, fim: `${HOJE}T${String(Number(h.slice(0, 2)) + 1).padStart(2, "0")}:00:00-03:00`, data: HOJE, horario: `${h} - ${h}`, diaInteiro: false,
  agenda: nome, agendaId, agendaRecursoId, cor, recorrente: false,
});
const GOOGLE = {
  desde: "2026-01-01T00:00:00Z",
  agendas: [
    { id: 35, nome: "SEDE", cor: "#1d4f8f", agendaRecursoId: 22 },
    { id: -27, nome: "HOME CARE ENF", cor: "#f6bf26", agendaRecursoId: 27 },
    { id: 30, nome: "AGENDA GERAL", cor: "#9aa0a6", agendaRecursoId: null },
  ],
  eventos: [
    ev("g:1", "Google da sede", 35, 22, "SEDE", "#1d4f8f", "13:00"),
    ev("g:2", "Google home care", -27, 27, "HOME CARE ENF", "#f6bf26", "14:00"),
    ev("g:3", "Google geral", 30, null, "AGENDA GERAL", "#9aa0a6", "15:00"),
  ],
};

async function base(page: Page) {
  await page.clock.setFixedTime(new Date("2026-11-12T13:20:00Z"));
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Recepção Teste", role: "recepcao" }));
  });
  await page.route("**/api/**", (r) => r.fulfill(json([])));
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Recepção Teste", role: "recepcao" } })));
  await page.route("**/api/sessions*", (r) => r.fulfill(json(SESSOES)));
  await page.route("**/api/agenda/resources*", (r) => r.fulfill(json(RECURSOS)));
  await page.route("**/api/agenda/google-compromissos?*", (r) => r.fulfill(json(GOOGLE)));
  await page.route("**/api/agenda/ocupacao*", (r) => r.fulfill(json([
    { resourceId: 22, capacidade: 6, ocupadas: 4 }, { resourceId: 24, capacidade: 6, ocupadas: 6 }, { resourceId: 23, capacidade: 8, ocupadas: 0 },
    { resourceId: 29, capacidade: 0, ocupadas: 0 },
  ])));
}

test("grupos por categoria cobrem TODAS as agendas, inclusive as sem atendimento no período", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agenda");
  const filtro = page.getByTestId("filtro-agendas");
  await filtro.getByTestId("filtro-agendas-recolher").click(); // + : abre o painel por grupo
  await expect(filtro.getByTestId("grupo-Medicina")).toBeVisible();
  await expect(filtro.getByTestId("grupo-Enfermagem")).toBeVisible();
  await expect(filtro.getByTestId("grupo-Só no Google (somente leitura)")).toBeVisible();
  for (const chave of ["r22", "r24", "r29", "r23", "r27", "g30"]) await expect(filtro.getByTestId(`filtro-agenda-${chave}`)).toBeVisible();
  await expect(filtro.getByTestId("filtro-agenda-r29")).toContainText("Home Care");
  await expect(filtro.getByTestId("filtro-agenda-r24")).toContainText("Online");
  await expect(filtro.getByTestId("filtro-agendas-resumo")).toHaveText("6 de 6");
  await page.screenshot({ path: "generated-artifacts/filtro-agendas-desktop.png", fullPage: true });
});

test("só esta, clicar de novo restaura, valendo para sessão e Google; banner de ocultas", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agenda");
  const linha = page.getByTestId("linha-do-tempo");
  const filtro = page.getByTestId("filtro-agendas");
  await filtro.getByTestId("filtro-agendas-recolher").click(); // + : abre o painel por grupo
  await expect(linha.getByTestId("evento-s1")).toBeVisible();
  await expect(linha.getByTestId("evento-gg:1")).toBeVisible();
  await filtro.getByTestId("so-esta-r22").click();
  await expect(linha.getByTestId("evento-s1")).toBeVisible();
  await expect(linha.getByTestId("evento-gg:1")).toBeVisible(); // Google da MESMA agenda acompanha
  await expect(linha.getByTestId("evento-s2")).toHaveCount(0);
  await expect(linha.getByTestId("evento-gg:2")).toHaveCount(0);
  await expect(linha.getByTestId("evento-gg:3")).toHaveCount(0);
  await expect(filtro.getByTestId("filtro-agendas-ocultas")).toContainText("5");
  await filtro.getByTestId("so-esta-r22").click();
  await expect(filtro.getByTestId("filtro-agendas-resumo")).toHaveText("6 de 6");
  await expect(linha.getByTestId("evento-s2")).toBeVisible();
  await expect(linha.getByTestId("evento-gg:3")).toBeVisible();
});

test("grupo inteiro, limpar seleção, mostrar todas e recolher grupo; teclado", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agenda");
  const linha = page.getByTestId("linha-do-tempo");
  const filtro = page.getByTestId("filtro-agendas");
  await filtro.getByTestId("filtro-agendas-recolher").click(); // + : abre o painel por grupo
  await filtro.getByTestId("grupo-marcar-Medicina").click();
  await expect(linha.getByTestId("evento-s1")).toHaveCount(0);
  await expect(linha.getByTestId("evento-s3")).toHaveCount(0);
  await expect(linha.getByTestId("evento-s2")).toBeVisible();
  await filtro.getByTestId("grupo-marcar-Medicina").click();
  await expect(linha.getByTestId("evento-s1")).toBeVisible();
  await filtro.getByTestId("filtro-limpar").click();
  await expect(filtro.getByTestId("filtro-nenhuma")).toBeVisible();
  await expect(linha.getByTestId("evento-s1")).toHaveCount(0);
  await filtro.getByTestId("filtro-mostrar-todas").click();
  await expect(linha.getByTestId("evento-s1")).toBeVisible();
  // recolher não oculta nada
  await filtro.getByTestId("grupo-recolher-Medicina").click();
  await expect(filtro.getByTestId("filtro-agenda-r22")).toHaveCount(0);
  await expect(filtro.getByTestId("filtro-agendas-resumo")).toHaveText("6 de 6");
  await filtro.getByTestId("grupo-recolher-Medicina").click();
  // teclado: foco na caixa da agenda e Espaço alterna
  await filtro.getByTestId("filtro-agenda-r23").getByRole("checkbox").focus();
  await page.keyboard.press("Space");
  await expect(linha.getByTestId("evento-s2")).toHaveCount(0);
});

test("a mesma escolha vale no Mês e na Lista", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agenda");
  const filtro = page.getByTestId("filtro-agendas");
  await filtro.getByTestId("filtro-agendas-recolher").click(); // + : abre o painel por grupo
  await filtro.getByTestId("so-esta-r23").click();
  await page.getByRole("button", { name: "Mês", exact: true }).click();
  const celula = page.getByTestId("grade-mes-google").getByTestId(`dia-${HOJE}`);
  await expect(celula.locator('[data-origem="paxter"]')).toHaveCount(1);
  await expect(celula.locator('[data-origem="google"]')).toHaveCount(0);
  await expect(page.getByTestId("filtro-agendas-ocultas")).toBeVisible();
  await filtro.getByTestId("so-esta-r27").click();
  await expect(celula.locator('[data-origem="paxter"]')).toHaveCount(0);
  await expect(celula.locator('[data-origem="google"]')).toHaveCount(1);
});

test("celular: filtro cabe na tela, alvos de toque com 36px ou mais", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agenda");
  const filtro = page.getByTestId("filtro-agendas");
  await expect(filtro).toBeVisible();
  // a barra nasce minimizada (grade primeiro); o resumo mostra quantas agendas estão exibidas
  await expect(filtro.getByTestId("agendas-faixa")).toBeVisible();
  await expect(filtro.getByTestId("filtro-agendas-resumo")).toHaveText("6 de 6");
  await expect(filtro.getByTestId("filtro-agenda-r22")).toHaveCount(0);
  await page.screenshot({ path: "generated-artifacts/filtro-agendas-mobile-recolhido.png" });
  await filtro.getByTestId("filtro-agendas-recolher").click();
  const caixa = (await filtro.boundingBox())!;
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(391);
  const alvo = (await filtro.getByTestId("so-esta-r22").boundingBox())!;
  expect(alvo.height).toBeGreaterThanOrEqual(36);
  const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(transborda).toBe(false);
  await page.screenshot({ path: "generated-artifacts/filtro-agendas-mobile.png" });
});

test("barra contínua: chips ligam e desligam, dois cliques = só esta, e o + abre o painel (Esc fecha)", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agenda");
  const filtro = page.getByTestId("filtro-agendas");
  const linha = page.getByTestId("linha-do-tempo");
  await expect(filtro.getByTestId("agendas-faixa")).toBeVisible();
  await expect(filtro.getByTestId("filtro-agendas-gaveta")).toHaveCount(0);
  const faixa = (await filtro.getByTestId("agendas-faixa").boundingBox())!;
  expect(faixa.height).toBeLessThan(90); // uma faixa só (botão de 2 linhas + vidro no rodapé)
  // botão de duas linhas (equipe + agenda), porcentagem + OCUP no canto direito e vidro no rodapé
  await expect(filtro.getByTestId("chip-agenda-r22")).toContainText("Agenda médico");
  await expect(filtro.getByTestId("chip-agenda-r22")).toContainText("MEDICO - SEDE");
  await expect(filtro.getByTestId("chip-agenda-r23")).toContainText("Agenda enfermagem");
  await expect(filtro.getByTestId("ocupacao-r22")).toContainText("67%");
  await expect(filtro.getByTestId("ocupacao-r22")).toContainText("Ocup", { ignoreCase: true });
  await expect(filtro.getByTestId("chip-agenda-r22").locator(".ag-vidro")).toBeVisible();
  await expect(filtro.getByTestId("ocupacao-r24")).toHaveAttribute("data-cheia", "sim");
  await expect(filtro.getByTestId("ocupacao-r29")).toHaveAttribute("data-estado", "sem-vagas");
  await expect(filtro.getByTestId("ocupacao-g30")).toHaveAttribute("data-estado", "somente-leitura");
  await page.screenshot({ path: "generated-artifacts/agenda-chips-ocupacao.png", clip: { x: 182, y: 0, width: 1258, height: 200 } });
  await filtro.getByTestId("chip-agenda-r23").click();
  await expect(linha.getByTestId("evento-s2")).toHaveCount(0);
  await expect(filtro.getByTestId("chip-agenda-r23")).toHaveAttribute("aria-checked", "false");
  await filtro.getByTestId("chip-agenda-r23").click();
  await expect(linha.getByTestId("evento-s2")).toBeVisible();
  await filtro.getByTestId("chip-agenda-r22").dblclick();
  await expect(filtro.getByTestId("filtro-agendas-resumo")).toHaveText("1 de 6");
  await expect(linha.getByTestId("evento-s2")).toHaveCount(0);
  await filtro.getByTestId("chip-agenda-r22").dblclick();
  await expect(filtro.getByTestId("filtro-agendas-resumo")).toHaveText("6 de 6");
  const mais = filtro.getByTestId("filtro-agendas-recolher");
  await expect(mais).toHaveAttribute("aria-expanded", "false");
  await mais.click();
  await expect(filtro.getByTestId("filtro-agendas-gaveta")).toBeVisible();
  await page.screenshot({ path: "generated-artifacts/agenda-barra-maximizada.png" });
  await page.keyboard.press("Escape");
  await expect(filtro.getByTestId("filtro-agendas-gaveta")).toHaveCount(0);
});

test("barra de comandos fica congelada ao rolar e passar o mouse num atendimento abre o resumo e fecha ao sair", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/agenda");
  const barra = page.getByTestId("agenda-barra-congelada");
  await expect(barra).toBeVisible();
  await page.screenshot({ path: "generated-artifacts/agenda-barra-desktop.png", clip: { x: 182, y: 0, width: 1258, height: 260 } });
  await page.getByTestId("evento-s1").hover();
  const cartao = page.getByTestId("cartao-rapido");
  await expect(cartao).toBeVisible();
  await expect(cartao).toContainText("Paciente 1");
  await expect(page.getByTestId("cartao-rapido-aplicacoes")).toContainText("Sem aplicação");
  await page.screenshot({ path: "generated-artifacts/agenda-cartao-rapido.png" });
  await page.mouse.move(5, 400);
  await expect(cartao).toHaveCount(0);
  // rolar a página não tira a barra do topo
  await page.evaluate(() => { document.querySelectorAll("div").forEach((d) => { if (getComputedStyle(d).overflowY === "auto") d.scrollTop = 400; }); });
  const topo = (await barra.boundingBox())!;
  expect(topo.y).toBeLessThanOrEqual(2);
});
