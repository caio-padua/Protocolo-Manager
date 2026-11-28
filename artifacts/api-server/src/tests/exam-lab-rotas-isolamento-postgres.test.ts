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
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async () => null), getJsonSetting: vi.fn(async () => null) }));
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



/**
 * Depuração de Exames — cobertura de autenticação, autorização e isolamento por clínica de TODAS as
 * rotas laboratoriais de routes/exames-lab.ts (incluindo as conferências e a identidade).
 * Dados 100% sintéticos, PostgreSQL descartável, cadeia REAL de autenticação (token de colaborador,
 * tenantContextMiddleware, requireCollaborator, protectCurationMutation, moduleGuard simulado só no
 * contrato de módulo). Simulado: IA, Drive, cofre R2, e-mail e WhatsApp. Nada sai da máquina.
 */
let app: express.Express;
let pool: any;
let router: any;
let tok: (id: number) => string;
let portal: (id: number) => string;
const H = (id: number) => ({ Authorization: `Bearer ${tok(id)}` });
const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;

function walk(stack: any[]): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  for (const l of stack) {
    if (l.route) for (const m of Object.keys(l.route.methods)) out.push({ method: m.toUpperCase(), path: l.route.path });
    else if (l.name === "router" && l.handle?.stack) out.push(...walk(l.handle.stack));
  }
  return out;
}

/** Classe de proteção declarada de cada rota. Rota nova sem linha aqui reprova o teste de inventário. */
type Classe = "documento" | "cliente" | "sessao" | "catalogo" | "curadoria";
const INVENTARIO: Record<string, Classe> = {
  "PATCH /exames-lab/documentos/:id/conferir": "documento",
  "POST /exames-lab/ingest": "sessao",
  "GET /exames-lab/r2-dry-run": "sessao",
  "GET /exames-lab/documentos": "sessao",
  "GET /exames-lab/resultados": "sessao",
  "PATCH /exames-lab/documento/:id": "documento",
  "GET /exames-lab/documentos/:id": "documento",
  "GET /exames-lab/evolucao/:clientId": "cliente",
  "GET /exames-lab/faixas": "catalogo",
  "PUT /exames-lab/faixas": "curadoria",
  "GET /exames-lab/direcoes": "catalogo",
  "GET /exames-lab/catalogo-faixas": "catalogo",
  "PUT /exames-lab/catalogo-faixas": "curadoria",
  "PUT /exames-lab/catalogo-faixas/aliases": "curadoria",
  "PUT /exames-lab/catalogo/renomear": "curadoria",
  "PUT /exames-lab/catalogo-faixas/unidades": "curadoria",
  "POST /exames-lab/triagem/backfill": "curadoria",
  "GET /exames-lab/triagem": "catalogo",
  "GET /exames-lab/exames/ignorados": "catalogo",
  "POST /exames-lab/exames/:code/ignorar": "curadoria",
  "POST /exames-lab/exames/:code/restaurar": "curadoria",
  "POST /exames-lab/triagem/:id/resolver": "curadoria",
  "POST /exames-lab/triagem/curadoria": "curadoria",
  "GET /exames-lab/triagem/:id/procedencia": "catalogo",
  "GET /exames-lab/catalogo/:code/procedencia": "catalogo",
  "GET /exames-lab/documento/:docId/arquivo": "documento",
  "POST /exames-lab/documento/:docId/reextrair": "documento",
  "GET /exames-lab/exames/:code/impacto": "catalogo",
  "POST /exames-lab/exames/englobar": "curadoria",
  "POST /exames-lab/exames/transferir": "curadoria",
  "GET /exames-lab/reassignments": "catalogo",
  "POST /exames-lab/reassignments/:batchId/desfazer": "curadoria",
  "POST /exames-lab/documento/:docId/clonar-drive": "documento",
  "POST /exames-lab/demo-conversao": "sessao",
  "GET /exames-lab/monitor": "sessao",
  "GET /exames-lab/progresso": "cliente",
  "POST /exames-lab/recovery": "sessao",
  "GET /exames-lab/documento/:id/download": "documento",
  "GET /exames-lab/documento/:id/links": "documento",
  "GET /exames-lab/auditoria": "sessao",
  "POST /exames-lab/reprocessar/:id": "documento",
  "GET /exames-lab/doc-status/:documentId": "documento",
  "GET /exames-lab/documentos/:id/identidade": "documento",
  "POST /exames-lab/documentos/:id/identidade/liberar": "documento",
  "POST /exames-lab/documentos/:id/identidade/rejeitar": "documento",
  "GET /exames-lab/identidade/regras": "sessao",
  "PUT /exames-lab/identidade/regras": "sessao",
  "GET /exames-lab/documentos/:id/identidade/historico": "documento",
  "GET /exames-lab/identidade/auto-aceitos": "sessao",
  "POST /exames-lab/documentos/:id/identidade/auditoria": "documento",
  "GET /exames-lab/identidade/metricas": "sessao",
};
const fill = (p: string) => p.replace(/:ref|:docId|:documentId|:id(?=\/|$)/g, "11").replace(":clientId", "1").replace(":code", "GLI").replace(":batchId", "lote-x");
const send = (method: string, url: string, headers: Record<string, string> = {}) => {
  let rq = (request(app) as any)[method.toLowerCase()](url).set(headers);
  if (method !== "GET") rq = rq.send({ fase: 1 });
  return rq;
};

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
    (101,'Médica Cinco',5,'medico','medico','medico','12345 SP','CRM',true,0),(201,'Médico Seis',6,'medico','medico','medico','54321 RJ','CRM',true,0)`);
  await pool.query(`INSERT INTO clients (id, name, cpf, empresa_id, status) VALUES (1,'Cliente Sintético Cinco','529.982.247-25',5,'active'),(2,'Cliente Sintético Seis','111.444.777-35',6,'active')`);
  await pool.query(`INSERT INTO exam_documents (id, client_id, hash, file_name, status, empresa_id) VALUES (11,1,'h1','laudo-cinco.pdf','recebido',5),(22,2,'h2','laudo-seis.pdf','recebido',6),(12,1,'h3','erro-cinco.pdf','erro',5)`);
  await pool.query(`INSERT INTO exam_results (exam_document_id, client_id, analyte_code, analyte_name_raw, value_raw, unit_raw) VALUES (11,1,'GLI','Glicose','90','mg/dL'),(22,2,'GLI','Glicose','95','mg/dL')`);
  const mk = (await import("../lib/collaborator-auth")).createCollaboratorToken;
  tok = (id: number) => mk({ professionalId: id, role: "x", credentialVersion: 0 });
  portal = (await import("../lib/portal-token")).createPortalToken;
  router = (await import("../routes/exames-lab")).default;
  const { tenantContextMiddleware } = await import("../middleware/tenantContext");
  app = express();
  app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
  app.use(tenantContextMiddleware);
  app.use("/api", router);
  app.use("/api", (await import("../routes/exames-paciente")).default);
}, 120_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(() => { vi.clearAllMocks(); });

describe("inventário", () => {
  it("toda rota do router está classificada, e nenhuma classificação sobra", () => {
    const reais = walk(router.stack).map((r) => `${r.method} ${r.path}`).sort();
    expect(reais).toEqual(Object.keys(INVENTARIO).sort());
  });
});

describe("sem sessão: 401 em TODAS as rotas laboratoriais", () => {
  it.each(Object.keys(INVENTARIO))("%s", async (chave) => {
    const [method, path] = chave.split(" ");
    const res = await send(method, "/api" + fill(path));
    expect(res.status).toBe(401);
  });
  it("token de paciente (portal) não vale como colaborador", async () => {
    for (const chave of Object.keys(INVENTARIO)) {
      const [method, path] = chave.split(" ");
      const res = await send(method, "/api" + fill(path), { Authorization: `Bearer ${portal(1)}` });
      expect(res.status, chave).toBe(401);
    }
  });
});

describe("ataque cruzado: colaborador da clínica 6 contra dados da clínica 5", () => {
  const porDocumento = Object.entries(INVENTARIO).filter(([, c]) => c === "documento").map(([k]) => k);
  // Política: 404 não revela existência; a conferência clínica (fase 1/2) já responde 403 por desenho próprio.
  it.each(porDocumento)("%s => negado (404; 403 na conferência)", async (chave) => {
    const [method, path] = chave.split(" ");
    const res = await send(method, "/api" + fill(path), H(201));
    expect(res.status).toBe(chave.endsWith("/conferir") ? 403 : 404);
  });
  it("evolução de cliente de outra clínica => 404", async () => {
    expect((await send("GET", "/api/exames-lab/evolucao/1", H(201))).status).toBe(404);
  });
  it("curadoria de catálogo exige permissão: quem não é dono nem tem a matriz recebe 403 nas escritas", async () => {
    for (const [chave] of Object.entries(INVENTARIO).filter(([, c]) => c === "curadoria")) {
      const [method, path] = chave.split(" ");
      const res = await send(method, "/api" + fill(path), H(201));
      expect(res.status, chave).toBe(403);
    }
  });
});

describe("vazamento de conteúdo entre clínicas (leitura)", () => {
  it("procedência do catálogo: clínica 6 não vê cliente, arquivo nem valor da clínica 5", async () => {
    const cinco = await send("GET", "/api/exames-lab/catalogo/GLI/procedencia", H(101));
    expect(cinco.status).toBe(200);
    expect(JSON.stringify(cinco.body)).toContain("laudo-cinco.pdf");
    expect(JSON.stringify(cinco.body)).not.toContain("laudo-seis.pdf");
    const seis = await send("GET", "/api/exames-lab/catalogo/GLI/procedencia", H(201));
    expect(seis.status).toBe(200);
    const txt = JSON.stringify(seis.body);
    expect(txt).toContain("laudo-seis.pdf");
    expect(txt).not.toContain("laudo-cinco.pdf");
    expect(txt).not.toContain("Cliente Sintético Cinco");
  });
  it("impacto: contagem restrita à clínica da sessão", async () => {
    const cinco = await send("GET", "/api/exames-lab/exames/GLI/impacto", H(101));
    expect(cinco.body).toMatchObject({ resultados: 1, clientes: 1, documentos: 1 });
  });
  it("lista de documentos, resultados, monitor e auditoria só mostram a clínica da sessão", async () => {
    const docs = await send("GET", "/api/exames-lab/documentos", H(201));
    expect(JSON.stringify(docs.body)).not.toContain("laudo-cinco.pdf");
    const res = await send("GET", "/api/exames-lab/resultados", H(201));
    expect(JSON.stringify(res.body)).not.toContain("Cliente Sintético Cinco");
    const mon = await send("GET", "/api/exames-lab/monitor", H(201));
    expect(JSON.stringify(mon.body)).not.toContain("erro-cinco.pdf");
    const aud = await send("GET", "/api/exames-lab/auditoria", H(201));
    expect(JSON.stringify(aud.body)).not.toContain("laudo-cinco.pdf");
    const monCinco = await send("GET", "/api/exames-lab/monitor", H(101));
    expect(JSON.stringify(monCinco.body)).toContain("erro-cinco.pdf");
  });
  it("progresso por documento: exige login, valida o cliente e nega cliente de outra clínica", async () => {
    expect((await send("GET", "/api/exames-lab/progresso?clientId=1")).status).toBe(401);
    expect((await send("GET", "/api/exames-lab/progresso", H(101))).status).toBe(400);
    expect((await send("GET", "/api/exames-lab/progresso?clientId=1", H(201))).status).toBe(404);
    expect((await send("GET", "/api/exames-lab/progresso?clientId=1", H(101))).status).toBe(200);
  });
  it("com filtro por cliente de outra clínica => 404", async () => {
    expect((await send("GET", "/api/exames-lab/documentos?clientId=1", H(201))).status).toBe(404);
    expect((await send("GET", "/api/exames-lab/resultados?clientId=1", H(201))).status).toBe(404);
  });
  it("regras, auto-aceites e métricas são da clínica da sessão", async () => {
    const reg = await send("GET", "/api/exames-lab/identidade/regras", H(201));
    expect(reg.status).toBe(200);
    const lista = await send("GET", "/api/exames-lab/identidade/auto-aceitos", H(201));
    expect(lista.status).toBe(200);
    expect(lista.body.itens).toEqual([]);
  });
});

describe("ataque cruzado de gravação", () => {
  it("PATCH de documento de outra clínica não altera o banco", async () => {
    const antes = await q(`SELECT * FROM exam_documents WHERE id=11`);
    const res = await send("PATCH", "/api/exames-lab/documento/11", H(201)).send({ status: "erro", collectionDate: "2020-01-01" });
    expect(res.status).toBe(404);
    expect(await q(`SELECT * FROM exam_documents WHERE id=11`)).toEqual(antes);
  });
  it("upload (ingest) para cliente de outra clínica é recusado e não cria documento", async () => {
    const n0 = (await q(`SELECT count(*)::int n FROM exam_documents`))[0].n;
    const res = await request(app).post("/api/exames-lab/ingest").set(H(201))
      .field("clientId", "1").attach("file", Buffer.from("%PDF-1.4 sintetico"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(404);
    expect((await q(`SELECT count(*)::int n FROM exam_documents`))[0].n).toBe(n0);
  });
  it("reprocessar, reextrair e clonar para o Drive de documento de outra clínica => 404 sem efeito", async () => {
    const antes = await q(`SELECT status, reprocessamento_count FROM exam_documents WHERE id=11`);
    for (const p of ["/api/exames-lab/reprocessar/11", "/api/exames-lab/documento/11/reextrair", "/api/exames-lab/documento/11/clonar-drive"]) {
      expect((await send("POST", p, H(201))).status, p).toBe(404);
    }
    expect(await q(`SELECT status, reprocessamento_count FROM exam_documents WHERE id=11`)).toEqual(antes);
  });
  it("liberar/rejeitar identidade e auditar documento de outra clínica => 404 sem registro", async () => {
    for (const p of ["liberar", "rejeitar", "auditoria"]) {
      expect((await send("POST", `/api/exames-lab/documentos/11/identidade/${p}`, H(201))).status, p).toBe(404);
    }
    expect((await q(`SELECT count(*)::int n FROM exam_identity_checks WHERE document_id=11`))[0].n).toBe(0);
  });
});

describe("portal do paciente continua funcionando", () => {
  it("paciente lê a própria evolução e não acessa a de outro (token amarra o cliente)", async () => {
    const eu = await request(app).get("/api/area-paciente/exames/evolucao").set({ Authorization: `Bearer ${portal(1)}` });
    expect(eu.status).toBe(200);
    expect(JSON.stringify(eu.body)).not.toContain("laudo-seis");
    const semToken = await request(app).get("/api/area-paciente/exames/evolucao");
    expect([401, 403]).toContain(semToken.status);
  });
});
