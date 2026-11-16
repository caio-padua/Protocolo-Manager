/**
 * SPEC 3 adendo 2 — orquestração das 3 IAs (SIMULADAS) e progresso REAL da classificação (nenhuma chamada real a IA).
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




const R = (name: string, value: string | null, unit: string | null, referenceRange: string | null = null) =>
  ({ name, value, unit, referenceRange, method: null, history: [] });
const laudoMaria = (analytes: any[]) => ({
  patient: { name: "Maria Aparecida de Souza Lima", cpf: CPF_A, birthDate: "15/03/1980" },
  collectionDate: "10/11/2026", labName: "Lab Sintético", analytes, confidence: 0.9,
});
const faixas5 = (code: string, prefixo: string, cortes: number[], sex = "any") => {
  const nomes = ["abaixo", "t1", "t2", "t3", "acima"]; const lim = [null, ...cortes, null];
  return nomes.map((n, i) => `('${code}','${prefixo}-${n}',${lim[i] ?? "null"},${lim[i + 1] ?? "null"},'#888',${i + 1},'${sex}','seed')`).join(",");
};
const conferir = (id: number, fase: number, as: number) =>
  request(app).patch(`/api/exames-lab/documentos/${id}/conferir`).set(H(as)).send({ fase });
const envios = (clientId: number) => request(app).get("/api/area-paciente/exames/envios").set("Authorization", `Bearer ${portalToken(clientId)}`);
let n = 0;
async function processar(extracted: any, settings: Record<string, string> = {}, extras: { claude?: any; openai?: any } = {}) {
  sim.settings = { "exames.triagemAtiva": "false", ...settings };
  sim.extracted = extracted; sim.claude = extras.claude ?? null; sim.openai = extras.openai ?? null;
  n++;
  const id = await novoDocumento(1, `orq-${n}`);
  await processExamDocument({ documentId: id, clientId: 1, buffer: PDF(`orq-${n}`), fileName: `orq-${n}.pdf`, notify: false });
  return id;
}
const envioDe = async (id: number) => { const r = await envios(1); if (!Array.isArray(r.body)) throw new Error(`envios ${r.status} ${JSON.stringify(r.body)}`); return r.body.find((e: any) => e.id === id); };

beforeAll(async () => {
  await pool.query(`INSERT INTO exam_analyte_catalog (code, display_name, synonyms, canonical_unit, kind, active, sex_dependent) VALUES
    ('glicose','Glicose','["glicose","glicemia"]','mg/dL','blood',true,false),
    ('tsh','TSH','["tsh"]','mUI/L','blood',true,false),
    ('ferritina','Ferritina','["ferritina"]','ng/mL','blood',true,true)`);
  await pool.query(`INSERT INTO exam_analyte_units (analyte_code, unit, factor_to_canonical, is_canonical, active) VALUES
    ('glicose','mg/dL',1,true,true),('glicose','mmol/L',18,false,true),('tsh','mUI/L',1,true,true),('ferritina','ng/mL',1,true,true)`);
  await pool.query(`INSERT INTO exam_analyte_ranges (analyte_code, faixa_name, low, high, color, ordem, sex, source) VALUES
    ${faixas5("glicose", "G", [70, 90, 100, 126])},
    ${faixas5("ferritina", "FM", [30, 100, 200, 400], "male")},
    ${faixas5("ferritina", "FF", [15, 50, 120, 200], "female")}`);
});

describe("orquestração das 3 IAs (simuladas): o que o pipeline grava, sem presumir quem está ligado", () => {
  it("padrão (só Gemini ligado): 1 leitura, sem reconciliação", async () => {
    const id = await processar(laudoMaria([R("Glicose", "85", "mg/dL")]));
    const [d] = await q(`SELECT llm_pipeline FROM exam_documents WHERE id=$1`, [id]);
    expect(d.llm_pipeline.map((p: any) => p.provider)).toEqual(["gemini"]);
    const { resumirLeituras } = await import("../lib/exam-progresso-resultados");
    expect(resumirLeituras(d.llm_pipeline)).toMatchObject({ leituras: ["gemini"], reconciliacao: "nao_aplicavel" });
  });
  it("3 IAs ligadas e concordantes: 3 leituras e reconciliação concluída", async () => {
    const lau = laudoMaria([R("Glicose", "85", "mg/dL")]);
    const id = await processar(lau, { "exames.llmClaudeAtivo": "true", "exames.llmOpenaiAtivo": "true" }, { claude: lau, openai: lau });
    const [d] = await q(`SELECT llm_pipeline FROM exam_documents WHERE id=$1`, [id]);
    const { resumirLeituras } = await import("../lib/exam-progresso-resultados");
    expect(resumirLeituras(d.llm_pipeline)).toMatchObject({ leituras: ["gemini", "claude", "openai"], reconciliacao: "concluida", analitosRetiradosPorConflito: 0 });
  });
  it("Gemini desligado e Claude ligado: só a leitura do Claude", async () => {
    const lau = laudoMaria([R("Glicose", "85", "mg/dL")]);
    const id = await processar(lau, { "exames.llmGeminiAtivo": "false", "exames.llmClaudeAtivo": "true" }, { claude: lau });
    const [d] = await q(`SELECT llm_pipeline FROM exam_documents WHERE id=$1`, [id]);
    const { resumirLeituras } = await import("../lib/exam-progresso-resultados");
    expect(resumirLeituras(d.llm_pipeline).leituras).toEqual(["claude"]);
  });
  it("leituras divergentes no valor: o analito é retirado, nunca escolhido (com_conflitos)", async () => {
    const a = laudoMaria([R("Glicose", "85", "mg/dL")]);
    const b = laudoMaria([R("Glicose", "95", "mg/dL")]);
    const id = await processar(a, { "exames.llmClaudeAtivo": "true" }, { claude: b });
    const [d] = await q(`SELECT llm_pipeline FROM exam_documents WHERE id=$1`, [id]);
    const { resumirLeituras } = await import("../lib/exam-progresso-resultados");
    const r = resumirLeituras(d.llm_pipeline);
    expect(r.reconciliacao).toBe("com_conflitos");
    expect(r.analitosRetiradosPorConflito).toBeGreaterThan(0);
  });
  it("todas desligadas: erro explícito, nenhum resultado, marco de falha; resumo sem pipeline = indisponível", async () => {
    sim.settings = { "exames.llmGeminiAtivo": "false" };
    sim.extracted = laudoMaria([R("Glicose", "85", "mg/dL")]);
    const id = await novoDocumento(1, "orq-off");
    await processExamDocument({ documentId: id, clientId: 1, buffer: PDF("orq-off"), fileName: "off.pdf", notify: false });
    expect((await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]))[0].status).toBe("erro");
    expect((await q(`SELECT count(*)::int c FROM exam_results WHERE exam_document_id=$1`, [id]))[0].c).toBe(0);
    const { resumirLeituras } = await import("../lib/exam-progresso-resultados");
    expect(resumirLeituras(null).reconciliacao).toBe("indisponivel");
  });
});

describe("progresso REAL dos resultados na rota de envios do cliente", () => {
  it("mapeado x não mapeado, conversão conhecida x ausente, cinco zonas x classificação simples", async () => {
    const id = await processar(laudoMaria([
      R("Glicose", "5,0", "mmol/L"),                 // convertido (x18=90) -> zona institucional G-t2
      R("TSH", "2,1", "mUI/L", "0,4 a 4,0"),          // mapeado, sem faixa institucional -> simples "dentro"
      R("Analito Desconhecido", "7", "u/L"),          // não mapeado (triagem desligada) -> excluído
      R("Glicose", "4", "stranges"),                   // unidade sem fator -> conferência, excluído
    ]));
    const e = await envioDe(id);
    expect(e.resultados.total).toBe(4);
    expect(e.resultados.excluidos).toEqual({ naoMapeados: 1, semUnidadeHomologada: 1, semValorNumerico: 0 });
    expect(e.resultados).toMatchObject({ elegiveis: 2, convertidos: 1, cincoZonas: 1, simples: 1, divergentes: 0, pendentes: 1 });
    const [g] = await q(`SELECT status FROM exam_results WHERE exam_document_id=$1 AND analyte_code='glicose' AND status LIKE 'G-%'`, [id]);
    expect(g.status).toBe("G-t2");
  });
  it("sexo/contexto: ferritina sexo-dependente usa a faixa do sexo do cadastro; sem sexo não escolhe faixa", async () => {
    await pool.query(`UPDATE clients SET ficha_clinica='{"sexo":"F"}' WHERE id=1`);
    let id = await processar(laudoMaria([R("Ferritina", "40", "ng/mL")]));
    expect((await q(`SELECT status FROM exam_results WHERE exam_document_id=$1`, [id]))[0].status).toBe("FF-t1");
    expect((await envioDe(id)).resultados).toMatchObject({ elegiveis: 1, cincoZonas: 1, pendentes: 0 });
    await pool.query(`UPDATE clients SET ficha_clinica='{}' WHERE id=1`);
    id = await processar(laudoMaria([R("Ferritina", "40", "ng/mL", "30 a 400")]));
    const e = await envioDe(id);
    expect((await q(`SELECT status FROM exam_results WHERE exam_document_id=$1`, [id]))[0].status).toBe("dentro");
    expect(e.resultados).toMatchObject({ elegiveis: 1, cincoZonas: 0, simples: 1, faltaSexo: 1, pendentes: 1 });
  });
  it("registro gravado que diverge da zona atual (faixa editada depois) vira divergente, nunca classificado", async () => {
    const id = await processar(laudoMaria([R("Glicose", "85", "mg/dL")]));
    await pool.query(`UPDATE exam_results SET status='dentro' WHERE exam_document_id=$1`, [id]);
    expect((await envioDe(id)).resultados).toMatchObject({ elegiveis: 1, cincoZonas: 0, divergentes: 1, pendentes: 1 });
  });
  it("0 a 100% sem salto: 100% só após C1 e C2 reais; a contagem de classificação não muda com a conferência", async () => {
    const id = await processar(laudoMaria([R("Glicose", "85", "mg/dL")]));
    let e = await envioDe(id);
    const antes = JSON.stringify(e.resultados);
    expect(e.percentual).toBeLessThan(100);
    expect((await conferir(id, 1, 102)).status).toBe(200);
    e = await envioDe(id);
    expect(e.percentual).toBeLessThan(100);
    expect((await conferir(id, 2, 101)).status).toBe(200);
    e = await envioDe(id);
    expect(e.percentual).toBe(100);
    expect(JSON.stringify(e.resultados)).toBe(antes);
    expect(e.resultados).toMatchObject({ elegiveis: 1, cincoZonas: 1, pendentes: 0 });
  });
  it("tenant: o resumo de um cliente nunca aparece para outro", async () => {
    const id = await processar(laudoMaria([R("Glicose", "85", "mg/dL")]));
    const outro = (await envios(2)).body as any[];
    expect(outro.find((x) => x.id === id)).toBeUndefined();
    expect(JSON.stringify(outro)).not.toContain("Glicose");
  });
});

describe("Cockpit: rota /exames-lab/progresso (equipe)", () => {
  it("sem login = 401; enfermagem da clínica do cliente lê; outra clínica = recusa; mesma contagem do cliente", async () => {
    const id = await processar(laudoMaria([R("Glicose", "85", "mg/dL")]));
    expect((await request(app).get("/api/exames-lab/progresso?clientId=1")).status).toBe(401);
    const ok = await request(app).get("/api/exames-lab/progresso?clientId=1").set(H(102));
    expect(ok.status).toBe(200);
    const doCliente = (await envioDe(id)).resultados;
    expect(ok.body[String(id)]).toMatchObject({ elegiveis: doCliente.elegiveis, cincoZonas: doCliente.cincoZonas, pendentes: doCliente.pendentes });
    expect((await request(app).get("/api/exames-lab/progresso?clientId=1").set(H(201))).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).get("/api/exames-lab/progresso?clientId=abc").set(H(102))).status).toBe(400);
  });
});
