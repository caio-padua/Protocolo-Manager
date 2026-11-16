/**
 * Progresso REAL da classificação dos resultados de um documento de exame (SPEC 3, adendo 2).
 *
 * NÃO é classificador. Só CONTA o que os serviços existentes já produziram e decide, com o MESMO
 * serviço da leitura (escolherFaixasInstitucionais + overrideZones + classifyIntoZones, de zones.ts),
 * se o status gravado em exam_results é uma zona institucional comprovada.
 * Não grava nada, não cria tipo de classificação, não chama IA.
 *
 * Categorias (exclusivas, nesta ordem):
 *  - naoMapeado            : analyte_code nulo (aguarda Sala de Triagem / curadoria de catálogo)
 *  - semUnidadeHomologada  : status "conferencia" (unidade do laudo sem fator conhecido; sem valor canônico)
 *  - semValorNumerico      : sem valor canônico por outro motivo (ex.: resultado textual)
 *  elegíveis = o que sobra. Entre elegíveis:
 *  - cincoZonas            : há conjunto institucional de 5 zonas aplicável (sexo/geral) E o status gravado
 *                            é exatamente o nome da zona em que o valor canônico cai agora
 *  - divergente            : há zona institucional, mas o status gravado difere dela (registro antigo/faixa
 *                            editada depois): aguarda revisão, nunca contado como classificado
 *  - simples               : sem faixa institucional aplicável; só abaixo/dentro/acima do laudo
 *  - semClassificacao      : sem faixa institucional e sem referência do laudo
 *  - faixaIncompleta       : conjunto institucional com menos/mais de 5 zonas: curadoria
 */
import { db, examAnalyteRangesTable, examAnalyteCatalogTable, clientsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { chaveFaixa, classifyIntoZones, escolherFaixasInstitucionais, overrideZones, sexoDaFicha } from "./exam-extraction/zones";

export interface LinhaResultado {
  analyteCode: string | null;
  status: string | null;
  unitConverted: boolean;
  valueCanonical: string | number | null;
}
export interface FaixaLinha {
  analyteCode: string; faixaName: string; low: string | number | null; high: string | number | null;
  color: string | null; ordem: number; sex: string | null;
}
export interface ContextoFaixas {
  faixasPorChave: Map<string, FaixaLinha[]>;
  sexoDependentePorCode: Map<string, boolean>;
  sexoCliente: "male" | "female" | null;
}

export interface ResumoResultados {
  total: number;
  excluidos: { naoMapeados: number; semUnidadeHomologada: number; semValorNumerico: number };
  elegiveis: number;
  convertidos: number;
  cincoZonas: number;
  simples: number;
  divergentes: number;
  semClassificacao: number;
  faixaIncompleta: number;
  /** elegíveis sexo-dependentes sem sexo no cadastro e sem faixa geral: faltou contexto, não se escolhe faixa */
  faltaSexo: number;
  /** elegíveis - cincoZonas: tudo o que ainda não tem zona institucional comprovada */
  pendentes: number;
}

const SIMPLES = new Set(["abaixo", "dentro", "acima"]);
const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function resumirResultados(linhas: LinhaResultado[], ctx: ContextoFaixas): ResumoResultados {
  const r: ResumoResultados = {
    total: linhas.length,
    excluidos: { naoMapeados: 0, semUnidadeHomologada: 0, semValorNumerico: 0 },
    elegiveis: 0, convertidos: 0, cincoZonas: 0, simples: 0, divergentes: 0,
    semClassificacao: 0, faixaIncompleta: 0, faltaSexo: 0, pendentes: 0,
  };
  for (const l of linhas) {
    if (!l.analyteCode) { r.excluidos.naoMapeados++; continue; }
    if (l.status === "conferencia") { r.excluidos.semUnidadeHomologada++; continue; }
    const valor = num(l.valueCanonical);
    if (valor === null) { r.excluidos.semValorNumerico++; continue; }
    r.elegiveis++;
    if (l.unitConverted) r.convertidos++;

    const todas = ctx.faixasPorChave.get(chaveFaixa(l.analyteCode)) ?? [];
    const sexDep = ctx.sexoDependentePorCode.get(l.analyteCode) ?? false;
    const conjunto = escolherFaixasInstitucionais(todas, sexDep, ctx.sexoCliente);
    const zonas = overrideZones(conjunto.map((f) => ({
      faixaName: f.faixaName, low: num(f.low), high: num(f.high), color: f.color, ordem: f.ordem,
    })));
    if (zonas) {
      if (zonas.length !== 5) { r.faixaIncompleta++; continue; }
      const zona = classifyIntoZones(valor, zonas);
      if (zona && l.status === zona.name) r.cincoZonas++; else r.divergentes++;
      continue;
    }
    if (sexDep && !ctx.sexoCliente && todas.length > 0) r.faltaSexo++;
    if (l.status && SIMPLES.has(l.status)) r.simples++; else r.semClassificacao++;
  }
  r.pendentes = r.elegiveis - r.cincoZonas;
  return r;
}

export interface PipelineStep { provider?: string; ok?: boolean; analitos?: number; detalhe?: Record<string, any> }
export interface ResumoLeituras {
  /** provedores que devolveram leitura (ok) neste documento, exatamente como gravado em llm_pipeline */
  leituras: string[];
  reconciliacao: "nao_aplicavel" | "concluida" | "com_conflitos" | "indisponivel";
  analitosRetiradosPorConflito: number;
}
/** Lê o que processExamDocument gravou em exam_documents.llm_pipeline. Sem presumir quais IAs estão ligadas. */
export function resumirLeituras(pipeline: unknown): ResumoLeituras {
  // Sem registro de pipeline (envio anterior ao rastreio ou coluna ausente): não se afirma nada sobre as leituras.
  if (!Array.isArray(pipeline)) return { leituras: [], reconciliacao: "indisponivel", analitosRetiradosPorConflito: 0 };
  const passos = pipeline as PipelineStep[];
  const leituras = passos.filter((p) => p?.ok && p.provider && p.provider !== "reconciliacao").map((p) => String(p.provider));
  const rec = passos.find((p) => p?.provider === "reconciliacao");
  if (!rec) return { leituras, reconciliacao: "nao_aplicavel", analitosRetiradosPorConflito: 0 };
  const retirados = Array.isArray(rec.detalhe?.analitosRetiradosPorConflito) ? rec.detalhe!.analitosRetiradosPorConflito.length : Number(rec.detalhe?.analitosRetiradosPorConflito ?? 0) || 0;
  const conflitos = Array.isArray(rec.detalhe?.conflitos) ? rec.detalhe!.conflitos.length : 0;
  return { leituras, reconciliacao: conflitos > 0 || retirados > 0 ? "com_conflitos" : "concluida", analitosRetiradosPorConflito: retirados };
}

/** Lê do banco (somente leitura) e resume vários documentos DE UM cliente. */
export async function resumirDocumentos(clientId: number, documentIds: number[]): Promise<Map<number, ResumoResultados & { leituras: ResumoLeituras }>> {
  const saida = new Map<number, ResumoResultados & { leituras: ResumoLeituras }>();
  if (documentIds.length === 0) return saida;
  const lista = sql.join(documentIds.map((i) => sql`${i}`), sql`, `);
  const linhas = (await db.execute(sql`
    SELECT exam_document_id AS doc, analyte_code, status, unit_converted, value_canonical
    FROM exam_results
    WHERE client_id = ${clientId} AND exam_document_id IN (${lista}) AND COALESCE(is_history, false) = false
  `) as unknown as { rows: Array<Record<string, any>> }).rows;
  // llm_pipeline vive em coluna criada fora do schema Drizzle; se ausente, o resumo diz "indisponivel".
  let pipes: Array<Record<string, any>> = [];
  try {
    pipes = (await db.execute(sql`
      SELECT id, llm_pipeline FROM exam_documents WHERE client_id = ${clientId} AND id IN (${lista})
    `) as unknown as { rows: Array<Record<string, any>> }).rows;
  } catch { pipes = []; }

  const faixas = await db.select().from(examAnalyteRangesTable);
  const faixasPorChave = new Map<string, FaixaLinha[]>();
  for (const f of faixas) { const k = chaveFaixa(f.analyteCode); faixasPorChave.set(k, [...(faixasPorChave.get(k) ?? []), f]); }
  const sexoDependentePorCode = new Map<string, boolean>();
  for (const c of await db.select({ code: examAnalyteCatalogTable.code, sd: examAnalyteCatalogTable.sexDependent }).from(examAnalyteCatalogTable)) {
    sexoDependentePorCode.set(c.code, c.sd ?? false);
  }
  const [cli] = await db.select({ ficha: clientsTable.fichaClinica }).from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
  const ctx: ContextoFaixas = { faixasPorChave, sexoDependentePorCode, sexoCliente: sexoDaFicha(cli?.ficha) };

  const porDoc = new Map<number, LinhaResultado[]>();
  for (const l of linhas) {
    const d = Number(l.doc);
    porDoc.set(d, [...(porDoc.get(d) ?? []), { analyteCode: l.analyte_code, status: l.status, unitConverted: Boolean(l.unit_converted), valueCanonical: l.value_canonical }]);
  }
  const pipeDe = new Map<number, unknown>(pipes.map((p) => [Number(p.id), p.llm_pipeline]));
  for (const id of documentIds) {
    saida.set(id, { ...resumirResultados(porDoc.get(id) ?? [], ctx), leituras: resumirLeituras(pipeDe.get(id)) });
  }
  return saida;
}
