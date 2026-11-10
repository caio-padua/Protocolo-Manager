/**
 * protocol-drive-email-isolation.test.ts
 *
 * Confirma a separação entre pré-visualização e entrega real do protocolo:
 *
 *  GET  /api/protocols/:id/document-pdf
 *    → Pré-visualização pura: retorna o PDF e NÃO produz nenhum efeito
 *      colateral (nenhum e-mail, nenhum upload no Drive).
 *
 *  POST /api/protocols/:id/emit-document
 *    → Entrega real: exige requireCollaborator, aciona Drive + e-mail.
 *      Sem token válido a rota retorna 401 — garantindo que o CEO
 *      não pode disparar e-mail acidentalmente.
 *
 * Esse contrato é CRÍTICO: a reintrodução acidental de efeitos colaterais
 * no GET provocaria envios de e-mail toda vez que o CEO abrisse o PDF
 * para revisar antes de decidir emitir.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const testContext = vi.hoisted(() => ({
  empresaId: 5,
  professionalId: 1,
  professionalName: "Dra. Ana Médica Sintética",
}));

// ── Mocks ANTES de qualquer import de rota ───────────────────────────────────

vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/tenantContext", () => ({
  resolveEmpresaId: () => testContext.empresaId,
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// requireCollaborator: por padrão barra tudo (401).
// O path deve bater com o import na rota: import { requireCollaborator } from "./collaborator"
// Resolvido pelo Vitest como o módulo em src/routes/collaborator.ts
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (req.headers.authorization !== "Bearer test-collaborator") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.collaborator = { professionalId: testContext.professionalId, role: "executor", credentialVersion: 0 };
    next();
  },
}));

const makeTable = (name: string) => ({ __mockName: name });

vi.mock("@workspace/db", () => {
  const makeT = (name: string) => ({ __mockName: name });
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      execute: vi.fn(),
    },
    eq:      vi.fn((col: any, val: any) => ({ col, val })),
    and:     vi.fn((...args: any[]) => args),
    inArray: vi.fn((col: any, vals: any[]) => ({ col, vals })),
    protocolsTable:              makeT("protocols"),
    clientsTable:                makeT("clients"),
    professionalsTable:          makeT("professionals"),
    sessionsTable:               makeT("sessions"),
    protocolItemsTable:          makeT("protocol_items"),
    substancesTable:             makeT("substances"),
    substanceApplicationsTable:  makeT("substance_applications"),
    paymentsTable:               makeT("payments"),
    protocolEmissoesTable:       makeT("protocol_emissoes"),
    assinaturaSolicitacoesTable: makeT("assinatura_solicitacoes"),
    assinaturaTemplatesTable:    makeT("assinatura_templates"),
    rasTable:                    makeT("ras"),
    emailLogTable:               makeT("email_log"),
    locationProfessionalsTable:  makeT("location_professionals"),
    locationsTable:              makeT("locations"),
  };
});

vi.mock("@workspace/api-zod", () => ({
  ListRASQueryParams: { safeParse: (x: any) => ({ success: true, data: x }) },
  CreateRASBody: { safeParse: (x: any) => ({ success: true, data: x }) },
  GetRASParams: { safeParse: (x: any) => ({ success: true, data: x }) },
  ListProtocolsQueryParams:  { safeParse: (x: any) => ({ success: true, data: x }) },
  CreateProtocolBody:        { safeParse: (x: any) => ({ success: true, data: x }) },
  GetProtocolParams:         { safeParse: (x: any) => ({ success: true, data: x }) },
  UpdateProtocolParams:      { safeParse: (x: any) => ({ success: true, data: x }) },
  UpdateProtocolBody:        { safeParse: (x: any) => ({ success: true, data: x }) },
  ValidateProtocolParams:    { safeParse: (x: any) => ({ success: true, data: x }) },
  GenerateProtocolICSParams: { safeParse: (x: any) => ({ success: true, data: x }) },
}));

vi.mock("../lib/google-drive", () => ({
  isDriveConnected:            vi.fn(),
  uploadToFolderById:          vi.fn(),
  uploadFileToDrive:           vi.fn(),
  ensureClientFolderStructure: vi.fn(),
  shareWithClient:             vi.fn(),
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

// A identidade/certificado do médico logado é testada em prescription-signing e
// doctor-certificate-context; aqui a geração do documento é o foco.
vi.mock("../lib/prescription-signing", () => ({
  withLoggedDoctorCertificate: (_req: unknown, _clientId: unknown, fn: () => Promise<unknown>) => fn(),
  resolveProtocolDoctor: vi.fn(async (_req: unknown, _clientId: unknown, expectedProfessionalId: number | null) => ({
    professional: {
      id: expectedProfessionalId ?? testContext.professionalId,
      name: testContext.professionalName,
      crm: "123456",
      uf: "SP",
    },
  })),
}));

vi.mock("../lib/pdf-signer", () => ({
  generateProtocolDocumentPdf: vi.fn(),
  generatePhysicalRASPdf:      vi.fn(),
  getCertInfo:                 vi.fn(),
}));

vi.mock("../lib/pdf-carta-tratamento", () => ({
  generateProtocolLetterPdf:  vi.fn(),
  buildCartaTratamentoDto:    vi.fn(),
}));

vi.mock("../lib/slack-reporter", () => ({
  postSlackAlert: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../lib/session-ics", () => ({
  buildEventsForSessions: vi.fn().mockReturnValue([]),
}));

vi.mock("../lib/ics", () => ({
  buildVCalendar: vi.fn().mockReturnValue(""),
}));

// ── Imports APÓS os mocks ────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { db } from "@workspace/db";
import * as driveLib  from "../lib/google-drive";
import * as emailSvc  from "../lib/email-service";
import * as gmailLib  from "../lib/google-gmail";
import * as pdfSigner from "../lib/pdf-signer";
import protocolsRouter from "../routes/protocols";
import rasRouter from "../routes/ras";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_PROTOCOL = {
  id:               99,
  clientId:         7,
  empresaId:        5,
  professionalId:   1,
  nurseId:          null as number | null,
  title:            "Longevidade IV",
  status:           "active",
  startDate:        "2026-08-01",
  endDate:          null,
  totalSessions:    4,
  completedSessions: 0,
  totalValue:       5000,
  unit:             "Instituto Pádua",
  serviceType:      "iv",
  notes:            null,
  createdAt:        new Date("2026-08-01T12:00:00Z"),
  updatedAt:        new Date("2026-08-01T12:00:00Z"),
};

const FAKE_CLIENT = {
  id:        7,
  name:      "Ana Silva",
  cpf:       "12345678901",
  email:     "ana@example.com",
  phone:     "11999990000",
  birthDate: "1990-05-15",
  empresaId: 5,
  locationId: 31,
  status:    "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const FAKE_PROFESSIONAL = {
  id: 1, name: "Dra. Ana Médica Sintética", cpf: "12345678900", active: true,
  professionalType: "medico", category: "medico", specialty: "Cardiologia",
};
const FAKE_LOCATION = { id: 31, name: "Instituto Pádua", active: "true", empresaId: 5 };
let clinicMembershipIsValid = true;
let syntheticItemsEnabled = false;
afterEach(() => {
  syntheticItemsEnabled = false;
  FAKE_PROTOCOL.nurseId = null;
  FAKE_PROTOCOL.empresaId = 5;
  FAKE_PROTOCOL.professionalId = 1;
  FAKE_PROTOCOL.unit = "Instituto Pádua";
  FAKE_CLIENT.empresaId = 5;
  FAKE_CLIENT.locationId = 31;
  FAKE_LOCATION.id = 31;
  FAKE_LOCATION.name = "Instituto Pádua";
  FAKE_LOCATION.empresaId = 5;
  FAKE_PROFESSIONAL.id = 1;
  FAKE_PROFESSIONAL.name = "Dra. Ana Médica Sintética";
  testContext.empresaId = 5;
  testContext.professionalId = 1;
  testContext.professionalName = "Dra. Ana Médica Sintética";
  FAKE_PROFESSIONAL.specialty = "Cardiologia";
});

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
      case "professionals":         return new DbChain([FAKE_PROFESSIONAL]);
      case "locations":             return new DbChain([FAKE_LOCATION]);
      case "location_professionals":return new DbChain(clinicMembershipIsValid ? [{ id: 1 }] : []);
      case "protocol_items":        return new DbChain(syntheticItemsEnabled ? [{
        substanceId: 123, dose: "100 MG / 2 ML", totalSessions: 1, intervalDays: 7,
      }] : []);
      case "substances":            return new DbChain(syntheticItemsEnabled ? [{
        id: 123, name: "Substância sintética", category: "Teste", procedureType: "im",
        color: "blue", durationMinutes: 15, preciseDurationSeconds: 150,
      }] : []);
      case "sessions":              return new DbChain([]);
      case "substance_applications":return new DbChain([]);
      case "payments":              return new DbChain([]);
      case "assinatura_solicitacoes": return new DbChain([]);
      case "assinatura_templates":  return new DbChain([]);
      default:                      return new DbChain([]);
    }
  }

  where(..._a: any[]): DbChain   { return this; }
  innerJoin(..._a: any[]): DbChain { return this; }
  orderBy(..._a: any[]): DbChain { return this; }
  limit(..._a: any[]): DbChain   { return this; }
  select(..._a: any[]): DbChain  { return this; }
}

// ── App Express de teste ──────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenantContext = {
      empresaId: testContext.empresaId,
      isPlatformOwner: false,
      perfilPlataforma: "recepcionista",
      authenticated: true,
      professionalId: 1,
    };
    next();
  });
  app.use("/api", protocolsRouter);
  app.use("/api", rasRouter);
  return app;
}

// ── Configuração base dos mocks ───────────────────────────────────────────────

function setupMocks() {
  vi.mocked(db.select).mockReturnValue(new DbChain([]) as any);
  vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockResolvedValue([]) } as any);
  vi.mocked(db.execute).mockResolvedValue({
    rows: [{ drive_clientes_folder_id: "company-clients-root-5" }],
  } as any);
  vi.mocked(pdfSigner.generateProtocolDocumentPdf).mockResolvedValue({
    pdfBytes: FAKE_PDF_BYTES,
  } as any);
  vi.mocked(pdfSigner.generatePhysicalRASPdf).mockResolvedValue(FAKE_PDF_BYTES as any);
  vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(true);
  vi.mocked(driveLib.isDriveConnected).mockResolvedValue(true);
  vi.mocked(driveLib.uploadToFolderById).mockResolvedValue({ fileId: "x1" } as any);
  vi.mocked(driveLib.ensureClientFolderStructure).mockResolvedValue({
    clientFolderId: "f1",
    subfolders: { PROTOCOLOS: "pf1", EXAMES: "ef1", "FOTO PERFIL": "ff1" },
  } as any);
  vi.mocked(driveLib.uploadFileToDrive).mockResolvedValue({ fileId: "x2" } as any);
  vi.mocked(emailSvc.sendProtocolEmail).mockResolvedValue({
    success: true, messageId: "msg-1",
  } as any);
}

describe("RAS físico — pré-visualização e entrega separadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testContext.empresaId = 5;
    testContext.professionalId = 1;
    FAKE_PROTOCOL.empresaId = 5;
    FAKE_PROTOCOL.professionalId = 1;
    FAKE_PROTOCOL.unit = "Instituto Pádua";
    FAKE_CLIENT.empresaId = 5;
    FAKE_CLIENT.locationId = 31;
    FAKE_LOCATION.id = 31;
    FAKE_LOCATION.name = "Instituto Pádua";
    FAKE_LOCATION.empresaId = 5;
    FAKE_PROFESSIONAL.id = 1;
    FAKE_PROFESSIONAL.name = "Dra. Ana Médica Sintética";
    clinicMembershipIsValid = true;
    setupMocks();
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockResolvedValue([]) } as any);
  });

  it("nega PDF físico sem autenticação antes de gerar o documento", async () => {
    const response = await request(buildApp()).get("/api/ras/physical/99");
    expect(response.status).toBe(401);
    expect(pdfSigner.generatePhysicalRASPdf).not.toHaveBeenCalled();
  });

  it("nega PDF físico quando o profissional não pertence à clínica", async () => {
    clinicMembershipIsValid = false;
    const response = await request(buildApp()).get("/api/ras/physical/99")
      .set("Authorization", "Bearer test-collaborator");
    expect(response.status).toBe(404);
    expect(pdfSigner.generatePhysicalRASPdf).not.toHaveBeenCalled();
  });

  it("abrir o documento devolve os bytes sem enviar e-mail ou acessar o Drive", async () => {
    const response = await request(buildApp()).get("/api/ras/physical/99")
      .set("Authorization", "Bearer test-collaborator");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/pdf/);
    expect(response.body).toEqual(Buffer.from(FAKE_PDF_BYTES));
    expect(emailSvc.sendProtocolEmail).not.toHaveBeenCalled();
    expect(gmailLib.isGmailConnected).not.toHaveBeenCalled();
    expect(driveLib.isDriveConnected).not.toHaveBeenCalled();
    expect(driveLib.uploadFileToDrive).not.toHaveBeenCalled();
  });

  it("reenvio sem autenticação não gera documento nem envia mensagem", async () => {
    const response = await request(buildApp()).post("/api/ras/physical/99/reenviar-email");
    expect(response.status).toBe(401);
    expect(pdfSigner.generatePhysicalRASPdf).not.toHaveBeenCalled();
    expect(emailSvc.sendProtocolEmail).not.toHaveBeenCalled();
  });

  it("reenvio autorizado envia os bytes gerados, sem exigir Drive", async () => {
    const response = await request(buildApp())
      .post("/api/ras/physical/99/reenviar-email")
      .set("Authorization", "Bearer test-collaborator");
    expect(response.status).toBe(200);
    expect(emailSvc.sendProtocolEmail).toHaveBeenCalledOnce();
    expect(emailSvc.sendProtocolEmail).toHaveBeenCalledWith(expect.objectContaining({
      clientEmail: FAKE_CLIENT.email,
      pdfBuffer: Buffer.from(FAKE_PDF_BYTES),
    }));
    expect(driveLib.isDriveConnected).not.toHaveBeenCalled();
  });

  it("Gmail desconectado impede a geração e o envio", async () => {
    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(false);
    const response = await request(buildApp())
      .post("/api/ras/physical/99/reenviar-email")
      .set("Authorization", "Bearer test-collaborator");
    expect(response.status).toBe(503);
    expect(pdfSigner.generatePhysicalRASPdf).not.toHaveBeenCalled();
    expect(emailSvc.sendProtocolEmail).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Bloco 1 — GET é pré-visualização pura: zero efeitos colaterais
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/protocols/:id/document-pdf — pré-visualização pura (sem efeitos colaterais)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicMembershipIsValid = true;
    setupMocks();
  });

  it("nega a pré-visualização sem autenticação e não gera PDF", async () => {
    const res = await request(buildApp()).get("/api/protocols/99/document-pdf");
    expect(res.status).toBe(401);
    expect(vi.mocked(pdfSigner.generateProtocolDocumentPdf)).not.toHaveBeenCalled();
  });

  it("retorna HTTP 200 com content-type application/pdf", async () => {
    const res = await request(buildApp()).get("/api/protocols/99/document-pdf")
      .set("Authorization", "Bearer test-collaborator");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/pdf/);
  });

  it("NÃO chama sendProtocolEmail — abrindo o PDF não dispara e-mail ao paciente", async () => {
    await request(buildApp()).get("/api/protocols/99/document-pdf")
      .set("Authorization", "Bearer test-collaborator");

    // Aguarda qualquer IIFE residual que pudesse rodar em background
    await new Promise(r => setTimeout(r, 300));

    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(emailSvc.sendProtocolOnboardingEmail)).not.toHaveBeenCalled();
  });

  it("NÃO chama isDriveConnected — abrindo o PDF não acessa o Drive", async () => {
    await request(buildApp()).get("/api/protocols/99/document-pdf")
      .set("Authorization", "Bearer test-collaborator");
    await new Promise(r => setTimeout(r, 300));

    expect(vi.mocked(driveLib.isDriveConnected)).not.toHaveBeenCalled();
  });

  it("NÃO chama uploadToFolderById nem uploadFileToDrive", async () => {
    await request(buildApp()).get("/api/protocols/99/document-pdf")
      .set("Authorization", "Bearer test-collaborator");
    await new Promise(r => setTimeout(r, 300));

    expect(vi.mocked(driveLib.uploadToFolderById)).not.toHaveBeenCalled();
    expect(vi.mocked(driveLib.uploadFileToDrive)).not.toHaveBeenCalled();
    expect(vi.mocked(driveLib.ensureClientFolderStructure)).not.toHaveBeenCalled();
  });

  it("NÃO chama isGmailConnected — Gmail não é consultado na pré-visualização", async () => {
    await request(buildApp()).get("/api/protocols/99/document-pdf")
      .set("Authorization", "Bearer test-collaborator");
    await new Promise(r => setTimeout(r, 300));

    expect(vi.mocked(gmailLib.isGmailConnected)).not.toHaveBeenCalled();
  });

  it("retorna 404 quando o protocolo não existe — sem side effects", async () => {
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

    const res = await request(buildApp()).get("/api/protocols/99/document-pdf")
      .set("Authorization", "Bearer test-collaborator");
    expect(res.status).toBe(404);

    await new Promise(r => setTimeout(r, 300));
    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(driveLib.isDriveConnected)).not.toHaveBeenCalled();
  });

  it("nega profissional sem vínculo com a clínica antes de gerar PDF", async () => {
    clinicMembershipIsValid = false;
    const res = await request(buildApp()).get("/api/protocols/99/document-pdf")
      .set("Authorization", "Bearer test-collaborator");
    expect(res.status).toBe(404);
    expect(vi.mocked(pdfSigner.generateProtocolDocumentPdf)).not.toHaveBeenCalled();
    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Bloco 2 — POST emit-document exige autenticação explícita (requireCollaborator)
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/protocols/:id/emit-document — entrega real exige requireCollaborator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicMembershipIsValid = true;
    setupMocks();
  });

  it("retorna 401 sem token — o CEO não aciona e-mail sem confirmação explícita", async () => {
    // requireCollaborator está mockado para retornar 401 por padrão
    const res = await request(buildApp())
      .post("/api/protocols/99/emit-document")
      .send({});

    expect(res.status).toBe(401);
  });

  it("NÃO chama sendProtocolEmail sem token — e-mail nunca vai por acidente", async () => {
    await request(buildApp())
      .post("/api/protocols/99/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 300));
    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });

  it("NÃO chama Drive sem token — nenhum arquivo sobe sem confirmação", async () => {
    await request(buildApp())
      .post("/api/protocols/99/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 300));
    expect(vi.mocked(driveLib.isDriveConnected)).not.toHaveBeenCalled();
    expect(vi.mocked(driveLib.uploadToFolderById)).not.toHaveBeenCalled();
  });

  it("prévia e emissão recebem a mesma duração precisa do cadastro", async () => {
    syntheticItemsEnabled = true;
    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(false);
    vi.mocked(driveLib.isDriveConnected).mockResolvedValue(false);

    const preview = await request(buildApp()).get("/api/protocols/99/document-pdf")
      .set("Authorization", "Bearer test-collaborator");
    expect(preview.status).toBe(200);
    expect(vi.mocked(pdfSigner.generateProtocolDocumentPdf).mock.calls[0][0].substances[0].durationMinutes).toBe(2.5);
    expect(vi.mocked(pdfSigner.generateProtocolDocumentPdf).mock.calls[0][0].substances[0].dose).toBe("100 mg");

    const emission = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});
    expect(emission.status).toBe(200);
    expect(vi.mocked(pdfSigner.generateProtocolDocumentPdf).mock.calls[1][0].substances[0].durationMinutes).toBe(2.5);
    expect(vi.mocked(pdfSigner.generateProtocolDocumentPdf).mock.calls[1][0].substances[0].dose).toBe("100 mg");
    expect(vi.mocked(driveLib.uploadFileToDrive)).not.toHaveBeenCalled();
    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });

  it("guarda protocolo e RAS somente na pasta da clínica, sem usar pasta compartilhada", async () => {
    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(false);
    const response = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});

    expect(response.status).toBe(200);
    expect(response.body.driveUploaded).toBe(true);
    expect(response.body.driveError).toBeNull();
    expect(driveLib.ensureClientFolderStructure).toHaveBeenCalledWith(
      FAKE_CLIENT.name,
      FAKE_CLIENT.cpf,
      "company-clients-root-5",
    );
    expect(driveLib.uploadFileToDrive).toHaveBeenCalledTimes(2);
    expect(driveLib.uploadFileToDrive).toHaveBeenNthCalledWith(
      1, "pf1", expect.stringContaining("PROTOCOLO ANA SILVA"), "application/pdf", Buffer.from(FAKE_PDF_BYTES), true,
    );
    expect(driveLib.uploadFileToDrive).toHaveBeenNthCalledWith(
      2, "pf1", expect.stringContaining("RAS FAP"), "application/pdf", Buffer.from(FAKE_PDF_BYTES), true,
    );
    expect(driveLib.uploadToFolderById).not.toHaveBeenCalled();
  });

  it("bloqueia emissão quando o protocolo pertence a outra empresa", async () => {
    FAKE_PROTOCOL.empresaId = 99;
    try {
      const response = await request(buildApp()).post("/api/protocols/99/emit-document")
        .set("Authorization", "Bearer test-collaborator").send({});
      expect(response.status).toBe(404);
      expect(pdfSigner.generateProtocolDocumentPdf).not.toHaveBeenCalled();
      expect(driveLib.isDriveConnected).not.toHaveBeenCalled();
      expect(emailSvc.sendProtocolEmail).not.toHaveBeenCalled();
    } finally {
      FAKE_PROTOCOL.empresaId = 5;
    }
  });

  it.each([
    {
      empresaId: 5, locationId: 31, locationName: "Clínica Sintética A",
      professionalId: 1, professionalName: "Dra. Ana Sintética", driveRoot: "drive-clients-company-5",
    },
    {
      empresaId: 6, locationId: 62, locationName: "Clínica Sintética B",
      professionalId: 2, professionalName: "Dr. Bruno Sintético", driveRoot: "drive-clients-company-6",
    },
  ])("emite com a identidade e pasta próprias da empresa $empresaId", async ({
    empresaId, locationId, locationName, professionalId, professionalName, driveRoot,
  }) => {
    testContext.empresaId = empresaId;
    testContext.professionalId = professionalId;
    testContext.professionalName = professionalName;
    FAKE_PROTOCOL.empresaId = empresaId;
    FAKE_PROTOCOL.professionalId = professionalId;
    FAKE_PROTOCOL.unit = locationName;
    FAKE_CLIENT.empresaId = empresaId;
    FAKE_CLIENT.locationId = locationId;
    FAKE_LOCATION.id = locationId;
    FAKE_LOCATION.name = locationName;
    FAKE_LOCATION.empresaId = empresaId;
    FAKE_PROFESSIONAL.id = professionalId;
    FAKE_PROFESSIONAL.name = professionalName;
    vi.mocked(db.execute).mockResolvedValue({
      rows: [{ drive_clientes_folder_id: driveRoot }],
    } as any);
    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(false);

    const response = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});

    expect(response.status).toBe(200);
    expect(pdfSigner.generateProtocolDocumentPdf).toHaveBeenCalledWith(
      expect.objectContaining({ professionalName, unit: locationName }),
    );
    expect(pdfSigner.generatePhysicalRASPdf).toHaveBeenCalledWith(
      expect.objectContaining({ professionalName, unit: locationName }),
      "PREMIUM",
    );
    expect(driveLib.ensureClientFolderStructure).toHaveBeenCalledWith(
      FAKE_CLIENT.name, FAKE_CLIENT.cpf, driveRoot,
    );

    vi.mocked(pdfSigner.generatePhysicalRASPdf).mockClear();
    const physicalRas = await request(buildApp()).get("/api/ras/physical/99")
      .set("Authorization", "Bearer test-collaborator");
    expect(physicalRas.status).toBe(200);
    expect(pdfSigner.generatePhysicalRASPdf).toHaveBeenCalledWith(
      expect.objectContaining({ professionalName, unit: locationName }),
      "PREMIUM",
    );

    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(true);
    vi.mocked(emailSvc.sendProtocolEmail).mockClear();
    const resend = await request(buildApp()).post("/api/ras/physical/99/reenviar-email")
      .set("Authorization", "Bearer test-collaborator");
    expect(resend.status).toBe(200);
    expect(emailSvc.sendProtocolEmail).toHaveBeenCalledOnce();
    expect(emailSvc.sendProtocolEmail).toHaveBeenCalledWith(expect.objectContaining({
      clientEmail: FAKE_CLIENT.email,
      professionalName,
    }));
  });

  it("bloqueia impressão e reenvio de RAS entre clínicas antes dos efeitos", async () => {
    FAKE_PROTOCOL.empresaId = 6;
    FAKE_CLIENT.empresaId = 6;
    FAKE_CLIENT.locationId = 62;
    FAKE_LOCATION.id = 62;
    FAKE_LOCATION.name = "Clínica Sintética B";
    FAKE_LOCATION.empresaId = 6;
    testContext.empresaId = 5;
    vi.mocked(pdfSigner.generatePhysicalRASPdf).mockClear();
    vi.mocked(emailSvc.sendProtocolEmail).mockClear();

    const preview = await request(buildApp()).get("/api/ras/physical/99")
      .set("Authorization", "Bearer test-collaborator");
    const resend = await request(buildApp()).post("/api/ras/physical/99/reenviar-email")
      .set("Authorization", "Bearer test-collaborator");

    expect(preview.status).toBe(404);
    expect(resend.status).toBe(404);
    expect(pdfSigner.generatePhysicalRASPdf).not.toHaveBeenCalled();
    expect(emailSvc.sendProtocolEmail).not.toHaveBeenCalled();
  });

  it("não usa a pasta global quando a empresa não tem raiz do Drive configurada", async () => {
    vi.mocked(db.execute).mockResolvedValue({ rows: [] } as any);
    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(false);

    const response = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});

    expect(response.status).toBe(200);
    expect(response.body.driveUploaded).toBe(false);
    expect(response.body.driveError).toContain("pasta de clientes configurada");
    expect(driveLib.ensureClientFolderStructure).not.toHaveBeenCalled();
    expect(driveLib.uploadToFolderById).not.toHaveBeenCalled();
    expect(driveLib.uploadFileToDrive).not.toHaveBeenCalled();
  });

  it("não inventa um profissional de enfermagem quando o protocolo não indica nenhum", async () => {
    FAKE_PROFESSIONAL.specialty = "Enfermagem";
    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(false);
    const emission = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});
    expect(emission.status).toBe(200);
    expect(vi.mocked(pdfSigner.generateProtocolDocumentPdf).mock.calls[0][0].nurseName).toBeUndefined();
    expect(vi.mocked(pdfSigner.generatePhysicalRASPdf).mock.calls[0][0].nurseName).toBeUndefined();
  });

  it("usa o profissional de enfermagem indicado no protocolo", async () => {
    FAKE_PROTOCOL.nurseId = FAKE_PROFESSIONAL.id;
    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(false);
    const emission = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});
    expect(emission.status).toBe(200);
    expect(vi.mocked(pdfSigner.generateProtocolDocumentPdf).mock.calls[0][0].nurseName).toBe(FAKE_PROFESSIONAL.name);
    expect(vi.mocked(pdfSigner.generatePhysicalRASPdf).mock.calls[0][0].nurseName).toBe(FAKE_PROFESSIONAL.name);
  });

  it("não atribui ao cadastro do cliente uma falha da conexão Gmail", async () => {
    vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(false);
    const response = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});
    expect(response.status).toBe(200);
    expect(response.body.emailSent).toBe(false);
    expect(response.body.emailError).toContain("Gmail indisponível");
    expect(response.body.emailError).not.toContain("sem e-mail");
    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });

  it("preserva a incerteza quando o serviço não confirma o envio", async () => {
    vi.mocked(emailSvc.sendProtocolEmail).mockResolvedValue({
      success: false, error: "Não foi possível confirmar. Verifique antes de reenviar.",
    });
    const response = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});
    expect(response.status).toBe(200);
    expect(response.body.emailSent).toBe(false);
    expect(response.body.emailError).toContain("Verifique antes de reenviar");
    expect(response.body.message).toContain("não confirmado");
  });

  it("não confirma o RAS FAP quando a geração falha", async () => {
    vi.mocked(pdfSigner.generatePhysicalRASPdf).mockRejectedValueOnce(new Error("Falha sintética"));
    const response = await request(buildApp()).post("/api/protocols/99/emit-document")
      .set("Authorization", "Bearer test-collaborator").send({});
    expect(response.status).toBe(200);
    expect(response.body.rasFapGenerated).toBe(false);
    expect(vi.mocked(emailSvc.sendProtocolEmail).mock.calls[0][0].rasFapBuffer).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Bloco 3 — Fluxo de confirmação da UI (detail.tsx): Emitir ao Paciente
//
// Verifica estaticamente que o componente React implementa o gate de
// confirmação (emitirConfirm) antes de chamar o POST com efeitos colaterais.
// Essa verificação garante que uma refatoração futura não remova o diálogo
// sem que este teste sinalize o problema.
// ════════════════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";

describe("Botão 'Emitir ao Paciente' — fluxo de confirmação (detail.tsx)", () => {
  const detailSrc = fs.readFileSync(
    path.resolve(__dirname, "../../../../artifacts/padcom/src/pages/protocols/detail.tsx"),
    "utf8",
  );

  it("o estado emitirConfirm existe na tela (gate de confirmação declarado)", () => {
    expect(detailSrc).toContain("emitirConfirm");
  });

  it("o botão primário lança setEmitirConfirm(true) — não dispara POST imediatamente", () => {
    expect(detailSrc).toContain("setEmitirConfirm(true)");
  });

  it("o diálogo de confirmação mostra o texto de aviso ao CEO", () => {
    // Texto que aparece no diálogo antes de confirmar
    expect(detailSrc).toContain("Enviar e-mail real ao paciente?");
  });

  it("o botão 'Confirmar' existe no diálogo de confirmação", () => {
    expect(detailSrc).toContain("Confirmar");
  });

  it("o botão 'Cancelar' existe — CEO pode abortar sem efeito colateral", () => {
    expect(detailSrc).toContain("Cancelar");
    // Cancelar chama setEmitirConfirm(false), não navega nem envia
    expect(detailSrc).toContain("setEmitirConfirm(false)");
  });

  it("o POST emit-document só é chamado após confirmação (dentro do bloco emitirConfirm)", () => {
    // O fetch para emit-document deve estar aninhado dentro do bloco condicional emitirConfirm
    const confirmBlock = detailSrc.slice(
      detailSrc.indexOf("emitirConfirm ?"),
      detailSrc.indexOf("emitirConfirm ?") + 2000,
    );
    expect(confirmBlock).toContain("emit-document");
    expect(confirmBlock).toContain("method: \"POST\"");
  });

  it("o botão de pré-visualização (Protocolo Completo PDF) usa GET — sem efeito colateral", () => {
    // O fetch para document-pdf não especifica method → usa GET por padrão
    const pdfPreviewFetch = detailSrc.match(
      /fetch\([^)]*document-pdf[^)]*\)/,
    );
    expect(pdfPreviewFetch).not.toBeNull();
    // Não deve ter method: "POST" no fetch de pré-visualização
    const fetchCall = pdfPreviewFetch![0];
    expect(fetchCall).not.toContain("POST");
  });
});
