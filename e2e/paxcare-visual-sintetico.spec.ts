/**
 * Prova visual do PAXCARE com conta SINTÉTICA. Todas as chamadas /api são simuladas no navegador (page.route):
 * nenhum banco, serviço externo, mensagem ou cobrança real é tocado. Prova a TELA, não o servidor
 * (o servidor é provado pelos testes de API com banco descartável).
 */
import { test, expect, type Page } from "@playwright/test";

const CLIENTE = { id: 9001, name: "Cliente Sintético", cpf: "00000000000", email: null, mustChangePassword: false };
const janela = (dias: number, tomei: number, esqueci: number, esperado: number, semHist: number) => ({
  dias, tomei, esqueci, esperado, semRegistro: Math.max(0, esperado - tomei - esqueci),
  percentual: esperado ? Math.round((tomei / esperado) * 1000) / 10 : null,
  diasComHistorico: dias - semHist, diasSemHistorico: semHist, suspenso: 2, retirado: 1, diasSuspensos: 1,
});
const lista = (hist: number) => ({
  esperadoPorDia: 2, janelas: [janela(7, 5, 2, 10, 0), janela(15, 5, 2, 10, 8), janela(30, 5, 2, 10, 23)],
  historico: Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 27 - (29 - i))).toISOString().slice(0, 10);
    return i >= 30 - hist ? { data: d, tomei: 1, esqueci: 0, esperado: 2, comHistorico: true, suspenso: 0, retirado: 0 } : { data: d, tomei: 0, esqueci: 0, esperado: 0, comHistorico: false };
  }),
});

const PLANO = { id: 1, nome: "Plano Sintético", descricao: "Plano de teste", gratuito: false, precoCentavos: 2990, periodicidade: "mensal", franquiaQtd: 10, franquiaUnidade: "mensagens", franquiaPeriodo: "mes", precoExcedenteCentavos: 100, descontoExcedentePct: null, beneficios: ["Benefício sintético A"], termoAceite: "Termo sintético", termoHash: "h" };
const erros: string[] = [];
const pedidosExclusao: unknown[] = []; const exclusoes: number[] = [];
async function simular(page: Page, opts: { hojeVazio?: boolean } = {}) {
  page.on("pageerror", (e) => erros.push(String(e.message)));
  await page.route("**/api/**", async (route) => {
    const u = new URL(route.request().url()); const p = u.pathname.replace(/^.*\/api\//, "/");
    const j = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/area-paciente/login")) return j({ token: "tok-sintetico", ...CLIENTE });
    if (p.includes("/area-paciente/sessao")) return j({ ok: true });
    if (p.endsWith("/area-paciente/pre-cadastro")) return j({ completo: true, valores: {}, faltando: [] });
    if (p.endsWith("/area-paciente/resumo")) return j({ client: { name: "Cliente Sintético" }, protocolsCount: 1, activeProtocolsCount: 1, totalSessions: 8, completedSessions: 3, nextSession: null });
    if (p.endsWith("/medicacoes/adesao")) return j({
      data: "2026-11-27", adesao: { prescrita: lista(7), propria: lista(7) },
      hoje: opts.hojeVazio ? [] : [{ origem: "prescrita", nome: "Fórmula Sintética", nomeChave: "formula sintetica", dose: "1 cápsula", sigla: "IM", periodoNome: "Início da Manhã", status: null },
             { origem: "propria", nome: "Vitamina Sintética", nomeChave: "vitamina sintetica", dose: "1 mg", sigla: "NO", periodoNome: "Noite", status: "tomei" }] });
    if (p.endsWith("/area-paciente/medicacoes")) return j({ lembretePendente: false, prescritas: [{ nome: "Fórmula Sintética", dose: "1 cápsula", observacao: null, periodos: ["Início da Manhã"] }],
      proprias: [{ id: 1, nome: "Vitamina Sintética", estado: "validada", pausada: false, doseValor: 1, doseUnidade: "mg", refeicao: "com", observacao: null, periodos: [], motivoRecusa: null }],
      clinicas: [{ empresaId: 1, nome: "Clínica Sintética A", cidade: "Cidade", estado: "SP", consentido: true }], consentimento: { versao: "1", texto: "Texto sintético", hash: "x" } });
    if (p.endsWith("/paxcare/cofre")) return j({ itens: [], examesDaClinica: [], clinicaOrigem: { nome: "Clínica Sintética A" } });
    if (p.endsWith("/paxcare/clinicas")) return j({ vinculos: [], disponiveis: [{ id: 1, nome: "Clínica Sintética A", local: "Cidade" }] });
    if (p.endsWith("/paxcare/planos")) return j({ planos: [PLANO], aviso: "Aviso sintético" });
    if (p.endsWith("/paxcare/assinatura")) return j({ assinatura: null });
    if (p.endsWith("/conta/pedido-exclusao")) { pedidosExclusao.push(route.request().postDataJSON()); return j({ confirmacaoToken: "exclusao-sintetico" }); }
    if (p.endsWith("/area-paciente/conta") && route.request().method() === "DELETE") { exclusoes.push(1); return j({ ok: true }); }
    if (p.endsWith("/conta/aviso-exclusao")) return j({ removidos: ["Dados de acesso"], mantidos: ["Registros clínicos exigidos por lei"], observacao: "Texto sintético" });
    if (p.endsWith("/area-paciente/exames")) return j([{ id: 1, token: "v1.sintetico.assinatura", tipo: "SANGUE", fileName: "pedido-sintetico.pdf", examCount: 3, observacao: null, createdAt: "2026-11-20T12:00:00Z" }]);
    if (p.endsWith("/area-paciente/documentos")) return j({ ras: [], protocols: [] });
    if (p.includes("/pedidos-medicos")) return j(p.endsWith("/pedidos-medicos") ? [] : {});
    if (p.includes("/exames-avulsos")) return j(p.endsWith("/catalogo") ? { itens: [] } : []);
    if (p.endsWith("/area-paciente/financeiro")) return j({ totalPago: 0, totalPendente: 0, payments: [] });
    return j({});
  });
}

async function entrar(page: Page) {
  await simular(page);
  await page.goto("/area");
  await page.getByRole("button", { name: /entrar com senha/i }).click();
  await page.locator("input").nth(0).fill("00000000000");
  await page.locator('input[type="password"]').fill("SenhaSintetica#1");
  await page.getByRole("button", { name: /^entrar$/i }).click();
  await page.waitForTimeout(2500);
}

const ABAS = ["INÍCIO", "PAXCARE", "MEU PLANO / CONTA", "DOCUMENTOS"];
for (const [nome, vp] of [["desktop", { width: 1280, height: 900 }], ["celular", { width: 390, height: 844 }]] as const) {
  test(`PAXCARE logado (${nome})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await entrar(page);
    await page.screenshot({ path: `e2e/evidencias/${nome}-1-inicio.png`, fullPage: true });
    const rotulos = (await page.locator("button, a").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    console.log("ROTULOS", nome, JSON.stringify(rotulos.slice(0, 40)));
    let i = 2;
    for (const aba of ["PAXCARE", "MEU PLANO / CONTA", "DOCUMENTOS", "PREMIUM"]) {
      const alvo = page.getByRole("button", { name: new RegExp(aba.replace("/", "\\/"), "i") }).first();
      if (!(await alvo.count())) { console.log("ABA NAO ENCONTRADA", nome, aba); continue; }
      await alvo.click(); await page.waitForTimeout(1500);
      await page.screenshot({ path: `e2e/evidencias/${nome}-${i++}-${aba.split(" ")[0].toLowerCase()}.png`, fullPage: true });
      console.log("ABA OK", nome, aba, "| overlay de erro:", await page.locator("vite-error-overlay").count());
    }
    console.log("ERROS DE PAGINA", nome, JSON.stringify(erros));
    expect(erros).toEqual([]);
  });
}

test("exclusão de conta DESCARTÁVEL (celular): exige a palavra EXCLUIR, reautentica e volta ao login", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page);
  await page.getByRole("button", { name: /meu plano \/ conta/i }).first().click();
  await page.waitForTimeout(1200);
  const botao = page.getByRole("button", { name: /excluir minha conta/i });
  await expect(botao).toBeDisabled();                       // sem a palavra, o botão não age
  const campos = page.locator("input");
  await campos.nth(await campos.count() - 2).fill("SenhaSintetica#1");
  await campos.nth(await campos.count() - 1).fill("EXCLUIR");
  await expect(botao).toBeEnabled();
  await page.screenshot({ path: "e2e/evidencias/celular-5-exclusao-pronta.png" });
  await botao.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "e2e/evidencias/celular-6-apos-exclusao.png" });
  console.log("PEDIDOS", pedidosExclusao.length, "EXCLUSOES", exclusoes.length, "voltou ao login:", await page.getByText("IDENTIFICAÇÃO").count());
  expect(pedidosExclusao.length).toBe(1);
  expect(exclusoes.length).toBe(1);
});
