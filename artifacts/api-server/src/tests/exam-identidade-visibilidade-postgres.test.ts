/**
 * Fatia 2 (P0) — documento com identidade contraditória nunca aparece, em nenhum papel.
 * Banco PostgreSQL descartável, dados 100% sintéticos, nenhuma chamada de IA.
 * Rotas reais: prontuário, evolução do profissional e evolução do portal.
 * Simulado: logger, leitura de configuração, vínculo clínico do emissor e armazenamento de dietas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { createTableFromSchema } from "./helpers/schema-ddl";

const sim = vi.hoisted(() => ({ settings: {} as Record<string, string> }));

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async (k: string) => (k in sim.settings ? sim.settings[k] : null)) }));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_q: any, _s: any, n: any) => n() }));
vi.mock("../lib/exam-curation-access", () => ({ protectCurationMutation: (_q: any, _s: any, n: any) => n() }));
vi.mock("../lib/dieta-planos-storage", () => ({ listPlanosByCliente: vi.fn(async () => []) }));
vi.mock("../lib/clinical-emitter", async (orig) => {
  const actual = await orig<any>();
  return { ...actual, resolveClinicalEmitter: vi.fn(async (req: any, clientId: number) => ({ professional: { id: req.collaborator.professionalId }, canPrescribe: true, clinic: { empresaId: clientId === 20 ? 6 : 5 } })) };
});

const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "s".repeat(32);

let app: express.Express;
let pool: any;
let profToken: (id: number) => string;
let portalToken: (id: number) => string;
const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;
const H = (id: number) => ({ Authorization: `Bearer ${profToken(id)}` });
const P = (id: number) => ({ Authorization: `Bearer ${portalToken(id)}` });

const DATA = "2026-11-10";
let seq = 0;
/** Cria documento + um resultado com nome rastreável; identity define a linha de identidade. */
async function doc(o: {
  clientId: number; empresaId: number; status: string; analyte: string; lab: string;
  identity?: "confirmada" | "contradicao" | "revisao" | "liberacao_humana" | null;
}) {
  const n = ++seq;
  const [d] = await q(
    `INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id, collection_date, lab_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [o.clientId, `vis-${n}`, `vis-${n}.pdf`, o.status, o.empresaId, DATA, o.lab],
  );
  await q(
    `INSERT INTO exam_results (exam_document_id, client_id, analyte_name_raw, value_raw, unit_raw, value_canonical, unit_canonical, status, collection_date, lab_name)
     VALUES ($1,$2,$3,'10','mg/dL','10','mg/dL','dentro',$4,$5)`,
    [d.id, o.clientId, o.analyte, DATA, o.lab],
  );
  if (o.identity) {
    const humano = o.identity === "liberacao_humana";
    await q(
      `INSERT INTO exam_identity_checks (document_id, empresa_id, client_id, event, verdict, professional_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [d.id, o.empresaId, o.clientId, humano ? "liberacao_humana" : "verificacao", humano ? null : o.identity, humano ? 101 : null],
    );
  }
  return d.id as number;
}

const NOMES = {
  contradito: "Analito Contradito", revisao: "Analito Em Revisao", quarentena: "Analito Quarentena",
  confirmado: "Analito Confirmado", liberado: "Analito Liberado", c2: "Analito C2", legado: "Analito Legado",
  outraClinica: "Analito Outra Clinica",
} as const;

beforeAll(async () => {
  const db = await import("@workspace/db");
  const schema = await import("@workspace/db/schema");
  pool = db.pool;
  for (const t of [schema.empresasTable, schema.clientsTable, schema.professionalsTable, schema.locationsTable,
    schema.locationProfessionalsTable, schema.professionalEmpresasTable, schema.examDocumentsTable, schema.examResultsTable,
    schema.examAnalyteCatalogTable, schema.examAnalyteRangesTable, schema.examAnalyteUnitsTable,
    schema.appSettingsTable, schema.collaboratorAuditTable, schema.protocolsTable, schema.examRequestPdfsTable,
    schema.treinoPrescricaoTable, schema.dietaPrescricaoTable]) {
    await pool.query(createTableFromSchema(t));
  }
  await pool.query(`ALTER TABLE exam_documents ADD COLUMN llm_pipeline jsonb, ADD COLUMN reprocessamento_count int, ADD COLUMN reprocessado_at timestamptz`);
  await pool.query(`CREATE TABLE direcao_favoravel_exame (nome_exame text primary key, direcao_favoravel text)`);
  await pool.query(`CREATE TABLE drive_watcher_files (file_id text primary key, exam_document_id int, processed_at timestamptz, original_name text, renamed_to text, copied_drive_id text, copied_name text)`);
  await (await import("../lib/ensure-exam-marcos-schema")).ensureExamMarcosSchema();
  await (await import("../lib/ensure-exam-identity-schema")).ensureExamIdentitySchema();

  await pool.query(`INSERT INTO empresas (id, nome) VALUES (5,'Clínica Cinco'),(6,'Clínica Seis')`);
  await pool.query(`INSERT INTO professionals (id, name, empresa_id, category, role, professional_type, crm, registration_council, active, credential_version) VALUES
    (101,'Médica Cinco',5,'medico','medico','medico','12345 SP','CRM',true,0),
    (201,'Médico Seis',6,'medico','medico','medico','54321 RJ','CRM',true,0)`);
  await pool.query(`INSERT INTO clients (id, name, empresa_id, status) VALUES
    (10,'Cliente Sintético A',5,'active'),(20,'Cliente Sintético B',6,'active')`);

  const mk = (await import("../lib/collaborator-auth")).createCollaboratorToken;
  profToken = (id: number) => mk({ professionalId: id, role: "x", credentialVersion: 0 });
  portalToken = (await import("../lib/portal-token")).createPortalToken;

  const { tenantContextMiddleware } = await import("../middleware/tenantContext");
  app = express();
  app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error(e: any) { console.log("ERRO_ROTA", JSON.stringify(e)); }, warn() {}, info() {} }; n(); });
  app.use(tenantContextMiddleware);
  app.use("/api", (await import("../routes/exames-lab")).default);
  app.use("/api", (await import("../routes/exames-paciente")).default);
  app.use("/api", (await import("../routes/prontuario")).default);

  // Cliente A (clínica 5): um documento de cada situação.
  await doc({ clientId: 10, empresaId: 5, status: "recebido", analyte: NOMES.contradito, lab: "Lab Contradito", identity: "contradicao" });
  await doc({ clientId: 10, empresaId: 5, status: "recebido", analyte: NOMES.revisao, lab: "Lab Revisao", identity: "revisao" });
  await doc({ clientId: 10, empresaId: 5, status: "quarentena", analyte: NOMES.quarentena, lab: "Lab Quarentena", identity: "contradicao" });
  await doc({ clientId: 10, empresaId: 5, status: "recebido", analyte: NOMES.confirmado, lab: "Lab Confirmado", identity: "confirmada" });
  await doc({ clientId: 10, empresaId: 5, status: "recebido", analyte: NOMES.liberado, lab: "Lab Liberado", identity: "liberacao_humana" });
  await doc({ clientId: 10, empresaId: 5, status: "conferido", analyte: NOMES.c2, lab: "Lab C2", identity: "confirmada" });
  await doc({ clientId: 10, empresaId: 5, status: "recebido", analyte: NOMES.legado, lab: "Lab Legado", identity: null });
  // Cliente B (clínica 6): nunca pode aparecer para A.
  await doc({ clientId: 20, empresaId: 6, status: "conferido", analyte: NOMES.outraClinica, lab: "Lab Outra", identity: "confirmada" });
}, 120_000);

afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(() => { sim.settings = {}; });

const nomesEvolucao = (body: any) => (body.analytes ?? []).map((a: any) => a.name).sort();
const BLOQUEADOS = [NOMES.contradito, NOMES.revisao, NOMES.quarentena, NOMES.outraClinica];

describe("P0 — identidade contraditória bloqueada em todos os caminhos", () => {
  it("prontuário: analitos de contradição, revisão e quarentena não aparecem", async () => {
    const r = await request(app).get("/api/prontuario/10").set(H(101));
    expect(r.status).toBe(200);
    const nomes = (r.body.analitos as any[]).map((a) => a.analyteNameRaw);
    for (const n of BLOQUEADOS) expect(nomes).not.toContain(n);
    expect(nomes).toEqual(expect.arrayContaining([NOMES.confirmado, NOMES.liberado, NOMES.c2]));
  });

  it("profissional, validação humana DESLIGADA: contradição fica fora; confirmado, liberado e C2 aparecem", async () => {
    sim.settings["exames.exigirValidacaoHumana"] = "false";
    const r = await request(app).get("/api/exames-lab/evolucao/10").set(H(101));
    expect(r.status).toBe(200);
    const nomes = nomesEvolucao(r.body);
    for (const n of BLOQUEADOS) expect(nomes).not.toContain(n);
    expect(nomes).toEqual(expect.arrayContaining([NOMES.confirmado, NOMES.liberado, NOMES.c2]));
  });

  it("profissional, validação humana LIGADA: só C2, e identidade nunca é relaxada", async () => {
    sim.settings["exames.exigirValidacaoHumana"] = "true";
    const r = await request(app).get("/api/exames-lab/evolucao/10").set(H(101));
    expect(r.status).toBe(200);
    expect(nomesEvolucao(r.body)).toEqual([NOMES.c2]);
  });

  it("portal, preliminar DESLIGADO: somente C2", async () => {
    sim.settings["exames.exigirValidacaoHumana"] = "false";
    const r = await request(app).get("/api/area-paciente/exames/evolucao").set(P(10));
    expect(r.status).toBe(200);
    expect(nomesEvolucao(r.body)).toEqual([NOMES.c2]);
  });

  it("portal, preliminar LIGADO: C2 + confirmado + liberado; nunca contradição, revisão, quarentena, legado ou outra clínica", async () => {
    sim.settings["exames.exibirResultadosPreliminaresAreaCliente.empresa.5"] = "true";
    const r = await request(app).get("/api/area-paciente/exames/evolucao").set(P(10));
    expect(r.status).toBe(200);
    const nomes = nomesEvolucao(r.body);
    expect(nomes).toEqual([NOMES.c2, NOMES.confirmado, NOMES.liberado].sort());
    for (const n of [...BLOQUEADOS, NOMES.legado]) expect(nomes).not.toContain(n);
  });

  it("outra clínica: profissional da clínica 6 não lê o cliente da clínica 5", async () => {
    const r = await request(app).get("/api/exames-lab/evolucao/10").set(H(201));
    expect(r.status).toBe(404);
  });

  it("respostas não carregam CPF, nascimento nem texto de identidade", async () => {
    sim.settings["exames.exigirValidacaoHumana"] = "false";
    const a = JSON.stringify((await request(app).get("/api/exames-lab/evolucao/10").set(H(101))).body);
    expect(a).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(a).not.toMatch(/extracted_json|extractedJson/);
  });
});

describe("P0 — o porteiro não deixa contradição 'recebido' quando já há resultados", () => {
  it("contradição sobre documento com resultados vai a quarentena e preserva os resultados", async () => {
    const { runIdentityGate } = await import("../lib/exam-extraction/identity-gate");
    await q(`UPDATE clients SET name='Paciente Gate Sintético', cpf='529.982.247-25' WHERE id=10`);
    const id = await doc({ clientId: 10, empresaId: 5, status: "recebido", analyte: "Analito Gate", lab: "Lab Gate", identity: null });
    const antes = (await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n;
    const r = await runIdentityGate({
      documentId: id, clientId: 10, modelUsed: "sintetico", pipeline: [],
      extracted: { patient: { name: "Outra Pessoa Sintética", cpf: "111.444.777-35", birthDate: null }, collectionDate: "10/11/2026", labName: "Lab Gate", analytes: [], confidence: 0.9 } as any,
    });
    expect(r.quarantined).toBe(true);
    const [d] = await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]);
    expect(d.status).toBe("quarentena");
    const depois = (await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n;
    expect(depois).toBe(antes);
  });

  it("liberação humana restaura a visibilidade sem reextrair nem duplicar resultados", async () => {
    sim.settings["exames.exigirValidacaoHumana"] = "false";
    const id = await doc({ clientId: 10, empresaId: 5, status: "quarentena", analyte: "Analito Liberacao Posterior", lab: "Lab Liberacao", identity: "contradicao" });
    const nomesAntes = (await request(app).get("/api/prontuario/10").set(H(101))).body.analitos.map((a: any) => a.analyteNameRaw);
    expect(nomesAntes).not.toContain("Analito Liberacao Posterior");

    const r = await request(app).post(`/api/exames-lab/documentos/${id}/identidade/liberar`).set(H(101))
      .send({ justificativa: "Conferi o documento original com o cadastro e confirmo que pertence ao cliente; liberação sintética de teste." });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("recebido");

    const [d] = await q(`SELECT status FROM exam_documents WHERE id=$1`, [id]);
    expect(d.status).toBe("recebido");
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(1);
    const pront = (await request(app).get("/api/prontuario/10").set(H(101))).body.analitos.map((a: any) => a.analyteNameRaw);
    expect(pront.filter((n: string) => n === "Analito Liberacao Posterior")).toHaveLength(1);
    const evo = await request(app).get("/api/exames-lab/evolucao/10").set(H(101));
    expect(nomesEvolucao(evo.body)).toContain("Analito Liberacao Posterior");
  });

  it("rejeição humana mantém o documento fora e os resultados preservados", async () => {
    const id = await doc({ clientId: 10, empresaId: 5, status: "quarentena", analyte: "Analito Rejeitado", lab: "Lab Rejeitado", identity: "contradicao" });
    const r = await request(app).post(`/api/exames-lab/documentos/${id}/identidade/rejeitar`).set(H(101))
      .send({ justificativa: "O documento pertence a outra pessoa; rejeição sintética de teste." });
    expect(r.status).toBe(200);
    const pront = (await request(app).get("/api/prontuario/10").set(H(101))).body.analitos.map((a: any) => a.analyteNameRaw);
    expect(pront).not.toContain("Analito Rejeitado");
    expect((await q(`SELECT count(*)::int n FROM exam_results WHERE exam_document_id=$1`, [id]))[0].n).toBe(1);
  });
});
