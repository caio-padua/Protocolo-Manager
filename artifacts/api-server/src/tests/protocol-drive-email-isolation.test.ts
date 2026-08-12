/**
 * protocol-drive-email-isolation.test.ts
 *
 * Confirma que uma falha no bloco de upload ao Google Drive NÃO impede
 * o envio do e-mail ao paciente na rota GET /api/protocols/:id/document-pdf.
 *
 * O fluxo pós-resposta funciona assim (resumido):
 *
 *   res.send(pdfBuffer);  // resposta HTTP já entregue
 *   (async () => {
 *     try { ... Drive protocol PDF ... } catch (e) { ... }
 *     try { ... RAS FAP Drive ...      } catch (e) { ... }
 *     try { ... sendProtocolEmail ...  } catch (e) { ... }
 *   })();
 *
 * Este teste prova que, quando isDriveConnected/uploadToFolderById lançam,
 * o terceiro bloco (email) ainda é executado.
 *
 * Estratégia de teste:
 *   - Todos os módulos externos são mockados via vi.mock (hoisted).
 *   - @workspace/db é simulado por um "thenable chain" que devolve
 *     fixtures por nome de tabela — sem banco de dados real.
 *   - A IIFE roda em background após res.send; usamos vi.waitFor para
 *     aguardar que sendProtocolEmail seja chamado antes de fazer asserções.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mocks ANTES de qualquer import de rota ───────────────────────────────────

vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../middleware/tenantContext", () => ({
  resolveEmpresaId: () => 5,
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// Tabelas com identificador de nome para que o mock de db.select possa
// despachar o resultado correto por tabela.
const makeTable = (name: string) => ({ __mockName: name });

vi.mock("@workspace/db", () => {
  const makeT = (name: string) => ({ __mockName: name });
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
    },
    eq:  vi.fn((col: any, val: any) => ({ col, val })),
    and: vi.fn((...args: any[]) => args),
    inArray: vi.fn((col: any, vals: any[]) => ({ col, vals })),
    protocolsTable:             makeT("protocols"),
    clientsTable:               makeT("clients"),
    professionalsTable:         makeT("professionals"),
    sessionsTable:              makeT("sessions"),
    protocolItemsTable:         makeT("protocol_items"),
    substancesTable:            makeT("substances"),
    substanceApplicationsTable: makeT("substance_applications"),
    paymentsTable:              makeT("payments"),
    assinaturaSolicitacoesTable: makeT("assinatura_solicitacoes"),
    assinaturaTemplatesTable:   makeT("assinatura_templates"),
  };
});

vi.mock("@workspace/api-zod", () => ({
  ListProtocolsQueryParams:    { safeParse: (x: any) => ({ success: true, data: x }) },
  CreateProtocolBody:          { safeParse: (x: any) => ({ success: true, data: x }) },
  GetProtocolParams:           { safeParse: (x: any) => ({ success: true, data: x }) },
  UpdateProtocolParams:        { safeParse: (x: any) => ({ success: true, data: x }) },
  UpdateProtocolBody:          { safeParse: (x: any) => ({ success: true, data: x }) },
  ValidateProtocolParams:      { safeParse: (x: any) => ({ success: true, data: x }) },
  GenerateProtocolICSParams:   { safeParse: (x: any) => ({ success: true, data: x }) },
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
}));

vi.mock("../lib/google-gmail", () => ({
  isGmailConnected: vi.fn(),
}));

vi.mock("../lib/pdf-signer", () => ({
  generateProtocolDocumentPdf: vi.fn(),
  generatePhysicalRASPdf:      vi.fn(),
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
import * as driveLib   from "../lib/google-drive";
import * as emailSvc   from "../lib/email-service";
import * as gmailLib   from "../lib/google-gmail";
import * as pdfSigner  from "../lib/pdf-signer";
import protocolsRouter from "../routes/protocols";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_PROTOCOL = {
  id:               99,
  clientId:         7,
  empresaId:        5,
  professionalId:   null,
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
  status:    "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

// ── Thenable-chain mock para drizzle db.select() ─────────────────────────────
//
// O drizzle usa API fluente: db.select().from(t).where(...).
// Cada intermediário devolve `this`; a cadeia inteira é um thenable
// (tem `.then`) que resolve para `rows` quando aguardada.
//
// Implementação: DbChain é um thenable que armazena as linhas a retornar.
// `from(table)` consulta a tabela por nome e retorna nova chain com as linhas
// corretas. `where/innerJoin/orderBy` passam adiante sem mudar as linhas.

class DbChain {
  constructor(private rows: any[]) {}

  // Thenable: quando a chain é `await`ed, resolve com `this.rows`.
  then(
    onFulfilled: (value: any[]) => any,
    onRejected?: (reason: any) => any,
  ) {
    return Promise.resolve(this.rows).then(onFulfilled, onRejected);
  }

  from(table: any): DbChain {
    const name: string = table?.__mockName ?? "";
    switch (name) {
      case "protocols":    return new DbChain([FAKE_PROTOCOL]);
      case "clients":      return new DbChain([FAKE_CLIENT]);
      // professionals: null professionalId → a rota busca "allProfs" sem where
      case "professionals": return new DbChain([]);
      case "protocol_items": return new DbChain([]);
      case "substances":   return new DbChain([]);
      case "sessions":     return new DbChain([]);
      case "substance_applications": return new DbChain([]);
      case "payments":     return new DbChain([]);
      case "assinatura_solicitacoes": return new DbChain([]);
      case "assinatura_templates":    return new DbChain([]);
      default:             return new DbChain([]);
    }
  }

  // Todos os modificadores encadeáveis preservam as linhas.
  where(..._args: any[]): DbChain  { return this; }
  innerJoin(..._args: any[]): DbChain { return this; }
  orderBy(..._args: any[]): DbChain { return this; }
  limit(..._args: any[]): DbChain  { return this; }
  // Quando from() recebe campo projetado ({campo: tabela.campo}) devolvemos a chain.
  select(..._args: any[]): DbChain { return this; }
}

// ── App Express de teste ──────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", protocolsRouter);
  return app;
}

// ── Configuração comum de mocks para o caminho feliz do Drive + falha ────────

function setupMocks({
  driveConnected      = true,
  driveUploadThrows   = false,
  gmailConnected      = true,
  emailSuccess        = true,
}: {
  driveConnected?:    boolean;
  driveUploadThrows?: boolean;
  gmailConnected?:    boolean;
  emailSuccess?:      boolean;
} = {}) {
  // db.select() devolve o thenable-chain raiz (sem tabela ainda).
  vi.mocked(db.select).mockReturnValue(new DbChain([]) as any);

  // PDF gerado corretamente.
  vi.mocked(pdfSigner.generateProtocolDocumentPdf).mockResolvedValue({
    pdfBytes: FAKE_PDF_BYTES,
  } as any);

  // RAS FAP também OK (o Drive é que falha, não o RAS em si).
  vi.mocked(pdfSigner.generatePhysicalRASPdf).mockResolvedValue(
    FAKE_PDF_BYTES as any,
  );

  // Drive: conectado, mas uploads jogam erro.
  vi.mocked(driveLib.isDriveConnected).mockResolvedValue(driveConnected);

  if (driveUploadThrows) {
    vi.mocked(driveLib.uploadToFolderById).mockRejectedValue(
      new Error("Drive quota exceeded"),
    );
    vi.mocked(driveLib.ensureClientFolderStructure).mockRejectedValue(
      new Error("Drive quota exceeded"),
    );
    vi.mocked(driveLib.uploadFileToDrive).mockRejectedValue(
      new Error("Drive quota exceeded"),
    );
  } else {
    vi.mocked(driveLib.uploadToFolderById).mockResolvedValue({ fileId: "abc" } as any);
    vi.mocked(driveLib.ensureClientFolderStructure).mockResolvedValue({
      clientFolderId: "f1",
      subfolders: { PROTOCOLOS: "pf1", EXAMES: "ef1", "FOTO PERFIL": "ff1" },
    } as any);
    vi.mocked(driveLib.uploadFileToDrive).mockResolvedValue({ fileId: "def" } as any);
  }

  // Gmail: conectado.
  vi.mocked(gmailLib.isGmailConnected).mockResolvedValue(gmailConnected);

  // Email: enviado com sucesso.
  vi.mocked(emailSvc.sendProtocolEmail).mockResolvedValue({
    success: emailSuccess,
    messageId: "msg-1",
  } as any);
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("GET /api/protocols/:id/document-pdf — isolamento Drive × e-mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cenário 1: Drive lança → e-mail ainda é enviado
  // ──────────────────────────────────────────────────────────────────────────

  it("chama sendProtocolEmail mesmo quando isDriveConnected/uploadToFolderById lançam", async () => {
    setupMocks({ driveConnected: true, driveUploadThrows: true });

    const app = buildApp();
    // A rota envia o PDF e depois roda a IIFE em background.
    await request(app).get("/api/protocols/99/document-pdf");

    // A IIFE é assíncrona e não bloqueante. Aguardamos sua conclusão.
    await vi.waitFor(
      () => {
        expect(vi.mocked(emailSvc.sendProtocolEmail)).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });

  it("o e-mail é enviado com os dados corretos do protocolo e do cliente", async () => {
    setupMocks({ driveConnected: true, driveUploadThrows: true });

    const app = buildApp();
    await request(app).get("/api/protocols/99/document-pdf");

    await vi.waitFor(
      () => {
        expect(vi.mocked(emailSvc.sendProtocolEmail)).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );

    const [emailArgs] = vi.mocked(emailSvc.sendProtocolEmail).mock.calls;
    expect(emailArgs[0]).toMatchObject({
      clientName:  "Ana Silva",
      clientEmail: "ana@example.com",
    });
  });

  it("o HTTP 200 (PDF) é entregue independentemente da falha no Drive", async () => {
    setupMocks({ driveConnected: true, driveUploadThrows: true });

    const app = buildApp();
    const res = await request(app).get("/api/protocols/99/document-pdf");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/pdf/);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cenário 2: Drive desligado (isDriveConnected = false) → e-mail ainda corre
  // ──────────────────────────────────────────────────────────────────────────

  it("chama sendProtocolEmail quando isDriveConnected retorna false", async () => {
    setupMocks({ driveConnected: false });

    const app = buildApp();
    await request(app).get("/api/protocols/99/document-pdf");

    await vi.waitFor(
      () => {
        expect(vi.mocked(emailSvc.sendProtocolEmail)).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cenário 3: caminho feliz (Drive OK + e-mail OK)
  // ──────────────────────────────────────────────────────────────────────────

  it("no caminho feliz, Drive e e-mail são ambos executados", async () => {
    setupMocks({ driveConnected: true, driveUploadThrows: false });

    const app = buildApp();
    await request(app).get("/api/protocols/99/document-pdf");

    await vi.waitFor(
      () => {
        expect(vi.mocked(emailSvc.sendProtocolEmail)).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );

    // Upload também deve ter sido tentado
    expect(vi.mocked(driveLib.uploadToFolderById)).toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cenário 4: Gmail desligado → sendProtocolEmail NÃO é chamado
  // (prova que o caminho condicional funciona corretamente)
  // ──────────────────────────────────────────────────────────────────────────

  it("NÃO chama sendProtocolEmail quando isGmailConnected retorna false", async () => {
    setupMocks({ driveConnected: true, driveUploadThrows: false, gmailConnected: false });

    const app = buildApp();
    await request(app).get("/api/protocols/99/document-pdf");

    // Aguarda o tempo que a IIFE levaria para terminar normalmente.
    await new Promise(r => setTimeout(r, 200));

    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cenário 5: FAKE_CLIENT sem email → sendProtocolEmail NÃO é chamado
  // ──────────────────────────────────────────────────────────────────────────

  it("NÃO chama sendProtocolEmail quando o cliente não tem e-mail cadastrado", async () => {
    setupMocks({ driveConnected: false, gmailConnected: true });

    // Sobrepõe o db.select para devolver cliente sem e-mail.
    const clientSemEmail = { ...FAKE_CLIENT, email: null };

    vi.mocked(db.select).mockReturnValue(
      new Proxy(new DbChain([]) as any, {
        get(target: any, prop: string) {
          if (prop === "from") {
            return (table: any) => {
              const name: string = table?.__mockName ?? "";
              if (name === "clients") return new DbChain([clientSemEmail]);
              return (target.from as Function).call(target, table);
            };
          }
          return (target as any)[prop];
        },
      }),
    );

    const app = buildApp();
    await request(app).get("/api/protocols/99/document-pdf");

    // Aguarda a IIFE.
    await new Promise(r => setTimeout(r, 200));

    expect(vi.mocked(emailSvc.sendProtocolEmail)).not.toHaveBeenCalled();
  });
});
