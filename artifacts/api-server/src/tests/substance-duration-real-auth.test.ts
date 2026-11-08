import { describe, expect, it, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const data = vi.hoisted(() => ({
  professionals: [
    { id: 101, role: "admin", category: "admin", active: true, credentialVersion: 2, empresaId: 5, isPlatformOwner: true },
    { id: 102, role: "admin", category: "admin", active: true, credentialVersion: 0, empresaId: 6, isPlatformOwner: false },
    { id: 103, role: "admin", category: "admin", active: false, credentialVersion: 0, empresaId: 5, isPlatformOwner: true },
  ],
  row: {
    id: 1, name: "Substância sintética", category: "Teste", color: "#123456",
    stockQuantity: 0, durationMinutes: 15, preciseDurationSeconds: 150,
    createdAt: new Date("2030-01-01T12:00:00Z"),
  } as Record<string, unknown>,
}));

vi.mock("../lib/secure-settings", () => ({
  getSetting: vi.fn(async () => "150"),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  const dialect = new PgDialect();
  function chain() {
    let table: unknown;
    let query: any;
    const rows = () => {
      if (table === actual.professionalsTable) {
        const params = query ? dialect.sqlToQuery(query).params : [];
        return data.professionals.filter((p) => p.id === Number(params[0]));
      }
      if (table === actual.empresasTable) {
        const params = query ? dialect.sqlToQuery(query).params : [];
        const id = Number(params[0]);
        return id === 5 || id === 6 ? [{ id }] : [];
      }
      if (table === actual.locationProfessionalsTable) return [];
      if (table === actual.substancesTable) return [data.row];
      return [];
    };
    const result: any = {
      from: (value: unknown) => { table = value; return result; },
      where: (value: unknown) => { query = value; return result; },
      innerJoin: () => result,
      limit: () => Promise.resolve(rows()),
      then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(rows()).then(resolve, reject),
    };
    return result;
  }
  const db = {
    select: () => chain(),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          Object.assign(data.row, values);
          return [data.row];
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            Object.assign(data.row, values);
            return [data.row];
          },
        }),
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      delete: () => ({ where: async () => [] }),
      insert: () => ({ values: async () => [] }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    }),
  };
  return { ...actual, db };
});

import { createCollaboratorToken } from "../lib/collaborator-auth";
import { basicAuthMiddleware } from "../middleware/basicAuth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import substancesRouter from "../routes/substances";

const app = express();
app.use(express.json(), basicAuthMiddleware, tenantContextMiddleware, substancesRouter);
const owner = createCollaboratorToken({ professionalId: 101, role: "admin", credentialVersion: 2 });
const stale = createCollaboratorToken({ professionalId: 101, role: "admin", credentialVersion: 1 });
const other = createCollaboratorToken({ professionalId: 102, role: "admin", credentialVersion: 0 });
const inactive = createCollaboratorToken({ professionalId: 103, role: "admin", credentialVersion: 0 });

beforeEach(() => { data.row.preciseDurationSeconds = 150; });

describe("Proteção do catálogo com verificação real da sessão", () => {
  it("permite ao proprietário ativo alterar e reler a duração", async () => {
    const response = await request(app).patch("/substances/1")
      .set("Authorization", `Bearer ${owner}`).send({ durationMinutes: 30 });
    expect(response.status).toBe(200);
    expect(response.body.durationMinutes).toBe(30);
    expect(data.row.preciseDurationSeconds).toBe(1800);
  });

  it("nega credencial inválida, revogada, profissional inativo e outra empresa", async () => {
    for (const [token, status] of [["invalid", 401], [stale, 401], [inactive, 401], [other, 403]] as const) {
      const response = await request(app).patch("/substances/1")
        .set("Authorization", `Bearer ${token}`).send({ durationMinutes: 30 });
      expect(response.status).toBe(status);
      expect(data.row.preciseDurationSeconds).toBe(150);
    }
  });

  it("nega todos os caminhos de escrita sem sessão", async () => {
    expect((await request(app).post("/substances").send({})).status).toBe(401);
    expect((await request(app).put("/substances/1").send({})).status).toBe(401);
    expect((await request(app).patch("/substances/1").send({})).status).toBe(401);
    expect((await request(app).put("/substances/1/components").send({})).status).toBe(401);
  });

  it("limita todos os caminhos de escrita ao proprietário ativo", async () => {
    const body = { name: "Substância sintética", category: "Teste", color: "blue", stockQuantity: 0, durationMinutes: 2.5 };
    const paths = [
      { method: "post" as const, path: "/substances", body, expected: 201 },
      { method: "put" as const, path: "/substances/1", body, expected: 200 },
      { method: "patch" as const, path: "/substances/1", body: { durationMinutes: 2.5 }, expected: 200 },
      { method: "put" as const, path: "/substances/1/components", body: { components: [], isBlend: false }, expected: 200 },
    ];
    for (const item of paths) {
      const denied = await request(app)[item.method](item.path)
        .set("Authorization", `Bearer ${other}`).send(item.body);
      expect(denied.status).toBe(403);
      const allowed = await request(app)[item.method](item.path)
        .set("Authorization", `Bearer ${owner}`).send(item.body);
      expect(allowed.status).toBe(item.expected);
    }
  });
});
