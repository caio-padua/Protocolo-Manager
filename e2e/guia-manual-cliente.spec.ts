/**
 * Manual do Cliente PaxMed (/guia-digital) + aba COMUNICAÇÃO da Área do Cliente.
 * Rede 100% simulada com dados SINTÉTICOS: nenhuma mensagem real é enviada e nenhum dado clínico é usado.
 * Protege contra regressão de: textos falsos/proibidos, marca PaxMed, links oficiais do Telegram,
 * seção "em preparação" sem preço, áudio, identidade por clínica (A/B) e ausência de código previsível.
 */
import { test, expect, type Page } from "@playwright/test";

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

const CLINICAS: Record<string, { clinicaNome: string; botHandle: string | null; areaUrl: string | null }> = {
  alfa: { clinicaNome: "Clínica Alfa Sintética", botHandle: "@AlfaSinteticaBot", areaUrl: "https://alfa.exemplo.test/area" },
  beta: { clinicaNome: "Clínica Beta Sintética", botHandle: "@BetaSinteticaBot", areaUrl: "https://beta.exemplo.test/area" },
};

async function preparar(page: Page, tema: "light" | "dark" = "light") {
  const chamadas: { metodo: string; caminho: string }[] = [];
  await page.addInitScript((t) => {
    localStorage.setItem("paxter.theme", t);
    (window as unknown as { __falas: string[] }).__falas = [];
    const synth = {
      speak: (u: { text: string }) => (window as unknown as { __falas: string[] }).__falas.push(u.text),
      cancel: () => {}, getVoices: () => [],
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: { text: string }, text: string) { this.text = text; };
  }, tema);
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    chamadas.push({ metodo: req.method(), caminho: url.pathname });
    if (url.pathname === "/api/onboarding/config") {
      const c = CLINICAS[url.searchParams.get("tenant") ?? ""];
      return route.fulfill(c ? json(c) : json({ error: "tenant não encontrado" }, 404));
    }
    return route.fulfill(json({ ok: true }));
  });
  return chamadas;
}

const PROIBIDOS = [/senha de 6 letras/i, /sem senha/i, /não precisa criar senha/i, /900 milh/i, /clinical intelligence/i, /\bpaciente/i];

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  for (const tema of ["light", "dark"] as const) {
    test.describe(`Manual do Cliente — ${viewport.width}px — ${tema}`, () => {
      test.use({ viewport });

      test("marca PaxMed, sem textos falsos, links oficiais e seção em preparação", async ({ page }) => {
        const chamadas = await preparar(page, tema);
        await page.goto("/guia-digital?tenant=alfa");
        await expect(page.getByTestId("guia-marca")).toHaveText(/PaxMed/i);
        await expect(page.getByTestId("guia-marca")).toBeVisible();
        await expect(page.getByText(/Manual do Cliente · Clínica Alfa Sintética/)).toBeVisible();

        const texto = await page.getByTestId("guia-raiz").innerText();
        for (const re of PROIBIDOS) expect(texto, String(re)).not.toMatch(re);

        // Links oficiais do Telegram
        await expect(page.getByTestId("guia-tg-appstore")).toHaveAttribute("href", /^https:\/\/apps\.apple\.com\//);
        await expect(page.getByTestId("guia-tg-playstore")).toHaveAttribute("href", /^https:\/\/play\.google\.com\/store\/apps\/details\?id=org\.telegram\.messenger/);
        await expect(page.getByTestId("guia-tg-desktop")).toHaveAttribute("href", "https://desktop.telegram.org/");
        await expect(page.getByTestId("guia-tg-web")).toHaveAttribute("href", "https://web.telegram.org/");
        await expect(page.getByTestId("guia-tg-apps")).toHaveAttribute("href", "https://telegram.org/apps");

        // Link individual, urgência, PWA x loja
        await expect(page.getByTestId("guia-link-individual")).toContainText(/7 dias/);
        await expect(page.getByTestId("guia-link-individual")).toContainText(/uma única vez/);
        await expect(page.getByTestId("guia-tg-urgencia")).toContainText(/não substitui atendimento de urgência/i);
        await expect(page.getByTestId("guia-pwa-aviso")).toContainText(/não é um aplicativo baixado/i);
        await expect(page.getByTestId("guia-qr")).toBeVisible();

        // Endereço da Área vem da clínica
        await expect(page.getByTestId("guia-url").first()).toHaveText("https://alfa.exemplo.test/area");

        // Em preparação: abre, diz "não disponível", sem preço nem compra
        await page.getByTestId("sec-pessoal").getByRole("button").first().click();
        const pessoal = page.getByTestId("guia-pessoal");
        await expect(pessoal).toContainText(/Em preparação — ainda não disponível/);
        await expect(pessoal).toContainText(/Nada disso funciona ainda/);
        const pessoalTxt = await pessoal.innerText();
        expect(pessoalTxt).not.toMatch(/R\$|comprar|assinar|contratar|preço|valor/i);
        // O único botão da seção é o de áudio; nenhuma ação de compra/assinatura.
        await expect(pessoal.getByRole("button")).toHaveCount(1);
        await expect(pessoal.getByRole("button")).toHaveAttribute("aria-label", /Ouvir/);

        // Sem rolagem horizontal
        const l = await page.evaluate(() => ({ d: document.documentElement.scrollWidth, v: window.innerWidth }));
        expect(l.d).toBeLessThanOrEqual(l.v + 1);

        // Nenhuma escrita além do evento silencioso de abertura
        const escritas = chamadas.filter((c) => c.metodo !== "GET" && c.caminho !== "/api/onboarding/evento");
        expect(escritas).toEqual([]);
        expect(chamadas.some((c) => c.caminho.includes("enviar-guia"))).toBe(false);
      });
    });
  }
}

test.describe("Manual do Cliente — áudio e abas de aparelho", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("áudio fala o trecho e a aba de aparelho troca o conteúdo", async ({ page }) => {
    await preparar(page);
    await page.goto("/guia-digital?tenant=alfa");
    await page.getByTestId("guia-ouvir-resumo").click();
    const falas = await page.evaluate(() => (window as unknown as { __falas: string[] }).__falas);
    expect(falas.join(" ")).toMatch(/Manual do Cliente PaxMed/);
    expect(falas.join(" ")).toMatch(/192/);

    await page.getByTestId("guia-aba-iphone").click();
    await expect(page.getByTestId("guia-painel-iphone")).toBeVisible();
    await page.getByTestId("guia-aba-android").click();
    await expect(page.getByTestId("guia-painel-android")).toBeVisible();
    await expect(page.getByTestId("guia-painel-iphone")).toHaveCount(0);
    await page.getByTestId("guia-aba-desktop").click();
    await expect(page.getByTestId("guia-painel-desktop")).toBeVisible();
  });
});

test.describe("Manual do Cliente — isolamento entre clínicas", () => {
  test("clínica A e B mostram só a própria identidade; tenant desconhecido não mostra outra clínica", async ({ page }) => {
    await preparar(page);
    await page.goto("/guia-digital?tenant=alfa");
    await expect(page.getByTestId("guia-raiz")).toContainText("Clínica Alfa Sintética");
    await expect(page.getByTestId("guia-raiz")).not.toContainText("Beta");
    await expect(page.getByTestId("guia-raiz")).toContainText("@AlfaSinteticaBot");

    await page.goto("/guia-digital?tenant=beta");
    await expect(page.getByTestId("guia-raiz")).toContainText("Clínica Beta Sintética");
    await expect(page.getByTestId("guia-raiz")).not.toContainText("Alfa");
    await expect(page.getByTestId("guia-url").first()).toHaveText("https://beta.exemplo.test/area");

    await page.goto("/guia-digital?tenant=inexistente");
    await expect(page.getByTestId("guia-tenant-indisponivel")).toBeVisible();
    const t = await page.getByTestId("guia-raiz").innerText();
    expect(t).not.toMatch(/Alfa|Beta|Instituto Pádua/);
  });
});

test.describe("Aba COMUNICAÇÃO da Área do Cliente", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("gera link individual sem exibir código previsível e aponta para o manual da clínica", async ({ page }) => {
    const posts: string[] = [];
    await page.route("**/api/**", async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      if (!p.startsWith("/api/area-paciente/")) return route.fulfill(json([]));
      if (req.method() !== "GET") posts.push(`${req.method()} ${p}`);
      if (p.endsWith("/comunicacao/link")) return route.fulfill(json({ url: "https://t.me/Paduaclinica_bot?start=TOKENSINTETICO0123456789" }));
      if (p.endsWith("/comunicacao")) return route.fulfill(json({ vinculado: false, senha: "ABC1234", botUsername: "Paduaclinica_bot", botLink: "https://t.me/Paduaclinica_bot", clinicaSlug: "alfa" }));
      if (p.endsWith("/resumo")) return route.fulfill(json({ client: { name: "Maria Sintética" }, protocolsCount: 0, activeProtocolsCount: 0, totalSessions: 0, completedSessions: 0, nextSession: null }));
      return route.fulfill(json([]));
    });
    await page.goto("/area?preview_id=10&preview_name=Maria%20Sint%C3%A9tica&preview_token=fake");
    await page.getByRole("button", { name: /COMUNICA/i }).first().click();

    await expect(page.getByRole("heading", { name: /Telegram/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("ABC1234");
    await expect(page.getByText(/Se preferir usar o código/i)).toHaveCount(0);
    await expect(page.getByTestId("comunicacao-aviso-urgencia")).toContainText(/192/);
    await expect(page.getByTestId("comunicacao-link-regra")).toContainText(/7 dias/);
    await expect(page.getByTestId("comunicacao-abrir-manual")).toHaveAttribute("href", /guia-digital\?tenant=alfa$/);

    await page.getByRole("button", { name: /Gerar meu link/i }).click();
    await expect(page.getByRole("link", { name: /Abrir o Telegram e ativar/i })).toHaveAttribute("href", /t\.me\/Paduaclinica_bot\?start=/);
    expect(posts).toEqual(["POST /api/area-paciente/comunicacao/link"]); // somente a geração (simulada); nenhum envio
  });
});
