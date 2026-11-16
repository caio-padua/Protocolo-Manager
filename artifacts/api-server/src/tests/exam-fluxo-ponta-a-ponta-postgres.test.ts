/**
 * SPEC 2 — fluxo ponta a ponta do exame (ingestão, identidade, conversão de unidade, C1/C2, evolução) (nenhuma chamada real a IA).
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
  app.use("/api", (await import("../routes/exam-conference")).default);
  app.use("/api", (await import("../routes/exames-lab")).default);
  app.use("/api", (await import("../routes/exames-paciente")).default);
  portalToken = (await import("../lib/portal-token")).createPortalToken;
}, 120_000);

afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(() => { vi.clearAllMocks(); sim.emitterOk = true; });



const R = (name: string, value: string | null, unit: string | null, referenceRange: string | null = null) =>
  ({ name, value, unit, referenceRange, method: null, history: [] });
const laudoMaria = () => ({
  patient: { name: "Maria Aparecida de Souza Lima", cpf: CPF_A, birthDate: "15/03/1980" },
  collectionDate: "10/11/2026", labName: "Lab Sintético",
  analytes: [
    R("Glicose", "5,0", "mmol/L", "3,9 a 5,5"),
    R("TSH", "2,1", "uUI/mL", "0,4 a 4,0"),
    { ...R("Glicose", "4,0", "mmol/L"), history: [{ date: "01/05/2026", value: "88", unit: "mg/dL" }] },
  ].slice(0, 2).map((a, i) => (i === 0 ? { ...a, history: [{ date: "01/05/2026", value: "88", unit: "mg/dL" }] } : a)),
  confidence: 0.9,
});
let docId = 0;
const evolucao = (clientId: number, as: number) => request(app).get(`/api/exames-lab/evolucao/${clientId}`).set(H(as));
const conferir = (id: number, fase: number, as: number) =>
  request(app).patch(`/api/exames-lab/documentos/${id}/conferir`).set(H(as)).send({ fase });

beforeAll(async () => {
  await pool.query(`INSERT INTO exam_analyte_catalog (code, display_name, synonyms, canonical_unit, kind, active) VALUES
    ('GLICOSE','Glicose','["glicose","glicemia"]','mg/dL','blood',true),
    ('TSH','TSH','["tsh"]','mUI/L','blood',true)`);
  await pool.query(`INSERT INTO exam_analyte_units (analyte_code, unit, factor_to_canonical, is_canonical, active) VALUES
    ('GLICOSE','mg/dL',1,true,true),('GLICOSE','mmol/L',18,false,true),('TSH','mUI/L',1,true,true)`);
  sim.extracted = laudoMaria();
  docId = await novoDocumento(1, "e2e-maria");
  await processExamDocument({ documentId: docId, clientId: 1, buffer: PDF("e2e-maria"), fileName: "e2e.pdf", notify: false });
});

describe("1. ingestão, identidade e padronização de unidade", () => {
  it("documento recebido; glicose em mmol/L convertida; TSH em unidade sem fator NÃO vira valor canônico", async () => {
    const [d] = await q(`SELECT status FROM exam_documents WHERE id=$1`, [docId]);
    expect(d.status).toBe("recebido");
    const rows = await q(`SELECT analyte_code, value_raw, unit_raw, value_canonical, unit_canonical, unit_converted, status, is_history, ref_low, ref_high
      FROM exam_results WHERE exam_document_id=$1 ORDER BY analyte_code, is_history`, [docId]);
    const g = rows.find((r: any) => r.analyte_code === "GLICOSE" && !r.is_history);
    expect(Number(g.value_canonical)).toBeCloseTo(90);
    expect(g.unit_canonical).toBe("mg/dL");
    expect(g.unit_converted).toBe(true);
    expect(g.value_raw).toBe("5,0");
    expect(Number(g.ref_low)).toBeCloseTo(70.2);
    const gh = rows.find((r: any) => r.analyte_code === "GLICOSE" && r.is_history);
    expect(Number(gh.value_canonical)).toBe(88);
    expect(gh.unit_converted).toBe(false);
    const t = rows.find((r: any) => r.analyte_code === "TSH");
    expect(t.value_raw).toBe("2,1");
    expect(t.unit_raw).toBe("uUI/mL");
    expect(t.value_canonical).toBeNull();
    expect(t.ref_low).toBeNull();
    expect(t.status).toBe("conferencia");
  });

  it("paciente errado: quarentena, nenhum resultado, nada arquivado", async () => {
    sim.extracted = { ...laudoMaria(), patient: { name: "Outra Pessoa Totalmente Diferente", cpf: CPF_B, birthDate: "02/02/1970" } };
    const id = await novoDocumento(1, "e2e-errado");
    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF("e2e-errado"), fileName: "e.pdf", notify: false });
    const [d] = await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]);
    expect(d.status).toBe("quarentena");
    expect((await q(`SELECT 1 FROM exam_results WHERE exam_document_id=$1`, [id])).length).toBe(0);
  });

  it("falha da leitura: documento em erro, sem resultados, fora da evolução", async () => {
    sim.extracted = null;
    const id = await novoDocumento(1, "e2e-falha");
    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF("e2e-falha"), fileName: "f.pdf", notify: false });
    const [d] = await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]);
    expect(d.status).toBe("erro");
    expect((await q(`SELECT 1 FROM exam_results WHERE exam_document_id=$1`, [id])).length).toBe(0);
  });
});

describe("2. conferência C1/C2 e evolução", () => {
  it("antes da conferência clínica a evolução não mostra nada (padrão seguro)", async () => {
    const r = await evolucao(1, 101);
    expect(r.status).toBe(200);
    expect(r.body.analytes).toEqual([]);
  });

  it("ordem e autorização: C2 antes de C1 = 409; enfermagem em C2 = 403; outra clínica = recusa; sem login = 401", async () => {
    expect((await conferir(docId, 2, 101)).status).toBe(409);
    expect((await conferir(docId, 1, 201)).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).patch(`/api/exames-lab/documentos/${docId}/conferir`).send({ fase: 1 })).status).toBe(401);
    expect((await q(`SELECT status FROM exam_documents WHERE id=$1`, [docId]))[0].status).toBe("recebido");
  });

  it("C1 pela enfermagem; repetir C1 = 409; C2 por enfermagem = 403; C2 pela médica", async () => {
    expect((await conferir(docId, 1, 102)).status).toBe(200);
    expect((await conferir(docId, 1, 102)).status).toBe(409);
    expect((await conferir(docId, 2, 102)).status).toBe(403);
    expect((await conferir(docId, 2, 101)).status).toBe(200);
    const [d] = await q(`SELECT status, conf1_name, conf2_name FROM exam_documents WHERE id=$1`, [docId]);
    expect(d).toMatchObject({ status: "conferido", conf1_name: "Enfermeira Cinco", conf2_name: "Médica Cinco" });
  });

  it("evolução após C2: glicose convertida no gráfico; TSH sem unidade padronizada fica sem número, sem faixa e sem tendência", async () => {
    const r = await evolucao(1, 101);
    expect(r.status).toBe(200);
    const col = r.body.columns.find((c: any) => !c.isHistory);
    expect(col.confLevel).toBe("c2");
    const gl = r.body.analytes.find((a: any) => a.key === "GLICOSE");
    expect(gl.cells[col.key].valueNum).toBeCloseTo(90);
    expect(gl.cells[col.key].unitConverted).toBe(true);
    const tsh = r.body.analytes.find((a: any) => a.key === "TSH");
    expect(tsh.cells[col.key].valueNum).toBeNull();
    expect(tsh.cells[col.key].zone).toBeNull();
    expect(tsh.cells[col.key].status).toBe("conferencia");
    expect(tsh.cells[col.key].value).toBe("2,1");
    expect(tsh.trend).toBeNull();
  });

  it("clínica errada não lê a evolução do cliente de outra clínica", async () => {
    const r = await evolucao(1, 201);
    expect([403, 404]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toContain("GLICOSE");
  });

  it("conferências concorrentes: só uma vence", async () => {
    sim.extracted = { ...laudoMaria(), collectionDate: "12/11/2026" };
    const id = await novoDocumento(1, "e2e-conc");
    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF("e2e-conc"), fileName: "c.pdf", notify: false });
    const rs = await Promise.all([conferir(id, 1, 102), conferir(id, 1, 102), conferir(id, 1, 102)]);
    expect(rs.map((x) => x.status).sort()).toEqual([200, 409, 409]);
  });
});
