/**
 * Encaixe rápido interno (Quick Book) na Agenda Diária. Rotas simuladas e relógio fixo (quinta 12/11/2026, 10:20 BRT):
 * nenhum dado real, nenhuma consulta gravada, nenhum evento no Google, nenhuma mensagem. O canal vem SÓ da política que o
 * servidor devolve; aqui o servidor é simulado para provar como a tela reage (autorizado, não autorizado, recusa, Google atrasado).
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const AGORA_UTC = new Date("2026-11-12T13:20:00Z");
const HOJE = "2026-11-12";
const URL_DIA = `/agenda?modo=dia&data=${HOJE}&visao=linha`;

const CLIENTES = [
  { id: 501, name: "Cliente Sintético Alfa", cpf: "00000000191", phone: "11900000001", photoUrl: null, status: "active", deletedAt: null },
];
const RECURSOS = [
  { id: 19, name: "AGENDA SEDE", kind: "medico", modality: "local", color: "#1d4f8f", slotMinutes: 20, active: true, sortOrder: 1,
    professionalId: 1, professionalName: "Dra. Teste", locationId: 8, locationName: "Sede Centro" },
];

type Opcoes = {
  autorizado: boolean;
  integracaoAtualizada?: boolean;
  slots?: unknown[];
  reservar?: (r: Route, corpo: Record<string, unknown>) => Promise<void> | void;
};

function slotsInternos(): unknown[] {
  const s = [];
  for (let m = 10 * 60 + 40; m < 12 * 60; m += 20) {
    const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    s.push(time === "11:00"
      ? { time, state: "bloqueado", reason: "profissional", message: "O profissional já tem outra marcação neste horário, em outra agenda." }
      : { time, state: "aberto", reason: null, message: null });
  }
  return s;
}

async function base(page: Page, o: Opcoes) {
  const chamadas = { padrao: 0, interno: 0, disponibilidade: [] as string[] };
  await page.clock.setFixedTime(AGORA_UTC);
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Recepção Teste", role: "recepcao" }));
  });
  await page.route("**/api/**", (r) => r.fulfill(json([])));
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Recepção Teste", role: "recepcao" } })));
  await page.route("**/api/clients*", (r) => r.fulfill(json(CLIENTES)));
  await page.route("**/api/agenda/resources", (r) => r.fulfill(json(RECURSOS)));
  await page.route("**/api/agenda/settings", (r) => r.fulfill(json({ id: 1, blockMinutes: 120, triggerPercent: 60, minLeadHours: 24, internalLeadMinutes: 5 })));
  await page.route("**/api/agenda/slots*", (r) => r.fulfill(json({ resourceId: 19, date: HOJE, reason: null, subBlocks: [], slots: [] })));
  await page.route("**/api/sessions*", (r) => r.fulfill(json([])));
  await page.route("**/api/agenda/google-compromissos*", (r) => r.fulfill(json({ desde: "2026-01-01T00:00:00Z", agendas: [], eventos: [] })));
  await page.route("**/api/agenda/encaixe/politica", (r) => r.fulfill(json({
    canal: "encaixe-interno", autorizado: o.autorizado, motivo: o.autorizado ? null : "Seu perfil não está autorizado.", codigo: o.autorizado ? null : "sem_permissao_encaixe",
    antecedenciaMinutos: 5, antecedenciaConfigurada: false, antecedenciaSugeridaMinutos: 5,
  })));
  await page.route("**/api/agenda/encaixe/disponibilidade*", (r) => {
    chamadas.disponibilidade.push(new URL(r.request().url()).search);
    return r.fulfill(json({
      canal: "encaixe-interno", resourceId: 19, date: HOJE, agora: AGORA_UTC.toISOString(), antecedenciaMinutos: 5, motivoDia: o.integracaoAtualizada === false ? "sincronizacao-pendente" : null,
      integracao: o.integracaoAtualizada === false
        ? { atualizada: false, mensagem: "A agenda Google não foi atualizada há pouco: a disponibilidade não pode ser garantida agora." }
        : { atualizada: true, mensagem: null },
      clienteVerificado: false, durationMinutes: 20, slotMinutes: 20, slots: o.slots ?? slotsInternos(),
      alternativas: { mesmoDia: ["10:40", "11:20"], proximoDia: null },
    }));
  });
  await page.route("**/api/agenda/book-avulsa", async (r) => { chamadas.padrao++; return r.fulfill(json({ session: { id: 1 }, googleEventId: "x" }, 201)); });
  await page.route("**/api/agenda/encaixe", async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    chamadas.interno++;
    const corpo = r.request().postDataJSON() as Record<string, unknown>;
    (chamadas as Record<string, unknown>).corpo = corpo;
    if (o.reservar) return o.reservar(r, corpo);
    return r.fulfill(json({ canal: "encaixe-interno", duplicada: false, session: { id: 77, protocolId: null, clientId: corpo.clientId, scheduledDate: corpo.date, scheduledTime: corpo.time, status: "scheduled" }, googleEventId: "evt-sintetico" }, 201));
  });
  return chamadas as typeof chamadas & { corpo?: Record<string, unknown> };
}

async function abrir(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto(URL_DIA);
  await page.getByTestId("novo-agendamento").click();
  await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeVisible();
}
async function escolher(page: Page) {
  await page.getByTestId("avulsa-cliente").getByRole("combobox").or(page.getByTestId("avulsa-cliente").locator("button").first()).first().click();
  await page.getByText("Cliente Sintético Alfa", { exact: false }).first().click();
  await page.getByTestId("avulsa-agenda").selectOption("19");
  await expect(page.getByTestId("avulsa-horario").locator("option")).not.toHaveCount(1);
  await page.getByTestId("avulsa-horario").selectOption("10:40");
}

test("autorizado: canal interno aparece, usa a disponibilidade e grava pela rota de encaixe sem enviar canal nem antecedência", async ({ page }) => {
  const c = await base(page, { autorizado: true });
  await abrir(page);
  await expect(page.getByTestId("avulsa-canal-interno")).toContainText("antecedência mínima de 5 minutos");
  await escolher(page);
  await expect(page.getByTestId("avulsa-sync-em-dia")).toBeVisible();
  await expect(page.getByTestId("avulsa-proximo-livre")).toBeEnabled();
  await page.getByTestId("avulsa-horario").selectOption("11:20");
  await page.getByTestId("avulsa-proximo-livre").click();
  await expect(page.getByTestId("avulsa-horario")).toHaveValue("10:40");
  await expect(page.getByTestId("avulsa-situacao-horario")).toContainText("livre");
  await expect(page.getByTestId("avulsa-resumo-detalhe")).toContainText("Agenda AGENDA SEDE");
  await expect(page.getByTestId("avulsa-resumo-detalhe")).toContainText("Cliente Sintético Alfa");
  await page.getByTestId("avulsa-confirmar").click();
  await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeHidden();
  expect(c.interno).toBe(1);
  expect(c.padrao).toBe(0);
  expect(Object.keys(c.corpo ?? {}).sort()).toEqual(["clientId", "date", "durationMinutes", "resourceId", "syncGoogle", "time"]);
  expect(c.disponibilidade.every((q) => !/canal|lead|antecedencia/i.test(q))).toBe(true);
});

test("horário indisponível por outra agenda do profissional mostra o motivo escrito pelo servidor", async ({ page }) => {
  await base(page, { autorizado: true });
  await abrir(page);
  await escolher(page);
  await page.getByTestId("avulsa-horario").selectOption("11:00");
  await expect(page.getByTestId("avulsa-situacao-horario")).toContainText("outra marcação neste horário, em outra agenda");
});

test("Google atrasado: a tela avisa e não promete disponibilidade", async ({ page }) => {
  await base(page, { autorizado: true, integracaoAtualizada: false, slots: slotsInternos().map((s) => ({ ...(s as object), state: "bloqueado", reason: "integracao", message: "A agenda Google não foi atualizada há pouco: a disponibilidade não pode ser garantida agora." })) });
  await abrir(page);
  await escolher(page);
  await expect(page.getByTestId("avulsa-sync-pendente")).toContainText("não pode ser garantida");
  await expect(page.getByTestId("avulsa-proximo-livre")).toBeDisabled();
  await expect(page.getByTestId("avulsa-confirmar")).toBeEnabled(); // o servidor decide; a tela não esconde a tentativa
});

test("recusa 409 do servidor mostra alternativas clicáveis e nada é gravado", async ({ page }) => {
  const c = await base(page, {
    autorizado: true,
    reservar: (r) => r.fulfill(json({ error: "Horário já ocupado nesta agenda.", codigo: "ocupado", alternativas: { mesmoDia: ["10:40", "11:20"], proximoDia: null } }, 409)),
  });
  await abrir(page);
  await escolher(page);
  await page.getByTestId("avulsa-confirmar").click();
  await expect(page.getByTestId("avulsa-recusada")).toContainText("Horário já ocupado nesta agenda.");
  await expect(page.getByTestId("avulsa-alternativas")).toBeVisible();
  await page.getByTestId("avulsa-alt-11:20").click();
  await expect(page.getByTestId("avulsa-recusada")).toBeHidden();
  await expect(page.getByTestId("avulsa-horario")).toHaveValue("11:20");
  expect(c.interno).toBe(1);
});

test("repetição devolvida como duplicada não vira erro nem segunda consulta", async ({ page }) => {
  await base(page, {
    autorizado: true,
    reservar: (r, corpo) => r.fulfill(json({ canal: "encaixe-interno", duplicada: true, session: { id: 77, protocolId: null, clientId: corpo.clientId, scheduledDate: corpo.date, scheduledTime: corpo.time, status: "scheduled" }, googleEventId: null }, 200)),
  });
  await abrir(page);
  await escolher(page);
  await page.getByTestId("avulsa-confirmar").click();
  await expect(page.getByText("Esta consulta já estava marcada")).toBeVisible();
  await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeHidden();
});

test("sem autorização: canal padrão de 24 horas, rota padrão e nenhuma chamada ao encaixe", async ({ page }) => {
  const c = await base(page, { autorizado: false });
  await abrir(page);
  await expect(page.getByTestId("avulsa-canal-padrao")).toContainText("24 horas e liberação em cadeia");
  await expect(page.getByTestId("avulsa-proximo-livre")).toHaveCount(0);
  expect(c.disponibilidade.length).toBe(0);
  expect(c.interno).toBe(0);
});

test("celular: diálogo do encaixe cabe na tela e os controles têm rótulo", async ({ page }) => {
  await base(page, { autorizado: true });
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto(URL_DIA);
  await page.getByTestId("novo-agendamento").click();
  const dialogo = page.getByTestId("consulta-avulsa-dialogo");
  await expect(dialogo).toBeVisible();
  const box = (await dialogo.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(393 + 1);
  await expect(page.getByRole("group", { name: "Opções rápidas de data e horário" })).toBeVisible();
  await expect(page.getByLabel("Duração (minutos)")).toBeVisible();
});
