import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHash } from "node:crypto";

const mock = vi.hoisted(() => ({
  identity: vi.fn(), send: vi.fn(), selectRows: new Map<unknown, unknown[]>(),
  authorizedPrescription: vi.fn(),
  auditRows: [] as Array<{ id: number; action: string; professionalId: number; detail: Record<string, unknown> }>,
  txAuditQueue: [] as unknown[][], nextId: 900,
}));

vi.mock("@workspace/db", async () => {
  const schema = await import("../../../../lib/db/src/schema");
  function selectRowsFor(table: unknown) {
    const rows = table === schema.collaboratorAuditTable
      ? mock.auditRows
      : mock.selectRows.get(table) ?? [];
    const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows).then(yes, no) };
    for (const method of ["from", "where", "limit", "orderBy"]) chain[method] = () => chain;
    return chain;
  }
  const makeTx = () => ({
    execute: vi.fn().mockResolvedValue(undefined),
    select: () => {
      const rows = mock.txAuditQueue.shift() ?? [];
      const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows).then(yes, no) };
      for (const method of ["from", "where", "limit"]) chain[method] = () => chain;
      return chain;
    },
    insert: () => ({
      values: (values: any[]) => ({
        returning: async () => values.map((value) => {
          const row = { id: mock.nextId++, createdAt: new Date(), ...value };
          mock.auditRows.push(row);
          return { id: row.id, detail: row.detail };
        }),
      }),
    }),
  });
  return {
    ...schema,
    db: {
      select: () => ({ from: (table: unknown) => selectRowsFor(table) }),
      transaction: async (callback: (tx: any) => Promise<unknown>) => callback(makeTx()),
      update: () => ({
        set: (values: any) => ({
          where: async () => {
            const last = mock.auditRows.at(-1);
            if (last) Object.assign(last, values);
          },
        }),
      }),
    },
  };
});

vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (req.get("Authorization") !== "Bearer synthetic-clinician") {
      return res.status(401).json({ error: "Login obrigatório" });
    }
    req.collaborator = { professionalId: 41, role: "executor" };
    next();
  },
}));
vi.mock("../lib/clinical-emitter", async () => {
  const actual = await vi.importActual<any>("../lib/clinical-emitter");
  return { ...actual, resolveClinicalEmitter: mock.identity };
});
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: mock.send }));
vi.mock("../routes/prescription-delivery", () => ({ authorizedPrescription: mock.authorizedPrescription }));

import router, { clinicalDocumentShareRouter } from "../routes/clinical-document-delivery";
import {
  medicalCertificatesTable, clientsTable, examRequestPdfsTable,
  prescriptionsTable, recipesTable, referralsTable,
} from "@workspace/db";
import { ClinicalIdentityError } from "../lib/clinical-emitter";

const app = express().use(express.json())
  .use("/api", clinicalDocumentShareRouter)
  .use("/api", router)
  .use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const auth = { Authorization: "Bearer synthetic-clinician" };
const identity = {
  client: { id: 71, name: "Cliente sintético", email: "cliente@example.invalid", phone: "+5500000000000", cpf: null },
  professional: { id: 41, name: "Médico sintético", crm: "12345", uf: "SP" },
  clinic: { id: 31, empresaId: 21, name: "Clínica sintética" },
  canPrescribe: true, issue: null,
};
const client = {
  id: 71, name: "Cliente sintético", email: "cliente@example.invalid",
  phone: "+5500000000000", telegramChatId: "synthetic-chat", empresaId: 21, locationId: 31,
};
const issued = {
  id: 51, clientId: 71, professionalId: 41, status: "emitted", tipo: "comparecimento",
  pdfData: Buffer.from("PDF CLINICO SINTETICO").toString("base64"),
  fileName: "atestado-sintetico.pdf", emittedAt: new Date("2026-10-30T12:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.selectRows = new Map<unknown, unknown[]>([
    [medicalCertificatesTable, [issued]],
    [clientsTable, [client]],
    [examRequestPdfsTable, [{ id: 61, clientId: 71, professionalId: 41, fileName: "pedido.pdf", pdfData: issued.pdfData }]],
    [recipesTable, [{ id: 81, prescriptionId: 82, fileName: "receita.pdf", title: "Receita original", pdfData: issued.pdfData }]],
    [prescriptionsTable, [{ id: 82, clientId: 71, professionalId: 41, status: "emitted" }]],
    [referralsTable, [{ id: 52, clientId: 71, professionalId: 41, status: "emitted", especialidadeDestino: "Cardiologia",
      pdfData: issued.pdfData, fileName: "encaminhamento.pdf" }]],
  ]);
  mock.auditRows = [];
  mock.txAuditQueue = [[], []];
  mock.nextId = 900;
  mock.identity.mockResolvedValue(identity);
  mock.authorizedPrescription.mockResolvedValue({ pres: { id: 82, clientId: 71 }, identity });
  mock.send.mockImplementation(async (doc: any, _destination: any, channels: string[]) => ({
    resultados: [{ canal: channels[0], sent: true, via: "synthetic-provider", doc }],
  }));
});

describe("reenvio de documentos clínicos, sem contato real com provedores", () => {
  const body = {
    clientId: 71, documentType: "atestado", documentId: 51,
    channels: ["EMAIL"], confirmed: true, operationKey: "7eddfd2f-a0e5-4baf-a290-0d25141238c0",
  };

  it("recusa chamadas anônimas antes de consultar identidade ou enviar", async () => {
    const response = await request(app).post("/api/clinical-documents/resend").send(body);
    expect(response.status).toBe(401);
    expect(mock.identity).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("bloqueia cliente sem vínculo autorizado, sem mensagem externa", async () => {
    mock.identity.mockRejectedValue(new ClinicalIdentityError(403, "Vínculo clínico não autorizado."));
    const response = await request(app).post("/api/clinical-documents/resend").set(auth).send(body);
    expect(response.status).toBe(403);
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("abre internamente o PDF original apenas com autenticação e vínculo clínico", async () => {
    const denied = await request(app).get("/api/clinical-documents/atestado/51/pdf");
    expect(denied.status).toBe(401);
    const response = await request(app).get("/api/clinical-documents/atestado/51/pdf?download=1").set(auth);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.body).toEqual(Buffer.from(issued.pdfData, "base64"));
  });

  it("usa os bytes do PDF já emitido e audita o envio antes do provedor", async () => {
    const response = await request(app).post("/api/clinical-documents/resend").set(auth).send(body);
    expect(response.status).toBe(200);
    expect(mock.send).toHaveBeenCalledTimes(1);
    const sentDoc = mock.send.mock.calls[0][0];
    expect(sentDoc.anexos[0].content).toEqual(Buffer.from(issued.pdfData, "base64"));
    expect(sentDoc.anexos[0].filename).toBe(issued.fileName);
    expect(mock.auditRows[0].detail.state).toBe("provider_accepted");
    expect(mock.auditRows[0].detail.recipientMasked).not.toBe(client.email);
  });

  it("mostra reenvios anteriores sem expor token, chave idempotente ou contato completo", async () => {
    await request(app).post("/api/clinical-documents/resend").set(auth).send(body);
    const response = await request(app).get("/api/clinical-documents/delivery-history/atestado/51").set(auth);
    expect(response.status).toBe(200);
    expect(response.body.deliveries[0]).toMatchObject({
      channel: "EMAIL", state: "provider_accepted", recipientMasked: "c***@example.invalid",
    });
    expect(JSON.stringify(response.body)).not.toContain("operationKey");
    expect(JSON.stringify(response.body)).not.toContain("shareTokenHash");
    expect(JSON.stringify(response.body)).not.toContain(client.email);
  });

  it("bloqueia reenvio quando o resultado anterior está incerto", async () => {
    mock.txAuditQueue = [[], [{ id: 901 }]];
    const response = await request(app).post("/api/clinical-documents/resend").set(auth).send(body);
    expect(response.status).toBe(409);
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.auditRows).toHaveLength(0);
  });

  it.each(["WHATSAPP", "TELEGRAM"])("gera link aleatório de sete dias para %s e serve o PDF original", async (channel) => {
    const response = await request(app).post("/api/clinical-documents/resend").set(auth)
      .send({ ...body, channels: [channel] });
    expect(response.status).toBe(200);
    const sentDoc = mock.send.mock.calls[0][0];
    const match = sentDoc.paragrafos.join("\n").match(/\/api\/clinical-documents\/share\/([A-Za-z0-9_-]{43})/);
    expect(match).not.toBeNull();
    const expiry = Date.parse(String(mock.auditRows[0].detail.expiresAt));
    expect(expiry - Date.now()).toBeGreaterThan(604_799_000);
    expect(expiry - Date.now()).toBeLessThanOrEqual(604_800_000);
    const pdf = await request(app).get(`/api/clinical-documents/share/${match![1]}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["cache-control"]).toContain("no-store");
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body).toEqual(Buffer.from(issued.pdfData, "base64"));
  });

  it("recusa documento de outro cliente ou identidade médica", async () => {
    mock.selectRows.set(medicalCertificatesTable, [{ ...issued, clientId: 999 }]);
    const otherClient = await request(app).post("/api/clinical-documents/resend").set(auth).send(body);
    expect(otherClient.status).toBe(404);
    expect(mock.send).not.toHaveBeenCalled();
    mock.selectRows.set(medicalCertificatesTable, [{ ...issued, professionalId: 999 }]);
    const otherDoctor = await request(app).post("/api/clinical-documents/resend").set(auth)
      .send({ ...body, operationKey: "2f9570bd-14b8-44ae-96f1-d8c73443edc1" });
    expect(otherDoctor.status).toBe(404);
    expect(mock.send).not.toHaveBeenCalled();
  });

  it.each([
    ["pedido_exames", 61, examRequestPdfsTable],
    ["prescricao", 81, recipesTable],
    ["encaminhamento", 52, referralsTable],
  ] as const)("permite reenvio autorizado do PDF original de %s", async (documentType, documentId, table) => {
    const response = await request(app).post("/api/clinical-documents/resend").set(auth).send({
      ...body, documentType, documentId, channels: ["EMAIL"],
      operationKey: `${documentId.toString().padStart(8, "0")}-a0e5-4baf-a290-0d25141238c0`,
    });
    expect(response.status).toBe(200);
    expect(mock.send).toHaveBeenCalledTimes(1);
    expect(mock.send.mock.calls[0][0].anexos[0].content).toEqual(Buffer.from(issued.pdfData, "base64"));
    expect(mock.selectRows.has(table)).toBe(true);
  });

  it("não oferece contatos enviados pelo navegador como destinos confiáveis", async () => {
    const response = await request(app).get("/api/clinical-documents/delivery-targets/71")
      .set(auth).query({ email: "attacker@example.invalid" });
    expect(response.status).toBe(200);
    expect(response.body.targets).toEqual([
      { channel: "EMAIL", recipient: client.email },
      { channel: "WHATSAPP", recipient: client.phone },
      { channel: "TELEGRAM", recipient: client.telegramChatId },
    ]);
  });

  it("recusa link expirado ou sem reenvio aceito pelo provedor", async () => {
    const token = "b".repeat(43);
    const staleHash = createHash("sha256").update(token).digest("hex");
    mock.auditRows.push({
      id: 901, action: "clinical_document_resend", professionalId: 41,
      detail: { shareTokenHash: staleHash, expiresAt: "2020-01-01T00:00:00.000Z", state: "provider_accepted",
        documentType: "atestado", documentId: 51, clientId: 71 },
    });
    const response = await request(app).get(`/api/clinical-documents/share/${token}`);
    expect(response.status).toBe(404);
  });
});
