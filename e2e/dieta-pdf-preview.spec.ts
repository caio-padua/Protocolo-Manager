/**
 * Task #223 — Confirmar que o PDF abre na nova aba antes de o CEO poder enviar o e-mail
 *
 * Fluxo:
 *  1. CEO marca "Enviar por e-mail" e clica "Gerar PDF para Revisão"
 *  2. O código abre window.open("about:blank") de forma SÍNCRONA (antes do fetch)
 *     para não ser bloqueado pelo popup blocker do browser.
 *  3. Após o PDF ser gerado, a nova aba recebe o blob via location.href.
 *  4. O painel "Revisar e confirmar envio" aparece com o botão "Confirmar envio".
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
});
