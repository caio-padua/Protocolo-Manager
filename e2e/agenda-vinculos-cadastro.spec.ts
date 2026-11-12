/**
 * Cadastro do profissional <-> Agenda Configuração (via de mão dupla) e Tipos de atendimento.
 * Interface com rotas simuladas e dados 100% sintéticos, no formato exato das respostas reais do servidor
 * (conferido por consulta ao vivo em 12/11/2026). Nada é gravado, nenhum evento do Google e nenhuma mensagem.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const EMPRESA = { id: 5, nome: "Clínica Sintética Alfa", ativa: true };
const LOCAIS = [
  { id: 31, name: "LOCAL SEDE ENFERMAGEM", type: "clinic", address: "Rua A, 1 - Tatuapé - São Paulo - SP", empresaId: 5, active: true, estado: "SP" },
  { id: 35, name: "LOCAL SEDE MEDICO", type: "clinic", address: "Rua B, 2 - Santana - São Paulo - SP", empresaId: 5, active: true, estado: "SP" },
];
const VINCULOS = [{ ordem: 1, empresaId: 5, nome: EMPRESA.nome, papel: "originario" }];
const PROF = (serviceTypes: string[]) => ({
  id: 26, name: "Enf. Sintética Fábia", professionalType: "nao_medico", category: "enfermagem", role: "Enfermeira", areaId: 2, areaName: "Enfermagem",
  specialtyId: 1, specialtyName: "Enfermagem geral", serviceTypes, active: true, empresaOriginariaId: 5, empresaOriginariaNome: EMPRESA.nome,
  empresasVinculadas: VINCULOS, registrationCouncil: "COREN-SP", registrationNumber: "000.000.001", email: "fabia@sintetico.test", phone: "(11) 90000-0000",
});

type Agenda = {
  id: number; name: string; locationId: number | null; empresaId: number; modality: string; color: string; categoriaId: number; categoriaNome: string;
  vinculado: boolean; origens: string[]; editavelNoCadastro: boolean; motivoBloqueio: string | null;
};
const agendasIniciais = (): Agenda[] => [
  { id: 27, name: "AGENDA ENFERMAGEM - HOME CARE", locationId: null, empresaId: 5, modality: "home_care", color: "#7cb342", categoriaId: 2, categoriaNome: "Enfermagem",
    vinculado: true, origens: ["preferencia"], editavelNoCadastro: true, motivoBloqueio: null },
  { id: 28, name: "AGENDA ENFERMAGEM - OUTRO LOCAL", locationId: null, empresaId: 5, modality: "externo", color: "#ac725e", categoriaId: 2, categoriaNome: "Enfermagem",
    vinculado: false, origens: [], editavelNoCadastro: true, motivoBloqueio: null },
  { id: 29, name: "AGENDA MEDICO - CAIO SINTETICO - HOME CARE", locationId: null, empresaId: 5, modality: "home_care", color: "#9fc6e7", categoriaId: 1, categoriaNome: "Medicina",
    vinculado: false, origens: [], editavelNoCadastro: false, motivoBloqueio: "Categoria profissional diferente da categoria da agenda." },
  { id: 23, name: "AGENDA ENFERMAGEM - SEDE", locationId: 31, empresaId: 5, modality: "local", color: "#66bb6a", categoriaId: 2, categoriaNome: "Enfermagem",
    vinculado: false, origens: [], editavelNoCadastro: false, motivoBloqueio: "Agenda com local: o vínculo é feito pelo local, na lista de clínicas acima." },
];

interface Estado { agendas: Agenda[]; puts: { agenda: number; corpo: any }[]; falhaAgendas: boolean; recusarPut: boolean; profPuts: any[]; serviceTypes: string[] }

async function abrirCadastro(page: Page, opcoes: Partial<Estado> = {}): Promise<Estado> {
  const estado: Estado = { agendas: agendasIniciais(), puts: [], falhaAgendas: false, recusarPut: false, profPuts: [], serviceTypes: ["clinic"], ...opcoes };
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 6, name: "Dono sintético", role: "medico" }));
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const m = req.method();
    if (p === "/api/collaborator/me") return json(route, { professional: { id: 6, name: "Dono sintético", isPlatformOwner: true } });
    if (p === "/api/professionals" && m === "GET") return json(route, [PROF(estado.serviceTypes)]);
    if (p === "/api/professionals/26" && m === "PUT") { const corpo = req.postDataJSON(); estado.profPuts.push(corpo); estado.serviceTypes = corpo.serviceTypes; return json(route, PROF(estado.serviceTypes)); }
    if (p === "/api/professional-areas") return json(route, [{ id: 2, name: "Enfermagem", professionalType: "nao_medico" }]);
    if (p === "/api/professional-specialties") return json(route, [{ id: 1, name: "Enfermagem geral", areaId: 2 }]);
    if (p === "/api/empresas") return json(route, [EMPRESA]);
    if (p === "/api/locations") return json(route, LOCAIS);
    if (p === "/api/professionals/26/locations" && m === "GET") return json(route, [{ id: 1, locationId: 31, professionalId: 26, role: "executor", agendaCalendarId: null, empresaId: 5 }]);
    if (p === "/api/professionals/26/empresas" && m === "GET") return json(route, { professionalId: 26, limite: 5, vinculos: VINCULOS });
    if (p === "/api/professionals/26/agendas" && m === "GET") {
      return estado.falhaAgendas ? json(route, { error: "Falha sintética do servidor" }, 500) : json(route, { agendas: estado.agendas });
    }
    const put = p.match(/^\/api\/professionals\/26\/agendas\/(\d+)\/preferencia$/);
    if (put && m === "PUT") {
      const id = Number(put[1]);
      const corpo = req.postDataJSON();
      estado.puts.push({ agenda: id, corpo });
      if (estado.recusarPut) return json(route, { code: "agenda_individual", error: "Agenda individual: o titular é definido em Agenda Configuração." }, 409);
      estado.agendas = estado.agendas.map((a) => (a.id === id ? { ...a, vinculado: corpo.vinculado, origens: corpo.vinculado ? ["preferencia"] : [] } : a));
      return json(route, { ok: true, vinculado: corpo.vinculado });
    }
    return json(route, []);
  });
  await page.goto("/professionals");
  await page.getByRole("button", { name: "Editar Enf. Sintética Fábia" }).click();
  return estado;
}

test("Vínculos: a agenda Home Care (sem local) aparece, liga e desliga, e o contador acompanha", async ({ page }) => {
  const estado = await abrirCadastro(page);
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "VÍNCULOS" }).click();
  const regiao = dialogo.getByRole("region", { name: `Agendas de ${EMPRESA.nome}` });
  const bloco = regiao.getByTestId("agendas-sem-local");
  await expect(bloco).toBeVisible();
  await expect(bloco.getByText("Agendas sem local físico")).toBeVisible();
  // As três agendas sem local aparecem; a de local físico NÃO entra nesse bloco.
  const home = bloco.getByTestId("agenda-sem-local-27");
  await expect(home).toContainText("AGENDA ENFERMAGEM - HOME CARE");
  await expect(home).toContainText("Home Care");
  await expect(home).toContainText("Preferido da agenda");
  await expect(home.getByRole("switch")).toBeChecked();
  await expect(bloco.getByTestId("agenda-sem-local-23")).toHaveCount(0);
  // O nome da agenda (Agenda Configuração) manda: o local 31 aparece com o nome da agenda que o usa.
  await expect(regiao.getByText("AGENDA ENFERMAGEM - SEDE")).toBeVisible();
  await expect(regiao.getByText("LOCAL SEDE ENFERMAGEM")).toHaveCount(0);
  // Agenda de outra categoria: bloqueada, com o motivo visível. Não conta no total.
  const medico = bloco.getByTestId("agenda-sem-local-29");
  await expect(medico.getByRole("switch")).toBeDisabled();
  await expect(bloco.getByTestId("motivo-agenda-29")).toHaveText("Categoria profissional diferente da categoria da agenda.");
  await expect(regiao.getByText("2/4 agendas")).toBeVisible(); // sede 31 + Home Care ligadas; total = 2 locais + 2 sem local possíveis
  await page.screenshot({ path: "generated-artifacts/cadastro-vinculos-home-care.png" });

  // Liga "Outro local": grava, o contador e a tela acompanham.
  await bloco.getByTestId("agenda-sem-local-28").getByRole("switch").click();
  await expect.poll(() => estado.puts).toEqual([{ agenda: 28, corpo: { vinculado: true } }]);
  await expect(bloco.getByTestId("agenda-sem-local-28").getByRole("switch")).toBeChecked();
  await expect(regiao.getByText("3/4 agendas")).toBeVisible();
  // Desliga a Home Care.
  await home.getByRole("switch").click();
  await expect.poll(() => estado.puts.at(-1)).toEqual({ agenda: 27, corpo: { vinculado: false } });
  await expect(home.getByRole("switch")).not.toBeChecked();
  await expect(regiao.getByText("2/4 agendas")).toBeVisible();
});

test("Vínculos: recusa do servidor aparece em aviso e a chave volta ao estado real", async ({ page }) => {
  const estado = await abrirCadastro(page, { recusarPut: true });
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "VÍNCULOS" }).click();
  const outro = dialogo.getByTestId("agenda-sem-local-28");
  await outro.getByRole("switch").click();
  await expect(page.getByText("Falha ao alterar vínculo com a agenda")).toBeVisible();
  await expect(page.getByText("Agenda individual: o titular é definido em Agenda Configuração.", { exact: true })).toBeVisible();
  await expect(outro.getByRole("switch")).not.toBeChecked();
  expect(estado.agendas.find((a) => a.id === 28)?.vinculado).toBe(false);
});

test("Vínculos: falha ao consultar agendas mostra erro, mantém a lista de clínicas e tenta de novo", async ({ page }) => {
  const estado = await abrirCadastro(page, { falhaAgendas: true });
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "VÍNCULOS" }).click();
  await expect(dialogo.getByRole("region", { name: `Agendas de ${EMPRESA.nome}` })).toBeVisible();
  await expect(dialogo.getByTestId("agendas-erro")).toContainText("Falha sintética do servidor");
  await expect(dialogo.getByTestId("agendas-sem-local")).toHaveCount(0);
  estado.falhaAgendas = false;
  await dialogo.getByRole("button", { name: "TENTAR DE NOVO" }).click();
  await expect(dialogo.getByTestId("agendas-sem-local")).toBeVisible();
  await expect(dialogo.getByTestId("agendas-erro")).toHaveCount(0);
});

test("Tipos de atendimento: três interruptores; valor antigo 'clinic' vira Presencial e Home Care grava", async ({ page }) => {
  const estado = await abrirCadastro(page, { serviceTypes: ["clinic"] });
  const dialogo = page.getByRole("dialog");
  const tipos = dialogo.getByTestId("tipos-de-atendimento");
  await expect(tipos.getByRole("switch")).toHaveCount(3);
  await expect(tipos.getByLabel("Tipo de atendimento Presencial")).toBeChecked();
  await expect(tipos.getByLabel("Tipo de atendimento Home Care")).not.toBeChecked();
  await expect(tipos.getByLabel("Tipo de atendimento Online")).not.toBeChecked();
  await tipos.getByLabel("Tipo de atendimento Home Care").click();
  await expect(tipos.getByLabel("Tipo de atendimento Home Care")).toBeChecked();
  await page.screenshot({ path: "generated-artifacts/cadastro-tipos-atendimento.png" });
  // O último interruptor ligado não desliga: o profissional não fica sem nenhum tipo.
  await tipos.getByLabel("Tipo de atendimento Presencial").click();
  await tipos.getByLabel("Tipo de atendimento Home Care").click();
  await expect(tipos.getByLabel("Tipo de atendimento Home Care")).toBeChecked();
  await tipos.getByLabel("Tipo de atendimento Presencial").click();
  await dialogo.getByRole("button", { name: "SALVAR ALTERAÇÕES" }).click();
  await expect.poll(() => estado.profPuts.length).toBe(1);
  expect(estado.profPuts[0].serviceTypes).toEqual(["presencial", "home_care"]);
});

// ── Agenda Configuração ──────────────────────────────────────────────────────────────────────────────
const RECURSO = (id: number, name: string, extra: object) => ({
  id, name, kind: "enfermagem", modality: "local", color: "#66bb6a", slotMinutes: 30, professionalId: null, locationId: null, empresaId: 5,
  googleCalendarId: null, categoryId: 2, active: true, sortOrder: id, createdAt: "2026-11-12T02:44:00.000Z", externalAddress: null,
  externalAddressText: null, mapsUrl: null, wazeUrl: null, externalAddressStatus: null, categoryName: "Enfermagem", categoryStatus: "confirmada",
  sharing: "compartilhada", canManage: true, ...extra,
});
const RECURSOS = [
  RECURSO(27, "AGENDA ENFERMAGEM - HOME CARE", { modality: "home_care", locationId: null }),
  RECURSO(22, "AGENDA MEDICO - CAIO SINTETICO - SEDE", { kind: "medico", professionalId: 6, locationId: 35, categoryId: 1, categoryName: "Medicina", sharing: "individual" }),
];
const AGENDAS_LOCAL = [{ id: 35, name: "AGENDA MEDICO - CAIO SINTETICO - SEDE", color: "#3f8fd2", role: "local", enabled: true, lastSuccess: null, lastAttempt: null, error: null, personalOwnerId: null, canManage: true }];
const INTEGRACAO = {
  agendas: AGENDAS_LOCAL, professionals: [{ id: 26, name: "Enf. Sintética Fábia", categoryId: 2 }],
  resources: [{ id: 27, name: RECURSOS[0].name, locationId: null }, { id: 22, name: RECURSOS[1].name, locationId: 35 }],
  globalSettingsOwnerOnly: true, canManageGlobalSettings: true, companyId: 5, companyName: "Clínica Sintética Alfa",
};

async function abrirAgendaConfiguracao(page: Page, opcoes: { integracaoFalha?: boolean; vinculosFalha?: boolean } = {}) {
  await page.setViewportSize({ width: 1365, height: 1100 });
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 6, name: "Dono sintético", role: "medico" }));
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/collaborator/me") return json(route, { professional: { id: 6, name: "Dono sintético", isPlatformOwner: true } });
    if (p === "/api/agenda/integration") return opcoes.integracaoFalha ? json(route, { error: "Falha sintética" }, 500) : json(route, INTEGRACAO);
    if (p === "/api/agenda/resources") return json(route, RECURSOS);
    if (p === "/api/agenda/settings") return json(route, { id: 1, blockMinutes: 120, triggerPercent: 60, minLeadHours: 24 });
    if (p === "/api/agenda/requests") return json(route, { requests: [] });
    if (p === "/api/agenda/slots") return json(route, { resourceId: 27, date: "2026-11-12", slots: [], subBlocks: [], reason: "sem-expediente" });
    if (p === "/api/agenda/resources/27/profissionais-vinculados") {
      if (opcoes.vinculosFalha) return json(route, { error: "Falha sintética do cadastro" }, 500);
      return json(route, { agenda: { id: 27, name: RECURSOS[0].name, locationId: null, professionalId: null },
        profissionais: [{ id: 26, name: "Enf. Sintética Fábia", active: true, categoriaId: 2, categoriaNome: "Enfermagem", habilitacaoNivel: "enfermeiro", origens: ["preferencia"] }] });
    }
    if (p === "/api/agenda/resources/22/profissionais-vinculados") {
      return json(route, { agenda: { id: 22, name: RECURSOS[1].name, locationId: 35, professionalId: 6 },
        profissionais: [{ id: 6, name: "Dr. Sintético Caio", active: true, categoriaId: 1, categoriaNome: "Medicina", habilitacaoNivel: null, origens: ["individual", "local"] }] });
    }
    if (/\/api\/agenda\/resources\/\d+\/windows/.test(p)) return json(route, []);
    return json(route, []);
  });
}

test("Agenda Configuração: puxa o profissional do cadastro, mostra a clínica e identifica a agenda sem local", async ({ page }) => {
  await abrirAgendaConfiguracao(page);
  await page.goto("/agenda/motor?agenda=27");
  const prof = page.getByTestId("card-profissionais-da-agenda");
  await expect(prof.getByTestId("profissional-vinculado-26")).toContainText("Enf. Sintética Fábia");
  await expect(prof.getByTestId("profissional-vinculado-26")).toContainText("Preferido da agenda");
  await expect(page.getByTestId("card-clinica-da-sessao")).toContainText("Clínica Sintética Alfa");
  await expect(page.getByText("Ligação a verificar")).toHaveCount(0);
  await expect(page.getByText("não identificada")).toHaveCount(0);
  await expect(page.getByTestId("text-windows-locked")).toHaveCount(0);
  await expect(page.getByTestId("text-windows-auth-unknown")).toHaveCount(0);
  await page.screenshot({ path: "generated-artifacts/agenda-configuracao-home-care.png" });
});

test("Agenda Configuração: agenda com local mostra titular e vínculo do cadastro, sem 'não identificada'", async ({ page }) => {
  await abrirAgendaConfiguracao(page);
  await page.goto("/agenda/motor?agenda=22");
  const prof = page.getByTestId("card-profissionais-da-agenda");
  await expect(prof.getByTestId("profissional-vinculado-6")).toContainText("Titular da agenda + Vínculo do cadastro");
  await expect(page.getByText("não identificada")).toHaveCount(0);
  await expect(page.getByTestId("text-windows-locked")).toHaveCount(0);
});

test("Agenda Configuração: falha da integração é dita como falha, nunca como 'você não administra'", async ({ page }) => {
  await abrirAgendaConfiguracao(page, { integracaoFalha: true });
  await page.goto("/agenda/motor?agenda=22");
  await expect(page.getByTestId("text-windows-auth-unknown")).toContainText("Não foi possível confirmar sua autorização");
  await expect(page.getByTestId("text-windows-locked")).toHaveCount(0);
  await expect(page.getByText("Não foi possível consultar os locais agora.")).toBeVisible();
  await expect(page.getByTestId("card-clinica-da-sessao")).toContainText("Não foi possível consultar a clínica agora.");
});

test("Agenda Configuração: falha ao consultar o cadastro é dita no cartão do profissional", async ({ page }) => {
  await abrirAgendaConfiguracao(page, { vinculosFalha: true });
  await page.goto("/agenda/motor?agenda=27");
  await expect(page.getByTestId("card-profissionais-da-agenda")).toContainText("Falha sintética do cadastro");
  await expect(page.getByTestId("card-profissionais-da-agenda").getByTestId("profissional-vinculado-26")).toHaveCount(0);
});
