/**
 * SPEC 3 — recebimento do exame pela Área do Cliente (token do portal, validação, status honesto, isolamento) (nenhuma chamada real a IA).
 * Banco descartável, dados sintéticos. Base: exam-identity-tenant-postgres.test.ts.
 *
 * (cabeçalho original)
 * Depuração de Exames — identidade do laudo e isolamento por clínica.
 * Dados 100% sintéticos, PostgreSQL descartável, cadeia REAL de autenticação
 * (token de colaborador assinado + tenantContextMiddleware + requireCollaborator).
 * Simulado de propósito: leitura do modelo de IA, Drive, cofre R2, e-mail e WhatsApp (nada sai da máquina)
 * e a conferência de vínculo clínico do médico (resolveClinicalEmitter) na liberação de contradição.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { createTableFromSchema } from "./helpers/schema-ddl";

const sim = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  extracted: null as any, claude: null as any, openai: null as any,
  drive: { upload: vi.fn(async () => ({ fileId: "drive-sintetico" })), rename: vi.fn(), structure: vi.fn(async () => ({ subfolders: { EXAMES: "pasta" } })) },
  mirror: vi.fn(async () => ({ r2Key: "k", bytes: 1, alreadyExists: false })),
  mail: vi.fn(), wpp: vi.fn(),
  emitterOk: true,
}));

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async (k: string) => (k in sim.settings ? sim.settings[k] : null)) }));
vi.mock("../lib/exam-extraction/pdf-text", () => ({ extractPdfText: vi.fn(async () => ({ text: "laudo sintético", charCount: 15 })), compactExamText: (t: string) => t, inferLabName: () => null }));
vi.mock("../lib/exam-extraction/extract", () => ({ extractExamFromText: vi.fn(async () => ({ data: sim.extracted, modelUsed: "modelo-simulado" })) }));
vi.mock("../lib/exam-extraction/extract-anthropic", () => ({ extractExamWithClaude: vi.fn(async () => (sim.claude ? { data: sim.claude, ms: 1 } : null)), CLAUDE_MODEL_NAME: "claude-sim" }));
vi.mock("../lib/exam-extraction/extract-openai", () => ({ extractExamWithOpenAI: vi.fn(async () => (sim.openai ? { data: sim.openai, ms: 1 } : null)), OPENAI_MODEL: "openai-sim" }));
vi.mock("../lib/google-drive", async (orig) => ({
  ...(await orig<any>()),
  ensureClientFolderStructure: sim.drive.structure,
  uploadFileToDrive: sim.drive.upload,
  renameDriveFile: sim.drive.rename,
}));
vi.mock("../lib/examR2Storage", async (orig) => ({ ...(await orig<any>()), mirrorExamToR2: sim.mirror }));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: sim.mail }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: sim.wpp }));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: any, _s: any, n: any) => n() }));
vi.mock("../lib/exam-curation-access", () => ({ protectCurationMutation: (_q: any, _s: any, n: any) => n() }));
vi.mock("../lib/clinical-emitter", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    resolveClinicalEmitter: vi.fn(async (req: any) => {
      if (!sim.emitterOk) throw new actual.ClinicalIdentityError(403, "Sem vínculo clínico.");
      return { professional: { id: req.collaborator.professionalId }, canPrescribe: true };
    }),
  };
});

const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "s".repeat(32);

const CPF_A = "529.982.247-25";
const CPF_B = "111.444.777-35";
let app: express.Express;
let pool: any;
let tokenOf: (id: number, version?: number) => string;
let processExamDocument: any;
let startExamIngestion: any;
let portalToken: (id: number) => string;

const H = (id: number) => ({ Authorization: `Bearer ${tokenOf(id)}` });
const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;
const PDF = (n: string) => Buffer.from(`%PDF-1.4 sintetico ${n}`);

function laudo(patient: Record<string, any>, nAnalitos = 1) {
  return {
    patient: { name: null, cpf: null, birthDate: null, ...patient },
    collectionDate: "10/11/2026", labName: "Lab Sintético",
    analytes: Array.from({ length: nAnalitos }, (_, i) => ({ name: `Analito ${i + 1}`, value: "10", unit: "mg/dL", referenceRange: "5 a 15", method: null, history: [] })),
    confidence: 0.9,
  };
}

async function novoDocumento(clientId: number, nome: string) {
  const rows = await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id)
    SELECT $1, $2, $2, 'processando', empresa_id FROM clients WHERE id=$1 RETURNING id`, [clientId, nome]);
  return rows[0].id as number;
}

beforeAll(async () => {
  const db = await import("@workspace/db");
  const schema = await import("@workspace/db/schema");
  pool = db.pool;
  for (const t of [schema.empresasTable, schema.clientsTable, schema.professionalsTable, schema.locationsTable,
    schema.locationProfessionalsTable, schema.professionalEmpresasTable, schema.examDocumentsTable, schema.examResultsTable,
    schema.examAnalyteCatalogTable, schema.examAnalyteRangesTable, schema.examAnalyteUnitsTable]) {
    await pool.query(createTableFromSchema(t));
  }
  await pool.query(`ALTER TABLE exam_documents ADD COLUMN llm_pipeline jsonb, ADD COLUMN reprocessamento_count int, ADD COLUMN reprocessado_at timestamptz`);
  await pool.query(`CREATE TABLE direcao_favoravel_exame (nome_exame text primary key, direcao_favoravel text)`);
  await pool.query(`CREATE TABLE drive_watcher_files (file_id text primary key, exam_document_id int, processed_at timestamptz, original_name text, renamed_to text, copied_drive_id text, copied_name text)`);
  await (await import("../lib/ensure-exam-identity-schema")).ensureExamIdentitySchema();

  await pool.query(`INSERT INTO empresas (id, nome) VALUES (5,'Clínica Cinco'),(6,'Clínica Seis')`);
  await pool.query(`INSERT INTO professionals (id, name, empresa_id, category, role, professional_type, crm, registration_council, active, credential_version) VALUES
    (101,'Médica Cinco',5,'medico','medico','medico','12345 SP','CRM',true,0),
    (102,'Enfermeira Cinco',5,'enfermagem','enfermagem','enfermagem',null,null,true,0),
    (201,'Médico Seis',6,'medico','medico','medico','54321 RJ','CRM',true,0),
    (103,'Médica Inativa',5,'medico','medico','medico','99999 SP','CRM',false,0)`);
  await pool.query(`INSERT INTO clients (id, name, cpf, birth_date, empresa_id, status) VALUES
    (1,'Maria Aparecida de Souza Lima','${CPF_A}','15/03/1980',5,'active'),
    (2,'Cliente Da Clínica Seis','${CPF_B}','01/01/1990',6,'active'),
    (3,'Joana Sem Documentos',null,null,5,'active'),
    (4,'Cliente Sem Clínica','${CPF_B}','02/02/1992',null,'active')`);

  tokenOf = (await import("../lib/collaborator-auth")).createCollaboratorToken as any;
  const mk = (await import("../lib/collaborator-auth")).createCollaboratorToken;
  tokenOf = (id: number, version = 0) => mk({ professionalId: id, role: "x", credentialVersion: version });
  ({ processExamDocument, startExamIngestion } = await import("../routes/exames-lab"));

  const { tenantContextMiddleware } = await import("../middleware/tenantContext");
  app = express();
  app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
  app.use(tenantContextMiddleware);
  app.use("/api", (await import("../routes/client-portal")).default);
  app.use("/api", (await import("../routes/exames-lab")).default);
  app.use("/api", (await import("../routes/exames-paciente")).default);
  portalToken = (await import("../lib/portal-token")).createPortalToken;
}, 120_000);

afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(() => { vi.clearAllMocks(); sim.emitterOk = true; });




const laudoPortal = (collectionDate: string) => ({
  patient: { name: "Maria Aparecida de Souza Lima", cpf: CPF_A, birthDate: "15/03/1980" },
  collectionDate, labName: "Lab Sintético",
  analytes: [{ name: "Glicose", value: "90", unit: "mg/dL", referenceRange: "70 a 99", method: null, history: [] }],
  confidence: 0.9,
});
const pdf = (n: string) => PDF(n);
const bearer = (id: number) => ({ Authorization: `Bearer ${portalToken(id)}` });
const enviar = (token: string | null, buf: Buffer, opts: { fileType?: string; mime?: string; name?: string } = {}) => {
  let r = request(app).post("/api/client-portal/upload");
  if (token) r = r.field("token", token);
  if (opts.fileType !== undefined || true) r = r.field("fileType", opts.fileType ?? "exame_sangue");
  return r.attach("file", buf, { filename: opts.name ?? "exame.pdf", contentType: opts.mime ?? "application/pdf" });
};
const esperar = async (id: number) => {
  for (let i = 0; i < 60; i++) {
    const [d] = await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]);
    if (d && d.status !== "processando") return d.status;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("processamento não terminou");
};
const envios = (id: number) => request(app).get("/api/area-paciente/exames/envios").set(bearer(id));
let docA = 0;

describe("recepção pela Área do Cliente", () => {
  it("sem token, token forjado ou token de foto: recusado e nada gravado", async () => {
    expect((await enviar(null, pdf("a"))).status).toBe(400);
    expect((await enviar("forjado.abc.def", pdf("a"))).status).toBe(401);
    expect((await enviar(portalToken(1) + "x", pdf("a"))).status).toBe(401);
    expect(sim.drive.upload).not.toHaveBeenCalled();
    expect((await q(`SELECT 1 FROM exam_documents`)).length).toBe(0);
  });

  it("arquivo que diz ser PDF mas não é: recusado antes do Drive e do motor", async () => {
    const r = await enviar(portalToken(1), Buffer.from("MZ executável disfarçado"), { name: "x.pdf" });
    expect(r.status).toBe(400);
    expect(sim.drive.upload).not.toHaveBeenCalled();
    expect((await q(`SELECT 1 FROM exam_documents`)).length).toBe(0);
  });

  it("PDF válido: recebido, leitura iniciada, status real sem prometer conclusão", async () => {
    sim.extracted = laudoPortal("10/11/2026");
    const r = await enviar(portalToken(1), pdf("valido"));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, processamento: "iniciado" });
    docA = r.body.exameDocumentoId;
    expect(docA).toBeGreaterThan(0);
    expect(sim.drive.upload).toHaveBeenCalledTimes(1);
    const [d] = await q(`SELECT client_id, empresa_id FROM exam_documents WHERE id=$1`, [docA]);
    expect(d).toMatchObject({ client_id: 1, empresa_id: 5 });
    expect(await esperar(docA)).toBe("recebido");
    const e = await envios(1);
    const meu = e.body.find((x: any) => x.id === docA);
    expect(meu).toMatchObject({ etapa: "conferencia", finalizado: false, analitos: 1 });
    expect(meu.situacao).not.toMatch(/conclu/i);
  });

  it("token no cabeçalho Authorization também vale", async () => {
    sim.extracted = laudoPortal("11/11/2026");
    const r = await request(app).post("/api/client-portal/upload").set(bearer(1)).field("fileType", "exame_sangue")
      .attach("file", pdf("cabecalho"), { filename: "e.pdf", contentType: "application/pdf" });
    expect(r.status).toBe(200);
    await esperar(r.body.exameDocumentoId);
  });

  it("reenvio do mesmo arquivo não duplica documento nem resultados", async () => {
    const antes = (await q(`SELECT count(*)::int n FROM exam_documents`))[0].n;
    const r = await enviar(portalToken(1), pdf("valido"));
    expect(r.status).toBe(200);
    expect(r.body.exameDocumentoId).toBe(docA);
    expect((await q(`SELECT count(*)::int n FROM exam_documents`))[0].n).toBe(antes);
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [docA]))[0].n).toBe(1);
  });

  it("contagem de resultados é do próprio documento (não de outro com o mesmo número)", async () => {
    const e = await envios(1);
    const seg = e.body.find((x: any) => x.id !== docA && x.analitos === 1);
    expect(seg).toBeDefined();
    const total = (await q(`SELECT exam_document_id, count(*)::int n FROM exam_results GROUP BY 1`)) as any[];
    for (const row of e.body) expect(row.analitos).toBe(total.find((t) => t.exam_document_id === row.id)?.n ?? 0);
  });

  it("outro cliente nunca vê envio nem evolução alheia", async () => {
    const e = await envios(2);
    expect(e.status).toBe(200);
    expect(e.body).toEqual([]);
    const ev = await request(app).get("/api/area-paciente/exames/evolucao").set(bearer(2));
    expect(JSON.stringify(ev.body)).not.toContain("Glicose");
    expect((await request(app).get("/api/area-paciente/exames/envios")).status).toBe(401);
    expect((await request(app).get("/api/area-paciente/exames/envios?clientId=1").set(bearer(2))).body).toEqual([]);
  });

  it("falha de leitura aparece como erro final, sem resultados", async () => {
    sim.extracted = null;
    const r = await enviar(portalToken(1), pdf("vai-falhar"));
    expect(await esperar(r.body.exameDocumentoId)).toBe("erro");
    const meu = (await envios(1)).body.find((x: any) => x.id === r.body.exameDocumentoId);
    expect(meu).toMatchObject({ etapa: "erro", finalizado: true, analitos: 0 });
  });

  it("cliente sem clínica: arquivo guardado, leitura NÃO iniciada e a resposta diz isso", async () => {
    const r = await enviar(portalToken(4), pdf("sem-clinica"));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, processamento: "nao_iniciado", exameDocumentoId: null });
  });

  it("foto comum não entra no motor de exames", async () => {
    sim.drive.structure.mockResolvedValueOnce({ subfolders: { IMAGENS: "pasta-img" } } as any);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const r = await enviar(portalToken(1), jpg, { fileType: "foto", mime: "image/jpeg", name: "f.jpg" });
    expect(r.body).toMatchObject({ success: true, processamento: "nao_aplicavel", exameDocumentoId: null });
  });
});
