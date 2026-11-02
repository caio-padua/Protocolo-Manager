import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const fake = vi.hoisted(() => ({
  companies: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
}));

vi.mock("@workspace/db/schema", () => {
  const empresasTable = {};
  const arvoreLicenciamentoTable = {};
  const locationsTable = {};
  const otherTable = {};

  function selectChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      for: () => chain,
      limit: async () => fake.companies.slice(0, 1),
      then: (resolve: (rows: Record<string, unknown>[]) => unknown) =>
        Promise.resolve(resolve(fake.companies)),
      [Symbol.iterator]: function* () { yield* fake.companies; },
    };
    return chain;
  }

  function updateChain(table: unknown) {
    let values: Record<string, unknown> = {};
    const query: any = {
      set: (next: Record<string, unknown>) => {
        values = next;
        fake.updates.push({ table, values });
        return query;
      },
      where: () => query,
      returning: async () => [{ id: 5 }],
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(resolve([])),
    };
    return query;
  }

  const db = {
    select: () => selectChain(),
    insert: () => ({
      values: (payload: Record<string, unknown>) => {
        fake.inserted.push(payload);
        return {
          returning: async () => [{
            id: 99,
            nome: payload.nome,
            tipo: "clinic",
            ativa: true,
            isPlatformOwner: false,
            status: "ATIVO",
            modulosAtivos: {},
            atualizadoEm: new Date(),
          }],
        };
      },
    }),
    transaction: async (callback: (tx: any) => unknown) => callback({
      select: () => selectChain(),
      update: (table: unknown) => updateChain(table),
    }),
  };

  return {
    db,
    empresasTable,
    arvoreLicenciamentoTable,
    locationsTable,
    cargosTable: otherTable,
    colaboradoresTable: otherTable,
    empresaContratosTable: otherTable,
  };
});

vi.mock("@workspace/db", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      for: () => chain,
      limit: async () => fake.companies.slice(0, 1),
      then: (resolve: (rows: Record<string, unknown>[]) => unknown) =>
        Promise.resolve(resolve(fake.companies)),
    };
    return chain;
  }

  function updateChain(table: unknown) {
    let values: Record<string, unknown> = {};
    const query: any = {
      set: (next: Record<string, unknown>) => {
        values = next;
        fake.updates.push({ table, values });
        return query;
      },
      where: () => query,
      returning: async () => [{ id: 5 }],
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(resolve([])),
    };
    return query;
  }

  const db = {
    select: () => selectChain(),
    insert: () => ({
      values: (payload: Record<string, unknown>) => {
        fake.inserted.push(payload);
        return {
          returning: async () => [{
            id: 99,
            nome: payload.nome,
            tipo: "clinic",
            ativa: true,
            isPlatformOwner: false,
            status: "ATIVO",
            modulosAtivos: {},
            atualizadoEm: new Date(),
          }],
        };
      },
    }),
    transaction: async (callback: (tx: any) => unknown) => callback({
      select: () => selectChain(),
      update: (table: unknown) => updateChain(table),
    }),
  };
  return { db };
});

vi.mock("../lib/google-drive", () => ({
  isDriveConnected: vi.fn().mockResolvedValue(false),
  uploadFileToDrive: vi.fn(),
  driveListChildren: vi.fn().mockResolvedValue([]),
  removeDiacritics: (value: string) => value,
  driveDownloadFile: vi.fn(),
}));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: vi.fn() }, drive: vi.fn() } }));
vi.mock("@workspace/integrations-gemini-ai", () => ({ ai: { models: { generateContent: vi.fn() } } }));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: vi.fn(), logAiUsage: vi.fn() }));

const FIXTURES = [
  {
    id: 5, nome: "Instituto Padua", tipo: "clinic", ativa: true, status: "ATIVO",
    isPlatformOwner: false, empresaMaeId: 6, parentEmpresaId: 6,
    podeSublicenciar: true, modulosAtivos: {}, slug: "instituto-padua",
  },
  {
    id: 6, nome: "PAXTER SERVICOS LTDA", tipo: "clinic", ativa: false, status: "ARQUIVADA",
    isPlatformOwner: false, empresaMaeId: null, parentEmpresaId: null,
    modulosAtivos: {}, slug: "paxter-servicos",
  },
  {
    id: 4, nome: "Modelo Genesis", tipo: "genesis_seed", ativa: true, status: "ATIVO",
    isPlatformOwner: false, modulosAtivos: {}, slug: "genesis",
  },
  {
    id: 7, nome: "Clínica de teste", tipo: "clinic", ativa: false, status: "SUSPENSO",
    isPlatformOwner: false, modulosAtivos: {}, slug: "clinica-teste",
  },
];

async function buildApp() {
  const { default: empresasRouter } = await import("../routes/empresas");
  const app = express();
  app.use(express.json());
  app.use("/api", empresasRouter);
  return app;
}

describe("empresas clínicas sem hierarquia", () => {
  beforeEach(() => {
    fake.companies = FIXTURES.map((company) => ({ ...company }));
    fake.inserted = [];
    fake.updates = [];
    vi.resetModules();
  });

  it.each(["empresaMaeId", "empresa_mae_id", "parentEmpresaId", "parent_empresa_id"])(
    "recusa em POST o campo hierárquico %s",
    async (field) => {
      const app = await buildApp();
      const response = await request(app).post("/api/empresas").send({ nome: "Clínica teste nova", [field]: 5 });
      expect(response.status).toBe(422);
      expect(response.body.error).toMatch(/vínculos entre empresas estão desativados/i);
      expect(fake.inserted).toHaveLength(0);
    },
  );

  it.each(["empresaMaeId", "empresa_mae_id", "parentEmpresaId", "parent_empresa_id"])(
    "recusa em PUT o campo hierárquico %s",
    async (field) => {
      const app = await buildApp();
      const response = await request(app).put("/api/empresas/5").send({ [field]: 6 });
      expect(response.status).toBe(422);
    },
  );

  it.each([
    { tipoLicenciamento: "sub_unidade" },
    { tipoRelacionamento: "licenciada_por_clinica" },
    { podeSublicenciar: true },
    { isPlatformOwner: true },
  ])("recusa classificações que reativariam hierarquia ou autoridade empresarial: %o", async (body) => {
    const app = await buildApp();
    const response = await request(app).post("/api/empresas").send({ nome: "Clínica teste nova", ...body });
    expect(response.status).toBe(422);
    expect(fake.inserted).toHaveLength(0);
  });

  it("cria cadastro independente e grava relações legadas vazias", async () => {
    const app = await buildApp();
    const response = await request(app).post("/api/empresas").send({
      nome: "Clínica teste nova",
      cnae: "86.30-5/03",
      regimeTributario: "simples_nacional",
    });
    expect(response.status).toBe(201);
    expect(fake.inserted[0]).toMatchObject({
      tipo: "clinic",
      empresaMaeId: null,
      parentEmpresaId: null,
      podeSublicenciar: false,
      isPlatformOwner: false,
    });
  });

  it("normaliza o CNAE para o padrão com sete números", async () => {
    const app = await buildApp();
    const response = await request(app).post("/api/empresas").send({
      nome: "Clínica teste CNAE",
      cnae: "8630-5-03",
      regimeTributario: "lucro_presumido",
    });
    expect(response.status).toBe(201);
    expect(fake.inserted[0].cnae).toBe("86.30-5/03");
  });

  it("recusa CNAE com quantidade de números diferente de sete", async () => {
    const app = await buildApp();
    const response = await request(app).post("/api/empresas").send({
      nome: "Clínica teste CNAE inválido",
      cnae: "86.30-5/030",
    });
    expect(response.status).toBe(422);
    expect(fake.inserted).toHaveLength(0);
  });

  it("recusa novo cadastro sem CNAE ou regime tributário", async () => {
    const app = await buildApp();
    const response = await request(app).post("/api/empresas").send({ nome: "Clínica incompleta" });
    expect(response.status).toBe(422);
    expect(fake.inserted).toHaveLength(0);
  });

  it.each(["simples_nacional", "mei", "lucro_presumido", "lucro_real"])(
    "aceita o regime tributário válido %s",
    async (regimeTributario) => {
      const app = await buildApp();
      const response = await request(app).post("/api/empresas").send({
        nome: "Clínica teste regime",
        cnae: "86.30-5/03",
        regimeTributario,
      });
      expect(response.status).toBe(201);
    },
  );

  it("recusa regime tributário fora das quatro opções", async () => {
    const app = await buildApp();
    const response = await request(app).post("/api/empresas").send({
      nome: "Clínica regime inválido",
      cnae: "86.30-5/03",
      regimeTributario: "isento",
    });
    expect(response.status).toBe(422);
    expect(fake.inserted).toHaveLength(0);
  });

  it.each([
    { tipoContrato: "full" },
    { fatMetaMensal: 1000 },
    { valorMensalContrato: null },
    { royaltyPercent: null },
  ])("preserva dados comerciais históricos sem aceitar alterações", async (historico) => {
    const app = await buildApp();
    const response = await request(app).put("/api/empresas/5").send(historico);
    expect(response.status).toBe(422);
    expect(fake.updates).toHaveLength(0);
  });

  it("bloqueia reativação de empresa arquivada", async () => {
    fake.companies[0].status = "ARQUIVADA";
    const app = await buildApp();
    const response = await request(app).put("/api/empresas/5").send({ status: "ATIVO", ativa: true });
    expect(response.status).toBe(404);
    expect(fake.updates).toHaveLength(0);
  });

  it("esconde cadastros arquivados e técnicos da lista clínica", async () => {
    const app = await buildApp();
    const response = await request(app).get("/api/empresas");
    expect(response.status).toBe(200);
    expect(response.body.map((company: { id: number }) => company.id)).toEqual([5, 7]);
  });

  it("a rota legada de hierarquia devolve uma lista plana, sem raiz ou filhos", async () => {
    const app = await buildApp();
    const response = await request(app).get("/api/empresas/hierarquia");
    expect(response.status).toBe(200);
    expect(response.body.raiz).toBeNull();
    expect(response.body.raizes.map((company: { id: number }) => company.id)).toEqual([5]);
    expect(response.body.raizes.every((company: { filhos: unknown[] }) => company.filhos.length === 0)).toBe(true);
  });

  it("a exclusão arquiva e limpa relações; não apaga o registro", async () => {
    const app = await buildApp();
    const response = await request(app).delete("/api/empresas/5");
    expect(response.status).toBe(200);
    expect(response.body.archivedId).toBe(5);
    expect(fake.updates.some(({ values }) => values.status === "ARQUIVADA" && values.ativa === false)).toBe(true);
    expect(fake.updates.some(({ values }) => values.ativo === false)).toBe(true);
  });
});
