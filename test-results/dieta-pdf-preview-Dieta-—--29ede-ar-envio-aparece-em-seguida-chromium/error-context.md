# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dieta-pdf-preview.spec.ts >> Dieta — PDF preview + confirmação de e-mail >> nova aba abre com o PDF e o painel 'Confirmar envio' aparece em seguida
- Location: e2e/dieta-pdf-preview.spec.ts:113:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:18148/dieta
Call log:
  - navigating to "http://localhost:18148/dieta", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This site can’t be reached" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: localhost
      - text: refused to connect.
    - generic [ref=e10]:
      - paragraph [ref=e11]: "Try:"
      - list [ref=e12]:
        - listitem [ref=e13]: Checking the connection
        - listitem [ref=e14]:
          - link "Checking the proxy and the firewall" [ref=e15] [cursor=pointer]:
            - /url: "#buttons"
    - generic [ref=e16]: ERR_CONNECTION_REFUSED
  - generic [ref=e17]:
    - button "Reload" [ref=e19] [cursor=pointer]
    - button "Details" [ref=e20] [cursor=pointer]
```

# Test source

```ts
  17  | // Bytes de um PDF mínimo e válido (1 página vazia).
  18  | // O browser aceita como application/pdf e URL.createObjectURL não falha.
  19  | const MINIMAL_PDF_BYTES = Buffer.from(
  20  |   "%PDF-1.4\n" +
  21  |   "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  22  |   "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  23  |   "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n" +
  24  |   "xref\n0 4\n" +
  25  |   "0000000000 65535 f \n" +
  26  |   "0000000009 00000 n \n" +
  27  |   "0000000058 00000 n \n" +
  28  |   "0000000115 00000 n \n" +
  29  |   "trailer<</Size 4/Root 1 0 R>>\n" +
  30  |   "startxref\n190\n%%EOF\n"
  31  | );
  32  | 
  33  | test.describe("Dieta — PDF preview + confirmação de e-mail", () => {
  34  |   test.beforeEach(async ({ page }) => {
  35  |     // Injeta token falso de colaborador no localStorage antes de qualquer
  36  |     // navegação, para que o CollaboratorGate passe na validação.
  37  |     await page.addInitScript(() => {
  38  |       localStorage.setItem("padcom_collab_token", "e2e-fake-token");
  39  |       localStorage.setItem(
  40  |         "padcom_collab_prof",
  41  |         JSON.stringify({ id: 1, name: "Dr. Caio", role: "medico" })
  42  |       );
  43  |     });
  44  | 
  45  |     // --- Mocks de API -----------------------------------------------------------
  46  | 
  47  |     // CollaboratorGate valida o token via GET /api/collaborator/me
  48  |     await page.route("**/api/collaborator/me", (route) =>
  49  |       route.fulfill({
  50  |         status: 200,
  51  |         contentType: "application/json",
  52  |         body: JSON.stringify({
  53  |           professional: { id: 1, name: "Dr. Caio", role: "medico" },
  54  |         }),
  55  |       })
  56  |     );
  57  | 
  58  |     // Lista de clientes (PaxterClientSelector)
  59  |     await page.route("**/api/clients*", (route) =>
  60  |       route.fulfill({
  61  |         status: 200,
  62  |         contentType: "application/json",
  63  |         body: JSON.stringify([
  64  |           {
  65  |             id: 42,
  66  |             name: "Ana Silva",
  67  |             cpf: "123.456.789-00",
  68  |             phone: "(11) 91234-5678",
  69  |             photoUrl: null,
  70  |           },
  71  |         ]),
  72  |       })
  73  |     );
  74  | 
  75  |     // Endpoints usados pela aba mas não pelo fluxo testado
  76  |     await page.route("**/api/dieta/catalogo/alimentos", (route) =>
  77  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  78  |     );
  79  |     await page.route("**/api/dieta/receitas", (route) =>
  80  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  81  |     );
  82  |     await page.route("**/api/dieta/indicacoes*", (route) =>
  83  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  84  |     );
  85  |     await page.route("**/api/dieta/planos-emitidos*", (route) =>
  86  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  87  |     );
  88  |     await page.route("**/api/dieta/prescricoes*", (route) =>
  89  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  90  |     );
  91  | 
  92  |     // POST /api/dieta/emitir-pdf → devolve um PDF mínimo com delay intencional.
  93  |     //
  94  |     // O delay cria uma janela de tempo em que:
  95  |     //   • a nova aba já foi aberta (window.open é síncrono)
  96  |     //   • o fetch ainda está em andamento → tab permanece em about:blank
  97  |     //   • "Confirmar envio" NÃO deve aparecer ainda
  98  |     //
  99  |     // Isso permite ao teste provar a ordenação: o botão só pode aparecer DEPOIS
  100 |     // que o PDF foi aberto na nova aba (tab navega para blob:), não antes.
  101 |     await page.route("**/api/dieta/emitir-pdf", async (route) => {
  102 |       // 800 ms de janela: tempo suficiente para o Playwright verificar o estado
  103 |       // intermediário sem tornar o teste lento demais.
  104 |       await new Promise<void>((r) => setTimeout(r, 800));
  105 |       await route.fulfill({
  106 |         status: 200,
  107 |         contentType: "application/pdf",
  108 |         body: MINIMAL_PDF_BYTES,
  109 |       });
  110 |     });
  111 |   });
  112 | 
  113 |   test(
  114 |     "nova aba abre com o PDF e o painel 'Confirmar envio' aparece em seguida",
  115 |     async ({ page, context }) => {
  116 |       // ── 1. Navega para a página de Dieta ─────────────────────────────────
> 117 |       await page.goto("/dieta");
      |                  ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:18148/dieta
  118 | 
  119 |       // Aguarda a página carregar (CollaboratorGate pode fazer redirect se o
  120 |       // mock falhar, portanto validamos um heading visível)
  121 |       await expect(page.getByText("Órgão Dieta")).toBeVisible({ timeout: 10_000 });
  122 | 
  123 |       // ── 2. Preenche os campos antropométricos (obrigatórios para emitir) ──
  124 |       // Field envolve o input numa <label> — getByLabel funciona por containment.
  125 |       await page.getByLabel("Peso (kg)").fill("75");
  126 |       await page.getByLabel("Altura (cm)").fill("175");
  127 |       // "Idade" é substring de "Nível de atividade" em português — usar exact:true
  128 |       await page.getByLabel("Idade", { exact: true }).fill("35");
  129 | 
  130 |       // ── 3. Marca "Enviar por e-mail" ──────────────────────────────────────
  131 |       // O checkbox de e-mail é o único da seção de emissão de PDF
  132 |       await page
  133 |         .locator('label:has(input[type="checkbox"])')
  134 |         .filter({ hasText: /Enviar por e-mail/i })
  135 |         .locator('input[type="checkbox"]')
  136 |         .check();
  137 | 
  138 |       // ── 4. Seleciona um cliente no PaxterClientSelector ───────────────────
  139 |       // O botão Popover fica dentro de um <label>Cliente</label>, então seu
  140 |       // accessible name é "Cliente" (não "Selecionar cliente…") — usar
  141 |       // hasText para localizar pelo conteúdo visual interno do botão.
  142 |       await page.locator('button', { hasText: /Selecionar cliente/i }).click();
  143 | 
  144 |       // Aguarda o popover abrir com o cliente mockado e clica
  145 |       await page.getByText("Ana Silva").first().click();
  146 | 
  147 |       // ── 5. Confirma que o botão de emissão está habilitado ────────────────
  148 |       const gerarBtn = page.getByRole("button", { name: /Gerar PDF para Revisão/i });
  149 |       await expect(gerarBtn).toBeEnabled({ timeout: 5_000 });
  150 | 
  151 |       // ── 6. Escuta nova aba ANTES de clicar — window.open é síncrono ───────
  152 |       // O código faz window.open("about:blank", "_blank") de forma SÍNCRONA
  153 |       // antes do fetch, para não ser bloqueado pelo popup blocker. Registrar
  154 |       // o listener antes do clique garante que não perdemos o evento.
  155 |       const newPagePromise = context.waitForEvent("page", { timeout: 10_000 });
  156 | 
  157 |       // ── 7. Clica em "Gerar PDF para Revisão" ──────────────────────────────
  158 |       await gerarBtn.click();
  159 | 
  160 |       // ── 8a. Nova aba abre imediatamente (window.open é síncrono) ─────────
  161 |       const newTab = await newPagePromise;
  162 |       expect(newTab).toBeTruthy();
  163 | 
  164 |       // ── 8b. PROVA DE ORDENAÇÃO: durante o fetch em andamento (800 ms) ─────
  165 |       //
  166 |       // O mock do POST /api/dieta/emitir-pdf tem 800 ms de delay intencional.
  167 |       // Nesse intervalo:
  168 |       //   • a nova aba foi criada mas ainda está em "about:blank"
  169 |       //   • setPendingEmail() ainda NÃO foi chamado
  170 |       //   • o botão "Confirmar envio" NÃO deve estar visível
  171 |       //
  172 |       // Esta verificação falha se o código chamar setPendingEmail() antes de
  173 |       // atribuir location.href (ou se o painel aparecer sem a aba navegar).
  174 |       expect(newTab.url()).toBe("about:blank");
  175 |       await expect(
  176 |         page.getByRole("button", { name: /Confirmar envio/i })
  177 |       ).not.toBeVisible();
  178 | 
  179 |       // ── 8c. Aguarda a aba navegar para o blob: URL ────────────────────────
  180 |       // Depois que o fetch conclui, o código faz:
  181 |       //   pdfWinRef.current.location.href = URL.createObjectURL(blob)
  182 |       //   setPendingEmail({ ... })
  183 |       // A navegação para blob: acontece ANTES de setPendingEmail retornar no
  184 |       // ciclo React, provando que o PDF foi aberto antes do painel aparecer.
  185 |       await newTab.waitForURL(/^blob:/, { timeout: 10_000 });
  186 | 
  187 |       // ── 9. Confirma que o painel de confirmação aparece na aba principal ──
  188 |       // Agora — e só agora — "Confirmar envio" pode estar visível.
  189 |       await expect(
  190 |         page.getByRole("button", { name: /Confirmar envio/i })
  191 |       ).toBeVisible({ timeout: 10_000 });
  192 | 
  193 |       // O botão "Gerar PDF para Revisão" fica desabilitado enquanto há envio
  194 |       // pendente (disabled={!!pendingEmail}), prevenindo duplo envio.
  195 |       await expect(gerarBtn).toBeDisabled();
  196 |     }
  197 |   );
  198 | });
  199 | 
```