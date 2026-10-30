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
import { db } from "@workspace/db";
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

describe("RAS — contexto legado não autoriza troca de empresa", () => {
  beforeEach(() => vi.clearAllMocks());

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
        expect(response.status).toBe(403);
        expect(db.select).not.toHaveBeenCalled();
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
});
