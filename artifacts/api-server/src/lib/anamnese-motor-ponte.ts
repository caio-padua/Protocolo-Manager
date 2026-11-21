import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { computeMotor, gatilhoBate, type RespostaMotor, type ResultadoMotor } from "./motor-anamnese.js";

/**
 * PONTE Anamnese V2 -> motor deterministico (SOMENTE LEITURA: nao grava em anamnese_resposta).
 * Chave de resposta = question_row_id; o motor usa perguntaId, entao conflitos sao declarados.
 * Nada aqui e diagnostico: e o resultado das regras cadastradas, com rastro ate cada resposta.
 */
export interface PontePergunta { id: number; perguntaId: string | null; pergunta: string | null; tipoResposta: string | null; opcoes: unknown }
export interface PonteResposta { questionRowId: number; valor: unknown; respondidoEm?: string | Date | null }
export interface NaoAvaliada { questionRowId: number; perguntaId: string | null; motivo: string }
export interface Conflito { perguntaId: string; questionRowIds: number[]; usada: number }
type Opcao = { label?: string; valor: string | number };

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/** Converte o valor tipado da V2 no escalar que o motor entende, ou devolve o motivo de nao avaliar. */
export function valorParaMotor(valor: unknown, opcoes: unknown): { ok: true; valor: string | number } | { ok: false; motivo: string } {
  if (!valor || typeof valor !== "object") return { ok: false, motivo: "resposta vazia" };
  const v = valor as Record<string, unknown>;
  switch (v.tipo) {
    case "boolean": return { ok: true, valor: v.bool === true ? "sim" : "nao" };
    case "single": {
      const lista = Array.isArray(opcoes) ? (opcoes as Opcao[]) : [];
      const alvo = norm(v.valor ?? v.opcao);
      const hit = lista.find((o) => norm(o.valor) === alvo || norm(o.label) === alvo);
      if (hit) return { ok: true, valor: hit.valor };
      return alvo ? { ok: true, valor: alvo } : { ok: false, motivo: "opcao vazia" };
    }
    case "escala": return typeof v.escala === "number" ? { ok: true, valor: v.escala } : { ok: false, motivo: "escala sem numero" };
    case "number": return typeof v.numero === "number" ? { ok: true, valor: v.numero } : { ok: false, motivo: "numero ausente" };
    case "multi": return { ok: false, motivo: "multi-selecao: o motor so avalia um valor por pergunta; revisar manualmente" };
    case "texto": return { ok: false, motivo: "texto livre: nao avaliado por regra" };
    default: return { ok: false, motivo: "tipo de resposta desconhecido" };
  }
}

export function respostasV2ParaMotor(perguntas: PontePergunta[], respostas: PonteResposta[]) {
  const porId = new Map(perguntas.map((p) => [p.id, p]));
  const naoAvaliadas: NaoAvaliada[] = [];
  const candidatas = new Map<string, Array<{ rowId: number; valor: string | number; quando: number }>>();
  for (const r of respostas) {
    const p = porId.get(r.questionRowId);
    if (!p) { naoAvaliadas.push({ questionRowId: r.questionRowId, perguntaId: null, motivo: "pergunta inexistente no questionario" }); continue; }
    const c = valorParaMotor(r.valor, p.opcoes);
    if (!c.ok) { naoAvaliadas.push({ questionRowId: p.id, perguntaId: p.perguntaId, motivo: c.motivo }); continue; }
    if (!p.perguntaId) { naoAvaliadas.push({ questionRowId: p.id, perguntaId: null, motivo: "pergunta sem identificador de regra" }); continue; }
    const lista = candidatas.get(p.perguntaId) ?? [];
    lista.push({ rowId: p.id, valor: c.valor, quando: r.respondidoEm ? new Date(r.respondidoEm).getTime() : 0 });
    candidatas.set(p.perguntaId, lista);
  }
  const respostasMotor: RespostaMotor[] = [];
  const conflitos: Conflito[] = [];
  const origem = new Map<string, number>();
  for (const [pid, lista] of candidatas) {
    lista.sort((a, b) => b.quando - a.quando || b.rowId - a.rowId);
    const usada = lista[0];
    if (lista.length > 1 && new Set(lista.map((x) => String(x.valor))).size > 1) conflitos.push({ perguntaId: pid, questionRowIds: lista.map((x) => x.rowId), usada: usada.rowId });
    respostasMotor.push({ perguntaId: pid, valor: usada.valor });
    origem.set(pid, usada.rowId);
  }
  return { respostasMotor, naoAvaliadas, conflitos, origem };
}

export interface RegraDisparada { regra: "doenca" | "sintoma"; perguntaId: string; questionRowId: number | null; gatilho: string | null; valorRecebido: string | number; alvo: string }
export interface RegraSemResposta { regra: "doenca" | "sintoma"; perguntaId: string; alvo: string }

export async function avaliarSessaoNoMotor(perguntas: PontePergunta[], respostas: PonteResposta[]) {
  const ponte = respostasV2ParaMotor(perguntas, respostas);
  const resultado: ResultadoMotor = await computeMotor(ponte.respostasMotor);
  const mapa = new Map(ponte.respostasMotor.map((r) => [r.perguntaId, r.valor]));
  const doencas = (await db.execute(sql`SELECT d.pergunta_id, d.gatilho_valor, c.nome_doenca FROM pergunta_doenca d LEFT JOIN catalogo_doencas c ON c.id_ihe=d.doenca_id_ihe`)).rows as Array<{ pergunta_id: string; gatilho_valor: string | null; nome_doenca: string | null }>;
  const sintomas = (await db.execute(sql`SELECT s.pergunta_id, s.gatilho_valor, c.nome_sintoma FROM pergunta_sintoma s LEFT JOIN catalogo_sintomas c ON c.codigo_semantico=s.sintoma_codigo`)).rows as Array<{ pergunta_id: string; gatilho_valor: string | null; nome_sintoma: string | null }>;
  const disparadas: RegraDisparada[] = [];
  const semResposta: RegraSemResposta[] = [];
  const passar = (regra: "doenca" | "sintoma", pid: string, gat: string | null, alvo: string | null) => {
    if (!mapa.has(pid)) { semResposta.push({ regra, perguntaId: pid, alvo: alvo ?? "—" }); return; }
    const val = mapa.get(pid)!;
    if (gatilhoBate(gat, val)) disparadas.push({ regra, perguntaId: pid, questionRowId: ponte.origem.get(pid) ?? null, gatilho: gat, valorRecebido: val, alvo: alvo ?? "—" });
  };
  for (const d of doencas) passar("doenca", d.pergunta_id, d.gatilho_valor, d.nome_doenca);
  for (const s of sintomas) passar("sintoma", s.pergunta_id, s.gatilho_valor, s.nome_sintoma);
  return { resultado, disparadas, semResposta, naoAvaliadas: ponte.naoAvaliadas, conflitos: ponte.conflitos };
}
