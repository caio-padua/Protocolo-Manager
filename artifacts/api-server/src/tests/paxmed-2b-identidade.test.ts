import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  active: true,
  allowed: true,
  empresa: 21,
  clinicEmpresa: 21,
  version: 1,
  logo: Buffer.alloc(0),
  pending: true,
  used: false,
  executeCount: 0,
  finalCopies: [] as Buffer[],
  failStorage: false,
}));

vi.mock("@workspace/db", async () => {
  const schema = await import("../../../../lib/db/src/schema");
  const dialect = new PgDialect();
  const db = {
    select: () => ({ from: (table: unknown) => {
      const rows = () => {
        if (table === schema.professionalsTable) return [{
          id: 41, role: "admin", active: state.active, credentialVersion: 0,
          category: "administrativo", empresaId: state.empresa, isPlatformOwner: false,
        }];
        if (table === schema.locationProfessionalsTable) return [{ empresaId: state.empresa }];
        if (table === schema.empresasTable) return [{ id: state.empresa }];
        if (table === schema.locationsTable) return [{ id: 31, nome: "Clínica sintética" }];
        return [];
      };
      const chain: any = { then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject) };
      chain.where = chain.limit = chain.innerJoin = () => chain;
      return chain;
    } }),
    execute: async (query: any) => {
      state.executeCount++;
      const { sql, params } = dialect.sqlToQuery(query);
      if (sql.includes("SELECT nome_clinica")) return { rows: state.version ? [{
        nome_clinica: "Clínica sintética", endereco_linha1: "Rua fictícia",
        endereco_linha2: "Cidade fictícia", versao: state.version,
      }] : [] };
      if (sql.includes("SELECT simbolo_path")) return { rows: state.version ? [{ simbolo_path: "11111111-1111-4111-8111-111111111111" }] : [] };
      if (sql.includes("SELECT id FROM paxmed_2b_upload")) return { rows: state.pending && !state.used ? [{ id: params[0] }] : [] };
      if (sql.includes("UPDATE paxmed_2b_upload")) {
        if (!state.pending || state.used) return { rows: [] };
        state.used = true;
        return { rows: [{ id: params[0] }] };
      }
      if (sql.includes("INSERT INTO paxmed_2b_upload")) return { rows: [] };
      if (sql.includes("INSERT INTO paxmed_2b_identidade")) {
        if (state.version) return { rows: [] };
        state.version = 1;
        return { rows: [{ location_id: 31 }] };
      }
      if (sql.includes("UPDATE paxmed_2b_identidade")) {
        const requestedVersion = params[params.length - 1];
        if (requestedVersion !== state.version) return { rows: [] };
        state.version++;
        return { rows: [{ location_id: 31 }] };
      }
      throw new Error("Consulta inesperada no teste.");
    },
    transaction: async (fn: any) => {
      const oldVersion = state.version, oldUsed = state.used;
      try { return await fn(db); }
      catch (err) { state.version = oldVersion; state.used = oldUsed; throw err; }
    },
  };
  return { ...schema, db };
});

vi.mock("../lib/clinical-access", () => ({
  clinicManagementPermission: async () => ({
    allowed: state.allowed, isOwner: false, empresaId: state.clinicEmpresa,
  }),
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    async getClinicBrandUploadURL() {
      if (state.failStorage) throw new Error("storage offline");
      return "https://example.invalid/signed-upload";
    }
    async getObjectEntityFile() {
      if (state.failStorage) throw Object.assign(new Error("storage offline"), { code: 500 });
      return { getMetadata: async () => [{ size: String(state.logo.length) }], download: async () => [state.logo] };
    }
    async savePrivateObject(_path: string, bytes: Buffer) {
      if (state.failStorage) throw new Error("storage offline");
      state.finalCopies.push(Buffer.from(bytes));
    }
  },
}));

import router from "../routes/paxmed-2b-identidade";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { createCollaboratorToken } from "../lib/collaborator-auth";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.log = { error: vi.fn() } as any;
  next();
});
app.use(tenantContextMiddleware);
app.use(router);
const token = () => createCollaboratorToken({ professionalId: 41, role: "admin" });
const valid = { nome: "Clínica sintética", enderecoLinha1: "Rua fictícia", enderecoLinha2: "Cidade fictícia", versao: 1 };
const uploadId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  Object.assign(state, {
    active: true, allowed: true, empresa: 21, clinicEmpresa: 21, version: 1,
    logo: readFileSync("../padcom/src/assets/padua-dp-mask.png"),
    pending: true, used: false, executeCount: 0, finalCopies: [], failStorage: false,
  });
});

describe("identidade 2B: autenticação, clínica e integridade", () => {
  it("recusa acesso anônimo e sessão revogada antes da consulta", async () => {
    expect((await request(app).get("/paxmed-2b/clinicas/31")).status).toBe(401);
    state.active = false;
    expect((await request(app).get("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`)).status).toBe(401);
    expect(state.executeCount).toBe(0);
  });
  it("exige autorização local e empresa coincidente", async () => {
    state.allowed = false;
    expect((await request(app).get("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`)).status).toBe(403);
    state.allowed = true;
    state.clinicEmpresa = 22;
    expect((await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`).send(valid)).status).toBe(403);
    expect(state.executeCount).toBe(0);
  });
  it("carrega e salva a identidade sem substituir o símbolo", async () => {
    const get = await request(app).get("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`);
    expect(get.status).toBe(200);
    expect(get.headers["cache-control"]).toContain("no-store");
    expect(get.body.identidade.versao).toBe(1);
    const saved = await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`).send(valid);
    expect(saved.status).toBe(200);
    expect(saved.body.identidade.versao).toBe(2);
    expect(state.finalCopies).toHaveLength(0);
  });
  it("retorna o símbolo dourado apenas para acesso autorizado", async () => {
    const result = await request(app).get("/paxmed-2b/clinicas/31/simbolo").set("Authorization", `Bearer ${token()}`);
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toContain("image/png");
    expect(result.headers["cache-control"]).toContain("no-store");
    state.allowed = false;
    expect((await request(app).get("/paxmed-2b/clinicas/31/simbolo").set("Authorization", `Bearer ${token()}`)).status).toBe(403);
  });
  it("não disponibiliza a configuração em produção", async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect((await request(app).get("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`)).status).toBe(404);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
  it("valida e copia o símbolo antes de associá-lo", async () => {
    const saved = await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`)
      .send({ ...valid, uploadId });
    expect(saved.status).toBe(200);
    expect(state.finalCopies).toHaveLength(1);
    expect(state.finalCopies[0].equals(state.logo)).toBe(true);
    expect(state.used).toBe(true);
  });
  it("recusa envio vencido, imagem inválida e conflito sem alterar configuração", async () => {
    state.pending = false;
    expect((await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`).send({ ...valid, uploadId })).status).toBe(400);
    state.pending = true;
    state.logo = Buffer.from("arquivo inválido");
    expect((await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`).send({ ...valid, uploadId })).status).toBe(400);
    state.logo = readFileSync("../padcom/src/assets/padua-dp-mask.png");
    expect((await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`).send({ ...valid, versao: 2, uploadId })).status).toBe(409);
    expect(state.version).toBe(1);
    expect(state.used).toBe(false);
  });
  it("informa falha de armazenamento e preserva a configuração anterior", async () => {
    state.failStorage = true;
    const result = await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`)
      .send({ ...valid, uploadId });
    expect(result.status).toBe(503);
    expect(state.version).toBe(1);
    expect(state.used).toBe(false);
  });
});
