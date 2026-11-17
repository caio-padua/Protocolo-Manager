/** Aliases de unidade equivalentes: aditivo, idempotente, por analito. Banco descartável, valores sintéticos. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { createTableFromSchema } from "./helpers/schema-ddl";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;

let pool: any;
const q = async (t: string, p: unknown[] = []) => (await pool.query(t, p)).rows;

beforeAll(async () => {
  const db = await import("@workspace/db");
  const schema = await import("@workspace/db/schema");
  pool = db.pool;
  for (const t of [schema.examAnalyteCatalogTable, schema.examAnalyteUnitsTable]) await pool.query(createTableFromSchema(t));
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_analyte_unit ON exam_analyte_units (analyte_code, unit)`);
  const cat = (code: string, name: string, canon: string) =>
    pool.query(`INSERT INTO exam_analyte_catalog (code, display_name, canonical_unit) VALUES ($1,$2,$3)`, [code, name, canon]);
  const un = (code: string, unit: string, f: number, canon: boolean, ordem: number) =>
    pool.query(`INSERT INTO exam_analyte_units (analyte_code, unit, factor_to_canonical, is_canonical, active, ordem) VALUES ($1,$2,$3,$4,true,$5)`, [code, unit, f, canon, ordem]);
  await cat("hemacias", "Hemácias", "milhões/mm³");            await un("hemacias", "milhões/mm³", 1, true, 1);
  await cat("leucocitos", "Leucócitos", "/mm³");              await un("leucocitos", "/mm³", 1, true, 1); await un("leucocitos", "10³/µL", 1000, false, 2);
  await cat("taxa de filtracao glomerular (egfr)", "eGFR", "mL/min/1.73m²"); await un("taxa de filtracao glomerular (egfr)", "mL/min/1.73m²", 1, true, 1);
  await cat("tempo de protrombina tempo em segundos", "TP", "seg"); await un("tempo de protrombina tempo em segundos", "seg", 1, true, 1);
  // Outro analito (outro "inquilino" lógico) com unidade própria: nunca pode ser tocado.
  await cat("glicose", "Glicose", "mg/dL"); await un("glicose", "mg/dL", 1, true, 1); await un("glicose", "mmol/L", 18.0182, false, 2);
}, 120_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

describe("normUnit / resolveConversion (valores sintéticos)", () => {
  it("normaliza micro grego e sinal de micro e ignora espaços e caixa", async () => {
    const { normUnit } = await import("../lib/exam-extraction/persist");
    expect(normUnit("/μL")).toBe(normUnit("/µL"));
    expect(normUnit("/μL")).toBe("/ul");
    expect(normUnit("10^6 / μL")).toBe("10^6/ul");
    expect(normUnit("mL/min/1,73m²")).not.toBe(normUnit("mL/min/1.73m²"));
  });
  it("sem fator a unidade é desconhecida; com fator 1 converte sem alterar o número", async () => {
    const { resolveConversion } = await import("../lib/exam-extraction/persist");
    const semFator = { canonicalUnit: "/mm³", factors: new Map<string, number>() };
    expect(resolveConversion(semFator, "/μL")).toMatchObject({ unknownUnit: true, converted: false });
    const comFator = { canonicalUnit: "/mm³", factors: new Map([["/ul", 1]]) };
    const r = resolveConversion(comFator, "/μL");
    expect(r).toMatchObject({ factor: 1, unitCanonical: "/mm³", converted: true, unknownUnit: false });
    expect(6730 * r.factor).toBe(6730);
  });
});

describe("cadastro aditivo de aliases equivalentes", () => {
  it("simulação não grava nada", async () => {
    const { cadastrarAliasesEquivalentes } = await import("../lib/exam-units-equivalentes");
    const antes = (await q(`SELECT count(*)::int n FROM exam_analyte_units`))[0].n;
    const rel = await cadastrarAliasesEquivalentes({ aplicar: false });
    expect(rel.filter((r) => r.decisao === "inserido")).toHaveLength(5);
    expect((await q(`SELECT count(*)::int n FROM exam_analyte_units`))[0].n).toBe(antes);
  });

  it("aplicar insere 5 aliases com fator 1, não padrão, e preserva tudo o que existia", async () => {
    const { cadastrarAliasesEquivalentes } = await import("../lib/exam-units-equivalentes");
    const antes = await q(`SELECT id, analyte_code, unit, factor_to_canonical::float f, is_canonical FROM exam_analyte_units ORDER BY id`);
    const rel = await cadastrarAliasesEquivalentes({ aplicar: true });
    expect(rel.map((r) => r.decisao)).toEqual(Array(5).fill("inserido"));
    const depois = await q(`SELECT id, analyte_code, unit, factor_to_canonical::float f, is_canonical FROM exam_analyte_units ORDER BY id`);
    expect(depois).toHaveLength(antes.length + 5);
    for (const a of antes) expect(depois).toContainEqual(a);          // nada mudou nem sumiu
    const novos = depois.filter((d: any) => !antes.some((a: any) => a.id === d.id));
    expect(novos.map((n: any) => `${n.analyte_code}|${n.unit}`).sort()).toEqual([
      "hemacias|10^6/μL", "hemacias|x106/uL", "leucocitos|/μL",
      "taxa de filtracao glomerular (egfr)|mL/min/1,73m²", "tempo de protrombina tempo em segundos|s",
    ]);
    for (const n of novos) { expect(n.f).toBe(1); expect(n.is_canonical).toBe(false); }
    const canon = await q(`SELECT code, canonical_unit FROM exam_analyte_catalog ORDER BY code`);
    expect(canon.find((c: any) => c.code === "leucocitos").canonical_unit).toBe("/mm³");
    // outro analito intocado
    expect((await q(`SELECT count(*)::int n FROM exam_analyte_units WHERE analyte_code='glicose'`))[0].n).toBe(2);
  });

  it("repetir é idempotente: 0 inserções, mesmos registros", async () => {
    const { cadastrarAliasesEquivalentes } = await import("../lib/exam-units-equivalentes");
    const antes = (await q(`SELECT count(*)::int n FROM exam_analyte_units`))[0].n;
    const rel = await cadastrarAliasesEquivalentes({ aplicar: true });
    expect(rel.map((r) => r.decisao)).toEqual(Array(5).fill("ja_existe"));
    expect((await q(`SELECT count(*)::int n FROM exam_analyte_units`))[0].n).toBe(antes);
  });

  it("loadUnits passa a reconhecer os aliases e converte com fator 1; o diferencial segue desconhecido", async () => {
    const { loadUnits, resolveConversion } = await import("../lib/exam-extraction/persist");
    const m = await loadUnits();
    expect(resolveConversion(m.get("leucocitos"), "/μL")).toMatchObject({ factor: 1, converted: true, unknownUnit: false });
    expect(resolveConversion(m.get("hemacias"), "x106/uL")).toMatchObject({ factor: 1, unknownUnit: false });
    expect(resolveConversion(m.get("hemacias"), "10^6/μL")).toMatchObject({ factor: 1, unknownUnit: false });
    expect(resolveConversion(m.get("taxa de filtracao glomerular (egfr)"), "mL/min/1,73m²")).toMatchObject({ factor: 1, unknownUnit: false });
    expect(resolveConversion(m.get("leucocitos"), "10³/µL")).toMatchObject({ factor: 1000 });   // fator anterior preservado
    expect(m.get("linfocitos")).toBeUndefined();                                                   // nada criado para diferenciais
  });

  it("bloqueia quando a unidade padrão do catálogo diverge ou o padrão tem fator diferente de 1", async () => {
    const { cadastrarAliasesEquivalentes } = await import("../lib/exam-units-equivalentes");
    await pool.query(`UPDATE exam_analyte_catalog SET canonical_unit='/L' WHERE code='leucocitos'`);
    await pool.query(`DELETE FROM exam_analyte_units WHERE analyte_code='leucocitos' AND unit='/μL'`);
    const rel = await cadastrarAliasesEquivalentes({ aplicar: true });
    expect(rel.find((r) => r.alias === "/μL")).toMatchObject({ decisao: "bloqueado" });
    expect((await q(`SELECT count(*)::int n FROM exam_analyte_units WHERE analyte_code='leucocitos' AND unit='/μL'`))[0].n).toBe(0);
    await pool.query(`UPDATE exam_analyte_catalog SET canonical_unit='/mm³' WHERE code='leucocitos'`);
  });
});
