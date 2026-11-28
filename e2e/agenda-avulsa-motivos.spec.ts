/**
 * Consulta avulsa: o motivo de cada período indisponível (ocupado, já passou, antecedência mínima, compromisso,
 * liberação em cadeia, Google Agenda pendente). Reproduz com dados SINTÉTICOS o que o motor devolveu para a
 * agenda de enfermagem da Sede em 12/11/2026 (agora = 17:16 em Brasília).
 * Rotas simuladas: nenhuma leitura ou escrita real, nenhuma consulta, evento ou mensagem. Nenhum POST é permitido.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const AGORA_UTC = new Date("2026-11-12T20:16:00Z"); // 17:16 em Brasília
const HOJE = "2026-11-12";

const CLIENTES = [{ id: 501, name: "Cliente Sintético Alfa", cpf: "00000000191", phone: "11900000001", photoUrl: null, status: "active", deletedAt: null }];
const RECURSOS = [
  { id: 23, name: "AGENDA ENFERMAGEM - SEDE", kind: "enfermagem", modality: "local", color: "#7cb342", slotMinutes: 20, active: true, sortOrder: 1,
    professionalId: null, professionalName: null, locationId: 31, locationName: "AGENDA ENFERMAGEM - SEDE" },
];

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function periodos() {
  const lista: { time: string; bloco: number }[] = [];
  for (let m = 9 * 60; m < 11 * 60; m += 20) lista.push({ time: hhmm(m), bloco: 0 });
  for (let m = 11 * 60; m < 13 * 60; m += 20) lista.push({ time: hhmm(m), bloco: 1 });
  for (let m = 14 * 60; m < 16 * 60; m += 20) lista.push({ time: hhmm(m), bloco: 2 });
  return lista;
}
const blocos = (ocupados: [number, number, number]) => [
  { startTime: "09:00", endTime: "11:00", released: true, total: 6, occupied: ocupados[0], occupancy: Math.round((ocupados[0] / 6) * 100) },
  { startTime: "11:00", endTime: "13:00", released: ocupados[0] / 6 >= 0.6, total: 6, occupied: ocupados[1], occupancy: Math.round((ocupados[1] / 6) * 100) },
  { startTime: "14:00", endTime: "16:00", released: false, total: 6, occupied: ocupados[2], occupancy: Math.round((ocupados[2] / 6) * 100) },
];

/** Respostas do motor por data, no formato real da rota GET /agenda/slots. */
function motor(date: string) {
  const base = { resourceId: 23, date };
  if (date === "2026-11-12") { // hoje, 17:16: tudo que começou é "passado"; 14:00, 14:20, 15:00-15:40 têm evento do Google
    const comp = new Set(["14:00", "14:20", "15:00", "15:20", "15:40"]);
    return { ...base, reason: null, subBlocks: blocos([1, 0, 0]), slots: periodos().map((p) => ({
      time: p.time, subBlockIndex: p.bloco,
      state: p.time === "09:00" ? "ocupado" : "bloqueado",
      reason: p.time === "09:00" ? null : comp.has(p.time) ? "compromisso" : "passado",
    })) };
  }
  if (date === "2026-11-13") { // amanhã: ainda dentro das 24 horas
    return { ...base, reason: null, subBlocks: blocos([1, 0, 0]), slots: periodos().filter((p) => p.bloco < 2).map((p) => ({
      time: p.time, subBlockIndex: p.bloco, state: p.time === "09:00" ? "ocupado" : "bloqueado", reason: p.time === "09:00" ? null : "antecedencia",
    })) };
  }
  if (date === "2026-11-16") { // segunda: primeiro bloco aberto, os seguintes presos na cadeia
    return { ...base, reason: null, subBlocks: blocos([1, 0, 0]), slots: periodos().map((p) => ({
      time: p.time, subBlockIndex: p.bloco, state: p.time === "09:00" ? "ocupado" : p.bloco === 0 ? "aberto" : "bloqueado",
      reason: p.bloco === 0 ? null : "cadeia",
    })) };
  }
  if (date === "2026-11-17") { // leitura do Google atrasada: travado por segurança
    return { ...base, reason: "sincronizacao-pendente", subBlocks: blocos([0, 0, 0]), slots: periodos().map((p) => ({
      time: p.time, subBlockIndex: p.bloco, state: "bloqueado", reason: "integracao",
    })) };
  }
  return { ...base, reason: "sem-expediente", subBlocks: [], slots: [] }; // 14/11 (sábado sem expediente)
}

async function abrir(page: Page) {
  const escritas: string[] = [];
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.clock.setFixedTime(AGORA_UTC);
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Recepção Teste", role: "recepcao" }));
  });
  await page.route("**/api/**", (r) => {
    if (r.request().method() !== "GET") escritas.push(`${r.request().method()} ${r.request().url()}`);
    return r.fulfill(json([]));
  });
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Recepção Teste", role: "recepcao" } })));
  await page.route("**/api/clients*", (r) => r.fulfill(json(CLIENTES)));
  await page.route("**/api/agenda/resources", (r) => r.fulfill(json(RECURSOS)));
  await page.route("**/api/agenda/settings", (r) => r.fulfill(json({ id: 1, blockMinutes: 120, triggerPercent: 60, minLeadHours: 24, updatedAt: "2026-06-20T03:53:53Z" })));
  await page.route("**/api/agenda/slots*", (r) => r.fulfill(json(motor(new URL(r.request().url()).searchParams.get("date") ?? ""))));
  await page.route("**/api/sessions*", (r) => r.fulfill(json([])));
  await page.route("**/api/agenda/google-compromissos*", (r) => r.fulfill(json({ desde: "2026-01-01T00:00:00Z", agendas: [], eventos: [] })));
  await page.route("**/api/agenda/book-avulsa", (r) => { escritas.push("POST book-avulsa"); return r.fulfill(json({ error: "não deveria ser chamado" }, 500)); });
  await page.goto(`/agenda?modo=dia&data=${HOJE}&visao=linha`);
  await page.getByTestId("novo-agendamento").click();
  await expect(page.getByTestId("consulta-avulsa-dialogo")).toBeVisible();
  // Com uma única agenda, a tela já a escolhe sozinha; reselecionar o mesmo valor não é uma ação real do usuário.
  if ((await page.getByTestId("avulsa-agenda").inputValue()) !== "23") await page.getByTestId("avulsa-agenda").selectOption("23");
  await expect(page.getByTestId("avulsa-horario")).not.toHaveValue("");
  return escritas;
}

async function irParaData(page: Page, data: string) {
  await page.getByTestId("avulsa-data").fill(data);
  await expect(page.getByTestId("avulsa-data")).toHaveValue(data);
}

test("12/11 às 17:16: nenhum horário livre; cada grupo mostra o motivo exato (ocupado, já passou, compromisso)", async ({ page }) => {
  const escritas = await abrir(page);
  await expect(page.getByTestId("avulsa-nenhum-livre")).toBeVisible();
  const painel = page.getByTestId("avulsa-motivos");
  await expect(painel).toHaveAttribute("open", "");
  await expect(page.getByTestId("avulsa-motivo-ocupado")).toContainText("(1): 09:00");
  const passado = page.getByTestId("avulsa-motivo-passado");
  await expect(passado).toContainText("Horário que já passou (12)");
  await expect(passado).toContainText("09:20");
  await expect(passado).toContainText("14:40");
  await expect(passado).toContainText("Nunca se marca no passado");
  const compromisso = page.getByTestId("avulsa-motivo-compromisso");
  await expect(compromisso).toContainText("(5): 14:00, 14:20, 15:00, 15:20, 15:40");
  await expect(compromisso).toContainText("Google Agenda");
  // nada de antecedência hoje: o que passou é "passou", não "antecedência"
  await expect(page.getByTestId("avulsa-motivo-antecedencia")).toHaveCount(0);
  // a lista de horários também diz o motivo ao lado de cada um
  const opcoes = page.getByTestId("avulsa-horario").locator("option");
  await expect(opcoes.filter({ hasText: "09:20 — já passou" })).toHaveCount(1);
  await expect(opcoes.filter({ hasText: "14:00 — compromisso" })).toHaveCount(1);
  await expect(opcoes.filter({ hasText: "09:00 — ocupado" })).toHaveCount(1);
  await page.screenshot({ path: "test-results/avulsa-motivos-hoje.png" });
  expect(escritas).toEqual([]);
});

test("13/11: dentro das 24 horas é antecedência mínima, com a regra da agenda em horas", async ({ page }) => {
  await abrir(page);
  await irParaData(page, "2026-11-13");
  const g = page.getByTestId("avulsa-motivo-antecedencia");
  await expect(g).toContainText("Dentro da antecedência mínima (11)");
  await expect(g).toContainText("24 horas ou mais de antecedência");
  await expect(page.getByTestId("avulsa-motivo-passado")).toHaveCount(0);
  await expect(page.getByTestId("avulsa-nenhum-livre")).toBeVisible();
});

test("16/11: horário aberto existe; o que ficou preso na cadeia diz qual bloco segura e em quanto está", async ({ page }) => {
  await abrir(page);
  await irParaData(page, "2026-11-16");
  await expect(page.getByTestId("avulsa-nenhum-livre")).toHaveCount(0);
  const cadeia = page.getByTestId("avulsa-motivo-cadeia");
  await expect(cadeia).toContainText("Ainda não liberados (liberação em cadeia) (12)");
  await expect(cadeia).toContainText("O bloco 11:00–13:00 só abre quando o bloco 09:00–11:00 chegar a 60% de ocupação; hoje está em 17% (1 de 6).");
  await expect(cadeia).toContainText("O bloco 14:00–16:00 só abre quando o bloco 09:00–11:00 chegar a 60% de ocupação");
  await expect(page.getByTestId("avulsa-motivos")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("avulsa-horario").locator("option").filter({ hasText: "11:00 — aguarda liberação em cadeia" })).toHaveCount(1);
});

test("17/11: leitura do Google atrasada trava tudo por segurança e a tela diz isso, sem chamar de conflito", async ({ page }) => {
  await abrir(page);
  await irParaData(page, "2026-11-17");
  await expect(page.getByTestId("avulsa-dia-motivo")).toContainText("leitura do Google Agenda desta agenda está atrasada");
  await expect(page.getByTestId("avulsa-motivo-integracao")).toContainText("Aguardando o Google Agenda (18)");
  await expect(page.getByTestId("avulsa-motivo-compromisso")).toHaveCount(0);
});

test("14/11: dia sem expediente mostra o motivo em português, não o código do sistema", async ({ page }) => {
  await abrir(page);
  await irParaData(page, "2026-11-14");
  const aviso = page.getByTestId("avulsa-agenda-fechada");
  await expect(aviso).toContainText("não tem janela de atendimento neste dia da semana");
  await expect(aviso).not.toContainText("sem-expediente");
});

test("escolher um período bloqueado explica o motivo e o servidor segue decidindo", async ({ page }) => {
  const escritas = await abrir(page);
  await irParaData(page, "2026-11-12");
  await page.getByTestId("avulsa-horario").selectOption("09:20");
  await expect(page.getByTestId("avulsa-provavel-conflito")).toContainText("09:20 não pode ser marcado: esse horário já passou");
  await page.getByTestId("avulsa-horario").selectOption("14:00");
  await expect(page.getByTestId("avulsa-provavel-conflito")).toContainText("há outro compromisso no mesmo horário");
  expect(escritas).toEqual([]);
});
