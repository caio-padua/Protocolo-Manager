/**
 * Task #291 — Confirm that inserting a recipe respects the IF window and warns before saving
 * Task #223 — Confirmar que o PDF abre na nova aba antes de o CEO poder enviar o e-mail
 * Task #244 — Confirmar que o painel de e-mail mostra o nome correto do paciente
 *             quando o popup foi bloqueado
 *
 * Fluxo (happy path):
 *  1. CEO marca "Enviar por e-mail" e clica "Gerar PDF para Revisão"
 *  2. O código abre window.open("about:blank") de forma SÍNCRONA (antes do fetch)
 *     para não ser bloqueado pelo popup blocker do browser.
 *  3. Após o PDF ser gerado, a nova aba recebe o blob via location.href.
 *  4. O painel "Revisar e confirmar envio" aparece com o botão "Confirmar envio".
 *
 * Fluxo (popup bloqueado):
 *  1. window.open é sobrescrito para retornar null (simula bloqueio de popup).
 *  2. O código detecta pdfWinRef.current === null e aciona o download via <a>.
 *  3. O painel de confirmação deve exibir:
 *     — ícone de Download (não Eye)
 *     — texto "PDF foi baixado" + "popup bloqueado"
 *     — nome do paciente selecionado (Ana Silva)
 *     — calorias alvo calculadas
 *
 * Estratégia: mocks de rota para todas as chamadas à API, de modo que o teste
 * não dependa de dados reais nem de geração de PDF (~90 s) com IA.
 */

import { test, expect } from "@playwright/test";

// Bytes de um PDF mínimo e válido (1 página vazia).
// O browser aceita como application/pdf e URL.createObjectURL não falha.
const MINIMAL_PDF_BYTES = Buffer.from(
  "%PDF-1.4\n" +
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n" +
  "xref\n0 4\n" +
  "0000000000 65535 f \n" +
  "0000000009 00000 n \n" +
  "0000000058 00000 n \n" +
  "0000000115 00000 n \n" +
  "trailer<</Size 4/Root 1 0 R>>\n" +
  "startxref\n190\n%%EOF\n"
);

test.describe("Dieta — PDF preview + confirmação de e-mail", () => {
  test.beforeEach(async ({ page }) => {
    // Injeta token falso de colaborador no localStorage antes de qualquer
    // navegação, para que o CollaboratorGate passe na validação.
    await page.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "e2e-fake-token");
      localStorage.setItem(
        "padcom_collab_prof",
        JSON.stringify({ id: 1, name: "Dr. Caio", role: "medico" })
      );
    });

    // --- Mocks de API -----------------------------------------------------------

    // CollaboratorGate valida o token via GET /api/collaborator/me
    await page.route("**/api/collaborator/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          professional: { id: 1, name: "Dr. Caio", role: "medico" },
        }),
      })
    );

    // Lista de clientes (PaxterClientSelector)
    await page.route("**/api/clients*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 42,
            name: "Ana Silva",
            cpf: "123.456.789-00",
            phone: "(11) 91234-5678",
            photoUrl: null,
          },
        ]),
      })
    );

    // Endpoints usados pela aba mas não pelo fluxo testado
    await page.route("**/api/dieta/catalogo/alimentos", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.route("**/api/dieta/receitas", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.route("**/api/dieta/indicacoes*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.route("**/api/dieta/planos-emitidos*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.route("**/api/dieta/prescricoes*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    // POST /api/dieta/emitir-pdf → devolve um PDF mínimo com delay intencional.
    //
    // O delay cria uma janela de tempo em que:
    //   • a nova aba já foi aberta (window.open é síncrono)
    //   • o fetch ainda está em andamento → tab permanece em about:blank
    //   • "Confirmar envio" NÃO deve aparecer ainda
    //
    // Isso permite ao teste provar a ordenação: o botão só pode aparecer DEPOIS
    // que o PDF foi aberto na nova aba (tab navega para blob:), não antes.
    await page.route("**/api/dieta/emitir-pdf", async (route) => {
      // 800 ms de janela: tempo suficiente para o Playwright verificar o estado
      // intermediário sem tornar o teste lento demais.
      await new Promise<void>((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: MINIMAL_PDF_BYTES,
      });
    });
  });

  test(
    "nova aba abre com o PDF e o painel 'Confirmar envio' aparece em seguida",
    async ({ page, context }) => {
      // ── 1. Navega para a página de Dieta ─────────────────────────────────
      await page.goto("/dieta");

      // Aguarda a página carregar (CollaboratorGate pode fazer redirect se o
      // mock falhar, portanto validamos um heading visível)
      await expect(page.getByText("Órgão Dieta")).toBeVisible({ timeout: 10_000 });

      // ── 2. Preenche os campos antropométricos (obrigatórios para emitir) ──
      // Field envolve o input numa <label> — getByLabel funciona por containment.
      await page.getByLabel("Peso (kg)").fill("75");
      await page.getByLabel("Altura (cm)").fill("175");
      // "Idade" é substring de "Nível de atividade" em português — usar exact:true
      await page.getByLabel("Idade", { exact: true }).fill("35");

      // ── 3. Marca "Enviar por e-mail" ──────────────────────────────────────
      // O checkbox de e-mail é o único da seção de emissão de PDF
      await page
        .locator('label:has(input[type="checkbox"])')
        .filter({ hasText: /Enviar por e-mail/i })
        .locator('input[type="checkbox"]')
        .check();

      // ── 4. Seleciona um cliente no PaxterClientSelector ───────────────────
      // O botão Popover fica dentro de um <label>Cliente</label>, então seu
      // accessible name é "Cliente" (não "Selecionar cliente…") — usar
      // hasText para localizar pelo conteúdo visual interno do botão.
      await page.locator('button', { hasText: /Selecionar cliente/i }).click();

      // Aguarda o popover abrir com o cliente mockado e clica
      await page.getByText("Ana Silva").first().click();

      // ── 5. Confirma que o botão de emissão está habilitado ────────────────
      const gerarBtn = page.getByRole("button", { name: /Gerar PDF para Revisão/i });
      await expect(gerarBtn).toBeEnabled({ timeout: 5_000 });

      // ── 6. Escuta nova aba ANTES de clicar — window.open é síncrono ───────
      // O código faz window.open("about:blank", "_blank") de forma SÍNCRONA
      // antes do fetch, para não ser bloqueado pelo popup blocker. Registrar
      // o listener antes do clique garante que não perdemos o evento.
      const newPagePromise = context.waitForEvent("page", { timeout: 10_000 });

      // ── 7. Clica em "Gerar PDF para Revisão" ──────────────────────────────
      await gerarBtn.click();

      // ── 8a. Nova aba abre imediatamente (window.open é síncrono) ─────────
      const newTab = await newPagePromise;
      expect(newTab).toBeTruthy();

      // ── 8b. PROVA DE ORDENAÇÃO: durante o fetch em andamento (800 ms) ─────
      //
      // O mock do POST /api/dieta/emitir-pdf tem 800 ms de delay intencional.
      // Nesse intervalo:
      //   • a nova aba foi criada mas ainda está em "about:blank"
      //   • setPendingEmail() ainda NÃO foi chamado
      //   • o botão "Confirmar envio" NÃO deve estar visível
      //
      // Esta verificação falha se o código chamar setPendingEmail() antes de
      // atribuir location.href (ou se o painel aparecer sem a aba navegar).
      expect(newTab.url()).toBe("about:blank");
      await expect(
        page.getByRole("button", { name: /Confirmar envio/i })
      ).not.toBeVisible();

      // ── 8c. Aguarda a aba navegar para o blob: URL ────────────────────────
      // Depois que o fetch conclui, o código faz:
      //   pdfWinRef.current.location.href = URL.createObjectURL(blob)
      //   setPendingEmail({ ... })
      // A navegação para blob: acontece ANTES de setPendingEmail retornar no
      // ciclo React, provando que o PDF foi aberto antes do painel aparecer.
      await newTab.waitForURL(/^blob:/, { timeout: 10_000 });

      // ── 9. Confirma que o painel de confirmação aparece na aba principal ──
      // Agora — e só agora — "Confirmar envio" pode estar visível.
      await expect(
        page.getByRole("button", { name: /Confirmar envio/i })
      ).toBeVisible({ timeout: 10_000 });

      // O botão "Gerar PDF para Revisão" fica desabilitado enquanto há envio
      // pendente (disabled={!!pendingEmail}), prevenindo duplo envio.
      await expect(gerarBtn).toBeDisabled();
    }
  );

  // ---------------------------------------------------------------------------
  // Task #244 — popup bloqueado: o painel deve mostrar nome correto + kcal
  // ---------------------------------------------------------------------------
  test(
    "popup bloqueado: painel exibe ícone Download, 'PDF foi baixado', nome do paciente e calorias",
    async ({ page }) => {
      // ── 0. Simula popup blocker: window.open retorna null ─────────────────
      // addInitScript executa ANTES de qualquer script da página, então a
      // sobrescrita é garantida mesmo que o componente use window.open no mount.
      await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).open = () => null;
      });

      // ── 1. Navega para a página de Dieta ─────────────────────────────────
      await page.goto("/dieta");
      await expect(page.getByText("Órgão Dieta")).toBeVisible({ timeout: 10_000 });

      // ── 2. Preenche dados antropométricos ─────────────────────────────────
      // Peso 75 kg → fallback de calorias = 75 × 25 = 1875 kcal
      await page.getByLabel("Peso (kg)").fill("75");
      await page.getByLabel("Altura (cm)").fill("175");
      await page.getByLabel("Idade", { exact: true }).fill("35");

      // ── 3. Marca "Enviar por e-mail" ──────────────────────────────────────
      await page
        .locator('label:has(input[type="checkbox"])')
        .filter({ hasText: /Enviar por e-mail/i })
        .locator('input[type="checkbox"]')
        .check();

      // ── 4. Seleciona o cliente "Ana Silva" ────────────────────────────────
      await page.locator('button', { hasText: /Selecionar cliente/i }).click();
      await page.getByText("Ana Silva").first().click();

      // ── 5. Garante que o botão de emissão está habilitado ─────────────────
      const gerarBtn = page.getByRole("button", { name: /Gerar PDF para Revisão/i });
      await expect(gerarBtn).toBeEnabled({ timeout: 5_000 });

      // ── 6. Clica em "Gerar PDF para Revisão" ──────────────────────────────
      // Com window.open retornando null, o código detecta pdfWinRef.current === null
      // e entra no branch de fallback (download via <a>). Nenhuma nova aba abre.
      await gerarBtn.click();

      // ── 7. Aguarda o painel de confirmação aparecer ───────────────────────
      const confirmarBtn = page.getByRole("button", { name: /Confirmar envio/i });
      await expect(confirmarBtn).toBeVisible({ timeout: 15_000 });

      // Âncora: o painel panel-3d-sub que contém o botão "Confirmar envio".
      // Escopo estrito evita colisão com a toast notification que também
      // aparece ao mesmo tempo.
      const painel = page.locator("div").filter({ has: confirmarBtn }).first();

      // ── 8. Verifica: cabeçalho "Revisar e confirmar envio" e ícone Download ─
      // O ícone tem aria-label="PDF baixado" quando usedFallbackDownload=true;
      // o caminho normal usa aria-label="PDF aberto em nova aba" (Eye).
      await expect(painel.getByText(/Revisar e confirmar envio/i)).toBeVisible();
      await expect(painel.locator('[aria-label="PDF baixado"]')).toBeVisible();
      await expect(painel.locator('[aria-label="PDF aberto em nova aba"]')).not.toBeVisible();

      // ── 9. Verifica: texto "PDF foi baixado" e "popup bloqueado" no painel ─
      await expect(painel.getByText(/baixado/i).first()).toBeVisible();
      await expect(painel.getByText(/popup bloqueado/i)).toBeVisible();

      // ── 10. Verifica: nome do paciente "Ana Silva" no texto de confirmação ──
      // O painel renderiza: <span class="font-bold">Enviar para Ana Silva?</span>
      // Usar a frase completa evita colisão com o botão PaxterClientSelector.
      await expect(page.getByText(/Enviar para Ana Silva/i)).toBeVisible();

      // ── 11. Verifica: calorias alvo exibidas (fallback = 75 × 25 = 1875) ──
      // A linha exibe: "Plano: <b>1875 kcal</b>"
      await expect(painel.getByText(/1875/)).toBeVisible();
      await expect(painel.getByText(/kcal/i).first()).toBeVisible();

      // ── 12. Botão "Gerar PDF para Revisão" fica desabilitado (duplo envio) ─
      await expect(gerarBtn).toBeDisabled();
    }
  );

  // ---------------------------------------------------------------------------
  // Task #291 — inserirReceita fora da janela de JI: aviso e salvamento bloqueado
  // ---------------------------------------------------------------------------
  test(
    "inserir receita em refeição fora da janela de jejum: avisa e bloqueia salvamento",
    async ({ page }) => {
      // Sobrescreve o mock de receitas para retornar 1 receita com 1 ingrediente.
      // Playwright usa ordem LIFO nas rotas, então este override vence o beforeEach.
      await page.route("**/api/dieta/receitas", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: 1,
              nome: "Omelete Fit",
              porcoes: 1,
              tipos: [],
              ingredientes: [
                { alimentoId: 99, alimentoNome: "Ovo", quantidadeG: 120 },
              ],
            },
          ]),
        })
      );

      // ── 1. Navega para a página de Dieta ─────────────────────────────────
      await page.goto("/dieta");
      await expect(page.getByText("Órgão Dieta")).toBeVisible({ timeout: 10_000 });

      // ── 2. Ativa o Jejum Intermitente (padrão: 12:00–20:00) ──────────────
      // O toggle usa role=switch implícito via aria-checked; clicar ativa.
      const jejumToggle = page.locator('[aria-checked]').filter({ hasText: /jejum/i });
      // O toggle pode ser o elemento pai ou o próprio div; usar o botão clicável.
      await page.locator('[aria-checked="false"]').first().click();
      // Confirma que o toggle ficou ativo (aria-checked="true")
      await expect(page.locator('[aria-checked="true"]').first()).toBeVisible({ timeout: 3_000 });

      // ── 3. Abre o painel "Inserir receita" ───────────────────────────────
      await page.getByRole("button", { name: /Inserir receita/i }).click();
      await expect(page.getByText("Inserir receita no cardápio")).toBeVisible({ timeout: 3_000 });

      // ── 4. Seleciona a receita "Omelete Fit" ─────────────────────────────
      // O Select usa SelectTrigger com placeholder "Selecionar receita…"
      await page.getByRole("combobox").filter({ hasText: /Selecionar receita/i }).click();
      await page.getByRole("option", { name: /Omelete Fit/i }).click();

      // ── 5. Muda a refeição para "Café da manhã" (08:00 — fora de 12:00–20:00)
      // O segundo combobox no painel é o seletor de refeição (padrão = Almoço)
      await page.getByRole("combobox").filter({ hasText: /Almoço/i }).click();
      await page.getByRole("option", { name: /Café da manhã/i }).click();

      // ── 6. Clica "Inserir" ────────────────────────────────────────────────
      await page.getByRole("button", { name: /^Inserir$/i }).click();

      // ── 7. Toast destrutivo com aviso de jejum ────────────────────────────
      // O toast usa variant="destructive" e title "⚠️ Refeição fora do jejum".
      // getByText pode resolver 2 nós (title + aria-live span) → .first() evita strict-mode.
      await expect(page.getByText(/Refeição fora do jejum/i).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/Café da manhã/i).first()).toBeVisible();

      // ── 8. Banner amber aparece na tabela ────────────────────────────────
      await expect(
        page.getByText(/Há refeições fora da janela de jejum/i)
      ).toBeVisible({ timeout: 5_000 });

      // ── 9. Botão "Salvar prescrição" permanece desabilitado ───────────────
      // algumForaJanela=true → podeSalvar=false → disabled
      await expect(
        page.getByRole("button", { name: /Salvar prescrição/i })
      ).toBeDisabled();
    }
  );
});
