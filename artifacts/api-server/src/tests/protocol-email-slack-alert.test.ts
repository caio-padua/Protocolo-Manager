/**
 * protocol-email-slack-alert.test.ts
 *
 * Confirma que o CEO recebe o aviso no Slack quando o e-mail do protocolo
 * falha na entrega via POST /api/protocols/:id/emit-document.
 *
 * Dois caminhos de falha cobertos:
 *
 *   1. sendProtocolEmail retorna { success: false, error: "..." }
 *      → postSlackAlert deve ser chamado com o nome do cliente, o número
 *        do protocolo e a mensagem de erro.
 *
 *   2. sendProtocolEmail lança uma exceção (bloco catch)
 *      → postSlackAlert também deve ser chamado com os dados do erro.
 *
 * Estratégia: Express de teste + mocks Vitest para todas as dependências
 * externas (Drive, Gmail, PDF, banco). requireCollaborator é mockado para
 * passar — o teste foca exclusivamente no comportamento pós-autenticação.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mocks ANTES de qualquer import de rota ────────────────────────────────────

vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/tenantContext", () => ({
  resolveEmpresaId: () => 5,
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// requireCollaborator: aprovado — queremos testar o fluxo após autenticação
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
    desc:    vi.fn((col: any) => col),
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
    pool:                        { query: vi.fn().mockResolvedValue({ rows: [] }) },
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
  uploadToFolderById:          vi.fn().mockResolvedValue({ fileId: "f1" }),
  uploadFileToDrive:           vi.fn().mockResolvedValue({ fileId: "f2" }),
  ensureClientFolderStructure: vi.fn().mockResolvedValue({
    clientFolderId: "cf1",
    subfolders: { PROTOCOLOS: "pf1", EXAMES: "ef1", "FOTO PERFIL": "ff1" },
  }),
  shareWithClient:             vi.fn().mockResolvedValue(undefined),
  formatPhysicalRASFileName:   vi.fn().mockReturnValue("RAS_FAP.pdf"),
}));

const mockPostSlackAlert = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/slack-reporter", () => ({
  postSlackAlert: (...args: any[]) => mockPostSlackAlert(...args),
}));

vi.mock("../lib/ras-fap-alert", () => ({
  notifySlackRasFapFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/google-gmail", () => ({
  isGmailConnected: vi.fn().mockResolvedValue(true),
}));

const mockSendProtocolEmail = vi.fn();

vi.mock("../lib/email-service", () => ({
  sendProtocolEmail:           (...args: any[]) => mockSendProtocolEmail(...args),
  sendProtocolOnboardingEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCartaTratamentoEmail:    vi.fn().mockResolvedValue({ success: true }),
}));

const mockGeneratePhysicalRASPdf = vi.fn().mockResolvedValue(
  new Uint8Array([0x25, 0x50, 0x44, 0x46]),
);

vi.mock("../lib/pdf-signer", () => ({
  generateProtocolDocumentPdf: vi.fn().mockResolvedValue({
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  }),
  generatePhysicalRASPdf: (...a: unknown[]) => mockGeneratePhysicalRASPdf(...a),
  getCertInfo: vi.fn().mockReturnValue(null),
}));

vi.mock("../lib/pdf-carta-tratamento", () => ({
  generateProtocolLetterPdf:  vi.fn().mockResolvedValue(new Uint8Array()),
  buildCartaTratamentoDto:    vi.fn().mockReturnValue({}),
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
import protocolsRouter from "../routes/protocols";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROTOCOL_ID = 42;
const CLIENT_NAME = "Carlos Mendes";
const CLIENT_EMAIL = "carlos@example.com";

const FAKE_PROTOCOL = {
  id:               PROTOCOL_ID,
  clientId:         3,
  empresaId:        5,
  professionalId:   null,
  title:            "IV Longevidade Premium",
  status:           "active",
  startDate:        "2026-09-01",
  endDate:          null,
  totalSessions:    4,
  completedSessions: 0,
  totalValue:       8000,
  unit:             "Instituto Pádua",
  serviceType:      "iv",
  notes:            null,
  createdAt:        new Date("2026-09-01T12:00:00Z"),
  updatedAt:        new Date("2026-09-01T12:00:00Z"),
};

const FAKE_CLIENT = {
  id:        3,
  name:      CLIENT_NAME,
  cpf:       "98765432100",
  email:     CLIENT_EMAIL,
  phone:     "11988880000",
  birthDate: "1985-03-20",
  empresaId: 5,
  status:    "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

// ── Drizzle chain mock ────────────────────────────────────────────────────────

class DbChain {
  constructor(private rows: any[]) {}

  then(onFulfilled: (v: any[]) => any, onRejected?: (r: any) => any) {
    return Promise.resolve(this.rows).then(onFulfilled, onRejected);
  }

  from(table: any): DbChain {
    const name: string = table?.__mockName ?? "";
    switch (name) {
      case "protocols":              return new DbChain([FAKE_PROTOCOL]);
      case "clients":                return new DbChain([FAKE_CLIENT]);
      case "professionals":          return new DbChain([]);
      case "protocol_items":         return new DbChain([]);
      case "substances":             return new DbChain([]);
      case "sessions":               return new DbChain([]);
      case "substance_applications": return new DbChain([]);
      case "payments":               return new DbChain([]);
      case "assinatura_solicitacoes":return new DbChain([]);
      case "assinatura_templates":   return new DbChain([]);
      case "protocol_emissoes":      return new DbChain([]);
      default:                       return new DbChain([]);
    }
  }

  where(..._a: any[]): DbChain    { return this; }
  innerJoin(..._a: any[]): DbChain { return this; }
  orderBy(..._a: any[]): DbChain  { return this; }
  limit(..._a: any[]): DbChain    { return this; }
  select(..._a: any[]): DbChain   { return this; }
  set(..._a: any[]): DbChain      { return this; }
  values(..._a: any[]): DbChain   { return this; }
  returning(): Promise<any[]>     { return Promise.resolve([]); }
}

// ── Express app de teste ──────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", protocolsRouter);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Aguarda promises fire-and-forget da rota terminarem */
const drain = () => new Promise(r => setTimeout(r, 400));

// ═════════════════════════════════════════════════════════════════════════════
// Bloco 1 — sendProtocolEmail retorna { success: false }
// ═════════════════════════════════════════════════════════════════════════════

describe("emit-document: e-mail com success=false dispara alerta no Slack", () => {
  let savedChannel: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.select).mockReturnValue(new DbChain([]) as any);
    vi.mocked(db.insert).mockReturnValue(new DbChain([]) as any);

    savedChannel = process.env.PADAXOR_SLACK_CHANNEL_ID;
    process.env.PADAXOR_SLACK_CHANNEL_ID = "C0BLW5S7GQL";

    mockSendProtocolEmail.mockResolvedValue({
      success: false,
      error: "Quota exceeded — Gmail API",
    });
  });

  afterEach(() => {
    if (savedChannel !== undefined) {
      process.env.PADAXOR_SLACK_CHANNEL_ID = savedChannel;
    } else {
      delete process.env.PADAXOR_SLACK_CHANNEL_ID;
    }
  });

  it("chama postSlackAlert ao menos uma vez", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    expect(mockPostSlackAlert).toHaveBeenCalled();
  });

  it("chama postSlackAlert com o canal correto", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    const [channelArg] = mockPostSlackAlert.mock.calls[0];
    expect(channelArg).toBe("C0BLW5S7GQL");
  });

  it("a mensagem contém o nome do paciente", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    const [, textArg] = mockPostSlackAlert.mock.calls[0];
    expect(textArg).toContain(CLIENT_NAME);
  });

  it("a mensagem contém o número do protocolo", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    const [, textArg] = mockPostSlackAlert.mock.calls[0];
    expect(textArg).toContain(String(PROTOCOL_ID));
  });

  it("a mensagem contém o motivo da falha retornado pelo sendProtocolEmail", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    const [, textArg] = mockPostSlackAlert.mock.calls[0];
    expect(textArg).toContain("Quota exceeded");
  });

  it("NÃO chama postSlackAlert quando PADAXOR_SLACK_CHANNEL_ID está ausente", async () => {
    delete process.env.PADAXOR_SLACK_CHANNEL_ID;

    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    expect(mockPostSlackAlert).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Bloco 2 — sendProtocolEmail lança exceção (bloco catch)
// ═════════════════════════════════════════════════════════════════════════════

describe("emit-document: exceção no bloco de e-mail dispara alerta no Slack", () => {
  let savedChannel: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.select).mockReturnValue(new DbChain([]) as any);
    vi.mocked(db.insert).mockReturnValue(new DbChain([]) as any);

    savedChannel = process.env.PADAXOR_SLACK_CHANNEL_ID;
    process.env.PADAXOR_SLACK_CHANNEL_ID = "C0BLW5S7GQL";

    mockSendProtocolEmail.mockRejectedValue(
      new Error("SMTP connection timeout"),
    );

    // Sem RAS FAP: se generatePhysicalRASPdf lança, rasFapBuffer fica undefined e
    // o caminho de falha de e-mail usa postSlackAlert (não notifySlackRasFapFailure).
    mockGeneratePhysicalRASPdf.mockRejectedValue(
      new Error("RAS FAP unavailable in test"),
    );
  });

  afterEach(() => {
    if (savedChannel !== undefined) {
      process.env.PADAXOR_SLACK_CHANNEL_ID = savedChannel;
    } else {
      delete process.env.PADAXOR_SLACK_CHANNEL_ID;
    }
  });

  it("chama postSlackAlert ao menos uma vez", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    expect(mockPostSlackAlert).toHaveBeenCalled();
  });

  it("chama postSlackAlert com o canal correto", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    const [channelArg] = mockPostSlackAlert.mock.calls[0];
    expect(channelArg).toBe("C0BLW5S7GQL");
  });

  it("a mensagem contém o nome do paciente", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    const [, textArg] = mockPostSlackAlert.mock.calls[0];
    expect(textArg).toContain(CLIENT_NAME);
  });

  it("a mensagem contém o número do protocolo", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    const [, textArg] = mockPostSlackAlert.mock.calls[0];
    expect(textArg).toContain(String(PROTOCOL_ID));
  });

  it("a mensagem contém a descrição da exceção lançada", async () => {
    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    const [, textArg] = mockPostSlackAlert.mock.calls[0];
    expect(textArg).toContain("SMTP connection timeout");
  });

  it("a rota retorna 200 mesmo quando o e-mail lança exceção (falha é non-blocking)", async () => {
    const res = await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    // A rota não deve explodir — falha de e-mail é tratada internamente
    expect(res.status).toBe(200);
  });

  it("NÃO chama postSlackAlert quando PADAXOR_SLACK_CHANNEL_ID está ausente", async () => {
    delete process.env.PADAXOR_SLACK_CHANNEL_ID;

    await request(buildApp())
      .post(`/api/protocols/${PROTOCOL_ID}/emit-document`)
      .send({});
    await drain();

    expect(mockPostSlackAlert).not.toHaveBeenCalled();
  });
});
