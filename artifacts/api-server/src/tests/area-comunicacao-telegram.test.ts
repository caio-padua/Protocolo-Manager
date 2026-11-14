/**
 * Área do Cliente > Comunicação (rotas reais com sessão do portal; banco e e-mail simulados,
 * dados sintéticos). Prova: acesso só com token, clientId só do token, link individual como
 * caminho principal e código só quando único.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const estado = vi.hoisted(() => ({
  cliente: null as null | Record<string, unknown>,
  repetidos: 0,
  emitido: [] as number[],
  updates: [] as unknown[],
}));

vi.mock("@workspace/db", () => {
  const chain = () => {
    const c: Record<string, unknown> = {
      from: () => c, where: () => c,
      limit: async () => (estado.cliente ? [estado.cliente] : []),
    };
    return c;
  };
  const nomes = ["clientsTable","protocolsTable","protocolItemsTable","substancesTable","sessionsTable","substanceApplicationsTable","paymentsTable","rasTable","examRequestPdfsTable","professionalsTable","validationCodesTable","agendaResourcesTable"];
  return {
    db: { select: () => chain(), update: () => ({ set: (v: unknown) => ({ where: async () => { estado.updates.push(v); } }) }) },
    ...Object.fromEntries(nomes.map((n) => [n, {}])),
  };
});
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), gte: vi.fn(), lte: vi.fn(), asc: vi.fn(), desc: vi.fn(),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));
vi.mock("../lib/agenda-booking", () => ({ computeResourceSlots: vi.fn(), bookSession: vi.fn(), rescheduleSession: vi.fn() }));
vi.mock("../lib/session-google-sync", () => ({ refreshAfterReschedule: vi.fn() }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: vi.fn() }));
vi.mock("../lib/protocol-dose-presentation", () => ({ dosePrescritaParaDocumento: vi.fn(), nomeSubstanciaNoProtocolo: vi.fn() }));
vi.mock("../lib/telegram-contato", () => ({
  contarCadastrosComCodigo: vi.fn(async () => estado.repetidos),
}));
vi.mock("../lib/telegram-magic-link", async (orig) => ({
  ...(await orig<typeof import("../lib/telegram-magic-link")>()),
  emitirLinkMagico: vi.fn(async (id: number) => { estado.emitido.push(id); return { token: "t", url: "https://t.me/bot?start=sintetico", expiraEm: new Date("2026-11-21T00:00:00Z") }; }),
}));

import express from "express";
import request from "supertest";
import router from "../routes/area-paciente";
import { createPortalToken } from "../lib/portal-token";

const app = () => { const a = express(); a.use(express.json()); a.use((q, _s, n) => { (q as any).log = { error: vi.fn() }; n(); }); a.use(router); return a; };
const auth = (id = 11) => ({ Authorization: `Bearer ${createPortalToken(id)}` });

beforeEach(() => {
  estado.cliente = { name: "Sintetica Teste Silva", cpf: "00000001234", status: "active", telegramChatId: null, validationPassword: null };
  estado.repetidos = 0; estado.emitido = []; estado.updates = [];
});

describe("Área do Cliente > Comunicação", () => {
  it("sem sessão: 401 nas duas rotas", async () => {
    expect((await request(app()).get("/area-paciente/comunicacao")).status).toBe(401);
    expect((await request(app()).post("/area-paciente/comunicacao/link")).status).toBe(401);
    expect(estado.emitido).toEqual([]);
  });

  it("mostra o código só quando é único e gera/grava o código do cadastro", async () => {
    const r = await request(app()).get("/area-paciente/comunicacao").set(auth());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ vinculado: false, senha: expect.stringMatching(/^[A-Z]{3}\d{4}$/) });
    expect(r.body.botLink).toContain("t.me/");
    expect(estado.updates).toHaveLength(1);
  });

  it("código repetido em outro cadastro não é mostrado nem gravado: só o link serve", async () => {
    estado.repetidos = 1;
    const r = await request(app()).get("/area-paciente/comunicacao").set(auth());
    expect(r.body.senha).toBeNull();
    expect(estado.updates).toHaveLength(0);
  });

  it("já vinculado: não mostra código", async () => {
    estado.cliente = { ...estado.cliente!, telegramChatId: "chat-sintetico" };
    const r = await request(app()).get("/area-paciente/comunicacao").set(auth());
    expect(r.body).toMatchObject({ vinculado: true, senha: null });
  });

  it("link individual: usa o cliente do token e ignora clientId enviado no corpo", async () => {
    const r = await request(app()).post("/area-paciente/comunicacao/link").set(auth(11)).send({ clientId: 999 });
    expect(r.status).toBe(200);
    expect(r.body.url).toContain("start=");
    expect(estado.emitido).toEqual([11]);
  });

  it("link individual recusa quem já está vinculado e cadastro inativo", async () => {
    estado.cliente = { ...estado.cliente!, telegramChatId: "chat-sintetico" };
    expect((await request(app()).post("/area-paciente/comunicacao/link").set(auth())).status).toBe(409);
    estado.cliente = { ...estado.cliente!, telegramChatId: null, status: "inactive" };
    expect((await request(app()).post("/area-paciente/comunicacao/link").set(auth())).status).toBe(404);
    expect(estado.emitido).toEqual([]);
  });
});
