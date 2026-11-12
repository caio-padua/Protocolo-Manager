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
}

test("grupos por categoria cobrem TODAS as agendas, inclusive as sem atendimento no período", async ({ page }) => {
  await base(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agenda");
  const filtro = page.getByTestId("filtro-agendas");
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
  await expect(linha.getByTestId("evento-s1")).toBeVisible();
  await expect(linha.getByTestId("evento-gg:1")).toBeVisible();
  await filtro.getByTestId("so-esta-r22").click();
  await expect(linha.getByTestId("evento-s1")).toBeVisible();
  await expect(linha.getByTestId("evento-gg:1")).toBeVisible(); // Google da MESMA agenda acompanha
  await expect(linha.getByTestId("evento-s2")).toHaveCount(0);
  await expect(linha.getByTestId("evento-gg:2")).toHaveCount(0);
  await expect(linha.getByTestId("evento-gg:3")).toHaveCount(0);
  await expect(filtro.getByTestId("filtro-agendas-ocultas")).toContainText("5 agendas ocultas");
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
  // no celular o painel nasce recolhido (a grade vem primeiro); o resumo mostra quantas agendas estão exibidas
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
