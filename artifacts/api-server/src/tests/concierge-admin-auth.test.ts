import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const fixtures = vi.hoisted(() => ({
  owner: true, active: true, version: 0, companyActive: true,
  list: vi.fn(), reset: vi.fn(),
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return {
    ...schema,
    db: {
      select: () => ({
        from: (table: unknown) => {
          const rows = table === schema.professionalsTable
            ? [{ id: 101, role: "medico", category: "medico", active: fixtures.active,
                empresaId: 5, isPlatformOwner: fixtures.owner, credentialVersion: fixtures.version }]
            : table === schema.empresasTable
              ? (fixtures.companyActive ? [{ id: 5 }] : [])
              : [];
          const result = Promise.resolve(rows);
          const chain = {
            innerJoin: (..._args: unknown[]) => chain,
            where: (..._args: unknown[]) => chain,
            limit: async () => rows,
            then: result.then.bind(result),
          };
          return chain;
        },
      }),
    },
  };
});
vi.mock("../lib/concierge-penalidade", () => ({
  listPenalidades: fixtures.list,
  resetarPenalidade: fixtures.reset,
  listAuditoriaResets: vi.fn(),
}));
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import router from "../routes/concierge-admin";

const app = express();
app.use(express.json(), tenantContextMiddleware);
app.use("/api", router);
const path = "/api/admin/concierge-penalidade";
const token = () => createCollaboratorToken({ professionalId: 101, role: "medico", credentialVersion: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(fixtures, { owner: true, active: true, version: 0, companyActive: true });
  fixtures.list.mockResolvedValue([]);
  fixtures.reset.mockResolvedValue(true);
});

describe("Concierge: autorização real com persistência simulada", () => {
  it("aceita proprietário ativo com token assinado", async () => {
    expect((await request(app).get(path).set("Authorization", `Bearer ${token()}`)).status).toBe(200);
    expect(fixtures.list).toHaveBeenCalledOnce();
  });
  it.each(["", "Bearer invalido"])("recusa credencial ausente ou inválida: %s", async (authorization) => {
    expect((await request(app).get(path).set("Authorization", authorization)).status).toBe(403);
    expect(fixtures.list).not.toHaveBeenCalled();
  });
  it.each(["owner", "active", "companyActive"] as const)("recusa quando %s é falso", async (field) => {
    fixtures[field] = false;
    expect((await request(app).get(path).set("Authorization", `Bearer ${token()}`)).status).toBe(403);
    expect(fixtures.list).not.toHaveBeenCalled();
  });
  it("recusa credencial revogada", async () => {
    fixtures.version = 1;
    expect((await request(app).get(path).set("Authorization", `Bearer ${token()}`)).status).toBe(403);
    expect(fixtures.list).not.toHaveBeenCalled();
  });
  it("não concede acesso por papel declarado no token", async () => {
    fixtures.owner = false;
    const forgedRole = createCollaboratorToken({ professionalId: 101, role: "platform_owner", credentialVersion: 0 });
    expect((await request(app).patch(`${path}/12345678901`).set("Authorization", `Bearer ${forgedRole}`)).status).toBe(403);
    expect(fixtures.reset).not.toHaveBeenCalled();
  });
});
