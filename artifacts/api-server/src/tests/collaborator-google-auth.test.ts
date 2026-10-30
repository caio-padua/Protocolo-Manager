import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  clerkUserId: null as string | null,
  professionals: [] as any[],
  audit: [] as any[],
  raceUpdateIdentity: null as string | null,
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: state.clerkUserId }),
}));

vi.mock("@workspace/db", async () => {
  const schema = await import("../../../../lib/db/src/schema");
  const dialect = new PgDialect();
  const columnNames = new Map<unknown, string>([
    [schema.professionalsTable.id, "id"],
    [schema.professionalsTable.name, "name"],
    [schema.professionalsTable.role, "role"],
    [schema.professionalsTable.category, "category"],
    [schema.professionalsTable.isPrimaryDoctor, "isPrimaryDoctor"],
    [schema.professionalsTable.active, "active"],
    [schema.professionalsTable.cpf, "cpf"],
    [schema.professionalsTable.loginUsername, "loginUsername"],
    [schema.professionalsTable.passwordHash, "passwordHash"],
    [schema.professionalsTable.clerkUserIdDev, "clerkUserIdDev"],
    [schema.professionalsTable.clerkUserIdProd, "clerkUserIdProd"],
  ]);

  function queryRows(table: unknown, condition: unknown, fields?: Record<string, unknown>) {
    if (table !== schema.professionalsTable) return [];
    const query = condition
      ? dialect.sqlToQuery(condition as never)
      : { sql: "", params: [] as unknown[] };
    let rows = [...state.professionals];
    if (query.sql.includes("clerk_user_id_dev")) {
      rows = rows.filter((p) => p.clerkUserIdDev === query.params[0]);
    } else if (query.sql.includes("clerk_user_id_prod")) {
      rows = rows.filter((p) => p.clerkUserIdProd === query.params[0]);
    } else if (query.sql.includes("login_username")) {
      rows = rows.filter(
        (p) => p.loginUsername?.toLowerCase() === String(query.params[0]).toLowerCase(),
      );
    } else if (query.sql.includes('"id"')) {
      rows = rows.filter((p) => p.id === Number(query.params[0]));
    }
    if (!fields) return rows;
    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, expression]) => [
          key,
          columnNames.has(expression) ? row[columnNames.get(expression)!] : null,
        ]),
      ),
    );
  }

  const db = {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        let condition: unknown;
        const chain: any = {
          where(value: unknown) {
            condition = value;
            return chain;
          },
          limit() {
            return chain;
          },
          orderBy() {
            return chain;
          },
          then(resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) {
            return Promise.resolve(queryRows(table, condition, fields)).then(resolve, reject);
          },
        };
        return chain;
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => ({
          returning: async () => {
            const query = dialect.sqlToQuery(condition as never);
            const id = Number(query.params[0]);
            const prof = state.professionals.find((p) => p.id === id);
            if (!prof || !query.sql.toUpperCase().includes("IS NULL")) return [];
            if (state.raceUpdateIdentity) {
              const field = query.sql.includes("clerk_user_id_prod")
                ? "clerkUserIdProd"
                : "clerkUserIdDev";
              prof[field] = state.raceUpdateIdentity;
              state.raceUpdateIdentity = null;
              return [];
            }
            const identityField =
              "clerkUserIdProd" in values ? "clerkUserIdProd" : "clerkUserIdDev";
            if (prof[identityField] != null) return [];
            Object.assign(prof, values);
            return [{ id: prof.id }];
          },
        }),
      }),
    }),
    insert: () => ({
      values: async (value: unknown) => {
        state.audit.push(value);
      },
    }),
  };

  return { ...schema, db };
});

import router from "../routes/collaborator";
import { createCollaboratorToken, hashPassword, verifyCollaboratorToken } from "../lib/collaborator-auth";
import { resolveClerkEnvironment } from "../lib/clerk-environment";

const app = express().use(express.json()).use(router);
const originalPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;

function professional(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    name: "Caio Henrique Fernandes Padua",
    role: "executor",
    category: "medico",
    isPrimaryDoctor: true,
    active: true,
    cpf: "12345678901",
    loginUsername: "caio",
    passwordHash: null,
    clerkUserIdDev: null,
    clerkUserIdProd: null,
    ...overrides,
  };
}

function collaboratorToken(professionalId = 41) {
  return createCollaboratorToken({ professionalId, role: "executor" });
}

beforeEach(() => {
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_synthetic";
  state.clerkUserId = null;
  state.professionals = [professional()];
  state.audit = [];
  state.raceUpdateIdentity = null;
});

afterAll(() => {
  if (originalPublishableKey === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
  else process.env.CLERK_PUBLISHABLE_KEY = originalPublishableKey;
});

describe("acesso Google vinculado ao colaborador", () => {
  it("reconhece a separacao entre chaves de desenvolvimento e producao", () => {
    expect(resolveClerkEnvironment("pk_test_synthetic")).toBe("development");
    expect(resolveClerkEnvironment("pk_live_synthetic")).toBe("production");
    expect(resolveClerkEnvironment("")).toBeNull();
    expect(resolveClerkEnvironment("unknown")).toBeNull();
  });

  it("recusa conta Google sem vinculo e nao emite token clinico", async () => {
    state.clerkUserId = "google-user-not-linked";
    const response = await request(app).post("/collaborator/google/session").send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("google_account_unavailable");
    expect(response.body.token).toBeUndefined();
  });

  it("emite somente o token do profissional ativo ja vinculado", async () => {
    state.clerkUserId = "google-user-caio";
    state.professionals[0].clerkUserIdDev = "google-user-caio";
    const response = await request(app).post("/collaborator/google/session").send({
      professionalId: 999,
      role: "admin",
    });
    expect(response.status).toBe(200);
    expect(verifyCollaboratorToken(response.body.token)).toMatchObject({
      professionalId: 41,
      role: "executor",
    });
    expect(response.body.professional.id).toBe(41);
  });

  it("recusa login Google para profissional inativo", async () => {
    state.clerkUserId = "google-user-inactive";
    state.professionals[0].clerkUserIdDev = "google-user-inactive";
    state.professionals[0].active = false;
    expect((await request(app).post("/collaborator/google/session")).status).toBe(403);
  });

  it("exige simultaneamente token PADCOM e sessao Google para vincular", async () => {
    state.clerkUserId = "google-user-caio";
    const missingCollaboratorSession = await request(app).post("/collaborator/google/link");
    state.clerkUserId = null;
    const missingGoogleSession = await request(app)
      .post("/collaborator/google/link")
      .set("Authorization", `Bearer ${collaboratorToken()}`)
      .send({ professionalId: 999, clerkUserId: "forged-user" });
    expect(missingCollaboratorSession.status).toBe(401);
    expect(missingGoogleSession.status).toBe(401);
    expect(state.professionals[0].clerkUserIdDev).toBeNull();
  });

  it("vincula a sessao Google somente ao profissional do token atual", async () => {
    state.clerkUserId = "google-user-caio";
    const response = await request(app)
      .post("/collaborator/google/link")
      .set("Authorization", `Bearer ${collaboratorToken()}`)
      .send({ professionalId: 999, clerkUserId: "forged-user" });
    expect(response.status).toBe(200);
    expect(state.professionals[0].clerkUserIdDev).toBe("google-user-caio");
    expect(verifyCollaboratorToken(response.body.token)?.professionalId).toBe(41);
  });

  it("impede que a mesma conta Google seja vinculada a outro profissional", async () => {
    state.clerkUserId = "google-user-caio";
    state.professionals.push(professional({ id: 42, clerkUserIdDev: "google-user-caio" }));
    const response = await request(app)
      .post("/collaborator/google/link")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(409);
    expect(state.professionals[0].clerkUserIdDev).toBeNull();
  });

  it("nao substitui silenciosamente o Google ja vinculado ao profissional", async () => {
    state.clerkUserId = "google-user-new";
    state.professionals[0].clerkUserIdDev = "google-user-old";
    const response = await request(app)
      .post("/collaborator/google/link")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(409);
    expect(state.professionals[0].clerkUserIdDev).toBe("google-user-old");
  });

  it("preserva vinculos independentes entre desenvolvimento e producao", async () => {
    process.env.CLERK_PUBLISHABLE_KEY = "pk_live_synthetic";
    state.clerkUserId = "google-user-prod";
    state.professionals[0].clerkUserIdDev = "google-user-dev";
    const developmentIdentity = await request(app)
      .post("/collaborator/google/session")
      .send({});
    expect(developmentIdentity.status).toBe(403);
    state.professionals[0].clerkUserIdProd = "google-user-prod";
    const response = await request(app).post("/collaborator/google/session");
    expect(response.status).toBe(200);
    expect(state.professionals[0].clerkUserIdDev).toBe("google-user-dev");
  });

  it("nao sobrescreve identidade concorrente detectada durante a gravacao", async () => {
    state.clerkUserId = "google-user-caio";
    state.raceUpdateIdentity = "google-user-concorrente";
    const response = await request(app)
      .post("/collaborator/google/link")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(409);
    expect(state.professionals[0].clerkUserIdDev).toBe("google-user-concorrente");
  });

  it("retorna os dados de identificacao para a sessao atual sem expor o ID Google", async () => {
    const response = await request(app)
      .get("/collaborator/me")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.professional).toMatchObject({
      id: 41,
      name: "Caio Henrique Fernandes Padua",
      cpf: "12345678901",
      googleLinked: false,
    });
    expect(response.body.professional.clerkUserIdDev).toBeUndefined();
    expect(response.body.professional.clerkUserIdProd).toBeUndefined();
  });

  it("falha fechada quando o ambiente Clerk nao pode ser identificado", async () => {
    process.env.CLERK_PUBLISHABLE_KEY = "unknown";
    state.clerkUserId = "google-user-caio";
    expect((await request(app).post("/collaborator/google/session")).status).toBe(503);
  });

  it("mantem funcionando o login atual por usuario e senha", async () => {
    state.professionals[0].passwordHash = hashPassword("synthetic-password");
    const response = await request(app)
      .post("/collaborator/login")
      .send({ username: "caio", password: "synthetic-password" });
    expect(response.status).toBe(200);
    expect(verifyCollaboratorToken(response.body.token)?.professionalId).toBe(41);
  });
});
