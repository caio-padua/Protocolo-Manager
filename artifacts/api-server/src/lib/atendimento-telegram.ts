/**
 * Atendimento por IA no Telegram — "Dúvidas e Orientações" (Etapas 7 e 8).
 *
 * Princípios (ordem do CEO):
 *  - A resposta ao paciente é SEMPRE um texto de `orientacoes_aprovadas` com status "aprovada",
 *    palavra por palavra. A IA só ESCOLHE qual orientação aprovada responde; nunca redige.
 *  - Sem orientação aprovada que sirva (ou ambiguidade) = encaminha para pessoa. Nada é inventado.
 *  - Queixa clínica nunca recebe resposta de IA: vai para pessoa com prioridade. O texto automático de
 *    orientação de emergência existe apenas como RASCUNHO e só é enviado depois de revisão do Dr. Caio.
 *  - Profissional assumiu a conversa = respostas automáticas pausadas (até alguém devolver).
 *  - Desligado por padrão. Uma resposta por mensagem recebida (nunca repete).
 */

export type ModoAtendimentoIA = "desligado" | "lista" | "ligado";

export interface ConfigAtendimentoIA {
  modo: ModoAtendimentoIA;
  permitidos: Set<number>;
  /** Dr. Caio revisou os textos de queixa clínica? Enquanto false, não sai nenhum texto automático de queixa. */
  queixaRevisada: boolean;
}

export interface OrientacaoAprovada {
  id: number;
  tema: string;
  perguntasExemplo: string;
  resposta: string;
}

export const TEXTO_ENCAMINHADO =
  "Olá! Sou a assistente virtual da clínica. Recebi sua mensagem e vou encaminhar para a equipe da clínica. Assim que um profissional puder, você recebe a resposta por aqui.";

/** Mesma mensagem, com o nome real da clínica. Sem nome, cai no texto genérico (nunca usa o nome do sistema). */
export function textoEncaminhado(nomeClinica?: string | null): string {
  const n = nomeClinica?.trim();
  return n ? TEXTO_ENCAMINHADO.replace("da clínica. Recebi", `de ${n}. Recebi`).replace("equipe da clínica", `equipe de ${n}`) : TEXTO_ENCAMINHADO;
}

/**
 * RASCUNHOS para revisão clínica do Dr. Caio. Não são enviados enquanto `queixaRevisada` for false.
 * Nenhum deles diagnostica, ajusta dose ou diz que um sintoma é normal.
 */
export const TEXTOS_QUEIXA_PARA_REVISAO = {
  emergencia:
    "Sua mensagem pode indicar uma situação urgente. Procure agora o pronto-socorro mais próximo ou ligue 192 (SAMU). Não espere a resposta da clínica. Sua mensagem fica registrada para a equipe.",
  queixa:
    "Sinto muito que você não esteja bem. Sua mensagem fica registrada para a equipe. Se piorar ou surgir falta de ar, dor no peito, desmaio ou inchaço no rosto, procure o pronto-socorro ou ligue 192 (SAMU).",
} as const;

// ─────────────────────────── texto ───────────────────────────

export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const EMERGENCIA = [
  /falta de ar/, /nao consigo respirar/, /dor no peito/, /aperto no peito/, /desmai/, /convuls/,
  /inchac\w* (no|na|do|da) (rosto|garganta|lingua|labio|boca)/, /sangramento (forte|intenso)/, /reacao alergica/,
  /perdi os sentidos/, /muito mal/,
];
const QUEIXA = [
  /mal[- ]?estar/, /passei mal/, /me sinto mal/, /estou mal/, /enjoo/, /nausea/, /vomit/, /tontura/, /\bdor\b/, /dores/,
  /palpitac/, /coracao/, /coceira/, /vermelhid/, /manchas?/, /inchac/, /inchad/, /febre/, /reacao/, /tremor/, /formigamento/,
  /pressao/, /sangramento/, /diarreia/, /dor de cabeca/, /\bpiorei\b/, /efeito colateral/, /nao estou bem/,
];

export function classificarQueixa(texto: string): "emergencia" | "queixa" | null {
  const n = normalizar(texto);
  if (EMERGENCIA.some((r) => r.test(n))) return "emergencia";
  if (QUEIXA.some((r) => r.test(n))) return "queixa";
  return null;
}

const STOP = new Set(["para", "como", "qual", "quais", "quando", "onde", "porque", "pelo", "pela", "uma", "uns", "umas", "isso", "esse", "essa", "este", "esta", "meu", "minha", "tenho", "estou", "fazer", "posso", "preciso", "gostaria", "saber", "sobre", "voce", "voces", "nao", "mais", "muito", "tem", "ser", "que", "com", "dos", "das", "por", "ola", "bom", "dia", "tarde", "noite"]);

function tokens(t: string): Set<string> {
  return new Set(normalizar(t).split(" ").filter((w) => w.length >= 4 && !STOP.has(w)));
}

export interface Candidata { orientacao: OrientacaoAprovada; pontos: number; }

/** Candidatas por sobreposição de palavras (tema + perguntas de exemplo). Maior pontuação primeiro. */
export function candidatas(texto: string, orientacoes: OrientacaoAprovada[], max = 5): Candidata[] {
  const msg = tokens(texto);
  if (msg.size === 0) return [];
  return orientacoes
    .map((o) => {
      const alvo = tokens(`${o.tema} ${o.perguntasExemplo}`);
      let pontos = 0;
      for (const w of msg) if (alvo.has(w)) pontos++;
      return { orientacao: o, pontos };
    })
    .filter((c) => c.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.orientacao.id - b.orientacao.id)
    .slice(0, max);
}

/** Escolha determinística (sem IA): só quando é forte (>= 2 palavras) e o 1º lugar é único. */
export function escolhaDeterministica(c: Candidata[]): OrientacaoAprovada | null {
  if (c.length === 0) return null;
  if (c[0].pontos < 2) return null;
  if (c[1] && c[1].pontos === c[0].pontos) return null;
  return c[0].orientacao;
}

// ─────────────────────────── orquestração ───────────────────────────

export type Desfecho =
  | "desligado" | "fora_da_lista" | "pausado_humano" | "ja_tratado"
  | "orientacao_enviada" | "encaminhado_humano" | "queixa_encaminhada" | "queixa_texto_enviado" | "falha_envio" | "falha_alerta" | "agendamento_conduzido";

export interface DepsAtendimento {
  lerConfig: () => Promise<ConfigAtendimentoIA>;
  modoDoCliente: (clienteId: number) => Promise<"ia" | "humano">;
  /** Reivindica a mensagem (uma resposta por mensagem). false = já tratada antes. */
  reivindicar: (inboxMessageId: number) => Promise<boolean>;
  carregarOrientacoes: (empresaId: number) => Promise<OrientacaoAprovada[]>;
  /** IA escolhe um id entre as candidatas (ou null). Pode lançar: então vale a regra determinística. */
  escolherComIA?: (texto: string, c: Candidata[]) => Promise<number | null>;
  enviarAoPaciente: (chatId: string, texto: string) => Promise<boolean>;
  registrarSaida: (p: { empresaId: number; clienteId: number; chatId: string; texto: string }) => Promise<void>;
  passarParaHumano: (clienteId: number, motivo: string) => Promise<void>;
  alertarEquipe: (texto: string) => Promise<boolean>;
  /** Nome real da clínica (empresa). Opcional: ausente = texto genérico. */
  nomeClinica?: (empresaId: number) => Promise<string | null>;
  registrarDesfecho: (inboxMessageId: number, d: Desfecho, orientacaoId: number | null) => Promise<void>;
}

export interface EntradaAtendimento {
  inboxMessageId: number;
  empresaId: number;
  clienteId: number;
  clienteNome: string;
  chatId: string;
  texto: string;
}

export async function processarAtendimento(deps: DepsAtendimento, e: EntradaAtendimento): Promise<Desfecho> {
  const cfg = await deps.lerConfig();
  if (cfg.modo === "desligado") return "desligado";
  if (cfg.modo === "lista" && !cfg.permitidos.has(e.clienteId)) return "fora_da_lista";

  if ((await deps.modoDoCliente(e.clienteId)) === "humano") {
    if (await deps.reivindicar(e.inboxMessageId)) await deps.registrarDesfecho(e.inboxMessageId, "pausado_humano", null);
    return "pausado_humano";
  }
  if (!(await deps.reivindicar(e.inboxMessageId))) return "ja_tratado";

  const fechar = async (d: Desfecho, orientacaoId: number | null = null): Promise<Desfecho> => {
    await deps.registrarDesfecho(e.inboxMessageId, d, orientacaoId);
    return d;
  };

  // Etapa 8: queixa clínica vence tudo. Nunca resposta de IA; pessoa assume com prioridade.
  const queixa = classificarQueixa(e.texto);
  if (queixa) {
    await deps.passarParaHumano(e.clienteId, queixa === "emergencia" ? "possivel_emergencia" : "queixa_clinica");
    const alertou = await deps.alertarEquipe(
      `${queixa === "emergencia" ? "URGENTE" : "PRIORIDADE"} — atendimento #${e.inboxMessageId}, cliente #${e.clienteId}. Abra a conversa no Cockpit protegido.`,
    );
    if (!alertou) return fechar("falha_alerta");
    if (cfg.queixaRevisada) {
      const ok = await deps.enviarAoPaciente(e.chatId, TEXTOS_QUEIXA_PARA_REVISAO[queixa]);
      if (ok) {
        await deps.registrarSaida({ empresaId: e.empresaId, clienteId: e.clienteId, chatId: e.chatId, texto: TEXTOS_QUEIXA_PARA_REVISAO[queixa] });
        return fechar("queixa_texto_enviado");
      }
      return fechar("falha_envio");
    }
    return fechar("queixa_encaminhada");
  }

  const orientacoes = await deps.carregarOrientacoes(e.empresaId);
  const cand = candidatas(e.texto, orientacoes);
  let escolhida: OrientacaoAprovada | null = null;
  if (cand.length > 0) {
    if (deps.escolherComIA) {
      try {
        const id = await deps.escolherComIA(e.texto, cand);
        escolhida = id == null ? null : (cand.find((c) => c.orientacao.id === id)?.orientacao ?? null); // id fora da lista = ignorado
      } catch {
        escolhida = escolhaDeterministica(cand);
      }
    } else {
      escolhida = escolhaDeterministica(cand);
    }
  }

  if (escolhida) {
    const ok = await deps.enviarAoPaciente(e.chatId, escolhida.resposta);
    if (!ok) return fechar("falha_envio", escolhida.id);
    await deps.registrarSaida({ empresaId: e.empresaId, clienteId: e.clienteId, chatId: e.chatId, texto: escolhida.resposta });
    return fechar("orientacao_enviada", escolhida.id);
  }

  // Sem orientação aprovada que sirva: encaminha para pessoa (nada inventado) e pausa a IA nesta conversa.
  await deps.passarParaHumano(e.clienteId, "sem_orientacao_aprovada");
  if (!await deps.alertarEquipe(`Atendimento #${e.inboxMessageId}, cliente #${e.clienteId}, requer equipe. Abra a conversa no Cockpit protegido.`)) return fechar("falha_alerta");
  const textoEnc = textoEncaminhado(deps.nomeClinica ? await deps.nomeClinica(e.empresaId).catch(() => null) : null);
  const ok = await deps.enviarAoPaciente(e.chatId, textoEnc);
  if (ok) await deps.registrarSaida({ empresaId: e.empresaId, clienteId: e.clienteId, chatId: e.chatId, texto: textoEnc });
  return fechar(ok ? "encaminhado_humano" : "falha_envio");
}

export interface PlanoAtendimento {
  pausa: string | null;
  alerta: string | null;
  resposta: string | null;
  orientacaoId: number | null;
  desfecho: Desfecho;
}

/** Usa a MESMA decisão sem executar efeitos. O worker persiste este plano antes da rede. */
export async function planejarAtendimento(deps: DepsAtendimento, e: EntradaAtendimento): Promise<PlanoAtendimento> {
  const plano: PlanoAtendimento = { pausa: null, alerta: null, resposta: null, orientacaoId: null, desfecho: "desligado" };
  plano.desfecho = await processarAtendimento({
    ...deps,
    reivindicar: async () => true,
    passarParaHumano: async (_cid, motivo) => { plano.pausa = motivo; },
    alertarEquipe: async texto => { plano.alerta = texto; return true; },
    enviarAoPaciente: async (_chat, texto) => { plano.resposta = texto; return true; },
    registrarSaida: async () => {},
    registrarDesfecho: async (_id, _d, orientacaoId) => { plano.orientacaoId = orientacaoId; },
  }, e);
  return plano;
}
