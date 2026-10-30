import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { isolatedPostgres } from "./helpers/isolated-postgres";

const mock = vi.hoisted(() => ({
  getJson: vi.fn(), getSecret: vi.fn(), read: vi.fn(), globalBuffer: vi.fn(), globalPasswords: vi.fn(),
  rows: [] as any[][], execute: vi.fn(), upload: vi.fn(), email: vi.fn(), insert: vi.fn(),
  transaction: vi.fn(), sendPaxter: vi.fn(),
}));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    select: () => ({ from: () => {
      const rows = mock.rows.shift() ?? [];
      const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows).then(yes, no) };
      chain.where = () => chain; chain.limit = async () => rows;
      return chain;
    } }),
    execute: mock.execute,
    insert: mock.insert,
    transaction: mock.transaction,
  },
}));
vi.mock("../lib/secure-settings", () => ({ getJsonSetting: mock.getJson, getSecret: mock.getSecret }));
vi.mock("../lib/cert-source", () => ({ getCertBufferSync: mock.globalBuffer, getCertPasswordsSync: mock.globalPasswords }));
vi.mock("../lib/objectStorage", () => ({ ObjectStorageService: class { readPrivateObject = mock.read; } }));
vi.mock("../lib/google-drive", () => ({ uploadToFolderById: mock.upload }));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: mock.email }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: mock.sendPaxter }));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: any, _s: any, next: any) => next() }));
vi.mock("../lib/receituario-worker", () => ({ liberarSlot: vi.fn(), processarReceituarioDiario: vi.fn() }));
import { inspectPrescriptionCertificate, resolvePrescriptionSigner, signPrescriptionPdf,
  signExistingPrescriptionPdf, validatePrescriptionCertificate, type PrescriptionIdentity } from "../lib/prescription-signing";
import { generatePdfFromPngBase64, generateReceituarioPdfV2, generateReceituarioPdf } from "../lib/receituario-pdf";
import { validateClinicalIdentity } from "../lib/clinical-emitter";
import prescriptionRouter from "../routes/receituario";
import examRequestRouter from "../routes/exam-requests";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { examRequestPdfsTable } from "../../../../lib/db/src/schema/exam-requests";

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
}, 30_000);
afterAll(async () => { await postgres?.stop(); });
beforeEach(() => {
  vi.clearAllMocks();
  mock.getJson.mockResolvedValue(null);
  mock.globalBuffer.mockReturnValue(pfx);
  mock.globalPasswords.mockReturnValue([password]);
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
    expect(response.status).toBe(200);
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
});
