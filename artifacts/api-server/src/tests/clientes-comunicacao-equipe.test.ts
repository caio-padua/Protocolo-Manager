/**
 * Cadastro do cliente > Comunicação (rotas reais da equipe; banco e envio simulados, dados sintéticos).
 * Prova: exige colaborador, isola por empresa, link individual sem envio, recusa vinculado/inativo,
 * e que gerar o código NÃO envia e-mail.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const estado = vi.hoisted(() => ({
  cliente: null as null | Record<string, unknown>,
  repetidos: 0,
  emitido: [] as number[],
  emails: [] as unknown[],
  autorizado: true,
  empresa: 1,
}));

vi.mock("@workspace/db", () => {
  const chain = () => {
    const c: Record<string, unknown> = { from: () => c, where: () => c, limit: async () => (estado.cliente ? [estado.cliente] : []) };
    return c;
  };
  return {
    db: { select: () => chain(), update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 1 }] }) }) }), execute: vi.fn(async () => ({ rows: [] })) },
    clientsTable: {}, clientPreferredAgendasTable: {}, empresasTable: {}, clientClinicAgendaDefaultsTable: {}, agendaResourcesTable: {}, locationsTable: {},
  };
});
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), or: vi.fn(), ilike: vi.fn(), inArray: vi.fn(), isNull: vi.fn(), isNotNull: vi.fn(),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (q: any, s: any, n: () => void) => {
    if (!estado.autorizado) { s.status(401).json({ error: "nao autenticado" }); return; }
    q.tenantContext = { empresaId: estado.empresa }; n();
  },
}));
vi.mock("../middleware/tenantContext", () => ({ resolveEmpresaId: vi.fn() }));
vi.mock("../lib/agenda-horario-padrao", () => ({ carregarHorarioPadraoDaAgenda: vi.fn() }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn(), isWhatsappConfigured: vi.fn() }));
vi.mock("../lib/email-service", () => ({ sendTelegramOnboardingEmail: vi.fn(async (d: unknown) => { estado.emails.push(d); return { success: true }; }) }));
vi.mock("../lib/client-preferred-agendas", () => ({ getPreferredAgendas: vi.fn(), setPreferredAgendas: vi.fn(), validateClientLocation: vi.fn(), validateDefaultAgenda: vi.fn(), InvalidPreferredAgendas: class extends Error {} }));
vi.mock("../lib/client-visit-preferences", () => ({ getVisitOptions: vi.fn(), getVisitPreferences: vi.fn(), setVisitPreferences: vi.fn(), VisitPreferenceError: class extends Error {} }));
vi.mock("../lib/protocol-client-agendas", () => ({ ClientProtocolAgendaError: class extends Error {}, loadClientProtocolAgendas: vi.fn() }));
vi.mock("./agentes-integracoes", () => ({ logIntegracao: vi.fn() }));
vi.mock("../routes/agentes-integracoes", () => ({ logIntegracao: vi.fn() }));
vi.mock("../lib/telegram-contato", () => ({ contarCadastrosComCodigo: vi.fn(async () => estado.repetidos) }));
vi.mock("../lib/telegram-magic-link", async (orig) => ({
  ...(await orig<typeof import("../lib/telegram-magic-link")>()),
  emitirLinkMagico: vi.fn(async (id: number) => { estado.emitido.push(id); return { token: "t", url: "https://t.me/bot?start=sintetico", expiraEm: new Date("2026-11-21T00:00:00Z") }; }),
}));

import express from "express";
import request from "supertest";
import router from "../routes/clients";

const app = () => { const a = express(); a.use(express.json()); a.use((q, _s, n) => { (q as any).log = { error: vi.fn(), warn: vi.fn() }; n(); }); a.use(router); return a; };

beforeEach(() => {
  estado.cliente = { name: "Sintetica Teste Silva", cpf: "00000001234", email: "sintetico@example.invalid", phone: "0", status: "active",
    telegramChatId: null, validationPassword: "SVA1234", validationPasswordSentAt: null, birthDate: "1990-01-01", passwordHash: null };
  estado.repetidos = 0; estado.emitido = []; estado.emails = []; estado.autorizado = true;
});

describe("Cadastro > Comunicação (equipe)", () => {
  it("sem colaborador autenticado: 401 e nada é gerado", async () => {
    estado.autorizado = false;
    expect((await request(app()).get("/clients/5/comunicacao")).status).toBe(401);
    expect((await request(app()).post("/clients/5/telegram-link")).status).toBe(401);
    expect(estado.emitido).toEqual([]);
  });

  it("painel mostra situação, indica código repetido e não vaza hash de senha", async () => {
    estado.repetidos = 1;
    const r = await request(app()).get("/clients/5/comunicacao");
    expect(r.status).toBe(200);
    expect(r.body.telegram).toMatchObject({ vinculado: false, codigoRepetido: true });
    expect(r.body.areaCliente).toEqual({ temCpf: true, temDataNascimento: true, temSenhaPropria: false });
    expect(JSON.stringify(r.body)).not.toContain("passwordHash");
  });

  it("link individual: gera para o cliente pedido, devolve a URL e NÃO envia e-mail", async () => {
    const r = await request(app()).post("/clients/5/telegram-link");
    expect(r.status).toBe(200);
    expect(r.body.url).toContain("start=");
    expect(estado.emitido).toEqual([5]);
    expect(estado.emails).toHaveLength(0);
  });

  it("link individual recusa cliente já vinculado, inativo ou de outra empresa", async () => {
    estado.cliente = { ...estado.cliente!, telegramChatId: "chat-sintetico" };
    expect((await request(app()).post("/clients/5/telegram-link")).status).toBe(409);
    estado.cliente = { ...estado.cliente!, telegramChatId: null, status: "inactive" };
    expect((await request(app()).post("/clients/5/telegram-link")).status).toBe(409);
    estado.cliente = null; // a consulta filtra por empresa: outra empresa não encontra o cadastro
    expect((await request(app()).post("/clients/5/telegram-link")).status).toBe(404);
    expect(estado.emitido).toEqual([]);
  });

  it("gerar o código não envia e-mail nem diz que enviou", async () => {
    estado.cliente = { ...estado.cliente!, validationPassword: null };
    const r = await request(app()).post("/clients/5/activate-telegram");
    expect(r.status).toBe(200);
    expect(r.body.emailEnviado).toBe(false);
    expect(estado.emails).toHaveLength(0);
  });

  it("enviar e-mail de ativação só acontece pelo botão explícito e de fato envia", async () => {
    const r = await request(app()).post("/clients/5/resend-telegram-onboarding");
    expect(r.status).toBe(200);
    expect(estado.emails).toHaveLength(1);
  });
});
