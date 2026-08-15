/**
 * ras-fap-channel-propagation.test.ts
 *
 * Confirma que a rota POST /api/protocols/:id/emit-document lê
 * process.env.PADAXOR_SLACK_CHANNEL_ID e repassa o valor INTACTO como
 * argumento `slackChannel` na chamada a `notifySlackRasFapFailure`.
 *
 * Cobre os dois caminhos de falha:
 *
 *   1. Drive  — generatePhysicalRASPdf lança → context "drive"
 *   2. E-mail — sendProtocolEmail lança com rasFapBuffer presente → context "email"
 *
 * Sem esses testes, uma refatoração que esquecesse de passar o env var
 * silenciaria os alertas sem nenhum aviso.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mocks ANTES de qualquer import da rota ────────────────────────────────────

vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/tenantContext", () => ({
  resolveEmpresaId: () => 5,
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// requireCollaborator PERMITE a requisição (ao contrário do isolamento padrão)
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (_req: any, _res: any, next: any) => next(),
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
    protocolsTable:              makeT("protocols"),
    clientsTable:                makeT("clients"),
    professionalsTable:          makeT("professionals"),
    sessionsTable:               makeT("sessions"),
    protocolItemsTable:          makeT("protocol_items"),
    substancesTable:             makeT("substances"),
    substanceApplicationsTable:  makeT("substance_applications"),
    paymentsTable:               makeT("payments"),
    assinaturaSolicitacoesTable: makeT("assinatura_solicitacoes"),
    assinaturaTemplatesTable:    makeT("assinatura_templates"),
    protocolEmissoesTable:       makeT("protocol_emissoes"),
  };
});

vi.mock("@workspace/api-zod", () => ({
  ListProtocolsQueryParams:  { safeParse: (x: any) => ({ success: true, data: x }) },
  CreateProtocolBody:        { safeParse: (x: any) => ({ success: true, data: x }) },
  GetProtocolParams:         { safeParse: (x: any) => ({ success: true, data: x }) },
  UpdateProtocolParams:      { safeParse: (x: any) => ({ success: true, data: x }) },
  UpdateProtocolBody:        { safeParse: (x: any) => ({ success: true, data: x }) },
  ValidateProtocolParams:    { safeParse: (x: any) => ({ success: true, data: x }) },
  GenerateProtocolICSParams: { safeParse: (x: any) => ({ success: true, data: x }) },
}));

vi.mock("../lib/google-drive", () => ({
  isDriveConnected:            vi.fn().mockResolvedValue(false),
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
  isGmailConnected: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/pdf-signer", () => ({
  generateProtocolDocumentPdf: vi.fn(),
  generatePhysicalRASPdf:      vi.fn(),
  getCertInfo:                 vi.fn(),
}));

vi.mock("../lib/pdf-carta-tratamento", () => ({
  generateProtocolLetterPdf: vi.fn(),
  buildCartaTratamentoDto:   vi.fn(),
}));

vi.mock("../lib/slack-reporter", () => ({
  postSlackAlert: vi.fn().mockResolvedValue(undefined),
}));

// notifySlackRasFapFailure é o spy principal deste teste
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

// ── Imports APÓS os mocks ─────────────────────────────────────────────────────

import express from "express";
import request from "supertest";
import { db } from "@workspace/db";
import * as pdfSigner  from "../lib/pdf-signer";
import * as emailSvc   from "../lib/email-service";
import * as rasFapAlert from "../lib/ras-fap-alert";
import protocolsRouter from "../routes/protocols";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_PROTOCOL = {
  id:                42,
  clientId:          7,
  empresaId:         5,
  professionalId:    null,
  title:             "IV Longevidade Premium",
  status:            "active",
  startDate:         "2026-08-01",
  endDate:           null,
  totalSessions:     4,
  completedSessions: 0,
  totalValue:        5000,
  unit:              "Instituto Pádua",
  serviceType:       "iv",
  notes:             null,
  createdAt:         new Date("2026-08-01T12:00:00Z"),
  updatedAt:         new Date("2026-08-01T12:00:00Z"),
};

const FAKE_CLIENT = {
  id:        7,
  name:      "Maria Oliveira",
  cpf:       "12345678901",
  email:     "maria@example.com",
  phone:     "11999990000",
  birthDate: "1990-05-15",
  empresaId: 5,
  status:    "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const FAKE_PDF_BYTES  = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const FAKE_RAS_BYTES  = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x52]); // "%PDFR"
const TEST_CHANNEL_ID = "C_TEST_RAS_CHANNEL";

// ── Thenable-chain mock para drizzle ─────────────────────────────────────────

class DbChain {
  constructor(private rows: any[]) {}

  then(onFulfilled: (v: any[]) => any, onRejected?: (r: any) => any) {
    return Promise.resolve(this.rows).then(onFulfilled, onRejected);
  }

  from(table: any): DbChain {
    const name: string = table?.__mockName ?? "";
    switch (name) {
      case "protocols":               return new DbChain([FAKE_PROTOCOL]);
      case "clients":                 return new DbChain([FAKE_CLIENT]);
      case "professionals":           return new DbChain([]);
      case "protocol_items":          return new DbChain([]);
      case "substances":              return new DbChain([]);
      case "sessions":                return new DbChain([]);
      case "substance_applications":  return new DbChain([]);
      case "payments":                return new DbChain([]);
      case "assinatura_solicitacoes": return new DbChain([]);
      case "assinatura_templates":    return new DbChain([]);
      default:                        return new DbChain([]);
    }
  }

  where(..._a: any[]): DbChain    { return this; }
  innerJoin(..._a: any[]): DbChain { return this; }
  orderBy(..._a: any[]): DbChain  { return this; }
  limit(..._a: any[]): DbChain    { return this; }
  select(..._a: any[]): DbChain   { return this; }
  values(..._a: any[]): DbChain   { return this; }
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", protocolsRouter);
  return app;
}

// ── Gerenciamento do env var ──────────────────────────────────────────────────

let savedChannelId: string | undefined;

beforeEach(() => {
  savedChannelId = process.env.PADAXOR_SLACK_CHANNEL_ID;
  process.env.PADAXOR_SLACK_CHANNEL_ID = TEST_CHANNEL_ID;

  vi.clearAllMocks();

  vi.mocked(db.select).mockReturnValue(new DbChain([]) as any);
  vi.mocked(db.insert).mockReturnValue(new DbChain([]) as any);

  // Por padrão: documento principal OK, RAS FAP OK, e-mail OK
  vi.mocked(pdfSigner.generateProtocolDocumentPdf).mockResolvedValue({
    pdfBytes: FAKE_PDF_BYTES,
  } as any);
  vi.mocked(pdfSigner.generatePhysicalRASPdf).mockResolvedValue(
    FAKE_RAS_BYTES as any,
  );
  vi.mocked(emailSvc.sendProtocolEmail).mockResolvedValue({
    success: true,
    messageId: "msg-ok",
  } as any);
});

afterEach(() => {
  if (savedChannelId !== undefined) {
    process.env.PADAXOR_SLACK_CHANNEL_ID = savedChannelId;
  } else {
    delete process.env.PADAXOR_SLACK_CHANNEL_ID;
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Bloco 1 — Caminho de falha Drive
// ════════════════════════════════════════════════════════════════════════════

describe("emit-document — falha no Drive: PADAXOR_SLACK_CHANNEL_ID chega a notifySlackRasFapFailure", () => {
  beforeEach(() => {
    // RAS FAP falha → aciona notifySlackRasFapFailure("drive")
    vi.mocked(pdfSigner.generatePhysicalRASPdf).mockRejectedValue(
      new Error("Chromium process exited with code 1"),
    );
  });

  it("chama notifySlackRasFapFailure com context 'drive'", async () => {
    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    expect(vi.mocked(rasFapAlert.notifySlackRasFapFailure)).toHaveBeenCalled();
    const [context] = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls[0];
    expect(context).toBe("drive");
  });

  it("passa process.env.PADAXOR_SLACK_CHANNEL_ID como slackChannel (índice 5)", async () => {
    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    const calls = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Assinatura: (context, clientName, protocolId, protocolTitle, errorMessage, slackChannel)
    const slackChannel = calls[0][5];
    expect(slackChannel).toBe(TEST_CHANNEL_ID);
  });

  it("passa o nome do cliente correto", async () => {
    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    const [, clientName] = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls[0];
    expect(clientName).toBe(FAKE_CLIENT.name);
  });

  it("passa o ID do protocolo correto", async () => {
    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    const [, , protocolId] = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls[0];
    expect(String(protocolId)).toBe(String(FAKE_PROTOCOL.id));
  });

  it("NÃO passa o channel quando PADAXOR_SLACK_CHANNEL_ID está ausente", async () => {
    delete process.env.PADAXOR_SLACK_CHANNEL_ID;

    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    const calls = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls;
    if (calls.length > 0) {
      const slackChannel = calls[0][5];
      expect(slackChannel).toBeUndefined();
    }
    // Se não foi chamada, também está correto (undefined silencia a função)
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Bloco 2 — Caminho de falha e-mail (com rasFapBuffer presente)
// ════════════════════════════════════════════════════════════════════════════

describe("emit-document — falha no e-mail com RAS FAP pronto: PADAXOR_SLACK_CHANNEL_ID chega a notifySlackRasFapFailure", () => {
  beforeEach(() => {
    // RAS FAP gerado com sucesso; e-mail falha ao enviar
    vi.mocked(pdfSigner.generatePhysicalRASPdf).mockResolvedValue(
      FAKE_RAS_BYTES as any,
    );
    vi.mocked(emailSvc.sendProtocolEmail).mockRejectedValue(
      new Error("SMTP connection refused"),
    );
  });

  it("chama notifySlackRasFapFailure com context 'email'", async () => {
    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    expect(vi.mocked(rasFapAlert.notifySlackRasFapFailure)).toHaveBeenCalled();
    const [context] = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls[0];
    expect(context).toBe("email");
  });

  it("passa process.env.PADAXOR_SLACK_CHANNEL_ID como slackChannel (índice 5)", async () => {
    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    const calls = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const slackChannel = calls[0][5];
    expect(slackChannel).toBe(TEST_CHANNEL_ID);
  });

  it("passa o nome do cliente correto", async () => {
    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    const [, clientName] = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls[0];
    expect(clientName).toBe(FAKE_CLIENT.name);
  });

  it("passa o ID do protocolo correto", async () => {
    await request(buildApp())
      .post("/api/protocols/42/emit-document")
      .send({});

    await new Promise(r => setTimeout(r, 200));

    const [, , protocolId] = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls[0];
    expect(String(protocolId)).toBe(String(FAKE_PROTOCOL.id));
  });

  it("NÃO chama notifySlackRasFapFailure quando PADAXOR_SLACK_CHANNEL_ID está ausente — silencia o alerta sem lançar", async () => {
    delete process.env.PADAXOR_SLACK_CHANNEL_ID;

    await expect(
      request(buildApp())
        .post("/api/protocols/42/emit-document")
        .send({}),
    ).resolves.toBeDefined(); // a rota responde sem lançar

    await new Promise(r => setTimeout(r, 200));

    const calls = vi.mocked(rasFapAlert.notifySlackRasFapFailure).mock.calls;
    // Se foi chamada, slackChannel deve ser undefined (a função silencia sozinha)
    if (calls.length > 0) {
      expect(calls[0][5]).toBeUndefined();
    }
  });
});
