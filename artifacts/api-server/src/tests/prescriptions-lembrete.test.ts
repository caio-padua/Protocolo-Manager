import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Only infrastructure is mocked: the route, rich composer and fallback are real.
vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
  ...Object.fromEntries([
    "prescriptionsTable", "prescriptionItemsTable", "recipesTable", "pharmaciesTable",
    "dispatchLogTable", "catalogoItensTable", "catalogoFormulasTable",
    "lembretesPrescricaoTable", "clientsTable", "mensagensCatalogoTable",
  ].map((name) => [name, { id: name }])),
}));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: () => 5 }));
vi.mock("../lib/desmembramento", () => ({ planDesmembramento: () => [] }));
vi.mock("../lib/sncr", () => ({ consumeSncrNumber: vi.fn() }));
vi.mock("../lib/prescription-pdf", () => ({ generateRecipePdf: vi.fn() }));
vi.mock("../lib/google-drive", () => ({ ensurePharmacyDayFolder: vi.fn(), uploadFileToDrive: vi.fn() }));
vi.mock("../lib/anvisa-catalog", () => ({ recipeTypeForControlledClass: vi.fn() }));
vi.mock("../lib/sncr-alerts", () => ({ handleSncrAlert: vi.fn() }));
vi.mock("../lib/receituario-motor.js", () => ({ emitirReceituarioPdf: vi.fn().mockResolvedValue({}) }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/telegram", () => ({ sendTelegram: vi.fn() }));
vi.mock("../lib/lembrete-periodo", () => ({
  sincronizarLembretePrescricao: vi.fn().mockResolvedValue({
    lembreteId: 9, periodos: 1, horarios: ["07:00"], formulas: 1, ativo: true,
  }),
}));

import { db, prescriptionsTable, prescriptionItemsTable, lembretesPrescricaoTable, clientsTable, mensagensCatalogoTable } from "@workspace/db";
import router from "../routes/prescriptions";
import { invalidarCacheCatalogo } from "../lib/mensageria-paxmed";
import { templateLembretePrescricao } from "../lib/lembrete-templates";
import { sendWhatsapp } from "../lib/whatsapp";
import { sendTelegram } from "../lib/telegram";

const agora = new Date("2026-08-14T10:00:00Z"); // sexta, segunda semana, BRT
const periodos = [{ sigla: "IM", nome: "Inicio da Manha", tipo: "tomar" as const, formulas: [{ nome: "Formula Teste", dose: "10 mg" }] }];
const pres = { id: 42, clientId: 7, clientName: "Paciente Exemplo", clientPhone: "+5500000000000" };
const items = [{ name: "Formula Teste", dose: "10 mg", periodo: "manha" }];
const catalogoCompleto = [
  { categoria: "PERIODO", chave: "inicioManha", conteudo: { saudacao: "Saudacao rica IM", abertura: "Abertura IM" } },
  { categoria: "DIA_SEMANA", chave: "sexta", conteudo: { label: "sexta-feira", frase: "Frase exclusiva sexta" } },
  { categoria: "SEMANA_MES", chave: "2", conteudo: { frase: "segunda semana rica" } },
].map((row, id) => ({ ...row, id, ordem: id }));
let catalogo = catalogoCompleto;
let falhaCatalogo = false;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).log = { info: vi.fn(), warn: vi.fn() };
  next();
});
app.use(router);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(agora);
  vi.stubEnv("PADAXOR_TELEGRAM_CHAT_ID", "ceo-test");
  invalidarCacheCatalogo();
  catalogo = catalogoCompleto;
  falhaCatalogo = false;
  vi.mocked(sendWhatsapp).mockResolvedValue({ sent: true, via: "twilio", link: "" });
  vi.mocked(sendTelegram).mockResolvedValue({ sent: true } as any);
  vi.mocked(db.select).mockImplementation(() => ({
    from(table: unknown) {
      const rows = table === prescriptionsTable ? [pres]
        : table === prescriptionItemsTable ? items
        : table === lembretesPrescricaoTable ? [{ periodos }]
        : table === clientsTable ? [{ telegramChatId: "patient-test" }]
        : table === mensagensCatalogoTable ? catalogo : [];
      const result = () => table === mensagensCatalogoTable && falhaCatalogo
        ? Promise.reject(new Error("catalogo indisponivel"))
        : Promise.resolve(rows);
      const chain = { where: () => chain, limit: () => chain, then: (ok: any, fail: any) => result().then(ok, fail) };
      return chain;
    },
  }) as any);
  vi.mocked(db.insert).mockReturnValue({
    values: () => ({ returning: async () => [pres] }),
  } as any);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function mensagensPaciente() {
  return [
    ...vi.mocked(sendWhatsapp).mock.calls.map((call) => call[1]),
    ...vi.mocked(sendTelegram).mock.calls.filter((call) => call[0] === "patient-test").map((call) => call[1]),
  ];
}

async function enviar(emissao: boolean, canal?: unknown) {
  const response = emissao
    ? await request(app).post("/prescriptions/emit").send({ ...pres, items })
    : await request(app).post("/prescriptions/42/enviar-lembrete").send(canal === undefined ? {} : { canal });
  // Emission's Telegram send is intentionally fire-and-forget.
  await new Promise<void>((resolve) => setImmediate(resolve));
  return response;
}

describe.each([false, true])("lembrete rico (emissao=%s)", (emissao) => {
  it("usa o catalogo real e a prescricao, nunca o template simples", async () => {
    const response = await enviar(emissao);
    expect(response.status).toBe(emissao ? 201 : 200);
    expect(mensagensPaciente()).toHaveLength(2);
    for (const mensagem of mensagensPaciente()) {
      expect(mensagem).toContain("Saudacao rica IM");
      expect(mensagem).toContain("Frase exclusiva sexta");
      expect(mensagem).toContain("segunda semana rica");
      expect(mensagem).toContain("Paciente, tudo bem?");
      expect(mensagem).toContain("Formula Teste");
      expect(mensagem).not.toContain("Segue o lembrete");
    }
  });

  it.each(["erro", "vazio", "PERIODO", "DIA_SEMANA", "SEMANA_MES"])("continua enviando com fallback: %s", async (cenario) => {
    falhaCatalogo = cenario === "erro";
    if (cenario === "vazio") catalogo = [];
    else if (!falhaCatalogo) catalogo = catalogoCompleto.filter((row) => row.categoria !== cenario);
    const response = await enviar(emissao);
    expect(response.status).toBe(emissao ? 201 : 200);
    expect(mensagensPaciente()).toEqual([1, 2].map(() => templateLembretePrescricao({
      clienteNome: pres.clientName, clienteGenero: "nao_informado", periodos, agora,
    })));
  });
});

describe("canal de reenvio", () => {
  it.each([
    ["ambos", 1, 2], ["whatsapp", 1, 0], ["telegram", 0, 2], [undefined, 1, 2],
  ])("%s entrega apenas pelos canais escolhidos, incluindo copia CEO", async (canal, wa, tg) => {
    const response = await enviar(false, canal);
    expect(response.status).toBe(200);
    expect(response.body.canal).toBe(canal ?? "ambos");
    expect(sendWhatsapp).toHaveBeenCalledTimes(wa);
    expect(sendTelegram).toHaveBeenCalledTimes(tg);
    if (tg) {
      expect(sendTelegram).toHaveBeenCalledWith("patient-test", expect.stringContaining("Saudacao rica IM"));
      expect(sendTelegram).toHaveBeenCalledWith("ceo-test", expect.stringContaining("Copia CEO"));
    }
  });
  it.each(["email", "", "WHATSAPP", 123])("rejeita canal invalido %s sem enviar", async (canal) => {
    const response = await enviar(false, canal);
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("canal inválido");
    expect(sendWhatsapp).not.toHaveBeenCalled();
    expect(sendTelegram).not.toHaveBeenCalled();
  });
});
