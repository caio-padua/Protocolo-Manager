/**
 * Texto de orientação ao paciente: regras compartilhadas entre a tela Dúvidas e Orientações e o envio.
 * O Telegram recebe em formato HTML: <, > e & precisam ser escapados para o paciente ver o texto exatamente
 * como foi aprovado. Quebras de linha e emojis seguem como estão.
 */
export const LIMITE_RESPOSTA = 4000;

export function normalizarQuebras(t: string): string {
  return t.replace(/\r\n?/g, "\n");
}

export function escaparHtmlTelegram(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Marcadores ainda não preenchidos, como [nome] ou {{horarios}}: nunca podem ir ao paciente. */
export function marcadoresPendentes(t: string): string[] {
  return [...new Set([...(t.match(/\[[^\]\n]{1,60}\]/g) ?? []), ...(t.match(/\{\{[^}\n]{1,60}\}\}/g) ?? [])])];
}

/** Catálogo fixo de categorias e subcategorias (espelhado na tela). Nulo = "Sem categoria" (registros antigos). */
export const CATEGORIAS: Record<string, { rotulo: string; sub: Record<string, string> }> = {
  apresentacao: { rotulo: "Apresentação e acolhimento", sub: { clinica: "Apresentação da clínica", assistente: "Apresentação da assistente virtual", primeiro_contato: "Primeiro contato", retorno: "Retorno" } },
  agendamento: { rotulo: "Agendamento", sub: { modalidade: "Modalidade", preferencia: "Preferência", horarios: "Horários", confirmacao: "Confirmação", remarcacao: "Remarcação" } },
  clinicas: { rotulo: "Dúvidas clínicas e medicações", sub: { acolhimento: "Acolhimento", encaminhamento: "Encaminhamento" } },
  gerais: { rotulo: "Informações gerais", sub: { valores: "Valores", locais: "Locais", atendimento: "Atendimento", exames: "Exames", aplicativo: "Aplicativo" } },
  outros: { rotulo: "Outros assuntos", sub: { a_classificar: "A classificar" } },
};

/** string = erro; null = sem categoria; objeto = válido. */
export function validarCategoria(cat: unknown, sub: unknown): string | { categoria: string | null; subcategoria: string | null } {
  const c = typeof cat === "string" && cat.trim() ? cat.trim() : null;
  const s = typeof sub === "string" && sub.trim() ? sub.trim() : null;
  if (!c) return s ? "subcategoria exige categoria" : { categoria: null, subcategoria: null };
  const def = CATEGORIAS[c];
  if (!def) return "categoria inválida";
  if (s && !def.sub[s]) return "subcategoria inválida para a categoria";
  return { categoria: c, subcategoria: s };
}

export const LIMITE_TOM = 4000;
