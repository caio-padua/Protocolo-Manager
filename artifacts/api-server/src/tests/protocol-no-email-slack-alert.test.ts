/**
 * protocol-no-email-slack-alert.test.ts
 *
 * Confirma que, ao emitir um protocolo para paciente SEM e-mail:
 *  1. postSlackAlert é chamado ANTES de generateProtocolDocumentPdf.
 *  2. A mensagem menciona o nome do paciente e o número do protocolo.
 *  3. A rota retorna 200 (emissão prossegue; só o e-mail fica ausente).
 *
 * E que, para paciente COM e-mail, o alerta de "sem e-mail" NÃO é disparado.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ANTES de qualquer import ───────────────────────────────────────────

vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/tenantContext", () => ({
  resolveEmpresaId: () => 5,
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// requireCollaborator passthrough — expõe o fluxo completo do emit.
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@workspace/db", () => {
  const makeT = (name: string) => ({ __mockName: name });
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
    },
    eq:      vi.fn((col: any, val: any) => ({ col, val })),
    and:     vi.fn((...args: any[]) => args),
    inArray: vi.fn((col: any, vals: any[]) => ({ col, vals })),
    desc:    vi.fn((col: any) => ({ col, dir: "desc" })),
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
    pool: { query: vi.fn().mockResolvedValue(undefined) },
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
import * as pdfSigner  from "../lib/pdf-signer";
import * as slackLib   from "../lib/slack-reporter";
import protocolsRouter from "../routes/protocols";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_PROTOCOL = {
  id:                55,
  clientId:          3,
  empresaId:         5,
  professionalId:    null,
  title:             "Teste Protocolo",
  status:            "active",
  startDate:         "2026-09-01",
  endDate:           null,
  totalSessions:     2,
  completedSessions: 0,
  totalValue:        1000,
  unit:              "Instituto Pádua",
  serviceType:       "iv",
  notes:             null,
  createdAt:         new Date("2026-09-01T12:00:00Z"),
  updatedAt:         new Date("2026-09-01T12:00:00Z"),
};

const CLIENT_SEM_EMAIL = {
  id:        3,
  name:      "Carlos Sem Email",
  cpf:       "99988877766",
  email:     null as string | null,
  phone:     "11988880000",
  birthDate: "1985-03-10",
  empresaId: 5,
  status:    "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const CLIENT_COM_EMAIL = { ...CLIENT_SEM_EMAIL, email: "carlos@example.com" };

const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

// ── Drizzle chain mock (factory — evita recursão infinita) ────────────────────

function makeDbChain(client: typeof CLIENT_SEM_EMAIL) {
  const rows: Record<string, any[]> = {
    protocols:              [FAKE_PROTOCOL],
    clients:                [client],
    professionals:          [],
    protocol_items:         [],
    substances:             [],
    sessions:               [],
    substance_applications: [],
    payments:               [],
    assinatura_solicitacoes: [],
    assinatura_templates:   [],
    protocol_emissoes:      [],
  };

  function chain(data: any[]): any {
    const obj: any = {
      then: (ok: (v: any[]) => any, fail?: (r: any) => any) =>
        Promise.resolve(data).then(ok, fail),
      from:      (t: any) => chain(rows[t?.__mockName ?? ""] ?? []),
      where:     (..._: any[]) => obj,
      innerJoin: (..._: any[]) => obj,
      orderBy:   (..._: any[]) => obj,
      limit:     (..._: any[]) => obj,
      select:    (..._: any[]) => obj,
    };
    return obj;
  }

  return chain([]);
}

function makeInsertChain() {
  return { values: (_v: any) => Promise.resolve([{ id: 999 }]) };
}

// ── App factory ───────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", protocolsRouter);
  return app;
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

function setupFor(client: typeof CLIENT_SEM_EMAIL) {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReturnValue(makeDbChain(client) as any);
  vi.mocked(db.insert).mockReturnValue(makeInsertChain() as any);
  vi.mocked(pdfSigner.generateProtocolDocumentPdf).mockResolvedValue({
    pdfBytes: FAKE_PDF_BYTES,
  } as any);
  vi.mocked(pdfSigner.generatePhysicalRASPdf).mockResolvedValue(
    FAKE_PDF_BYTES as any,
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Bloco 1 — paciente sem e-mail: alerta Slack antes da geração do PDF
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/protocols/:id/emit-document — paciente sem e-mail", () => {
  beforeEach(() => setupFor(CLIENT_SEM_EMAIL));

  it("postSlackAlert é chamado antes de generateProtocolDocumentPdf", async () => {
    const callOrder: string[] = [];

    vi.mocked(slackLib.postSlackAlert).mockImplementation(async () => {
      callOrder.push("slack");
    });
    vi.mocked(pdfSigner.generateProtocolDocumentPdf).mockImplementation(async () => {
      callOrder.push("pdf");
      return { pdfBytes: FAKE_PDF_BYTES } as any;
    });

    await request(buildApp())
      .post("/api/protocols/55/emit-document")
      .set("Authorization", "Bearer fake-token")
      .send({});

    const slackIdx = callOrder.indexOf("slack");
    const pdfIdx   = callOrder.indexOf("pdf");
    expect(slackIdx).toBeGreaterThanOrEqual(0);
    expect(pdfIdx).toBeGreaterThanOrEqual(0);
    expect(slackIdx).toBeLessThan(pdfIdx);
  });

  it("mensagem do alerta inclui nome do paciente e número do protocolo", async () => {
    await request(buildApp())
      .post("/api/protocols/55/emit-document")
      .set("Authorization", "Bearer fake-token")
      .send({});

    const noEmailCall = vi.mocked(slackLib.postSlackAlert).mock.calls.find(
      ([_ch, msg]) => (msg as string).includes("não possui e-mail cadastrado"),
    );
    expect(noEmailCall).toBeDefined();
    const msg = noEmailCall![1] as string;
    expect(msg).toContain("Carlos Sem Email");
    expect(msg).toContain("#55");
  });

  it("rota retorna 200 — emissão prossegue mesmo sem e-mail cadastrado", async () => {
    const res = await request(buildApp())
      .post("/api/protocols/55/emit-document")
      .set("Authorization", "Bearer fake-token")
      .send({});

    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Bloco 2 — paciente com e-mail: alerta de "sem e-mail" NÃO deve ser disparado
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/protocols/:id/emit-document — paciente com e-mail", () => {
  beforeEach(() => setupFor(CLIENT_COM_EMAIL));

  it("NÃO dispara alerta de 'sem e-mail' quando o paciente tem e-mail", async () => {
    await request(buildApp())
      .post("/api/protocols/55/emit-document")
      .set("Authorization", "Bearer fake-token")
      .send({});

    const noEmailCall = vi.mocked(slackLib.postSlackAlert).mock.calls.find(
      ([_ch, msg]) => (msg as string).includes("não possui e-mail cadastrado"),
    );
    expect(noEmailCall).toBeUndefined();
  });
});
