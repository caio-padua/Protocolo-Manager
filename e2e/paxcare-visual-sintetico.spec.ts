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

async function simular(page: Page) {
  await page.route("**/api/**", async (route) => {
    const u = new URL(route.request().url()); const p = u.pathname.replace(/^.*\/api\//, "/");
    const j = (b: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/area-paciente/login")) return j({ token: "tok-sintetico", ...CLIENTE });
    if (p.includes("/area-paciente/sessao")) return j({ error: "sem sessão" }, 401);
    if (p.endsWith("/medicacoes/adesao")) return j({
      data: "2026-11-27", adesao: { prescrita: lista(7), propria: lista(7) },
      hoje: [{ origem: "prescrita", nome: "Fórmula Sintética", nomeChave: "formula sintetica", dose: "1 cápsula", sigla: "IM", periodoNome: "Início da Manhã", status: null },
             { origem: "propria", nome: "Vitamina Sintética", nomeChave: "vitamina sintetica", dose: "1 mg", sigla: "NO", periodoNome: "Noite", status: "tomei" }] });
    if (p.endsWith("/medicacoes")) return j({ prescritas: [], proprias: [], clinicas: [], lembretePendente: false, consentimento: { hash: "x", texto: "Texto sintético" }, opcoes: { periodos: [], refeicoes: [], unidades: [] } });
    if (p.endsWith("/area-paciente/pre-cadastro")) return j({ completo: true, valores: {}, faltando: [] });
    if (p.includes("/area-paciente/")) return j({});
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

for (const [nome, vp] of [["desktop", { width: 1280, height: 800 }], ["celular", { width: 390, height: 844 }]] as const) {
  test(`PAXCARE logado (${nome})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await entrar(page);
    await page.screenshot({ path: `e2e/evidencias/paxcare-home-${nome}.png`, fullPage: true });
    console.log("BOTOES", JSON.stringify((await page.locator("button").allInnerTexts()).slice(0, 40)));
  });
}
