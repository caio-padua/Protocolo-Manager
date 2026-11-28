/**
 * SPEC 1 — composição de leituras Gemini/Claude/OpenAI SIMULADAS (nenhuma chamada real a IA).
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
  extracted: null as any, claude: null as any, openai: null as any,
  drive: { upload: vi.fn(async () => ({ fileId: "drive-sintetico" })), rename: vi.fn(), structure: vi.fn(async () => ({ subfolders: { EXAMES: "pasta" } })) },
  mirror: vi.fn(async () => ({ r2Key: "k", bytes: 1, alreadyExists: false })),
  mail: vi.fn(), wpp: vi.fn(),
  emitterOk: true,
}));

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async (k: string) => (k.startsWith("exames.llm") ? "true" : null)) }));
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
  app.use("/api", (await import("../routes/exames-lab")).default);
  app.use("/api", (await import("../routes/exames-paciente")).default);
  portalToken = (await import("../lib/portal-token")).createPortalToken;
}, 120_000);

afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(() => { vi.clearAllMocks(); sim.emitterOk = true; });


const A = (name: string, value: string | null, unit: string | null, referenceRange: string | null = null) =>
  ({ name, value, unit, referenceRange, method: null, history: [] });
const base = (over: Record<string, any>) => ({
  patient: { name: "Maria Aparecida de Souza Lima", cpf: CPF_A, birthDate: "15/03/1980" },
  collectionDate: null, labName: null, analytes: [], confidence: 0.9, ...over,
});
async function rodar(clientId: number, nome: string) {
  const id = await novoDocumento(clientId, nome);
  await processExamDocument({ documentId: id, clientId, buffer: PDF(nome), fileName: `${nome}.pdf`, notify: false });
  const [doc] = await q(`SELECT status, collection_date, lab_name, llm_pipeline FROM exam_documents WHERE id=$1`, [id]);
  const res = await q(`SELECT analyte_name_raw, value_raw, unit_raw, client_id FROM exam_results WHERE exam_document_id=$1 ORDER BY analyte_name_raw`, [id]);
  // Documento retido guarda a trilha no registro de identidade (acesso restrito), não em exam_documents.
  const [chk] = await q(`SELECT extracted_json FROM exam_identity_checks WHERE document_id=$1`, [id]);
  const pipeline = (doc.llm_pipeline ?? chk?.extracted_json?.pipeline ?? []) as any[];
  const rec = pipeline.find((s) => s.provider === "reconciliacao");
  return { id, doc, res, rec };
}

describe("composição segura de três leituras", () => {
  it("preserva o que só uma IA achou (analito com unidade, data, laboratório) e registra a fonte", async () => {
    sim.extracted = base({ analytes: [A("Glicose", "90", "mg/dL")] });
    sim.claude = base({ labName: "Lab Sintético Claude", analytes: [A("Glicose", "90", "mg/dL"), A("Insulina", "8", "µUI/mL")] });
    sim.openai = base({ collectionDate: "10/11/2026", analytes: [A("Ferritina", "120", "ng/mL")] });
    const r = await rodar(1, "complementar");
    expect(r.doc.status).toBe("recebido");
    expect(r.res.map((x: any) => `${x.analyte_name_raw}|${x.value_raw}|${x.unit_raw}`)).toEqual(
      ["Ferritina|120|ng/mL", "Glicose|90|mg/dL", "Insulina|8|µUI/mL"]);
    expect(r.doc.lab_name).toBe("Lab Sintético Claude");
    expect(new Date(r.doc.collection_date).toISOString().slice(0, 10)).toBe("2026-11-10");
    expect(r.rec.detalhe.conflitos).toEqual([]);
    expect(r.rec.detalhe.fontes["labName"]).toEqual(["claude"]);
    expect(r.rec.detalhe.fontes["collectionDate"]).toEqual(["openai"]);
    expect(r.rec.detalhe.fontes["analito:insulina"]).toEqual(["claude"]);
    expect(r.rec.detalhe.confianca).toEqual({ gemini: 0.9, claude: 0.9, openai: 0.9 });
  });

  it("três leituras contraditórias: nada é escolhido; conflitos ficam na trilha", async () => {
    sim.extracted = base({ collectionDate: "10/11/2026", labName: "Lab A", analytes: [A("Glicose", "90", "mg/dL"), A("Ureia", "30", "mg/dL"), A("TSH", "2,1", "mUI/L")] });
    sim.claude = base({ collectionDate: "11/11/2026", labName: "Lab B", analytes: [A("Glicose", "95", "mg/dL"), A("Ureia", "30", "mg/dl"), A("TSH", "2,1", "uUI/mL")] });
    sim.openai = base({ collectionDate: "12/11/2026", labName: "Lab C", analytes: [A("Glicose", "99", "mg/dL"), A("Creatinina", "0,9", "mg/dL")] });
    const r = await rodar(1, "contraditorio");
    expect(r.doc.status).toBe("recebido");
    expect(r.doc.collection_date).toBeNull();
    expect(r.doc.lab_name).toBeNull();
    const nomes = r.res.map((x: any) => x.analyte_name_raw);
    expect(nomes).toContain("Ureia");
    expect(nomes).toContain("Creatinina");
    expect(nomes).not.toContain("Glicose");
    expect(nomes).not.toContain("TSH");
    const campos = r.rec.detalhe.conflitos.map((c: any) => c.field);
    expect(campos).toEqual(expect.arrayContaining(["collectionDate", "labName", "analito:glicose:value", "analito:tsh:unit"]));
    expect(campos).not.toContain("analito:ureia:unit");
    expect(r.rec.detalhe.conflitos.find((c: any) => c.field === "analito:glicose:value").candidates).toHaveLength(3);
    expect(r.rec.detalhe.analitosRetiradosPorConflito.map((a: any) => a.key).sort()).toEqual(["glicose", "tsh"]);
  });

  it("paciente divergente entre IAs: documento retido em quarentena, sem resultados", async () => {
    sim.extracted = base({ analytes: [A("Glicose", "90", "mg/dL")] });
    sim.claude = base({ patient: { name: "Maria Aparecida de Souza Lima", cpf: CPF_B, birthDate: "15/03/1980" }, analytes: [A("Glicose", "90", "mg/dL")] });
    sim.openai = null;
    const r = await rodar(1, "paciente-divergente");
    expect(r.doc.status).toBe("quarentena");
    expect(r.res).toEqual([]);
    expect(sim.drive.upload).not.toHaveBeenCalled();
    expect(r.rec.detalhe.conflitoDePaciente).toBe(true);
  });

  it("isolamento: leitura da clínica 5 não aparece na clínica 6", async () => {
    sim.extracted = base({ patient: { name: "Cliente Da Clínica Seis", cpf: CPF_B, birthDate: "01/01/1990" }, analytes: [A("Glicose", "77", "mg/dL")] });
    sim.claude = base({ patient: { name: "Cliente Da Clínica Seis", cpf: CPF_B, birthDate: "01/01/1990" }, labName: "Lab Seis", analytes: [A("Glicose", "77", "mg/dL")] });
    sim.openai = null;
    const seis = await rodar(2, "seis");
    expect(seis.res.every((x: any) => x.client_id === 2)).toBe(true);
    expect(seis.doc.status).toBe("recebido");
    const comoCinco = await request(app).get(`/api/exames-lab/documentos/${seis.id}`).set(H(101));
    expect(comoCinco.status).toBe(404);
    const comoSeis = await request(app).get(`/api/exames-lab/documentos/${seis.id}`).set(H(201));
    expect(comoSeis.status).toBe(200);
    const cinco = await q(`SELECT count(*)::int n FROM exam_results r JOIN clients c ON c.id=r.client_id WHERE c.empresa_id=5 AND r.exam_document_id=$1`, [seis.id]);
    expect(cinco[0].n).toBe(0);
  });
});
