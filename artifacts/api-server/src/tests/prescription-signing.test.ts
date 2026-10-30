import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
import request from "supertest";
import { isolatedPostgres } from "./helpers/isolated-postgres";

const mock = vi.hoisted(() => ({
  getJson: vi.fn(), getSecret: vi.fn(), read: vi.fn(), globalBuffer: vi.fn(), globalPasswords: vi.fn(),
  rows: [] as any[][], execute: vi.fn(), upload: vi.fn(), email: vi.fn(), insert: vi.fn(),
  transaction: vi.fn(), sendPaxter: vi.fn(), update: vi.fn(), motor: vi.fn(), useMotorMock: false, reminder: vi.fn(),
  realDb: null as any, syntheticResolver: null as any, realRecipePdf: null as any,
  recipePdfCallCount: 0, failOnRecipePdfCall: null as number | null, useHomologationNotice: false,
}));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    select: (...args: any[]) => mock.realDb
      ? mock.realDb.select(...args)
      : ({ from: () => {
        const rows = mock.rows.shift() ?? [];
        const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows).then(yes, no) };
        chain.where = () => chain; chain.limit = async () => rows;
        return chain;
      } }),
    execute: (...args: any[]) => mock.realDb ? mock.realDb.execute(...args) : mock.execute(...args),
    insert: (...args: any[]) => mock.realDb ? mock.realDb.insert(...args) : mock.insert(...args),
    update: (...args: any[]) => mock.realDb ? mock.realDb.update(...args) : mock.update(...args),
    transaction: (...args: any[]) => mock.realDb ? mock.realDb.transaction(...args) : mock.transaction(...args),
  },
}));
vi.mock("../lib/clinical-emitter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/clinical-emitter")>();
  return {
    ...actual,
    resolveClinicalEmitter: (...args: any[]) => mock.syntheticResolver
      ? mock.syntheticResolver(...args)
      : Reflect.apply(actual.resolveClinicalEmitter, actual, args),
  };
});
vi.mock("../lib/prescription-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/prescription-pdf")>();
  mock.realRecipePdf = actual.generateRecipePdf;
  return {
    ...actual,
    generateRecipePdf: (...args: any[]) => {
      mock.recipePdfCallCount += 1;
      if (mock.failOnRecipePdfCall === mock.recipePdfCallCount) {
        throw new Error("Falha sintética na geração do PDF");
      }
      const [plan, context] = args;
      return mock.realRecipePdf(
        plan,
        mock.useHomologationNotice ? { ...context, homologationNotice: true } : context,
      );
    },
  };
});
vi.mock("../lib/secure-settings", () => ({ getJsonSetting: mock.getJson, getSecret: mock.getSecret }));
vi.mock("../lib/cert-source", () => ({ getCertBufferSync: mock.globalBuffer, getCertPasswordsSync: mock.globalPasswords }));
vi.mock("../lib/objectStorage", () => ({ ObjectStorageService: class { readPrivateObject = mock.read; } }));
vi.mock("../lib/google-drive", () => ({
  uploadToFolderById: mock.upload, ensurePharmacyDayFolder: mock.upload, uploadFileToDrive: mock.upload,
}));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: mock.email }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: mock.sendPaxter }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: mock.sendPaxter }));
vi.mock("../lib/telegram", () => ({ sendTelegram: mock.sendPaxter }));
vi.mock("../lib/sncr-alerts", () => ({ handleSncrAlert: mock.sendPaxter }));
vi.mock("../lib/receituario-motor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/receituario-motor.js")>();
  return {
    ...actual,
    emitirReceituarioPdf: (...args: any[]) => mock.useMotorMock
      ? mock.motor(...args)
      : Reflect.apply(actual.emitirReceituarioPdf, actual, args),
  };
});
vi.mock("../lib/lembrete-periodo", () => ({ sincronizarLembretePrescricao: mock.reminder }));
vi.mock("../lib/lembrete-templates", () => ({ templateLembretePrescricao: mock.sendPaxter }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: mock.sendPaxter }));
vi.mock("../lib/messaging/base-url.js", () => ({ baseUrlFromEnv: () => "" }));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: any, _s: any, next: any) => next() }));
vi.mock("../lib/receituario-worker", () => ({ liberarSlot: vi.fn(), processarReceituarioDiario: vi.fn() }));
import { inspectPrescriptionCertificate, resolvePrescriptionSigner, signPrescriptionPdf,
  signExistingPrescriptionPdf, validatePrescriptionCertificate, type PrescriptionIdentity } from "../lib/prescription-signing";
import { generatePdfFromPngBase64, generateReceituarioPdfV2, generateReceituarioPdf } from "../lib/receituario-pdf";
import { ClinicalIdentityError, validateClinicalIdentity } from "../lib/clinical-emitter";
import prescriptionRouter from "../routes/receituario";
import examRequestRouter from "../routes/exam-requests";
import prescriptionsRouter from "../routes/prescriptions";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import * as schema from "../../../../lib/db/src/schema";
import { examRequestPdfsTable } from "../../../../lib/db/src/schema/exam-requests";
import { clientsTable, prescriptionsTable, prescriptionItemsTable, recipesTable } from "../../../../lib/db/src/schema";

const identity: PrescriptionIdentity = {
  professional: { id: 41, name: "MEDICO SINTETICO", cpf: "12345678901", crm: "12345", uf: "SP" },
  client: { id: 71, name: "CLIENTE SINTETICO", cpf: "00000000000", email: null, phone: null, birthDate: null },
  clinic: { id: 31, name: "CLINICA SINTETICA", empresaId: 21 }, canPrescribe: true, issue: null,
};
const password = "synthetic-test-only";
let pfx: Buffer;
let cert: forge.pki.Certificate;
let key: forge.pki.rsa.PrivateKey;
let postgres: Awaited<ReturnType<typeof isolatedPostgres>>;
function pack(c = cert, k = key) {
  return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(k, [c], password, { algorithm: "3des" })).getBytes(), "binary");
}
beforeAll(async () => {
  const pair = forge.pki.rsa.generateKeyPair(2048);
  key = pair.privateKey;
  cert = forge.pki.createCertificate();
  cert.publicKey = pair.publicKey;
  cert.serialNumber = "012345";
  cert.validity.notBefore = new Date("2020-01-01");
  cert.validity.notAfter = new Date("2040-01-01");
  cert.setSubject([{ name: "commonName", value: "MEDICO SINTETICO:12345678901" }]);
  cert.setIssuer(cert.subject.attributes);
  cert.setExtensions([{ name: "basicConstraints", cA: false }, { name: "keyUsage", digitalSignature: true }]);
  cert.sign(key, forge.md.sha256.create());
  pfx = pack();
  postgres = await isolatedPostgres();
  await postgres.execute(sql`CREATE TABLE exam_request_pdfs (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL,
    professional_id INTEGER,
    tipo TEXT NOT NULL,
    file_name TEXT NOT NULL,
    exam_count INTEGER NOT NULL DEFAULT 0,
    observacao TEXT,
    pdf_data TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await postgres.pool.query(`CREATE TABLE clients (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, cpf TEXT, email TEXT, phone TEXT,
    status TEXT NOT NULL DEFAULT 'active', location_id INTEGER, empresa_id INTEGER
  )`);
  await postgres.pool.query(`CREATE TABLE synthetic_professionals (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, cpf TEXT NOT NULL, crm TEXT NOT NULL,
    uf TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true
  )`);
  await postgres.pool.query(`CREATE TABLE synthetic_clinics (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, empresa_id INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true
  )`);
  await postgres.pool.query(`CREATE TABLE synthetic_clinic_professionals (
    professional_id INTEGER NOT NULL, clinic_id INTEGER NOT NULL,
    PRIMARY KEY (professional_id, clinic_id)
  )`);
  await postgres.pool.query(`CREATE TABLE locations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, active TEXT NOT NULL, empresa_id INTEGER NOT NULL
  )`);
  await postgres.pool.query(`CREATE TABLE location_professionals (
    location_id INTEGER NOT NULL, professional_id INTEGER NOT NULL
  )`);
  await postgres.pool.query(`CREATE TABLE professionals (
    id INTEGER PRIMARY KEY, active BOOLEAN NOT NULL, professional_type TEXT NOT NULL
  )`);
  await postgres.pool.query(`CREATE TABLE prescriptions (
    id SERIAL PRIMARY KEY, client_id INTEGER, client_name TEXT NOT NULL, client_cpf TEXT,
    client_phone TEXT, client_email TEXT, professional_id INTEGER, professional_name TEXT,
    professional_crm TEXT, professional_uf TEXT, duration_days TEXT, cid TEXT, message TEXT,
    status TEXT NOT NULL DEFAULT 'draft', empresa_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), emitted_at TIMESTAMPTZ
  )`);
  await postgres.pool.query(`CREATE TABLE prescription_items (
    id SERIAL PRIMARY KEY, prescription_id INTEGER NOT NULL, order_index INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL, ativos TEXT, posologia TEXT, dose TEXT, via TEXT, frequencia TEXT,
    periodo TEXT, observacao TEXT, category TEXT, internal_color TEXT,
    is_controlled BOOLEAN NOT NULL DEFAULT false, anvisa_type TEXT, pharmacy_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await postgres.pool.query(`CREATE TABLE recipes (
    id SERIAL PRIMARY KEY, prescription_id INTEGER NOT NULL, pharmacy_id INTEGER,
    recipe_type TEXT NOT NULL, anvisa_type TEXT, anvisa_color TEXT, anvisa_color_name TEXT,
    sncr_number TEXT, sncr_range_id INTEGER, sncr_status TEXT, title TEXT, items_json JSONB,
    drive_file_id TEXT, drive_web_view_link TEXT, file_name TEXT, pdf_data TEXT, batch_date TEXT,
    email_sent_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'generated',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await postgres.pool.query(`CREATE TABLE pharmacies (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'farma.manip',
    cnpj TEXT, phone TEXT, email TEXT, whatsapp TEXT, notes TEXT,
    controlled_types TEXT[] NOT NULL DEFAULT '{}', drive_folder_id TEXT,
    active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}, 30_000);
afterAll(async () => { await postgres?.stop(); });
beforeEach(() => {
  vi.clearAllMocks();
  mock.getJson.mockResolvedValue(null);
  mock.globalBuffer.mockReturnValue(pfx);
  mock.globalPasswords.mockReturnValue([password]);
  mock.realDb = null;
  mock.syntheticResolver = null;
  mock.useMotorMock = false;
  mock.useHomologationNotice = false;
  mock.recipePdfCallCount = 0;
  mock.failOnRecipePdfCall = null;
  mock.rows = [];
  mock.execute.mockResolvedValue({ rows: [{ id: 2, tipo: "classico_anvisa", nome: "SINTETICO", config: {} }] });
  mock.insert.mockImplementation(() => { throw new Error("Persistencia de teste sem PostgreSQL isolado"); });
  mock.transaction.mockImplementation(() => { throw new Error("Transacao sintetica sem PostgreSQL isolado"); });
});

function queueExamIdentity(clientId: number, clientName: string) {
  mock.rows.push(
    [{ id: 41, name: identity.professional.name, cpf: identity.professional.cpf, active: true,
      professionalType: "medico", crm: "12345", registrationNumber: null, registrationCouncil: "CRM/SP" }],
    [{ ...identity.client, id: clientId, name: clientName, status: "active", locationId: 31, empresaId: 21 }],
    [{ ...identity.clinic, active: "true" }],
    [{ id: 1, professionalId: 41, locationId: 31 }],
  );
}

function useIsolatedExamStore(persisted: any[], failAtInsert?: number) {
  let insertCount = 0;
  mock.transaction.mockImplementation((callback: (tx: any) => Promise<any>) => postgres.transaction((connection) => (
    callback({
      insert: (table: any) => ({
        values: (values: any) => ({
          returning: async () => {
            expect(table).toBe(examRequestPdfsTable);
            insertCount++;
            if (insertCount === failAtInsert) throw new Error("Falha sintetica de persistencia");
            persisted.push(values);
            const result = await connection.execute(sql`
              INSERT INTO exam_request_pdfs
                (token, client_id, professional_id, tipo, file_name, exam_count, observacao, pdf_data)
              VALUES
                (${values.token}, ${values.clientId}, ${values.professionalId}, ${values.tipo},
                 ${values.fileName}, ${values.examCount}, ${values.observacao}, ${values.pdfData})
              RETURNING id
            `);
            return result.rows;
          },
        }),
      }),
    })
  )));
  return () => insertCount;
}

it("emite e recupera pedidos sinteticos assinados para dois clientes em PostgreSQL descartavel", async () => {
  const app = express().use(express.json()).use("/api", examRequestRouter);
  const authorization = `Bearer ${createCollaboratorToken({ professionalId: 41, role: "executor" })}`;
  const persisted: any[] = [];
  useIsolatedExamStore(persisted);

  const disclaimer = "HOMOLOGACAO - DOCUMENTO DE TESTE - SEM VALIDADE CLINICA";
  const patients = [
    { id: 71, name: "CLIENTE MODELO A" },
    { id: 72, name: "CLIENTE MODELO B" },
  ];
  let expectedPdfCount = 0;

  for (const patient of patients) {
    const operations = [
      { tipo: "SANGUE", count: 4, expectedFiles: 1 },
      { tipo: "IMAGEM", count: 3, expectedFiles: 3 },
      { tipo: "IMAGEM", count: 2, expectedFiles: 2 },
    ] as const;

    for (const [operationIndex, operation] of operations.entries()) {
      queueExamIdentity(patient.id, patient.name);
      const response = await request(app).post("/api/exam-requests/emit").set("Authorization", authorization).send({
        clientId: patient.id,
        observacao: disclaimer,
        items: Array.from({ length: operation.count }, (_, index) => ({
          nomeExame: `EXAME SINTETICO ${patient.id}-${operationIndex + 1}-${index + 1}`,
          tipo: operation.tipo,
        })),
      });

      expect(response.status).toBe(200);
      expect(response.body.pdfs).toHaveLength(operation.expectedFiles);
      expect(response.body.pdfs.map((pdf: any) => pdf.examCount)).toEqual(
        operation.tipo === "SANGUE"
          ? [4]
          : Array.from({ length: operation.expectedFiles }, () => 1),
      );
      expectedPdfCount += operation.expectedFiles;

      for (const emitted of response.body.pdfs) {
        const [stored] = (await postgres.execute(sql`
          SELECT id, token, client_id, professional_id, file_name, pdf_data
          FROM exam_request_pdfs
          WHERE id = ${emitted.id}
        `)).rows;
        expect(stored).toBeTruthy();
        expect(stored.client_id).toBe(patient.id);
        expect(stored.professional_id).toBe(41);
        expect(persisted.find((row) => row.token === stored.token)?.observacao).toBe(disclaimer);

        // Exercise the same read route a patient receives, using only the
        // synthetic row just written to the disposable PostgreSQL instance.
        mock.rows = [[{
          token: stored.token,
          pdfData: stored.pdf_data,
          fileName: stored.file_name,
        }]];
        const download = await request(app).get(`/api/exam-requests/file/${stored.token}`);
        expect(download.status).toBe(200);
        const bytes = Buffer.from(download.body);
        expect(bytes.toString("base64")).toBe(stored.pdf_data);
        verify(bytes);
        const signedPdf = await PDFDocument.load(bytes);
        expect(signedPdf.getAuthor()).toBe(identity.professional.name);
        expect(signedPdf.getSubject()).toBe(
          `Solicitacao de exames;medico=41;cliente=${patient.id};clinica=31;empresa=21`,
        );
      }
    }
  }

  expect(expectedPdfCount).toBe(12);
  expect(persisted).toHaveLength(12);
  expect(mock.sendPaxter).not.toHaveBeenCalled();
  expect(mock.email).not.toHaveBeenCalled();
  expect(mock.upload).not.toHaveBeenCalled();
}, 120_000);

it("reverte todo o lote se uma gravacao de PDF falhar", async () => {
  const app = express().use(express.json()).use("/api", examRequestRouter);
  const authorization = `Bearer ${createCollaboratorToken({ professionalId: 41, role: "executor" })}`;
  const persisted: any[] = [];
  const attempts = useIsolatedExamStore(persisted, 2);
  queueExamIdentity(71, "CLIENTE MODELO");
  const before = await postgres.execute(sql`SELECT count(*)::int AS total FROM exam_request_pdfs`);
  const totalBefore = before.rows[0].total;

  const response = await request(app).post("/api/exam-requests/emit").set("Authorization", authorization).send({
    clientId: 71,
    items: [
      { nomeExame: "IMAGEM SINTETICA A", tipo: "IMAGEM" },
      { nomeExame: "IMAGEM SINTETICA B", tipo: "IMAGEM" },
      { nomeExame: "IMAGEM SINTETICA C", tipo: "IMAGEM" },
    ],
  });

  expect(response.status).toBe(500);
  expect(attempts()).toBe(2);
  const count = await postgres.execute(sql`SELECT count(*)::int AS total FROM exam_request_pdfs`);
  expect(count.rows[0].total).toBe(totalBefore);
  expect(persisted).toHaveLength(1);
  expect(mock.sendPaxter).not.toHaveBeenCalled();
}, 30_000);

it("bloqueia pedido entre clinicas antes de assinar ou persistir", async () => {
  const app = express().use(express.json()).use("/api", examRequestRouter);
  const authorization = `Bearer ${createCollaboratorToken({ professionalId: 41, role: "executor" })}`;
  mock.rows = [
    [{ id: 41, name: identity.professional.name, cpf: identity.professional.cpf, active: true,
      professionalType: "medico", crm: "12345", uf: "SP" }],
    [{ ...identity.client, id: 72, name: "CLIENTE DE OUTRA CLINICA", status: "active", locationId: 32, empresaId: 22 }],
    [{ id: 32, name: "OUTRA CLINICA", empresaId: 22, active: "true" }],
    [],
  ];

  const response = await request(app).post("/api/exam-requests/emit").set("Authorization", authorization).send({
    clientId: 72,
    items: [{ nomeExame: "EXAME SINTETICO", tipo: "SANGUE" }],
  });

  expect(response.status).toBe(403);
  expect(mock.insert).not.toHaveBeenCalled();
  expect(mock.sendPaxter).not.toHaveBeenCalled();
});

it("bloqueia pedido sem certificado valido antes de persistir", async () => {
  const app = express().use(express.json()).use("/api", examRequestRouter);
  const authorization = `Bearer ${createCollaboratorToken({ professionalId: 41, role: "executor" })}`;
  queueExamIdentity(71, "CLIENTE MODELO");
  mock.globalBuffer.mockReturnValue(Buffer.from("CERTIFICADO INVALIDO DE TESTE"));

  const response = await request(app).post("/api/exam-requests/emit").set("Authorization", authorization).send({
    clientId: 71,
    items: [{ nomeExame: "EXAME SINTETICO", tipo: "SANGUE" }],
  });

  expect(response.status).toBe(422);
  expect(mock.insert).not.toHaveBeenCalled();
  expect(mock.sendPaxter).not.toHaveBeenCalled();
});

function verify(bytes: Uint8Array, tamper = false) {
  const pdf = Buffer.from(bytes);
  const text = pdf.toString("latin1");
  const match = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text)!;
  expect(match).not.toBeNull();
  const [start, length, secondStart, secondLength] = match.slice(1).map(Number);
  expect(start).toBe(0);
  expect(secondStart + secondLength).toBe(pdf.length);
  expect(text.slice(length, secondStart)).toMatch(/^<[0-9a-f]+>$/i);
  const cms = Buffer.from(text.slice(length + 1, secondStart - 1), "hex");
  const octets = cms[1] & 0x7f;
  const header = cms[1] < 128 ? 2 : 2 + octets;
  const size = cms[1] < 128 ? cms[1] : cms.readUIntBE(2, octets);
  const der = cms.subarray(0, header + size);
  const signedContent = Buffer.concat([pdf.subarray(0, length), pdf.subarray(secondStart)]);
  if (tamper) signedContent[1] ^= 1;
  const dir = mkdtempSync(join(tmpdir(), "synthetic-recipe-"));
  try {
    writeFileSync(join(dir, "cms.der"), der);
    writeFileSync(join(dir, "content.bin"), signedContent);
    execFileSync("openssl", ["cms", "-verify", "-binary", "-inform", "DER",
      "-in", join(dir, "cms.der"), "-content", join(dir, "content.bin"), "-noverify",
      "-signer", join(dir, "signer.pem"), "-out", "/dev/null"], { stdio: "pipe" });
    const actual = forge.pki.certificateFromPem(readFileSync(join(dir, "signer.pem"), "utf8"));
    expect(actual.serialNumber).toBe(cert.serialNumber);
    expect(actual.subject.getField("CN").value).toBe("MEDICO SINTETICO:12345678901");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("certificado por médico, sem acesso a certificados reais", () => {
  it("rota HTTP real gera assinatura válida para identidade autorizada sem enviar nem subir arquivos", async () => {
    mock.rows = [
      [{ id: 41, name: identity.professional.name, cpf: identity.professional.cpf, active: true,
        professionalType: "medico", crm: "CRM/SP 12345" }],
      [{ ...identity.client, status: "active", locationId: 31, empresaId: 21 }],
      [{ ...identity.clinic, active: "true" }], [{ id: 1 }],
      [{ id: 41, name: identity.professional.name }], [{ id: 31, name: identity.clinic.name }],
    ];
    const app = express().use(express.json()).use((req, _res, next) => {
      req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any; next();
    }).use(prescriptionRouter);
    const token = createCollaboratorToken({ professionalId: 41, role: "executor" });
    const response = await request(app).post("/receituario/assinar-imagem-pdf")
      .set("Authorization", `Bearer ${token}`).send({
        clientId: 71, formulas: [{ nome: "FORMULA SINTETICA", posologia: "TESTE SEM VALIDADE" }],
      });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    verify(Buffer.from(response.body.pdfBase64, "base64"));
    expect(response.body.emailSent).toBe(false);
    expect(mock.email).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("verifica CMS/ByteRange e vínculo assinado, e detecta adulteração", async () => {
    const signer = validatePrescriptionCertificate(pfx, password, identity);
    const doc = await PDFDocument.create();
    doc.addPage().drawText("DOCUMENTO SINTETICO SEM VALIDADE");
    const bytes = await signPrescriptionPdf(doc, signer);
    verify(bytes);
    expect(() => verify(bytes, true)).toThrow();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getAuthor()).toBe(identity.professional.name);
    expect(loaded.getSubject()).toContain("medico=41;cliente=71;clinica=31;empresa=21");
  });
  it("assina bytes do gerador regulatório sem devolver o PDF original não assinado", async () => {
    const signer = validatePrescriptionCertificate(pfx, password, identity);
    const doc = await PDFDocument.create();
    doc.addPage().drawText("RECEITA REGULATORIA SINTETICA");
    const unsigned = await doc.save();
    const signed = await signExistingPrescriptionPdf(unsigned, signer);
    expect(Buffer.from(signed).equals(Buffer.from(unsigned))).toBe(false);
    verify(signed);
  });
  it("assina motor PNG e motor ANVISA com o mesmo titular validado", async () => {
    const signer = validatePrescriptionCertificate(pfx, password, identity);
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nCkAAAAASUVORK5CYII=";
    verify(await generatePdfFromPngBase64(png, signer));
    verify(await generateReceituarioPdfV2({
      medicoName: identity.professional.name, medicoCrm: "CRM/SP 12345", clinicaNome: identity.clinic.name,
      pacienteNome: identity.client.name, formulas: [{ nome: "FORMULA SINTETICA", posologia: "TESTE" }],
      dataEmissao: "2026-10-29",
    }, signer));
  });
  it("rejeita senha, arquivo, CPF divergente/ausente, certificado vencido/futuro e chave divergente", () => {
    expect(() => inspectPrescriptionCertificate(pfx, "wrong", identity.professional.cpf)).toThrow(/inválido/);
    expect(() => inspectPrescriptionCertificate(Buffer.from("not-pfx"), password, identity.professional.cpf)).toThrow();
    expect(() => inspectPrescriptionCertificate(pfx, password, "99999999999")).toThrow(/CPF/);
    expect(() => inspectPrescriptionCertificate(pfx, password, null)).toThrow(/CPF/);
    expect(() => inspectPrescriptionCertificate(pfx, password, identity.professional.cpf, new Date("2050-01-01"))).toThrow(/validade/);
    expect(() => inspectPrescriptionCertificate(pfx, password, identity.professional.cpf, new Date("2010-01-01"))).toThrow(/validade/);
    const otherKey = forge.pki.rsa.generateKeyPair(1024).privateKey;
    expect(() => inspectPrescriptionCertificate(pack(cert, otherKey), password, identity.professional.cpf)).toThrow(/chave/);
    const saved = cert.subject.attributes;
    cert.setSubject([{ name: "commonName", value: "SEM CPF" }]); cert.sign(key);
    expect(() => inspectPrescriptionCertificate(pack(), password, identity.professional.cpf)).toThrow(/CPF/);
    cert.setSubject(saved); cert.sign(key, forge.md.sha256.create());
  });
  it("prioriza o certificado específico e não usa global após falha no cofre", async () => {
    mock.getJson.mockResolvedValue({ objectPath: "certs/pfx/synthetic.pfx" });
    mock.getSecret.mockResolvedValue(password);
    mock.read.mockResolvedValue(pfx);
    expect((await resolvePrescriptionSigner(identity)).meta.cpf).toBe("12345678901");
    expect(mock.getJson).toHaveBeenCalledWith("certificate.professional.41.meta");
    expect(mock.globalBuffer).not.toHaveBeenCalled();
    mock.read.mockRejectedValue(new Error("unavailable"));
    await expect(resolvePrescriptionSigner(identity)).rejects.toThrow(/indisponível/);
    expect(mock.globalBuffer).not.toHaveBeenCalled();
  });
  it("global só pode ser usado pelo titular e ausência falha explicitamente", async () => {
    await expect(resolvePrescriptionSigner(identity)).resolves.toHaveProperty("meta.serial");
    await expect(resolvePrescriptionSigner({ ...identity,
      professional: { ...identity.professional, cpf: "99999999999" } })).rejects.toThrow(/CPF/);
    mock.globalBuffer.mockImplementation(() => { throw new Error("absent"); });
    await expect(resolvePrescriptionSigner(identity)).rejects.toThrow(/indisponível/);
  });
  it("nenhum gerador devolve PDF sem assinatura quando falta contexto", async () => {
    await expect(generatePdfFromPngBase64("invalid")).rejects.toThrow(/autorizados/);
    await expect(generateReceituarioPdfV2({} as any)).rejects.toThrow(/autorizados/);
    await expect(generateReceituarioPdf({} as any)).rejects.toThrow(/autorizados/);
    await expect(signPrescriptionPdf(await PDFDocument.create(), {} as any)).rejects.toThrow(/autorizados/);
  });
  it("bloqueia médico inativo/não médico, clínica divergente e ausência de vínculo", () => {
    const prof = { id: 41, active: true, professionalType: "medico", crm: "CRM/SP 12345" } as any;
    const client = { id: 71, status: "active", empresaId: 21, locationId: 31 } as any;
    const location = { id: 31, empresaId: 21, active: "true" } as any;
    for (const input of [
      { professional: { ...prof, active: false }, client, location, linked: true },
      { professional: { ...prof, professionalType: "enfermeiro" }, client, location, linked: true },
      { professional: prof, client, location: { ...location, empresaId: 99 }, linked: true },
      { professional: prof, client, location, linked: false },
    ]) expect(() => validateClinicalIdentity(input)).toThrow();
  });

  it("emite seis PDFs sintéticos, persiste e reabre o histórico sem efeitos externos", async () => {
    mock.realDb = drizzle(postgres.pool, { schema });
    const database = mock.realDb;
    await postgres.pool.query(
      `INSERT INTO synthetic_professionals (id, name, cpf, crm, uf) VALUES (41, $1, $2, '00000', 'SP')`,
      [identity.professional.name, identity.professional.cpf],
    );
    await postgres.pool.query(
      `INSERT INTO synthetic_clinics (id, name, empresa_id) VALUES (31, 'CLINICA SINTETICA', 21), (32, 'CLINICA EXTERNA SINTETICA', 22)`,
    );
    await postgres.pool.query(
      `INSERT INTO synthetic_clinic_professionals (professional_id, clinic_id) VALUES (41, 31)`,
    );
    await postgres.pool.query(
      `INSERT INTO locations (id, name, active, empresa_id)
       VALUES (31, 'CLINICA SINTETICA', 'true', 21), (32, 'CLINICA EXTERNA SINTETICA', 'true', 22)`,
    );
    await postgres.pool.query(
      `INSERT INTO location_professionals (location_id, professional_id) VALUES (31, 41)`,
    );
    await postgres.pool.query(
      `INSERT INTO professionals (id, active, professional_type) VALUES (41, true, 'medico')`,
    );

    const patientsResult = await postgres.pool.query(
      `INSERT INTO clients (name, cpf, status, location_id, empresa_id)
       VALUES ($1, '00000000000', 'active', 31, 21),
              ($2, '00000000000', 'active', 31, 21),
              ('CLIENTE EXTERNO SINTETICO', '00000000000', 'active', 32, 22)
       RETURNING id, name`,
      ["Carlúcia Santos Fernandes", "Dayana Ludman"],
    );
    const [carlucia, dayana, externalClient] = patientsResult.rows;

    mock.syntheticResolver = async (req: any, requestedClientId: number) => {
      const professionalResult = await postgres.pool.query(
        "SELECT * FROM synthetic_professionals WHERE id = $1 AND active = true",
        [req.collaborator?.professionalId],
      );
      const clientResult = await postgres.pool.query(
        "SELECT * FROM clients WHERE id = $1 AND status = 'active'",
        [requestedClientId],
      );
      const professional = professionalResult.rows[0];
      const client = clientResult.rows[0];
      const clinicResult = client
        ? await postgres.pool.query("SELECT * FROM synthetic_clinics WHERE id = $1 AND active = true", [client.location_id])
        : { rows: [] };
      const clinic = clinicResult.rows[0];
      const membership = clinic
        ? await postgres.pool.query(
          "SELECT 1 FROM synthetic_clinic_professionals WHERE professional_id = $1 AND clinic_id = $2",
          [professional?.id, clinic.id],
        )
        : { rows: [] };

      if (!professional || !client || !clinic || !membership.rows.length || clinic.empresa_id !== client.empresa_id) {
        throw new ClinicalIdentityError(403, "Cliente fora da clínica sintética autorizada.");
      }
      return {
        professional: {
          id: professional.id, name: professional.name, cpf: professional.cpf,
          crm: professional.crm, uf: professional.uf,
        },
        client: {
          id: client.id, name: client.name, cpf: client.cpf, email: client.email,
          phone: client.phone, birthDate: null, locationId: client.location_id, empresaId: client.empresa_id,
        },
        clinic: { id: clinic.id, name: clinic.name, empresaId: clinic.empresa_id, active: "true" },
        canPrescribe: true,
        issue: null,
      };
    };

    mock.motor.mockResolvedValue({
      fileName: "COPIA-SINTETICA.pdf", driveUrl: null, emailSent: false,
      modeloUsado: "SINTETICO", tipoMotor: "TESTE",
    });
    mock.useMotorMock = true;
    mock.useHomologationNotice = true;
    mock.reminder.mockResolvedValue(undefined);
    const app = express()
      .use(express.json())
      .use((req: any, _res: any, next: any) => {
        req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        next();
      })
      .use("/api", prescriptionsRouter)
      .use((error: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      });
    const authorization = `Bearer ${createCollaboratorToken({ professionalId: 41, role: "executor" })}`;
    const disclaimer = "HOMOLOGAÇÃO — DOCUMENTO DE TESTE — SEM VALIDADE CLÍNICA";
    const tempDir = mkdtempSync(join(tmpdir(), "paxter-prescription-homologation-"));
    const outputDir = join(
      new URL("../../../../", import.meta.url).pathname,
      "generated-artifacts",
      "paxter-prescription-homologation",
    );
    const emitted: Array<{ patient: string; prescriptionId: number; recipeId: number }> = [];

    try {
      for (const patient of [carlucia, dayana]) {
        for (const formulaNumber of [1, 2, 3]) {
          mock.recipePdfCallCount = 0;
          mock.failOnRecipePdfCall = null;
          const response = await request(app)
            .post("/api/prescriptions/emit")
            .set("Authorization", authorization)
            .send({
              clientId: patient.id,
              clientName: "NOME FALSIFICADO PELO NAVEGADOR",
              clientCpf: "11111111111",
              professionalName: "MEDICO FALSIFICADO",
              items: [{
                name: `${disclaimer} — FORMULA SINTETICA ${formulaNumber}`,
                ativos: "CONTEUDO FICTICIO — NAO E SUBSTANCIA",
                dose: "SEM DOSE TERAPEUTICA",
                via: "NAO APLICAVEL",
                frequencia: "NAO APLICAVEL",
                posologia: "DOCUMENTO DE TESTE. NAO DISPENSAR.",
                observacao: "DADO SINTETICO; SEM VALIDADE CLINICA.",
                isControlled: false,
              }],
            });

          expect(response.status, JSON.stringify(response.body)).toBe(201);
          expect(response.body.recipes).toHaveLength(1);
          const prescriptionId = response.body.prescriptionId as number;
          const recipeId = response.body.recipes[0].id as number;
          emitted.push({ patient: patient.name, prescriptionId, recipeId });

          const [prescription] = await database
            .select()
            .from(prescriptionsTable)
            .where(eq(prescriptionsTable.id, prescriptionId));
          const [item] = await database
            .select()
            .from(prescriptionItemsTable)
            .where(eq(prescriptionItemsTable.prescriptionId, prescriptionId));
          const [recipe] = await database
            .select()
            .from(recipesTable)
            .where(eq(recipesTable.id, recipeId));
          expect(prescription).toMatchObject({
            clientId: patient.id,
            clientName: patient.name,
            professionalId: 41,
            professionalName: identity.professional.name,
            empresaId: 21,
            status: "emitted",
          });
          expect(item.name).toContain(disclaimer);
          expect(item.dose).toBe("SEM DOSE TERAPEUTICA");
          expect(recipe.prescriptionId).toBe(prescriptionId);
          expect(recipe.pdfData).toBeTruthy();

          const history = await request(app)
            .get(`/api/prescriptions/${prescriptionId}`)
            .set("Authorization", authorization);
          expect(history.status, JSON.stringify(history.body)).toBe(200);
          expect(history.body.clientName).toBe(patient.name);
          expect(history.body.recipes).toHaveLength(1);

          const pdfResponse = await request(app)
            .get(`/api/recipes/${recipeId}/pdf`)
            .set("Authorization", authorization)
            .buffer(true)
            .parse((res: any, callback: (error: Error | null, body?: Buffer) => void) => {
              const chunks: Buffer[] = [];
              res.on("data", (chunk: Buffer) => chunks.push(chunk));
              res.on("end", () => callback(null, Buffer.concat(chunks)));
            });
          expect(pdfResponse.status).toBe(200);
          const pdf = pdfResponse.body as Buffer;
          expect(Buffer.from(recipe.pdfData, "base64").equals(pdf)).toBe(true);

          const pdfPath = join(tempDir, `${patient.id}-${formulaNumber}.pdf`);
          writeFileSync(pdfPath, pdf);
          const signedStatus = execFileSync("pdfsig", [pdfPath], { encoding: "utf8" });
          expect(signedStatus).toMatch(/Signature Validation:\s*Signature is Valid/i);
          expect(signedStatus).toContain("MEDICO SINTETICO");
          const pdfText = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
          const normalizedText = pdfText.replace(/\s+/g, " ");
          expect(normalizedText).toContain(disclaimer);
          expect(normalizedText).toContain("DOCUMENTO DE TESTE");
          expect(normalizedText).toContain(patient.name);
          expect(normalizedText).not.toContain("NOME FALSIFICADO PELO NAVEGADOR");
          expect(normalizedText).not.toContain("MEDICO FALSIFICADO");
          expect(normalizedText).not.toMatch(/personalizadas|avaliação clínica|exames do paciente/i);

          if (process.env.PAXTER_EXPORT_PRESCRIPTION_PDFS === "1") {
            mkdirSync(outputDir, { recursive: true });
            const patientSlug = patient.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
            writeFileSync(join(outputDir, `${patientSlug}_formula_${formulaNumber}.pdf`), pdf);
          }
        }
      }

      expect(emitted).toHaveLength(6);
      expect(await database.select().from(prescriptionsTable)).toHaveLength(6);
      expect(await database.select().from(prescriptionItemsTable)).toHaveLength(6);
      expect(await database.select().from(recipesTable)).toHaveLength(6);

      const beforeFailure = {
        prescriptions: (await database.select().from(prescriptionsTable)).length,
        items: (await database.select().from(prescriptionItemsTable)).length,
        recipes: (await database.select().from(recipesTable)).length,
      };
      mock.recipePdfCallCount = 0;
      mock.failOnRecipePdfCall = 1;
      const failedEmission = await request(app)
        .post("/api/prescriptions/emit")
        .set("Authorization", authorization)
        .send({
          clientId: carlucia.id,
          clientName: carlucia.name,
          items: [{ name: "FALHA SINTETICA — NAO DISPENSAR", isControlled: false }],
        });
      expect(failedEmission.status).toBe(500);
      expect(await database.select().from(prescriptionsTable)).toHaveLength(beforeFailure.prescriptions);
      expect(await database.select().from(prescriptionItemsTable)).toHaveLength(beforeFailure.items);
      expect(await database.select().from(recipesTable)).toHaveLength(beforeFailure.recipes);
      mock.failOnRecipePdfCall = null;

      const forbidden = await request(app)
        .post("/api/prescriptions/emit")
        .set("Authorization", authorization)
        .send({
          clientId: externalClient.id,
          clientName: externalClient.name,
          items: [{ name: "TENTATIVA PROIBIDA", isControlled: false }],
        });
      expect(forbidden.status).toBe(403);
      expect(await database.select().from(prescriptionsTable)).toHaveLength(beforeFailure.prescriptions);

      const anonymous = await request(app)
        .post("/api/prescriptions/emit")
        .send({
          clientId: carlucia.id,
          clientName: carlucia.name,
          items: [{ name: "SEM AUTENTICACAO", isControlled: false }],
        });
      expect(anonymous.status).toBe(401);
      expect(await database.select().from(prescriptionsTable)).toHaveLength(beforeFailure.prescriptions);
      expect(mock.email).not.toHaveBeenCalled();
      expect(mock.upload).not.toHaveBeenCalled();
      expect(mock.sendPaxter).not.toHaveBeenCalled();
      expect(mock.motor).toHaveBeenCalledTimes(6);
      expect(mock.motor.mock.calls.every(([args]) => args.emailTo.length === 0)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 120_000);
});
