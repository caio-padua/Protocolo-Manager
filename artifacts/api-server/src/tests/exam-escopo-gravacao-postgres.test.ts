/** Gravação futura de empresa_id em exam_results: vem do documento validado; dois tenants, dois pacientes, falha fechada. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { createTableFromSchema } from "./helpers/schema-ddl";

const logError = vi.fn();
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: (...a: unknown[]) => logError(...a), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async (k: string) => (k === "exames.triagemAtiva" ? "false" : null)) }));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "s".repeat(32);

let pool: any; let persist: any; let ExamWriteScopeError: any;
const q = async (t: string, p: unknown[] = []) => (await pool.query(t, p)).rows;
const A = (name: string, value: string) => ({ name, value, unit: "mg/dL", referenceRange: null, method: null, history: [] });
const laudo = (analytes: any[]) => ({ patient: { name: null, cpf: null, birthDate: null }, collectionDate: "10/11/2026", labName: "Lab Sintético", analytes, confidence: 0.9 });
let n = 0;
async function doc(clientId: number, empresaId: number | null) {
  n++;
  return (await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id) VALUES ($1,$2,$2,'processando',$3) RETURNING id`, [clientId, `h${n}`, empresaId]))[0].id as number;
}
const contar = async () => (await q(`SELECT count(*)::int n FROM exam_results`))[0].n;

beforeAll(async () => {
  const db = await import("@workspace/db"); const s = await import("@workspace/db/schema");
  pool = db.pool;
  for (const t of [s.empresasTable, s.clientsTable, s.examDocumentsTable, s.examResultsTable, s.examAnalyteCatalogTable, s.examAnalyteRangesTable, s.examAnalyteUnitsTable]) await pool.query(createTableFromSchema(t));
  await pool.query(`INSERT INTO empresas (id, nome) VALUES (5,'Clínica Cinco'),(7,'Clínica Sete')`);
  await pool.query(`INSERT INTO clients (id, name, empresa_id, status, ficha_clinica) VALUES (1,'Paciente Um',5,'active','{}'),(2,'Paciente Dois',7,'active','{}'),(3,'Paciente Legado',5,'active','{}')`);
  await pool.query(`INSERT INTO exam_analyte_catalog (code, display_name, synonyms, canonical_unit, kind, active) VALUES ('glicose','Glicose','["glicose"]','mg/dL','blood',true)`);
  await pool.query(`INSERT INTO exam_analyte_units (analyte_code, unit, factor_to_canonical, is_canonical, active) VALUES ('glicose','mg/dL',1,true,true)`);
  ({ persistExtractedResults: persist } = await import("../lib/exam-extraction/persist"));
  ({ ExamWriteScopeError } = await import("../lib/exam-extraction/escopo-gravacao"));
}, 120_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

describe("empresa_id nasce do documento validado", () => {
  it("dois tenants e dois pacientes: cada resultado leva a clínica do seu documento, sem cruzar", async () => {
    const d1 = await doc(1, 5), d2 = await doc(2, 7);
    await persist({ documentId: d1, clientId: 1, tenantId: 5, extracted: laudo([A("Glicose", "90")]) });
    await persist({ documentId: d2, clientId: 2, tenantId: 7, extracted: laudo([A("Glicose", "95")]) });
    const r = await q(`SELECT client_id, empresa_id, exam_document_id FROM exam_results ORDER BY client_id`);
    expect(r).toEqual([{ client_id: 1, empresa_id: 5, exam_document_id: d1 }, { client_id: 2, empresa_id: 7, exam_document_id: d2 }]);
  });
  it("ponto histórico do laudo também recebe a clínica", async () => {
    const d = await doc(1, 5);
    const l = laudo([{ ...A("Glicose", "88"), history: [{ date: "01/01/2026", value: "70", unit: "mg/dL" }] }]);
    await persist({ documentId: d, clientId: 1, extracted: l });
    const r = await q(`SELECT empresa_id, is_history FROM exam_results WHERE exam_document_id=$1 ORDER BY is_history`, [d]);
    expect(r).toEqual([{ empresa_id: 5, is_history: false }, { empresa_id: 5, is_history: true }]);
  });
  it("documento legado sem clínica: grava SEM clínica, não reatribui o documento nem preenche nada", async () => {
    const d = await doc(3, null);
    await persist({ documentId: d, clientId: 3, extracted: laudo([A("Glicose", "99")]) });
    expect((await q(`SELECT empresa_id FROM exam_results WHERE exam_document_id=$1`, [d]))[0].empresa_id).toBeNull();
    expect((await q(`SELECT empresa_id FROM exam_documents WHERE id=$1`, [d]))[0].empresa_id).toBeNull();
  });
  it("não toca registros antigos: linha antiga com empresa_id nulo continua nula", async () => {
    const d = await doc(1, 5);
    await pool.query(`INSERT INTO exam_results (exam_document_id, client_id, analyte_name_raw, collection_date) VALUES ($1,1,'Antigo','2020-01-01')`, [d]);
    await persist({ documentId: d, clientId: 1, extracted: laudo([A("Glicose", "91")]) });
    expect((await q(`SELECT empresa_id FROM exam_results WHERE analyte_name_raw='Antigo'`))[0].empresa_id).toBeNull();
  });
});

describe("discrepância intencional: falha fechada, nada gravado", () => {
  const casos: Array<[string, () => Promise<any>, string, number]> = [
    ["documento inexistente", async () => ({ documentId: 999999, clientId: 1 }), "documento_inexistente", 404],
    ["cliente diferente do documento", async () => ({ documentId: await doc(1, 5), clientId: 2 }), "cliente_diverge_do_documento", 403],
    ["sessão de outra clínica", async () => ({ documentId: await doc(1, 5), clientId: 1, tenantId: 7 }), "clinica_da_sessao_diverge_do_documento", 403],
  ];
  for (const [nome, monta, code, status] of casos) {
    it(`${nome} -> ${status} ${code}, sem perda nem gravação`, async () => {
      const entrada = await monta(); const antes = await contar();
      await expect(persist({ ...entrada, extracted: laudo([A("Glicose", "80")]) })).rejects.toMatchObject({ name: "ExamWriteScopeError", code, status });
      expect(await contar()).toBe(antes);
    });
  }
  it("documento de uma clínica e cliente de outra -> 403", async () => {
    const d = await doc(2, 5); // cliente 2 é da clínica 7
    const antes = await contar();
    await expect(persist({ documentId: d, clientId: 2, extracted: laudo([A("Glicose", "80")]) })).rejects.toMatchObject({ code: "clinica_do_documento_diverge_do_cliente", status: 403 });
    expect(await contar()).toBe(antes);
  });
  it("erro no meio do laudo desfaz o laudo inteiro (sem gravação parcial)", async () => {
    const d = await doc(1, 5); const antes = await contar();
    const ruim = laudo([A("Glicose", "70"), { name: null as any, value: "1", unit: "x", referenceRange: null, method: null, history: [] }]);
    await expect(persist({ documentId: d, clientId: 1, extracted: ruim })).rejects.toBeTruthy();
    expect(await contar()).toBe(antes);
  });
  it("instância de erro exposta para a rota mapear em 403/404", () => {
    expect(new ExamWriteScopeError("x", 403)).toBeInstanceOf(Error);
  });
});

describe("falha da triagem é observável, sem PII e sem interromper", () => {
  it("log técnico sem o nome do exame; retorno nulo; upload segue", async () => {
    const { triageOnImport } = await import("../lib/exam-extraction/triagem");
    logError.mockClear();
    const segredo = "Nome Sensivel Do Exame 12345";
    const r = await triageOnImport(segredo, null as any, { autoAbsorver: true, autoCriarDescoberto: true } as any);
    expect(r).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
    const texto = JSON.stringify(logError.mock.calls);
    expect(texto).toContain("TRIAGEM_FALHA");
    expect(texto).not.toContain("Sensivel");
    expect(texto).not.toContain("12345");
  });
  it("triagem não promove exame distinto sozinha: nome novo com triagem desligada fica sem código", async () => {
    const d = await doc(1, 5);
    await persist({ documentId: d, clientId: 1, extracted: laudo([A("vit d 25(oh) est.", "30")]) });
    const r = await q(`SELECT analyte_code FROM exam_results WHERE exam_document_id=$1`, [d]);
    expect(r[0].analyte_code).toBeNull();
    expect((await q(`SELECT count(*)::int n FROM exam_analyte_catalog`))[0].n).toBe(1);
  });
});
