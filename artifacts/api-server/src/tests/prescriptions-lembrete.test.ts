import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ catalogo: [] as any[], fail: false }));
vi.mock("@workspace/db", () => ({
  mensagensCatalogoTable: { ativo: "ativo" },
  db: { select: () => ({ from: () => ({ where: async () => {
    if (state.fail) throw new Error("offline");
    return state.catalogo;
  } }) }) },
}));
vi.mock("../lib/lembrete-periodo", () => ({ MAPA_PERIODO: {
  manha: { sigla: "IM", nome: "Inicio da Manha", inicio: "07:00" },
  noite: { sigla: "NO", nome: "Noite", inicio: "18:00" },
} }));
import { invalidarCacheCatalogo } from "../lib/mensageria-paxmed";
import { templateLembretePrescricao } from "../lib/lembrete-templates";
import { montarMensagemLembrete, prescriptionReminderMessage, mapPeriodosTextoToCanonicos } from "../lib/prescription-reminder-message";
const agora = new Date("2026-08-14T10:00:00Z");
const periodos = [{ sigla: "IM", nome: "Inicio da Manha", tipo: "tomar" as const,
  formulas: [{ nome: "Formula Teste", dose: "10 mg" }] }];
const catalogo = [
  { categoria: "PERIODO", chave: "inicioManha", conteudo: { saudacao: "Saudacao rica IM", abertura: "Abertura IM" } },
  { categoria: "DIA_SEMANA", chave: "sexta", conteudo: { label: "sexta-feira", frase: "Frase exclusiva sexta" } },
  { categoria: "SEMANA_MES", chave: "2", conteudo: { frase: "segunda semana rica" } },
].map((row, id) => ({ ...row, id, ordem: id }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(agora);
  state.catalogo = catalogo; state.fail = false; invalidarCacheCatalogo();
});
afterEach(() => vi.useRealTimers());
describe("prévia do envio explícito preserva motor rico sem disparar provedor", () => {
  it("usa catálogo e itens persistidos, sem ativar agenda", async () => {
    const text = await prescriptionReminderMessage("Paciente Exemplo", [{ name: "Formula Teste", dose: "10 mg", periodo: "manhã" }]);
    expect(text).toContain("Saudacao rica IM"); expect(text).toContain("Frase exclusiva sexta");
    expect(text).toContain("segunda semana rica"); expect(text).toContain("Formula Teste");
    expect(text).not.toContain("Segue o lembrete");
  });
  it.each(["erro", "vazio", "PERIODO", "DIA_SEMANA", "SEMANA_MES"])("fallback explícito quando %s indisponível", async scenario => {
    state.fail = scenario === "erro";
    if (scenario === "vazio") state.catalogo = [];
    else if (!state.fail) state.catalogo = catalogo.filter(r => r.categoria !== scenario);
    expect(await montarMensagemLembrete("Paciente Exemplo", periodos, agora)).toBe(templateLembretePrescricao({
      clienteNome: "Paciente Exemplo", clienteGenero: "nao_informado", periodos, agora,
    }));
  });
  it("mantém conversão canônica dos períodos", () => {
    expect(mapPeriodosTextoToCanonicos("À Tarde; 2h Antes do Jantar")).toEqual(["tarde", "noite"]);
    expect(mapPeriodosTextoToCanonicos("")).toEqual(["manha", "noite"]);
  });
});
