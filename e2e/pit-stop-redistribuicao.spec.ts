/**
 * Pit Stop: mover visita (botão acessível "Alterar data/hora" e arrastar/soltar com mouse E toque) e encaixe da 1ª sessão.
 * Rotas simuladas: nenhum dado real, nenhuma reserva e nenhum evento do Google. O servidor real é coberto por
 * artifacts/api-server/src/tests/pit-stop-postgres.test.ts (concorrência, bloqueios, auditoria).
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const pad = (n: number) => String(n).padStart(2, "0");
// Mês seguinte, dias 10, 17 e 24: sempre no futuro e dentro da mesma grade do calendário.
const agora = new Date();
const ano = agora.getMonth() === 11 ? agora.getFullYear() + 1 : agora.getFullYear();
const mes = (agora.getMonth() + 1) % 12 + 1;
const dia = (n: number) => `${ano}-${pad(mes)}-${pad(n)}`;
const difDias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

type Oc = { id: number; numero: number; data: string; hora: string; origem: "automatica" | "manual"; motivo: string | null; reservada: boolean; encaixe?: boolean };
type Estado = { versao: number; ocs: Oc[]; moverChamadas: any[]; encaixeChamadas: any[]; previaChamadas: any[]; moverFalha: boolean; encaixeModo: "sem_vaga" | "ok" | "aceite" };
const NOMINAIS: Record<number, string> = { 1: dia(10), 2: dia(17), 3: dia(24) };

function planoJson(st: Estado) {
  return {
    id: 7, estado: "em_revisao", syncEstado: "nao_iniciada", syncDetalhe: null, syncEm: null, versao: st.versao, protocolId: 70, protocolo: "Protocolo sintético",
    clienteId: 5, cliente: "Paciente Sintético", prescritor: "Médico Sintético", prescritorId: 201, revisor: "Recepção Teste", revisorId: 1, revisaoExpiraEm: null,
    revisaoExpirada: false, confirmador: null, confirmadoEm: null, profissionaisPorCategoria: [], categorias: [{ id: 2, name: "Enfermagem" }], enderecoPaciente: null, preferidosPorAgenda: {},
    itens: [{
      id: 11, procedimentoId: 2, nome: "Aplicação de substância", totalSessoes: 3, intervaloDias: 7, dataInicio: dia(10), duracaoSegundos: 1800, dose: "10 mg",
      equipeOrigem: "procedimento", origemRequisito: null, homeCare: false, dataBase: dia(10), toleranciaDias: 4, intervaloMinimo: 3,
      equipe: [{ ordem: 0, categoryId: 2, categoryName: "Enfermagem", alternativeCategoryIds: [], professionalIds: [], modalidade: "local", agendaId: 2, agendaOrigem: "sugerida",
        agendaNome: "ENFERMAGEM - SEDE", opcoesAgenda: [{ id: 2, nome: "ENFERMAGEM - SEDE", modalidade: "local", professionalId: null }], exigeNivel: null, profissionalOrigem: null }],
      problema: null,
      ocorrencias: st.ocs.map((o, i) => ({
        ...o, visitas: [], enderecoVisita: null, enderecoVisitaOrigem: null, rankPreferencia: null, encaixe: o.encaixe === true,
        avaliacao: { dataNominal: NOMINAIS[o.numero], diferencaDias: difDias(o.data, NOMINAIS[o.numero]!), foraDaJanela: Math.abs(difDias(o.data, NOMINAIS[o.numero]!)) > 4,
          intervaloAnterior: i > 0 ? difDias(o.data, st.ocs[i - 1]!.data) : null, intervaloMinimo: 3, abaixoDoMinimo: false, naOrdem: true },
      })),
    }],
  };
}

async function montar(page: Page, opts: { reservada1?: boolean } = {}) {
  const st: Estado = {
    versao: 3, moverChamadas: [], encaixeChamadas: [], previaChamadas: [], moverFalha: false, encaixeModo: "sem_vaga",
    ocs: [
      { id: 101, numero: 1, data: dia(10), hora: "09:00", origem: "automatica", motivo: null, reservada: opts.reservada1 === true },
      { id: 102, numero: 2, data: dia(17), hora: "09:00", origem: "automatica", motivo: null, reservada: false },
      { id: 103, numero: 3, data: dia(24), hora: "09:00", origem: "automatica", motivo: null, reservada: false },
    ],
  };
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "e2e-fake-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 1, name: "Recepção Teste", role: "recepcao" }));
  });
  await page.route("**/api/**", (r) => r.fulfill(json([])));
  await page.route("**/api/collaborator/me", (r) => r.fulfill(json({ professional: { id: 1, name: "Recepção Teste", role: "recepcao" } })));
  await page.route("**/api/agendamento/pit-stop*", (r) => r.fulfill(json({ planos: [] })));
  await page.route("**/api/agendamento/planos/7", (r) => r.fulfill(json({ plano: planoJson(st) })));
  await page.route("**/api/agendamento/planos/7/ocorrencias/*/mover-previa", async (r) => {
    const ocId = Number(new URL(r.request().url()).pathname.split("/").at(-2));
    const { data, hora } = r.request().postDataJSON();
    st.previaChamadas.push({ ocId, data, hora });
    const oc = st.ocs.find((o) => o.id === ocId)!;
    const nominal = NOMINAIS[oc.numero]!;
    const dif = difDias(data, nominal);
    const fora = Math.abs(dif) > 4;
    const bloqueios = data === dia(12) && hora === "10:00" ? [{ code: "horario_indisponivel", message: "Este horário não está livre para a equipe completa (agenda, profissional ou janela de atendimento)." }] : [];
    await r.fulfill(json({ previa: {
      ocorrenciaId: ocId, itemId: 11, itemNome: "Aplicação de substância", numero: oc.numero, de: { data: oc.data, hora: oc.hora }, para: { data, hora },
      podeMover: bloqueios.length === 0, exigeAceite: fora, bloqueios,
      avisos: fora ? [{ code: "fora_da_janela", message: `${Math.abs(dif)} dia(s) da data nominal; exige aceite explícito.` }] : [],
      avaliacao: { dataNominal: nominal, diferencaDias: dif, foraDaJanela: fora, intervaloAnterior: oc.numero > 1 ? difDias(data, st.ocs[oc.numero - 2]!.data) : null, intervaloMinimo: 3, abaixoDoMinimo: false, naOrdem: true },
      rankPreferencia: null,
      impacto: st.ocs.filter((o) => o.numero > oc.numero).map((o) => ({ ocorrenciaId: o.id, numero: o.numero, data: o.data, hora: o.hora, origem: o.origem, reservada: o.reservada,
        intervaloDepoisDoMovimento: difDias(o.data, data), abaixoDoMinimo: false, seraRecalculada: o.origem === "automatica" })),
      alternativas: [{ date: dia(13), time: "11:00", rank: null, diferenca: 3, agendas: ["ENFERMAGEM - SEDE"] }],
      vagasDoDia: [{ time: "08:00", agendas: [] }, { time: "09:30", agendas: [] }, { time: "10:00", agendas: [] }],
    } }));
  });
  await page.route("**/api/agendamento/planos/7/ocorrencias/*/mover", async (r) => {
    const ocId = Number(new URL(r.request().url()).pathname.split("/").at(-2));
    const corpo = r.request().postDataJSON();
    st.moverChamadas.push({ ocId, ...corpo });
    if (st.moverFalha) return r.fulfill(json({ code: "plano_mudou", error: "O plano mudou enquanto você olhava. Nada foi movido." }, 409));
    const oc = st.ocs.find((o) => o.id === ocId)!;
    oc.data = corpo.data; oc.hora = corpo.hora; oc.origem = "manual"; st.versao++;
    return r.fulfill(json({ plano: planoJson(st) }));
  });
  await page.route("**/api/agendamento/planos/7/itens/11/encaixar-primeira", async (r) => {
    const corpo = r.request().postDataJSON();
    st.encaixeChamadas.push(corpo);
    if (st.encaixeModo === "sem_vaga") {
      return r.fulfill(json({ code: "sem_vaga_no_termino", error: "Não há vaga livre hoje a partir de 12:00 para a equipe completa. Nada foi alterado.",
        alternativas: [{ date: dia(13), time: "11:00", rank: null, diferenca: 0, agendas: ["ENFERMAGEM - SEDE"] }] }, 409));
    }
    if (st.encaixeModo === "aceite" && !corpo.aceitarForaDaJanela) {
      return r.fulfill(json({ code: "fora_da_janela_exige_aceite", error: "Hoje fica fora da janela de 4 dias da primeira sessão. Confirme o aceite para encaixar." }, 422));
    }
    const oc = st.ocs[0]!;
    oc.data = dia(10); oc.hora = "09:30"; oc.origem = "manual"; oc.motivo = "encaixe_termino_consulta"; oc.encaixe = true; st.versao++;
    return r.fulfill(json({ plano: planoJson(st), encaixe: { date: oc.data, time: oc.hora } }));
  });
  return st;
}

test.describe("Pit Stop: mover visita pelo botão acessível", () => {
  test("Alterar data/hora: prévia validada no servidor, escolha de horário livre e gravação só no botão final", async ({ page }) => {
    const st = await montar(page);
    await page.goto("/pit-stop/7");
    await expect(page.getByTestId("plano-pit-stop")).toBeVisible();
    await expect(page.getByTestId("calendario-plano")).toBeVisible();
    // Cartão expansível: resumo visível, detalhe só ao expandir.
    const cartao = page.getByTestId("ocorrencia-102");
    await expect(cartao).toHaveAttribute("data-aberta", "nao");
    await expect(cartao).toContainText("Nominal");
    await page.getByTestId("ocorrencia-resumo-102").click();
    await expect(cartao).toHaveAttribute("data-aberta", "sim");
    await page.getByRole("button", { name: /Alterar data e hora da sessão 2 de 3/ }).click();
    const dlg = page.getByTestId("mover-dialog");
    await expect(dlg).toBeVisible();
    await dlg.getByTestId("mover-data").fill(dia(18));
    await dlg.getByTestId("mover-hora").fill("09:00");
    await expect(dlg.getByTestId("mover-previa")).toHaveAttribute("data-pode", "sim");
    await expect(dlg.getByTestId("mover-impacto")).toContainText("Sessão 3");
    await expect(dlg.getByTestId("mover-impacto")).toContainText("será recalculada");
    expect(st.moverChamadas).toHaveLength(0); // prévia não grava
    await dlg.getByTestId("mover-vagas-dia").getByRole("button", { name: "09:30" }).click();
    await expect(dlg.getByTestId("mover-hora")).toHaveValue("09:30");
    await page.screenshot({ path: "test-results/pit-stop-mover-dialog.png", fullPage: true });
    await dlg.getByTestId("mover-confirmar").click();
    await expect(dlg).toBeHidden();
    expect(st.moverChamadas).toEqual([{ ocId: 102, versao: 3, data: dia(18), hora: "09:30", aceitarForaDaJanela: false }]);
    await expect(page.getByTestId("ocorrencia-102")).toContainText("Escolhida");
  });

  test("horário bloqueado pelo servidor: botão desligado, motivo visível e nada é gravado", async ({ page }) => {
    const st = await montar(page);
    await page.goto("/pit-stop/7");
    await page.getByTestId("ocorrencia-resumo-102").click();
    await page.getByTestId("alterar-102").click();
    const dlg = page.getByTestId("mover-dialog");
    await dlg.getByTestId("mover-data").fill(dia(12));
    await dlg.getByTestId("mover-hora").fill("10:00");
    await expect(dlg.getByRole("alert")).toContainText("não está livre para a equipe completa");
    await expect(dlg.getByTestId("mover-confirmar")).toBeDisabled();
    expect(st.moverChamadas).toHaveLength(0);
    // Alternativa real oferecida pelo servidor destrava o botão.
    await dlg.getByTestId("mover-alternativas").getByRole("button").first().click();
    await expect(dlg.getByTestId("mover-previa")).toHaveAttribute("data-pode", "sim");
    await expect(dlg.getByTestId("mover-confirmar")).toBeEnabled();
  });

  test("fora da janela de 4 dias exige aceite explícito antes de mover", async ({ page }) => {
    const st = await montar(page);
    await page.goto("/pit-stop/7");
    await page.getByTestId("ocorrencia-resumo-101").click();
    await page.getByTestId("alterar-101").click();
    const dlg = page.getByTestId("mover-dialog");
    await dlg.getByTestId("mover-data").fill(dia(20)); // 10 dias depois da nominal: fora da janela de 4
    await expect(dlg.getByTestId("mover-aceite")).toBeVisible();
    await expect(dlg.getByTestId("mover-confirmar")).toBeDisabled();
    await dlg.getByTestId("mover-aceite").check();
    await expect(dlg.getByTestId("mover-confirmar")).toBeEnabled();
    await dlg.getByTestId("mover-confirmar").click();
    await expect(dlg).toBeHidden();
    expect(st.moverChamadas[0]).toMatchObject({ ocId: 101, aceitarForaDaJanela: true });
  });

  test("falha do servidor ao mover (plano mudou): o aviso aparece e a visita continua onde estava", async ({ page }) => {
    const st = await montar(page);
    st.moverFalha = true;
    await page.goto("/pit-stop/7");
    await page.getByTestId("ocorrencia-resumo-102").click();
    await page.getByTestId("alterar-102").click();
    const dlg = page.getByTestId("mover-dialog");
    await dlg.getByTestId("mover-data").fill(dia(18));
    await expect(dlg.getByTestId("mover-previa")).toHaveAttribute("data-pode", "sim");
    await dlg.getByTestId("mover-confirmar").click();
    await expect(page.getByText("Nada foi movido").first()).toBeVisible();
    await expect(dlg).toBeVisible(); // continua aberto para tentar de novo ou cancelar
    await dlg.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("ocorrencia-102")).toContainText(`17/${pad(mes)}`);
    expect(st.ocs[1]!.data).toBe(dia(17));
  });

  test("visita já reservada não arrasta nem abre a tela de mover", async ({ page }) => {
    await montar(page, { reservada1: true });
    await page.goto("/pit-stop/7");
    await expect(page.getByTestId("chip-101")).toHaveAttribute("data-reservada", "sim");
    await page.getByTestId("chip-101").click();
    await expect(page.getByTestId("mover-dialog")).toHaveCount(0);
    await page.getByTestId("ocorrencia-resumo-101").click();
    await expect(page.getByTestId("alterar-101")).toBeDisabled();
  });
});

test.describe("Pit Stop: arrastar e soltar no calendário", () => {
  test("mouse: arrastar a visita para outro dia abre a prévia com o dia escolhido e só grava no botão final", async ({ page }) => {
    const st = await montar(page);
    await page.goto("/pit-stop/7");
    const chip = page.getByTestId("chip-102");
    const alvo = page.getByTestId(`cal-dia-${dia(18)}`);
    const a = (await chip.boundingBox())!, b = (await alvo.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 10, { steps: 4 });
    await expect(page.getByTestId(`cal-dia-${dia(17)}`)).toHaveAttribute("data-janela", "sim");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await page.mouse.up();
    const dlg = page.getByTestId("mover-dialog");
    await expect(dlg.getByTestId("mover-data")).toHaveValue(dia(18));
    await expect(dlg.getByTestId("mover-hora")).toHaveValue("09:00");
    await expect(dlg.getByTestId("mover-previa")).toHaveAttribute("data-pode", "sim");
    expect(st.moverChamadas).toHaveLength(0);
    await dlg.getByTestId("mover-confirmar").click();
    await expect(dlg).toBeHidden();
    expect(st.moverChamadas).toEqual([{ ocId: 102, versao: 3, data: dia(18), hora: "09:00", aceitarForaDaJanela: false }]);
    await expect(page.getByTestId(`cal-dia-${dia(18)}`).getByTestId("chip-102")).toBeVisible();
  });

  test("soltar fora de qualquer dia não abre nada nem grava", async ({ page }) => {
    const st = await montar(page);
    await page.goto("/pit-stop/7");
    const a = (await page.getByTestId("chip-102").boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(2, 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByTestId("mover-dialog")).toHaveCount(0);
    expect(st.moverChamadas).toHaveLength(0);
    expect(st.previaChamadas).toHaveLength(0);
  });
});

test.describe("Pit Stop: arrastar e soltar por toque", () => {
  test.use({ hasTouch: true, viewport: { width: 412, height: 900 } });
  test("toque: segurar um instante e arrastar a visita abre a prévia e só grava no botão final", async ({ page }) => {
    const st = await montar(page);
    await page.goto("/pit-stop/7");
    const cdp = await page.context().newCDPSession(page);
    const chip = page.getByTestId("chip-102");
    await chip.evaluate((el) => el.scrollIntoView({ block: "center" })); // longe das bordas: sem rolagem automática durante o arraste
    const a = (await chip.boundingBox())!;
    const alvo = page.getByTestId(`cal-dia-${dia(18)}`);
    const b = (await alvo.boundingBox())!;
    const ponto = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y), id: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [ponto(a.x + a.width / 2, a.y + a.height / 2)] });
    await page.waitForTimeout(350); // pressão longa que ativa o arraste (evita brigar com a rolagem)
    for (let i = 1; i <= 12; i++) {
      const x = a.x + a.width / 2 + ((b.x + b.width / 2) - (a.x + a.width / 2)) * (i / 12);
      const y = a.y + a.height / 2 + ((b.y + b.height / 2) - (a.y + a.height / 2)) * (i / 12);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [ponto(x, y)] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const dlg = page.getByTestId("mover-dialog");
    await expect(dlg.getByTestId("mover-data")).toHaveValue(dia(18));
    expect(st.moverChamadas).toHaveLength(0);
    await dlg.getByTestId("mover-confirmar").click();
    await expect(dlg).toBeHidden();
    expect(st.moverChamadas[0]).toMatchObject({ ocId: 102, data: dia(18), hora: "09:00" });
    await page.screenshot({ path: "test-results/pit-stop-toque.png", fullPage: true });
  });
});

test.describe("Pit Stop: toque simples", () => {
  test.use({ hasTouch: true, viewport: { width: 412, height: 900 } });
  test("toque rápido no cartão do calendário não arrasta: abre a prévia na própria data da visita", async ({ page }) => {
    const st = await montar(page);
    await page.goto("/pit-stop/7");
    const chip = page.getByTestId("chip-103");
    await chip.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await chip.tap();
    const dlg = page.getByTestId("mover-dialog");
    await expect(dlg.getByTestId("mover-data")).toHaveValue(dia(24));
    await expect(dlg.getByTestId("mover-hora")).toHaveValue("09:00");
    expect(st.moverChamadas).toHaveLength(0);
  });
});

test.describe("Pit Stop: encaixe da 1ª sessão no término da consulta", () => {
  test("sem vaga hoje: avisa, não altera nada e oferece vagas reais; depois encaixa e marca como encaixe", async ({ page }) => {
    const st = await montar(page);
    await page.goto("/pit-stop/7");
    await page.getByTestId("encaixe-abrir").click();
    await page.getByTestId("encaixe-termino").fill("12:00");
    await page.getByTestId("encaixe-achar").click();
    const erro = page.getByTestId("encaixe-erro");
    await expect(erro).toHaveAttribute("data-code", "sem_vaga_no_termino");
    await expect(erro).toContainText("Nada foi alterado");
    await expect(erro.getByRole("button")).toHaveCount(1);
    expect(st.encaixeChamadas[0]).toEqual({ versao: 3, horaTermino: "12:00", aceitarForaDaJanela: false });
    expect(st.ocs[0]!.data).toBe(dia(10));
    // Agora há vaga: encaixa; a visita ganha o selo "Encaixe hoje" e o plano continua sem reservar nada.
    st.encaixeModo = "ok";
    await page.getByTestId("encaixe-termino").fill("09:15");
    await page.getByTestId("encaixe-achar").click();
    await expect(page.getByTestId("encaixe-painel")).toHaveCount(0);
    await expect(page.getByTestId("ocorrencia-101")).toContainText("Encaixe hoje");
    await expect(page.getByTestId("ocorrencia-101")).toContainText("09:30");
    await expect(page.getByRole("button", { name: "Confirmar e reservar" })).toBeVisible();
  });

  test("fora da janela de 4 dias: encaixe só segue com o aceite explícito", async ({ page }) => {
    const st = await montar(page);
    st.encaixeModo = "aceite";
    await page.goto("/pit-stop/7");
    await page.getByTestId("encaixe-abrir").click();
    await page.getByTestId("encaixe-achar").click();
    await expect(page.getByTestId("encaixe-erro")).toHaveAttribute("data-code", "fora_da_janela_exige_aceite");
    await expect(page.getByTestId("encaixe-achar")).toBeDisabled();
    await page.getByTestId("encaixe-aceite").check();
    await page.getByTestId("encaixe-achar").click();
    await expect(page.getByTestId("ocorrencia-101")).toContainText("Encaixe hoje");
    expect(st.encaixeChamadas.at(-1)).toMatchObject({ aceitarForaDaJanela: true });
    expect(st.encaixeChamadas[0]).not.toHaveProperty("horaTermino"); // em branco = agora (Brasília), decidido pelo servidor
  });
});
