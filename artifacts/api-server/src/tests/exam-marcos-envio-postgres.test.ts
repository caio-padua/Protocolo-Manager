/**
 * SPEC 3 (adendo 16/11/2026) — painel "Envios recentes": marcos explícitos, banco descartável, dados 100% sintéticos.
 * Cadeia real: processExamDocument grava marcos; identidade vem de exam_identity_checks; C1/C2 pela rota real de conferência;
 * leitura pelo endpoint do portal com token real. Simulados: IA, Drive, cofre, e-mail, WhatsApp (nada sai da máquina).
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
  app.use("/api", (await import("../routes/exam-conference")).default);
  app.use("/api", (await import("../routes/exames-lab")).default);
  app.use("/api", (await import("../routes/exames-paciente")).default);
  portalToken = (await import("../lib/portal-token")).createPortalToken;
}, 120_000);

afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(() => { vi.clearAllMocks(); sim.emitterOk = true; });

const laudoMaria = () => ({
  patient: { name: "Maria Aparecida de Souza Lima", cpf: CPF_A, birthDate: "15/03/1980" },
  collectionDate: "10/11/2026", labName: "Lab Sintético",
  analytes: [{ name: "Glicose", value: "90", unit: "mg/dL", referenceRange: "70 a 99", method: null, history: [] }],
  confidence: 0.9,
});
const envios = (clientId: number | null) => {
  const r = request(app).get("/api/area-paciente/exames/envios");
  return clientId === null ? r : r.set("Authorization", `Bearer ${portalToken(clientId)}`);
};
const doEnvio = async (clientId: number, id: number) => (await envios(clientId)).body.find((e: any) => e.id === id);
const estados = (e: any) => e.etapas.map((x: any) => x.estado[0]).join("");
const conferir = (id: number, fase: number, as: number) =>
  request(app).patch(`/api/exames-lab/documentos/${id}/conferir`).set(H(as)).send({ fase });

describe("Envios recentes: marcos reais de 0 a 100%", () => {
  it("fluxo completo: upload, leitura, dados, identidade automática, C1, C2 = 100% somente no fim", async () => {
    sim.extracted = laudoMaria();
    const id = await novoDocumento(1, "marcos-ok");
    let e = await doEnvio(1, id);
    expect(estados(e)).toBe("cppppp"); expect(e.percentual).toBe(17);

    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF("marcos-ok"), fileName: "m.pdf", notify: false });
    e = await doEnvio(1, id);
    expect(estados(e)).toBe("cccc" + "pp"); expect(e.percentual).toBe(67);
    expect(e.etapas[3].metodo).toMatch(/automática/);
    expect(e.percentual).toBeLessThan(100);

    expect((await conferir(id, 1, 102)).status).toBe(200);
    e = await doEnvio(1, id);
    expect(estados(e)).toBe("ccccc" + "p"); expect(e.percentual).toBe(83);

    expect((await conferir(id, 2, 101)).status).toBe(200);
    e = await doEnvio(1, id);
    expect(estados(e)).toBe("cccccc"); expect(e.percentual).toBe(100);
    expect(e.etapaAvancada.estado).toBe("pendente");
    // Nada identificável do conferente ou do paciente vai ao portal.
    expect(JSON.stringify(e)).not.toMatch(/Médica Cinco|Enfermeira Cinco|529\.982|CPF_A/);
  });

  it("identidade não confirmada: quarentena = identidade pendente 'aguardando equipe'; sem 100%", async () => {
    sim.extracted = { ...laudoMaria(), patient: { name: "Outra Pessoa Totalmente Diferente", cpf: CPF_B, birthDate: "02/02/1970" } };
    const id = await novoDocumento(1, "marcos-quarentena");
    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF("marcos-quarentena"), fileName: "q.pdf", notify: false });
    const e = await doEnvio(1, id);
    expect(e.etapas[3].estado).toBe("pendente"); expect(e.etapas[3].metodo).toBe("Aguardando conferência da equipe");
    expect(e.percentual).toBeLessThan(100);
  });

  it("falha de leitura: etapa falhou, sem 100%", async () => {
    sim.extracted = null;
    const id = await novoDocumento(1, "marcos-falha");
    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF("marcos-falha"), fileName: "f.pdf", notify: false });
    const e = await doEnvio(1, id);
    expect(e.etapa).toBe("erro"); expect(e.etapas.some((x: any) => x.estado === "falhou")).toBe(true); expect(e.percentual).toBeLessThan(100);
  });

  it("status 'recebido' sem registro de identidade NÃO conclui identificação (envio legado)", async () => {
    const [{ id }] = await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id) VALUES (1,'legado-recebido','legado.pdf','recebido',5) RETURNING id`);
    const e = await doEnvio(1, id);
    expect(e.etapas[3].estado).toBe("pendente"); expect(e.percentual).toBeLessThan(100);
  });
});

describe("Envios recentes: acesso", () => {
  it("sem token = 401; token de outro cliente não enxerga envios do primeiro", async () => {
    expect((await envios(null)).status).toBe(401);
    sim.extracted = laudoMaria();
    const id = await novoDocumento(1, "marcos-cruzado");
    const doOutro = await envios(2);
    expect(doOutro.status).toBe(200);
    expect(doOutro.body.find((e: any) => e.id === id)).toBeUndefined();
    expect((await envios(1)).body.find((e: any) => e.id === id)).toBeDefined();
  });
  it("C2 antes de C1 continua recusado e não gera 100%", async () => {
    const id = await novoDocumento(1, "marcos-ordem");
    await q(`UPDATE exam_documents SET status='recebido' WHERE id=$1`, [id]);
    expect((await conferir(id, 2, 101)).status).toBe(409);
    expect((await doEnvio(1, id)).percentual).toBeLessThan(100);
  });
});
