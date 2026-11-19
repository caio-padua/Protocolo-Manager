import { test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type RouteEntry = {
  ordinal: number;
  sourceLine: number;
  declaredPath: string;
  testPath: string | null;
  classification: "screen" | "redirect-or-alias" | "container" | "fallback";
};

const root = process.cwd();
const routeSource = readFileSync(join(root, "artifacts/padcom/src/App.tsx"), "utf8");
const routes: RouteEntry[] = [...routeSource.matchAll(/<Route\s+path="([^"]*)"/g)].map((match, index) => {
  const declaredPath = match[1];
  const sourceLine = routeSource.slice(0, match.index).split("\n").length;
  const isContainer = declaredPath.includes(":rest*");
  const isAlias = [
    "/portal",
    "/anamnese",
    "/clients/:id",
    "/cockpit/:clientId",
    "/cockpit-cliente",
    "/cockpit-cliente/:rest*",
    "/consulta",
    "/configuracoes/meu-acesso",
  ].includes(declaredPath);

  let testPath = declaredPath
    .replace(":clientId", "424242")
    .replace(":id", "424242")
    .replace(":aba", "prescricao")
    .replace(":token", "synthetic-invalid-token");
  if (testPath === "/sign-in/*?" || testPath === "/sign-up/*?") {
    testPath = testPath.startsWith("/sign-in") ? "/sign-in" : "/sign-up";
  }
  if (testPath.includes(":rest*")) testPath = null;

  return {
    ordinal: index + 1,
    sourceLine,
    declaredPath,
    testPath,
    classification: isContainer ? "container" : isAlias ? "redirect-or-alias" : "screen",
  };
});

routes.push({
  ordinal: routes.length + 1,
  sourceLine: routeSource.split("\n").findIndex(line => line.includes("<Route component={NotFound} />")) + 1,
  declaredPath: "<rota de fallback sem caminho>",
  testPath: "/__mobile-audit-route-that-does-not-exist__",
  classification: "fallback",
});

const viewports = [
  { id: "iphone-portrait", width: 390, height: 844, deviceScaleFactor: 3 },
  { id: "iphone-landscape", width: 844, height: 390, deviceScaleFactor: 3 },
  { id: "android-portrait", width: 360, height: 800, deviceScaleFactor: 2 },
  { id: "android-landscape", width: 800, height: 360, deviceScaleFactor: 2 },
] as const;

const batchStart = Math.max(0, Number(process.env.PADCOM_AUDIT_START ?? 0));
const batchEnd = Math.min(routes.length, Number(process.env.PADCOM_AUDIT_END ?? routes.length));
const selectedRoutes = routes.slice(batchStart, batchEnd);
const baseUrl = process.env.PADCOM_BASE_URL ?? "http://localhost:18148";
const outputRoot = join(root, "generated-artifacts/mobile-audit");
const screenshotRoot = join(outputRoot, "screenshots");

for (const viewport of viewports) {
  test(`Padcon móvel: inventário de rotas em ${viewport.id}`, async ({ browser }) => {
    test.setTimeout(0);
    mkdirSync(join(screenshotRoot, viewport.id), { recursive: true });

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      screen: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "synthetic-mobile-audit-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({
        id: 424242,
        name: "Colaborador de Teste",
        role: "medico",
      }));
    });

    const apiCalls: { method: string; path: string; disposition: string }[] = [];
    const externalAttempts: string[] = [];
    await context.route("**/*", async route => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      const localOrigin = new URL(baseUrl).origin;
      if (requestUrl.origin !== localOrigin) {
        externalAttempts.push(requestUrl.origin);
        return route.abort();
      }
      if (!requestUrl.pathname.startsWith("/api/")) return route.continue();

      const method = request.method().toUpperCase();
      apiCalls.push({
        method,
        path: requestUrl.pathname,
        disposition: method === "GET" || method === "HEAD" ? "synthetic-read" : "blocked-write",
      });

      if (method !== "GET" && method !== "HEAD") {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Mobile audit blocks writes" }),
        });
      }

      let body: unknown = [];
      if (requestUrl.pathname === "/api/collaborator/me") {
        body = {
          professional: {
            id: 424242,
            name: "Colaborador de Teste",
            role: "medico",
            category: "medico",
            isPrimaryDoctor: true,
            isPlatformOwner: true,
            cpf: null,
            photoUrl: null,
            googleLinked: false,
          },
        };
      } else if (requestUrl.pathname === "/api/settings/governanca") {
        body = { matriz: {} };
      } else if (requestUrl.pathname === "/api/menu") {
        body = { items: [] };
      } else if (/\/api\/clients\/\d+\/fotos-corpo/.test(requestUrl.pathname)) {
        body = { series: [] };
      } else if (/\/api\/clients\/\d+$/.test(requestUrl.pathname)) {
        body = {
          id: 424242,
          name: "Cliente Sintético",
          cpf: null,
          phone: null,
          email: null,
          photoUrl: null,
          birthDate: null,
          address: null,
          notes: null,
          status: "active",
          telegramLinked: false,
        };
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    const page = await context.newPage();
    await page.goto(new URL("/", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(700);
    const results: Record<string, unknown>[] = [];
    for (const entry of selectedRoutes) {
      if (!entry.testPath) {
        results.push({
          ...entry,
          viewport: viewport.id,
          outcome: "container-only",
          explanation: "Rota estrutural; as rotas filhas são inventariadas separadamente.",
        });
        continue;
      }

      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      const onPageError = (error: Error) => pageErrors.push(error.message.slice(0, 500));
      const onConsole = (message: import("@playwright/test").ConsoleMessage) => {
        if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
      };
      page.on("pageerror", onPageError);
      page.on("console", onConsole);
      const apiStart = apiCalls.length;
      const externalStart = externalAttempts.length;
      const startedAt = Date.now();
      let navigationError: string | null = null;
      let finalPath = entry.testPath;

      try {
        const path = entry.testPath;
        const publicStandalone = [
          "/login", "/sign-in", "/sign-up", "/login/google-return",
          "/login/google-link-return", "/portal", "/consulta-receituario",
          "/foto", "/cadastro", "/agendar/status", "/agendar-antigo",
          "/agendar", "/anamnese", "/anamnese/v2", "/area", "/guia-digital",
          "/entrada", "/licenciado", "/vitrine", "/abertura", "/marca-molde",
          "/pawards", "/tipografia", "/lei-do-numeral",
        ].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
        await page.evaluate(({ nextPath, authenticated }) => {
          const tokenKey = "padcom_collab_token";
          const profileKey = "padcom_collab_prof";
          if (authenticated) {
            localStorage.setItem(tokenKey, "synthetic-mobile-audit-token");
            localStorage.setItem(profileKey, JSON.stringify({
              id: 424242,
              name: "Colaborador de Teste",
              role: "medico",
            }));
          } else {
            localStorage.removeItem(tokenKey);
            localStorage.removeItem(profileKey);
          }
          window.dispatchEvent(new Event("collab-auth-changed"));
          window.history.pushState({}, "", nextPath);
          window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
        }, { nextPath: path, authenticated: !publicStandalone });
        await page.waitForTimeout(350);
        finalPath = new URL(page.url()).pathname;
      } catch (error) {
        navigationError = String(error).slice(0, 500);
      }

      const measurements = await page.evaluate(() => {
        const visible = (element: Element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const targets = Array.from(document.querySelectorAll(
          "button, a[href], input, select, textarea, [role='button']",
        )).filter(visible).map(element => {
          const rect = element.getBoundingClientRect();
          return { width: Math.round(rect.width), height: Math.round(rect.height) };
        });
        const smallTargets = targets.filter(target => target.width < 44 || target.height < 44).length;
        const textLength = (document.body?.innerText ?? "").trim().length;
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body?.scrollWidth ?? 0,
          horizontalOverflowPx: Math.max(
            0,
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
            (document.body?.scrollWidth ?? 0) - (document.body?.clientWidth ?? 0),
          ),
          documentHeight: document.documentElement.scrollHeight,
          verticalScrollable: document.documentElement.scrollHeight > window.innerHeight + 2,
          visibleControlCount: targets.length,
          controlsBelow44Px: smallTargets,
          visibleTextLength: textLength,
        };
      });

      const slug = `${String(entry.ordinal).padStart(3, "0")}-${entry.declaredPath
        .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "home"}`;
      const screenshotPath = join(screenshotRoot, viewport.id, `${slug}.jpg`);
      try {
        await page.screenshot({ path: screenshotPath, type: "jpeg", quality: 45 });
      } catch (error) {
        navigationError ??= `Screenshot failed: ${String(error).slice(0, 300)}`;
      }

      let outcome = "rendered";
      let explanation: string | null = null;
      if (navigationError) {
        outcome = "navigation-error";
        explanation = navigationError;
      } else if (finalPath === "/login" && !["/login", "/sign-in", "/sign-up"].includes(entry.testPath)) {
        outcome = "auth-blocked";
        explanation = "O caminho redirecionou para login apesar da sessão sintética; precisa de análise específica.";
      } else if (pageErrors.length > 0) {
        outcome = "runtime-error";
        explanation = "A tela lançou erro no navegador; avaliar se o contrato sintético está correto antes de atribuir ao produto.";
      } else if (measurements.visibleTextLength < 5) {
        outcome = "empty-or-loading";
        explanation = "Nenhum texto visível suficiente após a janela de espera.";
      } else if (measurements.horizontalOverflowPx > 0) {
        outcome = "horizontal-overflow";
        explanation = "A página excede a largura visível; verificar se é rolagem intencional ou defeito.";
      }

      results.push({
        ...entry,
        viewport: viewport.id,
        outcome,
        explanation,
        finalPath,
        durationMs: Date.now() - startedAt,
        measurements,
        pageErrors,
        consoleErrors: consoleErrors.slice(0, 5),
        apiRequestCount: apiCalls.length - apiStart,
        blockedWriteCount: apiCalls.slice(apiStart).filter(call => call.disposition === "blocked-write").length,
        externalAttemptCount: externalAttempts.length - externalStart,
        screenshot: resolve(screenshotPath).replace(`${root}/`, ""),
      });

      page.off("pageerror", onPageError);
      page.off("console", onConsole);
    }

    const reportPath = join(outputRoot, `${viewport.id}-${batchStart}-${batchEnd}.json`);
    mkdirSync(outputRoot, { recursive: true });
    writeFileSync(reportPath, JSON.stringify({
      environment: "Chromium com métricas móveis simuladas; APIs locais sintéticas; gravações e serviços externos bloqueados.",
      routeDeclarations: routes.length,
      batch: { start: batchStart, end: batchEnd, total: selectedRoutes.length },
      viewport,
      results,
      networkSafety: {
        blockedWrites: apiCalls.filter(call => call.disposition === "blocked-write").length,
        externalAttemptsAborted: externalAttempts.length,
      },
    }, null, 2));

    await context.close();
  });
}
