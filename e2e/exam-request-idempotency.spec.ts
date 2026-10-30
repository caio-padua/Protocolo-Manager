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
for (const mount of ["cockpit", "mesma-instancia"] as const) {
  for (const transition of ["paciente", "medico", "paciente-circular"] as const) {
    for (const outcome of ["sucesso-atrasado", "erro-atrasado"] as const) {
      test(`Pedidos: isolar resposta de envio ao trocar ${transition} — ${outcome} — ${mount}`, async ({ context, page }, testInfo) => {
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
            operationKey: oldBody.operationKey, replayed: false, state: "completed", needsReview: false,
            message: oldMessage, results: [{ channel: "EMAIL", success: true, auditId: 808 }],
          });
        } else {
          await reply(heldSend!, { error: oldError }, 500);
        }
        await expect.poll(() => page.evaluate(() => (window as any).__settledSends)).toBe(1);
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
        expect(posts).toHaveLength(1);
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
        await panel.screenshot({ path: testInfo.outputPath("envio-contexto-isolado.png") });
      });
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
