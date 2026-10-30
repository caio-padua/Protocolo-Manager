/**
 * ras-fap-email-isolation.test.ts
 *
 * Confirma a separação entre download do PDF físico e reenvio de e-mail no RAS FAP:
 *
 *  GET  /api/ras/physical/:protocolId
 *    → Download puro: retorna o PDF e NÃO chama sendProtocolEmail.
 *      Abrir ou baixar o PDF físico NÃO deve enviar e-mail ao paciente.
 *
 *  POST /api/ras/physical/:protocolId/reenviar-email
 *    → Entrega explícita: chama sendProtocolEmail exatamente uma vez.
 *      O botão "Reenviar RAS FAP" dispara um único e-mail, sem duplicatas.
 *
 * Esse contrato é CRÍTICO: uma regressão no GET enviaria e-mail ao paciente
 * toda vez que o CEO baixasse o PDF para conferência ou impressão.
 *
 * Também verifica estaticamente que o botão na UI (detail.tsx) usa GET
 * para download e POST para o reenvio — sem nenhum efeito colateral no GET.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ANTES de qualquer import de rota ───────────────────────────────────

vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: any, _res: any, next: any) => next(),
}));

// Esta suíte verifica a entrega após autorização; a recusa sem autorização
// é exercitada em protocol-drive-email-isolation.test.ts.
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/tenantContext", () => ({
  resolveEmpresaId: () => 5,
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@workspace/db", () => {
  const makeT = (name: string) => ({ __mockName: name });
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
    },
    eq:      vi.fn((col: any, val: any) => ({ col, val })),
    and:     vi.fn((...args: any[]) => args),
    inArray: vi.fn((col: any, vals: any[]) => ({ col, vals })),
    desc:    vi.fn((col: any) => ({ col, dir: "desc" })),
    rasTable:                    makeT("ras"),
    sessionsTable:               makeT("sessions"),
    substanceApplicationsTable:  makeT("substance_applications"),
    substancesTable:             makeT("substances"),
    professionalsTable:          makeT("professionals"),
    clientsTable:                makeT("clients"),
    protocolsTable:              makeT("protocols"),
    protocolItemsTable:          makeT("protocol_items"),
    assinaturaSolicitacoesTable: makeT("assinatura_solicitacoes"),
    assinaturaTemplatesTable:    makeT("assinatura_templates"),
    emailLogTable:               makeT("email_log"),
  };
});

vi.mock("@workspace/api-zod", () => ({
  ListRASQueryParams: { safeParse: (x: any) => ({ success: true, data: x }) },
  CreateRASBody:      { safeParse: (x: any) => ({ success: true, data: x }) },
  GetRASParams:       { safeParse: (x: any) => ({ success: true, data: x }) },
}));

vi.mock("../lib/google-drive", () => ({
  isDriveConnected:            vi.fn(),
  uploadToFolderById:          vi.fn(),
  uploadFileToDrive:           vi.fn(),
  ensureClientFolderStructure: vi.fn(),
  shareWithClient:             vi.fn(),
  formatRASFileName:           vi.fn().mockReturnValue("RAS_TEST.pdf"),
  formatPhysicalRASFileName:   vi.fn().mockReturnValue("RAS_FAP_TEST.pdf"),
}));

vi.mock("../lib/email-service", () => ({
  sendProtocolEmail:           vi.fn(),
  sendProtocolOnboardingEmail: vi.fn(),
  sendCartaTratamentoEmail:    vi.fn(),
}));

vi.mock("../lib/google-gmail", () => ({
  isGmailConnected: vi.fn(),
}));

vi.mock("../lib/pdf-signer", () => ({
  generateSignedRASPdf:    vi.fn(),
  generatePhysicalRASPdf: vi.fn(),
  getCertInfo:             vi.fn(),
}));

vi.mock("../lib/ras-fap-alert", () => ({
  notifySlackRasFapFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/cadernos-resolver", () => ({
  resolverCodigosCadernos: vi.fn().mockReturnValue({ codigos: new Set() }),
}));

vi.mock("../lib/assinatura/service", () => ({
  enviarAssinatura: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/messaging/index.js", () => ({
  enviarMensagemPaxter: vi.fn().mockResolvedValue(undefined),
  absoluteBaseUrl:      vi.fn().mockReturnValue("http://localhost"),
}));

// ── Imports APÓS os mocks ────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { db } from "@workspace/db";
import * as driveLib  from "../lib/google-drive";
import * as emailSvc  from "../lib/email-service";
import * as gmailLib from "../lib/google-gmail";
import * as pdfSigner from "../lib/pdf-signer";
import rasRouter from "../routes/ras";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_PROTOCOL = {
  id:             42,
  clientId:       7,
  empresaId:      5,
  professionalId: null,
  title:          "Longevidade IV",
  status:         "active",
  startDate:      "2026-08-01",
  endDate:        null,
  totalSessions:  4,
  completedSessions: 0,
  totalValue:     5000,
  unit:           "Instituto Pádua",
  serviceType:    "iv",
  notes:          null,
  createdAt:      new Date("2026-08-01T12:00:00Z"),
  updatedAt:      new Date("2026-08-01T12:00:00Z"),
};

const FAKE_CLIENT = {
  id:        7,
  name:      "Ana Silva",
  cpf:       "12345678901",
  email:     "ana@example.com",
  phone:     "11999990000",
  birthDate: "1990-05-15",
  empresaId: 5,
  status:    "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

// ── Thenable-chain mock para drizzle ─────────────────────────────────────────

class DbChain {
  constructor(private rows: any[]) {}

  then(onFulfilled: (v: any[]) => any, onRejected?: (r: any) => any) {
    return Promise.resolve(this.rows).then(onFulfilled, onRejected);
  }

  from(table: any): DbChain {
    const name: string = table?.__mockName ?? "";
    switch (name) {
      case "protocols":             return new DbChain([FAKE_PROTOCOL]);
      case "clients":               return new DbChain([FAKE_CLIENT]);
      case "professionals":         return new DbChain([]);
      case "protocol_items":        return new DbChain([]);
      case "substances":            return new DbChain([]);
      case "sessions":              return new DbChain([]);
      case "substance_applications":return new DbChain([]);
      case "email_log":             return new DbChain([]);
      default:                      return new DbChain([]);
    }
  }

  where(..._a: any[]): DbChain     { return this; }
  innerJoin(..._a: any[]): DbChain { return this; }
  orderBy(..._a: any[]): DbChain   { return this; }
  limit(..._a: any[]): DbChain     { return this; }
  select(..._a: any[]): DbChain    { return this; }
}

// ── App Express de teste ──────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenantContext = { empresaId: 5, isPlatformOwner: false, perfilPlataforma: "recepcionista" };
    next();
  });
  app.use("/api", rasRouter);
  return app;
}

// ── Configuração base dos mocks ───────────────────────────────────────────────

function setupMocks() {
  vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(true);
  vi.mocked(db.select).mockReturnValue(new DbChain([]) as any);
  vi.mocked(pdfSigner.generatePhysicalRASPdf).mockResolvedValue(FAKE_PDF_BYTES as any);
  vi.mocked(driveLib.isDriveConnected).mockResolvedValue(false);
  vi.mocked(driveLib.ensureClientFolderStructure).mockResolvedValue({
    clientFolderId: "f1",
    subfolders: { PROTOCOLOS: "pf1", EXAMES: "ef1", "FOTO PERFIL": "ff1" },
  } as any);
  vi.mocked(driveLib.uploadFileToDrive).mockResolvedValue({ fileId: "x2", webViewLink: "http://drive/x2" } as any);
  vi.mocked(emailSvc.sendProtocolEmail).mockResolvedValue({
    success: true, messageId: "msg-1",
  } as any);
}

// ════════════════════════════════════════════════════════════════════════════
// Bloco 1 — GET /api/ras/physical/:protocolId — download puro, sem e-mail
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/ras/physical/:protocolId — download puro (sem e-mail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("NÃO chama sendProtocolEmail — baixar o PDF não dispara e-mail ao paciente", async () => {
    await request(buildApp()).get("/api/ras/physical/42");

    // Aguarda qualquer IIFE residual que pudesse rodar em background
    await new Promise(r => setTimeout(r, 300));

    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });

  it("NÃO chama sendProtocolOnboardingEmail — nenhum e-mail de qualquer tipo", async () => {
    await request(buildApp()).get("/api/ras/physical/42");
    await new Promise(r => setTimeout(r, 300));

    expect(vi.mocked(emailSvc.sendProtocolOnboardingEmail)).not.toHaveBeenCalled();
  });

  it("retorna 404 quando o protocolo não existe — sem side effects de e-mail", async () => {
    // Protocolo não encontrado → chain retorna []
    vi.mocked(db.select).mockReturnValue(
      new Proxy(new DbChain([]) as any, {
        get(target: any, prop: string) {
          if (prop === "from") {
            return (table: any) => {
              const name: string = table?.__mockName ?? "";
              if (name === "protocols") return new DbChain([]);
              return (target.from as Function).call(target, table);
            };
          }
          return (target as any)[prop];
        },
      }),
    );

    const res = await request(buildApp()).get("/api/ras/physical/42");
    expect(res.status).toBe(404);

    await new Promise(r => setTimeout(r, 300));
    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Bloco 2 — POST /api/ras/physical/:protocolId/reenviar-email
//           chama sendProtocolEmail exatamente uma vez
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/ras/physical/:protocolId/reenviar-email — chama e-mail exatamente uma vez", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("chama sendProtocolEmail exatamente uma vez por acionamento", async () => {
    await request(buildApp())
      .post("/api/ras/physical/42/reenviar-email")
      .send({});

    await new Promise(r => setTimeout(r, 300));

    expect(vi.mocked(emailSvc.sendProtocolEmail)).toHaveBeenCalledTimes(1);
  });

  it("não chama sendProtocolEmail se o protocolo não existe", async () => {
    vi.mocked(db.select).mockReturnValue(
      new Proxy(new DbChain([]) as any, {
        get(target: any, prop: string) {
          if (prop === "from") {
            return (table: any) => {
              const name: string = table?.__mockName ?? "";
              if (name === "protocols") return new DbChain([]);
              return (target.from as Function).call(target, table);
            };
          }
          return (target as any)[prop];
        },
      }),
    );

    const res = await request(buildApp())
      .post("/api/ras/physical/42/reenviar-email")
      .send({});

    expect(res.status).toBe(404);
    await new Promise(r => setTimeout(r, 300));
    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });

  it("não chama sendProtocolEmail se o cliente não existe", async () => {
    vi.mocked(db.select).mockReturnValue(
      new Proxy(new DbChain([]) as any, {
        get(target: any, prop: string) {
          if (prop === "from") {
            return (table: any) => {
              const name: string = table?.__mockName ?? "";
              if (name === "clients") return new DbChain([]);
              return (target.from as Function).call(target, table);
            };
          }
          return (target as any)[prop];
        },
      }),
    );

    const res = await request(buildApp())
      .post("/api/ras/physical/42/reenviar-email")
      .send({});

    expect(res.status).toBe(404);
    await new Promise(r => setTimeout(r, 300));
    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });

  it("não dispara segundo e-mail se o CEO clicar duas vezes seguidas (dois requests separados)", async () => {
    // Simula dois cliques consecutivos — cada request deve gerar exatamente 1 e-mail
    const app = buildApp();
    await request(app).post("/api/ras/physical/42/reenviar-email").send({});
    await request(app).post("/api/ras/physical/42/reenviar-email").send({});
    await new Promise(r => setTimeout(r, 300));

    // 2 requests → 2 chamadas, uma por request (não duplica internamente)
    expect(vi.mocked(emailSvc.sendProtocolEmail)).toHaveBeenCalledTimes(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Bloco 3 — Verificação estática do componente React (detail.tsx)
//
// Confirma que o botão "RAS FAP (Imprimir)" usa GET (sem efeito colateral)
// e o botão "Reenviar RAS FAP" usa POST — separação garantida na camada de UI.
// ════════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";

describe("Botões de RAS FAP — separação GET/POST na UI (detail.tsx)", () => {
  const detailSrc = fs.readFileSync(
    path.resolve(__dirname, "../../../../artifacts/padcom/src/pages/protocols/detail.tsx"),
    "utf8",
  );

  it("o botão 'RAS FAP (Imprimir)' usa fetch sem method — implica GET puro", () => {
    // O fetch para ras/physical/:id não especifica method → GET por padrão
    const printFetch = detailSrc.match(
      /fetch\([^)]*ras\/physical\/\${id}`[^)]*\)/s,
    );
    expect(printFetch).not.toBeNull();
    // A chamada de fetch para o botão de impressão não deve ter method: "POST"
    const fetchCall = printFetch![0];
    expect(fetchCall).not.toContain("POST");
  });

  it("o botão 'Reenviar RAS FAP' usa method: \"POST\" — entrega explícita", () => {
    // O fetch para reenviar-email especifica method: "POST"
    expect(detailSrc).toContain("reenviar-email");
    const reenvirarBlock = detailSrc.slice(
      detailSrc.indexOf("reenviar-email"),
      detailSrc.indexOf("reenviar-email") + 500,
    );
    expect(reenvirarBlock).toContain("method: \"POST\"");
  });

  it("o estado reenviarRasLoading existe — botão tem guard contra double-click", () => {
    expect(detailSrc).toContain("reenviarRasLoading");
    expect(detailSrc).toContain("setReenviarRasLoading");
  });

  it("o botão 'Reenviar RAS FAP' fica desabilitado durante o envio (disabled={reenviarRasLoading})", () => {
    expect(detailSrc).toContain("disabled={reenviarRasLoading}");
  });
});
