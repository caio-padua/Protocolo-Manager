/**
 * Coordenador operacional do WhatsApp. Não redige com inteligência artificial.
 * Usa o cérebro clínico existente antes de oferecer menu ou executar operação.
 * Todas as dependências de dados/agenda são injetadas para teste sem rede.
 */
import {
  classificarQueixa, ehPedidoApresentacao, normalizar, pedidoClinicoExigeEquipe, planejarAtendimento,
  type DepsAtendimento, type EntradaAtendimento, type PlanoAtendimento,
} from "./atendimento-telegram";

export type IntencaoWhatsapp = "apresentacao" | "menu" | "agendar" | "retorno" |
  "orcamento" | "documentos" | "exames" | "endereco" | "humano" | "clinica" | "ambigua" | "desconhecida";
export const OPCOES_MENU: Record<string, string> = {
  "1": "Quero agendar uma consulta", "2": "Quero consultar meu retorno agendado",
  "3": "Quero um orçamento", "4": "Quero a segunda via de um documento",
  "5": "Quero meus pedidos de exames", "6": "Quero falar com a equipe",
};

/** Remove orações negadas ("não quero remarcar") para que não virem pedido. A segurança clínica usa o texto inteiro. */
export function removerOracoesNegadas(texto: string): string {
  return texto.split(/[,;.!?\n]|\bmas\b/i)
    .filter((o) => !/^\s*(?:eu\s+)?n[aã]o\s+(?:quero|preciso|desejo|vou|gostaria|queria|pedi|pedir)\b/i.test(o.normalize("NFC")))
    .join(" ");
}

export function classificarIntencaoWhatsapp(texto: string): IntencaoWhatsapp {
  if (classificarQueixa(texto) || pedidoClinicoExigeEquipe(texto)) return "clinica";
  const n = normalizar(removerOracoesNegadas(texto));
  if (ehPedidoApresentacao(texto)) return "apresentacao";
  if (/^(?:menu|inicio|iniciar|opcoes|ajuda|o que (?:voce|vc) faz|como pode me ajudar)$/.test(n)) return "menu";
  if (/\b(?:humano|atendente|secretaria|recepcao|equipe|pessoa de verdade|falar com alguem)\b/.test(n)) return "humano";
  const achadas = new Set<IntencaoWhatsapp>();
  if (/\b(?:orcamento|preco|precos|valor|valores|quanto custa|quanto fica)\b/.test(n)) achadas.add("orcamento");
  const agendar = /\b(?:agendar|agendamento|marcar|marcacao|remarcar|reagendar|desmarcar|cancelar consulta)\b/.test(n);
  if (agendar) achadas.add("agendar");
  else if (/\b(?:retorno|minha consulta|meu agendamento|consulta agendada|que dia.*consulta|quando.*consulta)\b/.test(n)) achadas.add("retorno");
  if (/\b(?:receita|receitas|prescricao|prescricoes|documento|documentos|protocolo|atestado|encaminhamento|segunda via)\b/.test(n)) achadas.add("documentos");
  if (/\b(?:endereco|onde fica|onde voces ficam|localizacao|como chegar|qual o local)\b/.test(n)) achadas.add("endereco");
  if (/\b(?:exame|exames|laboratorio)\b/.test(n)) {
    // "pedido de exames" é uma única intenção documental, não duas.
    if (!/\b(?:receita|protocolo|atestado)\b/.test(n)) achadas.delete("documentos");
    achadas.add("exames");
  }
  return achadas.size > 1 ? "ambigua" : [...achadas][0] ?? "desconhecida";
}

export interface DepsOperacionaisWhatsapp {
  menuAtivo: () => Promise<boolean>;
  frase: (chave: string, vars?: Record<string, string>) => Promise<string>;
  /** Contém apenas dado verificado do próprio cliente e clínica. */
  consultarRetorno: () => Promise<string | null>;
  agendar: (texto: string) => Promise<PlanoAtendimento | null>;
  /** Endereço do cadastro vigente da clínica de destino; null se ausente. */
  endereco?: () => Promise<string | null>;
  /** IA leve: só devolve uma intenção de lista fechada (nunca texto). Opcional. */
  /** Base Global (somente clínica licenciada): variação genérica conhecida -> intenção. */
  classificarGlobal?: (texto: string) => Promise<IntencaoWhatsapp | null>;
  classificarIA?: (texto: string) => Promise<IntencaoWhatsapp | null>;
  /** Guarda pergunta inédita não clínica para curadoria (nunca responde por ela). Opcional. */
  registrarInedita?: (texto: string, intencao: IntencaoWhatsapp, origem: "regra" | "ia") => Promise<void>;
}

export async function planejarAtendimentoWhatsapp(
  deps: DepsAtendimento, e: EntradaAtendimento, ops: DepsOperacionaisWhatsapp,
): Promise<PlanoAtendimento> {
  // A opção numérica pertence exclusivamente ao menu mais recente entregue.
  const n = normalizar(e.texto);
  const numero = n.match(/^(?:(?:opcao|numero) )?([1-6])$/)?.[1];
  const opcao = numero ? OPCOES_MENU[numero] : undefined;
  const texto = opcao && await ops.menuAtivo() ? opcao : e.texto;
  let intencao = classificarIntencaoWhatsapp(texto);
  // Reconhecidas não dependem de modelo, nem a ambiguidade vira texto inventado.
  const somenteOperacional = intencao === "humano" || intencao === "ambigua" || intencao === "menu";
  const plano = await planejarAtendimento({
    ...deps, escolherComIA: undefined, conferirComIA: undefined,
    ...(somenteOperacional ? { responderDocumento: undefined, buscarFaq: undefined, carregarOrientacoes: async () => [] } : {}),
  }, { ...e, texto });
  plano.intencao = intencao;
  if (["desligado", "fora_da_lista", "pausado_humano", "ja_tratado"].includes(plano.desfecho)) return plano;
  // Não substituir decisões clínicas, resposta aprovada ou documentos.
  if (plano.pausa !== "sem_orientacao_aprovada") return plano;
  if (intencao === "clinica") return plano;
  // Sem regra que reconheça: IA leve só escolhe a intenção; resposta continua sendo texto aprovado.
  let origem: "regra" | "ia" = "regra";
  if (intencao === "desconhecida" && ops.classificarGlobal) {
    const g = await ops.classificarGlobal(texto).catch(() => null);
    if (g && g !== "desconhecida" && g !== "clinica" && g !== "ambigua") { intencao = g; origem = "regra"; plano.intencao = intencao; }
  }
  if (intencao === "desconhecida" && ops.classificarIA) {
    const ia = await ops.classificarIA(texto);
    if (ia && ia !== "desconhecida" && ia !== "clinica" && ia !== "ambigua") { intencao = ia; origem = "ia"; plano.intencao = intencao; }
  }

  const respostaRegra = (resposta: string, desfecho: PlanoAtendimento["desfecho"] = "operacional_enviada"): PlanoAtendimento => ({
    resposta, desfecho, pausa: null, alerta: null, orientacaoId: null, faqId: null,
    caminhoResolucao: "regra", intencao, interpreteChamado: false, conferenteChamado: false, aprendizChamado: false,
  });
  const equipe = async (motivo: string): Promise<PlanoAtendimento> => ({
    ...respostaRegra(await ops.frase("atendimento_pedido_equipe")),
    pausa: motivo, alerta: `WhatsApp: solicitação ${intencao}, atendimento #${e.inboxMessageId}, cliente #${e.clienteId}. Abra a conversa protegida.`,
    desfecho: "encaminhado_humano", caminhoResolucao: "equipe",
    fonteOperacional: { chave: "atendimento_pedido_equipe" },
  });

  if (intencao === "humano") return equipe("solicitou_equipe");
  if (intencao === "agendar" || intencao === "desconhecida") {
    const agenda = await ops.agendar(texto);
    if (agenda) return { ...agenda, intencao: "agendar" };
  }
  if (intencao === "retorno") {
    const compromissos = await ops.consultarRetorno();
    return compromissos
      ? { ...respostaRegra(await ops.frase("atendimento_consulta_agenda", { compromissos })),
          fonteOperacional: {chave:"atendimento_consulta_agenda",variaveis:{compromissos}} }
      : equipe("retorno_sem_registro");
  }
  if (intencao === "endereco") {
    const endereco = await ops.endereco?.();
    return endereco
      ? { ...respostaRegra(await ops.frase("atendimento_endereco", { endereco })),
          fonteOperacional: { chave: "atendimento_endereco", variaveis: { endereco } } }
      : equipe("endereco_sem_cadastro");
  }
  if (intencao === "orcamento") return equipe("orcamento_sem_resposta_aprovada");
  if (intencao === "documentos" || intencao === "exames") return equipe("documento_sem_resposta_aplicavel");
  if (intencao === "desconhecida") await ops.registrarInedita?.(texto, intencao, origem).catch(() => undefined);
  return { ...respostaRegra(await ops.frase("atendimento_menu"), "menu_enviado"), intencao: "menu",
    fonteOperacional: {chave:"atendimento_menu"} };
}
