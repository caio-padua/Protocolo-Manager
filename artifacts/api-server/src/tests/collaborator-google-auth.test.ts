import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  clerkUserId: null as string | null,
  professionals: [] as any[],
  companies: [] as any[],
  audit: [] as any[],
  raceUpdateIdentity: null as string | null,
  failAudit: false,
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
    [schema.professionalsTable.email, "email"],
    [schema.professionalsTable.empresaId, "empresaId"],
    [schema.professionalsTable.isPlatformOwner, "isPlatformOwner"],
    [schema.professionalsTable.credentialVersion, "credentialVersion"],
    [schema.professionalsTable.crm, "crm"],
    [schema.professionalsTable.registrationCouncil, "registrationCouncil"],
    [schema.professionalsTable.registrationNumber, "registrationNumber"],
    [schema.professionalsTable.loginUsername, "loginUsername"],
    [schema.professionalsTable.passwordHash, "passwordHash"],
    [schema.professionalsTable.clerkUserIdDev, "clerkUserIdDev"],
    [schema.professionalsTable.clerkUserIdProd, "clerkUserIdProd"],
  ]);

  function queryRows(table: unknown, condition: unknown, fields?: Record<string, unknown>) {
    const query = condition
      ? dialect.sqlToQuery(condition as never)
      : { sql: "", params: [] as unknown[] };
    if (table === schema.empresasTable) {
      let rows = [...state.companies];
      if (query.params.length) rows = rows.filter((company) => company.id === Number(query.params[0]));
      return rows;
    }
    if (table === schema.locationProfessionalsTable) return [];
    if (table !== schema.professionalsTable) return [];
    let rows = [...state.professionals];
    if (query.sql.includes("clerk_user_id_dev")) {
      rows = rows.filter((p) => p.clerkUserIdDev === query.params[0]);
    } else if (query.sql.includes("clerk_user_id_prod")) {
      rows = rows.filter((p) => p.clerkUserIdProd === query.params[0]);
    } else if (query.sql.includes("is_primary_doctor")) {
      rows = rows.filter((p) => p.isPrimaryDoctor === true && p.active === true);
    } else if (query.sql.includes("empresa_id")) {
      rows = rows.filter((p) => Number(p.empresaId) === Number(query.params[0]));
    } else if (query.params.some(Array.isArray)) {
      const ids = query.params.find(Array.isArray) as number[];
      rows = rows.filter((p) => ids.includes(p.id));
    } else if (query.sql.includes("login_username")) {
      const normalized = String(query.params[0] ?? "").toLowerCase();
      const cpfDigits = String(query.params[2] ?? "");
      rows = rows.filter((p) => {
        const emailMatches = p.email?.trim().toLowerCase() === normalized;
        const storedCpf = String(p.cpf ?? "").replace(/[^0-9]/g, "");
        const cpfMatches = Boolean(cpfDigits) && storedCpf === cpfDigits;
        const legacyMatches =
          !p.email?.trim() &&
          !storedCpf &&
          p.loginUsername?.trim().toLowerCase() === normalized;
        return emailMatches || cpfMatches || legacyMatches;
      });
    } else if (query.sql.includes('"id"')) {
      rows = rows.filter((p) => p.id === Number(query.params[0]));
    }
    if (!fields) return rows;
    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, expression]) => [
          key,
          key === "hasPassword"
            ? Boolean(row.passwordHash)
            : columnNames.has(expression)
              ? row[columnNames.get(expression)!]
              : null,
        ]),
      ),
    );
  }

  const db: Record<string, any> = {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        let condition: unknown;
        const chain: any = {
          where(value: unknown) {
            condition = value;
            return chain;
          },
          innerJoin() {
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
          returning: async (fields?: Record<string, unknown>) => {
            const query = dialect.sqlToQuery(condition as never);
            const id = Number(query.params[0]);
            const prof = state.professionals.find((p) => p.id === id);
            if (!prof) return [];
            if ("passwordHash" in values && query.sql.toUpperCase().includes("IS NULL")) {
              const expectedVersion = Number(query.params[1]);
              if (
                prof.passwordHash != null ||
                Number(prof.credentialVersion ?? 0) !== expectedVersion
              ) return [];
              Object.assign(prof, values);
              return [{ id: prof.id }];
            }
            if (query.sql.toUpperCase().includes("IS NULL")) {
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
            }
            if (
              query.sql.includes("credential_version") &&
              Number(prof.credentialVersion ?? 0) !== Number(query.params[1])
            ) return [];
            Object.assign(prof, values);
            if (!fields) return [{ id: prof.id }];
            return [
              Object.fromEntries(
                Object.entries(fields).map(([key, expression]) => [
                  key,
                  columnNames.has(expression) ? prof[columnNames.get(expression)!] : null,
                ]),
              ),
            ];
          },
        }),
      }),
    }),
    insert: () => ({
      values: async (value: unknown) => {
        if (state.failAudit) throw new Error("synthetic audit failure");
        state.audit.push(value);
      },
    }),
  };
  db.transaction = async (callback: (tx: Record<string, any>) => Promise<unknown>) => {
    const previousProfessionals = structuredClone(state.professionals);
    const previousAudit = structuredClone(state.audit);
    try {
      return await callback(db);
    } catch (error) {
      state.professionals = previousProfessionals;
      state.audit = previousAudit;
      throw error;
    }
  };

  return { ...schema, db };
});

import router from "../routes/collaborator";
import professionalsRouter from "../routes/professionals";
import { tenantContextMiddleware, requirePlatformOwner } from "../middleware/tenantContext";
import {
  createCollaboratorToken,
  hashPassword,
  verifyCollaboratorToken,
  verifyPassword,
} from "../lib/collaborator-auth";
import { resolveClerkEnvironment } from "../lib/clerk-environment";

const app = express()
  .use(express.json())
  .use(tenantContextMiddleware)
  .use(router)
  .use(professionalsRouter)
  .get("/test/tenant-context", (req, res) => res.json(req.tenantContext))
  .get("/test/platform-owner", requirePlatformOwner, (_req, res) => res.json({ ok: true }));
const originalPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const originalNodeEnv = process.env.NODE_ENV;
const originalReplitDevDomain = process.env.REPLIT_DEV_DOMAIN;

function professional(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    name: "Caio Henrique Fernandes Padua",
    role: "executor",
    category: "medico",
    isPrimaryDoctor: true,
    active: true,
    cpf: "11144477735",
    email: null,
    empresaId: 5,
    isPlatformOwner: false,
    credentialVersion: 0,
    crm: "CRM 000000",
    registrationCouncil: "CRM",
    registrationNumber: "000000",
    loginUsername: "caio",
    passwordHash: null,
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
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
  state.companies = [
    { id: 5, ativa: true, status: "ATIVO" },
    { id: 6, ativa: true, status: "ATIVO" },
  ];
  state.audit = [];
  state.raceUpdateIdentity = null;
  state.failAudit = false;
});

afterAll(() => {
  if (originalPublishableKey === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
  else process.env.CLERK_PUBLISHABLE_KEY = originalPublishableKey;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalReplitDevDomain === undefined) delete process.env.REPLIT_DEV_DOMAIN;
  else process.env.REPLIT_DEV_DOMAIN = originalReplitDevDomain;
});

describe("recuperação única do médico principal no desenvolvimento", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.REPLIT_DEV_DOMAIN = "preview.example.test";
  });

  afterEach(() => {
    process.env.NODE_ENV = "development";
    process.env.REPLIT_DEV_DOMAIN = "preview.example.test";
  });

  function startRecovery(ip = "192.0.2.10") {
    return request(app)
      .post("/collaborator/dev-primary-recovery/start")
      .set("X-Forwarded-For", ip)
      .send({});
  }

  it("recupera somente o cadastro existente, invalida sessao anterior e entra como o mesmo medico", async () => {
    state.professionals[0].isPlatformOwner = true;
    state.professionals[0].passwordHash = hashPassword("old-synthetic-password");
    const oldToken = collaboratorToken();

    const started = await startRecovery();
    expect(started.status).toBe(200);
    expect(started.body.challenge).toEqual(expect.any(String));
    expect(started.body.expiresInSeconds).toBe(600);
    expect(started.headers["cache-control"]).toContain("no-store");

    const newPassword = "new-synthetic-password-2026";
    const completed = await request(app)
      .post("/collaborator/dev-primary-recovery/complete")
      .send({ challenge: started.body.challenge, newPassword });

    expect(completed.status).toBe(200);
    expect(completed.body.professional.id).toBe(41);
    expect(verifyPassword(newPassword, state.professionals[0].passwordHash)).toBe(true);
    expect(state.professionals[0].credentialVersion).toBe(1);
    expect(state.professionals).toHaveLength(1);
    expect(state.audit.at(-1)).toMatchObject({
      professionalId: 41,
      action: "dev_primary_password_recovered",
      detail: { environment: "development", priorSessionsInvalidated: true },
    });
    expect(JSON.stringify(state.audit)).not.toContain(newPassword);
    expect(JSON.stringify(state.audit)).not.toContain(state.professionals[0].passwordHash);
    expect(
      (await request(app).get("/collaborator/me").set("Authorization", `Bearer ${oldToken}`)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get("/collaborator/me")
          .set("Authorization", `Bearer ${completed.body.token}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/collaborator/login")
          .send({ identifier: "111.444.777-35", password: newPassword })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/collaborator/dev-primary-recovery/complete")
          .send({ challenge: started.body.challenge, newPassword: "replay-synthetic-password" })
      ).status,
    ).toBe(401);
  });

  it("não abre o fluxo em produção nem altera a senha", async () => {
    state.professionals[0].isPlatformOwner = true;
    const existingHash = hashPassword("existing-synthetic-password");
    state.professionals[0].passwordHash = existingHash;
    process.env.NODE_ENV = "production";

    const started = await startRecovery("192.0.2.11");
    const completed = await request(app)
      .post("/collaborator/dev-primary-recovery/complete")
      .send({ challenge: "synthetic-token", newPassword: "new-synthetic-password" });

    expect(started.status).toBe(404);
    expect(completed.status).toBe(404);
    expect(state.professionals[0].passwordHash).toBe(existingHash);
    expect(state.professionals[0].credentialVersion).toBe(0);
    expect(state.audit).toHaveLength(0);
  });

  it("falha fechada sem dono ativo unico e nao revela qual cadastro esta ausente", async () => {
    const originalPasswordHash = hashPassword("existing-synthetic-password");
    state.professionals[0].passwordHash = originalPasswordHash;

    const withoutOwner = await startRecovery("192.0.2.12");
    expect(withoutOwner.status).toBe(409);

    state.professionals[0].isPlatformOwner = true;
    state.professionals.push(professional({ id: 42, isPrimaryDoctor: true, isPlatformOwner: false }));
    const duplicatedPrimary = await startRecovery("192.0.2.13");
    expect(duplicatedPrimary.status).toBe(409);

    state.professionals = [professional({ active: false, isPlatformOwner: true })];
    const inactive = await startRecovery("192.0.2.14");
    expect(inactive.status).toBe(409);
    expect(state.professionals[0].passwordHash).toBeNull();
  });

  it("recusa senha curta sem alterar dados e permite concluir o mesmo desafio com senha válida", async () => {
    state.professionals[0].isPlatformOwner = true;
    const existingHash = hashPassword("existing-synthetic-password");
    state.professionals[0].passwordHash = existingHash;
    const started = await startRecovery("192.0.2.15");

    const shortPassword = await request(app)
      .post("/collaborator/dev-primary-recovery/complete")
      .send({ challenge: started.body.challenge, newPassword: "short" });
    expect(shortPassword.status).toBe(400);
    expect(state.professionals[0].passwordHash).toBe(existingHash);
    expect(state.professionals[0].credentialVersion).toBe(0);

    const validPassword = await request(app)
      .post("/collaborator/dev-primary-recovery/complete")
      .send({ challenge: started.body.challenge, newPassword: "valid-synthetic-password" });
    expect(validPassword.status).toBe(200);
    expect(state.professionals[0].credentialVersion).toBe(1);
  });

  it("recusa desafio vencido sem alterar senha ou sessao", async () => {
    state.professionals[0].isPlatformOwner = true;
    const existingHash = hashPassword("existing-synthetic-password");
    state.professionals[0].passwordHash = existingHash;
    const now = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const started = await startRecovery("192.0.2.18");
      dateNow.mockReturnValue(now + 10 * 60 * 1000 + 1);
      const completed = await request(app)
        .post("/collaborator/dev-primary-recovery/complete")
        .send({ challenge: started.body.challenge, newPassword: "new-synthetic-password" });

      expect(completed.status).toBe(401);
      expect(state.professionals[0].passwordHash).toBe(existingHash);
      expect(state.professionals[0].credentialVersion).toBe(0);
      expect(state.audit).toHaveLength(0);
    } finally {
      dateNow.mockRestore();
    }
  });

  it("consome o desafio uma unica vez mesmo com duas conclusoes simultaneas", async () => {
    state.professionals[0].isPlatformOwner = true;
    const started = await startRecovery("192.0.2.16");
    const challenge = started.body.challenge;

    const results = await Promise.all([
      request(app)
        .post("/collaborator/dev-primary-recovery/complete")
        .send({ challenge, newPassword: "first-synthetic-password" }),
      request(app)
        .post("/collaborator/dev-primary-recovery/complete")
        .send({ challenge, newPassword: "second-synthetic-password" }),
    ]);

    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.some((result) => result.status === 409 || result.status === 401)).toBe(true);
    expect(state.professionals[0].credentialVersion).toBe(1);
    expect(state.audit.filter((entry) => entry.action === "dev_primary_password_recovered")).toHaveLength(1);
  });

  it("reverte a senha e a sessao se a auditoria nao puder ser gravada", async () => {
    state.professionals[0].isPlatformOwner = true;
    const existingHash = hashPassword("existing-synthetic-password");
    state.professionals[0].passwordHash = existingHash;
    state.failAudit = true;
    const started = await startRecovery("192.0.2.17");

    const completed = await request(app)
      .post("/collaborator/dev-primary-recovery/complete")
      .send({ challenge: started.body.challenge, newPassword: "new-synthetic-password" });

    expect(completed.status).toBe(500);
    expect(state.professionals[0].passwordHash).toBe(existingHash);
    expect(state.professionals[0].credentialVersion).toBe(0);
    expect(state.audit).toHaveLength(0);
  });
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
      cpf: "11144477735",
      googleLinked: false,
    });
    expect(response.body.professional.clerkUserIdDev).toBeUndefined();
    expect(response.body.professional.clerkUserIdProd).toBeUndefined();
  });

  it("mostra o usuario e o status da senha apenas para a identidade da sessao", async () => {
    state.professionals[0].passwordHash = hashPassword("synthetic-password");
    state.professionals.push(
      professional({
        id: 42,
        name: "Outro Profissional",
        loginUsername: "outro",
        cpf: "22233344455",
      }),
    );

    const response = await request(app)
      .get("/collaborator/me?professionalId=42")
      .set("Authorization", `Bearer ${collaboratorToken(41)}`);

    expect(response.status).toBe(200);
    expect(response.body.professional).toMatchObject({
      id: 41,
      name: "Caio Henrique Fernandes Padua",
      crm: "CRM 000000",
      registrationCouncil: "CRM",
      registrationNumber: "000000",
      loginUsername: "caio",
      hasPassword: true,
      active: true,
    });
    expect(response.body.professional.passwordHash).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(state.professionals[0].passwordHash);
  });

  it("nao informa senha quando nao existe credencial cadastrada", async () => {
    const response = await request(app)
      .get("/collaborator/me")
      .set("Authorization", `Bearer ${collaboratorToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.professional.hasPassword).toBe(false);
    expect(response.body.professional.passwordHash).toBeUndefined();
  });

  it("recusa a consulta da identidade sem sessao de colaborador", async () => {
    const response = await request(app).get("/collaborator/me");
    expect(response.status).toBe(401);
  });

  it("nao encontra nem troca a identidade quando o profissional da sessao nao existe", async () => {
    state.professionals = [];
    const response = await request(app)
      .get("/collaborator/me")
      .set("Authorization", `Bearer ${collaboratorToken(999)}`);
    expect(response.status).toBe(401);
  });

  it("falha fechada quando o ambiente Clerk nao pode ser identificado", async () => {
    process.env.CLERK_PUBLISHABLE_KEY = "unknown";
    state.clerkUserId = "google-user-caio";
    expect((await request(app).post("/collaborator/google/session")).status).toBe(503);
  });

  it("mantem funcionando o login atual por usuario e senha", async () => {
    state.professionals[0].passwordHash = hashPassword("synthetic-password");
    state.professionals[0].cpf = null;
    const response = await request(app)
      .post("/collaborator/login")
      .send({ username: "caio", password: "synthetic-password" });
    expect(response.status).toBe(200);
    expect(verifyCollaboratorToken(response.body.token)?.professionalId).toBe(41);
  });

  it("aceita e-mail normalizado e CPF formatado como identificador", async () => {
    state.professionals[0].passwordHash = hashPassword("synthetic-password");
    state.professionals[0].email = "caio@example.test";
    const byEmail = await request(app)
      .post("/collaborator/login")
      .send({ identifier: "CAIO@EXAMPLE.TEST", password: "synthetic-password" });
    expect(byEmail.status).toBe(200);

    const byCpf = await request(app)
      .post("/collaborator/login")
      .send({ identifier: "111.444.777-35", password: "synthetic-password" });
    expect(byCpf.status).toBe(200);
  });

  it("desativa o usuário antigo depois que o cadastro recebe CPF ou e-mail", async () => {
    state.professionals[0].passwordHash = hashPassword("synthetic-password");
    const response = await request(app)
      .post("/collaborator/login")
      .send({ identifier: "caio", password: "synthetic-password" });
    expect(response.status).toBe(401);
    expect(JSON.stringify(state.audit)).not.toContain("caio");
  });

  it("troca a própria senha e invalida sessões anteriores sem aceitar alvo do navegador", async () => {
    state.professionals[0].passwordHash = hashPassword("old-password");
    state.professionals.push(
      professional({ id: 42, name: "Outro Profissional", passwordHash: hashPassword("other-password") }),
    );
    const oldToken = collaboratorToken(41);
    const response = await request(app)
      .post("/collaborator/change-password")
      .set("Authorization", `Bearer ${oldToken}`)
      .send({
        professionalId: 42,
        currentPassword: "old-password",
        newPassword: "new-synthetic-password",
      });

    expect(response.status).toBe(200);
    expect(state.professionals[0].credentialVersion).toBe(1);
    expect(state.professionals[1].passwordHash).not.toBe("new-synthetic-password");
    expect(verifyCollaboratorToken(response.body.token)?.credentialVersion).toBe(1);
    expect(
      (await request(app).get("/collaborator/me").set("Authorization", `Bearer ${oldToken}`)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get("/collaborator/me")
          .set("Authorization", `Bearer ${response.body.token}`)
      ).status,
    ).toBe(200);
  });

  it("recusa troca de senha com senha atual incorreta ou senha nova curta", async () => {
    state.professionals[0].passwordHash = hashPassword("old-password");
    const token = collaboratorToken();
    const wrongCurrent = await request(app)
      .post("/collaborator/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrong", newPassword: "new-synthetic-password" });
    const shortNew = await request(app)
      .post("/collaborator/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "old-password", newPassword: "short" });
    expect(wrongCurrent.status).toBe(401);
    expect(shortNew.status).toBe(400);
    expect(state.professionals[0].credentialVersion).toBe(0);
  });

  it("recusa a primeira senha sem sessao de colaborador", async () => {
    const response = await request(app)
      .post("/collaborator/initial-password")
      .send({ newPassword: "synthetic-first-password" });
    expect(response.status).toBe(401);
    expect(state.professionals[0].passwordHash).toBeNull();
    expect(state.professionals[0].credentialVersion).toBe(0);
  });

  it("valida o comprimento da primeira senha antes de gravar", async () => {
    const token = collaboratorToken();
    const shortPassword = await request(app)
      .post("/collaborator/initial-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "curta" });
    const longPassword = await request(app)
      .post("/collaborator/initial-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "x".repeat(129) });

    expect(shortPassword.status).toBe(400);
    expect(longPassword.status).toBe(400);
    expect(state.professionals[0].passwordHash).toBeNull();
    expect(state.professionals[0].credentialVersion).toBe(0);
  });

  it("cria a primeira senha somente para a conta da sessao e invalida tokens antigos", async () => {
    state.professionals.push(
      professional({
        id: 42,
        name: "Outro Profissional",
        loginUsername: "outro",
        cpf: "22233344455",
      }),
    );
    const originalToken = collaboratorToken(41);
    const newPassword = "synthetic-first-password";
    const response = await request(app)
      .post("/collaborator/initial-password")
      .set("Authorization", `Bearer ${originalToken}`)
      .send({ professionalId: 42, newPassword });

    expect(response.status).toBe(200);
    expect(state.professionals[0].credentialVersion).toBe(1);
    expect(verifyPassword(newPassword, state.professionals[0].passwordHash)).toBe(true);
    expect(state.professionals[1].passwordHash).toBeNull();
    expect(state.professionals[1].credentialVersion).toBe(0);
    expect(response.body.professional.passwordHash).toBeUndefined();
    expect(JSON.stringify(state.audit)).toContain("password_initialized");
    expect(JSON.stringify(state.audit)).not.toContain(newPassword);
    expect(JSON.stringify(state.audit)).not.toContain(state.professionals[0].passwordHash);
    expect(
      (await request(app).get("/collaborator/me").set("Authorization", `Bearer ${originalToken}`)).status,
    ).toBe(401);
    expect(
      (await request(app).get("/collaborator/me").set("Authorization", `Bearer ${response.body.token}`)).status,
    ).toBe(200);

    const login = await request(app)
      .post("/collaborator/login")
      .send({ identifier: "111.444.777-35", password: newPassword });
    expect(login.status).toBe(200);
    expect(verifyCollaboratorToken(login.body.token)?.professionalId).toBe(41);
  });

  it("nao redefine uma senha existente pela rota de primeira senha", async () => {
    const existingHash = hashPassword("existing-synthetic-password");
    state.professionals[0].passwordHash = existingHash;
    const response = await request(app)
      .post("/collaborator/initial-password")
      .set("Authorization", `Bearer ${collaboratorToken()}`)
      .send({ newPassword: "new-synthetic-password" });

    expect(response.status).toBe(409);
    expect(state.professionals[0].passwordHash).toBe(existingHash);
    expect(state.professionals[0].credentialVersion).toBe(0);
  });

  it("permite somente uma gravacao em duas tentativas concorrentes", async () => {
    const token = collaboratorToken();
    const results = await Promise.all([
      request(app)
        .post("/collaborator/initial-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ newPassword: "synthetic-first-password-one" }),
      request(app)
        .post("/collaborator/initial-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ newPassword: "synthetic-first-password-two" }),
    ]);

    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.some((result) => result.status === 409 || result.status === 401)).toBe(true);
    expect(state.professionals[0].credentialVersion).toBe(1);
    expect(verifyPassword("synthetic-first-password-one", state.professionals[0].passwordHash) ||
      verifyPassword("synthetic-first-password-two", state.professionals[0].passwordHash)).toBe(true);
  });

  it("atualiza e-mail e CPF somente na conta da sessão e encerra sessões anteriores", async () => {
    state.professionals[0].passwordHash = hashPassword("old-password");
    state.professionals[0].cpf = null;
    state.professionals.push(
      professional({
        id: 42,
        name: "Outro Profissional",
        email: null,
        cpf: null,
        passwordHash: hashPassword("other-password"),
      }),
    );
    const oldToken = collaboratorToken(41);
    const response = await request(app)
      .put("/collaborator/me/identity")
      .set("Authorization", `Bearer ${oldToken}`)
      .send({
        professionalId: 42,
        email: "CAIO@EXAMPLE.TEST",
        cpf: "111.444.777-35",
        currentPassword: "old-password",
      });

    expect(response.status).toBe(200);
    expect(state.professionals[0]).toMatchObject({
      email: "caio@example.test",
      cpf: "11144477735",
      credentialVersion: 1,
    });
    expect(state.professionals[1].email).toBeNull();
    expect(state.professionals[1].cpf).toBeNull();
    expect(verifyCollaboratorToken(response.body.token)?.credentialVersion).toBe(1);
    expect(JSON.stringify(state.audit)).not.toContain("caio@example.test");
    expect(
      (await request(app).get("/collaborator/me").set("Authorization", `Bearer ${oldToken}`)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get("/collaborator/me")
          .set("Authorization", `Bearer ${response.body.token}`)
      ).status,
    ).toBe(200);
  });

  it("recusa CPF inválido ou identificadores sem confirmação da senha atual", async () => {
    state.professionals[0].passwordHash = hashPassword("old-password");
    const token = collaboratorToken();
    const invalidCpf = await request(app)
      .put("/collaborator/me/identity")
      .set("Authorization", `Bearer ${token}`)
      .send({ cpf: "123", currentPassword: "old-password" });
    const wrongPassword = await request(app)
      .put("/collaborator/me/identity")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "caio@example.test", currentPassword: "wrong-password" });
    expect(invalidCpf.status).toBe(400);
    expect(wrongPassword.status).toBe(401);
    expect(state.professionals[0].email).toBeNull();
    expect(state.professionals[0].credentialVersion).toBe(0);
  });

  it("nao aceita que o navegador conceda outra clinica ao profissional", async () => {
    const response = await request(app)
      .get("/test/tenant-context?empresaId=6")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(403);
  });

  it("permite ao proprietario autenticado selecionar uma clinica ativa", async () => {
    state.professionals[0].isPlatformOwner = true;
    const response = await request(app)
      .get("/test/tenant-context?empresaId=6")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      empresaId: 6,
      isPlatformOwner: true,
      authenticated: true,
      professionalId: 41,
    });
    expect(
      (await request(app).get("/test/platform-owner").set("Authorization", `Bearer ${collaboratorToken()}`)).status,
    ).toBe(200);
  });

  it("nega acesso global sem sessão mesmo que o contexto anônimo tenha uma clínica padrão", async () => {
    const response = await request(app).get("/test/platform-owner");
    expect(response.status).toBe(403);
  });

  it("não revela profissionais nem permite reivindicar credenciais no bootstrap público", async () => {
    const status = await request(app).get("/collaborator/bootstrap-status");
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ needsBootstrap: false, staff: [] });

    const bootstrap = await request(app)
      .post("/collaborator/bootstrap")
      .send({ professionalId: 41, username: "attacker", password: "synthetic-password" });
    expect(bootstrap.status).toBe(401);
    expect(state.professionals[0].loginUsername).toBe("caio");
  });

  it("protege leitura e edição de profissionais sem sessão autenticada", async () => {
    const requests = await Promise.all([
      request(app).get("/professionals"),
      request(app).get("/professionals/41"),
      request(app).get("/professionals/41/locations"),
      request(app).post("/professionals").send({ name: "Cadastro sintético" }),
      request(app).put("/professionals/41").send({ email: "attacker@example.test" }),
      request(app).delete("/professionals/41"),
    ]);
    expect(requests.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });

  it("omite CPF e e-mail do profissional para colaborador sem papel global", async () => {
    state.professionals[0].email = "private@example.test";
    const response = await request(app)
      .get("/professionals")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).not.toHaveProperty("cpf");
    expect(response.body[0]).not.toHaveProperty("email");
  });

  it("permite ao proprietário autenticado ler o cadastro privado da própria clínica", async () => {
    state.professionals[0].isPlatformOwner = true;
    state.professionals[0].email = "owner@example.test";
    const response = await request(app)
      .get("/professionals?empresaId=5")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      cpf: "11144477735",
      email: "owner@example.test",
    });
  });

  it("não permite que colaborador sem papel global crie, altere ou desative profissionais", async () => {
    state.professionals[0].email = "current@example.test";
    const token = `Bearer ${collaboratorToken()}`;
    const [create, update, deactivate] = await Promise.all([
      request(app).post("/professionals").set("Authorization", token).send({ name: "Cadastro sintético" }),
      request(app).put("/professionals/41").set("Authorization", token).send({ email: "changed@example.test" }),
      request(app).delete("/professionals/41").set("Authorization", token),
    ]);
    expect([create.status, update.status, deactivate.status]).toEqual([403, 403, 403]);
    expect(state.professionals[0].email).toBe("current@example.test");
    expect(state.professionals[0].active).toBe(true);
  });

  it("impede o proprietário de consultar profissional de outra clínica", async () => {
    state.professionals[0].isPlatformOwner = true;
    const response = await request(app)
      .get("/professionals/41?empresaId=6")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(404);
  });

  it("restringe a auditoria de colaboradores ao proprietário da plataforma", async () => {
    const response = await request(app)
      .get("/collaborator/audit")
      .set("Authorization", `Bearer ${collaboratorToken()}`);
    expect(response.status).toBe(403);
  });
});
