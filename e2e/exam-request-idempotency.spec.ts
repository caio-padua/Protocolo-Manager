import { test, expect, type Page, type Route } from "@playwright/test";

const client = { id: 42, name: "Cliente Sintético", email: "synthetic@example.invalid",
  phone: "00000000000", cpf: "", status: "active", birthDate: null, photoUrl: null };
const professional = { id: 202, name: "Médico Sintético", role: "medico", crm: "000", uf: "SP" };
const document = { id: 91, tipoLabel: "Outros", fileName: "Pedido sintético.pdf", examCount: 1,
  createdAt: "2026-10-29T15:00:00Z", url: "/api/exam-requests/file/synthetic" };

async function selectAndConfirm(page: Page) {
  const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
  await expect(panel).toBeVisible();
  await panel.getByRole("checkbox", { name: "Selecionar documento 91 para envio" }).check();
  await panel.getByRole("checkbox", { name: "E-mail", exact: true }).check();
  await panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false }).check();
  await panel.getByRole("button", { name: "Confirmar envio", exact: true }).click();
  return panel;
}

// Cover both the real cockpit (which remounts the panel by scope) and a test-only
// entry point that changes props on the SAME instance. The latter is essential:
// a test relying solely on unmounting cannot detect a missing contextRef guard.
for (const operation of ["envio", "consulta"] as const) {
for (const mount of ["cockpit", "mesma-instancia"] as const) {
  for (const transition of ["paciente", "medico", "paciente-circular"] as const) {
    // Preserve the existing round-trip send contract; consultation covers A→B.
    if (operation === "consulta" && transition === "paciente-circular") continue;
    for (const outcome of ["sucesso-atrasado", "erro-atrasado"] as const) {
      test(`Pedidos: isolar resposta de ${operation} ao trocar ${transition} — ${outcome} — ${mount}`, async ({ context, page }, testInfo) => {
        const nextClient = { ...client, id: 43, name: "Outro Cliente Sintético" };
        const nextProfessional = { ...professional, id: 203, name: "Outro Médico Sintético" };
        const oldMessage = "Resposta exclusiva do envio anterior";
        const oldError = "Erro exclusivo do envio anterior";
        const posts: { path: string; body: unknown; authorization?: string }[] = [];
        let heldSend: Route | undefined;
        let switched = false;
        let returned = false;
        const circular = transition === "paciente-circular";
        // A retained instance accepts A's response after returning to A (the
        // guard compares IDs). The real cockpit discards the unmounted receipt.
        const acceptsReturnedResponse = circular && mount === "mesma-instancia";
        let currentReads = 0;
        const reply = (route: Route, body: unknown, status = 200) => route.fulfill({
          status, contentType: "application/json", body: JSON.stringify(body),
        });
        await context.addInitScript(() => {
          localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
          localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
          const originalFetch = window.fetch.bind(window);
          (window as any).__settledSends = 0;
          window.fetch = async (input, init) => {
            const url = input instanceof Request ? input.url : String(input);
            if (!url.endsWith("/exam-requests/send")) return originalFetch(input, init);
            // Do not let cancellation hide a stale response. Count JSON parsing,
            // not merely receipt of headers, before checking React's final state.
            const response = await originalFetch(input, { ...init, signal: undefined });
            const originalJson = response.json.bind(response);
            response.json = async () => {
              const data = await originalJson();
              (window as any).__settledSends++;
              return data;
            };
            return response;
          };
        });
        if (mount === "mesma-instancia") {
          // Keep Vite's normal React preamble; only replace the app entry point.
          // No test route, switcher, or auth bypass is added to the shipped app.
          await page.route("**/cockpit/42/exames", async route => {
            const response = await route.fetch();
            const html = await response.text();
            expect(html).toContain('src="/src/main.tsx"');
            await route.fulfill({ response, body: html.replace(
              'src="/src/main.tsx"', 'src="/e2e/ExamRequestContextHarness.tsx"',
            ) });
          });
        }
        // Catch ALL API traffic; no request can reach patient data or providers.
        await context.route("**/api/**", async route => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          if (request.method() !== "GET") {
            posts.push({ path, body: request.postDataJSON(), authorization: request.headers().authorization });
            expect(request.method()).toBe("POST");
            expect(path).toBe("/api/exam-requests/send");
            expect(heldSend).toBeUndefined();
            heldSend = route;
            return;
          }
          const activeProfessional = switched && transition === "medico" ? nextProfessional : professional;
          if (path === "/api/collaborator/me") return reply(route, { professional: activeProfessional });
          if (path === "/api/clients") return reply(route, [client, nextClient]);
          const patient = path.includes("/43") ? nextClient : client;
          if (/^\/api\/clients\/(42|43)$/.test(path)) return reply(route, patient);
          if (/^\/api\/clinical-context\/(42|43)$/.test(path)) return reply(route, {
            professional: activeProfessional, client: patient,
            clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
            canPrescribe: true, issue: null,
          });
          if (/^\/api\/exam-requests\/(42|43)\/history$/.test(path)) {
            if (switched) currentReads++;
            return reply(route, {
              documents: [switched && !returned ? { ...document, id: 92, fileName: "Pedido do contexto atual.pdf" } : document],
              dispatches: [], pendingOperations: [], nextOffset: null,
            });
          }
          return reply(route, []);
        });
        await page.goto("/cockpit/42/exames");
        const panel = await selectAndConfirm(page);
        await expect.poll(() => !!heldSend).toBe(true);
        await expect(panel.getByRole("button", { name: "Enviando…", exact: true })).toBeDisabled();
        expect(posts).toHaveLength(1);
        const oldBody = posts[0].body as { operationKey: string };
        expect(posts[0]).toMatchObject({
          path: "/api/exam-requests/send", authorization: "Bearer synthetic-ui-token",
          body: { clientId: 42, documentIds: [91], channels: ["EMAIL"], confirmed: true },
        });
        expect(oldBody.operationKey).toMatch(/^[a-f0-9]{64}$/);
        const expectedPosts = operation === "consulta" ? 2 : 1;
        if (operation === "consulta") {
          // First obtain a real UI receipt from the synthetic original send.
          // Only the explicit recovery action may issue the second POST.
          const originalSend = heldSend!;
          heldSend = undefined;
          await reply(originalSend, {
            operationKey: oldBody.operationKey, replayed: false, state: "needs_review", needsReview: true,
            message: oldMessage,
            results: [{ channel: "EMAIL", success: false, auditId: 808, error: oldError }],
          });
          const receipt = panel.getByRole("status");
          await expect(receipt).toContainText(oldBody.operationKey);
          await expect(receipt).toContainText(oldMessage);
          await expect(receipt.getByRole("alert")).toContainText("Confira o histórico e o provedor");
          await expect(panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false })).not.toBeChecked();
          expect(posts).toHaveLength(1);
          await receipt.getByRole("button", { name: "Consultar esta operação", exact: true }).click();
          await expect.poll(() => !!heldSend).toBe(true);
          await expect(panel.getByRole("button", { name: "Enviando…", exact: true })).toBeDisabled();
          await expect(panel.getByRole("status")).toHaveCount(0);
          await expect(panel.getByRole("alert")).toHaveCount(0);
          expect(posts).toHaveLength(2);
          expect(posts[1]).toEqual(posts[0]);
          expect(await page.evaluate(() => (window as any).__settledSends)).toBe(1);
        }
        await panel.evaluate(element => { (window as any).__originalPanel = element; });
        switched = true;
        if (mount === "mesma-instancia") {
          await page.getByRole("button", { name: `Trocar ${transition === "medico" ? "médico" : "paciente"} sintético` }).click();
        } else if (transition !== "medico") {
          await page.evaluate(() => {
            window.history.pushState(null, "", "/cockpit/43/exames");
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
          await expect(page).toHaveURL(/\/cockpit\/43\/exames$/);
        } else {
          await page.evaluate(prof => {
            localStorage.setItem("padcom_collab_token", "synthetic-next-token");
            localStorage.setItem("padcom_collab_prof", JSON.stringify(prof));
            window.dispatchEvent(new Event("collab-auth-changed"));
          }, nextProfessional);
        }
        await expect.poll(() => currentReads).toBeGreaterThan(0);
        await expect(panel.getByText("Pedido do contexto atual.pdf", { exact: true })).toBeVisible();
        await expect(panel.getByRole("checkbox", { name: "Selecionar documento 91 para envio" })).toHaveCount(0);
        if (mount === "mesma-instancia") {
          expect(await panel.evaluate(element => element === (window as any).__originalPanel)).toBe(true);
        }
        if (circular) {
          await expect(panel.getByRole("checkbox", { checked: true, name: /Selecionar documento/ })).toHaveCount(0);
          await expect(panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false })).not.toBeChecked();
          await expect(panel.getByRole("button", {
            name: mount === "mesma-instancia" ? "Enviando…" : "Confirmar envio", exact: true,
          })).toBeDisabled();
          const readsBeforeReturn = currentReads;
          returned = true;
          if (mount === "mesma-instancia") {
            await page.getByRole("button", { name: "Voltar ao paciente sintético" }).click();
          } else {
            await page.evaluate(() => {
              window.history.pushState(null, "", "/cockpit/42/exames");
              window.dispatchEvent(new PopStateEvent("popstate"));
            });
            await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
          }
          await expect.poll(() => currentReads).toBeGreaterThan(readsBeforeReturn);
          await expect(panel.getByText(document.fileName, { exact: true })).toBeVisible();
          await expect(panel.getByRole("checkbox", { name: "Selecionar documento 91 para envio" })).not.toBeChecked();
          await expect(panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false })).not.toBeChecked();
          await expect(panel.getByRole("status")).toHaveCount(0);
          await expect(panel.getByRole("alert")).toHaveCount(0);
          await expect(panel.getByRole("button", { name: "Consultar esta operação" })).toHaveCount(0);
          await expect(panel.getByRole("button", {
            name: mount === "mesma-instancia" ? "Enviando…" : "Confirmar envio", exact: true,
          })).toBeDisabled();
          expect(await panel.evaluate(element => element === (window as any).__originalPanel))
            .toBe(mount === "mesma-instancia");
          expect(posts).toHaveLength(1);
        }
        // Observe transient DOM changes as well as the settled UI: no old
        // receipt/error/recovery button may flash in the new scope.
        await page.evaluate(({ key, message, error, allowReceipt }) => {
          (window as any).__sendLeaks = [];
          new MutationObserver(() => {
            const region = document.querySelector('[aria-label="Histórico de pedidos de exames"]');
            const text = region?.textContent ?? "";
            if ((!allowReceipt && [key, message, error, "Operação registrada", "Consultar esta operação"].some(value => text.includes(value)))
              || !!region?.querySelector<HTMLInputElement>('input[aria-label^="Selecionar documento"]:checked')
              || [...(region?.querySelectorAll("label") ?? [])].some(label =>
                label.textContent?.includes("Conferi os documentos") && label.querySelector<HTMLInputElement>("input")?.checked)) {
              (window as any).__sendLeaks.push(text);
            }
          }).observe(document.body, { subtree: true, childList: true, characterData: true });
        }, { key: oldBody.operationKey, message: oldMessage, error: oldError, allowReceipt: acceptsReturnedResponse });
        if (outcome === "sucesso-atrasado") {
          await reply(heldSend!, {
            operationKey: oldBody.operationKey, replayed: operation === "consulta", state: "completed", needsReview: false,
            message: oldMessage, results: [{ channel: "EMAIL", success: true, auditId: 808 }],
          });
        } else {
          await reply(heldSend!, { error: oldError }, 500);
        }
        await expect.poll(() => page.evaluate(() => (window as any).__settledSends)).toBe(expectedPosts);
        await page.evaluate(() => new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        if (acceptsReturnedResponse && outcome === "sucesso-atrasado") {
          await expect(panel.getByRole("status")).toContainText(oldBody.operationKey);
          await expect(panel.getByRole("status")).toContainText(oldMessage);
          await expect(panel.getByRole("status")).toContainText("Operação registrada");
          await expect(panel.getByRole("alert")).toHaveCount(0);
          await expect(panel.getByRole("button", { name: "Consultar esta operação" })).toBeVisible();
        } else if (acceptsReturnedResponse) {
          await expect(panel.getByRole("alert")).toContainText(oldError);
          await expect(panel.getByRole("alert")).toContainText("atualize o histórico");
          await expect(panel.getByRole("status")).toHaveCount(0);
          await expect(panel.getByRole("button", { name: "Consultar esta operação" })).toHaveCount(0);
          await expect(panel).not.toContainText(oldBody.operationKey);
        } else {
          await expect(panel.getByRole("status")).toHaveCount(0);
          await expect(panel.getByRole("alert")).toHaveCount(0);
          await expect(panel.getByRole("button", { name: "Consultar esta operação" })).toHaveCount(0);
          await expect(panel).not.toContainText(oldBody.operationKey);
          await expect(panel).not.toContainText(oldMessage);
          await expect(panel).not.toContainText(oldError);
        }
        await expect(panel.getByRole("checkbox", { checked: true, name: /Selecionar documento/ })).toHaveCount(0);
        await expect(panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false })).not.toBeChecked();
        await expect(panel.getByRole("button", { name: "Confirmar envio", exact: true })).toBeDisabled();
        // A normal history refresh must remain usable and must not consult or
        // replay the old send. Count every mutation, not just accepted sends.
        const readsBeforeRefresh = currentReads;
        await panel.getByRole("button", { name: "Atualizar histórico" }).click();
        await expect.poll(() => currentReads).toBeGreaterThan(readsBeforeRefresh);
        await expect(panel.getByText(circular ? document.fileName : "Pedido do contexto atual.pdf", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => (window as any).__sendLeaks)).toEqual([]);
        expect(posts).toHaveLength(expectedPosts);
        if (operation === "consulta") expect(posts[1]).toEqual(posts[0]);
        if (circular) {
          // A receipt cannot stand in for a new selection and explicit consent.
          await panel.getByRole("checkbox", { name: "Selecionar documento 91 para envio" }).check();
          await expect(panel.getByRole("button", { name: "Confirmar envio", exact: true })).toBeDisabled();
          if (mount === "cockpit") {
            await expect(panel.getByRole("checkbox", { name: "E-mail", exact: true })).not.toBeChecked();
            await panel.getByRole("checkbox", { name: "E-mail", exact: true }).check();
          } else {
            await expect(panel.getByRole("checkbox", { name: "E-mail", exact: true })).toBeChecked();
          }
          await expect(panel.getByRole("button", { name: "Confirmar envio", exact: true })).toBeDisabled();
          await panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false }).check();
          await expect(panel.getByRole("button", { name: "Confirmar envio", exact: true })).toBeEnabled();
          expect(posts).toHaveLength(1); // Preparing new consent does not send.
        }
        await panel.screenshot({ path: testInfo.outputPath(`${operation}-contexto-isolado.png`) });
      });
    }
  }
}
}

for (const scenario of ["duas-janelas", "resposta-perdida", "resultado-desconhecido"] as const) {
  test(`Pedidos: recuperar operação sem novo envio — ${scenario}`, async ({ context, page }, testInfo) => {
    let calls = 0;
    let acceptedOperations = 0;
    let previousKey: string | undefined;
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
    });
    // Every API call is intercepted; these tests never reach real providers/data.
    await context.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      if (path === "/api/collaborator/me") return json({ professional });
      if (path === "/api/clients") return json([client]);
      if (path === "/api/clients/42") return json(client);
      if (path === "/api/clinical-context/42") return json({
        professional, client, clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
        canPrescribe: true, issue: null,
      });
      if (path === "/api/exam-requests/42/history") return json({ documents: [document], dispatches: [], pendingOperations: [], nextOffset: null });
      if (path === "/api/exam-requests/send") {
        calls++;
        const body = route.request().postDataJSON();
        expect(body).toMatchObject({ clientId: 42, documentIds: [91], channels: ["EMAIL"], confirmed: true });
        expect(body.operationKey).toMatch(/^[a-f0-9]{64}$/);
        const replayed = previousKey !== undefined;
        if (previousKey) expect(body.operationKey).toBe(previousKey);
        else { previousKey = body.operationKey; acceptedOperations++; }
        if (scenario === "resposta-perdida" && calls === 1) return route.abort();
        const needsReview = scenario === "resultado-desconhecido";
        return json({
          operationKey: previousKey, replayed, state: needsReview ? "needs_review" : "completed", needsReview,
          message: needsReview ? "Operação pendente de conferência. Não reenvie automaticamente."
            : replayed ? "Operação anterior recuperada. Nenhuma mensagem foi reenviada." : "Operação registrada.",
          results: [{ channel: "EMAIL", success: !needsReview, auditId: 808,
            ...(needsReview ? { error: "Falha de comunicação; confira o provedor." } : {}) }],
        });
      }
      return json([]);
    });
    await page.goto("/cockpit/42/exames");
    let panel = await selectAndConfirm(page);
    if (scenario === "duas-janelas") {
      await expect(panel.getByText("Operação registrada", { exact: true })).toBeVisible();
      const second = await context.newPage();
      await second.goto("/cockpit/42/exames");
      panel = await selectAndConfirm(second);
      await expect(panel.getByText("Operação anterior", { exact: true })).toBeVisible();
      await second.reload();
      panel = await selectAndConfirm(second);
      await expect(panel.getByText("Nenhuma mensagem foi reenviada.", { exact: false })).toBeVisible();
    } else if (scenario === "resposta-perdida") {
      await expect(panel.getByRole("alert")).toContainText("atualize o histórico");
      await panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false }).check();
      await panel.getByRole("button", { name: "Confirmar envio", exact: true }).click();
      await expect(panel.getByText("Operação anterior", { exact: true })).toBeVisible();
    } else {
      await expect(panel.getByRole("alert")).toContainText("Confira o histórico e o provedor");
      await panel.getByRole("button", { name: "Consultar esta operação" }).click();
      await expect(panel.getByText("Operação anterior", { exact: true })).toBeVisible();
    }
    expect(acceptedOperations).toBe(1);
    await panel.screenshot({ path: testInfo.outputPath("operacao-anterior.png") });
  });
}

test("Pedidos: pendências visíveis após recarga sem selecionar arquivos ou canais", async ({ context, page }, testInfo) => {
  let posts = 0;
  let pending = true;
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
  });
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (route.request().method() === "POST") posts++;
    if (path === "/api/collaborator/me") return json({ professional });
    if (path === "/api/clients") return json([client]);
    if (path === "/api/clients/42") return json(client);
    if (path === "/api/clinical-context/42") return json({
      professional, client, clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
      canPrescribe: true, issue: null,
    });
    if (path === "/api/exam-requests/42/history") {
      const older = new URL(route.request().url()).searchParams.get("offset") === "20";
      return json({ documents: older ? [] : [document], dispatches: [], nextOffset: older ? null : 20,
        pendingOperations: pending ? [{
          operationKey: "synthetic-reserved-operation", state: "in_progress", createdAt: document.createdAt,
          documentIds: [91, 92], channels: ["EMAIL", "TELEGRAM"],
          results: [{ channel: "EMAIL", success: true, auditId: 808 }],
        }, {
          operationKey: "synthetic-review-operation", state: "needs_review", createdAt: document.createdAt,
          documentIds: [93], channels: ["WHATSAPP"], results: [],
        }] : [],
      });
    }
    return json([]);
  });
  await page.goto("/cockpit/42/exames");
  const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
  const warning = panel.getByRole("alert");
  await expect(warning).toContainText("Envios pendentes de conferência");
  await expect(warning).toContainText("Documentos: 91, 92");
  await expect(warning).toContainText("Canais: E-mail, Telegram");
  await expect(warning).toContainText("Aceito pelo provedor; entrega não confirmada.");
  await expect(warning).toContainText("Sem confirmação de resultado");
  await expect(warning).toContainText("Requer conferência");
  await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await page.reload();
  await expect(warning).toBeVisible();
  await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Mais antigos", exact: true }).click();
  await expect(panel.getByText("Nenhum pedido registrado", { exact: false })).toBeVisible();
  await expect(warning).toContainText("synthetic-reserved-operation");
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: testInfo.outputPath("pendencias-mobile.png") });
  pending = false;
  await panel.getByRole("button", { name: "Atualizar histórico" }).click();
  await expect(warning).toHaveCount(0);
  expect(posts).toBe(0);
});

// Consent is deliberately prepared without sending: pending-operation tests
// cannot prove that pre-POST selections/authorization are scoped correctly.
for (const transition of ["paciente", "medico"] as const) {
  test(`Pedidos: não herdar autorização antes do envio ao trocar ${transition}`, async ({ context, page }, testInfo) => {
    const nextClient = { ...client, id: 43, name: "Outro Cliente Sintético" };
    const nextProfessional = { ...professional, id: 203, name: "Outro Médico Sintético" };
    let switched = false;
    const posts: string[] = [];
    let navigations = 0;
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
    });
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
    });
    await context.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      // Even an unexpected POST is fulfilled locally, never forwarded.
      if (request.method() === "POST") {
        posts.push(path);
        return json({ error: "Este cenário não autoriza chamadas POST." });
      }
      const activeProfessional = switched && transition === "medico" ? nextProfessional : professional;
      if (path === "/api/collaborator/me") return json({ professional: activeProfessional });
      if (path === "/api/clients") return json([client, nextClient]);
      const patient = path.includes("/43") ? nextClient : client;
      if (/^\/api\/clients\/(42|43)$/.test(path)) return json(patient);
      if (/^\/api\/clinical-context\/(42|43)$/.test(path)) return json({
        professional: activeProfessional, client: patient,
        clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
        canPrescribe: true, issue: null,
      });
      if (/^\/api\/exam-requests\/(42|43)\/history$/.test(path)) {
        expect(request.headers().authorization).toBe(
          switched && transition === "medico" ? "Bearer synthetic-next-token" : "Bearer synthetic-ui-token",
        );
        const firstId = patient.id === 43 ? 93 : 91;
        return json({
          documents: [0, 1].map(index => ({
            ...document, id: firstId + index, fileName: `Pedido sintético ${firstId + index}.pdf`,
          })),
          dispatches: [], pendingOperations: [], nextOffset: null,
        });
      }
      return json([]);
    });
    await page.goto("/cockpit/42/exames");
    const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
    const consent = panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false });
    const email = panel.getByRole("checkbox", { name: "E-mail", exact: true });
    const telegram = panel.getByRole("checkbox", { name: "Telegram", exact: true });
    const confirm = panel.getByRole("button", { name: "Confirmar envio", exact: true });
    const doc = (id: number) => panel.getByRole("checkbox", { name: `Selecionar documento ${id} para envio`, exact: true });
    const expectCleared = async (firstId: number) => {
      await expect(doc(firstId)).toBeVisible();
      await expect(doc(firstId)).not.toBeChecked();
      await expect(doc(firstId + 1)).not.toBeChecked();
      await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
      await expect(panel).toContainText("0 documento(s) selecionado(s)");
      await expect(consent).not.toBeChecked();
      await expect(confirm).toBeDisabled();
      expect(posts).toEqual([]);
    };
    const changeScope = async (next: boolean) => {
      switched = next;
      if (transition === "paciente") {
        await page.evaluate(id => {
          window.history.pushState(null, "", `/cockpit/${id}/exames`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, next ? 43 : 42);
        await expect(page).toHaveURL(new RegExp(`/cockpit/${next ? 43 : 42}/exames$`));
      } else {
        await page.evaluate(({ prof, token }) => {
          localStorage.setItem("padcom_collab_token", token);
          localStorage.setItem("padcom_collab_prof", JSON.stringify(prof));
          window.dispatchEvent(new Event("collab-auth-changed"));
        }, { prof: next ? nextProfessional : professional, token: next ? "synthetic-next-token" : "synthetic-ui-token" });
        await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
      }
    };

    await expectCleared(91);
    await doc(91).check();
    await doc(92).check();
    await email.check();
    await telegram.check();
    await consent.check();
    await expect(confirm).toBeEnabled();
    expect(posts).toEqual([]);
    // No click on Confirmar envio here or later in this test.
    await changeScope(true);
    const firstId = transition === "paciente" ? 93 : 91;
    await expectCleared(firstId);
    if (transition === "paciente") await expect(doc(91)).toHaveCount(0);

    // Authorization alone is insufficient, and selecting a document revokes it.
    await consent.check();
    await expect(confirm).toBeDisabled();
    await doc(firstId).check();
    await expect(consent).not.toBeChecked();
    await consent.check();
    await expect(confirm).toBeDisabled(); // Still no channel selected.
    await email.check();
    await expect(consent).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await consent.check();
    await expect(confirm).toBeEnabled();
    await telegram.check();
    await expect(consent).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await consent.check();
    await expect(confirm).toBeEnabled();
    await doc(firstId + 1).check();
    await expect(consent).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await consent.check();
    await expect(confirm).toBeEnabled();
    expect(posts).toEqual([]);

    // Returning must not revive the original consent, even with cached history.
    await changeScope(false);
    await expectCleared(91);
    expect(navigations).toBe(1);
    expect(posts).toEqual([]);
    await panel.screenshot({ path: testInfo.outputPath("autorizacao-nao-herdada.png") });
  });
}

for (const transition of ["paciente", "medico"] as const) {
  test(`Pedidos: não restaurar seleção recém-gerada ao trocar ${transition}`, async ({ context, page }, testInfo) => {
    const nextClient = { ...client, id: 43, name: "Outro Cliente Sintético" };
    const nextProfessional = { ...professional, id: 203, name: "Outro Médico Sintético" };
    let switched = false;
    let navigations = 0;
    const emitted = new Set<boolean>();
    const emitPosts: unknown[] = [];
    const sendPosts: string[] = [];
    const unexpectedPosts: string[] = [];
    const ids = (next: boolean) => next ? [201, 202] : [101, 102];
    const documents = (next: boolean) => emitted.has(next) ? ids(next).map(id => ({
      ...document, id, fileName: `Pedido recém-gerado ${id}.pdf`,
      url: `/api/exam-requests/file/synthetic-${id}`,
    })) : [];
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
      if (request.method() === "POST" && /\/send(?:[/?]|$)/.test(new URL(request.url()).pathname)) {
        sendPosts.push(request.url());
      }
    });
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
    });
    // Every API response, including unexpected writes, stays entirely synthetic.
    await context.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({
        status, contentType: "application/json", body: JSON.stringify(body),
      });
      const activeProfessional = switched && transition === "medico" ? nextProfessional : professional;
      const activeToken = switched && transition === "medico" ? "synthetic-next-token" : "synthetic-ui-token";
      if (request.method() === "POST") {
        if (path !== "/api/exam-requests/emit") {
          unexpectedPosts.push(path);
          return json({ error: "Envio proibido neste cenário." }, 403);
        }
        const body = request.postDataJSON();
        expect(request.headers().authorization).toBe(`Bearer ${activeToken}`);
        expect(body).toMatchObject({
          clientId: switched && transition === "paciente" ? 43 : 42,
          individualDocuments: true, sendEmail: false, sendWhatsapp: false,
          items: [
            { nomeExame: "Exame sintético Alfa" },
            { nomeExame: "Exame sintético Beta" },
          ],
        });
        expect(emitted.has(switched)).toBe(false);
        emitted.add(switched);
        emitPosts.push(body);
        return json({
          pdfs: documents(switched),
          email: { attempted: false, success: false },
          whatsapp: { attempted: false, success: false },
        });
      }
      if (path === "/api/collaborator/me") return json({ professional: activeProfessional });
      if (path === "/api/clients") return json([client, nextClient]);
      const patient = path.includes("/43") ? nextClient : client;
      if (/^\/api\/clients\/(42|43)$/.test(path)) return json(patient);
      if (/^\/api\/clinical-context\/(42|43)$/.test(path)) return json({
        professional: activeProfessional, client: patient,
        clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
        canPrescribe: true, issue: null,
      });
      if (path === "/api/catalogos/exames") return json(["Alfa", "Beta"].map((name, index) => ({
        id: 701 + index, nomeExame: `Exame sintético ${name}`, codigoExame: `SYN-${index}`,
        grupoPrincipal: "Sintético", subgrupo: null, modalidade: null, materialOuSetor: null,
        preparo: null, ativo: true,
      })));
      if (/^\/api\/exam-requests\/(42|43)\/history$/.test(path)) {
        expect(request.headers().authorization).toBe(`Bearer ${activeToken}`);
        return json({
          documents: documents(transition === "paciente" ? patient.id === 43 : switched),
          dispatches: [], pendingOperations: [], nextOffset: null,
        });
      }
      return json([]);
    });
    await page.goto("/cockpit/42/exames");
    const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
    const consent = panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false });
    const confirm = panel.getByRole("button", { name: "Confirmar envio", exact: true });
    const doc = (id: number) => panel.getByRole("checkbox", { name: `Selecionar documento ${id} para envio`, exact: true });
    const expectNoSend = () => {
      expect(sendPosts).toEqual([]);
      expect(unexpectedPosts).toEqual([]);
    };
    const expectCleared = async (next: boolean) => {
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("status")).toHaveCount(0);
      await expect(panel.getByRole("checkbox", { name: /^Selecionar documento/ })).toHaveCount(documents(next).length);
      for (const item of documents(next)) await expect(doc(item.id)).not.toBeChecked();
      await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
      await expect(panel).toContainText("0 documento(s) selecionado(s)");
      await expect(consent).not.toBeChecked();
      await expect(confirm).toBeDisabled();
      expectNoSend();
    };
    const generateAndAuthorize = async (next: boolean) => {
      await page.getByRole("checkbox", { name: /^Exame sintético Alfa/ }).check();
      await page.getByRole("checkbox", { name: /^Exame sintético Beta/ }).check();
      await page.getByRole("checkbox", { name: "Gerar um documento por exame", exact: false }).check();
      await page.getByRole("button", { name: "Gerar pedidos de exames", exact: true }).click();
      await expect(page.getByText("2 PDF(s) gerado(s)", { exact: true })).toBeVisible();
      for (const id of ids(next)) await expect(doc(id)).toBeChecked();
      await expect(panel).toContainText("2 documento(s) selecionado(s)");
      await expect(consent).not.toBeChecked();
      await expect(confirm).toBeDisabled();
      for (const channel of ["E-mail", "WhatsApp", "Telegram"]) {
        await panel.getByRole("checkbox", { name: channel, exact: true }).check();
      }
      await consent.check();
      await expect(confirm).toBeEnabled();
      expectNoSend();
      // Deliberately do not click Confirmar envio.
    };
    const changeScope = async (next: boolean) => {
      switched = next;
      if (transition === "paciente") {
        await page.evaluate(id => {
          window.history.pushState(null, "", `/cockpit/${id}/exames`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, next ? 43 : 42);
        await expect(page).toHaveURL(new RegExp(`/cockpit/${next ? 43 : 42}/exames$`));
      } else {
        await page.evaluate(({ prof, token }) => {
          localStorage.setItem("padcom_collab_token", token);
          localStorage.setItem("padcom_collab_prof", JSON.stringify(prof));
          window.dispatchEvent(new Event("collab-auth-changed"));
        }, { prof: next ? nextProfessional : professional, token: next ? "synthetic-next-token" : "synthetic-ui-token" });
        await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
      }
      const draft = page.getByRole("region", { name: "Rascunho clínico", exact: true });
      await expect(draft).toContainText(next && transition === "paciente" ? nextClient.name : client.name);
      await expect(draft).toContainText(next && transition === "medico" ? nextProfessional.name : professional.name);
      await expectCleared(next);
      await expect(page.getByText("2 PDF(s) gerado(s)", { exact: true })).toHaveCount(0);
    };
    await expectCleared(false);
    await generateAndAuthorize(false);
    await changeScope(true);
    for (const id of ids(false)) await expect(doc(id)).toHaveCount(0);
    await generateAndAuthorize(true);
    await changeScope(false);
    for (const id of ids(true)) await expect(doc(id)).toHaveCount(0);
    await changeScope(true);
    await changeScope(false);
    expect(emitPosts).toHaveLength(2);
    expect(navigations).toBe(1);
    expectNoSend();
    await panel.screenshot({ path: testInfo.outputPath("pedidos-recentes-sem-autorizacao-herdada.png") });
  });
}

// Revalidate the same session/patient/doctor, changing only the clinic scope.
// Testing each identifier independently catches an incomplete draft scope key.
for (const transition of ["clinica", "empresa", "clinica-e-empresa"] as const) {
  test(`Pedidos: revalidar ${transition} exige nova autorização sem envio`, async ({ context, page }, testInfo) => {
    const originalClinic = { id: 303, empresaId: 404, name: "Clínica Sintética" };
    const nextClinic = {
      id: transition === "empresa" ? 303 : 304,
      empresaId: transition === "clinica" ? 404 : 405,
      name: "Novo contexto clínico sintético",
    };
    let activeClinic = originalClinic;
    let holdIdentity = false;
    let heldIdentity: Route | undefined;
    const posts: string[] = [];
    let navigations = 0;
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
    });
    const replyIdentity = (route: Route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ professional, client, clinic: activeClinic, canPrescribe: true, issue: null }),
    });
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
    });
    await context.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      // Catch all POSTs, including emit/send: nothing may reach a real API.
      if (request.method() === "POST") {
        posts.push(path);
        return json({ error: "Este cenário não autoriza chamadas POST." });
      }
      if (path === "/api/collaborator/me") return json({ professional });
      if (path === "/api/clients") return json([client]);
      if (path === "/api/clients/42") return json(client);
      if (path === "/api/clinical-context/42") {
        expect(request.headers().authorization).toBe("Bearer synthetic-ui-token");
        if (holdIdentity) { heldIdentity = route; return; }
        return replyIdentity(route);
      }
      if (path === "/api/exam-requests/42/history") return json({
        documents: [document, { ...document, id: 92, fileName: "Outro pedido sintético.pdf" }],
        dispatches: [], pendingOperations: [], nextOffset: null,
      });
      return json([]);
    });
    await page.goto("/cockpit/42/exames");
    const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
    const doc = (id: number) => panel.getByRole("checkbox", { name: `Selecionar documento ${id} para envio`, exact: true });
    const consent = panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false });
    const confirm = panel.getByRole("button", { name: "Confirmar envio", exact: true });
    const prepareWithoutSending = async () => {
      await doc(91).check();
      await doc(92).check();
      await panel.getByRole("checkbox", { name: "E-mail", exact: true }).check();
      await panel.getByRole("checkbox", { name: "Telegram", exact: true }).check();
      await consent.check();
      await expect(confirm).toBeEnabled();
      expect(posts).toEqual([]);
    };
    const expectCleared = async () => {
      await expect(panel).toBeVisible();
      await expect(doc(91)).not.toBeChecked();
      await expect(doc(92)).not.toBeChecked();
      await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
      await expect(panel).toContainText("0 documento(s) selecionado(s)");
      await expect(consent).not.toBeChecked();
      await expect(confirm).toBeDisabled();
      expect(posts).toEqual([]);
    };
    const revalidate = async (clinic: typeof originalClinic) => {
      activeClinic = clinic;
      heldIdentity = undefined;
      holdIdentity = true;
      // Renew identity through the app's session event, without changing the
      // stored token/professional, remounting the page, or navigating away.
      // Focus refetch is disabled globally in this app.
      await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
      await expect.poll(() => !!heldIdentity).toBe(true);
      await expect(page.getByRole("button", { name: "Validar identidade", exact: true })).toBeVisible();
      // The gate hides the editor and the history removes its send controls
      // entirely while the current identity is unavailable.
      await expect(panel).toBeHidden();
      await expect(page.getByRole("button", { name: "Confirmar envio", exact: true, includeHidden: true })).toHaveCount(0);
      expect(posts).toEqual([]);
      holdIdentity = false;
      await replyIdentity(heldIdentity!);
      await expect(page.getByRole("region", { name: "Rascunho clínico", exact: true })).toContainText(clinic.name);
      await expectCleared();
      await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
    };

    await expectCleared();
    await prepareWithoutSending();
    await revalidate(nextClinic);
    // Even returning to the cached original clinic cannot restore consent.
    await prepareWithoutSending();
    await revalidate(originalClinic);
    expect(navigations).toBe(1);
    expect(posts).toEqual([]);
    await panel.screenshot({ path: testInfo.outputPath("clinica-exige-nova-autorizacao.png") });
  });
}

test("Pedidos: clínica recusada com 403 bloqueia envio e nova clínica exige autorização", async ({ context, page }, testInfo) => {
  const originalClinic = { id: 303, empresaId: 404, name: "Clínica Sintética" };
  const nextClinic = { id: 304, empresaId: 405, name: "Outra clínica sintética autorizada" };
  const refusal = "Acesso negado à nova clínica sintética.";
  let revalidating = false;
  let heldIdentity: Route | undefined;
  let navigations = 0;
  const posts: string[] = [];
  page.on("request", request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/")) {
      posts.push(request.url());
    }
  });
  const reply = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, contentType: "application/json", body: JSON.stringify(body),
  });
  const identityBody = (clinic: typeof originalClinic) => ({
    professional, client, clinic, canPrescribe: true, issue: null,
  });
  await context.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
  });
  // All APIs are synthetic; even an unexpected POST cannot send or emit.
  await context.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") return reply(route, { error: "Envio proibido neste cenário." }, 403);
    if (path === "/api/collaborator/me") return reply(route, { professional });
    if (path === "/api/clients") return reply(route, [client]);
    if (path === "/api/clients/42") return reply(route, client);
    if (path === "/api/clinical-context/42") {
      expect(request.headers().authorization).toBe("Bearer synthetic-ui-token");
      if (revalidating) { heldIdentity = route; return; }
      return reply(route, identityBody(originalClinic));
    }
    if (path === "/api/exam-requests/42/history") return reply(route, {
      documents: [document, { ...document, id: 92, fileName: "Outro pedido sintético.pdf" }],
      dispatches: [], pendingOperations: [], nextOffset: null,
    });
    return reply(route, []);
  });
  await page.goto("/cockpit/42/exames");
  const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
  const draft = page.getByRole("region", { name: "Rascunho clínico", exact: true });
  const validate = page.getByRole("button", { name: "Validar identidade", exact: true });
  const confirm = page.getByRole("button", { name: "Confirmar envio", exact: true });
  const consent = page.getByRole("checkbox", { name: "Conferi os documentos", exact: false });
  const doc = (id: number) => panel.getByRole("checkbox", { name: `Selecionar documento ${id} para envio`, exact: true });
  const channels = ["E-mail", "WhatsApp", "Telegram"];
  const expectNoControls = async () => {
    await expect(panel).toBeHidden();
    await expect(page.getByRole("button", { name: "Confirmar envio", exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /^Selecionar documento/, includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Conferi os documentos", exact: false, includeHidden: true })).toHaveCount(0);
    for (const channel of channels) {
      await expect(page.getByRole("checkbox", { name: channel, exact: true, includeHidden: true })).toHaveCount(0);
    }
    expect(posts).toEqual([]);
  };
  await expect(draft).toContainText(originalClinic.name);
  await doc(91).check();
  await doc(92).check();
  for (const channel of channels) await panel.getByRole("checkbox", { name: channel, exact: true }).check();
  await consent.check();
  await expect(confirm).toBeEnabled();
  expect(posts).toEqual([]);
  // Same patient, doctor, token and mounted page; only clinic authorization changes.
  revalidating = true;
  await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
  await expect.poll(() => !!heldIdentity).toBe(true);
  await expect(validate).toBeVisible();
  await expectNoControls();
  await reply(heldIdentity!, { error: refusal }, 403);
  await expect(page.getByRole("alert")).toContainText(refusal);
  await expect(draft).toHaveCount(0);
  await expectNoControls();
  await page.screenshot({ path: testInfo.outputPath("clinica-recusada-sem-controles.png") });

  heldIdentity = undefined;
  await validate.click();
  await expect.poll(() => !!heldIdentity).toBe(true);
  await expectNoControls();
  await reply(heldIdentity!, identityBody(nextClinic));
  await expect(draft).toContainText(nextClinic.name);
  await expect(draft).toContainText(client.name);
  await expect(draft).toContainText(professional.name);
  await expect(page.getByText(refusal, { exact: true })).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(doc(91)).not.toBeChecked();
  await expect(doc(92)).not.toBeChecked();
  await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(panel).toContainText("0 documento(s) selecionado(s)");
  await expect(consent).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  // Selecting documents/channels anew still cannot replace explicit consent.
  await doc(91).check();
  for (const channel of channels) await panel.getByRole("checkbox", { name: channel, exact: true }).check();
  await expect(consent).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await consent.check();
  await expect(confirm).toBeEnabled();
  // Deliberately never click Confirmar envio, even after renewed consent.
  await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
  expect(navigations).toBe(1);
  expect(posts).toEqual([]);
  await panel.screenshot({ path: testInfo.outputPath("nova-clinica-exige-consentimento.png") });
});

for (const transition of ["clinica", "empresa", "clinica-e-empresa"] as const) {
  for (const { mode, outcome } of [
    ...(["sucesso-atrasado", "401-atrasado", "403-atrasado", "rede-atrasada"] as const).map(
      outcome => ({ mode: "paginacao" as const, outcome }),
    ),
    ...(["sucesso-atrasado", "401-atrasado", "500-atrasado"] as const).map(
      outcome => ({ mode: "atualizacao" as const, outcome }),
    ),
  ]) {
  test(`Pedidos: histórico atrasado não reaparece ao revalidar ${transition} (${mode}) — ${outcome}`, async ({ context, page }, testInfo) => {
    const originalClinic = { id: 303, empresaId: 404, name: "Clínica Sintética" };
    const nextClinic = {
      id: transition === "empresa" ? 303 : 304,
      empresaId: transition === "clinica" ? 404 : 405,
      name: "Novo contexto clínico sintético",
    };
    const oldKey = "pendencia-exclusiva-da-clinica-anterior";
    const newKey = "pendencia-exclusiva-da-clinica-atual";
    const oldPageKey = `${oldKey}-pagina-20`;
    const delayedPageKey = `${oldKey}-pagina-40`;
    const oldError = "Erro exclusivo da consulta de histórico da clínica anterior.";
    const oldMarkers = [oldKey, oldPageKey, delayedPageKey, oldError, "Não foi possível atualizar o histórico"];
    const offsets: { original: number[]; current: number[] } = { original: [], current: [] };
    let switched = false;
    let refreshing = false;
    let navigations = 0;
    const posts: string[] = [];
    const held: { identity?: Route; old?: Route; current?: Route } = {};
    const reply = (route: Route, body: unknown, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(body),
    });
    const identityBody = (clinic: typeof originalClinic) => ({
      professional, client, clinic, canPrescribe: true, issue: null,
    });
    const historyBody = (operationKey: string, id: number, nextOffset: number | null = null) => ({
      documents: [{ ...document, id, fileName: `${operationKey}.pdf` }],
      dispatches: [], nextOffset,
      pendingOperations: [{
        operationKey, state: "needs_review", createdAt: document.createdAt,
        documentIds: [id], channels: ["EMAIL"], results: [],
      }],
    });
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
    });
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
      const originalFetch = window.fetch.bind(window);
      (window as any).__parsedHistory = 0;
      (window as any).__failedHistory = 0;
      window.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!/\/exam-requests\/42\/history/.test(url)) return originalFetch(input, init);
        // Deliver the old body even if React Query cancels its original query.
        let response: Response;
        try {
          response = await originalFetch(input, { ...init, signal: undefined });
        } catch (error) {
          (window as any).__failedHistory++;
          throw error;
        }
        const originalJson = response.json.bind(response);
        response.json = async () => {
          const data = await originalJson();
          (window as any).__parsedHistory++;
          return data;
        };
        return response;
      };
    });
    await context.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST") {
        posts.push(path);
        return reply(route, { error: "Nenhum POST autorizado neste cenário." });
      }
      if (path === "/api/collaborator/me") return reply(route, { professional });
      if (path === "/api/clients") return reply(route, [client]);
      if (path === "/api/clients/42") return reply(route, client);
      if (path === "/api/clinical-context/42") {
        expect(request.headers().authorization).toBe("Bearer synthetic-ui-token");
        if (switched) { held.identity = route; return; }
        return reply(route, identityBody(originalClinic));
      }
      if (path === "/api/exam-requests/42/history") {
        expect(request.headers().authorization).toBe("Bearer synthetic-ui-token");
        const offset = Number(new URL(request.url()).searchParams.get("offset"));
        offsets[switched ? "current" : "original"].push(offset);
        if (switched) { held.current = route; return; }
        if (mode === "paginacao" && offset === 40) { held.old = route; return; }
        if (refreshing) { held.old = route; return; }
        if (mode === "paginacao" && offset === 20) return reply(route, historyBody(oldPageKey, 93, 40));
        return reply(route, historyBody(oldKey, 91, mode === "paginacao" ? 20 : null));
      }
      return reply(route, []);
    });
    await page.goto("/cockpit/42/exames");
    const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
    await expect(panel.getByRole("alert")).toContainText(oldKey);
    await expect(panel.getByText(`${oldKey}.pdf`, { exact: true })).toBeVisible();
    if (mode === "paginacao") {
      await panel.getByRole("button", { name: "Mais antigos", exact: true }).click();
      await expect(panel.getByText(`${oldPageKey}.pdf`, { exact: true })).toBeVisible();
      await expect(panel.getByRole("alert")).toContainText(oldPageKey);
      await expect(panel.getByRole("button", { name: "Mais recentes", exact: true })).toBeEnabled();
      await panel.getByRole("button", { name: "Mais antigos", exact: true }).click();
    } else {
      refreshing = true;
      await panel.getByRole("button", { name: "Atualizar histórico" }).click();
    }
    await expect.poll(() => !!held.old).toBe(true);
    expect(offsets.original).toEqual(mode === "paginacao" ? [0, 20, 40] : [0, 0]);
    switched = true;
    await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
    await expect.poll(() => !!held.identity).toBe(true);
    await expect(panel).toBeHidden();
    // Observe BEFORE identity B is released: cached A must not flash on the
    // first render of B, nor when either history response later settles.
    await page.evaluate(keys => {
      (window as any).__clinicHistoryLeaks = [];
      new MutationObserver(records => {
        const region = document.querySelector('[aria-label="Histórico de pedidos de exames"]');
        for (const key of keys) {
          const leaked = (node: Node) => {
            const element = node instanceof Element ? node : node.parentElement;
            return !!element?.closest('[aria-label="Histórico de pedidos de exames"]')
              && !element.closest("[hidden]") && !!node.textContent?.includes(key);
          };
          if ((region && !region.closest("[hidden]") && region.textContent?.includes(key))
            || records.some(record => [...record.addedNodes].some(leaked)
              || (record.type === "characterData" && leaked(record.target)))) {
            (window as any).__clinicHistoryLeaks.push(key);
          }
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    }, oldMarkers);
    await reply(held.identity!, identityBody(nextClinic));
    const draft = page.getByRole("region", { name: "Rascunho clínico", exact: true });
    await expect(draft).toContainText(nextClinic.name);
    await expect(draft).toContainText(client.name);
    await expect(draft).toContainText(professional.name);
    await expect.poll(() => !!held.current).toBe(true);
    expect(offsets.current).toEqual([0]);
    await expect(panel.getByRole("status")).toHaveText("Carregando histórico…");
    await expect(panel.getByRole("button", { name: "Mais recentes", exact: true })).toBeDisabled();
    await expect(panel).not.toContainText(oldKey);
    for (const id of [91, 93, 94]) {
      await expect(panel.getByRole("checkbox", { name: `Selecionar documento ${id} para envio` })).toHaveCount(0);
    }
    await reply(held.current!, historyBody(newKey, 92));
    await expect(panel.getByRole("alert")).toContainText(newKey);
    await expect(panel.getByText(`${newKey}.pdf`, { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__parsedHistory)).toBe(mode === "paginacao" ? 3 : 2);
    if (mode === "paginacao") {
      // Arm B's controls, but never submit. An old auth error must neither
      // revoke B's permission nor clear B's freshly granted consent.
      await panel.getByRole("checkbox", { name: "Selecionar documento 92 para envio" }).check();
      await panel.getByRole("checkbox", { name: "E-mail", exact: true }).check();
      await panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false }).check();
      await expect(panel.getByRole("button", { name: "Confirmar envio", exact: true })).toBeEnabled();
      await page.evaluate(() => {
        const panel = document.querySelector('[aria-label="Histórico de pedidos de exames"]')!;
        const draft = document.querySelector('[aria-label="Rascunho clínico"]')!;
        const snapshot = () => JSON.stringify({
          text: panel.textContent, identity: draft.textContent,
          connected: panel.isConnected && draft.isConnected,
          controls: [...panel.querySelectorAll("button, input")].map(node => {
            const control = node as HTMLInputElement;
            return [control.textContent, control.getAttribute("aria-label"),
              control.disabled, control.checked, control.getAttribute("aria-checked")];
          }),
        });
        const baseline = snapshot();
        (window as any).__clinicControlChanges = [];
        new MutationObserver(records => {
          if (snapshot() !== baseline || records.some(record =>
            record.type === "attributes" && panel.contains(record.target)
            && ["disabled", "checked", "aria-checked", "hidden"].includes(record.attributeName!)
            && record.oldValue !== (record.target as Element).getAttribute(record.attributeName!))) {
            (window as any).__clinicControlChanges.push("Histórico ou controles de B alterados");
          }
        }).observe(document.body, {
          subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true,
        });
      });
    }
    // Identity and B's history have succeeded. Any failure here belongs only
    // to A's outstanding history query, not to identity revalidation.
    const oldBody = mode === "paginacao" ? historyBody(delayedPageKey, 94) : historyBody(oldKey, 91);
    if (outcome === "rede-atrasada") {
      await held.old!.abort("failed");
      await expect.poll(() => page.evaluate(() => (window as any).__failedHistory)).toBe(1);
      expect(await page.evaluate(() => (window as any).__parsedHistory)).toBe(3);
    } else {
      await reply(held.old!, outcome === "sucesso-atrasado" ? oldBody : { error: oldError },
        outcome === "401-atrasado" ? 401 : outcome === "403-atrasado" ? 403 : outcome === "500-atrasado" ? 500 : 200);
      await expect.poll(() => page.evaluate(() => (window as any).__parsedHistory)).toBe(mode === "paginacao" ? 4 : 3);
      expect(await page.evaluate(() => (window as any).__failedHistory)).toBe(0);
    }
    await page.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(panel).not.toContainText(oldKey);
    await expect(panel).not.toContainText(oldError);
    for (const id of [91, 93, 94]) {
      await expect(panel.getByRole("checkbox", { name: `Selecionar documento ${id} para envio` })).toHaveCount(0);
    }
    await expect(panel.getByRole("alert")).toContainText(newKey);
    await expect(panel.getByText(`${newKey}.pdf`, { exact: true })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: "Selecionar documento 92 para envio" })).toBeVisible();
    await expect(draft).toContainText(nextClinic.name);
    await expect(draft).toContainText(client.name);
    await expect(draft).toContainText(professional.name);
    if (mode === "paginacao") {
      await expect(panel.getByRole("checkbox", { name: "Selecionar documento 92 para envio" })).toBeChecked();
      await expect(panel.getByRole("checkbox", { name: "E-mail", exact: true })).toBeChecked();
      await expect(panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false })).toBeChecked();
      await expect(panel.getByRole("button", { name: "Confirmar envio", exact: true })).toBeEnabled();
      await expect(panel.getByRole("button", { name: "Atualizar histórico" })).toBeEnabled();
      await expect(panel.getByRole("button", { name: "Mais antigos", exact: true })).toBeDisabled();
      expect(await page.evaluate(() => (window as any).__clinicControlChanges)).toEqual([]);
    } else {
      await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
      await expect(panel.getByRole("button", { name: "Confirmar envio", exact: true })).toBeDisabled();
    }
    await expect(panel.getByRole("button", { name: "Mais recentes", exact: true })).toBeDisabled();
    expect(offsets.current).toEqual([0]);
    expect(await page.evaluate(() => (window as any).__clinicHistoryLeaks)).toEqual([]);
    await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
    expect(navigations).toBe(1);
    expect(posts).toEqual([]);
    await panel.screenshot({ path: testInfo.outputPath("historico-clinica-isolado.png") });
  });
  }
}

// A cached scope must restart at offset zero, not revive its previous editor.
for (const transition of ["clinica", "empresa", "clinica-e-empresa"] as const) {
  for (const delivery of ["em-B", "apos-retorno-A"] as const) {
    test(`Pedidos: voltar à clínica em cache reinicia histórico — ${transition} — ${delivery}`, async ({ context, page }, testInfo) => {
      const clinicA = { id: 303, empresaId: 404, name: "Clínica A sintética" };
      const clinicB = {
        id: transition === "empresa" ? 303 : 304,
        empresaId: transition === "clinica" ? 404 : 405,
        name: "Clínica B sintética",
      };
      const markers = { first: "A-inicial", page20: "A-antiga-20", page40: "A-atrasada-40", b: "B-exclusiva", fresh: "A-revalidada" };
      let stage: "initial" | "B" | "return" = "initial";
      const offsets: Record<"initial" | "B" | "return", number[]> = { initial: [], B: [], return: [] };
      const methods: string[] = [];
      const posts: string[] = [];
      const held: { identity?: Route; oldPage?: Route; historyB?: Route; returned?: Route } = {};
      let navigations = 0;
      const reply = (route: Route, body: unknown) => route.fulfill({
        contentType: "application/json", body: JSON.stringify(body),
      });
      const historyBody = (key: string, id: number, nextOffset: number | null = null) => ({
        documents: [{ ...document, id, fileName: `${key}.pdf` }],
        dispatches: [], nextOffset,
        pendingOperations: [{
          operationKey: key, state: "needs_review", createdAt: document.createdAt,
          documentIds: [id], channels: ["EMAIL"], results: [],
        }],
      });
      const identityBody = (clinic: typeof clinicA) => ({
        professional, client, clinic, canPrescribe: true, issue: null,
      });
      page.on("request", request => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
      });
      await context.addInitScript(() => {
        localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
        localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
        const originalFetch = window.fetch.bind(window);
        (window as any).__roundtripParsed = 0;
        window.fetch = async (input, init) => {
          const url = input instanceof Request ? input.url : String(input);
          if (!/\/exam-requests\/42\/history/.test(url)) return originalFetch(input, init);
          // Cancellation must not conceal a stale paginated response.
          const response = await originalFetch(input, { ...init, signal: undefined });
          const originalJson = response.json.bind(response);
          response.json = async () => {
            const data = await originalJson();
            (window as any).__roundtripParsed++;
            return data;
          };
          return response;
        };
      });
      await context.route("**/api/**", async route => {
        const request = route.request();
        const url = new URL(request.url());
        methods.push(request.method());
        if (request.method() !== "GET") {
          if (request.method() === "POST") posts.push(url.pathname);
          return reply(route, { error: "Somente GET autorizado neste cenário." });
        }
        if (url.pathname === "/api/collaborator/me") return reply(route, { professional });
        if (url.pathname === "/api/clients") return reply(route, [client]);
        if (url.pathname === "/api/clients/42") return reply(route, client);
        if (url.pathname === "/api/clinical-context/42") {
          expect(request.headers().authorization).toBe("Bearer synthetic-ui-token");
          if (stage !== "initial") { held.identity = route; return; }
          return reply(route, identityBody(clinicA));
        }
        if (url.pathname === "/api/exam-requests/42/history") {
          expect(request.headers().authorization).toBe("Bearer synthetic-ui-token");
          const offset = Number(url.searchParams.get("offset"));
          offsets[stage].push(offset);
          if (stage === "B") { held.historyB = route; return; }
          if (stage === "return") { held.returned = route; return; }
          if (offset === 40) { held.oldPage = route; return; }
          return reply(route, offset === 20
            ? historyBody(markers.page20, 93, 40) : historyBody(markers.first, 91, 20));
        }
        return reply(route, []);
      });
      await page.goto("/cockpit/42/exames");
      const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
      const draft = page.getByRole("region", { name: "Rascunho clínico", exact: true });
      const doc = (id: number) => panel.getByRole("checkbox", { name: `Selecionar documento ${id} para envio`, exact: true });
      const consent = panel.getByRole("checkbox", { name: "Conferi os documentos", exact: false });
      const confirm = panel.getByRole("button", { name: "Confirmar envio", exact: true });
      const prepare = async (id: number) => {
        await doc(id).check();
        await panel.getByRole("checkbox", { name: "E-mail", exact: true }).check();
        await panel.getByRole("checkbox", { name: "Telegram", exact: true }).check();
        await consent.check();
        await expect(confirm).toBeEnabled();
      };
      const cleared = async () => {
        await expect(panel.getByRole("checkbox", { checked: true })).toHaveCount(0);
        await expect(panel).toContainText("0 documento(s) selecionado(s)");
        await expect(consent).not.toBeChecked();
        await expect(confirm).toBeDisabled();
        await expect(panel.getByRole("button", { name: "Mais recentes", exact: true })).toBeDisabled();
      };
      await expect(doc(91)).toBeVisible();
      await panel.getByRole("button", { name: "Mais antigos", exact: true }).click();
      await expect(doc(93)).toBeVisible();
      await expect(panel.getByRole("button", { name: "Mais recentes", exact: true })).toBeEnabled();
      await prepare(93);
      await panel.getByRole("button", { name: "Mais antigos", exact: true }).click();
      await expect.poll(() => !!held.oldPage).toBe(true);
      expect(offsets.initial).toEqual([0, 20, 40]);

      // Keep one observer through both transitions; change its forbidden scope
      // only while identity gating has removed the previous history from the DOM.
      await page.evaluate(() => {
        (window as any).__roundtripLeaks = [];
        (window as any).__roundtripForbidden = [];
        (window as any).__roundtripWatchReset = false;
        new MutationObserver(records => {
          const region = document.querySelector('[aria-label="Histórico de pedidos de exames"]');
          for (const key of (window as any).__roundtripForbidden as string[]) {
            const leaked = (node: Node) => {
              const element = node instanceof Element ? node : node.parentElement;
              return !!element?.closest('[aria-label="Histórico de pedidos de exames"]')
                && !!node.textContent?.includes(key);
            };
            if (region?.textContent?.includes(key)
              || records.some(record => [...record.addedNodes].some(leaked)
                || (record.type === "characterData" && leaked(record.target)))) {
              (window as any).__roundtripLeaks.push(key);
            }
          }
          if ((window as any).__roundtripWatchReset && (region?.querySelector('input:checked')
            || region?.textContent?.includes("1 documento(s) selecionado(s)"))) {
            (window as any).__roundtripLeaks.push("seleção/consentimento herdado");
          }
        }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      });
      const revalidate = async (nextStage: "B" | "return", clinic: typeof clinicA, forbidden: string[]) => {
        stage = nextStage;
        held.identity = undefined;
        await page.evaluate(() => window.dispatchEvent(new Event("collab-auth-changed")));
        await expect.poll(() => !!held.identity).toBe(true);
        await expect(panel).toBeHidden();
        await page.evaluate(keys => {
          (window as any).__roundtripForbidden = keys;
          (window as any).__roundtripWatchReset = true;
        }, forbidden);
        await reply(held.identity!, identityBody(clinic));
        await expect(draft).toContainText(clinic.name);
        await expect(draft).toContainText(client.name);
        await expect(draft).toContainText(professional.name);
      };
      await revalidate("B", clinicB, [markers.first, markers.page20, markers.page40]);
      await expect.poll(() => !!held.historyB).toBe(true);
      expect(offsets.B).toEqual([0]);
      await expect(panel.getByRole("status")).toHaveText("Carregando histórico…");
      await cleared();
      await reply(held.historyB!, historyBody(markers.b, 92));
      await expect(doc(92)).toBeVisible();
      await expect(panel.getByRole("alert")).toContainText(markers.b);
      await expect.poll(() => page.evaluate(() => (window as any).__roundtripParsed)).toBe(3);
      const deliverOld = async (parsed: number) => {
        await reply(held.oldPage!, historyBody(markers.page40, 94));
        await expect.poll(() => page.evaluate(() => (window as any).__roundtripParsed)).toBe(parsed);
        await page.evaluate(() => new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      };
      if (delivery === "em-B") {
        await deliverOld(4);
        await expect(doc(92)).toBeVisible();
        await cleared();
      }
      expect(await page.evaluate(() => (window as any).__roundtripLeaks)).toEqual([]);
      // Keep the forbidden-data observer running during intentional selection.
      await page.evaluate(() => { (window as any).__roundtripWatchReset = false; });
      await prepare(92);
      await revalidate("return", clinicA, [markers.b, markers.page20, markers.page40]);
      await expect.poll(() => !!held.returned).toBe(true);
      expect(offsets.return).toEqual([0]);
      // A's initial page must already be in cache: inspect it BEFORE fulfilling
      // its new offset-zero request. A loading-only test would miss cache leaks.
      await expect(doc(91)).toBeVisible();
      await expect(panel.getByRole("alert")).toContainText(markers.first);
      await cleared();
      if (delivery === "apos-retorno-A") await deliverOld(4);
      await expect(doc(91)).toBeVisible();
      await cleared();
      await reply(held.returned!, historyBody(markers.fresh, 95, 20));
      await expect.poll(() => page.evaluate(() => (window as any).__roundtripParsed)).toBe(5);
      await expect(doc(95)).toBeVisible();
      await expect(panel.getByRole("alert")).toContainText(markers.fresh);
      for (const id of [91, 92, 93, 94]) await expect(doc(id)).toHaveCount(0);
      await cleared();
      expect(offsets).toEqual({ initial: [0, 20, 40], B: [0], return: [0] });
      expect(await page.evaluate(() => (window as any).__roundtripLeaks)).toEqual([]);
      expect([...new Set(methods)]).toEqual(["GET"]);
      expect(posts).toEqual([]);
      expect(navigations).toBe(1);
      await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
      await panel.screenshot({ path: testInfo.outputPath("retorno-clinica-cache-seguro.png") });
    });
  }
}

// Transition contract: render A's pending operation, hold a refresh, switch scope
// without reloading, then settle B before releasing A (success or 401). B must
// never render A's cached/late data or error, including when B itself returns 401.
for (const transition of ["paciente", "medico"] as const) {
  for (const outcome of ["sucesso-atrasado", "401-atrasado", "401-atual"] as const) {
    test(`Pedidos: isolar pendências ao trocar ${transition} — ${outcome}`, async ({ context, page }, testInfo) => {
      const nextClient = { ...client, id: 43, name: "Outro Cliente Sintético" };
      const nextProfessional = { ...professional, id: 203, name: "Outro Médico Sintético" };
      const oldKey = "pendencia-exclusiva-do-contexto-anterior";
      const newKey = "pendencia-exclusiva-do-contexto-atual";
      let switched = false;
      let refreshing = false;
      let posts = 0;
      const held: { old?: Route; current?: Route } = {};
      const historyBody = (operationKey: string, id: number) => ({
        documents: [{ ...document, id, fileName: `${operationKey}.pdf` }],
        dispatches: [], nextOffset: null,
        pendingOperations: [{
          operationKey, state: "needs_review", createdAt: document.createdAt,
          documentIds: [id], channels: ["EMAIL"], results: [],
        }],
      });
      const reply = (route: Route, body: unknown, status = 200) => route.fulfill({
        status, contentType: "application/json", body: JSON.stringify(body),
      });
      await context.addInitScript(() => {
        localStorage.setItem("padcom_collab_token", "synthetic-ui-token");
        localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 202, name: "Médico Sintético", role: "medico" }));
        // Force late responses to arrive even after React Query cancels the old
        // observer. Otherwise a test can pass solely because fetch was aborted.
        const originalFetch = window.fetch.bind(window);
        (window as any).__settledHistory = 0;
        window.fetch = async (input, init) => {
          const url = input instanceof Request ? input.url : String(input);
          if (!/\/exam-requests\/\d+\/history/.test(url)) return originalFetch(input, init);
          const response = await originalFetch(input, { ...init, signal: undefined });
          (window as any).__settledHistory++;
          return response;
        };
      });
      // No request reaches the API, a real patient, or a messaging provider.
      await context.route("**/api/**", async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === "POST") posts++;
        const activeProfessional = switched && transition === "medico" ? nextProfessional : professional;
        if (path === "/api/collaborator/me") return reply(route, { professional: activeProfessional });
        if (path === "/api/clients") return reply(route, [client, nextClient]);
        const patient = path.includes("/43") ? nextClient : client;
        if (/^\/api\/clients\/(42|43)$/.test(path)) return reply(route, patient);
        if (/^\/api\/clinical-context\/(42|43)$/.test(path)) return reply(route, {
          professional: activeProfessional, client: patient,
          clinic: { id: 303, empresaId: 404, name: "Clínica Sintética" },
          canPrescribe: true, issue: null,
        });
        if (/^\/api\/exam-requests\/(42|43)\/history$/.test(path)) {
          expect(request.headers().authorization).toBe(
            switched && transition === "medico" ? "Bearer synthetic-next-token" : "Bearer synthetic-ui-token",
          );
          if (switched) { held.current = route; return; }
          if (refreshing) { held.old = route; return; }
          return reply(route, historyBody(oldKey, 91));
        }
        return reply(route, []);
      });
      await page.goto("/cockpit/42/exames");
      const panel = page.getByRole("region", { name: "Histórico de pedidos de exames" });
      await expect(panel.getByRole("alert")).toContainText(oldKey);
      refreshing = true;
      await panel.getByRole("button", { name: "Atualizar histórico" }).click();
      await expect.poll(() => !!held.old).toBe(true);
      switched = true;
      if (transition === "paciente") {
        // Wouter's same-document navigation preserves the query cache and the
        // outstanding fetch; page.goto/reload would erase the race being tested.
        await page.evaluate(() => {
          window.history.pushState(null, "", "/cockpit/43/exames");
          window.dispatchEvent(new PopStateEvent("popstate"));
        });
        await expect(page).toHaveURL(/\/cockpit\/43\/exames$/);
      } else {
        // Same event and storage contract as setCollabSession, without logout,
        // reload, or a real professional's credentials.
        await page.evaluate(prof => {
          localStorage.setItem("padcom_collab_token", "synthetic-next-token");
          localStorage.setItem("padcom_collab_prof", JSON.stringify(prof));
          window.dispatchEvent(new Event("collab-auth-changed"));
        }, nextProfessional);
        await expect(page).toHaveURL(/\/cockpit\/42\/exames$/);
      }
      await expect.poll(() => !!held.current).toBe(true);
      await expect(panel.getByRole("status")).toHaveText("Carregando histórico…");
      await expect(panel).not.toContainText(oldKey);
      await expect(panel.getByRole("checkbox", { name: "Selecionar documento 91 para envio" })).toHaveCount(0);
      // Watch every subsequent DOM update as well as the final state, so a
      // transient reappearance cannot be hidden by a later successful render.
      await page.evaluate(key => {
        (window as any).__historyLeaks = [];
        new MutationObserver(() => {
          const region = document.querySelector('[aria-label="Histórico de pedidos de exames"]');
          if (region?.textContent?.includes(key)) (window as any).__historyLeaks.push(key);
        }).observe(document.body, { subtree: true, childList: true, characterData: true });
      }, oldKey);
      if (outcome === "401-atual") {
        await reply(held.current!, { error: "Sessão atual sem autorização para consultar histórico." }, 401);
        await expect(panel.getByRole("alert")).toContainText("Sessão atual sem autorização para consultar histórico.");
        await expect(panel.getByRole("alert")).toContainText("Isso não confirma falha no envio");
        await expect(panel).not.toContainText(newKey);
      } else {
        await reply(held.current!, historyBody(newKey, 92));
        await expect(panel.getByRole("alert")).toContainText(newKey);
        await expect(panel.getByRole("checkbox", { name: "Selecionar documento 92 para envio" })).toBeVisible();
      }
      if (outcome === "401-atrasado") {
        await reply(held.old!, { error: "Erro de autenticação exclusivo da sessão anterior." }, 401);
      } else {
        await reply(held.old!, historyBody(oldKey, 91));
      }
      await expect.poll(() => page.evaluate(() => (window as any).__settledHistory)).toBe(3);
      // Let React Query's scheduled notifications and the DOM observer finish.
      await page.evaluate(() => new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(panel).not.toContainText(oldKey);
      await expect(panel).not.toContainText("Erro de autenticação exclusivo da sessão anterior.");
      await expect(panel.getByRole("checkbox", { name: "Selecionar documento 91 para envio" })).toHaveCount(0);
      await expect(panel.getByRole("alert")).toContainText(outcome === "401-atual"
        ? "Sessão atual sem autorização para consultar histórico." : newKey);
      expect(await page.evaluate(() => (window as any).__historyLeaks)).toEqual([]);
      expect(posts).toBe(0);
      await panel.screenshot({ path: testInfo.outputPath("historico-contexto-isolado.png") });
    });
  }
}
