# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dieta-pdf-preview.spec.ts >> Dieta — PDF preview + confirmação de e-mail >> nova aba abre com o PDF e o painel 'Confirmar envio' aparece em seguida
- Location: e2e/dieta-pdf-preview.spec.ts:124:7

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
  28  | // Bytes de um PDF mínimo e válido (1 página vazia).
  29  | // O browser aceita como application/pdf e URL.createObjectURL não falha.
  30  | const MINIMAL_PDF_BYTES = Buffer.from(
  31  |   "%PDF-1.4\n" +
  32  |   "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  33  |   "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  34  |   "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n" +
  35  |   "xref\n0 4\n" +
  36  |   "0000000000 65535 f \n" +
  37  |   "0000000009 00000 n \n" +
  38  |   "0000000058 00000 n \n" +
  39  |   "0000000115 00000 n \n" +
  40  |   "trailer<</Size 4/Root 1 0 R>>\n" +
  41  |   "startxref\n190\n%%EOF\n"
  42  | );
  43  | 
  44  | test.describe("Dieta — PDF preview + confirmação de e-mail", () => {
  45  |   test.beforeEach(async ({ page }) => {
  46  |     // Injeta token falso de colaborador no localStorage antes de qualquer
  47  |     // navegação, para que o CollaboratorGate passe na validação.
  48  |     await page.addInitScript(() => {
  49  |       localStorage.setItem("padcom_collab_token", "e2e-fake-token");
  50  |       localStorage.setItem(
  51  |         "padcom_collab_prof",
  52  |         JSON.stringify({ id: 1, name: "Dr. Caio", role: "medico" })
  53  |       );
  54  |     });
  55  | 
  56  |     // --- Mocks de API -----------------------------------------------------------
  57  | 
  58  |     // CollaboratorGate valida o token via GET /api/collaborator/me
  59  |     await page.route("**/api/collaborator/me", (route) =>
  60  |       route.fulfill({
  61  |         status: 200,
  62  |         contentType: "application/json",
  63  |         body: JSON.stringify({
  64  |           professional: { id: 1, name: "Dr. Caio", role: "medico" },
  65  |         }),
  66  |       })
  67  |     );
  68  | 
  69  |     // Lista de clientes (PaxterClientSelector)
  70  |     await page.route("**/api/clients*", (route) =>
  71  |       route.fulfill({
  72  |         status: 200,
  73  |         contentType: "application/json",
  74  |         body: JSON.stringify([
  75  |           {
  76  |             id: 42,
  77  |             name: "Ana Silva",
  78  |             cpf: "123.456.789-00",
  79  |             phone: "(11) 91234-5678",
  80  |             photoUrl: null,
  81  |           },
  82  |         ]),
  83  |       })
  84  |     );
  85  | 
  86  |     // Endpoints usados pela aba mas não pelo fluxo testado
  87  |     await page.route("**/api/dieta/catalogo/alimentos", (route) =>
  88  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  89  |     );
  90  |     await page.route("**/api/dieta/receitas", (route) =>
  91  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  92  |     );
  93  |     await page.route("**/api/dieta/indicacoes*", (route) =>
  94  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  95  |     );
  96  |     await page.route("**/api/dieta/planos-emitidos*", (route) =>
  97  |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  98  |     );
  99  |     await page.route("**/api/dieta/prescricoes*", (route) =>
  100 |       route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  101 |     );
  102 | 
  103 |     // POST /api/dieta/emitir-pdf → devolve um PDF mínimo com delay intencional.
  104 |     //
  105 |     // O delay cria uma janela de tempo em que:
  106 |     //   • a nova aba já foi aberta (window.open é síncrono)
  107 |     //   • o fetch ainda está em andamento → tab permanece em about:blank
  108 |     //   • "Confirmar envio" NÃO deve aparecer ainda
  109 |     //
  110 |     // Isso permite ao teste provar a ordenação: o botão só pode aparecer DEPOIS
  111 |     // que o PDF foi aberto na nova aba (tab navega para blob:), não antes.
  112 |     await page.route("**/api/dieta/emitir-pdf", async (route) => {
  113 |       // 800 ms de janela: tempo suficiente para o Playwright verificar o estado
  114 |       // intermediário sem tornar o teste lento demais.
  115 |       await new Promise<void>((r) => setTimeout(r, 800));
  116 |       await route.fulfill({
  117 |         status: 200,
  118 |         contentType: "application/pdf",
  119 |         body: MINIMAL_PDF_BYTES,
  120 |       });
  121 |     });
  122 |   });
  123 | 
  124 |   test(
  125 |     "nova aba abre com o PDF e o painel 'Confirmar envio' aparece em seguida",
  126 |     async ({ page, context }) => {
  127 |       // ── 1. Navega para a página de Dieta ─────────────────────────────────
> 128 |       await page.goto("/dieta");
      |                  ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:18148/dieta
  129 | 
  130 |       // Aguarda a página carregar (CollaboratorGate pode fazer redirect se o
  131 |       // mock falhar, portanto validamos um heading visível)
  132 |       await expect(page.getByText("Órgão Dieta")).toBeVisible({ timeout: 10_000 });
  133 | 
  134 |       // ── 2. Preenche os campos antropométricos (obrigatórios para emitir) ──
  135 |       // Field envolve o input numa <label> — getByLabel funciona por containment.
  136 |       await page.getByLabel("Peso (kg)").fill("75");
  137 |       await page.getByLabel("Altura (cm)").fill("175");
  138 |       // "Idade" é substring de "Nível de atividade" em português — usar exact:true
  139 |       await page.getByLabel("Idade", { exact: true }).fill("35");
  140 | 
  141 |       // ── 3. Marca "Enviar por e-mail" ──────────────────────────────────────
  142 |       // O checkbox de e-mail é o único da seção de emissão de PDF
  143 |       await page
  144 |         .locator('label:has(input[type="checkbox"])')
  145 |         .filter({ hasText: /Enviar por e-mail/i })
  146 |         .locator('input[type="checkbox"]')
  147 |         .check();
  148 | 
  149 |       // ── 4. Seleciona um cliente no PaxterClientSelector ───────────────────
  150 |       // O botão Popover fica dentro de um <label>Cliente</label>, então seu
  151 |       // accessible name é "Cliente" (não "Selecionar cliente…") — usar
  152 |       // hasText para localizar pelo conteúdo visual interno do botão.
  153 |       await page.locator('button', { hasText: /Selecionar cliente/i }).click();
  154 | 
  155 |       // Aguarda o popover abrir com o cliente mockado e clica
  156 |       await page.getByText("Ana Silva").first().click();
  157 | 
  158 |       // ── 5. Confirma que o botão de emissão está habilitado ────────────────
  159 |       const gerarBtn = page.getByRole("button", { name: /Gerar PDF para Revisão/i });
  160 |       await expect(gerarBtn).toBeEnabled({ timeout: 5_000 });
  161 | 
  162 |       // ── 6. Escuta nova aba ANTES de clicar — window.open é síncrono ───────
  163 |       // O código faz window.open("about:blank", "_blank") de forma SÍNCRONA
  164 |       // antes do fetch, para não ser bloqueado pelo popup blocker. Registrar
  165 |       // o listener antes do clique garante que não perdemos o evento.
  166 |       const newPagePromise = context.waitForEvent("page", { timeout: 10_000 });
  167 | 
  168 |       // ── 7. Clica em "Gerar PDF para Revisão" ──────────────────────────────
  169 |       await gerarBtn.click();
  170 | 
  171 |       // ── 8a. Nova aba abre imediatamente (window.open é síncrono) ─────────
  172 |       const newTab = await newPagePromise;
  173 |       expect(newTab).toBeTruthy();
  174 | 
  175 |       // ── 8b. PROVA DE ORDENAÇÃO: durante o fetch em andamento (800 ms) ─────
  176 |       //
  177 |       // O mock do POST /api/dieta/emitir-pdf tem 800 ms de delay intencional.
  178 |       // Nesse intervalo:
  179 |       //   • a nova aba foi criada mas ainda está em "about:blank"
  180 |       //   • setPendingEmail() ainda NÃO foi chamado
  181 |       //   • o botão "Confirmar envio" NÃO deve estar visível
  182 |       //
  183 |       // Esta verificação falha se o código chamar setPendingEmail() antes de
  184 |       // atribuir location.href (ou se o painel aparecer sem a aba navegar).
  185 |       expect(newTab.url()).toBe("about:blank");
  186 |       await expect(
  187 |         page.getByRole("button", { name: /Confirmar envio/i })
  188 |       ).not.toBeVisible();
  189 | 
  190 |       // ── 8c. Aguarda a aba navegar para o blob: URL ────────────────────────
  191 |       // Depois que o fetch conclui, o código faz:
  192 |       //   pdfWinRef.current.location.href = URL.createObjectURL(blob)
  193 |       //   setPendingEmail({ ... })
  194 |       // A navegação para blob: acontece ANTES de setPendingEmail retornar no
  195 |       // ciclo React, provando que o PDF foi aberto antes do painel aparecer.
  196 |       await newTab.waitForURL(/^blob:/, { timeout: 10_000 });
  197 | 
  198 |       // ── 9. Confirma que o painel de confirmação aparece na aba principal ──
  199 |       // Agora — e só agora — "Confirmar envio" pode estar visível.
  200 |       await expect(
  201 |         page.getByRole("button", { name: /Confirmar envio/i })
  202 |       ).toBeVisible({ timeout: 10_000 });
  203 | 
  204 |       // O botão "Gerar PDF para Revisão" fica desabilitado enquanto há envio
  205 |       // pendente (disabled={!!pendingEmail}), prevenindo duplo envio.
  206 |       await expect(gerarBtn).toBeDisabled();
  207 |     }
  208 |   );
  209 | 
  210 |   // ---------------------------------------------------------------------------
  211 |   // Task #244 — popup bloqueado: o painel deve mostrar nome correto + kcal
  212 |   // ---------------------------------------------------------------------------
  213 |   test(
  214 |     "popup bloqueado: painel exibe ícone Download, 'PDF foi baixado', nome do paciente e calorias",
  215 |     async ({ page }) => {
  216 |       // ── 0. Simula popup blocker: window.open retorna null ─────────────────
  217 |       // addInitScript executa ANTES de qualquer script da página, então a
  218 |       // sobrescrita é garantida mesmo que o componente use window.open no mount.
  219 |       await page.addInitScript(() => {
  220 |         // eslint-disable-next-line @typescript-eslint/no-explicit-any
  221 |         (window as any).open = () => null;
  222 |       });
  223 | 
  224 |       // ── 1. Navega para a página de Dieta ─────────────────────────────────
  225 |       await page.goto("/dieta");
  226 |       await expect(page.getByText("Órgão Dieta")).toBeVisible({ timeout: 10_000 });
  227 | 
  228 |       // ── 2. Preenche dados antropométricos ─────────────────────────────────
```