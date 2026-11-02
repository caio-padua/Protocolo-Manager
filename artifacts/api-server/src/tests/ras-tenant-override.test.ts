import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/db")>(),
  db: { select: vi.fn(), insert: vi.fn(), execute: vi.fn() },
}));
vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/google-drive", () => ({
  ensureClientFolderStructure: vi.fn(),
  uploadFileToDrive: vi.fn(),
  uploadToFolderById: vi.fn(),
  shareWithClient: vi.fn(),
  isDriveConnected: vi.fn(),
  formatRASFileName: vi.fn(),
  formatPhysicalRASFileName: vi.fn(),
}));
vi.mock("../lib/pdf-signer", () => ({
  generateSignedRASPdf: vi.fn(),
  generatePhysicalRASPdf: vi.fn(),
  getCertInfo: vi.fn(),
}));
vi.mock("../lib/email-service", () => ({ sendProtocolEmail: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ isGmailConnected: vi.fn() }));
vi.mock("../lib/assinatura/service", () => ({ enviarAssinatura: vi.fn() }));
vi.mock("../lib/cadernos-resolver", () => ({ resolverCodigosCadernos: vi.fn() }));
vi.mock("../lib/messaging/index.js", () => ({
  enviarMensagemPaxter: vi.fn(),
  absoluteBaseUrl: vi.fn(),
}));

import express from "express";
import request from "supertest";
import {
  db,
  empresasTable,
  locationProfessionalsTable,
  professionalsTable,
} from "@workspace/db";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import { createCollaboratorToken, verifyCollaboratorToken } from "../lib/collaborator-auth";
import { sendProtocolEmail } from "../lib/email-service";
import { generatePhysicalRASPdf } from "../lib/pdf-signer";
import rasRouter from "../routes/ras";

// Autenticação e contexto de empresa REAIS: não substituir por mocks.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(tenantContextMiddleware);
  app.use("/api", rasRouter);
  return app;
}

class TenantIdentityQuery {
  private rows: any[] = [];

  from(table: unknown) {
    if (table === professionalsTable) {
      this.rows = [{
        id: 42,
        role: "recepcionista",
        category: "Recepcionista",
        active: true,
        empresaId: 5,
        isPlatformOwner: false,
        credentialVersion: 0,
      }];
    } else if (table === locationProfessionalsTable) {
      this.rows = [{ empresaId: 5 }];
    } else if (table === empresasTable) {
      this.rows = [{ id: 5 }];
    } else {
      this.rows = [];
    }
    return this;
  }

  innerJoin() { return this; }
  where() { return this; }
  limit() { return this; }
  then(resolve: (rows: any[]) => unknown, reject?: (error: unknown) => unknown) {
    return Promise.resolve(this.rows).then(resolve, reject);
  }
}

describe("RAS — contexto legado não autoriza troca de empresa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.select).mockImplementation(() => new TenantIdentityQuery() as any);
  });

  for (const [method, route] of [
    ["post", "/api/ras/physical/42/reenviar-email"],
    ["get", "/api/ras/physical/42/email-logs"],
  ] as const) {
    it.each(["999", "5", "5&empresaId=999"])(
      `${method} ${route} recusa empresaId=%s com token comum válido`,
      async (empresaId) => {
        const token = createCollaboratorToken({ professionalId: 42, role: "recepcionista" });
        expect(verifyCollaboratorToken(token)?.role).toBe("recepcionista");
        const response = await request(buildApp())[method](`${route}?empresaId=${empresaId}`)
          .set("Authorization", `Bearer ${token}`);
        expect(response.status).toBe(empresaId.includes("&") ? 400 : 403);
        // A autenticação consulta somente identidade e vínculo; nenhum dado clínico
        // é lido após a tentativa de escolher outra clínica.
        expect(db.select).toHaveBeenCalled();
        expect(db.insert).not.toHaveBeenCalled();
        expect(db.execute).not.toHaveBeenCalled();
        expect(generatePhysicalRASPdf).not.toHaveBeenCalled();
        expect(sendProtocolEmail).not.toHaveBeenCalled();
      },
    );

    it(`${method} ${route} sem token continua recusado`, async () => {
      const response = await request(buildApp())[method](`${route}?empresaId=999`);
      expect(response.status).toBe(401);
      expect(db.select).not.toHaveBeenCalled();
      expect(sendProtocolEmail).not.toHaveBeenCalled();
    });
  }

  it.each([
    ["get", "/api/ras"],
    ["post", "/api/ras"],
    ["get", "/api/ras/certificate-info"],
    ["get", "/api/ras/42"],
    ["get", "/api/ras/42/pdf"],
    ["post", "/api/ras/42/upload-drive"],
    ["get", "/api/ras/physical/42"],
    ["post", "/api/ras-fap/entregar-protocolo"],
  ] as const)("nega %s %s sem identidade antes de consultar dados", async (method, route) => {
    const response = await request(buildApp())[method](route);
    expect(response.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(generatePhysicalRASPdf).not.toHaveBeenCalled();
    expect(sendProtocolEmail).not.toHaveBeenCalled();
  });
});
