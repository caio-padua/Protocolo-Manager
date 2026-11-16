import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  existing: [] as any[],
  inserted: [{ id: 771 }],
  inserts: [] as any[],
  updates: [] as any[],
  scheduled: [] as Array<(...args: any[]) => void>,
}));

vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    select: () => ({
      from: () => ({
        where: async () => state.existing,
      }),
    }),
    insert: () => ({
      values: (values: any) => {
        state.inserts.push(values);
        return { returning: async () => state.inserted };
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: async () => { state.updates.push(values); },
      }),
    }),
    execute: vi.fn(),
  },
}));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn() }));
vi.mock("../lib/exam-file-store", () => ({
  saveInternalCopy: vi.fn(),
  hasInternalCopy: vi.fn().mockResolvedValue(true),
  getInternalCopy: vi.fn(),
}));
vi.mock("../lib/exam-extraction/extract", () => ({
  extractExamFromText: vi.fn(),
}));
vi.mock("../lib/exam-extraction/extract-anthropic", () => ({
  extractExamWithClaude: vi.fn(),
  CLAUDE_MODEL_NAME: "synthetic-claude",
}));
vi.mock("../lib/exam-extraction/extract-openai", () => ({
  extractExamWithOpenAI: vi.fn(),
  OPENAI_MODEL: "synthetic-openai",
}));
vi.mock("../lib/google-drive", () => ({
  ensureClientFolderStructure: vi.fn(),
  uploadFileToDrive: vi.fn(),
  removeDiacritics: (value: string) => value,
  driveDownloadFile: vi.fn(),
  driveListChildren: vi.fn(),
  driveCopyFileInFolder: vi.fn(),
  renameDriveFile: vi.fn(),
}));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: vi.fn() }));
vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/exam-curation-access", () => ({
  protectCurationMutation: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/examR2Storage", () => ({
  mirrorExamToR2: vi.fn(),
  examR2Key: vi.fn(),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { startExamIngestion } from "../routes/exames-lab.js";
import examLabRouter from "../routes/exames-lab.js";
import { extractExamFromText } from "../lib/exam-extraction/extract.js";
import express from "express";
import request from "supertest";

const app = express().use(express.json()).use(examLabRouter);

describe("ingestão sintética e idempotente de exames", () => {
  beforeEach(() => {
    state.existing = [];
    state.inserted = [{ id: 771 }];
    state.inserts = [];
    state.updates = [];
    state.scheduled = [];
    vi.spyOn(globalThis, "setImmediate").mockImplementation(((callback: (...args: any[]) => void) => {
      state.scheduled.push(callback);
      return {} as NodeJS.Immediate;
    }) as typeof setImmediate);
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it("registra um documento sintético e agenda o processamento sem chamar modelos durante o teste", async () => {
    const buffer = Buffer.from("PDF sintético sem dados de clientes");
    const result = await startExamIngestion({
      clientId: 7001,
      buffer,
      fileName: "laudo-sintetico.pdf",
      empresaId: 7002,
    });

    expect(result).toEqual({ documentId: 771, duplicate: false });
    expect(state.inserts[0]).toMatchObject({
      clientId: 7001,
      empresaId: 7002,
      fileName: "laudo-sintetico.pdf",
      status: "processando",
    });
    expect(state.inserts[0].hash).toBe(
      (await import("../lib/exam-extraction/ingestion-policy.js")).hashExamDocument(buffer),
    );
    expect(state.scheduled.length).toBeGreaterThanOrEqual(2);
    expect(extractExamFromText).not.toHaveBeenCalled();
  });

  it("reconhece um documento existente como duplicado sem iniciar nova extração", async () => {
    state.existing = [{ id: 772, status: "recebido" }];
    const result = await startExamIngestion({
      clientId: 7001,
      buffer: Buffer.from("PDF sintético existente"),
      fileName: "laudo-sintetico.pdf",
    });

    expect(result).toEqual({ documentId: 772, duplicate: true });
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
    expect(state.scheduled).toHaveLength(1);
    expect(extractExamFromText).not.toHaveBeenCalled();
  });

  it("permite nova tentativa automática somente para documento marcado com erro", async () => {
    state.existing = [{ id: 773, status: "erro" }];
    const result = await startExamIngestion({
      clientId: 7001,
      buffer: Buffer.from("PDF sintético com falha anterior"),
      fileName: "laudo-sintetico.pdf",
    });

    expect(result).toEqual({ documentId: 773, duplicate: false });
    expect(state.updates).toContainEqual(expect.objectContaining({ status: "processando" }));
    expect(state.scheduled.length).toBeGreaterThanOrEqual(2);
    expect(extractExamFromText).not.toHaveBeenCalled();
  });

  it("bloqueia as duas rotas de reprocessamento antes de consultar ou alterar documentos", async () => {
    const reextract = await request(app).post("/exames-lab/documento/774/reextrair");
    const reprocess = await request(app).post("/exames-lab/reprocessar/774");

    expect(reextract.status).toBe(409);
    expect(reextract.body.code).toBe("EXAM_REPROCESSING_REQUIRES_VERSIONING");
    expect(reprocess.status).toBe(409);
    expect(reprocess.body.code).toBe("EXAM_REPROCESSING_REQUIRES_VERSIONING");
    expect(state.existing).toEqual([]);
    expect(state.updates).toHaveLength(0);
    expect(extractExamFromText).not.toHaveBeenCalled();
  });
});
