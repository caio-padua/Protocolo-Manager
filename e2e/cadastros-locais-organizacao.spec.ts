import { expect, test, type Page } from "@playwright/test";

// Dados 100% sintéticos; toda a rede é interceptada (API e ViaCEP). Nada é gravado.
const PADUA = 21;
const OUTRA = 22;

function local(id: number, extra: Record<string, unknown>) {
  return {
    id, name: `Local sintético ${id}`, address: null, type: "clinic", color: "#16284a", active: true,
    googleCalendarId: null, phone: null, cep: null, logradouro: null, numero: null, complemento: null,
    bairro: null, cidade: null, estado: null, zona: null, empresaId: PADUA, empresaNome: "Instituto Padua Sintético",
    modalidade: "presencial", mesmoEnderecoEmpresa: true, enderecoEmpresa: "Rua Sintética, 10", agendaPapel: null,
    observacaoLocal: null, nomeEspaco: null, professionals: [], ...extra,
  };
}

const LOCAIS = [
  local(11, { logradouro: "Rua Sintética", numero: "10", cidade: "São Paulo", estado: "SP" }),
  local(12, { modalidade: "online", mesmoEnderecoEmpresa: false }),
  local(13, { empresaId: OUTRA, empresaNome: "Alfa Clínica Sintética", mesmoEnderecoEmpresa: false, logradouro: "Av. Teste", numero: "5", cidade: "Sao Paulo", estado: "SP" }),
];

const EMPRESAS = [
  { id: OUTRA, nome: "Alfa Clínica Sintética", tipo: "clinic", tipoUnidade: "CLINICA", status: "ATIVO", ativa: true, cidade: "Sao Paulo", estado: "SP", modulosAtivos: {} },
  { id: PADUA, nome: "Instituto Padua Sintético", tipo: "clinic", tipoUnidade: "CLINICA", status: "ATIVO", ativa: true, cidade: "São Paulo", estado: "SP", modulosAtivos: {} },
  { id: 23, nome: "Beta Sintética", tipo: "clinic", tipoUnidade: "CLINICA", status: "ATIVO", ativa: true, cidade: "Campinas", estado: "SP", modulosAtivos: {} },
];

type Escrita = { metodo: string; caminho: string; empresa: string | undefined };

async function preparar(page: Page, opts: { liberarCep?: Promise<void>; aceitarEscrita?: boolean; escritas?: Escrita[]; atrasoEscrita?: Promise<void> } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 41, name: "Profissional sintético", role: "admin" }));
  });
  const escritas: string[] = [];
  await page.route("https://viacep.com.br/**", async (route) => {
    if (opts.liberarCep) await opts.liberarCep;
    await route.fulfill({ json: { logradouro: "Rua Atrasada Sintética", bairro: "Bairro X", localidade: "Cidade X", uf: "XX" } });
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (req.method() !== "GET") {
      escritas.push(`${req.method()} ${p}`);
      opts.escritas?.push({ metodo: req.method(), caminho: p, empresa: req.headers()["x-empresa-id"] });
      if (!opts.aceitarEscrita) return route.fulfill({ status: 409, json: { error: "bloqueado no teste" } });
      if (opts.atrasoEscrita) await opts.atrasoEscrita;
      return route.fulfill({ json: { ok: true } });
    }
    if (p === "/api/collaborator/me") return route.fulfill({ json: { professional: { id: 41, name: "Profissional sintético", role: "admin" } } });
    if (p === "/api/locations") return route.fulfill({ json: LOCAIS });
    if (p === "/api/locations/google/agendas") return route.fulfill({ json: { agendas: [] } });
    if (p === "/api/empresas") return route.fulfill({ json: EMPRESAS });
    if (p === "/api/semantic-codes/locations") return route.fulfill({ json: LOCAIS.map((l) => ({ locationId: l.id, empresaId: l.empresaId })) });
    if (p === "/api/semantic-codes/companies") return route.fulfill({ json: EMPRESAS.map((e) => ({ id: e.id, nome: e.nome })) });
    if (p.startsWith("/api/paxmed-2b/empresas/")) return route.fulfill({ json: { identidade: { nomeCabecalho: "Instituto Padua Sintético", rodapeLinha1: "", rodapeLinha2: "", rodapeLinha3: "", versao: 1 } } });
    if (p.endsWith("/cargos") || p.endsWith("/colaboradores") || p.endsWith("/contratos") || p.endsWith("/locais")) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  return escritas;
}

for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`organização ${viewport.width}px`, () => {
    test.use({ viewport });

    test("lista: empresa explícita, filtros uniformes, resumo fixo e contraste", async ({ page }) => {
      const escritas = await preparar(page);
      await page.goto("/cadastros/clinicas");
      const seletor = page.getByTestId("locais-empresa-filtro");
      await expect(seletor).toHaveValue("todas");
      await expect(page.getByTestId("locais-empresa-escopo")).toContainText("Todas as empresas");
      const opcoes = await seletor.locator("option").allTextContents();
      expect(opcoes[0]).toContain("Todas as empresas");
      expect(opcoes[1]).toContain("Instituto Padua");

      // Padua primeiro na lista
      const paineis = page.locator("section[data-testid^='locais-empresa-e']");
      await expect(paineis.first()).toHaveAttribute("data-testid", `locais-empresa-e${PADUA}`);

      // Filtros: um por linha, mesmas dimensões, rótulos visuais novos
      const ids = ["todos", "sede", "externo", "online", "definir"];
      const caixas = [];
      for (const id of ids) caixas.push(await page.getByTestId(`locais-filtro-${id}`).boundingBox());
      for (const c of caixas) { expect(Math.round(c!.width)).toBe(Math.round(caixas[0]!.width)); expect(Math.round(c!.height)).toBe(Math.round(caixas[0]!.height)); }
      for (let i = 1; i < caixas.length; i++) expect(caixas[i]!.y).toBeGreaterThan(caixas[i - 1]!.y + caixas[0]!.height - 1);
      await expect(page.getByTestId("locais-filtro-externo")).toContainText("Local externo");
      await expect(page.getByTestId("locais-filtro-definir")).toContainText("Indefinido");

      // Contraste: botão ativo nunca branco sobre fundo claro
      const ativo = page.getByTestId("locais-filtro-todos");
      await expect(ativo).toHaveAttribute("aria-pressed", "true");
      expect(await ativo.evaluate((el) => getComputedStyle(el).color)).not.toBe("rgb(255, 255, 255)");

      // Resumo recolhido: 4 posições fixas inclusive zero
      await page.getByTestId(`locais-empresa-alternar-e${OUTRA}`).click();
      const slots = page.getByTestId(`locais-resumo-e${OUTRA}`).locator("li");
      await expect(slots).toHaveCount(4);
      expect(await slots.evaluateAll((els) => els.map((e) => e.getAttribute("data-modo")))).toEqual(["sede", "externo", "online", "definir"]);
      await expect(slots.nth(0)).toHaveAttribute("data-zero", "true");

      // Empresa escolhida: sem seleção cruzada
      await page.getByTestId("locais-filtro-online").click();
      await seletor.selectOption(`e${OUTRA}`);
      await expect(page.getByTestId("locais-filtro-todos")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId(`locais-empresa-e${PADUA}`)).toHaveCount(0);
      await expect(page.getByTestId("locais-empresa-escopo")).toContainText("Alfa Clínica Sintética");
      await page.screenshot({ path: `generated-artifacts/locais-lista-${viewport.width}.png`, fullPage: true });
      expect(escritas).toEqual([]);
    });

    test("diálogo: altura fixa, empresa proprietária, URL e atalho de identidade", async ({ page }) => {
      const escritas = await preparar(page);
      await page.goto("/cadastros/clinicas");
      await page.getByTestId("local-editar-11").click();
      await expect(page).toHaveURL(/local=11/);
      const dialogo = page.getByTestId("local-dialogo");
      await expect(page.getByTestId("local-empresa-proprietaria-nome")).toHaveText("Instituto Padua Sintético");
      const alturas: number[] = [];
      for (const s of ["identificacao", "endereco", "contato", "agenda", "documentos"]) {
        await page.getByTestId(`local-secao-${s}`).click();
        alturas.push(Math.round((await dialogo.boundingBox())!.height));
        await expect(page.getByTestId("local-dialogo-rodape")).toBeInViewport();
      }
      expect(new Set(alturas).size).toBe(1);
      await expect(page.getByTestId("local-identidade-atalho")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page).not.toHaveURL(/local=/);

      await page.getByTestId("local-editar-12").click();
      await expect(page).toHaveURL(/local=12/);
      await page.getByTestId("local-secao-documentos").click();
      await page.getByTestId("local-abrir-identidade-empresa").click();
      await expect(page).toHaveURL(new RegExp(`/cadastros/empresas\\?empresa=${PADUA}&aba=marca-documento`));
      await expect(page.getByTestId("empresa-dialogo-identificacao")).toContainText(`#${PADUA}`);
      await expect(page.getByTestId("empresa-aba-marca-documento")).toHaveAttribute("data-state", "active");
      await page.screenshot({ path: `generated-artifacts/empresa-identidade-${viewport.width}.png` });
      expect(escritas).toEqual([]);
    });

    test("novo local: empresa da lista sugerida e identificada", async ({ page }) => {
      await preparar(page);
      await page.goto("/cadastros/clinicas");
      await page.getByTestId("locais-empresa-filtro").selectOption(`e${OUTRA}`);
      await page.getByTestId("local-novo").click();
      await expect(page.getByTestId("local-empresa-proprietaria-nome")).toHaveText("Alfa Clínica Sintética");
      await expect(page.getByTestId("local-novo-empresa")).toContainText("Alfa Clínica Sintética");
    });

    test("CEP atrasado não contamina o próximo local", async ({ page }) => {
      let liberar!: () => void;
      const portao = new Promise<void>((r) => { liberar = r; });
      await preparar(page, { liberarCep: portao });
      await page.goto("/cadastros/clinicas");
      await page.getByTestId("local-editar-13").click();
      await page.getByTestId("local-secao-endereco").click();
      await page.getByPlaceholder("00000-000").fill("01001000");
      await page.waitForTimeout(300);
      page.once("dialog", (d) => d.accept());
      await page.keyboard.press("Escape");
      await page.getByTestId("local-editar-11").click();
      liberar();
      await page.waitForTimeout(500);
      await page.getByTestId("local-secao-endereco").click();
      await expect(page.getByPlaceholder("Rua, Avenida, SHLS...")).not.toHaveValue("Rua Atrasada Sintética");
    });

    test("empresas: São/Sao Paulo agrupadas e Padua no começo", async ({ page }) => {
      await preparar(page);
      await page.goto("/cadastros/empresas");
      const rotulos = page.getByTestId("empresas-grupo-rotulo");
      await expect(rotulos.first()).toHaveText("São Paulo · SP");
      expect((await rotulos.allTextContents()).filter((t) => t.toLowerCase().includes("paulo"))).toHaveLength(1);
      const grupo = page.locator("[data-testid='empresas-grupo-sao paulo|SP'] [data-testid^='empresa-card-']");
      await expect(grupo.first()).toHaveAttribute("data-testid", `empresa-card-${PADUA}`);
    });

    test("gravação: URL e X-Empresa-Id do registro alvo, nunca do filtro", async ({ page }) => {
      const escritas: Escrita[] = [];
      let liberar!: () => void;
      const portao = new Promise<void>((r) => { liberar = r; });
      await preparar(page, { aceitarEscrita: true, escritas, atrasoEscrita: portao });
      await page.goto("/cadastros/clinicas");
      // Filtro em OUTRA; edita local de PADUA: o cabeçalho deve ser PADUA.
      await page.getByTestId("locais-empresa-filtro").selectOption("todas");
      await page.getByTestId("local-editar-11").click();
      await page.getByTestId("local-salvar").click();
      await expect(page.getByTestId("local-salvar")).toBeDisabled();
      // Durante a gravação: não fecha nem troca de registro.
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("local-dialogo")).toBeVisible();
      await expect(page).toHaveURL(/local=11/);
      liberar();
      await expect(page.getByTestId("local-dialogo")).toHaveCount(0);
      await page.getByTestId("locais-empresa-filtro").selectOption(`e${PADUA}`);
      await page.getByTestId("locais-empresa-filtro").selectOption("todas");
      await page.getByTestId("local-editar-13").click();
      await page.getByTestId("local-salvar").click();
      await expect(page.getByTestId("local-dialogo")).toHaveCount(0);
      expect(escritas).toEqual([
        { metodo: "PUT", caminho: "/api/locations/11", empresa: String(PADUA) },
        { metodo: "PUT", caminho: "/api/locations/13", empresa: String(OUTRA) },
      ]);
    });

    test("exclusão manda a empresa do local alvo", async ({ page }) => {
      const escritas: Escrita[] = [];
      await preparar(page, { aceitarEscrita: true, escritas });
      await page.goto("/cadastros/clinicas");
      await page.getByTestId("locais-empresa-filtro").selectOption(`e${OUTRA}`);
      await page.getByRole("button", { name: "Apagar Local sintético 13" }).click();
      await page.getByPlaceholder("Digite o nome exato da clínica").fill("Local sintético 13");
      await page.getByRole("button", { name: "APAGAR", exact: true }).click();
      await expect.poll(() => escritas).toEqual([{ metodo: "DELETE", caminho: "/api/locations/13", empresa: String(OUTRA) }]);
    });

    test("cabeçalho e resumo legíveis sem corte", async ({ page }) => {
      await preparar(page);
      await page.goto("/cadastros/clinicas");
      const titulo = await page.getByRole("heading", { name: "LOCAIS DE ATENDIMENTO" }).boundingBox();
      const botao = await page.getByTestId("local-novo").boundingBox();
      const sobrepoe = !(botao!.y >= titulo!.y + titulo!.height || botao!.x >= titulo!.x + titulo!.width || botao!.y + botao!.height <= titulo!.y);
      expect(sobrepoe).toBe(false);
      const slots = page.getByTestId(`locais-resumo-e${PADUA}`).locator("li");
      await expect(slots).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        const corte = await slots.nth(i).evaluate((el) => [...el.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1));
        expect(corte).toBe(false);
      }
      await expect(slots.nth(1)).toContainText("Local externo");
      await expect(slots.nth(3)).toContainText("Indefinido");
      const larguras = await slots.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      expect(new Set(larguras).size).toBe(1);
      await page.screenshot({ path: `generated-artifacts/locais-topo-${viewport.width}.png` });
      await page.getByTestId(`locais-resumo-e${PADUA}`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `generated-artifacts/locais-resumo-${viewport.width}.png` });
      await page.goto(`/cadastros/empresas?empresa=${PADUA}&aba=marca-documento`);
      const dlg = page.getByTestId("empresa-dialogo");
      await expect(dlg).toBeVisible();
      const abasCortadas = await dlg.locator("[data-testid^='empresa-aba-']").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > window.innerWidth).length);
      expect(abasCortadas).toBe(0);
      const t = await dlg.getByRole("heading", { name: "EDITAR EMPRESA" }).evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
      expect(t).toBe(true);
      await page.screenshot({ path: `generated-artifacts/empresa-dialogo-${viewport.width}.png` });
    });
  });
}
