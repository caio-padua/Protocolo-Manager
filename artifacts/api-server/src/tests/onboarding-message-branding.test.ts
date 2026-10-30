import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({ rows: [] }),
  lookup: vi.fn(),
  whatsapp: vi.fn(),
  telegram: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    execute: mocks.execute,
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.lookup }) }) }),
  },
  clientsTable: { id: {}, name: {}, phone: {}, telegramChatId: {} },
}));
vi.mock("../lib/whatsapp.js", () => ({ sendWhatsapp: mocks.whatsapp }));
vi.mock("../lib/telegram.js", () => ({ sendTelegram: mocks.telegram }));

import { onboardingRouter } from "../routes/onboarding.js";
import { createCollaboratorToken } from "../lib/collaborator-auth.js";

const app = express();
app.use(express.json());
app.use("/api/onboarding", onboardingRouter);
const dialect = new PgDialect();
let clientId = 1000;
let tenantRows: { id: number; nome: string; slug: string | null }[];
const token = createCollaboratorToken({ professionalId: 77, role: "admin" });

beforeEach(() => {
  vi.clearAllMocks();
  clientId++;
  tenantRows = [{ id: 12, nome: "Clínica Licenciada", slug: "licenciada" }];
  mocks.lookup.mockResolvedValue([{
    id: clientId, name: "Paciente Teste", phone: "+5500000000000",
    telegramChatId: "synthetic-chat",
  }]);
  mocks.whatsapp.mockResolvedValue({ sent: true });
  mocks.telegram.mockResolvedValue({ sent: true });
  mocks.execute.mockImplementation(async (query) => {
    const { sql } = dialect.sqlToQuery(query);
    if (/FROM professionals p/.test(sql)) return { rows: tenantRows };
    if (/INSERT INTO onboarding_quota/.test(sql)) return { rows: [{ dia_brt: "2026-10-29" }] };
    return { rows: [] };
  });
});

function send(extra: object = {}) {
  return request(app).post("/api/onboarding/enviar-guia").set("Authorization", `Bearer ${token}`).send({
    clientId, canais: ["WHATSAPP", "TELEGRAM"],
    guiaUrl: "https://example.com/guia-digital?tenant=licenciada",
    ...extra,
  });
}

describe("Marca na mensagem do Guia Digital", () => {
  it("usa nome do banco nos dois canais e preserva o link", async () => {
    const response = await send({ tenantSlug: " LICENCIADA " }).expect(200);
    expect(response.body.ok).toBe(true);
    expect(mocks.whatsapp).toHaveBeenCalledWith("+5500000000000", expect.stringContaining("*Clínica Licenciada — Seu Guia Digital*"));
    expect(mocks.telegram).toHaveBeenCalledWith("synthetic-chat", expect.stringContaining("Clínica Licenciada — Seu Guia Digital"));
    for (const provider of [mocks.whatsapp, mocks.telegram]) {
      const text = provider.mock.calls[0][1];
      expect(text).not.toContain("Instituto Pádua");
      expect(text).toContain("https://example.com/guia-digital?tenant=licenciada");
      expect(text).toContain("Olá, Paciente!");
    }
    const queries = mocks.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query));
    expect(queries.find(({ sql }) => sql.includes("FROM professionals p"))?.params).toEqual([77]);
    expect(mocks.telegram.mock.calls[0][1]).not.toContain("*");
  });

  it("preserva Instituto Pádua sem tenantSlug para a clínica legada", async () => {
    tenantRows = [{ id: 5, nome: "Nome cadastrado legado", slug: null }];
    await send({ guiaUrl: "https://example.com/guia-digital" }).expect(200);
    for (const provider of [mocks.whatsapp, mocks.telegram]) {
      expect(provider.mock.calls[0][1]).toContain("Instituto Pádua — Seu Guia Digital");
    }
  });

  it("slug não autorizado não envia nem consome quota", async () => {
    const response = await send({ tenantSlug: "desconhecida" }).expect(403);
    expect(response.body.error).toBe("Clínica não autorizada para este colaborador.");
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.telegram).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.some(([query]) =>
      dialect.sqlToQuery(query).sql.includes("INSERT INTO onboarding_quota"),
    )).toBe(false);
  });

  it.each([null, 42, "", "   ", "a".repeat(81)])("rejeita slug inválido: %j", async (tenantSlug) => {
    await send({ tenantSlug }).expect(400);
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.telegram).not.toHaveBeenCalled();
  });

  it("falha no banco impede envio sem fallback de marca", async () => {
    mocks.execute.mockRejectedValue(new Error("Falha simulada"));
    await send({ tenantSlug: "licenciada" }).expect(500);
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.telegram).not.toHaveBeenCalled();
  });
});
