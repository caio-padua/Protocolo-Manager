import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
  empresasTable: { id: "empresas.id", cnpj: "empresas.cnpj" },
  locationsTable: { id: "locations.id", codigoSemantico: "locations.codigo_semantico" },
}));

vi.mock("@workspace/db", () => mocks);
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (column: unknown, value: unknown) => ({ column, value }),
  isNotNull: (column: unknown) => ({ isNotNull: column }),
  isNull: (column: unknown) => ({ isNull: column }),
}));
vi.mock("../middleware/tenantContext", () => ({
  requirePlatformOwner: (req: any, res: any, next: () => void) => {
    if (req.tenantContext?.isPlatformOwner) return next();
    return res.status(403).json({ error: "Acesso exclusivo ao CEO." });
  },
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: () => void) => {
    if (req.headers.authorization !== "Bearer valid-collaborator") {
      return res.status(401).json({ error: "Colaborador não autenticado." });
    }
    req.tenantContext = {
      authenticated: true,
      isPlatformOwner: req.headers["x-test-owner"] === "true",
      empresaId: 5,
    };
    return next();
  },
}));

import express from "express";
import type { Server } from "node:http";
import semanticCodesRouter from "../routes/semantic-codes";

function queryResult(result: unknown) {
  const query: any = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    limit: vi.fn(async () => result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use(semanticCodesRouter);
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Porta de teste indisponível.");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

const storedLocation = {
  id: 101,
  empresaId: 5,
  codigoSemantico: null,
  codigoSequencial: 1,
};
const storedCompany = {
  id: 5,
  nome: "Instituto Pádua",
  cnpj: "63.865.940/0001-63",
  ativa: true,
  status: "ATIVO",
  codigoBaseSemantico: "PADU",
  codigoVinculoSemantico: "propria",
};

function queueSemanticCodeReads(companyList = [{ id: 5, cnpj: storedCompany.cnpj }]) {
  mocks.db.select
    .mockImplementationOnce(() => queryResult([storedLocation]))
    .mockImplementationOnce(() => queryResult([storedCompany]))
    .mockImplementationOnce(() => queryResult(companyList));
  const updateQuery: any = {
    set: vi.fn(() => updateQuery),
    where: vi.fn(() => updateQuery),
    returning: vi.fn(async () => [{
      ...storedLocation,
      codigoSemantico: "PADU.PROU.6386.0001",
    }]),
  };
  mocks.db.update.mockReturnValue(updateQuery);
}

describe("rotas do código semântico", () => {
  let server: Server | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(async () => {
    if (server) await closeServer(server);
    server = undefined;
  });

  it("recusa emissão sem identidade autenticada antes de consultar o banco", async () => {
    const started = startTestServer();
    server = started.server;
    const response = await fetch(`${started.url}/locations/101/codigo-semantico`, { method: "POST" });
    expect(response.status).toBe(401);
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("recusa emissão para colaborador que não seja CEO", async () => {
    const started = startTestServer();
    server = started.server;
    const response = await fetch(`${started.url}/locations/101/codigo-semantico`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-collaborator" },
    });
    expect(response.status).toBe(403);
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("emite o código com a empresa gravada na unidade e ignora empresa enviada pelo navegador", async () => {
    queueSemanticCodeReads();
    const started = startTestServer();
    server = started.server;
    const response = await fetch(`${started.url}/locations/101/codigo-semantico`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-collaborator",
        "X-Test-Owner": "true",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ empresaId: 99 }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      locationId: 101,
      empresaId: 5,
      codigo: "PADU.PROU.6386.0001",
      cnpjPrefixo: "6386",
      sequencia: 1,
    });
    expect(mocks.db.select).toHaveBeenCalledTimes(3);
  });

  it("bloqueia CNPJ repetido sem emitir código", async () => {
    queueSemanticCodeReads([
      { id: 5, cnpj: storedCompany.cnpj },
      { id: 6, cnpj: "63865940000163" },
    ]);
    const started = startTestServer();
    server = started.server;
    const response = await fetch(`${started.url}/locations/101/codigo-semantico`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-collaborator",
        "X-Test-Owner": "true",
      },
    });
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.code).toBe("CNPJ_DUPLICADO");
    expect(mocks.db.update).not.toHaveBeenCalled();
  });
});
