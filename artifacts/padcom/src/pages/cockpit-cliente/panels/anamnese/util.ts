import { getCollabToken } from "@/lib/collab-auth";

export const NAVY = "#16294a";
export const OURO = "#9a7b32";
export const MUDO = "#647c97";
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type Volatilidade = "fixa" | "acumula" | "evolutiva" | "muda";
export const VOL_ROTULO: Record<Volatilidade, string> = { fixa: "Fixa", acumula: "Acumula", evolutiva: "Evolutiva", muda: "Muda" };
export const VOL_COR: Record<Volatilidade, string> = { fixa: "#64748b", acumula: OURO, evolutiva: "#0f766e", muda: NAVY };
export const VOL_AJUDA: Record<Volatilidade, string> = {
  fixa: "Não muda com o tempo. Vem preenchida da anamnese anterior.",
  acumula: "Só cresce (cirurgias, alergias, doenças, família). Vem preenchida; o cliente acrescenta.",
  evolutiva: "Condição com curso (ex.: hipertensão). Vem preenchida; o cliente informa se manteve, melhorou, piorou, entrou em remissão ou curou.",
  muda: "Estado atual. Vem em branco; a resposta anterior serve de comparação.",
};

export type SessaoResumo = {
  id: number; mode: string; status: string; startedAt: string; completedAt: string | null;
  respondidas: number; diagnosticado: number; suspeito: number; temAlarme: boolean;
};
export type Resposta = {
  id: number; questionRowId: number; volatilidade: Volatilidade; perguntaId: string | null;
  pergunta: string | null; bloco: string | null; sistema: string | null; tipoResposta: string | null;
  valor: unknown; respondidoEm: string; origemCadastro?: boolean;
};
export type IdentidadeCadastro = { nome: string | null; cpfMascarado: string | null; dataNascimento: string | null; idade: number | null };
export type SessaoDetalhe = {
  id: number; clientId?: number | null; identidade?: IdentidadeCadastro | null; status: string; mode: string; startedAt: string; completedAt: string | null;
  findings: { id: number; tipo: string; rotulo: string; severidade: string | null }[];
  refusals: { id: number; escopo: string; alvo: string; motivo: string | null }[];
  notes: { id: number; grupo: string; observacao: string }[];
  respostas?: Resposta[];
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getCollabToken() ?? ""}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((corpo as { error?: string }).error ?? `HTTP ${res.status}`);
  return corpo as T;
}

const FUSO = "America/Sao_Paulo";
export const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
export const horaBR = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }) : "");
export function haQuanto(iso: string | null, agora = Date.now()): string {
  if (!iso) return "";
  const dias = Math.floor((agora - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  if (dias < 60) return `há ${dias} dias`;
  const m = Math.floor(dias / 30.4);
  return m < 24 ? `há ${m} meses` : `há ${Math.floor(m / 12)} anos`;
}
export const quando = (s: { completedAt: string | null; startedAt: string }) => s.completedAt ?? s.startedAt;
export const concluida = (s: { status: string }) => s.status === "concluida" || s.status === "concluido";

/** Formata o `valor` jsonb de forma tolerante: formas legadas e primitivas nunca quebram a tela. */
export function formatarValor(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (Array.isArray(v)) return v.map(formatarValor).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    switch (typeof o.tipo === "string" ? o.tipo : null) {
      case "boolean": case "bool": return o.bool === true ? "Sim" : o.bool === false ? "Não" : "—";
      case "single": return formatarValor(o.opcao ?? o.valor);
      case "multi": return Array.isArray(o.selecionados) && o.selecionados.length > 0 ? o.selecionados.map(formatarValor).join(", ") : "—";
      case "escala": return o.escala != null ? `${String(o.escala)}${o.max != null ? ` de ${String(o.max)}` : ""}` : "—";
      case "number": case "num": return o.numero != null ? String(o.numero) : "—";
      case "texto": return typeof o.texto === "string" && o.texto.trim() !== "" ? o.texto : "—";
      default: try { return JSON.stringify(o); } catch { return "—"; }
    }
  }
  return String(v);
}

/** Itens de uma resposta de multipla escolha (ou null se nao for lista). */
export function itensLista(v: unknown): string[] | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (o.tipo === "multi" && Array.isArray(o.selecionados)) return o.selecionados.map(formatarValor);
  }
  return Array.isArray(v) ? v.map(formatarValor) : null;
}
export function numeroDe(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const n = o.tipo === "escala" ? o.escala : o.tipo === "number" || o.tipo === "num" ? o.numero : null;
    if (typeof n === "number") return n;
    if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n);
  }
  return null;
}
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
function chave(v: unknown): string {
  const l = itensLista(v);
  return l ? l.map(norm).sort().join("|") : norm(formatarValor(v));
}

export type Situacao = "mudou" | "igual" | "novo" | "removido";
export interface LinhaComparada {
  rowId: number; pergunta: string; bloco: string; vol: Volatilidade; situacao: Situacao;
  antes: string; depois: string; acrescentou: string[]; retirou: string[]; delta: number | null;
}
const blocoDe = (r: Resposta) => r.bloco || r.sistema || "Geral";
const vazio = (v: unknown) => formatarValor(v) === "—";

/** Compara duas anamneses pela identidade da pergunta (id numerico do questionario; perguntaId REPETE). */
/** Identidade (nome, CPF, idade) vem do cadastro: nunca e evolucao clinica. */
export const IDENTIDADE_IDS = [1, 2, 41];
const ehIdent = (r: Resposta) => r.origemCadastro === true || IDENTIDADE_IDS.includes(r.questionRowId);
/** So se compara anamnese do MESMO cliente (a lista ja vem isolada por clinica no servidor). */
export function podeComparar(a?: { clientId?: number | null }, b?: { clientId?: number | null }): boolean {
  return !!a && !!b && a.clientId != null && a.clientId === b.clientId;
}

export function compararSessoes(base0: Resposta[], atual0: Resposta[]): LinhaComparada[] {
  const base = base0.filter((r) => !ehIdent(r)), atual = atual0.filter((r) => !ehIdent(r));
  const mb = new Map(base.map((r) => [r.questionRowId, r]));
  const ma = new Map(atual.map((r) => [r.questionRowId, r]));
  const ids = new Set([...mb.keys(), ...ma.keys()]);
  const out: LinhaComparada[] = [];
  for (const id of ids) {
    const b = mb.get(id), a = ma.get(id);
    const ref = (a ?? b)!;
    const bv = b && !vazio(b.valor) ? b : undefined, av = a && !vazio(a.valor) ? a : undefined;
    if (!bv && !av) continue;
    const lb = bv ? itensLista(bv.valor) : null, la = av ? itensLista(av.valor) : null;
    const nb = new Set((lb ?? []).map(norm)), na = new Set((la ?? []).map(norm));
    const nBase = bv ? numeroDe(bv.valor) : null, nAtual = av ? numeroDe(av.valor) : null;
    const situacao: Situacao = !bv ? "novo" : !av ? "removido" : chave(bv.valor) === chave(av.valor) ? "igual" : "mudou";
    out.push({
      rowId: id, pergunta: ref.pergunta ?? ref.perguntaId ?? "Pergunta removida do questionário", bloco: blocoDe(ref), vol: ref.volatilidade, situacao,
      antes: bv ? formatarValor(bv.valor) : "—", depois: av ? formatarValor(av.valor) : "—",
      acrescentou: la && lb ? la.filter((x) => !nb.has(norm(x))) : [], retirou: la && lb ? lb.filter((x) => !na.has(norm(x))) : [],
      delta: situacao === "mudou" && nBase != null && nAtual != null ? nAtual - nBase : null,
    });
  }
  return out;
}

export function compararAchados(base: SessaoDetalhe["findings"], atual: SessaoDetalhe["findings"]) {
  const kb = new Map(base.map((f) => [norm(f.rotulo), f])), ka = new Map(atual.map((f) => [norm(f.rotulo), f]));
  return {
    novos: atual.filter((f) => !kb.has(norm(f.rotulo))),
    mantidos: atual.filter((f) => kb.has(norm(f.rotulo))),
    resolvidos: base.filter((f) => !ka.has(norm(f.rotulo))),
  };
}

export function agruparPorBloco<T extends { bloco: string }>(linhas: T[]): Array<[string, T[]]> {
  const m = new Map<string, T[]>();
  for (const l of linhas) m.set(l.bloco, [...(m.get(l.bloco) ?? []), l]);
  return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0], "pt-BR"));
}
export { blocoDe };
