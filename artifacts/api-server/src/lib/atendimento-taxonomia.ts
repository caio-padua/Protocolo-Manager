/**
 * Sinapses do atendimento: Tronco (categoria) e Ramificação (subcategoria).
 * Estrutura única para Frases, Aprendidas e perguntas inéditas. O isolamento
 * por clínica continua sendo a coluna empresa_id de cada tabela (o tenant).
 * Nada aqui concede resposta automática: é só organização e curadoria.
 */
export const TRONCOS = {
  recepcao: { nome: "Recepção", ramos: { apresentacao: "Apresentação", menu: "Menu e orientação inicial", clinica: "Sobre a clínica" } },
  agendamento: { nome: "Agendamento", ramos: { marcar: "Marcar consulta", consultar: "Consultar retorno", remarcar: "Remarcar ou cancelar", horarios: "Horários e locais" } },
  receitas_exames: { nome: "Receitas & Exames", ramos: { receitas: "Receitas e protocolos", exames: "Pedidos de exames", segunda_via: "Segunda via" } },
  financeiro: { nome: "Financeiro", ramos: { orcamento: "Orçamento", pagamento: "Pagamento e cobrança" } },
  pos_consulta: { nome: "Pós-Consulta", ramos: { orientacoes: "Orientações aprovadas", acompanhamento: "Acompanhamento" } },
  triagem_clinica: { nome: "Triagem Clínica", ramos: { equipe: "Falar com a equipe", queixa: "Queixa ou risco clínico" } },
} as const;

export type TroncoId = keyof typeof TRONCOS;
export interface Ramificacao { tronco: TroncoId; ramo: string }

export function ramificacaoValida(tronco: string | null | undefined, ramo: string | null | undefined): boolean {
  if (!tronco || !ramo || !(tronco in TRONCOS)) return false;
  return ramo in TRONCOS[tronco as TroncoId].ramos;
}

/** Intenção do WhatsApp -> ramificação padrão (curadoria humana pode alterar depois). */
export function ramificacaoDaIntencao(intencao: string | null | undefined): Ramificacao {
  switch (intencao) {
    case "apresentacao": return { tronco: "recepcao", ramo: "apresentacao" };
    case "menu": return { tronco: "recepcao", ramo: "menu" };
    case "agendar": return { tronco: "agendamento", ramo: "marcar" };
    case "retorno": return { tronco: "agendamento", ramo: "consultar" };
    case "orcamento": return { tronco: "financeiro", ramo: "orcamento" };
    case "documentos": return { tronco: "receitas_exames", ramo: "receitas" };
    case "exames": return { tronco: "receitas_exames", ramo: "exames" };
    case "endereco": return { tronco: "agendamento", ramo: "horarios" };
    case "humano": return { tronco: "triagem_clinica", ramo: "equipe" };
    case "clinica": return { tronco: "triagem_clinica", ramo: "queixa" };
    default: return { tronco: "recepcao", ramo: "clinica" };
  }
}

/** Grupo da tela Frases -> ramificação (somente leitura, sem alterar o texto). */
export function ramificacaoDoGrupoDeFrase(grupo: string | null | undefined): Ramificacao {
  const g = (grupo ?? "").toLowerCase();
  if (g.includes("abertura") || g.includes("quem")) return { tronco: "recepcao", ramo: "apresentacao" };
  if (g.includes("atendimento whatsapp")) return { tronco: "recepcao", ramo: "menu" };
  if (g.includes("agendamento") || g.includes("horário") || g.includes("horario")) return { tronco: "agendamento", ramo: "marcar" };
  if (g.includes("equipe")) return { tronco: "triagem_clinica", ramo: "equipe" };
  if (g.includes("receita") || g.includes("exame") || g.includes("documento")) return { tronco: "receitas_exames", ramo: "receitas" };
  if (g.includes("pagamento") || g.includes("financ")) return { tronco: "financeiro", ramo: "pagamento" };
  return { tronco: "recepcao", ramo: "clinica" };
}

export function arvoreParaTela() {
  return Object.entries(TRONCOS).map(([id, t]) => ({
    id, nome: t.nome, ramos: Object.entries(t.ramos).map(([rid, nome]) => ({ id: rid, nome })),
  }));
}
