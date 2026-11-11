/**
 * Corpo Clínico — vínculo empresarial do profissional.
 *
 * Prova de interface com respostas simuladas (dados 100% sintéticos, nenhuma chamada real ao banco):
 *  1. Card da lista mostra empresa originária e "+N" adicionais.
 *  2. Aba DADOS tem o seletor "Clínica vinculada" com a empresa gravada.
 *  3. Aba VÍNCULOS: 5 posições fixas; só aparecem as agendas das empresas do profissional.
 *  4. Escolher a Secundária envia a lista nova e abre as agendas da empresa escolhida.
 *  5. Remover empresa que ainda tem agenda liberada mostra o recusa do servidor (409) sem apagar nada.
 */
import { expect, test, type Route } from "@playwright/test";

type Vinculo = { ordem: number; empresaId: number; nome: string; papel: "originario" | "adicional" };

const EMPRESAS = [
  { id: 5, nome: "Empresa Sintética Alfa", ativa: true, razaoSocial: "ALFA LIMITADA", cnpj: "00.000.000/0001-00" },
  { id: 2, nome: "Empresa Sintética Beta", ativa: true },
  { id: 3, nome: "Empresa Sintética Gama", ativa: true },
  { id: 9, nome: "Empresa Sintética Inativa", ativa: false },
];

const LOCAIS = [
  { id: 30, name: "Local Alfa Centro", type: "clinic", address: "Rua A, 1 - Tatuapé - São Paulo - SP", empresaId: null, active: true, zona: null, bairro: null, cidade: null, estado: "SP" },
  { id: 31, name: "Local Alfa Norte", type: "clinic", address: "Rua B, 2 - Santana - São Paulo - SP", empresaId: 5, active: true, zona: null, bairro: null, cidade: null, estado: "SP" },
  { id: 40, name: "Local Beta Sul", type: "clinic", address: "Rua C, 3 - Moema - São Paulo - SP", empresaId: 2, active: true, zona: null, bairro: null, cidade: null, estado: "SP" },
  { id: 50, name: "Local Gama Leste", type: "clinic", address: "Rua D, 4 - Penha - São Paulo - SP", empresaId: 3, active: true, zona: null, bairro: null, cidade: null, estado: "SP" },
];

function profissional(vinculos: Vinculo[]) {
  const originaria = vinculos.find((v) => v.papel === "originario");
  return {
    id: 13,
    name: "Enf. Sintética Teste",
    professionalType: "nao_medico",
    category: "enfermagem",
    role: "Enfermeira",
    areaId: 1,
    areaName: "Enfermagem",
    specialtyId: 1,
    specialtyName: "Enfermagem geral",
    serviceTypes: ["presencial"],
    active: true,
    empresaOriginariaId: originaria?.empresaId ?? null,
    empresaOriginariaNome: originaria?.nome ?? null,
    empresasVinculadas: vinculos,
  };
}

test("corpo clínico: originário + até 5 empresas e agenda só das empresas do profissional", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("padcom_collab_token", "sessao-sintetica");
    localStorage.setItem("padcom_collab_prof", JSON.stringify({ id: 6, name: "Dono sintético", role: "medico" }));
  });

  let vinculos: Vinculo[] = [{ ordem: 1, empresaId: 5, nome: "Empresa Sintética Alfa", papel: "originario" }];
  let ligacoes = [{ id: 1, locationId: 30, professionalId: 13, role: "executor", agendaCalendarId: null, empresaId: 5 }];
  const putsRecebidos: unknown[] = [];

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const metodo = req.method();

    if (p === "/api/collaborator/me") return json(route, { professional: { id: 6, name: "Dono sintético", isPlatformOwner: true } });
    if (p === "/api/professionals" && metodo === "GET") return json(route, [profissional(vinculos)]);
    if (p === "/api/professional-areas") return json(route, [{ id: 1, name: "Enfermagem", professionalType: "nao_medico" }]);
    if (p === "/api/professional-specialties") return json(route, [{ id: 1, name: "Enfermagem geral", areaId: 1 }]);
    if (p === "/api/empresas") return json(route, EMPRESAS);
    if (p === "/api/locations") return json(route, LOCAIS);
    if (p === "/api/professionals/13/locations" && metodo === "GET") return json(route, ligacoes);
    if (p === "/api/professionals/13/locations" && metodo === "POST") {
      const corpo = req.postDataJSON() as { locationId: number };
      const local = LOCAIS.find((l) => l.id === corpo.locationId)!;
      const nova = { id: 99, locationId: local.id, professionalId: 13, role: "executor", agendaCalendarId: null, empresaId: local.empresaId ?? 5 };
      ligacoes = [...ligacoes, nova];
      return json(route, nova, 201);
    }
    if (p === "/api/professionals/13/empresas" && metodo === "GET") {
      return json(route, { professionalId: 13, limite: 5, vinculos });
    }
    if (p === "/api/professionals/13/empresas" && metodo === "PUT") {
      const corpo = req.postDataJSON() as { adicionaisIds: number[] };
      putsRecebidos.push(corpo);
      // Regra do servidor: empresa removida que ainda tem agenda liberada => 409, nada muda.
      const removidas = vinculos.filter((v) => v.papel === "adicional" && !corpo.adicionaisIds.includes(v.empresaId));
      for (const removida of removidas) {
        const agendas = ligacoes
          .filter((l) => l.empresaId === removida.empresaId)
          .map((l) => ({ locationId: l.locationId, nome: LOCAIS.find((x) => x.id === l.locationId)!.name }));
        if (agendas.length) {
          return json(route, {
            error: `${removida.nome} ainda tem agenda liberada para este profissional. Desligue a agenda antes de remover a empresa.`,
            code: "EMPRESA_COM_AGENDA_LIBERADA",
            empresaId: removida.empresaId,
            empresaNome: removida.nome,
            agendas,
          }, 409);
        }
      }
      vinculos = [
        vinculos[0],
        ...corpo.adicionaisIds.map((id, i) => ({
          ordem: i + 2,
          empresaId: id,
          nome: EMPRESAS.find((e) => e.id === id)!.nome,
          papel: "adicional" as const,
        })),
      ];
      return json(route, { professionalId: 13, limite: 5, vinculos, mudou: true });
    }
    return json(route, {});
  });

  await page.goto("/professionals");

  // 1) Card: empresa originária + "+0"
  const card = page.getByRole("button", { name: "Editar Enf. Sintética Teste" }).locator("xpath=ancestor::*[contains(@class,'panel-3d-sub')][1]");
  await expect(card.getByText("Empresa Sintética Alfa")).toBeVisible();
  await expect(card.getByLabel("Empresas adicionais: 0")).toHaveText("+0");
  await page.screenshot({ path: "generated-artifacts/corpo-clinico-lista.png" });

  // 2) Dados: seletor de vínculo originário com a empresa gravada
  await page.getByRole("button", { name: "Editar Enf. Sintética Teste" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("combobox", { name: "Clínica vinculada" })).toContainText("Empresa Sintética Alfa (ALFA LIMITADA · 00.000.000/0001-00)");
  await page.screenshot({ path: "generated-artifacts/clinica-vinculada-profissional.png" });
  await page.screenshot({ path: "generated-artifacts/corpo-clinico-dados.png" });

  // 3) Vínculos: 5 posições fixas; só agendas da empresa Alfa
  await dialogo.getByRole("button", { name: "VÍNCULOS" }).click();
  for (const rotulo of ["Principal (originária)", "Secundária", "Terciária", "Quaternária", "Quinária"]) {
    await expect(dialogo.locator("label", { hasText: rotulo })).toBeVisible();
  }
  const alfa = dialogo.getByRole("region", { name: "Agendas de Empresa Sintética Alfa" });
  await expect(alfa).toBeVisible();
  await expect(alfa.getByText("Local Alfa Centro")).toBeVisible();
  await expect(alfa.getByText("Local Alfa Norte")).toBeVisible();
  await expect(dialogo.getByText("Local Beta Sul")).toHaveCount(0);
  await expect(dialogo.getByText("Local Gama Leste")).toHaveCount(0);
  // Terciária só habilita depois da Secundária
  await expect(dialogo.getByRole("combobox", { name: "Empresa terciária" })).toBeDisabled();

  // 4) Escolher Secundária = Beta: envia a lista e abre as agendas da Beta
  await dialogo.getByRole("combobox", { name: "Empresa secundária" }).click();
  await expect(page.getByRole("option", { name: "Empresa Sintética Alfa" })).toHaveCount(0); // já é a principal
  await expect(page.getByRole("option", { name: "Empresa Sintética Inativa" })).toHaveCount(0); // inativa não é oferecida
  await page.getByRole("option", { name: "Empresa Sintética Beta" }).click();
  const beta = dialogo.getByRole("region", { name: "Agendas de Empresa Sintética Beta" });
  await expect(beta.getByText("Local Beta Sul")).toBeVisible();
  expect(putsRecebidos).toEqual([{ adicionaisIds: [2] }]);
  await expect(dialogo.getByRole("combobox", { name: "Empresa terciária" })).toBeEnabled();

  // 5) Libera uma agenda da Beta e tenta remover a Beta: servidor recusa (409), nada some
  await beta.locator("button[role='switch']").first().click();
  await expect(beta.getByText("1/1 agenda")).toBeVisible();
  await dialogo.getByRole("combobox", { name: "Empresa secundária" }).click();
  await page.getByRole("option", { name: "— Remover este vínculo —" }).click();
  const alerta = dialogo.getByRole("alert");
  await expect(alerta).toContainText("ainda tem agenda liberada");
  await expect(alerta).toContainText("Local Beta Sul");
  await expect(dialogo.getByRole("region", { name: "Agendas de Empresa Sintética Beta" })).toBeVisible();
  await page.screenshot({ path: "generated-artifacts/corpo-clinico-vinculos.png" });
});
