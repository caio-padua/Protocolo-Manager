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
  apresentacao: { grupo: "Abertura", descricao: "Primeira frase da conversa, com o nome da clínica.", variaveis: ["clinica"], obrigatorias: ["clinica"], texto: "Olá! Sou a assistente virtual de {clinica}." },
  apresentacao_sem_clinica: { grupo: "Abertura", descricao: "Primeira frase quando a clínica não tem nome cadastrado.", variaveis: [], texto: "Olá! Sou a assistente virtual da clínica." },
  visitante_encaminhado: { grupo: "Abertura", descricao: "Quem não é cliente escreveu algo que não é pedido de consulta.", variaveis: [], texto: "Posso ajudar a marcar uma consulta ou encaminhar sua dúvida para a equipe. Já avisei a equipe sobre a sua mensagem. Se quiser marcar agora, escreva: quero marcar uma consulta." },
  queixa_visitante: { grupo: "Abertura", descricao: "Resposta a queixa de saúde de quem não é cliente. Nunca opina sobre saúde.", variaveis: ["apresentacao"], texto: "{apresentacao} Recebi sua mensagem e já avisei a equipe, que responde por aqui. Se for algo urgente, procure o pronto-socorro ou ligue 192 (SAMU)." },

  pergunta_ja_paciente: { grupo: "Quem é a pessoa", descricao: "Primeira pergunta para quem não está vinculado: já é cliente ou é a primeira vez.", variaveis: [], texto: "Para começar: você já é cliente da clínica ou será sua primeira consulta? Responda \"já sou cliente\" ou \"primeira vez\"." },
  vinculo_nao_entendido: { grupo: "Quem é a pessoa", descricao: "Não deu para entender se já é cliente.", variaveis: [], texto: "Não entendi. Responda \"já sou cliente\" ou \"primeira vez\", por favor." },
  pedir_identidade: { grupo: "Quem é a pessoa", descricao: "Pede os dados para conferir o cadastro de quem diz já ser cliente.", variaveis: [], texto: "Para confirmar seu cadastro, escreva numa só mensagem: seu nome completo, os 4 primeiros números do seu CPF e o ano em que você nasceu. Exemplo: Maria Souza 1234 1985." },
  identidade_formato: { grupo: "Quem é a pessoa", descricao: "A mensagem de confirmação veio incompleta.", variaveis: [], texto: "Não consegui ler os dados. Escreva o nome completo, os 4 primeiros números do CPF e o ano de nascimento, nessa ordem. Exemplo: Maria Souza 1234 1985." },
  identidade_nao_confirmada: { grupo: "Quem é a pessoa", descricao: "Os dados não bateram. Não diz qual dado errou.", variaveis: [], texto: "Não consegui confirmar seus dados com o cadastro. Confira e envie de novo: nome completo, 4 primeiros números do CPF e ano de nascimento." },
  identidade_encaminhada: { grupo: "Quem é a pessoa", descricao: "Falhou mais de uma vez: a equipe assume.", variaveis: [], texto: "Não consegui confirmar seu cadastro por aqui. Encaminhei sua conversa para a equipe, que responde por aqui." },
  identidade_confirmada: { grupo: "Quem é a pessoa", descricao: "Cadastro conferido; segue para a modalidade.", variaveis: ["nome1", "pergunta_modalidade"], texto: "Cadastro conferido{nome1}. {pergunta_modalidade}" },

  pergunta_modalidade: { grupo: "Perguntas do agendamento", descricao: "Online ou presencial.", variaveis: [], texto: "A consulta seria online ou presencial?" },
  pergunta_preferencias: { grupo: "Perguntas do agendamento", descricao: "Dias e período preferidos.", variaveis: [], texto: "Quais dias da semana e qual período (manhã, tarde ou noite) ficam melhores para você?" },
  pergunta_periodo: { grupo: "Perguntas do agendamento", descricao: "Só falta o período.", variaveis: [], texto: "Qual período prefere: manhã, tarde ou noite? Se tanto faz, é só dizer." },
  vamos_marcar: { grupo: "Perguntas do agendamento", descricao: "Início do agendamento de quem já é cliente vinculado.", variaveis: ["nome1", "pergunta_modalidade"], texto: "Vamos marcar sua consulta{nome1}. {pergunta_modalidade}" },
  certo_modalidade: { grupo: "Perguntas do agendamento", descricao: "Confirma a modalidade e pergunta o que falta.", variaveis: ["modalidade", "pergunta"], obrigatorias: ["pergunta"], texto: "Certo, {modalidade}. {pergunta}" },
  recomecar: { grupo: "Perguntas do agendamento", descricao: "A pessoa pediu para recomeçar.", variaveis: ["nome1", "pergunta_modalidade"], texto: "Tudo bem, vamos recomeçar{nome1}. {pergunta_modalidade}" },

  olhando_agenda: { grupo: "Horários", descricao: "Antes de mostrar os horários.", variaveis: [], texto: "Deixa eu ver a agenda." },
  procurando_outras: { grupo: "Horários", descricao: "A pessoa recusou as opções.", variaveis: [], texto: "Sem problema, procurei outras opções." },
  procurando_preferencia: { grupo: "Horários", descricao: "A pessoa mudou a preferência.", variaveis: [], texto: "Certo, vou procurar com essa preferência." },
  ofereceu_horarios: { grupo: "Horários", descricao: "Lista de horários livres reais.", variaveis: ["prefixo", "modalidade", "lista"], obrigatorias: ["lista"], texto: "{prefixo} Estes horários estão livres ({modalidade}):\n{lista}\nResponda com o número da opção que prefere, ou diga outros dias e períodos." },
  ofereceu_alternativas: { grupo: "Horários", descricao: "Nada na preferência; mostra outros horários livres.", variaveis: ["prefixo", "modalidade", "lista"], obrigatorias: ["lista"], texto: "{prefixo} Não há horário livre {modalidade} nessa preferência, mas estes outros estão livres:\n{lista}\nResponda com o número da opção que prefere, ou diga outros dias e períodos." },
  sem_horario_encaminhada: { grupo: "Horários", descricao: "Sem nenhum horário: a equipe procura.", variaveis: ["prefixo", "modalidade"], texto: "{prefixo} Não encontrei horário livre {modalidade} com essa preferência. Encaminhei seu pedido para a equipe, que procura uma alternativa e responde por aqui." },
  escolha_ambigua: { grupo: "Horários", descricao: "Mais de uma opção combina.", variaveis: [], texto: "Mais de uma opção combina com o que você disse. Responda só com o número da opção, por favor." },
  escolha_nao_entendida: { grupo: "Horários", descricao: "Não entendeu qual opção.", variaveis: ["lista"], obrigatorias: ["lista"], texto: "Não entendi qual opção você prefere. Responda com o número:\n{lista}\nOu diga outros dias ou períodos que eu procuro de novo." },
  encaminhada_sem_entendimento: { grupo: "Horários", descricao: "Três tentativas sem entender.", variaveis: [], texto: "Não consegui entender sua escolha. Encaminhei a conversa para a equipe, que responde por aqui." },

  reservado: { grupo: "Resultado", descricao: "Reserva gravada de verdade (só cliente vinculado).", variaveis: ["nome1", "modalidade", "data", "hora", "local"], obrigatorias: ["data", "hora"], texto: "Pronto{nome1}! Sua consulta {modalidade} está reservada para {data}, às {hora}.{local} A equipe da clínica acompanha esta conversa e confirma qualquer detalhe por aqui." },
  limite_reservas: { grupo: "Resultado", descricao: "Limite de reservas em 24 horas.", variaveis: [], texto: "Para novas reservas hoje preciso da ajuda da equipe. Encaminhei seu pedido e ela responde por aqui." },
  erro_reserva: { grupo: "Resultado", descricao: "Falha ao gravar a reserva.", variaveis: [], texto: "Não consegui gravar essa reserva agora, então ela NÃO foi feita. Encaminhei para a equipe resolver, e ela responde por aqui." },
  horario_ocupado: { grupo: "Resultado", descricao: "Alguém ocupou o horário no meio tempo.", variaveis: [], texto: "Esse horário acabou de ser ocupado por outra pessoa, e nada foi reservado para você." },
  cancelar_remarcar: { grupo: "Resultado", descricao: "Cancelar ou remarcar vai para a equipe.", variaveis: ["nome1"], texto: "Para cancelar ou remarcar uma consulta já marcada, vou encaminhar seu pedido para a equipe{nome1}. Ela responde por aqui assim que possível." },
  pediu_pessoa: { grupo: "Resultado", descricao: "A pessoa pediu para falar com a equipe.", variaveis: ["nome1"], texto: "Claro{nome1}. Já avisei a equipe da clínica e ela responde por aqui assim que possível." },

  escolha_pede_nome: { grupo: "Pedido para a equipe", descricao: "Primeira vez: escolheu horário, falta o nome.", variaveis: ["escolha"], obrigatorias: ["escolha"], texto: "Combinado: {escolha}. Como você ainda não tem cadastro, preciso de alguns dados para a equipe confirmar. Qual é o seu nome completo?" },
  escolha_pede_telefone: { grupo: "Pedido para a equipe", descricao: "Cliente conferido: escolheu horário, falta o telefone.", variaveis: ["escolha"], obrigatorias: ["escolha"], texto: "Combinado: {escolha}. Qual é o seu telefone com DDD, para a equipe poder falar com você se precisar?" },
  pediu_nome_de_novo: { grupo: "Pedido para a equipe", descricao: "Nome incompleto.", variaveis: [], texto: "Preciso do nome completo (nome e sobrenome) para a equipe registrar seu pedido. Pode escrever?" },
  pediu_telefone: { grupo: "Pedido para a equipe", descricao: "Depois do nome, pede o telefone.", variaveis: [], texto: "Obrigada. Qual é o seu telefone com DDD, para a equipe poder falar com você se precisar?" },
  pediu_telefone_de_novo: { grupo: "Pedido para a equipe", descricao: "Telefone ilegível.", variaveis: [], texto: "Não consegui ler o telefone. Escreva com DDD, por exemplo 11 91234 5678." },
  pedido_registrado: { grupo: "Pedido para a equipe", descricao: "Pedido gravado (primeira vez). Deixa claro que NÃO está reservado.", variaveis: ["protocolo", "detalhe"], obrigatorias: ["protocolo"], texto: "Anotei seu pedido de agendamento (protocolo {protocolo}){detalhe}. Atenção: o horário ainda NÃO está reservado. A equipe vai conferir e confirmar com você por aqui. Pode mandar outras dúvidas." },
  pedido_registrado_cliente: { grupo: "Pedido para a equipe", descricao: "Pedido gravado (cliente com cadastro conferido). Deixa claro que NÃO está reservado.", variaveis: ["protocolo", "detalhe"], obrigatorias: ["protocolo"], texto: "Anotei seu pedido de agendamento (protocolo {protocolo}){detalhe}. Seus dados de cadastro foram conferidos. Atenção: o horário ainda NÃO está reservado. A equipe vai confirmar com você por aqui. Pode mandar outras dúvidas." },
} as const satisfies Record<string, DefinicaoFrase>;

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
  const estranha = usadas.find((u) => !def.variaveis.includes(u));
  if (estranha) return `variável {${estranha}} não existe nesta frase`;
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
    return { chave, grupo: def.grupo, descricao: def.descricao, variaveis: def.variaveis, obrigatorias: def.obrigatorias ?? [], texto: por.get(chave)?.texto ?? def.texto, padrao: def.texto, atualizadoEm: por.get(chave)?.atualizado_em ?? null };
  });
}

export async function gravarFrase(chave: string, texto: string, porProfissional: number | null): Promise<void> {
  await db.execute(sql`INSERT INTO telegram_frases (chave, texto, atualizado_por) VALUES (${chave}, ${texto}, ${porProfissional})
    ON CONFLICT (chave) DO UPDATE SET texto=EXCLUDED.texto, atualizado_em=NOW(), atualizado_por=EXCLUDED.atualizado_por`);
}
