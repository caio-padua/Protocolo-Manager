import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync, writeFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { PNG } from "pngjs";

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
  files: new Map<string, Buffer>(),
  finalLogoId: "11111111-1111-4111-8111-111111111111",
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
      if (sql.includes("SELECT simbolo_path")) return { rows: state.version ? [{ simbolo_path: state.finalLogoId }] : [] };
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
        if (params[3]) state.finalLogoId = String(params[3]);
        state.version++;
        return { rows: [{ location_id: 31 }] };
      }
      throw new Error("Consulta inesperada no teste.");
    },
    transaction: async (fn: any) => {
      const oldVersion = state.version, oldUsed = state.used, oldLogo = state.finalLogoId;
      try { return await fn(db); }
      catch (err) { state.version = oldVersion; state.used = oldUsed; state.finalLogoId = oldLogo; throw err; }
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
    async getClinicBrandUploadURL(id: string) {
      if (state.failStorage) throw new Error("storage offline");
      return `/test-storage/${id}`;
    }
    async getObjectEntityFile(path: string) {
      if (state.failStorage) throw Object.assign(new Error("storage offline"), { code: 500 });
      const bytes = state.files.get(path) ?? state.logo;
      return { getMetadata: async () => [{ size: String(bytes.length) }], download: async () => [bytes] };
    }
    async savePrivateObject(path: string, bytes: Buffer) {
      if (state.failStorage) throw new Error("storage offline");
      state.finalCopies.push(Buffer.from(bytes));
      state.files.set(`/objects/${path}`, Buffer.from(bytes));
    }
  },
}));

import router from "../routes/paxmed-2b-identidade";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { createCollaboratorToken } from "../lib/collaborator-auth";

const app = express();
app.use(express.json());
// Armazenamento sintético em memória: nunca grava dados de clínicas reais.
app.put("/test-storage/:id", express.raw({ type: "image/png", limit: "2mb" }), (req, res) => {
  state.files.set(`/objects/paxmed-marcas/${req.params.id}`, Buffer.from(req.body));
  res.sendStatus(200);
});
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
    files: new Map(), finalLogoId: "11111111-1111-4111-8111-111111111111",
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
  it("envia preto, branco e colorido e exibe a mesma forma dourada", async () => {
    const source = PNG.sync.read(readFileSync("../padcom/src/assets/padua-dp-mask.png"));
    const cores = [
      { nome: "preto", rgb: [0, 0, 0] },
      { nome: "branco", rgb: [255, 255, 255] },
      { nome: "colorido", rgb: [27, 120, 213] },
    ];
    let referencia: Buffer | null = null;
    for (const cor of cores) {
      const entrada = new PNG({ width: source.width, height: source.height });
      for (let i = 0; i < entrada.data.length; i += 4) {
        const rgb = cor.nome === "colorido" && Math.floor(i / 4) % source.width < source.width / 2
          ? [213, 38, 84] : cor.rgb;
        entrada.data[i] = rgb[0];
        entrada.data[i + 1] = rgb[1];
        entrada.data[i + 2] = rgb[2];
        entrada.data[i + 3] = source.data[i + 3];
      }
      const arquivo = PNG.sync.write(entrada);
      const init = await request(app).post("/paxmed-2b/clinicas/31/simbolo/upload")
        .set("Authorization", `Bearer ${token()}`);
      expect(init.status).toBe(200);
      expect((await request(app).put(init.body.uploadUrl).set("Content-Type", "image/png").send(arquivo)).status).toBe(200);
      const save = await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`)
        .send({ ...valid, versao: state.version, uploadId: init.body.uploadId });
      expect(save.status).toBe(200);
      expect(state.finalCopies[state.finalCopies.length - 1].equals(arquivo)).toBe(true);
      const result = await request(app).get("/paxmed-2b/clinicas/31/simbolo").set("Authorization", `Bearer ${token()}`);
      expect(result.status).toBe(200);
      const dourado = PNG.sync.read(result.body);
      expect([dourado.width, dourado.height]).toEqual([source.width, source.height]);
      const alphaOriginal = Buffer.alloc(source.width * source.height);
      const alphaDourado = Buffer.alloc(source.width * source.height);
      let visible = 0, golden = 0;
      const tons = new Set<string>();
      for (let i = 0; i < alphaOriginal.length; i++) {
        alphaOriginal[i] = source.data[4 * i + 3];
        alphaDourado[i] = dourado.data[4 * i + 3];
        if (alphaDourado[i] === 255) {
          visible++;
          const [r, g, b] = dourado.data.subarray(4 * i, 4 * i + 3);
          if (r > g && g > b) golden++;
          tons.add(`${r},${g},${b}`);
        }
      }
      expect(alphaDourado.equals(alphaOriginal)).toBe(true);
      expect(visible).toBeGreaterThan(0);
      expect(golden).toBe(visible);
      expect(tons.size).toBeGreaterThan(1);
      if (referencia) expect(dourado.data.equals(referencia)).toBe(true);
      else referencia = Buffer.from(dourado.data);
      if (process.env.PAXMED_PROVA_IMAGEM === "1") {
        writeFileSync(`../../generated-artifacts/cor-entrada-${cor.nome}.png`, arquivo);
        writeFileSync(`../../generated-artifacts/cor-saida-${cor.nome}.png`, result.body);
      }
      state.used = false;
    }
  });
  it("recusa símbolo com fundo opaco sem substituir o original cadastrado", async () => {
    const arquivo = new PNG({ width: 30, height: 30 });
    for (let i = 0; i < arquivo.data.length; i += 4) {
      const symbol = Math.floor(i / 4) % 30 > 8 && Math.floor(i / 4) % 30 < 21;
      arquivo.data[i] = arquivo.data[i + 1] = arquivo.data[i + 2] = symbol ? 0 : 255;
      arquivo.data[i + 3] = 255;
    }
    const init = await request(app).post("/paxmed-2b/clinicas/31/simbolo/upload")
      .set("Authorization", `Bearer ${token()}`);
    const bytes = PNG.sync.write(arquivo);
    expect((await request(app).put(init.body.uploadUrl).set("Content-Type", "image/png").send(bytes)).status).toBe(200);
    const result = await request(app).put("/paxmed-2b/clinicas/31").set("Authorization", `Bearer ${token()}`)
      .send({ ...valid, uploadId: init.body.uploadId });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/fundo transparente/);
    expect(state.finalCopies).toHaveLength(0);
    expect(state.version).toBe(1);
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
