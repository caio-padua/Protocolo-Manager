# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dieta-pdf-preview.spec.ts >> Dieta — PDF preview + confirmação de e-mail >> popup bloqueado: painel exibe ícone Download, 'PDF foi baixado', nome do paciente e calorias
- Location: e2e/dieta-pdf-preview.spec.ts:213:7

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
  125 |     "nova aba abre com o PDF e o painel 'Confirmar envio' aparece em seguida",
  126 |     async ({ page, context }) => {
  127 |       // ── 1. Navega para a página de Dieta ─────────────────────────────────
  128 |       await page.goto("/dieta");
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
> 225 |       await page.goto("/dieta");
      |                  ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:18148/dieta
  226 |       await expect(page.getByText("Órgão Dieta")).toBeVisible({ timeout: 10_000 });
  227 | 
  228 |       // ── 2. Preenche dados antropométricos ─────────────────────────────────
  229 |       // Peso 75 kg → fallback de calorias = 75 × 25 = 1875 kcal
  230 |       await page.getByLabel("Peso (kg)").fill("75");
  231 |       await page.getByLabel("Altura (cm)").fill("175");
  232 |       await page.getByLabel("Idade", { exact: true }).fill("35");
  233 | 
  234 |       // ── 3. Marca "Enviar por e-mail" ──────────────────────────────────────
  235 |       await page
  236 |         .locator('label:has(input[type="checkbox"])')
  237 |         .filter({ hasText: /Enviar por e-mail/i })
  238 |         .locator('input[type="checkbox"]')
  239 |         .check();
  240 | 
  241 |       // ── 4. Seleciona o cliente "Ana Silva" ────────────────────────────────
  242 |       await page.locator('button', { hasText: /Selecionar cliente/i }).click();
  243 |       await page.getByText("Ana Silva").first().click();
  244 | 
  245 |       // ── 5. Garante que o botão de emissão está habilitado ─────────────────
  246 |       const gerarBtn = page.getByRole("button", { name: /Gerar PDF para Revisão/i });
  247 |       await expect(gerarBtn).toBeEnabled({ timeout: 5_000 });
  248 | 
  249 |       // ── 6. Clica em "Gerar PDF para Revisão" ──────────────────────────────
  250 |       // Com window.open retornando null, o código detecta pdfWinRef.current === null
  251 |       // e entra no branch de fallback (download via <a>). Nenhuma nova aba abre.
  252 |       await gerarBtn.click();
  253 | 
  254 |       // ── 7. Aguarda o painel de confirmação aparecer ───────────────────────
  255 |       const confirmarBtn = page.getByRole("button", { name: /Confirmar envio/i });
  256 |       await expect(confirmarBtn).toBeVisible({ timeout: 15_000 });
  257 | 
  258 |       // Âncora: o painel panel-3d-sub que contém o botão "Confirmar envio".
  259 |       // Escopo estrito evita colisão com a toast notification que também
  260 |       // aparece ao mesmo tempo.
  261 |       const painel = page.locator("div").filter({ has: confirmarBtn }).first();
  262 | 
  263 |       // ── 8. Verifica: cabeçalho "Revisar e confirmar envio" e ícone Download ─
  264 |       // O ícone tem aria-label="PDF baixado" quando usedFallbackDownload=true;
  265 |       // o caminho normal usa aria-label="PDF aberto em nova aba" (Eye).
  266 |       await expect(painel.getByText(/Revisar e confirmar envio/i)).toBeVisible();
  267 |       await expect(painel.locator('[aria-label="PDF baixado"]')).toBeVisible();
  268 |       await expect(painel.locator('[aria-label="PDF aberto em nova aba"]')).not.toBeVisible();
  269 | 
  270 |       // ── 9. Verifica: texto "PDF foi baixado" e "popup bloqueado" no painel ─
  271 |       await expect(painel.getByText(/baixado/i).first()).toBeVisible();
  272 |       await expect(painel.getByText(/popup bloqueado/i)).toBeVisible();
  273 | 
  274 |       // ── 10. Verifica: nome do paciente "Ana Silva" no texto de confirmação ──
  275 |       // O painel renderiza: <span class="font-bold">Enviar para Ana Silva?</span>
  276 |       // Usar a frase completa evita colisão com o botão PaxterClientSelector.
  277 |       await expect(page.getByText(/Enviar para Ana Silva/i)).toBeVisible();
  278 | 
  279 |       // ── 11. Verifica: calorias alvo exibidas (fallback = 75 × 25 = 1875) ──
  280 |       // A linha exibe: "Plano: <b>1875 kcal</b>"
  281 |       await expect(painel.getByText(/1875/)).toBeVisible();
  282 |       await expect(painel.getByText(/kcal/i).first()).toBeVisible();
  283 | 
  284 |       // ── 12. Botão "Gerar PDF para Revisão" fica desabilitado (duplo envio) ─
  285 |       await expect(gerarBtn).toBeDisabled();
  286 |     }
  287 |   );
  288 | });
  289 | 
```