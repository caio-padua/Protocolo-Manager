import type { AnamneseQuestion } from "@workspace/api-client-react";

// Contrato de valor por tipo (espelha o adapter do servidor).
export type Valor =
  | { tipo: "boolean"; bool: boolean }
  | { tipo: "single"; opcao: string; valor?: string | number }
  | { tipo: "multi"; selecionados: string[] }
  | { tipo: "escala"; escala: number; max: number }
  | { tipo: "number"; numero: number }
  | { tipo: "texto"; texto: string };

export type ControlKind = "boolean" | "single" | "multi" | "escala" | "number" | "texto";

export interface Opcao {
  label: string;
  valor: string | number;
}

export function controlKind(q: AnamneseQuestion): ControlKind {
  const t = (q.tipoResposta || "").toUpperCase().trim();
  if (t === "SIM NAO" || t === "SIM/NAO" || t === "BOOLEAN") return "boolean";
  if (t === "ESCALA") return "escala";
  if (t === "NUMERO" || t === "NÚMERO") return "number";
  if (t === "MULTISELECAO" || t === "MULTISELEÇÃO" || t === "MULTI") return "multi";
  if (t === "LISTA" || t === "LISTA FECHADA" || t === "SELECT") return "single";
  return "texto";
}

export function parseOpcoes(raw: unknown): Opcao[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o): Opcao | null => {
      if (o == null) return null;
      if (typeof o === "string" || typeof o === "number") return { label: String(o), valor: o };
      if (typeof o === "object") {
        const r = o as Record<string, unknown>;
        const label = r.label ?? r.texto ?? r.nome ?? r.valor;
        const valor = r.valor ?? r.value ?? r.label;
        if (label == null) return null;
        return { label: String(label), valor: (valor as string | number) ?? String(label) };
      }
      return null;
    })
    .filter((o): o is Opcao => o !== null);
}

export function isAnswered(v: Valor | undefined): boolean {
  if (!v) return false;
  switch (v.tipo) {
    case "boolean":
      return typeof v.bool === "boolean";
    case "single":
      return !!v.opcao && v.opcao.length > 0;
    case "multi":
      return Array.isArray(v.selecionados) && v.selecionados.length > 0;
    case "escala":
      return typeof v.escala === "number";
    case "number":
      return typeof v.numero === "number";
    case "texto":
      return typeof v.texto === "string" && v.texto.trim().length > 0;
    default:
      return false;
  }
}

// Controles "discretos" disparam auto-avanco (exceto pergunta de alarme).
export function isDiscrete(kind: ControlKind): boolean {
  return kind === "boolean" || kind === "single" || kind === "escala";
}

// Verdadeiro se o valor respondido "inclui" qualquer um dos alvos (usado por
// dependeDe). Compara rotulos e valores; trata booleano como sim/nao.
export function valorIncludesAny(v: Valor | undefined, inclui: unknown[]): boolean {
  if (!v) return false;
  const wanted = inclui.map((x) => (typeof x === "string" ? x.toLowerCase() : x));
  const has = (cand: unknown): boolean => {
    if (cand == null) return false;
    if (typeof cand === "string") return wanted.includes(cand.toLowerCase());
    return wanted.includes(cand);
  };
  switch (v.tipo) {
    case "boolean":
      return wanted.includes(v.bool) || wanted.includes(v.bool ? "sim" : "nao");
    case "single":
      return has(v.opcao) || has(v.valor);
    case "multi":
      return v.selecionados.some((s) => has(s));
    case "escala":
      return has(v.escala);
    case "number":
      return has(v.numero);
    case "texto":
      return has(v.texto);
    default:
      return false;
  }
}
