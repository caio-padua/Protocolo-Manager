/**
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
  extracted: null as any,
  drive: { upload: vi.fn(async () => ({ fileId: "drive-sintetico" })), rename: vi.fn(), structure: vi.fn(async () => ({ subfolders: { EXAMES: "pasta" } })) },
  mirror: vi.fn(async () => ({ r2Key: "k", bytes: 1, alreadyExists: false })),
  mail: vi.fn(), wpp: vi.fn(),
  emitterOk: true,
}));

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async () => null) }));
vi.mock("../lib/exam-extraction/pdf-text", () => ({ extractPdfText: vi.fn(async () => ({ text: "laudo sintético", charCount: 15 })), compactExamText: (t: string) => t, inferLabName: () => null }));
vi.mock("../lib/exam-extraction/extract", () => ({ extractExamFromText: vi.fn(async () => ({ data: sim.extracted, modelUsed: "modelo-simulado" })) }));
vi.mock("../lib/exam-extraction/extract-anthropic", () => ({ extractExamWithClaude: vi.fn(), CLAUDE_MODEL_NAME: "x" }));
vi.mock("../lib/exam-extraction/extract-openai", () => ({ extractExamWithOpenAI: vi.fn(), OPENAI_MODEL: "x" }));
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
  await (await import("../lib/ensure-exam-marcos-schema")).ensureExamMarcosSchema();

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

describe("migração", () => {
  it("é idempotente e o registro é append-only (UPDATE e DELETE recusados)", async () => {
    const { ensureExamIdentitySchema, EXAM_IDENTITY_MIGRATION_SQL } = await import("../lib/ensure-exam-identity-schema");
    await pool.query(EXAM_IDENTITY_MIGRATION_SQL);
    await pool.query(EXAM_IDENTITY_MIGRATION_SQL);
    await ensureExamIdentitySchema();
    await q(`INSERT INTO exam_identity_checks (document_id, empresa_id, client_id, event, verdict) VALUES (900, 5, 1, 'verificacao', 'revisao')`);
    await expect(pool.query(`UPDATE exam_identity_checks SET verdict='confirmada' WHERE document_id=900`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM exam_identity_checks WHERE document_id=900`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`INSERT INTO exam_identity_checks (document_id, empresa_id, client_id, event, verdict) VALUES (900, 5, 1, 'verificacao', 'revisao')`)).rejects.toThrow(/unique|duplicate/i);
  });
  it("o SQL do arquivo de migração é idêntico ao embutido no código", async () => {
    const { readFileSync } = await import("node:fs");
    const { EXAM_IDENTITY_MIGRATION_SQL } = await import("../lib/ensure-exam-identity-schema");
    const file = readFileSync(new URL("../../../../scripts/migrations/exam-identity-checks.sql", import.meta.url), "utf8");
    expect(EXAM_IDENTITY_MIGRATION_SQL).toBe(file);
  });
});

describe("porteiro de identidade no processamento", () => {
  it("laudo confirmado por CPF entra no prontuário", async () => {
    sim.extracted = laudo({ name: "Maria Aparecida de Souza Lima", cpf: CPF_A }, 2);
    const id = await novoDocumento(1, "confirmado");
    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF("a"), fileName: "a.pdf", notify: true });
    const [doc] = await q(`SELECT status, raw_json FROM exam_documents WHERE id=$1`, [id]);
    expect(doc.status).toBe("recebido");
    expect(doc.raw_json).not.toBeNull();
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(2);
    expect(sim.mirror).toHaveBeenCalled();
    expect((await q(`SELECT verdict, extracted_json FROM exam_identity_checks WHERE document_id=$1`, [id]))[0]).toMatchObject({ verdict: "confirmada", extracted_json: null });
  });

  it.each([
    ["CPF de outra pessoa (homônimo)", { name: "Maria Aparecida de Souza Lima", cpf: CPF_B, birthDate: "15/03/1980" }, "contradicao"],
    ["laudo sem nenhum dado de identidade", {}, "revisao"],
    ["só o nome confere", { name: "Maria Aparecida de Souza Lima" }, "revisao"],
    ["CPF ilegível", { name: "Maria Aparecida de Souza Lima", cpf: "529.982.247-26" }, "revisao"],
  ])("%s => quarentena, zero resultados, sem Drive, sem cofre, sem aviso, sem raw_json", async (_t, patient, verdict) => {
    sim.extracted = laudo(patient as any, 3);
    const id = await novoDocumento(1, `q-${_t}`);
    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF(_t), fileName: "q.pdf", notify: true });
    const [doc] = await q(`SELECT status, raw_json, source_pdf_drive_id FROM exam_documents WHERE id=$1`, [id]);
    expect(doc.status).toBe("quarentena");
    expect(doc.raw_json).toBeNull();
    expect(doc.source_pdf_drive_id).toBeNull();
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(0);
    expect(sim.drive.upload).not.toHaveBeenCalled();
    expect(sim.mirror).not.toHaveBeenCalled();
    expect(sim.mail).not.toHaveBeenCalled();
    expect(sim.wpp).not.toHaveBeenCalled();
    const [check] = await q(`SELECT verdict, extracted_json FROM exam_identity_checks WHERE document_id=$1`, [id]);
    expect(check.verdict).toBe(verdict);
    expect(check.extracted_json.extracted.analytes).toHaveLength(3);
  });

  it("cadastro sem CPF e sem nascimento nunca confirma automaticamente", async () => {
    sim.extracted = laudo({ name: "Joana Sem Documentos", cpf: CPF_A, birthDate: "01/01/1970" }, 1);
    const id = await novoDocumento(3, "cadastro-vazio");
    await processExamDocument({ documentId: id, clientId: 3, buffer: PDF("v"), fileName: "v.pdf" });
    expect((await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]))[0].status).toBe("quarentena");
  });

  it("cliente sem clínica definida é quarentena, nunca empresa padrão", async () => {
    sim.extracted = laudo({ cpf: CPF_B }, 1);
    const id = (await q(`INSERT INTO exam_documents (client_id, hash, file_name, status) VALUES (4,'sem-clinica','x','processando') RETURNING id`))[0].id;
    await processExamDocument({ documentId: id, clientId: 4, buffer: PDF("s"), fileName: "s.pdf" });
    expect((await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]))[0].status).toBe("quarentena");
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(0);
  });

  it("startExamIngestion deriva a clínica do cliente e recusa cliente sem clínica ou clínica divergente", async () => {
    const r = await startExamIngestion({ clientId: 2, buffer: PDF("ing-2"), fileName: "i.pdf" });
    expect((await q(`SELECT empresa_id FROM exam_documents WHERE id=$1`, [r.documentId]))[0].empresa_id).toBe(6);
    await expect(startExamIngestion({ clientId: 4, buffer: PDF("ing-4"), fileName: "i.pdf" })).rejects.toThrow(/sem clínica/);
    await expect(startExamIngestion({ clientId: 2, buffer: PDF("ing-2b"), fileName: "i.pdf", empresaId: 5 })).rejects.toThrow(/não é a clínica/);
  });
});

describe("decisão humana sobre a quarentena", () => {
  async function emQuarentena(clientId: number, patient: any, nome: string) {
    sim.extracted = laudo(patient, 2);
    const id = await novoDocumento(clientId, nome);
    const { saveInternalCopy } = await import("../lib/exam-file-store");
    await saveInternalCopy({ documentId: id, fileName: `${nome}.pdf`, mimeType: "application/pdf", buffer: PDF(nome) });
    await processExamDocument({ documentId: id, clientId, buffer: PDF(nome), fileName: `${nome}.pdf` });
    return id;
  }
  const liberar = (id: number, prof: number, body: any = { justificativa: "Conferido com o documento de identidade do cliente." }) =>
    request(app).post(`/api/exames-lab/documentos/${id}/identidade/liberar`).set(H(prof)).send(body);

  it("exige sessão e colaborador da MESMA clínica; outra clínica recebe 404 sem revelar existência", async () => {
    const id = await emQuarentena(1, {}, "dec-1");
    expect((await request(app).post(`/api/exames-lab/documentos/${id}/identidade/liberar`).send({})).status).toBe(401);
    expect((await liberar(id, 201)).status).toBe(404);
    expect((await request(app).get(`/api/exames-lab/documentos/${id}/identidade`).set(H(201))).status).toBe(404);
    expect((await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]))[0].status).toBe("quarentena");
  });

  it("token com versão de credencial antiga ou profissional inativo é recusado", async () => {
    const id = await emQuarentena(1, {}, "dec-2");
    expect((await request(app).post(`/api/exames-lab/documentos/${id}/identidade/liberar`).set({ Authorization: `Bearer ${tokenOf(101, 7)}` }).send({})).status).toBe(401);
    expect((await liberar(id, 103)).status).toBe(401);
  });

  it("justificativa curta é recusada; revisão liberada por enfermagem incorpora os resultados sem aviso ao cliente", async () => {
    const id = await emQuarentena(1, { name: "Maria Aparecida de Souza Lima" }, "dec-3");
    expect((await liberar(id, 102, { justificativa: "ok" })).status).toBe(400);
    const r = await liberar(id, 102);
    expect(r.status).toBe(200);
    expect((await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]))[0].status).toBe("recebido");
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(2);
    expect(sim.mail).not.toHaveBeenCalled();
    const eventos = await q(`SELECT event, professional_id FROM exam_identity_checks WHERE document_id=$1 ORDER BY id`, [id]);
    expect(eventos.map((e: any) => e.event)).toEqual(["verificacao", "liberacao_humana"]);
    expect(eventos[1].professional_id).toBe(102);
  });

  it("contradição exige médico com vínculo clínico; enfermagem recebe 403 e nada é gravado", async () => {
    const id = await emQuarentena(1, { name: "Maria Aparecida de Souza Lima", cpf: CPF_B }, "dec-4");
    expect((await liberar(id, 102)).status).toBe(403);
    sim.emitterOk = false;
    expect((await liberar(id, 101)).status).toBe(403);
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(0);
    sim.emitterOk = true;
    expect((await liberar(id, 101, { justificativa: "curta demais" })).status).toBe(400);
    expect((await liberar(id, 101)).status).toBe(200);
  });

  it("duas liberações simultâneas: uma vence, a outra recebe 409, resultados gravados uma única vez", async () => {
    const id = await emQuarentena(1, { name: "Maria Aparecida de Souza Lima" }, "dec-5");
    const [a, b] = await Promise.all([liberar(id, 101), liberar(id, 102)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(2);
    expect((await q(`SELECT count(*)::int n FROM exam_identity_checks WHERE document_id=$1 AND event='liberacao_humana'`, [id]))[0].n).toBe(1);
  });

  it("rejeitar fixa o status e impede liberar depois; o original continua guardado", async () => {
    const id = await emQuarentena(1, { name: "Outra Pessoa Qualquer", birthDate: "02/07/1975" }, "dec-6");
    const r = await request(app).post(`/api/exames-lab/documentos/${id}/identidade/rejeitar`).set(H(102)).send({ justificativa: "Laudo de outra pessoa." });
    expect(r.status).toBe(200);
    expect((await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]))[0].status).toBe("identidade_rejeitada");
    expect((await liberar(id, 101)).status).toBe(409);
    expect((await q(`SELECT count(*)::int n FROM exam_document_files WHERE document_id=$1`, [id]))[0].n).toBe(1);
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(0);
  });

  it("detalhe mostra só os dois últimos dígitos do CPF do laudo", async () => {
    const id = await emQuarentena(1, { name: "Maria Aparecida de Souza Lima", cpf: CPF_B }, "dec-7");
    const r = await request(app).get(`/api/exames-lab/documentos/${id}/identidade`).set(H(101));
    expect(r.status).toBe(200);
    expect(r.body.veredito).toBe("contradicao");
    expect(JSON.stringify(r.body)).not.toContain("111.444");
    expect(JSON.stringify(r.body)).not.toContain("11144477735");
    expect(r.body.laudo.cpfFinal).toBe("35");
  });
});

describe("isolamento entre clínicas nas rotas de exames", () => {
  let docClinica5: number;
  beforeAll(async () => {
    docClinica5 = (await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id) VALUES (1,'iso-doc','iso.pdf','conferido',5) RETURNING id`))[0].id;
  });
  const rotasCliente = (clientId: number) => [
    ["get", `/api/exames-lab/evolucao/${clientId}`],
    ["get", `/api/exames-lab/resultados?clientId=${clientId}`],
    ["get", `/api/exames-lab/documentos?clientId=${clientId}`],
  ] as const;

  it("sem sessão, todas as rotas de dado de cliente respondem 401", async () => {
    for (const [m, url] of rotasCliente(1)) expect((await (request(app) as any)[m](url)).status, url).toBe(401);
    for (const url of [`/api/exames-lab/documentos/${docClinica5}`, `/api/exames-lab/documento/${docClinica5}/arquivo`, `/api/exames-lab/doc-status/${docClinica5}`, "/api/exames-lab/monitor", "/api/exames-lab/auditoria"])
      expect((await request(app).get(url)).status, url).toBe(401);
    expect((await request(app).post("/api/exames-lab/ingest").field("clientId", "1").attach("file", PDF("x"), { filename: "x.pdf", contentType: "application/pdf" })).status).toBe(401);
    expect((await request(app).post("/api/exames-lab/recovery")).status).toBe(401);
    expect((await request(app).post("/api/exames-lab/demo-conversao?clientId=1")).status).toBe(401);
  });

  it("colaborador da clínica 6 não enxerga nem toca cliente/documento da clínica 5 (404)", async () => {
    for (const [m, url] of rotasCliente(1)) expect((await (request(app) as any)[m](url).set(H(201))).status, url).toBe(404);
    expect((await request(app).get(`/api/exames-lab/documentos/${docClinica5}`).set(H(201))).status).toBe(404);
    expect((await request(app).get(`/api/exames-lab/documento/${docClinica5}/arquivo`).set(H(201))).status).toBe(404);
    expect((await request(app).patch(`/api/exames-lab/documento/${docClinica5}`).set(H(201)).send({ labName: "Invasor" })).status).toBe(404);
    expect((await request(app).get(`/api/exames-lab/doc-status/${docClinica5}`).set(H(201))).status).toBe(404);
    expect((await q(`SELECT lab_name FROM exam_documents WHERE id=$1`, [docClinica5]))[0].lab_name).toBeNull();
  });

  it("ingest em cliente de outra clínica é recusado e nada é gravado", async () => {
    const antes = (await q(`SELECT count(*)::int n FROM exam_documents`))[0].n;
    const r = await request(app).post("/api/exames-lab/ingest").set(H(201)).field("clientId", "1")
      .attach("file", PDF("invasor"), { filename: "i.pdf", contentType: "application/pdf" });
    expect(r.status).toBe(404);
    expect((await q(`SELECT count(*)::int n FROM exam_documents`))[0].n).toBe(antes);
  });

  it("ingest legítimo grava a clínica do CLIENTE, ignorando qualquer empresa enviada", async () => {
    const r = await request(app).post("/api/exames-lab/ingest").set(H(101)).field("clientId", "1").field("empresaId", "6")
      .attach("file", PDF("legitimo-1"), { filename: "ok.pdf", contentType: "application/pdf" });
    expect(r.status).toBe(202);
    expect((await q(`SELECT empresa_id FROM exam_documents WHERE id=$1`, [r.body.documentId]))[0].empresa_id).toBe(5);
  });

  it("monitor e auditoria listam só a própria clínica", async () => {
    await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id) VALUES (2,'mon-6','seis.pdf','erro',6)`);
    const m5 = await request(app).get("/api/exames-lab/monitor").set(H(101));
    expect(m5.status).toBe(200);
    expect(m5.body.pendentes.every((p: any) => p.client_id !== 2)).toBe(true);
    const m6 = await request(app).get("/api/exames-lab/monitor").set(H(201));
    expect(m6.body.pendentes.some((p: any) => p.client_id === 2)).toBe(true);
    expect(m6.body.pendentes.every((p: any) => p.client_id === 2)).toBe(true);
    const a6 = await request(app).get("/api/exames-lab/auditoria").set(H(201));
    expect(a6.status).toBe(200);
    expect(a6.body.eventos.every((e: any) => e.client_name === "Cliente Da Clínica Seis")).toBe(true);
  });

  it("listagem legítima devolve só documentos da própria clínica", async () => {
    const r5 = await request(app).get("/api/exames-lab/documentos").set(H(101));
    expect(r5.status).toBe(200);
    expect(r5.body.length).toBeGreaterThan(0);
    expect(r5.body.every((d: any) => d.clientId !== 2)).toBe(true);
    const r6 = await request(app).get("/api/exames-lab/documentos").set(H(201));
    expect(r6.body.every((d: any) => d.clientId === 2)).toBe(true);
  });

  it("recovery global e demonstração só para o proprietário da plataforma", async () => {
    expect((await request(app).post("/api/exames-lab/recovery").set(H(101))).status).toBe(403);
    expect((await request(app).post("/api/exames-lab/demo-conversao?clientId=1").set(H(101))).status).toBe(403);
  });

  it("proprietário da plataforma: demonstração exige cliente explícito e grava a clínica do cliente (nunca 5 fixo)", async () => {
    await q(`INSERT INTO professionals (id, name, empresa_id, category, role, professional_type, active, credential_version, is_platform_owner) VALUES (900,'Dono',6,'admin','admin','administrativo',true,0,true)`);
    expect((await request(app).post("/api/exames-lab/demo-conversao").set(H(900))).status).toBe(400);
    const r = await request(app).post("/api/exames-lab/demo-conversao?clientId=2").set(H(900));
    expect(r.status).toBe(200);
    expect((await q(`SELECT empresa_id FROM exam_documents WHERE id=$1`, [r.body.docId]))[0].empresa_id).toBe(6);
    expect((await request(app).post("/api/exames-lab/demo-conversao?clientId=1").set(H(900))).status).toBe(404);
  });
});

describe("importadores (Drive em massa e vigia): mesmo porteiro", () => {
  it("persistExtractionIfIdentityConfirmed: confirmado grava; contradição vira quarentena sem resultados", async () => {
    const { persistExtractionIfIdentityConfirmed } = await import("../lib/exam-extraction/verified-persist");
    const ok = (await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id) VALUES (1,'imp-ok','a','recebido',5) RETURNING id`))[0].id;
    const r1 = await persistExtractionIfIdentityConfirmed({ documentId: ok, clientId: 1, extracted: laudo({ cpf: CPF_A }, 2) as any, modelUsed: "m" });
    expect(r1).toEqual({ incorporated: true, analytes: 2 });
    const bad = (await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id) VALUES (1,'imp-bad','b','recebido',5) RETURNING id`))[0].id;
    const r2 = await persistExtractionIfIdentityConfirmed({ documentId: bad, clientId: 1, extracted: laudo({ cpf: CPF_B }, 2) as any, modelUsed: "m" });
    expect(r2).toEqual({ incorporated: false, verdict: "contradicao" });
    expect((await q(`SELECT status, raw_json FROM exam_documents WHERE id=$1`, [bad]))[0]).toEqual({ status: "quarentena", raw_json: null });
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [bad]))[0].n).toBe(0);
  });
});

describe("rotas do cliente em /api/area-paciente/exames (token do portal)", () => {
  const P = (id: number) => ({ Authorization: `Bearer ${portalToken(id)}` });
  it("sem token, com token de colaborador ou token adulterado: 401", async () => {
    for (const url of ["/api/area-paciente/exames/evolucao", "/api/area-paciente/exames/envios"]) {
      expect((await request(app).get(url)).status).toBe(401);
      expect((await request(app).get(url).set(H(101))).status).toBe(401);
      expect((await request(app).get(url).set({ Authorization: `Bearer ${portalToken(1).slice(0, -3)}abc` })).status).toBe(401);
    }
    expect((await request(app).post("/api/area-paciente/exames/enviar").attach("file", PDF("p"), { filename: "p.pdf", contentType: "application/pdf" })).status).toBe(401);
  });
  it("evolução responde para o próprio cliente e ignora clientId enviado na consulta", async () => {
    const r = await request(app).get("/api/area-paciente/exames/evolucao?clientId=2").set(P(1));
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("analytes");
    expect(JSON.stringify(r.body)).not.toMatch(/modelo-simulado|modelUsed/);
  });
  it("envio grava o cliente do TOKEN e a clínica do cadastro, ignorando clientId/empresaId do corpo", async () => {
    sim.extracted = laudo({ cpf: CPF_B }, 1);
    const r = await request(app).post("/api/area-paciente/exames/enviar").set(P(2)).field("clientId", "1").field("empresaId", "5")
      .attach("file", PDF("paciente-2"), { filename: "p2.pdf", contentType: "application/pdf" });
    expect(r.status).toBe(202);
    const [d] = await q(`SELECT client_id, empresa_id FROM exam_documents WHERE id=$1`, [r.body.documentId]);
    expect(d).toEqual({ client_id: 2, empresa_id: 6 });
  });
  it("recusa arquivo que não é PDF (mesmo com tipo declarado) e cliente sem clínica", async () => {
    const fake = await request(app).post("/api/area-paciente/exames/enviar").set(P(1)).attach("file", Buffer.from("MZ executavel"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(fake.status).toBe(400);
    const semClinica = await request(app).post("/api/area-paciente/exames/enviar").set(P(4)).attach("file", PDF("sc"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(semClinica.status).toBe(404);
  });
  it("lista de envios: só os do próprio cliente; quarentena aparece como conferência da equipe, sem motivo nem modelo", async () => {
    await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id, model_used) VALUES (1,'env-q','laudo-q.pdf','quarentena',5,'modelo-simulado')`);
    const r = await request(app).get("/api/area-paciente/exames/envios").set(P(1));
    expect(r.status).toBe(200);
    const item = r.body.find((i: any) => i.arquivo === "laudo-q.pdf");
    expect(item).toMatchObject({ etapa: "identidade", situacao: "Em conferência pela equipe", finalizado: false, analitos: 0 });
    expect(JSON.stringify(r.body)).not.toMatch(/modelo-simulado|contradicao|cpfFinal|motivos/i);
    const outro = await request(app).get("/api/area-paciente/exames/envios").set(P(2));
    expect(outro.body.every((i: any) => i.arquivo !== "laudo-q.pdf")).toBe(true);
  });
});

describe("desfazer da migração", () => {
  it("o script de desfazer remove só a tabela de verificações e é repetível; a migração volta a aplicar", async () => {
    const { readFileSync } = await import("node:fs");
    const down = readFileSync(new URL("../../../../scripts/migrations/rollback/exam-identity-checks.down.sql", import.meta.url), "utf8");
    const antes = (await q(`SELECT count(*)::int n FROM exam_documents`))[0].n;
    await pool.query(down);
    await pool.query(down);
    expect((await q(`SELECT to_regclass('exam_identity_checks') t`))[0].t).toBeNull();
    expect((await q(`SELECT count(*)::int n FROM exam_documents`))[0].n).toBe(antes);
    const { EXAM_IDENTITY_MIGRATION_SQL } = await import("../lib/ensure-exam-identity-schema");
    await pool.query(EXAM_IDENTITY_MIGRATION_SQL);
    expect((await q(`SELECT to_regclass('exam_identity_checks') t`))[0].t).not.toBeNull();
  });
});
