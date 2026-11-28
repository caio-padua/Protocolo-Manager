/**
 * Home Care no Pit Stop, aba Documentos do profissional e conferência de agendas Google.
 * Tudo com rotas simuladas: nenhum registro real, nenhum evento do Google e nenhuma mensagem são criados.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

async function base(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Recepção Teste", role: "recepcao" }));
  });
  await page.route("**/api/**", (r) => r.fulfill(json([])));
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Recepção Teste", role: "recepcao" } })));
}

const plano = (over: Record<string, unknown> = {}) => ({
  id: 9, estado: "em_revisao", syncEstado: "nao_iniciada", syncDetalhe: null, syncEm: null, versao: 3, protocolId: 4, protocolo: "Protocolo sintético",
  clienteId: 7, cliente: "Paciente Sintético", prescritor: "Dr. Teste", prescritorId: 2, revisor: "Recepção Teste", revisorId: 1,
  revisaoExpiraEm: null, revisaoExpirada: false, confirmador: null, confirmadoEm: null,
  enderecoPaciente: "Rua Sintética, 100, Centro, Cidade Teste", preferidosPorAgenda: {},
  categorias: [{ id: 2, name: "Enfermagem" }],
  profissionaisPorCategoria: [{ id: 26, name: "Técnica Sintética", categoryId: 2, habilitacaoNivel: "tecnico_enfermagem", situacaoRegistro: "nao_verificada" }],
  itens: [{
    id: 1, procedimentoId: 3, nome: "Aplicação domiciliar", totalSessoes: 1, intervaloDias: 7, dataInicio: null, duracaoSegundos: 1800, dose: null,
    equipeOrigem: "procedimento", origemRequisito: null, homeCare: true, problema: null,
    equipe: [{ ordem: 0, categoryId: 2, categoryName: "Enfermagem", alternativeCategoryIds: [], professionalIds: [], modalidade: "home_care", agendaId: null,
      agendaOrigem: null, agendaNome: null, opcoesAgenda: [], exigeNivel: "enfermeiro", profissionalOrigem: null }],
    ocorrencias: [{ id: 55, numero: 1, data: "2026-12-01", hora: "09:00", origem: "manual", motivo: null, reservada: false, visitas: [], enderecoVisita: null, enderecoVisitaOrigem: null }],
  }],
  ...over,
});

test("Pit Stop Home Care: pede endereço, usa o do paciente e mostra o nível exigido", async ({ page }) => {
  await base(page);
  let ajuste: any;
  await page.route("**/api/agendamento/planos/9", (r) => r.fulfill(json({ plano: plano() })));
  await page.route("**/api/agendamento/pit-stop*", (r) => r.fulfill(json({ planos: [] })));
  await page.route("**/api/agendamento/planos/9/ocorrencias", (r) => { ajuste = r.request().postDataJSON(); return r.fulfill(json({ plano: plano() })); });
  await page.goto("/pit-stop/9");
  await expect(page.getByText("Home Care: no endereço do paciente")).toBeVisible();
  await expect(page.getByText("Endereço pendente: sem ele a visita Home Care não é reservada")).toBeVisible();
  await expect(page.getByText(/exige Enfermeiro\(a\)/)).toBeVisible();
  await expect(page.getByRole("option", { name: /Home Care/ }).first()).toBeAttached();
  await expect(page.getByRole("button", { name: "Confirmar e reservar" })).toBeDisabled();
  await page.getByRole("button", { name: "Usar o endereço cadastrado do paciente" }).click();
  await page.getByRole("button", { name: /Salvar datas e endereços/ }).click();
  await expect.poll(() => ajuste?.ajustes?.[0]?.usarEnderecoPaciente).toBe(true);
});

test("Pit Stop Home Care: paciente sem endereço obriga informar", async ({ page }) => {
  await base(page);
  await page.route("**/api/agendamento/pit-stop*", (r) => r.fulfill(json({ planos: [] })));
  await page.route("**/api/agendamento/planos/9", (r) => r.fulfill(json({ plano: plano({ enderecoPaciente: null }) })));
  await page.goto("/pit-stop/9");
  await expect(page.getByRole("button", { name: /Paciente sem endereço cadastrado/ })).toBeDisabled();
});

test("Conferência Google mostra erro honesto quando a conta não responde", async ({ page }) => {
  await base(page);
  await page.route("**/api/agenda-calendars", (r) => r.fulfill(json({ connected: true, calendars: [], googleOnly: [] })));
  await page.route("**/api/agenda/google/reconciliacao", (r) => r.fulfill(json({ code: "google_indisponivel", error: "Conta Google não confirmada." }, 503)));
  await page.goto("/cadastros/agendas-google");
  await page.getByRole("button", { name: /Conferir \(não altera nada\)/ }).click();
  await expect(page.getByTestId("reconciliacao-erro")).toContainText("não há prova de sincronização");
});

test("Conferência Google lista ajustes e só aplica com confirmação", async ({ page }) => {
  await base(page);
  let aplicou: any;
  await page.route("**/api/agenda-calendars", (r) => r.fulfill(json({ connected: true, calendars: [], googleOnly: [] })));
  await page.route("**/api/agenda/google/reconciliacao", (r) => r.fulfill(json({ resumo: {}, itens: [
    { acao: "renomear", googleCalendarId: "a@group.calendar.google.com", nomeAntes: "Enfermeira Domiciliar", nomeDepois: "AGENDA ENFERMAGEM - HOME CARE" },
    { acao: "relatar", googleCalendarId: "b@group", nome: "Aniversários", motivo: "agenda_pessoal_ou_geral", detalhe: "Agenda pessoal; não alterada." }] })));
  await page.route("**/api/agenda/google/reconciliacao/aplicar", (r) => { aplicou = r.request().postDataJSON(); return r.fulfill(json({ aplicados: [], falhas: [], depois: { resumo: {}, itens: [] } })); });
  await page.goto("/cadastros/agendas-google");
  await page.getByRole("button", { name: /Conferir \(não altera nada\)/ }).click();
  await expect(page.getByText("Renomear “Enfermeira Domiciliar” para “AGENDA ENFERMAGEM - HOME CARE”")).toBeVisible();
  expect(aplicou).toBeUndefined();
  await page.getByRole("button", { name: "Aplicar ajustes" }).click();
  // a confirmação é uma janela da própria tela (window.confirm é bloqueado em quadro/iframe); sem confirmar, nada é enviado
  await expect(page.getByRole("alertdialog")).toContainText("Aplicar 1 ajuste(s)");
  await page.getByRole("button", { name: "Voltar" }).click();
  expect(aplicou).toBeUndefined();
  await page.getByRole("button", { name: "Aplicar ajustes" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect.poll(() => aplicou?.confirmar).toBe(true);
});

test("Conflito com o Google: mostra os dois horários e só envia depois de confirmar", async ({ page }) => {
  await base(page);
  let decisao: any;
  let aberto = true;
  await page.route("**/api/agenda-calendars", (r) => r.fulfill(json({ connected: true, calendars: [], googleOnly: [] })));
  await page.route("**/api/agenda/google/conflitos", (r) => r.fulfill(json({ conflitos: aberto ? [
    { id: 7, sessaoId: 31, tipo: "alterado", estado: "aberto", agenda: "AGENDA SEDE", remotoInicio: "2026-11-12T17:00:00Z", remotoFim: "2026-11-12T17:30:00Z",
      sistemaInicio: "2026-11-12T13:00:00Z", sistemaFim: "2026-11-12T13:30:00Z", criadoEm: "2026-11-12T12:00:00Z" }] : [] })));
  await page.route("**/api/agenda/google/conflitos/7/resolver", (r) => { decisao = r.request().postDataJSON(); aberto = false; return r.fulfill(json({ ok: true, estado: "resolvido", mensagem: "Horário e título do sistema enviados ao mesmo evento do Google." })); });
  await page.goto("/cadastros/agendas-google");
  const bloco = page.getByTestId("conflito-7");
  await expect(bloco).toContainText("Horário alterado no Google");
  await expect(bloco).toContainText("10:00");
  await expect(bloco).toContainText("14:00");
  await page.screenshot({ path: "generated-artifacts/conflitos-google.png", fullPage: true });
  await bloco.getByRole("button", { name: "Enviar o do sistema" }).click();
  await page.getByRole("button", { name: "Voltar" }).click();
  expect(decisao).toBeUndefined();
  await bloco.getByRole("button", { name: "Enviar o do sistema" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
  await expect.poll(() => decisao).toEqual({ decisao: "enviar_sistema", confirmar: true });
  await expect(page.getByTestId("conflitos-vazio")).toBeVisible();
});

test("Aba Documentos: lista, mostra titular divergente, sugestão e envia arquivo", async ({ page }) => {
  await base(page);
  let enviado = false;
  const prof = { id: 26, name: "Fábia Teste", role: "executor", category: "enfermagem", professionalType: "nao_medico", active: false, areaId: 2,
    serviceTypes: ["clinic"], registrationCouncil: "COREN-SP", registrationNumber: "001.752.003", createdAt: "2026-11-11T00:00:00Z" };
  await page.route("**/api/professionals*", (r) => r.fulfill(json(r.request().url().includes("/documentos") ? { documentos: [] } : [prof])));
  await page.route("**/api/professionals/26/documentos", async (r) => {
    if (r.request().method() === "POST") { enviado = true; return r.fulfill(json({ documento: {} }, 201)); }
    return r.fulfill(json({ documentos: [
      { id: 1, tipo: "carteira_conselho", titulo: "Carteira COREN-SP", nomeOriginal: "c.jpg", mime: "image/jpeg", tamanhoBytes: 3000, situacao: "pendente_confirmacao", titularDeclarado: null, observacao: null, criadoEm: "2026-11-11",
        dados: [{ campo: "registro_numero", valor: "001.752.003", status: "sugerido", valorAnterior: null }] },
      { id: 2, tipo: "comprovante_endereco", titulo: "Conta de água", nomeOriginal: "e.jpg", mime: "image/jpeg", tamanhoBytes: 2000, situacao: "titular_divergente", titularDeclarado: "Valéria Teste", observacao: null, criadoEm: "2026-11-11", dados: [] }] }));
  });
  await page.goto("/professionals");
  await page.getByRole("button", { name: "Editar Fábia Teste" }).click();
  await page.getByRole("button", { name: /DOCUMENTOS/ }).click();
  await expect(page.getByTestId("documentos-profissional")).toBeVisible();
  await expect(page.getByText("Titular diferente do profissional")).toBeVisible();
  await expect(page.getByTestId("dado-1-registro_numero")).toContainText("Sugestão");
  await expect(page.getByRole("button", { name: "Aceitar no cadastro" })).toBeVisible();
  await page.getByTestId("doc-arquivo").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await page.getByTestId("doc-enviar").click();
  await expect.poll(() => enviado).toBe(true);
});
