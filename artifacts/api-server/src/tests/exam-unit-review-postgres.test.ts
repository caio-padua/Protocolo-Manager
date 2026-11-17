/** Segunda opinião de UNIDADE: máquina de estados, consumo atômico, carga mínima. Banco descartável e provedor simulado. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";
import { createTableFromSchema } from "./helpers/schema-ddl";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.PADAXOR_AI_BYPASS = "true";

let pool: any;
const q = async (t: string, p: unknown[] = []) => (await pool.query(t, p)).rows;
const DONO = { professionalId: 1, empresaId: 5, isPlatformOwner: true };
const COMUM = { professionalId: 2, empresaId: 5, isPlatformOwner: false };
const respostaAmbigua = { relation: "convertible", factor: "1/18", formula: "x/18", dimension: "massa/volume -> mol/volume", sourceNote: "n/d", uncertainties: [] };
const mockOk = (resp: any = respostaAmbigua) => vi.fn(async () => ({ parsed: resp, custoUsd: 0.004 }));

async function novoPedido(over: Record<string, unknown> = {}, empresaId = 5) {
  const { registrarCandidatoUnidade } = await import("../lib/exam-units/pedido-revisao");
  const e = { analyteCode: "glicose", unitRaw: "mmol/L", canonicalUnit: "mg/dL", ...over };
  await registrarCandidatoUnidade({ empresaId, ...(e as any) });
  return (await q(`SELECT * FROM exam_unit_review_request WHERE analyte_code=$1 AND empresa_id=$2 ORDER BY id DESC LIMIT 1`, [e.analyteCode, empresaId]))[0];
}

beforeAll(async () => {
  const db = await import("@workspace/db");
  const s = await import("@workspace/db/schema");
  pool = db.pool;
  for (const t of [s.examAnalyteCatalogTable, s.examAnalyteUnitsTable, s.appSettingsTable, s.collaboratorAuditTable, s.examDocumentsTable]) await pool.query(createTableFromSchema(t));
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_analyte_unit ON exam_analyte_units (analyte_code, unit)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_usage_log (id SERIAL PRIMARY KEY, empresa_id INT NOT NULL, provider TEXT NOT NULL, tipo TEXT NOT NULL, input_tokens INT, output_tokens INT, custo_usd NUMERIC(10,6), created_at TIMESTAMPTZ DEFAULT now())`);
  await (await import("../lib/ensure-exam-unit-review-schema")).ensureExamUnitReviewSchema();
  await pool.query(`INSERT INTO exam_analyte_catalog (code, display_name, canonical_unit) VALUES ('glicose','Glicose','mg/dL'),('leucocitos','Leucócitos','/mm³'),('tp','Tempo de protrombina','seg'),('linfocitos','Linfócitos','%')`);
  await pool.query(`INSERT INTO exam_analyte_units (analyte_code, unit, factor_to_canonical, is_canonical, active, ordem) VALUES ('glicose','mg/dL',1,true,true,1),('leucocitos','/mm³',1,true,true,1),('tp','seg',1,true,true,1),('linfocitos','%',1,true,true,1)`);
  await pool.query(`INSERT INTO app_settings (key, value) VALUES ('exames.llmOpenaiAtivo','false')`);
}, 120_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });
beforeEach(async () => {
  await pool.query(`DELETE FROM exam_unit_review_request`);
  await pool.query(`DELETE FROM collaborator_audit`);
  await pool.query(`DELETE FROM ai_usage_log`);
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'exames.unidadeIA.%'`);
});

describe("registro de candidatos", () => {
  it("13 ocorrências da mesma pergunta viram UM pedido; outra clínica tem pedido próprio", async () => {
    for (let i = 0; i < 13; i++) await novoPedido();
    await novoPedido({}, 7);
    const r = await q(`SELECT empresa_id, occurrences FROM exam_unit_review_request ORDER BY empresa_id`);
    expect(r).toEqual([{ empresa_id: 5, occurrences: 13 }, { empresa_id: 7, occurrences: 1 }]);
  });
  it("alias seguro é promovido (aditivo) e não vira pedido", async () => {
    const { registrarCandidatoUnidade } = await import("../lib/exam-units/pedido-revisao");
    expect(await registrarCandidatoUnidade({ empresaId: 5, analyteCode: "leucocitos", unitRaw: "/μL", canonicalUnit: "/mm³" })).toBe("alias_promovido");
    expect(await registrarCandidatoUnidade({ empresaId: 5, analyteCode: "leucocitos", unitRaw: "/μL", canonicalUnit: "/mm³" })).toBe("ignorado");
    expect((await q(`SELECT count(*)::int n FROM exam_analyte_units WHERE analyte_code='leucocitos'`))[0].n).toBe(2);
    expect((await q(`SELECT count(*)::int n FROM exam_unit_review_request`))[0].n).toBe(0);
  });
  it("classes proibidas (abs x %, TP % x s) ficam sem elegibilidade de IA e não podem ser aprovadas", async () => {
    const a = await novoPedido({ analyteCode: "linfocitos", unitRaw: "/μL", canonicalUnit: "%" });
    const b = await novoPedido({ analyteCode: "tp", unitRaw: "%", canonicalUnit: "seg" });
    expect([a.ai_eligible, b.ai_eligible]).toEqual([false, false]);
    const { aprovarPedido } = await import("../lib/exam-units/pedido-revisao");
    expect(await aprovarPedido(a.id, DONO)).toMatchObject({ ok: false, http: 409 });
    expect(await aprovarPedido(b.id, DONO)).toMatchObject({ ok: false, http: 409 });
  });
});

describe("autorização e consumo", () => {
  it("sem papel de proprietário: não aprova, não executa, provedor não é chamado", async () => {
    const p = await novoPedido(); const m = mockOk();
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    expect(await aprovarPedido(p.id, COMUM)).toMatchObject({ ok: false, http: 403 });
    expect(await executarRevisao(p.id, COMUM, { consultar: m, chavePresente: () => true })).toMatchObject({ ok: false, http: 403 });
    expect(m).not.toHaveBeenCalled();
    expect((await q(`SELECT status FROM exam_unit_review_request WHERE id=$1`, [p.id]))[0].status).toBe("pending");
  });
  it("pendente, rejeitado e expirado não chamam o provedor", async () => {
    const { aprovarPedido, rejeitarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    const m = mockOk(); const dep = { consultar: m, chavePresente: () => true };
    const p = await novoPedido();
    expect(await executarRevisao(p.id, DONO, dep)).toMatchObject({ ok: false, code: "pedido_nao_aprovado" });
    await aprovarPedido(p.id, DONO); await rejeitarPedido(p.id, DONO);
    expect(await executarRevisao(p.id, DONO, dep)).toMatchObject({ ok: false, code: "pedido_nao_aprovado" });
    const e = await novoPedido({ analyteCode: "tp", unitRaw: "min", canonicalUnit: "seg" });
    await aprovarPedido(e.id, DONO);
    await pool.query(`UPDATE exam_unit_review_request SET expires_at = now() - interval '1 minute' WHERE id=$1`, [e.id]);
    expect(await executarRevisao(e.id, DONO, dep)).toMatchObject({ ok: false, code: "autorizacao_expirada" });
    expect(m).not.toHaveBeenCalled();
  });
  it("duas execuções simultâneas da mesma autorização resultam em UMA consulta", async () => {
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    const p = await novoPedido(); const m = mockOk();
    await aprovarPedido(p.id, DONO);
    const dep = { consultar: m, chavePresente: () => true };
    const rs = await Promise.all([executarRevisao(p.id, DONO, dep), executarRevisao(p.id, DONO, dep), executarRevisao(p.id, DONO, dep)]);
    expect(m).toHaveBeenCalledTimes(1);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect((await q(`SELECT status FROM exam_unit_review_request WHERE id=$1`, [p.id]))[0].status).toBe("consumed");
    expect(await executarRevisao(p.id, DONO, dep)).toMatchObject({ ok: false });
    expect(m).toHaveBeenCalledTimes(1);
  });
  it("chave ausente não consome: pedido segue aprovado e recuperável", async () => {
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    const p = await novoPedido(); const m = mockOk();
    await aprovarPedido(p.id, DONO);
    expect(await executarRevisao(p.id, DONO, { consultar: m, chavePresente: () => false })).toMatchObject({ ok: false, code: "chave_openai_ausente" });
    expect(m).not.toHaveBeenCalled();
    expect((await q(`SELECT status, consumed_at FROM exam_unit_review_request WHERE id=$1`, [p.id]))[0]).toEqual({ status: "approved", consumed_at: null });
    expect(await executarRevisao(p.id, DONO, { consultar: m, chavePresente: () => true })).toMatchObject({ ok: true });
  });
  it("teto de custo bloqueia na aprovação e na execução", async () => {
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    const p = await novoPedido(); const m = mockOk();
    expect(await aprovarPedido(p.id, DONO, { tetoUsd: 0.001 })).toMatchObject({ ok: false, code: "teto_menor_que_estimativa" });
    await aprovarPedido(p.id, DONO);
    await pool.query(`UPDATE exam_unit_review_request SET cost_cap_usd = 0.001 WHERE id=$1`, [p.id]);
    expect(await executarRevisao(p.id, DONO, { consultar: m, chavePresente: () => true })).toMatchObject({ ok: false, code: "teto_de_custo_excedido" });
    expect(m).not.toHaveBeenCalled();
  });
  it("quota diária esgotada bloqueia antes de consumir", async () => {
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    await pool.query(`INSERT INTO app_settings (key, value) VALUES ('exames.unidadeIA.limiteDiario','1')`);
    const a = await novoPedido(); const b = await novoPedido({ analyteCode: "tp", unitRaw: "min", canonicalUnit: "seg" });
    const m = mockOk(); const dep = { consultar: m, chavePresente: () => true };
    await aprovarPedido(a.id, DONO); await aprovarPedido(b.id, DONO);
    expect(await executarRevisao(a.id, DONO, dep)).toMatchObject({ ok: true });
    expect(await executarRevisao(b.id, DONO, dep)).toMatchObject({ ok: false, code: "quota_diaria_esgotada" });
    expect(m).toHaveBeenCalledTimes(1);
    expect((await q(`SELECT status FROM exam_unit_review_request WHERE id=$1`, [b.id]))[0].status).toBe("approved");
  });
  it("reaprovar depois de expirar gera nova chave de idempotência e nova versão", async () => {
    const { aprovarPedido } = await import("../lib/exam-units/pedido-revisao");
    const p = await novoPedido();
    await aprovarPedido(p.id, DONO);
    const k1 = (await q(`SELECT idempotency_key k, version v FROM exam_unit_review_request WHERE id=$1`, [p.id]))[0];
    await pool.query(`UPDATE exam_unit_review_request SET status='expired' WHERE id=$1`, [p.id]);
    await aprovarPedido(p.id, DONO);
    const k2 = (await q(`SELECT idempotency_key k, version v FROM exam_unit_review_request WHERE id=$1`, [p.id]))[0];
    expect(k2.k).not.toBe(k1.k); expect(k2.v).toBeGreaterThan(k1.v);
  });
});

describe("falhas do provedor e resposta da IA", () => {
  it("HTTP recusado vira failed; sem resposta vira uncertain; nenhum retry automático", async () => {
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    const { ProviderHttpError, ProviderIncertoError } = await import("../lib/exam-units/revisao-openai");
    const a = await novoPedido(); const b = await novoPedido({ analyteCode: "tp", unitRaw: "min", canonicalUnit: "seg" });
    await aprovarPedido(a.id, DONO); await aprovarPedido(b.id, DONO);
    const mA = vi.fn(async () => { throw new ProviderHttpError(500); });
    const mB = vi.fn(async () => { throw new ProviderIncertoError("timeout"); });
    expect(await executarRevisao(a.id, DONO, { consultar: mA as any, chavePresente: () => true })).toMatchObject({ ok: false, code: "provedor_recusou" });
    expect(await executarRevisao(b.id, DONO, { consultar: mB as any, chavePresente: () => true })).toMatchObject({ ok: false, code: "resultado_incerto" });
    expect(await executarRevisao(b.id, DONO, { consultar: mB as any, chavePresente: () => true })).toMatchObject({ ok: false });
    expect(mA).toHaveBeenCalledTimes(1); expect(mB).toHaveBeenCalledTimes(1);
    expect((await q(`SELECT id, status FROM exam_unit_review_request ORDER BY id`)).map((r: any) => r.status)).toEqual(["failed", "uncertain"]);
    expect((await q(`SELECT count(*)::int n FROM ai_usage_log WHERE provider='openai'`))[0].n).toBe(1); // incerto é lançado como estimativa
  });
  it("resultado ambíguo/específico do analito NÃO grava conversão", async () => {
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    const p = await novoPedido(); await aprovarPedido(p.id, DONO);
    const antes = (await q(`SELECT count(*)::int n FROM exam_analyte_units`))[0].n;
    const r = await executarRevisao(p.id, DONO, { consultar: mockOk(), chavePresente: () => true });
    expect(r).toMatchObject({ ok: true, verdict: "curadoria" });
    expect((await q(`SELECT count(*)::int n FROM exam_analyte_units`))[0].n).toBe(antes);
  });
  it("fator da IA que contradiz o cálculo exato é rejeitado pelo motor", async () => {
    const { verificarResposta } = await import("../lib/exam-units/pedido-revisao");
    const base = { formula: "", dimension: "", sourceNote: "", uncertainties: [] };
    expect(verificarResposta({ ...base, relation: "convertible", factor: "1/10" }, "mg/dL", "g/L").verdict).toBe("rejeitado_motor");
    expect(verificarResposta({ ...base, relation: "convertible", factor: "1/100" }, "mg/dL", "g/L").verdict).toBe("curadoria");
  });
  it("auditoria minimizada gravada, sem segredo", async () => {
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    const p = await novoPedido(); await aprovarPedido(p.id, DONO);
    await executarRevisao(p.id, DONO, { consultar: mockOk(), chavePresente: () => true });
    const a = await q(`SELECT action, detail FROM collaborator_audit WHERE action LIKE 'unidade_ia_%' ORDER BY id`);
    expect(a.map((x: any) => x.action)).toEqual(["unidade_ia_aprovada", "unidade_ia_consulta"]);
    expect(JSON.stringify(a)).not.toMatch(/sk-|Bearer|api[_-]?key/i);
  });
});

describe("carga enviada ao provedor e interruptor global", () => {
  it("lista fechada: só analito e símbolos; qualquer dado de paciente é descartado", async () => {
    const { montarPayloadUnidade } = await import("../lib/exam-units/revisao-openai");
    const p = montarPayloadUnidade({ analyteCode: "glicose", analyteName: "Glicose", unitOrigin: "mmol/L", unitTarget: "mg/dL", cpf: "000.000.000-00", paciente: "Fulano de Tal", valor: "98", pdfText: "laudo" });
    expect(Object.keys(p).sort()).toEqual(["analyteCode", "analyteName", "unitOrigin", "unitTarget"]);
    expect(JSON.stringify(p)).not.toMatch(/Fulano|000\.000|98|laudo/);
  });
  it("chamada real simulada por fetch: corpo só com a carga mínima, custo lançado em ai_usage_log", async () => {
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "chave-de-teste";
    const { consultarOpenAIUnidade } = await import("../lib/exam-units/revisao-openai");
    let corpo = "";
    const fetchImpl = vi.fn(async (_u: any, init: any) => { corpo = String(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ relation: "analyte_specific", factor: null, formula: "n/d", dimension: "massa/mol", sourceNote: "massa molar", uncertainties: [] }) } }], usage: { prompt_tokens: 300, completion_tokens: 80 } }), { status: 200 }); });
    const antes = (await q(`SELECT count(*)::int n FROM ai_usage_log`))[0].n;
    const r = await consultarOpenAIUnidade({ analyteCode: "glicose", analyteName: "Glicose", unitOrigin: "mmol/L", unitTarget: "mg/dL" }, 5, { fetchImpl: fetchImpl as any });
    expect(r.parsed.relation).toBe("analyte_specific");
    const conteudo = JSON.parse(corpo).messages[0].content as string;
    const carga = JSON.parse(conteudo.slice(conteudo.lastIndexOf("\n") + 1));
    expect(carga).toEqual({ analyteCode: "glicose", analyteName: "Glicose", unitOrigin: "mmol/L", unitTarget: "mg/dL" });
    await new Promise((x) => setTimeout(x, 50));
    expect((await q(`SELECT count(*)::int n FROM ai_usage_log`))[0].n).toBe(antes + 1);
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  });
  it("interruptor global exames.llmOpenaiAtivo continua false depois de todo o fluxo", async () => {
    const { aprovarPedido, executarRevisao } = await import("../lib/exam-units/pedido-revisao");
    const antes = (await q(`SELECT value FROM app_settings WHERE key='exames.llmOpenaiAtivo'`))[0].value;
    const p = await novoPedido(); await aprovarPedido(p.id, DONO);
    await executarRevisao(p.id, DONO, { consultar: mockOk(), chavePresente: () => true });
    const depois = (await q(`SELECT value FROM app_settings WHERE key='exames.llmOpenaiAtivo'`))[0].value;
    expect([antes, depois]).toEqual(["false", "false"]);
  });
});
