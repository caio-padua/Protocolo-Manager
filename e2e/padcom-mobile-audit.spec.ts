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
const routeLines = routeSource.split("\n");
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
  sourceLine: routeLines.findLastIndex(line => line.includes("<Route component={NotFound} />")) + 1,
  declaredPath: "<rota de fallback sem caminho>",
  testPath: "/__mobile-audit-route-that-does-not-exist__",
  classification: "fallback",
});

const notFoundLines = routeLines.flatMap((line, index) =>
  line.includes("<Route component={NotFound} />") ? [index + 1] : [],
);
const pathlessDeclarations: Omit<RouteEntry, "ordinal">[] = [
  {
    sourceLine: routeLines.findIndex(line => line.trim() === "<Route>") + 1,
    declaredPath: "<contêiner interno sem caminho>",
    testPath: null,
    classification: "container",
  },
  {
    sourceLine: notFoundLines[0],
    declaredPath: "<fallback interno de cadastros>",
    testPath: "/cadastros/__mobile-audit-unknown__",
    classification: "fallback",
  },
  {
    sourceLine: notFoundLines[1],
    declaredPath: "<fallback interno de configurações>",
    testPath: "/configuracoes/__mobile-audit-unknown__",
    classification: "fallback",
  },
  {
    sourceLine: notFoundLines[2],
    declaredPath: "<fallback interno do financeiro>",
    testPath: "/financeiro/__mobile-audit-unknown__",
    classification: "fallback",
  },
];
routes.push(...pathlessDeclarations.map((entry, index) => ({
  ...entry,
  ordinal: routes.length + index + 1,
})));

const viewports = [
  { id: "iphone-portrait", width: 390, height: 844, deviceScaleFactor: 3 },
  { id: "iphone-landscape", width: 844, height: 390, deviceScaleFactor: 3 },
  { id: "android-portrait", width: 360, height: 800, deviceScaleFactor: 2 },
  { id: "android-landscape", width: 800, height: 360, deviceScaleFactor: 2 },
  { id: "desktop", width: 1280, height: 720, deviceScaleFactor: 1 },
] as const;
const viewportFilter = process.env.PADCOM_AUDIT_VIEWPORT;
const selectedViewports = viewportFilter
  ? viewports.filter(viewport => viewport.id === viewportFilter)
  : viewports;
if (viewportFilter && selectedViewports.length === 0) {
  throw new Error(`Unknown mobile audit viewport: ${viewportFilter}`);
}

const batchStart = Math.max(0, Number(process.env.PADCOM_AUDIT_START ?? 0));
const batchEnd = Math.min(routes.length, Number(process.env.PADCOM_AUDIT_END ?? routes.length));
const selectedRoutes = routes.slice(batchStart, batchEnd);
const baseUrl = process.env.PADCOM_BASE_URL ?? "http://localhost:18148";
const outputRoot = join(root, "generated-artifacts/mobile-audit");
const screenshotRoot = join(outputRoot, "screenshots");

for (const viewport of selectedViewports) {
  test(`Padcon móvel: inventário de rotas em ${viewport.id}`, async ({ browser }) => {
    test.setTimeout(0);
    mkdirSync(join(screenshotRoot, viewport.id), { recursive: true });

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      screen: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.id !== "desktop",
      hasTouch: viewport.id !== "desktop",
    });
    await context.addInitScript(() => {
      localStorage.setItem("padcom_collab_token", "synthetic-mobile-audit-token");
      localStorage.setItem("padcom_collab_prof", JSON.stringify({
        id: 424242,
        name: "Colaborador de Teste",
        role: "medico",
      }));
      const isBlockedClerkFailure = (value: unknown) =>
        /failed_to_load_clerk_js|failed to load clerk js/i.test(String(value));
      window.addEventListener("error", event => {
        if (isBlockedClerkFailure(event.message || event.error)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
      window.addEventListener("unhandledrejection", event => {
        if (isBlockedClerkFailure(event.reason)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
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
      const syntheticClientIdentification = method === "POST"
        && requestUrl.pathname === "/api/client-portal/identify";
      apiCalls.push({
        method,
        path: requestUrl.pathname,
        disposition: syntheticClientIdentification
          ? "synthetic-authentication"
          : method === "GET" || method === "HEAD" ? "synthetic-read" : "blocked-write",
      });

      if (syntheticClientIdentification) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: 424242,
            name: "Cliente Sintético",
            cpf: "123.456.789-01",
            token: "synthetic-client-portal-token",
          }),
        });
      }

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
      } else if (requestUrl.pathname === "/api/catalogo/admin") {
        body = { planos: [], itens: [], tarifas: [], custos: [], config: {} };
      } else if (requestUrl.pathname === "/api/catalogo/admin/margem") {
        body = {
          linhas: [],
          aviso: "",
          real: { custoCentavos: null },
          hipotese: { custoCentavos: null, margemPct: null, rotulo: "Cenário sintético" },
        };
      } else if (requestUrl.pathname === "/api/cofre/estado") {
        body = { credenciais: [] };
      } else if (requestUrl.pathname === "/api/catalogo/admin/contratos") {
        body = [];
      } else if (requestUrl.pathname === "/api/dashboard/summary") {
        body = {
          totalClients: 0,
          activeProtocols: 0,
          sessionsTodayCount: 0,
          sessionsThisWeekCount: 0,
          pendingPaymentsCount: 0,
          pendingPaymentsValue: 0,
          stockAlertsCount: 0,
          completionRate: 0,
          revenueThisMonth: 0,
          missedSessionsCount: 0,
        };
      } else if (
        requestUrl.pathname === "/api/dashboard/upcoming-sessions"
        || requestUrl.pathname === "/api/dashboard/alerts"
      ) {
        body = [];
      } else if (requestUrl.pathname === "/api/dashboard/protocol-stats") {
        body = { byStatus: [], byServiceType: [], topSubstances: [], revenueByMonth: [] };
      } else if (requestUrl.pathname === "/api/exames-lab/monitor") {
        body = { stats: [], pendentes: [] };
      } else if (requestUrl.pathname === "/api/importar-drive/status") {
        body = {
          status: "idle",
          mode: null,
          scope: "active",
          startedAt: null,
          finishedAt: null,
          currentFolder: null,
          message: "",
          totals: {
            foldersScanned: 0,
            foldersTotal: 0,
            filesFound: 0,
            ingested: 0,
            duplicates: 0,
            labDocs: 0,
            imageDocs: 0,
            nonExam: 0,
            errors: 0,
            noMatch: 0,
            homonimUnited: 0,
            skippedInactive: 0,
          },
          recent: [],
        };
      } else if (requestUrl.pathname === "/api/system-errors") {
        body = { resumo: { ultima_hora: 0, ultimas_24h: 0 }, erros: [] };
      } else if (/\/api\/integrations\/[^/]+$/.test(requestUrl.pathname)) {
        const provider = requestUrl.pathname.split("/").at(-1) ?? "integration";
        body = {
          provider,
          label: provider,
          hasToggle: true,
          enabled: false,
          configured: false,
          missingCount: 0,
          allowCustom: true,
          fields: [],
          custom: [],
        };
      } else if (/\/api\/ceo\/identidade\/foto-(ceo|medico)$/.test(requestUrl.pathname)) {
        return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No synthetic photo" }) });
      } else if (requestUrl.pathname === "/api/ceo/identidade") {
        body = {
          medicoAtivo: false,
          temFotoCeo: false,
          fotoExibida: "nenhuma",
          medico: null,
        };
      } else if (requestUrl.pathname === "/api/ceo/clinicas-responsaveis") {
        body = { clinicas: [], profissionais: [] };
      } else if (requestUrl.pathname === "/api/reconciliation") {
        body = {
          items: [],
          summary: {
            total: 0,
            ok: 0,
            missingLocal: 0,
            missingRemote: 0,
            statusMismatch: 0,
            valueMismatch: 0,
          },
        };
      } else if (requestUrl.pathname === "/api/asaas/conciliacao/extrato") {
        body = { linhas: [], totais: {} };
      } else if (requestUrl.pathname === "/api/asaas/teste-cobrancas") {
        body = { items: [], cobrancas: [], total: 0 };
      } else if (requestUrl.pathname === "/api/duvidas-orientacoes") {
        body = { orientacoes: [], podeAprovar: false, clinica: "Clínica Sintética" };
      } else if (requestUrl.pathname === "/api/duvidas-orientacoes/atendimento/estado") {
        body = {
          modoIA: "desligado",
          queixaRevisada: false,
          emAtendimentoHumano: [],
          pendencias: [],
        };
      } else if (requestUrl.pathname === "/api/duvidas-orientacoes/tom-de-voz") {
        body = { tom: null, podeAprovar: false, limite: 4000, clinica: "Clínica Sintética" };
      } else if (requestUrl.pathname === "/api/duvidas-orientacoes/propostas-internas") {
        body = [];
      } else if (requestUrl.pathname === "/api/lembretes") {
        body = { lembretes: [] };
      } else if (requestUrl.pathname === "/api/whatsapp/stats") {
        body = { total: 0, enviados: 0, entregues: 0, falhas: 0, semTwilio: 0, porStatus: {} };
      } else if (requestUrl.pathname === "/api/whatsapp/messages") {
        body = { messages: [] };
      } else if (requestUrl.pathname === "/api/telegram-inbox/painel-operacional") {
        body = { modos: { atendimentoIa: "desligado", atendimentoLista: 0 } };
      } else if (requestUrl.pathname === "/api/prova-de-valor/por-empresa") {
        body = {
          de: "2026-01-01T00:00:00.000Z",
          ate: "2026-01-02T00:00:00.000Z",
          totais: {
            receitasEmitidas: 0,
            documentosEntregues: 0,
            duvidasRespondidas: 0,
            lembretesEntregues: 0,
            laudosProcessados: 0,
          },
          por_empresa: [],
        };
      } else if (requestUrl.pathname === "/api/vitrine-leads") {
        body = { leads: [] };
      } else if (requestUrl.pathname === "/api/assinaturas/timeline") {
        body = { itens: [] };
      } else if (requestUrl.pathname === "/api/assinaturas/templates") {
        body = { templates: [] };
      } else if (requestUrl.pathname === "/api/assinaturas/clausulas") {
        body = { clausulas: [] };
      } else if (requestUrl.pathname === "/api/settings/esignature") {
        body = { provider: "synthetic", active: false, tokenStatus: { isSet: false } };
      } else if (requestUrl.pathname === "/api/motor/craniotomia") {
        body = { dendritos: [], corpoCelular: [], axonios: [], ligacoes: [], perfis: [] };
      } else if (requestUrl.pathname === "/api/pedidos-medicos/fila") {
        body = [];
      } else if (requestUrl.pathname === "/api/pedidos-medicos/precos") {
        body = { minimo: 0, valores: { receita: null, pedido_exames: null } };
      } else if (requestUrl.pathname === "/api/exames-avulsos/fila") {
        body = [];
      } else if (requestUrl.pathname === "/api/boloes/gestao/resumo") {
        body = { emRevisao: 0, config: { driveFolderId: null, autoAprovar: false } };
      } else if (requestUrl.pathname === "/api/boloes/gestao/recebimentos") {
        body = { recebimentos: [] };
      } else if (requestUrl.pathname === "/api/boloes/gestao/participacoes") {
        body = { participacoes: [], campanhas: [] };
      } else if (requestUrl.pathname === "/api/boloes/gestao/auditoria") {
        body = { eventos: [] };
      } else if (requestUrl.pathname === "/api/agendamento/pit-stop") {
        body = { planos: [] };
      } else if (/\/api\/agendamento\/planos\/\d+$/.test(requestUrl.pathname)) {
        body = { plano: null };
      } else if (requestUrl.pathname === "/api/agenda/settings") {
        body = { id: 1, blockMinutes: 30, triggerPercent: 60, minLeadHours: 24, internalLeadMinutes: 5 };
      } else if (requestUrl.pathname === "/api/agenda/integration") {
        body = {
          agendas: [],
          professionals: [],
          resources: [],
          globalSettingsOwnerOnly: false,
          canManageGlobalSettings: false,
          companyId: 424242,
          companyName: "Clínica Sintética",
        };
      } else if (requestUrl.pathname === "/api/agenda/requests") {
        body = { requests: [] };
      } else if (requestUrl.pathname === "/api/ras/certificate-info") {
        return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No synthetic certificate" }) });
      } else if (/\/api\/ras\/\d+$/.test(requestUrl.pathname)) {
        body = {
          id: 424242,
          sessionId: 424242,
          protocolId: 424242,
          clientId: 424242,
          clientName: "Cliente Sintético",
          clientCpf: "",
          professionalName: "Profissional Sintético",
          unit: "Unidade Sintética",
          serviceDate: "2026-01-01",
          serviceType: "clinic",
          substances: [],
          patientSignature: false,
          professionalSignature: false,
          createdAt: "2026-01-01T12:00:00.000Z",
        };
      } else if (/\/api\/protocols\/\d+$/.test(requestUrl.pathname)) {
        body = {
          id: 424242,
          clientId: 424242,
          clientName: "Cliente Sintético",
          clientCpf: "",
          title: "Protocolo Sintético",
          status: "active",
          startDate: "2026-01-01",
          serviceType: "clinic",
          totalSessions: 0,
          completedSessions: 0,
          totalValue: 0,
          items: [],
          sessions: [],
          createdAt: "2026-01-01T12:00:00.000Z",
          updatedAt: "2026-01-01T12:00:00.000Z",
        };
      } else if (/\/api\/ras\/physical\/\d+\/email-logs$/.test(requestUrl.pathname)) {
        body = { items: [] };
      } else if (requestUrl.pathname === "/api/settings/governanca") {
        body = { matriz: {} };
      } else if (requestUrl.pathname === "/api/menu") {
        body = { items: [] };
      } else if (requestUrl.pathname === "/api/clients/clinicas-origem") {
        body = {
          empresaAtualId: 424242,
          clinicas: [{ id: 424242, nome: "Clínica Sintética", nick: null, razaoSocial: null }],
        };
      } else if (requestUrl.pathname === "/api/clients/agenda-opcoes") {
        body = { locais: [], agendas: [], enfermagemPadraoId: null, medicoPadraoId: null };
      } else if (requestUrl.pathname === "/api/clients/visit-preference-options") {
        body = {
          medical: { days: [], mismatchedResources: [] },
          nursing: { days: [], mismatchedResources: [] },
        };
      } else if (requestUrl.pathname === "/api/area-paciente/resumo") {
        body = {
          client: { name: "Cliente Sintético" },
          protocolsCount: 1,
          activeProtocolsCount: 1,
          totalSessions: 4,
          completedSessions: 1,
          nextSession: {
            id: 424243,
            scheduledDate: "2026-11-23",
            scheduledTime: "09:30",
            unit: "Unidade Sintética",
            status: "scheduled",
          },
        };
      } else if (requestUrl.pathname === "/api/area-paciente/protocolos") {
        body = [{
          id: 424242,
          title: "Protocolo Sintético",
          status: "active",
          startDate: "2026-11-01",
          endDate: null,
          unit: "Unidade Sintética",
          serviceType: "clinic",
          totalSessions: 12,
          completedSessions: 4,
          totalValue: 0,
          items: ["A", "B", "C"].map((suffix, index) => ({
            id: 424250 + index,
            substanceName: `Substância Sintética ${suffix}`,
            color: "#c2a05a",
            procedureType: "intramuscular",
            dose: "1 ml",
            totalSessions: 4,
            completedSessions: 1,
            intervalDays: 14,
            startDate: "2026-11-01",
            frequency: "A cada 14 dias",
            mainFunction: null,
          })),
        }];
      } else if (requestUrl.pathname === "/api/area-paciente/documentos") {
        body = { ras: [], protocols: [] };
      } else if (requestUrl.pathname === "/api/area-paciente/financeiro") {
        body = { totalPago: 0, totalPendente: 0, payments: [] };
      } else if (requestUrl.pathname === "/api/area-paciente/exames/evolucao") {
        body = { columns: [], analytes: [] };
      } else if (requestUrl.pathname === "/api/area-paciente/fotos-corpo") {
        body = { hoje: "2026-11-20", angulos: [], orientacoes: [], series: [] };
      } else if (/\/api\/prontuario\/\d+$/.test(requestUrl.pathname)) {
        body = {
          client: {
            id: 424242,
            nome: "Cliente Sintético",
            cpf: null,
            email: null,
            telefone: null,
            dataNascimento: null,
            foto: null,
            driveFolderId: null,
          },
          prescricoes: [],
          protocolos: [],
          examesIndicados: [],
          examesRecebidos: [],
          analitos: [],
          dietaPrescricoes: [],
          dietaPlanos: [],
          treinoPrescricoes: [],
        };
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
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            label: (
              element.getAttribute("aria-label")
              || element.getAttribute("title")
              || element.getAttribute("placeholder")
              || element.textContent
              || ""
            ).trim().replace(/\s+/g, " ").slice(0, 80),
          };
        });
        const smallTargets = targets.filter(target => target.width < 44 || target.height < 44).length;
        const offscreen = Array.from(document.body.querySelectorAll("*")).filter(element => {
          if (!visible(element)) return false;
          const rect = element.getBoundingClientRect();
          const crossesViewportEdge = rect.left < -2 || rect.right > window.innerWidth + 2;
          const intersectsViewport = rect.right > 0 && rect.left < window.innerWidth;
          return crossesViewportEdge && intersectsViewport;
        });
        const horizontalScrollContainers = Array.from(document.body.querySelectorAll("*")).filter(element => {
          if (!visible(element)) return false;
          const style = getComputedStyle(element);
          return ["auto", "scroll"].includes(style.overflowX)
            && element.scrollWidth > element.clientWidth + 2;
        });
        const offscreenExamples = offscreen
          .map(element => {
            const rect = element.getBoundingClientRect();
            let ancestor = element.parentElement;
            let inHorizontalScroller = false;
            let clippedByAncestor = false;
            while (ancestor && ancestor !== document.body) {
              const overflowX = getComputedStyle(ancestor).overflowX;
              if (["auto", "scroll"].includes(overflowX)) inHorizontalScroller = true;
              if (["hidden", "clip"].includes(overflowX)) clippedByAncestor = true;
              ancestor = ancestor.parentElement;
            }
            return {
              tag: element.tagName.toLowerCase(),
              className: String(element.getAttribute("class") ?? "").slice(0, 100),
              text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              inHorizontalScroller,
              clippedByAncestor,
            };
          })
          .filter(item => !item.inHorizontalScroller)
          .slice(0, 12);
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
          smallTargetExamples: targets
            .filter(target => target.width < 44 || target.height < 44)
            .slice(0, 10),
          offscreenElementCount: offscreenExamples.length,
          offscreenExamples,
          horizontalScrollContainerCount: horizontalScrollContainers.length,
          horizontalScrollContainers: horizontalScrollContainers.slice(0, 8).map(element => ({
            tag: element.tagName.toLowerCase(),
            className: String(element.getAttribute("class") ?? "").slice(0, 100),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          })),
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

      let menuInteraction: Record<string, unknown> | null = null;
      if (entry.testPath === "/") {
        if (viewport.width < 768) {
          const openButton = page.getByRole("button", { name: "Abrir menu", exact: true });
          if (await openButton.count()) {
            const openBox = await openButton.boundingBox();
            await openButton.click({ timeout: 5_000 });
            await page.waitForTimeout(360);
            const sidebar = page.locator("div.fixed.inset-y-0.left-0").first();
            const openPosition = await sidebar.evaluate(element => {
              const rect = element.getBoundingClientRect();
              return { left: Math.round(rect.left), right: Math.round(rect.right) };
            });
            const opened = openPosition.left >= -2 && openPosition.right > 0;
            const menuOpenScreenshot = join(screenshotRoot, viewport.id, `${slug}-menu-open.jpg`);
            await page.screenshot({ path: menuOpenScreenshot, type: "jpeg", quality: 55 });
            const visibleCloseIconButtons = await page.locator("button:has(svg.lucide-x)").evaluateAll(buttons =>
              buttons.map(button => {
                const rect = button.getBoundingClientRect();
                const style = getComputedStyle(button);
                return {
                  label: button.getAttribute("aria-label"),
                  visible: style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0",
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                };
              }),
            );
            const closeButton = sidebar.getByRole("button", { name: "Fechar menu", exact: true });
            const closeBox = await closeButton.boundingBox();
            if (await closeButton.count()) await closeButton.click({ timeout: 5_000 });
            await page.waitForTimeout(360);
            const closed = await sidebar.evaluate(element => element.getBoundingClientRect().right <= 1);
            const menuClosedScreenshot = join(screenshotRoot, viewport.id, `${slug}-menu-closed.jpg`);
            await page.screenshot({ path: menuClosedScreenshot, type: "jpeg", quality: 45 });
            menuInteraction = {
              mode: "gaveta móvel",
              opened,
              closed,
              openPosition,
              openTargetSize: openBox
                ? { width: Math.round(openBox.width), height: Math.round(openBox.height) }
                : null,
              closeTargetSize: closeBox
                ? { width: Math.round(closeBox.width), height: Math.round(closeBox.height) }
                : null,
              targetsAtLeast44Px: Boolean(
                openBox && closeBox
                && openBox.width >= 44 && openBox.height >= 44
                && closeBox.width >= 44 && closeBox.height >= 44
              ),
              visibleCloseIconButtons,
              menuOpenScreenshot,
              menuClosedScreenshot,
            };
          } else {
            menuInteraction = { mode: "gaveta móvel", opened: false, closed: false, reason: "controle não encontrado" };
          }
        } else {
          const collapseButton = page.getByRole("button", { name: "Recolher menu" });
          if (await collapseButton.count()) {
            const collapseBox = await collapseButton.boundingBox();
            let collapsed = false;
            let restored = false;
            let interactionError: string | null = null;
            try {
              await collapseButton.click({ timeout: 15_000 });
              const expandedButton = page.getByRole("button", { name: "Expandir menu" });
              collapsed = await expandedButton.isVisible();
              if (collapsed) {
                await expandedButton.click({ timeout: 15_000 });
                restored = await collapseButton.isVisible();
              }
            } catch (error) {
              interactionError = String(error).slice(0, 300);
            }
            menuInteraction = {
              mode: "menu recolhível",
              collapsed,
              restored,
              interactionError,
              targetAtLeast44Px: Boolean(collapseBox && collapseBox.width >= 44 && collapseBox.height >= 44),
            };
          }
        }
      }

      let verticalTouchPosition = { x: 0, y: 0 };
      let horizontalTouchPosition = { x: 0, y: 0 };
      if (viewport.id !== "desktop") {
        const touchSession = await context.newCDPSession(page);
        const swipe = async (startX: number, startY: number, endX: number, endY: number) => {
          await touchSession.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: startX, y: startY, id: 1 }],
          });
          await touchSession.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: endX, y: endY, id: 1 }],
          });
          await touchSession.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await page.waitForTimeout(100);
          return page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
        };
        await page.evaluate(() => window.scrollTo(0, 0));
        verticalTouchPosition = await swipe(
          Math.round(viewport.width / 2),
          Math.round(viewport.height * 0.75),
          Math.round(viewport.width / 2),
          Math.round(viewport.height * 0.35),
        );
        const verticalScrollScreenshotPath = verticalTouchPosition.y > 0
          ? join(screenshotRoot, viewport.id, `${slug}-vertical.jpg`)
          : null;
        if (verticalScrollScreenshotPath) {
          try {
            await page.screenshot({
              path: verticalScrollScreenshotPath,
              type: "jpeg",
              quality: 45,
            });
          } catch (error) {
            navigationError ??= `Vertical screenshot failed: ${String(error).slice(0, 300)}`;
          }
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        horizontalTouchPosition = await swipe(
          Math.round(viewport.width * 0.75),
          Math.round(viewport.height / 2),
          Math.round(viewport.width * 0.25),
          Math.round(viewport.height / 2),
        );
        await touchSession.detach();
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
        const blockedClerk = pageErrors.some(error =>
          error.includes("failed_to_load_clerk_js") || error.includes("Failed to load Clerk"),
        );
        outcome = blockedClerk ? "blocked-dependency" : "runtime-error";
        explanation = blockedClerk
          ? "A rota depende do serviço externo de autenticação, bloqueado intencionalmente durante a auditoria."
          : "A tela lançou erro no navegador; avaliar se o contrato sintético está correto antes de atribuir ao produto.";
      } else if (measurements.visibleTextLength < 5) {
        outcome = "empty-or-loading";
        explanation = "Nenhum texto visível suficiente após a janela de espera.";
      } else if (measurements.horizontalOverflowPx > 0) {
        outcome = "horizontal-overflow";
        explanation = "A página excede a largura visível; verificar se é rolagem intencional ou defeito.";
      }

      const copyAssertions = entry.testPath === "/abertura"
        ? {
            clientAppLinkVisible: await page.getByRole("link", { name: /App do Cliente/ }).count() > 0,
            paxMedMembersVisible: await page.getByText(/PaxMed Members/).count() > 0,
          }
        : null;
      const routeResult: Record<string, unknown> = {
        ...entry,
        viewport: viewport.id,
        outcome,
        explanation,
        finalPath,
        durationMs: Date.now() - startedAt,
        measurements,
        verticalScrollScreenshot: viewport.id !== "desktop" && verticalTouchPosition.y > 0
          ? resolve(join(screenshotRoot, viewport.id, `${slug}-vertical.jpg`)).replace(`${root}/`, "")
          : null,
        touchGestures: viewport.id === "desktop"
          ? null
          : {
              verticalPageScrollY: verticalTouchPosition.y,
              horizontalPageScrollX: horizontalTouchPosition.x,
            },
        copyAssertions,
        menuInteraction,
        pageErrors: [...pageErrors],
        consoleErrors: consoleErrors.slice(0, 5),
        apiRequests: apiCalls.slice(apiStart),
        apiRequestCount: apiCalls.length - apiStart,
        blockedWriteCount: apiCalls.slice(apiStart).filter(call => call.disposition === "blocked-write").length,
        externalAttemptCount: externalAttempts.length - externalStart,
        screenshot: resolve(screenshotPath).replace(`${root}/`, ""),
      };
      results.push(routeResult);

      if (entry.testPath === "/area") {
        const portalApiStart = apiCalls.length;
        const portalExternalStart = externalAttempts.length;
        const portalPageErrorStart = pageErrors.length;
        const portalConsoleErrorStart = consoleErrors.length;
        const quickEnter = page.getByRole("button", { name: /ENTRAR SEM CÓDIGO/i });
        const loginButtonAvailable = await quickEnter.count() > 0;
        let syntheticLoginSucceeded = false;
        let loginError: string | null = null;
        const tabResults: Record<string, unknown>[] = [];
        let verticalPageScrollY = 0;
        let verticalPageScrollMetrics: Record<string, number> | null = null;
        let horizontalNavSwipe: Record<string, number> | null = null;
        let portalNav: ReturnType<typeof page.locator> | null = null;
        const dismissBlockedClerkOverlay = async () => {
          const removed = await page.evaluate(() => {
            const hosts = Array.from(document.querySelectorAll("*"));
            const overlay = hosts.find((element) => {
              const text = [
                element.textContent ?? "",
                element.shadowRoot?.textContent ?? "",
              ].join(" ").toLowerCase();
              return text.includes("failed to load clerk js")
                || text.includes("failed_to_load_clerk_js");
            });
            if (!overlay) return false;
            overlay.remove();
            return true;
          });
          const clerkFailureWasRecorded = pageErrors
            .slice(portalPageErrorStart)
            .some(message => /failed_to_load_clerk_js|failed to load clerk js/i.test(message));
          if (!removed && clerkFailureWasRecorded) {
            await page.keyboard.press("Escape").catch(() => undefined);
          }
        };

        if (loginButtonAvailable) {
          try {
            await quickEnter.click({ timeout: 5_000 });
            await page.waitForTimeout(500);
            await dismissBlockedClerkOverlay();
            portalNav = page.locator("nav.fixed.bottom-0").last();
            syntheticLoginSucceeded =
              (await portalNav.count()) > 0
              && (await page.getByText("Cliente Sintético", { exact: true }).count()) > 0;

            if (syntheticLoginSucceeded) {
              const tabButtons = portalNav.locator("button");
              const tabCount = await tabButtons.count();
              for (let index = 0; index < tabCount; index += 1) {
                const button = tabButtons.nth(index);
                const label = (await button.innerText()).trim().replace(/\s+/g, " ");
                let clickError: string | null = null;
                try {
                  await dismissBlockedClerkOverlay();
                  await button.click({ timeout: 5_000 });
                  await page.waitForTimeout(200);
                  await dismissBlockedClerkOverlay();
                } catch (error) {
                  clickError = String(error).slice(0, 300);
                }

                const tabMeasurements = await page.evaluate(() => {
                  const nav = document.querySelector("nav.fixed.bottom-0");
                  const main = document.querySelector("main");
                  const navRect = nav?.getBoundingClientRect();
                  const mainRect = main?.getBoundingClientRect();
                  const miniPanel = Array.from(document.querySelectorAll("div.fixed"))
                    .find(element =>
                      element.classList.contains("bottom-0")
                      && element.classList.contains("right-0")
                      && element.querySelector("button"),
                    );
                  const buttonSizes = (parent: Element | null | undefined) =>
                    Array.from(parent?.querySelectorAll("button") ?? []).map(element => {
                      const rect = element.getBoundingClientRect();
                      return {
                        label: (
                          element.getAttribute("aria-label")
                          || element.getAttribute("title")
                          || element.textContent
                          || ""
                        ).trim().replace(/\s+/g, " ").slice(0, 60),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                      };
                    });
                  return {
                    viewportWidth: window.innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body?.scrollWidth ?? 0,
                    horizontalOverflowPx: Math.max(
                      0,
                      document.documentElement.scrollWidth - document.documentElement.clientWidth,
                      (document.body?.scrollWidth ?? 0) - (document.body?.clientWidth ?? 0),
                    ),
                    pageScrollX: window.scrollX,
                    pageScrollY: window.scrollY,
                    mainLeft: mainRect ? Math.round(mainRect.left) : null,
                    mainRight: mainRect ? Math.round(mainRect.right) : null,
                    navScrollLeft: nav?.scrollLeft ?? 0,
                    navScrollWidth: nav?.scrollWidth ?? 0,
                    navClientWidth: nav?.clientWidth ?? 0,
                    navLeft: navRect ? Math.round(navRect.left) : null,
                    navRight: navRect ? Math.round(navRect.right) : null,
                    navButtonSizes: buttonSizes(nav),
                    miniPanelButtonSizes: buttonSizes(miniPanel),
                  };
                });
                const tabSlug = label
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "") || `tab-${index + 1}`;
                const tabScreenshotPath = join(
                  screenshotRoot,
                  viewport.id,
                  `${slug}-cliente-${tabSlug}.jpg`,
                );
                await page.screenshot({ path: tabScreenshotPath, type: "jpeg", quality: 45 });
                tabResults.push({
                  label,
                  clickSucceeded: clickError === null,
                  clickError,
                  measurements: tabMeasurements,
                  screenshot: resolve(tabScreenshotPath).replace(`${root}/`, ""),
                });
              }

              const homeButton = portalNav.locator("button").first();
              await homeButton.click({ timeout: 5_000 });
              await portalNav.locator("button").nth(1).click({ timeout: 5_000 });
              await page.waitForTimeout(200);
              await page.evaluate(() => window.scrollTo(0, 0));

              if (viewport.id !== "desktop") {
                const verticalBefore = await page.evaluate(() => ({
                  documentHeight: document.documentElement.scrollHeight,
                  viewportHeight: window.innerHeight,
                  scrollY: window.scrollY,
                }));
                const touchSession = await context.newCDPSession(page);
                await touchSession.send("Input.dispatchTouchEvent", {
                  type: "touchStart",
                  touchPoints: [{
                    x: Math.round(viewport.width / 2),
                    y: Math.round(viewport.height * 0.75),
                    id: 2,
                  }],
                });
                await touchSession.send("Input.dispatchTouchEvent", {
                  type: "touchMove",
                  touchPoints: [{
                    x: Math.round(viewport.width / 2),
                    y: Math.round(viewport.height * 0.35),
                    id: 2,
                  }],
                });
                await touchSession.send("Input.dispatchTouchEvent", {
                  type: "touchEnd",
                  touchPoints: [],
                });
                await page.waitForTimeout(250);
                verticalPageScrollY = await page.evaluate(() => window.scrollY);
                verticalPageScrollMetrics = {
                  ...verticalBefore,
                  scrollYAfter: verticalPageScrollY,
                };

                await page.evaluate(() => {
                  const nav = document.querySelector("nav.fixed.bottom-0");
                  if (nav) nav.scrollLeft = 0;
                });
                const navScrollBefore = await page.evaluate(
                  () => document.querySelector("nav.fixed.bottom-0")?.scrollLeft ?? 0,
                );
                await touchSession.send("Input.dispatchTouchEvent", {
                  type: "touchStart",
                  touchPoints: [{
                    x: Math.round(viewport.width - 100),
                    y: Math.round(viewport.height - 30),
                    id: 3,
                  }],
                });
                await touchSession.send("Input.dispatchTouchEvent", {
                  type: "touchMove",
                  touchPoints: [{
                    x: Math.round(viewport.width / 2),
                    y: Math.round(viewport.height - 30),
                    id: 3,
                  }],
                });
                await touchSession.send("Input.dispatchTouchEvent", {
                  type: "touchEnd",
                  touchPoints: [],
                });
                await page.waitForTimeout(250);
                horizontalNavSwipe = await page.evaluate(navScrollBeforeValue => ({
                  navScrollLeftBefore: navScrollBeforeValue,
                  navScrollLeftAfter: document.querySelector("nav.fixed.bottom-0")?.scrollLeft ?? 0,
                  pageScrollX: window.scrollX,
                }), navScrollBefore);
                await touchSession.detach();
              }
            }
          } catch (error) {
            loginError = String(error).slice(0, 500);
          }
        }

        routeResult.clientPortalAudit = {
          loginButtonAvailable,
          syntheticLoginSucceeded,
          loginError,
          tabCount: tabResults.length,
          tabs: tabResults,
          verticalPageScrollY,
          verticalPageScrollMetrics,
          horizontalNavSwipe,
          pageErrors: pageErrors.slice(portalPageErrorStart),
          consoleErrors: consoleErrors.slice(portalConsoleErrorStart, portalConsoleErrorStart + 10),
          apiRequests: apiCalls.slice(portalApiStart),
          externalAttemptCount: externalAttempts.length - portalExternalStart,
        };
      }

      page.off("pageerror", onPageError);
      page.off("console", onConsole);
      if (pageErrors.length > 0) {
        await page.goto(new URL("/", baseUrl).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await page.waitForTimeout(400);
      }
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
        syntheticClientAuthentications: apiCalls.filter(call =>
          call.disposition === "synthetic-authentication",
        ).length,
        blockedWrites: apiCalls.filter(call => call.disposition === "blocked-write").length,
        blockedWriteRequests: apiCalls.filter(call => call.disposition === "blocked-write"),
        externalAttemptsAborted: externalAttempts.length,
        externalOriginsAborted: [...new Set(externalAttempts)],
      },
      apiRequests: apiCalls,
    }, null, 2));

    await context.close();
  });
}
