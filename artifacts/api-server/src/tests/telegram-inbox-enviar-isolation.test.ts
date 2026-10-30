/**
 * Real route/auth/legacy tenant middleware + server authorization query.
 * Only database and external providers are replaced; no simulated tenant middleware.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), where: vi.fn(),
  execute: vi.fn().mockResolvedValue({ rows: [] }),
  insert: vi.fn(), send: vi.fn(), whatsapp: vi.fn(), log: vi.fn(),
}));
vi.mock("@workspace/db", async () => ({
  ...await import("@workspace/db/schema"),
  db: { select: mocks.select, execute: mocks.execute, insert: mocks.insert },
}));
vi.mock("../lib/telegram", () => ({ sendTelegram: mocks.send }));
vi.mock("../lib/whatsapp", () => ({
  sendWhatsapp: mocks.whatsapp, registrarLogMensagem: mocks.log,
}));
vi.mock("../lib/motor-anamnese", () => ({ computeMotor: vi.fn(), gatilhoBate: vi.fn() }));
vi.mock("../lib/lembrete-periodo", () => ({
  sincronizarLembretePrescricao: vi.fn(), executarLembretesPeriodo: vi.fn(),
}));
vi.mock("../lib/formula-manipulada", () => ({ enriquecerItemFormula: vi.fn() }));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn() } }));

import cockpitRouter from "../routes/cockpit";
import { onboardingRouter } from "../routes/onboarding";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { clientsTable } from "@workspace/db";

const dialect = new PgDialect();
const CLIENTS = [
  { id: 42, empresaId: 5, name: "Cliente Teste", telegramChatId: "test-chat-42", phone: "test-phone-42" },
  { id: 43, empresaId: 7, name: "Cliente Teste", telegramChatId: "test-chat-43", phone: "test-phone-43" },
];
type Grant = { empresaId: number; active: boolean; professionalActive: boolean; empresaActive: boolean; status: string };
let grants: Map<number, Grant>;
let databaseFailure = false;

function token(professionalId: number, role = "medico") {
  return createCollaboratorToken({ professionalId, role });
}
function app() {
  const server = express();
  server.use(express.json());
  // This is the real middleware: deliberately preserves the dangerous legacy
  // platform-owner context to prove it cannot grant access to external sends.
  server.use(tenantContextMiddleware);
  server.use("/onboarding", onboardingRouter);
  server.use(cockpitRouter);
  return server;
}
const server = app();

function writeQueries() {
  return mocks.execute.mock.calls
    .map(([sql]) => dialect.sqlToQuery(sql as SQL))
    .filter(({ sql }) => !sql.trimStart().startsWith("SELECT"));
}
function noSideEffects() {
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.whatsapp).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.log).not.toHaveBeenCalled();
  expect(writeQueries()).toEqual([]);
}

// Let the existing onboarding boot migrations finish before clearing spies.
beforeAll(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });
afterEach(() => { vi.restoreAllMocks(); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  databaseFailure = false;
  grants = new Map([
    [500, { empresaId: 5, active: true, professionalActive: true, empresaActive: true, status: "ATIVO" }],
    [700, { empresaId: 7, active: true, professionalActive: true, empresaActive: true, status: "ATIVO" }],
  ]);
  mocks.send.mockResolvedValue({ sent: true, mock: false });
  mocks.whatsapp.mockResolvedValue({ sent: true });
  mocks.log.mockResolvedValue(undefined);
  mocks.execute.mockImplementation(async (condition: SQL) => {
    const query = dialect.sqlToQuery(condition);
    if (query.sql.includes("FROM professionals p")) {
      if (databaseFailure) throw new Error("database unavailable");
      // Protect the identity binding and all revocation/inactive predicates.
      expect(query.sql).toContain("e.id = p.empresa_id");
      expect(query.sql).toContain("p.id = $1 AND p.active = true");
      expect(query.sql).toContain("e.ativa = true AND e.status = 'ATIVO'");
      expect(query.params).toHaveLength(1);
      const grant = grants.get(query.params[0] as number);
      return { rows: grant?.active && grant.professionalActive && grant.empresaActive && grant.status === "ATIVO"
        ? [{ id: grant.empresaId, nome: "Clínica Teste", slug: grant.empresaId === 5 ? null : "clinica-7" }] : [] };
    }
    if (query.sql.includes("INSERT INTO onboarding_quota")) {
      return { rows: [{ dia_brt: "2026-10-29" }] };
    }
    return { rows: [] };
  });
  mocks.where.mockImplementation((condition: SQL) => {
    const query = dialect.sqlToQuery(condition);
    expect(query.sql).toBe('("clients"."id" = $1 and "clients"."empresa_id" = $2)');
    const [clientId, empresaId] = query.params;
    return { limit: vi.fn().mockResolvedValue(
      CLIENTS.filter((client) => client.id === clientId && client.empresaId === empresaId),
    ) };
  });
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      expect(table).toBe(clientsTable);
      return { where: mocks.where };
    },
  }));
});

for (const route of ["telegram", "guia"] as const) {
  describe(`${route}: autorização real de clínica antes de enviar`, () => {
    function send(professionalId: number | null, clientId = 42, query = "", role = "medico", rawToken?: string) {
      const path = route === "telegram"
        ? `/cockpit/${clientId}/telegram-inbox/enviar` : "/onboarding/enviar-guia";
      const req = request(server).post(path + query)
        .set("X-Empresa-Id", "5")
        .set("X-Tenant-Id", "5");
      if (professionalId !== null) req.set("Authorization", `Bearer ${rawToken ?? token(professionalId, role)}`);
      return req.send({
        texto: "Mensagem de teste", clientId, canais: ["WHATSAPP", "TELEGRAM"],
        guiaUrl: "https://example.test/guia", empresaId: 5, tenant: "padua", isPlatformOwner: true,
      });
    }

    it.each(["", "?empresaId=5"])("empresa 7 não envia ao cliente da empresa 5 (%s)", async (query) => {
      const response = await send(700, 42, query);
      expect(response.status).toBe(404);
      expect(response.body).toEqual(route === "telegram"
        ? { error: "cliente nao encontrado" } : { ok: false, error: "Cliente não encontrado." });
      expect(dialect.sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([42, 7]);
      noSideEffects();
    });

    it("empresa 5 não envia ao cliente da empresa 7 mesmo com role de proprietário e override", async () => {
      expect((await send(500, 43, "?empresaId=7", "platform_owner")).status).toBe(404);
      noSideEffects();
    });

    it.each([null, 999])("sem token/vínculo não há envio (profissional %s)", async (id) => {
      expect((await send(id)).status).toBe(id === null ? 401 : 403);
      expect(mocks.select).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("token adulterado é recusado antes de consultar o banco", async () => {
      expect((await send(700, 42, "", "medico", "invalid")).status).toBe(401);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("token expirado é recusado antes de consultar o banco", async () => {
      const now = Date.now();
      const spy = vi.spyOn(Date, "now").mockReturnValue(now - 13 * 60 * 60 * 1000);
      const expired = token(500);
      spy.mockRestore();
      expect((await send(500, 42, "", "medico", expired)).status).toBe(401);
      expect(mocks.execute).not.toHaveBeenCalled();
      noSideEffects();
    });

    it.each(["active", "professionalActive", "empresaActive", "status"] as const)(
      "associação/profissional/clínica desativada não envia (%s)", async (field) => {
        const grant = grants.get(500)!;
        if (field === "status") grant.status = "SUSPENSO";
        else grant[field] = false;
        expect((await send(500)).status).toBe(403);
        expect(mocks.select).not.toHaveBeenCalled();
        noSideEffects();
      },
    );

    it("falha ao carregar autorização bloqueia sem efeitos colaterais", async () => {
      databaseFailure = true;
      expect((await send(500)).status).toBe(500);
      expect(mocks.select).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("cliente inexistente recebe o mesmo 404 sem enviar", async () => {
      expect((await send(500, 4042)).status).toBe(404);
      noSideEffects();
    });

    it.each([[500, 42], [700, 43]])("caminho autorizado: colaborador %s envia ao cliente %s", async (actor, clientId) => {
      // Onboarding holds cooldown in memory; advance only Date.now, never I/O timers.
      vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000 + clientId * 100_000);
      const response = await send(actor, clientId);
      expect(response.status).toBe(200);
      const client = CLIENTS.find((row) => row.id === clientId)!;
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(mocks.send.mock.calls[0][0]).toBe(client.telegramChatId);
      if (route === "telegram") {
        expect(mocks.send).toHaveBeenCalledWith(client.telegramChatId, "Mensagem de teste");
        const writes = writeQueries().filter(({ sql }) => sql.includes("INSERT INTO telegram_inbox_messages"));
        expect(writes).toHaveLength(1);
        expect(writes[0].params).toEqual([client.empresaId, clientId, client.telegramChatId, "Mensagem de teste"]);
        expect(mocks.log).toHaveBeenCalledTimes(1);
      } else {
        expect(mocks.whatsapp.mock.calls[0][0]).toBe(client.phone);
        expect(writeQueries().filter(({ sql }) => sql.includes("INSERT INTO onboarding_quota"))).toHaveLength(2);
      }
      vi.restoreAllMocks();
    });

    it("revogação é observada pelo mesmo token sem reiniciar", async () => {
      // First request is blocked at client ownership, but proves a valid grant
      // was read. After revocation no client query is permitted with that token.
      const signedToken = token(700);
      expect((await send(700, 42, "", "medico", signedToken)).status).toBe(404);
      grants.get(700)!.active = false;
      mocks.select.mockClear();
      expect((await send(700, 43, "", "medico", signedToken)).status).toBe(403);
      expect(mocks.select).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("tentativa proibida não ocupa o cooldown/limite do cliente", async () => {
      vi.spyOn(Date, "now").mockReturnValue(3_000_000_000_000);
      expect((await send(700)).status).toBe(404);
      noSideEffects();
      expect((await send(500)).status).toBe(200);
      expect(mocks.send).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
    });
  });
}
