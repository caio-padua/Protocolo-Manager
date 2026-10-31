import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  where: vi.fn(),
  whatsapp: vi.fn(),
  telegram: vi.fn(),
}));

vi.mock("@workspace/db", async () => {
  const { pgTable, integer, text } = await import("drizzle-orm/pg-core");
  return {
    clientsTable: pgTable("clients", {
      id: integer("id"), empresaId: integer("empresa_id"), name: text("name"),
      phone: text("phone"), telegramChatId: text("telegram_chat_id"),
    }),
    db: {
      execute: mocks.execute,
      select: () => ({
        from: () => ({
          where: (condition: SQL) => ({ limit: () => mocks.where(condition) }),
        }),
      }),
    },
  };
});
vi.mock("../lib/whatsapp.js", () => ({ sendWhatsapp: mocks.whatsapp }));
vi.mock("../lib/telegram.js", () => ({ sendTelegram: mocks.telegram }));
vi.mock("../lib/logger.js", () => ({ logger: { error: vi.fn() } }));

import { onboardingRouter } from "../routes/onboarding.js";
import { createCollaboratorToken } from "../lib/collaborator-auth.js";

const dialect = new PgDialect();
// Identificadores das clínicas já usados nos testes de isolamento do projeto.
const cliente = {
  id: 42, empresaId: 5, name: "Cliente de teste", phone: "telefone-simulado",
  telegramChatId: "chat-simulado",
};
let professional: { empresa_id: number | null; active: boolean } | null;
let now = Date.now();
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // Contexto legado não pode dar acesso nem mesmo com flag de administrador.
  req.tenantContext = {
    empresaId: 5,
    isPlatformOwner: true,
    perfilPlataforma: "platform_owner",
    authenticated: true,
    professionalId: 1,
  };
  next();
});
app.use("/api/onboarding", onboardingRouter);
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ ok: false, error: "Falha interna" });
});

const body = {
  clientId: 42, canais: ["WHATSAPP", "TELEGRAM"],
  guiaUrl: "https://example.invalid/guia-digital",
};
function post(token?: string, extra: object = {}, query = "") {
  const req = request(app).post(`/api/onboarding/enviar-guia${query}`);
  if (token) req.set("Authorization", `Bearer ${token}`);
  return req.send({ ...body, ...extra });
}
function assertNoSend() {
  expect(mocks.whatsapp).not.toHaveBeenCalled();
  expect(mocks.telegram).not.toHaveBeenCalled();
  expect(mocks.execute.mock.calls.some(([query]) =>
    dialect.sqlToQuery(query).sql.includes("onboarding_quota"),
  )).toBe(false);
}

describe("Envio do guia — autenticação e pertencimento antes de efeitos", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    now += 120_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    cliente.empresaId = 5;
    professional = { empresa_id: 5, active: true };
    mocks.execute.mockImplementation(async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      if (compiled.sql.includes("FROM professionals p")) {
        expect(compiled.sql).toContain("p.active = true");
        expect(compiled.sql).toContain("JOIN empresas e ON e.id = p.empresa_id");
        expect(compiled.params).toEqual([1]);
        return {
          rows: professional?.active && professional.empresa_id
            ? [{ id: professional.empresa_id, nome: "Clínica de teste", slug: "clinica-teste" }]
            : [],
        };
      }
      if (compiled.sql.includes("INSERT INTO onboarding_quota")) {
        return { rows: [{ dia_brt: "2026-10-29" }] };
      }
      return { rows: [] };
    });
    mocks.where.mockImplementation(async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      expect(compiled.sql).toContain('"clients"."empresa_id"');
      expect(compiled.sql).toContain('"clients"."id"');
      const [clientId, empresaId] = compiled.params;
      return clientId === cliente.id && empresaId === cliente.empresaId ? [cliente] : [];
    });
    mocks.whatsapp.mockResolvedValue({ sent: true });
    mocks.telegram.mockResolvedValue({ sent: true });
  });

  it("envia pelos dois canais simulados ao cliente da clínica do colaborador", async () => {
    const result = await post(createCollaboratorToken({ professionalId: 1, role: "executor" })).expect(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.resultados).toHaveLength(2);
    expect(mocks.whatsapp).toHaveBeenCalledExactlyOnceWith(cliente.phone, expect.any(String));
    expect(mocks.telegram).toHaveBeenCalledExactlyOnceWith(cliente.telegramChatId, expect.any(String));
  });

  it("autoriza também outra clínica, sem fallback fixo para a clínica padrão", async () => {
    professional = { empresa_id: 7, active: true };
    cliente.empresaId = 7;
    await post(createCollaboratorToken({ professionalId: 1, role: "executor" })).expect(200);
    expect(mocks.whatsapp).toHaveBeenCalledTimes(1);
    expect(mocks.telegram).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "invalido"])("nega credencial ausente/inválida: %s", async (token) => {
    await post(token).expect(401);
    expect(mocks.where).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    assertNoSend();
  });

  it("nega token assinado expirado", async () => {
    const token = createCollaboratorToken({ professionalId: 1, role: "executor" });
    vi.spyOn(Date, "now").mockReturnValue(now + 13 * 60 * 60 * 1000);
    await post(token).expect(401);
    assertNoSend();
  });

  it.each([
    null,
    { empresa_id: 5, active: false },
    { empresa_id: null, active: true },
    { empresa_id: 0, active: true },
  ])("nega colaborador removido, inativo ou sem clínica: %j", async (row) => {
    professional = row;
    await post(createCollaboratorToken({ professionalId: 1, role: "admin" })).expect(403);
    expect(mocks.where).not.toHaveBeenCalled();
    assertNoSend();
  });

  it("nega cliente de outra clínica apesar de corpo, query, cabeçalho e contexto legado", async () => {
    professional = { empresa_id: 7, active: true };
    const result = await post(
      createCollaboratorToken({ professionalId: 1, role: "admin" }),
      { empresaId: 5, tenant: "padua", clinicaId: 5 }, "?empresaId=5&tenant=padua",
    ).set("X-Empresa-Id", "5").expect(404);
    expect(result.body.error).toBe("Cliente não encontrado.");
    assertNoSend();
  });

  it.each([
    { tenantSlug: "outra-clinica" },
    { guiaUrl: "https://example.invalid/guia-digital?tenant=outra-clinica" },
  ])("nega clínica divergente no corpo ou no link: %j", async (extra) => {
    await post(createCollaboratorToken({ professionalId: 1, role: "admin" }), extra).expect(403);
    expect(mocks.where).not.toHaveBeenCalled();
    assertNoSend();
  });

  it("não permite que campos do navegador mudem a clínica autorizada", async () => {
    await post(createCollaboratorToken({ professionalId: 1, role: "executor" }),
      { empresaId: 7, clinicaId: 7 }, "?empresaId=7").expect(200);
    expect(mocks.whatsapp).toHaveBeenCalledTimes(1);
  });

  it("cliente inexistente recebe a mesma negativa e não consome quota", async () => {
    const result = await post(createCollaboratorToken({ professionalId: 1, role: "executor" }),
      { clientId: 999999 }).expect(404);
    expect(result.body.error).toBe("Cliente não encontrado.");
    assertNoSend();
  });

  it("vínculo alterado após login é relido, sem confiar no token antigo", async () => {
    const token = createCollaboratorToken({ professionalId: 1, role: "admin" });
    professional = { empresa_id: 7, active: true };
    await post(token).expect(404);
    assertNoSend();
  });

  it("falha ao consultar vínculo bloqueia antes de cliente, quota e provedores", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("banco indisponível"));
    await post(createCollaboratorToken({ professionalId: 1, role: "executor" })).expect(500);
    expect(mocks.where).not.toHaveBeenCalled();
    assertNoSend();
  });
});
