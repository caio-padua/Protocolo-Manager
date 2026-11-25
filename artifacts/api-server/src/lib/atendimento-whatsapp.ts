/**
 * Coordenador operacional do WhatsApp. Não redige com inteligência artificial.
 * Usa o cérebro clínico existente antes de oferecer menu ou executar operação.
 * Todas as dependências de dados/agenda são injetadas para teste sem rede.
 */
import { pedidoDeCondicaoEspecial } from "./budget-negociacao";
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

/**
 * Remove orações negadas ("não quero remarcar") para que não virem pedido. A segurança clínica usa o texto inteiro.
 * Funciona com ou sem pontuação: cada "quero/preciso/gostaria..." e cada "não quero..." abre uma oração nova.
 */
export function removerOracoesNegadas(texto: string): string {
  const marcado = texto.normalize("NFC")
    .replace(/\s+(?=(?:eu\s+)?n[aã]o\s+(?:quero|preciso|desejo|vou|gostaria|queria|pedi|pedir)\b)/gi, "|")
    .replace(/(?<!n[aã]o)\s+(?=(?:quero|preciso|desejo|gostaria|queria)\b)/gi, "|")
    .replace(/\s+(?=(?:e|mas)\s+sim\b)/gi, "|");
  return marcado.split(/[,;.!?\n|]|\bmas\b/i)
    .filter((o) => !/^\s*(?:eu\s+)?n[aã]o\s+(?:quero|preciso|desejo|vou|gostaria|queria|pedi|pedir)\b/i.test(o))
    .join(" ");
}

/** Pedidos operacionais encontrados no texto já sem as orações negadas (ordem fixa e determinística). */
export function pedidosOperacionais(texto: string): IntencaoWhatsapp[] {
  const n = normalizar(removerOracoesNegadas(texto));
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
  return [...achadas];
}

export function classificarIntencaoWhatsapp(texto: string): IntencaoWhatsapp {
  if (classificarQueixa(texto) || pedidoClinicoExigeEquipe(texto)) return "clinica";
  const n = normalizar(removerOracoesNegadas(texto));
  if (ehPedidoApresentacao(texto)) return "apresentacao";
  if (/^(?:menu|inicio|iniciar|opcoes|ajuda|o que (?:voce|vc) faz|como pode me ajudar)$/.test(n)) return "menu";
  if (/\b(?:humano|atendente|secretaria|recepcao|equipe|pessoa de verdade|falar com alguem)\b/.test(n)) return "humano";
  const achadas = pedidosOperacionais(texto);
  return achadas.length > 1 ? "ambigua" : achadas[0] ?? "desconhecida";
}

const ROTULO_PEDIDO: Partial<Record<IntencaoWhatsapp, string>> = {
  agendar: "agendar ou remarcar uma consulta", retorno: "consultar seu agendamento", orcamento: "receber um orçamento",
  documentos: "receitas ou documentos", exames: "pedidos de exames", endereco: "saber o endereço da clínica",
};

/** Situação do contato lida em silêncio no banco (só após o vínculo do número com um cadastro único). */
export type StatusSilencioso =
  | { tipo: "consulta"; nome: string; data: string; hora: string; unidade?: string | null }
  | { tipo: "protocolo" | "antigo"; nome: string }
  | { tipo: "novo" };

/** Perguntas institucionais com resposta aprovada gravada no banco (sem IA, sem dado clínico). */
export function perguntaInstitucional(texto: string): "quem_e_dr_caio" | "preco_consulta" | null {
  const n = normalizar(texto);
  if (/\bquem (?:e|eh) (?:o )?(?:dr|doutor)\.? ?(?:caio|padua)\b|\bcurriculo\b|\bformacao do (?:dr|doutor)\b|\bquem (?:e|eh) o medico\b/.test(n)) return "quem_e_dr_caio";
  if (/\b(?:preco|valor|quanto custa|quanto fica|quanto cobra|quanto e)\b/.test(n) && /\b(?:consulta|atendimento|avaliacao|dr caio|doutor)\b/.test(n)) return "preco_consulta";
  return null;
}

export interface DepsOperacionaisWhatsapp {
  /** Consulta silenciosa de status (agenda futura, protocolo ativo) do cadastro já vinculado ao número. */
  statusSilencioso?: () => Promise<StatusSilencioso>;
  /** Link inteligente de agendamento da clínica. */
  linkMarcacao?: () => string;
  menuAtivo: () => Promise<boolean>;
  /** Interruptor do menu numerado ("1 — ... 6 —"). Ausente = ligado. Desligado: abertura conversacional, sem números. */
  menuNumeradoAtivo?: () => Promise<boolean>;
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
  /** Cliente escreveu no meio de uma cadência de negociação: pausa e entrega ao humano (null = nada ativo). */
  negociacaoAtiva?: () => Promise<PlanoAtendimento | null>;
  /** Pedido de condição melhor com orçamento aceito: abre Caminho A (cadência) ou B (humano). null = fluxo antigo. */
  negociar?: (texto: string) => Promise<PlanoAtendimento | null>;
}

export async function planejarAtendimentoWhatsapp(
  deps: DepsAtendimento, e: EntradaAtendimento, ops: DepsOperacionaisWhatsapp,
): Promise<PlanoAtendimento> {
  const t0 = Date.now();
  const m = { classificacaoMs: 0 };
  const plano = await planejarInterno(deps, e, ops, m);
  plano.medicoes = { classificacaoMs: m.classificacaoMs, planejamentoMs: Date.now() - t0 };
  return plano;
}

async function planejarInterno(
  deps: DepsAtendimento, e: EntradaAtendimento, ops: DepsOperacionaisWhatsapp, m: { classificacaoMs: number },
): Promise<PlanoAtendimento> {
  // Mensagem sem conteúdo textual (só emoji, pontuação ou símbolos): nada a responder, mas fica registrada.
  if (!normalizar(e.texto)) {
    return { pausa: null, alerta: null, resposta: null, orientacaoId: null, faqId: null, desfecho: "sem_conteudo_textual",
      caminhoResolucao: "regra", intencao: "sem_conteudo", intencaoDetectada: "sem_conteudo", origemIntencao: "regra", intencoes: [] };
  }
  // Mensagem do cliente durante uma cadência de negociação: pausa a automação ANTES de qualquer classificação.
  const interrompida = await ops.negociacaoAtiva?.();
  if (interrompida) return { ...interrompida, intencao: "orcamento", intencaoDetectada: "orcamento", origemIntencao: "regra", intencoes: ["orcamento"] };
  // A opção numérica pertence exclusivamente ao menu mais recente entregue.
  const n = normalizar(e.texto);
  const menuNumerado = await (ops.menuNumeradoAtivo?.() ?? true);
  const numero = menuNumerado ? n.match(/^(?:(?:opcao|numero) )?([1-6])$/)?.[1] : undefined;
  const opcao = numero ? OPCOES_MENU[numero] : undefined;
  const texto = opcao && await ops.menuAtivo() ? opcao : e.texto;
  const tc0 = Date.now();
  let intencao = classificarIntencaoWhatsapp(texto);
  m.classificacaoMs += Date.now() - tc0;
  // Reconhecidas não dependem de modelo, nem a ambiguidade vira texto inventado.
  const somenteOperacional = intencao === "humano" || intencao === "ambigua" || intencao === "menu";
  const plano = await planejarAtendimento({
    ...deps, escolherComIA: undefined, conferirComIA: undefined,
    ...(somenteOperacional ? { responderDocumento: undefined, buscarFaq: undefined, carregarOrientacoes: async () => [] } : {}),
  }, { ...e, texto });
  plano.intencao = intencao;
  plano.intencaoDetectada = intencao;
  plano.origemIntencao = "regra";
  // Saudação: abertura escolhida pela situação real do cadastro (consulta futura, protocolo, antigo ou novo).
  if (intencao === "apresentacao" && plano.desfecho === "apresentacao_enviada" && saudacaoPura(texto)) {
    const ab = await aberturaPorStatus(ops);
    if (ab) { plano.resposta = ab.texto; plano.fonteOperacional = { chave: ab.chave }; }
  }
  if (["desligado", "fora_da_lista", "pausado_humano", "ja_tratado"].includes(plano.desfecho)) return plano;
  // Não substituir decisões clínicas, resposta aprovada ou documentos.
  if (plano.pausa !== "sem_orientacao_aprovada") return plano;
  if (intencao === "clinica") return plano;
  // Perguntas institucionais aprovadas (currículo e valor): texto gravado no banco, nunca gerado por IA.
  const inst = perguntaInstitucional(texto);
  if (inst && ops.linkMarcacao && !(inst === "preco_consulta" && ops.negociar && pedidoDeCondicaoEspecial(texto))) {
    const chave = inst === "quem_e_dr_caio" ? "resposta_quem_e_dr_caio" : "resposta_preco_consulta";
    const corpo = await ops.frase(chave, { link: ops.linkMarcacao() });
    const cont = await ops.frase("continuidade_ajuda");
    const intInst: IntencaoWhatsapp = inst === "preco_consulta" ? "orcamento" : "desconhecida";
    return { pausa: null, alerta: null, resposta: `${corpo}\n\n${cont}`, orientacaoId: null, faqId: null, desfecho: "operacional_enviada",
      caminhoResolucao: "regra", intencao: intInst, intencaoDetectada: intInst, origemIntencao: "regra", intencoes: [intInst],
      interpreteChamado: false, conferenteChamado: false, aprendizChamado: false, fonteOperacional: { chave } };
  }
  // Sem regra que reconheça: IA leve só escolhe a intenção; resposta continua sendo texto aprovado.
  let origem: "regra" | "ia" = "regra";
  const tg0 = Date.now();
  if (intencao === "desconhecida" && ops.classificarGlobal) {
    const g = await ops.classificarGlobal(texto).catch(() => null);
    if (g && g !== "desconhecida" && g !== "clinica" && g !== "ambigua") { intencao = g; origem = "regra"; plano.intencao = intencao; }
  }
  if (intencao === "desconhecida" && ops.classificarIA) {
    const ia = await ops.classificarIA(texto);
    if (ia && ia !== "desconhecida" && ia !== "clinica" && ia !== "ambigua") { intencao = ia; origem = "ia"; plano.intencao = intencao; }
  }

  m.classificacaoMs += Date.now() - tg0;
  plano.intencaoDetectada = intencao;
  plano.origemIntencao = origem;
  const todas = [...new Set<string>([intencao, ...pedidosOperacionais(texto)])].filter((x) => x !== "desconhecida");
  plano.intencoes = todas;
  const detectada = { intencaoDetectada: intencao, origemIntencao: origem };
  const respostaRegra = (resposta: string, desfecho: PlanoAtendimento["desfecho"] = "operacional_enviada"): PlanoAtendimento => ({
    resposta, desfecho, pausa: null, alerta: null, orientacaoId: null, faqId: null, ...detectada, intencoes: todas,
    caminhoResolucao: "regra", intencao, interpreteChamado: false, conferenteChamado: false, aprendizChamado: false,
  });
  const canalNome = e.canal === "telegram" ? "Telegram" : "WhatsApp";
  const equipe = async (motivo: string): Promise<PlanoAtendimento> => ({
    ...respostaRegra(await ops.frase("atendimento_pedido_equipe")), intencoes: todas,
    pausa: motivo, alerta: `${canalNome}: solicitação ${intencao}, atendimento #${e.inboxMessageId}, cliente #${e.clienteId}. Abra a conversa protegida.`,
    desfecho: "encaminhado_humano", caminhoResolucao: "equipe",
    fonteOperacional: { chave: "atendimento_pedido_equipe" },
  });

  if (intencao === "humano") return equipe("solicitou_equipe");
  if (intencao === "ambigua") {
    // Dois pedidos na mesma mensagem: nenhuma combinação está prevista, então nenhum é escolhido em silêncio.
    const opcoes = todas.filter((x) => x !== "ambigua").map((x) => `• ${ROTULO_PEDIDO[x as IntencaoWhatsapp] ?? x}`).join("\n");
    return { ...respostaRegra(await ops.frase("atendimento_esclarecer", { opcoes })), intencoes: todas, intencao: "ambigua",
      fonteOperacional: { chave: "atendimento_esclarecer", variaveis: { opcoes } } };
  }
  if (intencao === "agendar" || intencao === "desconhecida") {
    const agenda = await ops.agendar(texto);
    if (agenda) return { ...agenda, intencao: "agendar", ...detectada };
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
  if ((intencao === "orcamento" || intencao === "desconhecida") && ops.negociar && pedidoDeCondicaoEspecial(texto)) {
    const neg = await ops.negociar(texto);
    if (neg) return { ...neg, intencao: "orcamento", ...detectada, intencoes: todas };
  }
  if (intencao === "orcamento") return equipe("orcamento_sem_resposta_aprovada");
  if (intencao === "documentos" || intencao === "exames") return equipe("documento_sem_resposta_aplicavel");
  if (intencao === "desconhecida") {
    // Sem fonte autorizada: registra como não reconhecida, avisa a equipe e usa somente o texto institucional aprovado.
    await ops.registrarInedita?.(texto, intencao, origem).catch(() => undefined);
    return { ...respostaRegra(await ops.frase("atendimento_nao_reconhecida")), intencoes: [], intencao: "desconhecida",
      alerta: `${canalNome}: pergunta não reconhecida, atendimento #${e.inboxMessageId}, cliente #${e.clienteId}. Abra a conversa protegida.`,
      desfecho: "encaminhado_humano", caminhoResolucao: "equipe", fonteOperacional: { chave: "atendimento_nao_reconhecida" } };
  }
  if (!menuNumerado) {
    const ab = await aberturaPorStatus(ops);
    if (ab) return { ...respostaRegra(ab.texto), intencao: "menu", fonteOperacional: { chave: ab.chave } };
    return { ...respostaRegra(await ops.frase("atendimento_abertura_livre")), intencao: "menu",
      fonteOperacional: { chave: "atendimento_abertura_livre" } };
  }
  return { ...respostaRegra(await ops.frase("atendimento_menu"), "menu_enviado"), intencao: "menu",
    fonteOperacional: {chave:"atendimento_menu"} };
}

/** Escolhe uma das 4 aberturas gravadas no banco conforme a situação real do cadastro. */
async function aberturaPorStatus(ops: DepsOperacionaisWhatsapp): Promise<{ chave: string; texto: string } | null> {
  if (!ops.statusSilencioso) return null;
  const st = await ops.statusSilencioso();
  const nome = "nome" in st ? (st.nome.trim().split(/\s+/)[0] ?? "") : "";
  if (st.tipo === "consulta") {
    const unidade = st.unidade?.trim() ? `, na unidade ${st.unidade.trim()}` : "";
    return { chave: "abertura_consulta_agendada", texto: await ops.frase("abertura_consulta_agendada", { nome, data: st.data, hora: st.hora, unidade }) };
  }
  if (st.tipo === "protocolo") return { chave: "abertura_protocolo_andamento", texto: await ops.frase("abertura_protocolo_andamento", { nome }) };
  if (st.tipo === "antigo") return { chave: "abertura_paciente_antigo", texto: await ops.frase("abertura_paciente_antigo", { nome }) };
  return { chave: "abertura_contato_novo", texto: await ops.frase("abertura_contato_novo") };
}

/** Só saudação simples ("Olá", "bom dia"): perguntas de identidade ("com quem falo?") continuam apresentando a Helena. */
export function saudacaoPura(texto: string): boolean {
  const n = normalizar(texto);
  return /^(?:ola|oi|bom dia|boa tarde|boa noite|e ai|opa)\b/.test(n) && !/\b(?:quem|nome|chama|falando|conversando|respondendo)\b/.test(n);
}
