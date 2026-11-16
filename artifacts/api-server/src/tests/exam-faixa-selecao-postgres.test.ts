/**
 * Seleção da faixa institucional na GRAVAÇÃO (persistExtractedResults).
 * Risco auditado: a busca da faixa usava ranges.find sem ordenar e sem filtrar por sexo,
 * podendo gravar o nome da faixa MASCULINA em cliente feminina (e vice-versa).
 * Dados 100% sintéticos, PostgreSQL descartável. Nenhuma IA é chamada.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { createTableFromSchema } from "./helpers/schema-ddl";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async (k: string) => (k === "exames.triagemAtiva" ? "false" : null)) }));

const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "s".repeat(32);

let pool: any;
let persistExtractedResults: any;
const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;
const R = (name: string, value: string, unit: string, referenceRange: string | null = null) => ({ name, value, unit, referenceRange, method: null, history: [] });
const laudo = (analytes: any[]) => ({ patient: { name: null, cpf: null, birthDate: null }, collectionDate: "10/11/2026", labName: "Lab Sintético", analytes, confidence: 0.9 });
const faixas = (code: string, sex: string, prefixo: string, cortes: number[]) => {
  const nomes = ["abaixo", "t1", "t2", "t3", "acima"];
  const lim = [null, ...cortes, null];
  return nomes.map((n, i) => `('${code}','${prefixo}-${n}',${lim[i] ?? "null"},${lim[i + 1] ?? "null"},'#888',${i + 1},'${sex}','seed')`).join(",");
};

let doc = 0;
async function novoDoc(clientId: number) {
  doc++;
  const r = await q(`INSERT INTO exam_documents (client_id, hash, file_name, status, empresa_id) VALUES ($1,$2,$2,'processando',5) RETURNING id`, [clientId, `sel-${doc}`]);
  return r[0].id as number;
}
async function gravar(clientId: number, analytes: any[]) {
  const documentId = await novoDoc(clientId);
  await persistExtractedResults({ documentId, clientId, extracted: laudo(analytes) });
  return q(`SELECT analyte_code, status, unit_converted, value_canonical FROM exam_results WHERE exam_document_id=$1 ORDER BY id`, [documentId]);
}

beforeAll(async () => {
  const db = await import("@workspace/db");
  const schema = await import("@workspace/db/schema");
  pool = db.pool;
  for (const t of [schema.empresasTable, schema.clientsTable, schema.examDocumentsTable, schema.examResultsTable,
    schema.examAnalyteCatalogTable, schema.examAnalyteRangesTable, schema.examAnalyteUnitsTable]) {
    await pool.query(createTableFromSchema(t));
  }
  await pool.query(`INSERT INTO empresas (id, nome) VALUES (5,'Clínica Cinco')`);
  await pool.query(`INSERT INTO clients (id, name, empresa_id, status, ficha_clinica) VALUES
    (1,'Cliente F',5,'active','{"sexo":"F"}'),(2,'Cliente M',5,'active','{"sexo":"M"}'),(3,'Cliente sem sexo',5,'active','{}')`);
  await pool.query(`INSERT INTO exam_analyte_catalog (code, display_name, synonyms, canonical_unit, kind, active, sex_dependent) VALUES
    ('testo','Testosterona','["testosterona"]','ng/dL','blood',true,true),
    ('ferro','Ferro','["ferro"]','ug/dL','blood',true,false),
    ('semfaixa','Analito sem faixa','["analito sem faixa"]','mg/dL','blood',true,false)`);
  await pool.query(`INSERT INTO exam_analyte_units (analyte_code, unit, factor_to_canonical, is_canonical, active) VALUES
    ('testo','ng/dL',1,true,true),('testo','nmol/L',28.8,false,true),('ferro','ug/dL',1,true,true),('semfaixa','mg/dL',1,true,true)`);
  // Masculina inserida ANTES da feminina de propósito (ordem de inserção favorece a masculina).
  await pool.query(`INSERT INTO exam_analyte_ranges (analyte_code, faixa_name, low, high, color, ordem, sex, source) VALUES
    ${faixas("testo", "male", "M", [300, 500, 700, 1000])},
    ${faixas("testo", "female", "F", [15, 30, 45, 70])},
    ${faixas("ferro", "any", "G", [40, 80, 120, 160])}`);
  ({ persistExtractedResults } = await import("../lib/exam-extraction/persist"));
}, 120_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

describe("seleção da faixa institucional na gravação", () => {
  it("cliente feminina, analito sexo-dependente: usa SOMENTE a faixa feminina", async () => {
    const [r] = await gravar(1, [R("Testosterona", "40", "ng/dL")]);
    expect(r.status).toBe("F-t2");
  });
  it("cliente masculino: usa SOMENTE a faixa masculina", async () => {
    const [r] = await gravar(2, [R("Testosterona", "400", "ng/dL")]);
    expect(r.status).toBe("M-t1");
  });
  it("valor feminino que cairia numa faixa masculina não herda o nome masculino", async () => {
    const [r] = await gravar(1, [R("Testosterona", "20", "ng/dL")]);
    expect(r.status).toBe("F-t1");
  });
  it("sexo desconhecido + analito sexo-dependente sem faixa geral: NÃO escolhe faixa de nenhum sexo", async () => {
    const [r] = await gravar(3, [R("Testosterona", "40", "ng/dL")]);
    expect(String(r.status ?? "")).not.toMatch(/^[MF]-/);
  });
  it("conversão conhecida: valor em nmol/L é convertido antes de classificar", async () => {
    const [r] = await gravar(1, [R("Testosterona", "1,5", "nmol/L")]);
    expect(r.unit_converted).toBe(true);
    expect(Number(r.value_canonical)).toBeCloseTo(43.2, 1);
    expect(r.status).toBe("F-t2");
  });
  it("analito não sexo-dependente: faixa geral 'any' e fronteira 80 = início da zona seguinte (G-t2), igual à leitura", async () => {
    const [r] = await gravar(1, [R("Ferro", "80", "ug/dL")]);
    expect(r.status).toBe("G-t2");
  });
  it("analito mapeado sem faixa institucional: cai na classificação simples (abaixo/dentro/acima) pela referência do laudo", async () => {
    const [r] = await gravar(1, [R("Analito sem faixa", "20", "mg/dL", "5 a 15")]);
    expect(r.status).toBe("acima");
  });
});
