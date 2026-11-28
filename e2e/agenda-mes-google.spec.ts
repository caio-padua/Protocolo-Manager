/**
 * Mês da Agenda no estilo Google Agenda: lista "Minhas agendas" e compromissos DENTRO dos dias.
 * Rotas simuladas: nenhum dado real, nenhum evento criado ou movido no Google.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const hoje = new Date();
const dia = (n: number) => `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;

async function base(page: Page, googleFalha = false) {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Recepção Teste", role: "recepcao" }));
  });
  await page.route("**/api/**", (r) => r.fulfill(json([])));
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Recepção Teste", role: "recepcao" } })));
  await page.route("**/api/sessions*", (r) => r.fulfill(json([
    { id: 1, protocolId: 1, clientId: 1, clientName: "Paciente Sintético", clientCpf: "", scheduledDate: dia(10), scheduledTime: "09:00", status: "scheduled",
      serviceType: "clinic", weekNumber: 1, substanceApplications: [], createdAt: "2026-01-01T00:00:00Z" },
  ])));
  await page.route("**/api/agenda/google-compromissos*", (r) => googleFalha
    ? r.fulfill(json({ error: "x" }, 503))
    : r.fulfill(json({
      desde: "2026-01-01T00:00:00Z",
      agendas: [{ id: 1, nome: "AGENDA GERAL", cor: "#c7c7c7" }, { id: 2, nome: "AGENDA ENFERMAGEM - HOME CARE", cor: "#7cb342" }],
      eventos: [
        { id: "a:1", titulo: "Reunião sintética", inicio: `${dia(10)}T10:00:00-03:00`, fim: `${dia(10)}T11:00:00-03:00`, data: dia(10), horario: "10:00 - 11:00", diaInteiro: false, agenda: "AGENDA GERAL", agendaId: 1, cor: "#c7c7c7", recorrente: false },
        { id: "b:1", titulo: "Visita sintética", inicio: `${dia(10)}T08:00:00-03:00`, fim: `${dia(10)}T09:00:00-03:00`, data: dia(10), horario: "08:00 - 09:00", diaInteiro: false, agenda: "AGENDA ENFERMAGEM - HOME CARE", agendaId: 2, cor: "#7cb342", recorrente: true },
      ],
    })));
}

test("mês estilo Google: agendas com cor à esquerda e eventos dentro do dia, Google com cadeado", async ({ page }) => {
  await base(page);
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Mês", exact: true }).click();
  const grade = page.getByTestId("grade-mes-google");
  const filtro = page.getByTestId("filtro-agendas");
  await expect(filtro.getByRole("checkbox", { name: /AGENDA ENFERMAGEM - HOME CARE/ })).toBeVisible();
  const celula = grade.getByTestId(`dia-${dia(10)}`);
  await expect(celula.locator('[data-origem="google"]')).toHaveCount(2);
  await expect(celula.locator('[data-origem="paxter"]')).toHaveCount(1);
  await expect(celula).toContainText("Visita sintética");
  await page.screenshot({ path: "test-results/agenda-mes-google.png", fullPage: true });
  // desmarcar uma agenda esconde só os eventos dela
  await filtro.getByRole("checkbox", { name: /AGENDA GERAL/ }).click();
  await expect(celula.locator('[data-origem="google"]')).toHaveCount(1);
  await filtro.getByRole("checkbox", { name: /Sem agenda ligada/ }).click();
  await expect(celula.locator('[data-origem="paxter"]')).toHaveCount(0);
});

test("mês estilo Google: falha do Google é avisada e as sessões continuam", async ({ page }) => {
  await base(page, true);
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Mês", exact: true }).click();
  const grade = page.getByTestId("grade-mes-google");
  await expect(grade.getByRole("alert")).toContainText("Google indisponível");
  await expect(grade.getByTestId(`dia-${dia(10)}`).locator('[data-origem="paxter"]')).toHaveCount(1);
});
