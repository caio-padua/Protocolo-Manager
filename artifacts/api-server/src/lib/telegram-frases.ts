/**
 * Frases do assistente de agendamento do Telegram.
 *
 * Fonte de verdade em execução: tabela `telegram_frases` (editável na tela do CEO).
 * O mapa FRASES_PADRAO só semeia a tabela na primeira vez (ON CONFLICT DO NOTHING):
 * nunca sobrescreve texto que o CEO já editou. Se a leitura do banco falhar, o assistente
 * não responde (a equipe vê a mensagem na Central); não existe texto de reserva escondido.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";

export interface DefinicaoFrase {
  texto: string;
  grupo: string;
  descricao: string;
  /** Variáveis aceitas, escritas como {nome} no texto. */
  variaveis: string[];
  /** Variáveis que não podem faltar (carregam dado real, como a lista de horários). */
  obrigatorias?: string[];
}

export const FRASES_PADRAO = {
  apresentacao: { grupo: "Abertura", descricao: "Primeira frase da conversa: nome da pessoa, quem é a assistente e a clínica.", variaveis: [], texto: "{nome_linha}Eu me chamo Helena, assistente de {clinica}.\n\nTudo bem?" },
  apresentacao_sem_clinica: { grupo: "Abertura", descricao: "Primeira frase quando a clínica não tem nome cadastrado.", variaveis: [], texto: "{nome_linha}Eu me chamo Helena, assistente virtual da clínica.\n\nTudo bem?" },
  assinatura: { grupo: "Abertura", descricao: "Assinatura no fim das mensagens importantes.", variaveis: [], texto: "Helena\nAssistente de {clinica}" },
  visitante_encaminhado: { grupo: "Abertura", descricao: "Quem não é cliente escreveu algo que não é pedido de consulta.", variaveis: [], texto: "Estou aqui à sua disposição.\n\nJá avisei a equipe sobre a sua mensagem, e ela responde por aqui.\n\nSe quiser marcar uma consulta agora, é só escrever: quero marcar uma consulta.\n\n{assinatura}" },
  queixa_visitante: { grupo: "Abertura", descricao: "Resposta a queixa de saúde de quem não é cliente. Nunca opina sobre saúde.", variaveis: ["apresentacao"], texto: "{apresentacao}\n\nRecebi a sua mensagem, e já avisei a equipe.\n\nEla responde por aqui, o mais rápido possível.\n\nSe for algo urgente, procure o pronto-socorro ou ligue 192 (SAMU).\n\n{assinatura}" },
  enviar_link_marcacao: { grupo: "Abertura", descricao: "Cliente pediu para marcar consulta: recebe o link de marcação.", variaveis: ["link"], obrigatorias: ["link"], texto: "Com todo prazer.\n\nPara marcar a sua consulta, é só acessar este link e escolher o melhor horário:\n\n{link}\n\nSe tiver qualquer dúvida, estou aqui.\n\n{assinatura}" },
  pergunta_ja_paciente: { grupo: "Quem é a pessoa", descricao: "Primeira pergunta para quem não está vinculado: já é cliente ou é a primeira vez.", variaveis: [], texto: "Para começar, uma pergunta rápida.\n\nVocê já é cliente da clínica, ou será a sua primeira consulta?\n\nPode responder: \"já sou cliente\" ou \"primeira vez\"." },
  vinculo_nao_entendido: { grupo: "Quem é a pessoa", descricao: "Não deu para entender se já é cliente.", variaveis: [], texto: "{nome_linha}Desculpe, não entendi.\n\nPode responder \"já sou cliente\" ou \"primeira vez\"?" },
  pedir_identidade: { grupo: "Quem é a pessoa", descricao: "Pede os dados para conferir o cadastro de quem diz já ser cliente.", variaveis: [], texto: "{nome_linha}Que bom ter você aqui.\n\nPara confirmar o seu cadastro, escreva numa só mensagem:\n\nSeu nome completo, os 4 primeiros números do seu CPF e o ano em que você nasceu.\n\nPor exemplo: Maria Souza 1234 1985." },
  identidade_formato: { grupo: "Quem é a pessoa", descricao: "A mensagem de confirmação veio incompleta.", variaveis: [], texto: "{nome_linha}Não consegui ler os dados.\n\nEscreva o nome completo, os 4 primeiros números do CPF e o ano de nascimento, nessa ordem.\n\nPor exemplo: Maria Souza 1234 1985." },
  identidade_nao_confirmada: { grupo: "Quem é a pessoa", descricao: "Os dados não bateram. Não diz qual dado errou.", variaveis: [], texto: "{nome_linha}Não consegui confirmar os seus dados com o cadastro.\n\nConfira com calma e envie de novo: nome completo, 4 primeiros números do CPF e ano de nascimento." },
  identidade_encaminhada: { grupo: "Quem é a pessoa", descricao: "Falhou mais de uma vez: a equipe assume.", variaveis: [], texto: "{nome_linha}Não consegui confirmar o seu cadastro por aqui, e está tudo bem.\n\nEncaminhei a nossa conversa para a equipe, que responde por aqui.\n\n{assinatura}" },
  identidade_confirmada: { grupo: "Quem é a pessoa", descricao: "Cadastro conferido; segue para a modalidade.", variaveis: ["pergunta_modalidade"], texto: "{nome_linha}Cadastro conferido, obrigada.\n\n{pergunta_modalidade}" },
  pergunta_modalidade: { grupo: "Perguntas do agendamento", descricao: "Online ou presencial.", variaveis: [], texto: "A consulta seria online ou presencial?" },
  pergunta_preferencias: { grupo: "Perguntas do agendamento", descricao: "Dias e período preferidos.", variaveis: [], texto: "Quais dias da semana ficam melhores para você?\n\nE qual período: manhã, tarde ou noite?" },
  pergunta_periodo: { grupo: "Perguntas do agendamento", descricao: "Só falta o período.", variaveis: [], texto: "Qual período fica melhor para você: manhã, tarde ou noite?\n\nSe tanto faz, é só me dizer." },
  vamos_marcar: { grupo: "Perguntas do agendamento", descricao: "Início do agendamento.", variaveis: ["pergunta_modalidade"], texto: "Vamos marcar a sua consulta.\n\n{pergunta_modalidade}" },
  certo_modalidade: { grupo: "Perguntas do agendamento", descricao: "Confirma a modalidade e pergunta o que falta.", variaveis: ["modalidade", "pergunta"], obrigatorias: ["pergunta"], texto: "Certo, {modalidade}.\n\n{pergunta}" },
  recomecar: { grupo: "Perguntas do agendamento", descricao: "A pessoa pediu para recomeçar.", variaveis: ["pergunta_modalidade"], texto: "{nome_linha}Sem problema, vamos recomeçar.\n\n{pergunta_modalidade}" },
  olhando_agenda: { grupo: "Horários", descricao: "Antes de mostrar os horários.", variaveis: [], texto: "Só um instante, vou olhar a agenda." },
  procurando_outras: { grupo: "Horários", descricao: "A pessoa recusou as opções.", variaveis: [], texto: "Sem problema.\n\nProcurei outras opções para você." },
  procurando_preferencia: { grupo: "Horários", descricao: "A pessoa mudou a preferência.", variaveis: [], texto: "Certo.\n\nVou procurar com essa preferência." },
  ofereceu_horarios: { grupo: "Horários", descricao: "Lista de horários livres reais.", variaveis: ["prefixo", "modalidade", "lista"], obrigatorias: ["lista"], texto: "{prefixo}\n\nEstes horários estão livres ({modalidade}):\n\n{lista}\n\nResponda com o número da opção que prefere.\n\nSe preferir, me diga outros dias e períodos." },
  ofereceu_alternativas: { grupo: "Horários", descricao: "Nada na preferência; mostra outros horários livres.", variaveis: ["prefixo", "modalidade", "lista"], obrigatorias: ["lista"], texto: "{prefixo}\n\nNão há horário livre {modalidade} nessa preferência.\n\nMas estes outros estão livres:\n\n{lista}\n\nResponda com o número da opção que prefere.\n\nSe preferir, me diga outros dias e períodos." },
  sem_horario_encaminhada: { grupo: "Horários", descricao: "Sem nenhum horário: a equipe procura.", variaveis: ["prefixo", "modalidade"], texto: "{prefixo}\n\nNão encontrei horário livre {modalidade} com essa preferência.\n\nEncaminhei o seu pedido para a equipe, que procura uma alternativa e responde por aqui.\n\n{assinatura}" },
  escolha_ambigua: { grupo: "Horários", descricao: "Mais de uma opção combina.", variaveis: [], texto: "{nome_linha}Mais de uma opção combina com o que você disse.\n\nPode responder só com o número da opção?" },
  escolha_nao_entendida: { grupo: "Horários", descricao: "Não entendeu qual opção.", variaveis: ["lista"], obrigatorias: ["lista"], texto: "{nome_linha}Desculpe, não entendi qual opção você prefere.\n\nResponda com o número:\n\n{lista}\n\nOu me diga outros dias ou períodos, e eu procuro de novo." },
  encaminhada_sem_entendimento: { grupo: "Horários", descricao: "Três tentativas sem entender.", variaveis: [], texto: "{nome_linha}Não consegui entender a sua escolha.\n\nEncaminhei a conversa para a equipe, que responde por aqui.\n\n{assinatura}" },
  reservado: { grupo: "Resultado", descricao: "Reserva gravada de verdade.", variaveis: ["modalidade", "data", "hora", "local"], obrigatorias: ["data", "hora"], texto: "{nome_linha}Pronto, a sua consulta {modalidade} está reservada.\n\nData: {data}.\n\nHorário: {hora}.{local}\n\nA equipe da clínica acompanha esta conversa e confirma qualquer detalhe por aqui.\n\n{assinatura}" },
  limite_reservas: { grupo: "Resultado", descricao: "Limite de reservas em 24 horas.", variaveis: [], texto: "{nome_linha}Para novas reservas hoje, preciso da ajuda da equipe.\n\nEncaminhei o seu pedido, e ela responde por aqui.\n\n{assinatura}" },
  erro_reserva: { grupo: "Resultado", descricao: "Falha ao gravar a reserva.", variaveis: [], texto: "{nome_linha}Não consegui gravar essa reserva agora, então ela NÃO foi feita.\n\nEncaminhei para a equipe resolver, e ela responde por aqui.\n\n{assinatura}" },
  horario_ocupado: { grupo: "Resultado", descricao: "Alguém ocupou o horário no meio tempo.", variaveis: [], texto: "Esse horário acabou de ser ocupado por outra pessoa.\n\nNada foi reservado para você." },
  cancelar_remarcar: { grupo: "Resultado", descricao: "Cancelar ou remarcar vai para a equipe.", variaveis: [], texto: "Para cancelar ou remarcar uma consulta, vou encaminhar o seu pedido para a equipe.\n\nEla responde por aqui, assim que possível.\n\n{assinatura}" },
  pediu_pessoa: { grupo: "Resultado", descricao: "A pessoa pediu para falar com a equipe.", variaveis: [], texto: "Claro.\n\nJá avisei a equipe da clínica, e ela responde por aqui, assim que possível.\n\n{assinatura}" },
  escolha_pede_nome: { grupo: "Pedido para a equipe", descricao: "Primeira vez: escolheu horário, falta o nome.", variaveis: ["escolha"], obrigatorias: ["escolha"], texto: "{nome_linha}Combinado: {escolha}.\n\nComo você ainda não tem cadastro, preciso de alguns dados para a equipe confirmar.\n\nQual é o seu nome completo?" },
  escolha_pede_telefone: { grupo: "Pedido para a equipe", descricao: "Cliente conferido: escolheu horário, falta o telefone.", variaveis: ["escolha"], obrigatorias: ["escolha"], texto: "{nome_linha}Combinado: {escolha}.\n\nQual é o seu telefone com DDD?\n\nAssim a equipe pode falar com você, se precisar." },
  pediu_nome_de_novo: { grupo: "Pedido para a equipe", descricao: "Nome incompleto.", variaveis: [], texto: "Preciso do nome completo, com nome e sobrenome, para a equipe registrar o seu pedido.\n\nPode escrever?" },
  pediu_telefone: { grupo: "Pedido para a equipe", descricao: "Depois do nome, pede o telefone.", variaveis: [], texto: "Obrigada.\n\nQual é o seu telefone com DDD?\n\nAssim a equipe pode falar com você, se precisar." },
  pediu_telefone_de_novo: { grupo: "Pedido para a equipe", descricao: "Telefone ilegível.", variaveis: [], texto: "Não consegui ler o telefone.\n\nEscreva com DDD, por exemplo: 11 91234 5678." },
  pedido_registrado: { grupo: "Pedido para a equipe", descricao: "Pedido gravado (primeira vez). Deixa claro que NÃO está reservado.", variaveis: ["protocolo", "detalhe"], obrigatorias: ["protocolo"], texto: "{nome_linha}Anotei o seu pedido de agendamento (protocolo {protocolo}){detalhe}.\n\nAtenção: o horário ainda NÃO está reservado.\n\nA equipe vai conferir e confirmar com você por aqui.\n\nPode mandar outras dúvidas.\n\n{assinatura}" },
  pedido_registrado_cliente: { grupo: "Pedido para a equipe", descricao: "Pedido gravado (cliente com cadastro conferido). Deixa claro que NÃO está reservado.", variaveis: ["protocolo", "detalhe"], obrigatorias: ["protocolo"], texto: "{nome_linha}Anotei o seu pedido de agendamento (protocolo {protocolo}){detalhe}.\n\nSeus dados de cadastro foram conferidos.\n\nAtenção: o horário ainda NÃO está reservado.\n\nA equipe vai confirmar com você por aqui.\n\nPode mandar outras dúvidas.\n\n{assinatura}" },
} as const satisfies Record<string, DefinicaoFrase>;

/** Variáveis que valem em TODAS as frases (preenchidas pelo sistema). */
export const VARIAVEIS_GLOBAIS = ["nome_linha", "clinica", "assinatura"] as const;

export type ChaveFrase = keyof typeof FRASES_PADRAO;
export type MapaFrases = Record<ChaveFrase, string>;
export type FraseDeps = (chave: ChaveFrase, vars?: Record<string, string>) => string;

export function substituir(texto: string, vars: Record<string, string> = {}): string {
  return texto.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? vars[k] : `{${k}}`));
}

/** Monta a função de frases a partir de um mapa já carregado. Chave ausente é erro explícito. */
export function criarFrase(mapa: Partial<Record<ChaveFrase, string>>): FraseDeps {
  return (chave, vars) => {
    const t = mapa[chave];
    if (typeof t !== "string") throw new Error(`frase ausente: ${chave}`);
    return substituir(t, vars);
  };
}

/** "Carlucia,\n\n" quando o nome é conhecido; vazio quando não (frases não dependem do sexo da pessoa). */
export function linhaDoNome(nome?: string | null): string {
  const n = nome?.trim();
  return n ? `${n},\n\n` : "";
}

/** Acrescenta às frases as variáveis globais: nome da pessoa, clínica e assinatura (esta última também é uma frase cadastrada). */
export function comGlobais(base: FraseDeps, g: { clinica?: string | null; primeiroNome?: string | null }): FraseDeps {
  const clinica = g.clinica?.trim() || "nossa clínica";
  const assinatura = base("assinatura", { clinica });
  return (chave, vars) => base(chave, { clinica, nome_linha: linhaDoNome(g.primeiroNome), assinatura, ...vars });
}

export function mapaPadrao(): MapaFrases {
  return Object.fromEntries(Object.entries(FRASES_PADRAO).map(([k, v]) => [k, v.texto])) as MapaFrases;
}

/** Valida texto editado: só variáveis aceitas, obrigatórias presentes, tamanho limitado. */
export function validarTextoFrase(chave: string, texto: unknown): string | null {
  const def = (FRASES_PADRAO as Record<string, DefinicaoFrase>)[chave];
  if (!def) return "frase desconhecida";
  if (typeof texto !== "string" || texto.trim().length < 3) return "texto muito curto";
  if (texto.length > 1000) return "texto acima de 1000 caracteres";
  const usadas = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const estranha = usadas.find((u) => !def.variaveis.includes(u) && !(VARIAVEIS_GLOBAIS as readonly string[]).includes(u));
  if (estranha) return `variável {${estranha}} não existe nesta frase`;
  if (chave === "assinatura" && usadas.includes("assinatura")) return "a assinatura não pode usar {assinatura}";
  const falta = (def.obrigatorias ?? []).find((o) => !usadas.includes(o));
  if (falta) return `a variável {${falta}} é obrigatória nesta frase`;
  return null;
}

export async function semearFrases(exec: { execute: (q: SQL) => Promise<unknown> }): Promise<void> {
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS telegram_frases (
    chave TEXT PRIMARY KEY, texto TEXT NOT NULL, atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_por INTEGER)`);
  for (const [chave, def] of Object.entries(FRASES_PADRAO)) {
    await exec.execute(sql`INSERT INTO telegram_frases (chave, texto) VALUES (${chave}, ${def.texto}) ON CONFLICT (chave) DO NOTHING`);
  }
}

/** Lê do banco. Qualquer chave faltando derruba a leitura (o chamador não responde, a equipe assume). */
export async function carregarFrases(): Promise<FraseDeps> {
  const r = await db.execute(sql`SELECT chave, texto FROM telegram_frases`);
  const mapa: Partial<Record<ChaveFrase, string>> = {};
  for (const row of r.rows as Array<{ chave: string; texto: string }>) mapa[row.chave as ChaveFrase] = row.texto;
  const falta = (Object.keys(FRASES_PADRAO) as ChaveFrase[]).find((k) => typeof mapa[k] !== "string");
  if (falta) throw new Error(`frase ausente no banco: ${falta}`);
  return criarFrase(mapa);
}

export async function listarFrases(): Promise<Array<{ chave: string; grupo: string; descricao: string; variaveis: string[]; obrigatorias: string[]; texto: string; padrao: string; atualizadoEm: string | null }>> {
  const r = await db.execute(sql`SELECT chave, texto, atualizado_em FROM telegram_frases`);
  const por = new Map((r.rows as Array<{ chave: string; texto: string; atualizado_em: string | null }>).map((x) => [x.chave, x]));
  return Object.entries(FRASES_PADRAO).map(([chave, d]) => {
    const def = d as DefinicaoFrase;
    return { chave, grupo: def.grupo, descricao: def.descricao, variaveis: [...def.variaveis, ...VARIAVEIS_GLOBAIS.filter((v) => !def.variaveis.includes(v))], obrigatorias: def.obrigatorias ?? [], texto: por.get(chave)?.texto ?? def.texto, padrao: def.texto, atualizadoEm: por.get(chave)?.atualizado_em ?? null };
  });
}

export async function gravarFrase(chave: string, texto: string, porProfissional: number | null): Promise<void> {
  await db.execute(sql`INSERT INTO telegram_frases (chave, texto, atualizado_por) VALUES (${chave}, ${texto}, ${porProfissional})
    ON CONFLICT (chave) DO UPDATE SET texto=EXCLUDED.texto, atualizado_em=NOW(), atualizado_por=EXCLUDED.atualizado_por`);
}
