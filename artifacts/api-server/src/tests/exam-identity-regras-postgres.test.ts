/**
 * Depuração de Exames — regras de identidade por clínica (variantes com CPF, preliminar, auditoria, métricas).
 * Dados 100% sintéticos, PostgreSQL descartável, cadeia REAL de autenticação.
 * Simulado de propósito: leitura do modelo de IA e texto do PDF, Drive, cofre R2, e-mail e WhatsApp.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { createTableFromSchema } from "./helpers/schema-ddl";

const sim = vi.hoisted(() => ({
  extracted: null as any,
  pdfText: "laudo sintético",
  drive: { upload: vi.fn(async () => ({ fileId: "drive-sintetico" })), rename: vi.fn(), structure: vi.fn(async () => ({ subfolders: { EXAMES: "pasta" } })) },
  mirror: vi.fn(async () => ({ r2Key: "k", bytes: 1, alreadyExists: false })),
  mail: vi.fn(), wpp: vi.fn(),
  emitterOk: true,
}));

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async () => null) }));
vi.mock("../lib/exam-extraction/pdf-text", () => ({ extractPdfText: vi.fn(async () => ({ text: sim.pdfText, charCount: sim.pdfText.length })), compactExamText: (t: string) => t, inferLabName: () => null }));
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

function cpfDe(base9: string): string {
  const dv = (digits: string) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * (digits.length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = dv(base9);
  const d2 = dv(base9 + d1);
  const n = base9 + d1 + d2;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}
const CPF_DAY = cpfDe("390533447");
const CPF_OTHER = cpfDe("168995350");
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
  // Banco "anterior": tabela na versão antiga (lista curta de eventos, sem colunas novas) com um registro legado.
  await pool.query(`CREATE TABLE exam_identity_checks (
    id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
    event TEXT NOT NULL CHECK (event IN ('verificacao', 'liberacao_humana', 'rejeicao_humana')),
    verdict TEXT CHECK (verdict IN ('confirmada', 'revisao', 'contradicao')),
    field_results JSONB, reasons JSONB, extracted_json JSONB, extracted_cpf_masked TEXT, professional_id INTEGER, note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`INSERT INTO exam_identity_checks (document_id, empresa_id, client_id, event, verdict) VALUES (7777, 5, 1, 'verificacao', 'confirmada')`);
  await (await import("../lib/ensure-exam-identity-schema")).ensureExamIdentitySchema();

  await pool.query(`INSERT INTO empresas (id, nome) VALUES (5,'Clínica Cinco'),(6,'Clínica Seis')`);
  await pool.query(`INSERT INTO professionals (id, name, empresa_id, category, role, professional_type, crm, registration_council, active, credential_version) VALUES
    (101,'Médica Cinco',5,'medico','medico','medico','12345 SP','CRM',true,0),
    (102,'Enfermeira Cinco',5,'enfermagem','enfermagem','enfermagem',null,null,true,0),
    (201,'Médico Seis',6,'medico','medico','medico','54321 RJ','CRM',true,0),
    (103,'Médica Inativa',5,'medico','medico','medico','99999 SP','CRM',false,0)`);
  await pool.query(`INSERT INTO clients (id, name, cpf, birth_date, empresa_id, status) VALUES
    (1,'Maria Aparecida de Souza Lima','${CPF_A}','15/03/1980',5,'active'),
    (10,'Dayana de Sousa Ferreira','${CPF_DAY}','21/07/1990',5,'active'),
    (11,'Dayana de Sousa Ferreira','${cpfDe("123456789")}','21/07/1990',5,'active'),
    (12,'Dayana de Sousa Ferreira','${cpfDe("987654321")}','21/07/1990',5,'active'),
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
beforeEach(() => { vi.clearAllMocks(); sim.pdfText = "laudo sintético"; });

const API = "/api/exames-lab";
const VARIANTE = "Dai ana Sousa Ferreira";
let seq = 0;
async function processar(clientId: number, patient: Record<string, any>, extra: Record<string, any> = {}) {
  sim.extracted = { ...laudo(patient, 2), ...extra };
  const id = await novoDocumento(clientId, `d-${++seq}`);
  await processExamDocument({ documentId: id, clientId, buffer: PDF(`b-${seq}`), fileName: "x.pdf" });
  const [doc] = await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]);
  const [check] = await q(`SELECT * FROM exam_identity_checks WHERE document_id=$1 AND event='verificacao'`, [id]);
  const resultados = (await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n as number;
  return { id, status: doc.status as string, check, resultados };
}

describe("migração sobre banco anterior", () => {
  it("preserva o registro legado, acrescenta colunas e passa a aceitar os eventos de auditoria", async () => {
    const [legado] = await q(`SELECT decision, rule_set_version, trail, verdict FROM exam_identity_checks WHERE document_id=7777`);
    expect(legado).toMatchObject({ decision: null, rule_set_version: null, trail: null, verdict: "confirmada" });
    await q(`INSERT INTO exam_identity_checks (document_id, empresa_id, client_id, event) VALUES (7778, 5, 1, 'auditoria_confirmou')`);
    await expect(pool.query(`INSERT INTO exam_identity_checks (document_id, empresa_id, client_id, event) VALUES (7779, 5, 1, 'evento_inventado')`)).rejects.toThrow(/check/i);
    const { EXAM_IDENTITY_MIGRATION_SQL } = await import("../lib/ensure-exam-identity-schema");
    await pool.query(EXAM_IDENTITY_MIGRATION_SQL); // idempotente
  });
  it("versões de regras e histórico de decisões são imutáveis", async () => {
    await q(`INSERT INTO exam_identity_rule_sets (empresa_id, version, config, note) VALUES (99, 1, '{}'::jsonb, 'teste de imutabilidade')`);
    await expect(pool.query(`UPDATE exam_identity_rule_sets SET note='x' WHERE empresa_id=99`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM exam_identity_rule_sets WHERE empresa_id=99`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`INSERT INTO exam_identity_rule_sets (empresa_id, version, config, note) VALUES (99, 1, '{}'::jsonb, 'dup')`)).rejects.toThrow(/unique|duplicate/i);
  });
});

describe("variante de grafia com CPF igual (regra padrão)", () => {
  it("Dai ana x Dayana: entra no prontuário, grava decisão, versão, trilha e apelido", async () => {
    const r = await processar(10, { name: VARIANTE, cpf: CPF_DAY, birthDate: "21/07/1990" });
    expect(r.status).toBe("recebido");
    expect(r.resultados).toBe(2);
    expect(r.check).toMatchObject({ verdict: "confirmada", decision: "incorporar_com_alias", rule_set_version: 0, extracted_json: null });
    expect(JSON.stringify(r.check.trail)).toMatch(/Decisão/);
    expect(JSON.stringify(r.check)).not.toContain(CPF_DAY);
    expect(JSON.stringify(r.check)).not.toContain(CPF_DAY.replace(/\D/g, ""));
    const alias = await q(`SELECT alias_normalized, revoked_at FROM exam_identity_aliases WHERE client_id=10`);
    expect(alias).toEqual([{ alias_normalized: "DAI ANA SOUSA FERREIRA", revoked_at: null }]);
  });
  it("o mesmo texto não duplica o apelido ao reprocessar outro laudo", async () => {
    await processar(10, { name: VARIANTE, cpf: CPF_DAY });
    expect(await q(`SELECT 1 FROM exam_identity_aliases WHERE client_id=10`)).toHaveLength(1);
  });
  it("homônimo (mesmo nome e nascimento, CPF de outra pessoa): quarentena e nenhum apelido", async () => {
    const r = await processar(10, { name: "Dayana de Sousa Ferreira", cpf: CPF_OTHER, birthDate: "21/07/1990" });
    expect(r.status).toBe("quarentena");
    expect(r.check).toMatchObject({ verdict: "contradicao", decision: "quarentena" });
    expect(r.resultados).toBe(0);
  });
  it("nascimento explicitamente diferente com CPF igual: quarentena", async () => {
    const r = await processar(10, { name: VARIANTE, cpf: CPF_DAY, birthDate: "22/07/1990" });
    expect(r.status).toBe("quarentena");
  });
  it("dois CPFs válidos distintos no texto do laudo: quarentena mesmo com CPF e nome iguais", async () => {
    sim.pdfText = `Paciente Dayana\nCPF ${CPF_DAY}\nAcompanhante\nCPF ${CPF_OTHER}`;
    const r = await processar(10, { name: "Dayana de Sousa Ferreira", cpf: CPF_DAY });
    expect(r.status).toBe("quarentena");
    expect(r.resultados).toBe(0);
    expect(JSON.stringify(r.check.reasons)).toMatch(/CPFs válidos distintos/);
  });
  it("coleta anterior ao nascimento: quarentena", async () => {
    const r = await processar(10, { name: "Dayana de Sousa Ferreira", cpf: CPF_DAY }, { collectionDate: "01/01/1980" });
    expect(r.status).toBe("quarentena");
    expect(r.check.verdict).toBe("contradicao");
  });
});

describe("CPF ausente: análise preliminar sem entrar no prontuário", () => {
  it("variante + nascimento igual = preliminar: zero resultados, prévia visível só a colaborador da clínica", async () => {
    const r = await processar(12, { name: VARIANTE, birthDate: "21/07/1990" });
    expect(r.status).toBe("quarentena");
    expect(r.resultados).toBe(0);
    expect(r.check.decision).toBe("preliminar");
    const detalhe = await request(app).get(`${API}/documentos/${r.id}/identidade`).set(H(101));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.decisao).toBe("preliminar");
    expect(detalhe.body.previa.aviso).toMatch(/não estão no prontuário/);
    expect(detalhe.body.previa.analitos).toHaveLength(2);
    expect((await request(app).get(`${API}/documentos/${r.id}/identidade`).set(H(201))).status).toBe(404);
  });
  it("nome exato + nascimento igual sem CPF entra; só nome nunca entra", async () => {
    expect((await processar(12, { name: "Dayana de Sousa Ferreira", birthDate: "21/07/1990" })).status).toBe("recebido");
    expect((await processar(12, { name: "Dayana de Sousa Ferreira" })).status).toBe("quarentena");
  });
});

describe("matriz de regras da clínica", () => {
  const putRegras = (prof: number, body: any) => request(app).put(`${API}/identidade/regras`).set(H(prof)).send(body);
  it("exige sessão; clínica vem da sessão; padrão global na versão 0", async () => {
    expect((await request(app).get(`${API}/identidade/regras`)).status).toBe(401);
    const r = await request(app).get(`${API}/identidade/regras`).set(H(101));
    expect(r.status).toBe(200);
    expect(r.body.versaoVigente).toBe(0);
    expect(r.body.limitesGlobais.length).toBeGreaterThan(3);
  });
  it("enfermagem não altera regras; justificativa curta e valores fora do limite são recusados", async () => {
    expect((await putRegras(102, { regras: { variantesComCpf: false }, justificativa: "justificativa longa o bastante" })).status).toBe(403);
    expect((await putRegras(101, { regras: { variantesComCpf: false }, justificativa: "curta" })).status).toBe(400);
    const foraDoLimite = await putRegras(101, { regras: { distanciaMaximaEdicao: 5 }, justificativa: "justificativa longa o bastante" });
    expect(foraDoLimite.status).toBe(400);
    expect(foraDoLimite.body.detalhes[0]).toMatch(/limite global/);
    expect((await putRegras(101, { regras: { desligarCpf: true }, justificativa: "justificativa longa o bastante" })).status).toBe(400);
    expect((await request(app).get(`${API}/identidade/regras`).set(H(101))).body.versaoVigente).toBe(0);
  });
  it("nova versão vale para os próximos laudos, é registrada e NÃO muda a outra clínica", async () => {
    const ok = await putRegras(101, { regras: { variantesComCpf: false }, justificativa: "Clínica prefere revisar toda variante por enquanto" });
    expect(ok.status).toBe(201);
    expect(ok.body.versao).toBe(1);
    const r = await processar(10, { name: "Dayana de Souza Ferreira", cpf: CPF_DAY });
    expect(r.status).toBe("quarentena");
    expect(r.check.rule_set_version).toBe(1);
    const outra = await request(app).get(`${API}/identidade/regras`).set(H(201));
    expect(outra.body.versaoVigente).toBe(0);
    expect(outra.body.historico).toEqual([]);
    const minha = await request(app).get(`${API}/identidade/regras`).set(H(101));
    expect(minha.body.historico).toHaveLength(1);
    expect(minha.body.historico[0]).toMatchObject({ version: 1, createdBy: 101 });
    // volta ao padrão como NOVA versão (nada é editado nem apagado)
    const volta = await putRegras(101, { regras: {}, justificativa: "Voltando ao padrão após revisão do mês" });
    expect(volta.body.versao).toBe(2);
    expect((await processar(10, { name: "Dayana de Souza Ferreira", cpf: CPF_DAY })).check.rule_set_version).toBe(2);
  });
  it("duas gravações simultâneas geram versões distintas", async () => {
    const [a, b] = await Promise.all([
      putRegras(101, { regras: { exigirNascimentoParaAutoAceite: false }, justificativa: "gravação simultânea número um" }),
      putRegras(101, { regras: { exigirNascimentoParaAutoAceite: false }, justificativa: "gravação simultânea número dois" }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(new Set([a.body.versao, b.body.versao]).size).toBe(2);
  });
  it("configuração gravada ilegível aplica o modo mais rígido e avisa na trilha (nunca o mais frouxo)", async () => {
    await q(`INSERT INTO exam_identity_rule_sets (empresa_id, version, config, note) VALUES (6, 1, '{"regraInventada": true}'::jsonb, 'corrompida de propósito')`);
    sim.extracted = laudo({ name: "Clientte Da Clinica Seis", cpf: CPF_B }, 1);
    const id = await novoDocumento(2, "rigido");
    await processExamDocument({ documentId: id, clientId: 2, buffer: PDF("rigido"), fileName: "r.pdf" });
    const [c] = await q(`SELECT decision, trail FROM exam_identity_checks WHERE document_id=$1`, [id]);
    expect(c.decision).toBe("quarentena");
    expect(JSON.stringify(c.trail)).toMatch(/modo mais rígido/);
    expect((await request(app).get(`${API}/identidade/regras`).set(H(201))).body.degradado).toBe(true);
  });
});

describe("auditoria posterior dos auto-aceites e histórico", () => {
  let docConfirma = 0;
  let docIncorreto = 0;
  const auditar = (prof: number, id: number, body: any) => request(app).post(`${API}/documentos/${id}/identidade/auditoria`).set(H(prof)).send(body);

  it("lista auto-aceites só da clínica da sessão, com trilha, e filtra pendentes", async () => {
    docConfirma = (await processar(10, { name: "Dayana Ferreira", cpf: CPF_DAY })).id;
    docIncorreto = (await processar(11, { name: "Daiana Sousa Ferreira", cpf: cpfDe("123456789") })).id;
    const lista = await request(app).get(`${API}/identidade/auto-aceitos?somenteComApelido=1`).set(H(101));
    expect(lista.status).toBe(200);
    const ids = lista.body.itens.map((i: any) => i.documentId);
    expect(ids).toEqual(expect.arrayContaining([docConfirma, docIncorreto]));
    expect(lista.body.itens[0].trilha.length).toBeGreaterThan(2);
    expect(JSON.stringify(lista.body)).not.toContain(CPF_DAY.replace(/\D/g, ""));
    const outraClinica = await request(app).get(`${API}/identidade/auto-aceitos`).set(H(201));
    expect(outraClinica.body.itens.map((i: any) => i.documentId)).not.toContain(docConfirma);
  });
  it("auditar exige sessão, vínculo, justificativa e resultado válidos; outra clínica recebe 404", async () => {
    expect((await request(app).post(`${API}/documentos/${docConfirma}/identidade/auditoria`).send({})).status).toBe(401);
    expect((await auditar(101, docConfirma, { resultado: "talvez", justificativa: "justificativa suficiente" })).status).toBe(400);
    expect((await auditar(101, docConfirma, { resultado: "confirmou", justificativa: "curta" })).status).toBe(400);
    expect((await auditar(201, docConfirma, { resultado: "confirmou", justificativa: "justificativa suficiente" })).status).toBe(404);
    expect((await request(app).get(`${API}/documentos/${docConfirma}/identidade/historico`).set(H(201))).status).toBe(404);
  });
  it("não audita documento que foi para quarentena (esse caminho é a decisão humana)", async () => {
    const q1 = await processar(10, { name: "Dayana de Sousa Ferreira", cpf: CPF_OTHER });
    expect((await auditar(101, q1.id, { resultado: "confirmou", justificativa: "justificativa suficiente" })).status).toBe(409);
  });
  it("confirmar vale uma vez; duas confirmações simultâneas gravam uma só", async () => {
    const [a, b] = await Promise.all([
      auditar(101, docConfirma, { resultado: "confirmou", justificativa: "conferi no cadastro: mesma pessoa" }),
      auditar(101, docConfirma, { resultado: "confirmou", justificativa: "conferi no cadastro: mesma pessoa" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await q(`SELECT 1 FROM exam_identity_checks WHERE document_id=$1 AND event LIKE 'auditoria%'`, [docConfirma])).toHaveLength(1);
  });
  it("vínculo incorreto: documento sai de circulação, nada é apagado, apelido é revogado, status anterior fica registrado", async () => {
    const r = await auditar(101, docIncorreto, { resultado: "vinculo_incorreto", justificativa: "era outra paciente de mesmo nome" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ statusAnterior: "recebido", statusAtual: "identidade_rejeitada" });
    expect((await q(`SELECT status FROM exam_documents WHERE id=$1`, [docIncorreto]))[0].status).toBe("identidade_rejeitada");
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [docIncorreto]))[0].n).toBe(2);
    expect((await q(`SELECT revoked_at FROM exam_identity_aliases WHERE first_document_id=$1`, [docIncorreto]))[0].revoked_at).not.toBeNull();
    const h = await request(app).get(`${API}/documentos/${docIncorreto}/identidade/historico`).set(H(101));
    expect(h.body.eventos.map((e: any) => e.evento)).toEqual(["verificacao", "auditoria_vinculo_incorreto"]);
    expect(h.body.eventos[0]).toMatchObject({ decisao: "incorporar_com_alias" });
    expect(JSON.stringify(h.body.eventos[1].trilha)).toMatch(/recebido/);
    expect((await auditar(101, docIncorreto, { resultado: "confirmou", justificativa: "mudei de ideia depois" })).status).toBe(409);
  });
  it("apelido revogado deixa de valer: o mesmo nome volta a ser variante comum (e com CPF diferente, quarentena)", async () => {
    const r = await processar(11, { name: "Daiana Sousa Ferreira", cpf: CPF_OTHER });
    expect(r.status).toBe("quarentena");
  });
});

describe("métricas de falso bloqueio e de erro de vinculação", () => {
  it("clínica sem decisões ainda: taxas nulas, nunca 0%", async () => {
    const r = await request(app).get(`${API}/identidade/metricas`).set(H(201));
    expect(r.status).toBe(200);
    for (const v of r.body.porVersao) {
      expect(v.taxaErroVinculacaoPct).toBeNull();
    }
    expect(r.body.leitura).toMatch(/nunca equivale a 0%/);
  });
  it("conta por versão das regras; libera humano = falso bloqueio provável; vínculo incorreto = erro de vinculação", async () => {
    // um bloqueio liberado por humano (homônimo CPF diferente exigiria médica; usa revisão simples)
    sim.extracted = laudo({ name: "Maria Aparecida de Souza Lima" }, 2); // só nome => quarentena (revisão)
    const idBloq = await novoDocumento(1, "bloqueio-liberado");
    const { saveInternalCopy } = await import("../lib/exam-file-store");
    await saveInternalCopy({ documentId: idBloq, fileName: "b.pdf", mimeType: "application/pdf", buffer: PDF("bloqueio-liberado") });
    await processExamDocument({ documentId: idBloq, clientId: 1, buffer: PDF("bloqueio-liberado"), fileName: "b.pdf" });
    const bloq = { id: idBloq };
    const lib = await request(app).post(`${API}/documentos/${bloq.id}/identidade/liberar`).set(H(101)).send({ justificativa: "conferido com documento físico" });
    expect(lib.status).toBe(200);
    const m = await request(app).get(`${API}/identidade/metricas`).set(H(101));
    const total = m.body.porVersao.reduce((acc: any, v: any) => ({
      liberados: acc.liberados + v.bloqueiosLiberadosPorHumano,
      incorretos: acc.incorretos + v.vinculosIncorretos,
      auditados: acc.auditados + v.autoAceitosAuditados,
      autoAceitos: acc.autoAceitos + v.autoAceitos,
    }), { liberados: 0, incorretos: 0, auditados: 0, autoAceitos: 0 });
    expect(total.liberados).toBeGreaterThanOrEqual(1);
    expect(total.incorretos).toBe(1);
    expect(total.auditados).toBe(2);
    expect(total.autoAceitos).toBeGreaterThan(total.auditados);
    const comTaxa = m.body.porVersao.find((v: any) => v.autoAceitosAuditados > 0);
    expect(comTaxa.taxaErroVinculacaoPct).not.toBeNull();
    expect(m.body.porVersao.map((v: any) => v.versaoRegras)).toEqual([...m.body.porVersao.map((v: any) => v.versaoRegras)].sort((a: number, b: number) => a - b));
    // a outra clínica não vê números desta
    const outra = await request(app).get(`${API}/identidade/metricas`).set(H(201));
    expect(outra.body.porVersao.reduce((s: number, v: any) => s + v.total, 0)).toBe(1); // só o laudo "rígido" da clínica 6
  });
  it("sem sessão: 401", async () => {
    expect((await request(app).get(`${API}/identidade/metricas`)).status).toBe(401);
  });
});
