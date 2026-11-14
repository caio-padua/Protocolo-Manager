/**
 * Assistente virtual de agendamento no Telegram (regra de decisão pura, sem banco nem rede).
 *
 * Princípios (ordem do Dr. Caio):
 *  - Apresenta-se como "assistente virtual da clínica". Não inventa nome.
 *  - Pergunta se a consulta é online ou presencial e quais dias e períodos a pessoa prefere.
 *  - Só oferece horário que o motor de agenda devolveu como livre (buscarHorarios).
 *  - Só diz "reservado" depois que `reservar` confirmou a gravação. Quem ainda não é cliente NUNCA recebe reserva:
 *    vira um pedido que a equipe confirma, e o texto diz isso com todas as letras.
 *  - O que o sistema não consegue confirmar vai para a equipe. Queixa de saúde nunca é tratada aqui.
 */
import { classificarQueixa, normalizar } from "./atendimento-telegram";

export type Modalidade = "online" | "presencial";
export type Periodo = "manha" | "tarde" | "noite" | "qualquer";

export interface Oferta {
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm
  recursoId: number;
  modalidade: Modalidade;
}

export type Etapa = "inicio" | "modalidade" | "preferencias" | "escolha" | "nome" | "telefone" | "concluido";

export interface EstadoConversa {
  etapa: Etapa;
  apresentada: boolean;
  modalidade?: Modalidade;
  /** dias da semana 0..6 aceitos; null = qualquer dia */
  dias?: number[] | null;
  /** datas específicas (hoje, amanhã, dd/mm) */
  datas?: string[] | null;
  periodo?: Periodo;
  ofertas?: Oferta[];
  mostradas?: string[];
  escolhida?: Oferta;
  nome?: string;
  tentativas: number;
  atualizadoEm: string;
}

export const ESTADO_INICIAL = (agoraISO: string): EstadoConversa => ({ etapa: "inicio", apresentada: false, tentativas: 0, atualizadoEm: agoraISO });

export interface DepsAgendamento {
  hojeISO: () => string;
  buscarHorarios: (p: {
    modalidade: Modalidade; dias: number[] | null; datas: string[] | null; periodo: Periodo; excluir: string[]; max: number;
  }) => Promise<{ ofertas: Oferta[]; semAgenda: boolean }>;
  /** Só para cliente cadastrado. Grava de verdade e devolve o id da sessão. */
  reservar: (o: Oferta) => Promise<{ ok: true; sessionId: number } | { ok: false; motivo: "indisponivel" | "limite" | "erro" }>;
  /** Só para quem não é cliente: grava o pedido para a equipe confirmar. */
  registrarPedido: (p: { nome: string; telefone: string; estado: EstadoConversa; oferta: Oferta | null }) => Promise<number>;
  /** Pausa a assistente nesta conversa e avisa a equipe. */
  encaminharEquipe: (motivo: string) => Promise<void>;
  endereco: (modalidade: Modalidade) => Promise<string | null>;
}

export interface ContextoAgendamento {
  ehCliente: boolean;
  /** Primeiro nome já cadastrado (cliente). */
  primeiroNome?: string;
  /** Nome real da clínica (empresa) em que a conversa acontece. Ausente = "da clínica", sem inventar nome. */
  nomeClinica?: string;
}

export interface ResultadoAgendamento {
  tratada: boolean;
  estado: EstadoConversa;
  resposta: string | null;
  desfecho: string;
}

const DIAS_NOME = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const VALIDADE_MS = 6 * 60 * 60 * 1000;

// ─────────────────────────── interpretação do texto ───────────────────────────

const PALAVRAS_AGENDAR = /\b(marc\w*|agend\w*|consulta|horario|horarios|disponibilidade|vaga|vagas|atendimento|reserv\w*|encaixe)\b/;
const PALAVRAS_EQUIPE = /\b(atendente|humano|pessoa|secretaria|equipe)\b/;
const PALAVRAS_CANCELAR = /\b(cancel\w*|desmarc\w*|remarc\w*|reagend\w*|trocar o horario|mudar o horario)\b/;
const PALAVRAS_REINICIAR = /\b(recomec\w*|reiniciar|comecar de novo|esquece|esquecer)\b/;

export function ehPedidoDeAgendamento(texto: string): boolean {
  return PALAVRAS_AGENDAR.test(normalizar(texto));
}

export function lerModalidade(texto: string): Modalidade | null {
  const n = normalizar(texto);
  const online = /\b(online|on line|video|videochamada|remot\w*|a distancia)\b/.test(n);
  const presencial = /\b(presencial|presencialmente|pessoalmente|consultorio|sede|na clinica|no consultorio)\b/.test(n);
  if (online && !presencial) return "online";
  if (presencial && !online) return "presencial";
  return null;
}

export function lerPeriodo(texto: string): Periodo | null {
  const n = normalizar(texto);
  const m = /\b(manha|cedo)\b/.test(n);
  const t = /\b(tarde|depois do almoco)\b/.test(n);
  const no = /\b(noite|noturno|fim do dia|final do dia)\b/.test(n);
  const qualquer = /(tanto faz|qualquer horario|qualquer periodo|qualquer turno|qualquer hora|indiferente|sem preferencia)/.test(n);
  const n3 = [m, t, no].filter(Boolean).length;
  if (n3 > 1 || (qualquer && n3 === 0)) return "qualquer";
  if (m) return "manha";
  if (t) return "tarde";
  if (no) return "noite";
  return null;
}

const MAPA_DIAS: Array<[RegExp, number]> = [
  [/\bdomingo\b/, 0], [/\bsegunda\b/, 1], [/\bterca\b/, 2], [/\bquarta\b/, 3],
  [/\bquinta\b/, 4], [/\bsexta\b/, 5], [/\bsabado\b/, 6],
];

function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dias da semana e datas específicas. `dias` null = qualquer dia; undefined = não informou. */
export function lerDias(texto: string, hojeISO: string): { dias?: number[] | null; datas?: string[] } {
  const n = normalizar(texto);
  const datas: string[] = [];
  if (/\bhoje\b/.test(n)) datas.push(hojeISO);
  if (/\bdepois de amanha\b/.test(n)) datas.push(somarDias(hojeISO, 2));
  else if (/\bamanha\b/.test(n)) datas.push(somarDias(hojeISO, 1));
  for (const m of texto.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const dia = Number(m[1]); const mes = Number(m[2]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) continue;
    let ano = Number(hojeISO.slice(0, 4));
    if (m[3]) ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const montar = (a: number) => `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    let iso = montar(ano);
    if (!m[3] && iso < hojeISO) iso = montar(ano + 1);
    if (new Date(`${iso}T12:00:00Z`).getUTCDate() === dia) datas.push(iso);
  }
  if (datas.length > 0) return { datas: [...new Set(datas)].slice(0, 3) };
  if (/(tanto faz|qualquer dia|qualquer data|sem preferencia|indiferente|todos os dias)/.test(n)) return { dias: null };
  if (/(dias de semana|durante a semana|dia util|dias uteis)/.test(n)) return { dias: [1, 2, 3, 4, 5] };
  if (/(fim de semana|final de semana)/.test(n)) return { dias: [6, 0] };
  const faixa = /\b(segunda|terca|quarta|quinta|sexta|sabado)\s+(?:a|ate)\s+(segunda|terca|quarta|quinta|sexta|sabado)\b/.exec(n);
  if (faixa) {
    const ini = MAPA_DIAS.find(([r]) => r.test(faixa[1]))![1];
    const fim = MAPA_DIAS.find(([r]) => r.test(faixa[2]))![1];
    const lista: number[] = [];
    for (let d = ini; ; d = (d + 1) % 7) { lista.push(d); if (d === fim || lista.length > 7) break; }
    return { dias: lista };
  }
  const achados = MAPA_DIAS.filter(([r]) => r.test(n)).map(([, d]) => d);
  if (achados.length > 0) return { dias: achados };
  return {};
}

function lerNome(texto: string): string | null {
  const limpo = texto.replace(/^(meu nome (e|é)|me chamo|aqui (e|é))\s+/i, "").trim();
  if (limpo.length < 3 || limpo.length > 80) return null;
  if (!/^[\p{L}][\p{L}'’.\- ]+$/u.test(limpo)) return null;
  if (limpo.split(/\s+/).length < 2) return null;
  return limpo.replace(/\s+/g, " ");
}

function lerTelefone(texto: string): string | null {
  let d = texto.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  return null;
}

const ORDINAIS: Array<[RegExp, number]> = [[/\b(primeir[ao])\b/, 0], [/\b(segund[ao])\b/, 1], [/\b(terceir[ao])\b/, 2], [/\b(quart[ao])\b/, 3]];

function lerEscolha(texto: string, ofertas: Oferta[]): { indice: number | null; recusou: boolean; ambiguo: boolean } {
  const n = normalizar(texto);
  const livre = { recusou: false, ambiguo: false };
  if (/\b(nenhum|nenhuma|outro|outra|outros|outras|mais tarde|mais cedo|nao serve|nao posso|nao consigo)\b/.test(n)) {
    return { indice: null, recusou: true, ambiguo: false };
  }
  const solto = /^\s*(\d)\s*[.)]?\s*$/.exec(texto);
  const op = /\b(?:opcao|numero|alternativa)\s*(\d)\b/.exec(n);
  const num = solto ?? op;
  if (num) {
    const i = Number(num[1]) - 1;
    return { indice: i >= 0 && i < ofertas.length ? i : null, ...livre };
  }
  for (const [r, i] of ORDINAIS) if (r.test(n) && i < ofertas.length) return { indice: i, ...livre };
  let candidatos = ofertas.map((_, i) => i);
  let filtrou = false;
  const dataCurta = /\b(\d{1,2})\/(\d{1,2})\b/.exec(texto);
  if (dataCurta) {
    const sufixo = `-${String(Number(dataCurta[2])).padStart(2, "0")}-${String(Number(dataCurta[1])).padStart(2, "0")}`;
    candidatos = candidatos.filter((i) => ofertas[i].data.endsWith(sufixo));
    filtrou = true;
  } else {
    const dias = lerDias(texto, "2000-01-03").dias;
    if (dias && dias.length) {
      candidatos = candidatos.filter((i) => dias.includes(new Date(`${ofertas[i].data}T12:00:00Z`).getUTCDay()));
      filtrou = true;
    }
  }
  const hora = /\b(\d{1,2})\s*(?:[:h]\s*(\d{2})?)\s*(?:h|horas)?\b/.exec(n);
  if (hora) {
    const hh = String(Number(hora[1])).padStart(2, "0");
    const mm = hora[2] ?? "00";
    candidatos = candidatos.filter((i) => ofertas[i].hora === `${hh}:${mm}`);
    filtrou = true;
  }
  if (!filtrou) return { indice: null, ...livre };
  if (candidatos.length === 1) return { indice: candidatos[0], ...livre };
  if (candidatos.length > 1) return { indice: null, recusou: false, ambiguo: true };
  return { indice: null, ...livre };
}

// ─────────────────────────── textos ───────────────────────────

export function dataPorExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DIAS_NOME[d.getUTCDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function listaOfertas(ofertas: Oferta[]): string {
  return ofertas.map((o, i) => `${i + 1}) ${dataPorExtenso(o.data)}, às ${o.hora}`).join("\n");
}

const rotulo = (m: Modalidade) => (m === "online" ? "online" : "presencial");
const chaveOferta = (o: Oferta) => `${o.recursoId}|${o.data}|${o.hora}`;

/** A assistente se apresenta como virtual e com o nome da CLÍNICA (nunca o nome do sistema, nunca nome inventado). */
export function apresentacao(nomeClinica?: string): string {
  const n = nomeClinica?.trim();
  return n ? `Olá! Sou a assistente virtual de ${n}.` : "Olá! Sou a assistente virtual da clínica.";
}
const PERGUNTA_MODALIDADE = "A consulta seria online ou presencial?";
const PERGUNTA_PREFERENCIAS = "Quais dias da semana e qual período (manhã, tarde ou noite) ficam melhores para você?";

function perguntaFaltante(estado: EstadoConversa): string {
  if (estado.dias === undefined && !estado.datas) return PERGUNTA_PREFERENCIAS;
  return "Qual período prefere: manhã, tarde ou noite? Se tanto faz, é só dizer.";
}

function comApresentacao(estado: EstadoConversa, nomeClinica: string | undefined, corpo: string): string {
  if (estado.apresentada) return corpo;
  estado.apresentada = true;
  return `${apresentacao(nomeClinica)} ${corpo}`;
}

// ─────────────────────────── orquestração ───────────────────────────

export async function conduzirAgendamento(
  anterior: EstadoConversa | null, texto: string, ctx: ContextoAgendamento, deps: DepsAgendamento, agoraISO: string,
): Promise<ResultadoAgendamento> {
  const valido = anterior && Date.now() - Date.parse(anterior.atualizadoEm) < VALIDADE_MS && anterior.etapa !== "concluido";
  const estado: EstadoConversa = valido ? structuredClone(anterior) : ESTADO_INICIAL(agoraISO);
  if (anterior && !valido) estado.apresentada = anterior.apresentada;
  estado.atualizadoEm = agoraISO;
  const emAndamento = estado.etapa !== "inicio";
  const n = normalizar(texto);
  const nome1 = ctx.primeiroNome ? `, ${ctx.primeiroNome}` : "";
  const fim = (resposta: string | null, desfecho: string, tratada = true): ResultadoAgendamento => ({ tratada, estado, resposta, desfecho });

  // Queixa de saúde nunca é tratada aqui: segue para a equipe.
  if (classificarQueixa(texto)) return fim(null, "queixa_nao_tratada", false);

  if (emAndamento && PALAVRAS_REINICIAR.test(n)) {
    const novo = ESTADO_INICIAL(agoraISO);
    novo.apresentada = true; novo.etapa = "modalidade";
    return { tratada: true, estado: novo, resposta: `Tudo bem, vamos recomeçar${nome1}. ${PERGUNTA_MODALIDADE}`, desfecho: "reiniciada" };
  }
  if (PALAVRAS_CANCELAR.test(n)) {
    await deps.encaminharEquipe("cancelar_ou_remarcar");
    return fim(comApresentacao(estado, ctx.nomeClinica, `Para cancelar ou remarcar uma consulta já marcada, vou encaminhar seu pedido para a equipe${nome1}. Ela responde por aqui assim que possível.`), "encaminhada_cancelar_remarcar");
  }
  if (PALAVRAS_EQUIPE.test(n) && !emAndamento) {
    await deps.encaminharEquipe("pediu_pessoa");
    return fim(comApresentacao(estado, ctx.nomeClinica, `Claro${nome1}. Já avisei a equipe da clínica e ela responde por aqui assim que possível.`), "encaminhada_pediu_pessoa");
  }

  // Sem conversa em andamento: cliente só entra se pediu agendamento; visitante recebe orientação e a equipe é avisada.
  if (!emAndamento && !ehPedidoDeAgendamento(texto)) {
    if (ctx.ehCliente) return fim(null, "fora_do_assunto", false);
    await deps.encaminharEquipe("duvida_de_visitante");
    return fim(comApresentacao(estado, ctx.nomeClinica, "Posso ajudar a marcar uma consulta ou encaminhar sua dúvida para a equipe. Já avisei a equipe sobre a sua mensagem. Se quiser marcar agora, me diga: a consulta seria online ou presencial?"), "visitante_encaminhado");
  }

  // ── dados de quem ainda não é cliente (não reinterpreta o texto como preferência) ──
  if (estado.etapa === "nome") {
    const nome = lerNome(texto);
    if (!nome) { estado.tentativas++; return fim("Preciso do nome completo (nome e sobrenome) para a equipe registrar seu pedido. Pode escrever?", "pediu_nome_de_novo"); }
    estado.nome = nome; estado.etapa = "telefone";
    return fim("Obrigada. Qual é o seu telefone com DDD, para a equipe poder falar com você se precisar?", "pediu_telefone");
  }
  if (estado.etapa === "telefone") {
    const tel = lerTelefone(texto);
    if (!tel) { estado.tentativas++; return fim("Não consegui ler o telefone. Escreva com DDD, por exemplo 11 91234 5678.", "pediu_telefone_de_novo"); }
    const id = await deps.registrarPedido({ nome: estado.nome ?? "", telefone: tel, estado, oferta: estado.escolhida ?? null });
    estado.etapa = "concluido";
    const o = estado.escolhida;
    return fim(`Anotei seu pedido de agendamento (protocolo ${id})${o ? `: ${rotulo(o.modalidade)}, ${dataPorExtenso(o.data)}, às ${o.hora}` : ""}. Atenção: o horário ainda NÃO está reservado. A equipe vai conferir e confirmar com você por aqui. Pode mandar outras dúvidas.`, "pedido_registrado");
  }

  // Interpreta o que a pessoa já informou, em qualquer ordem.
  const mod = lerModalidade(texto);
  if (mod) estado.modalidade = mod;
  const dias = lerDias(texto, deps.hojeISO());
  if (dias.datas) { estado.datas = dias.datas; estado.dias = undefined; }
  else if (dias.dias !== undefined) { estado.dias = dias.dias; estado.datas = null; }
  const per = lerPeriodo(texto);
  if (per) estado.periodo = per;

  // ── escolha de horário ──
  if (estado.etapa === "escolha" && estado.ofertas?.length) {
    const esc = lerEscolha(texto, estado.ofertas);
    if (esc.indice != null) {
      estado.escolhida = estado.ofertas[esc.indice];
      if (ctx.ehCliente) return reservarEResponder(estado, deps, nome1);
      estado.etapa = "nome";
      return fim(`Combinado: ${rotulo(estado.escolhida.modalidade)}, ${dataPorExtenso(estado.escolhida.data)}, às ${estado.escolhida.hora}. Como você ainda não tem cadastro, preciso de alguns dados para a equipe confirmar. Qual é o seu nome completo?`, "pediu_nome");
    }
    if (esc.ambiguo) return fim("Mais de uma opção combina com o que você disse. Responda só com o número da opção, por favor.", "escolha_ambigua");
    if (esc.recusou) {
      estado.mostradas = [...(estado.mostradas ?? []), ...estado.ofertas.map(chaveOferta)];
      return ofertar(estado, deps, "Sem problema, procurei outras opções.");
    }
    if (!mod && dias.dias === undefined && !dias.datas && !per) {
      estado.tentativas++;
      if (estado.tentativas >= 3) {
        await deps.encaminharEquipe("agendamento_sem_entendimento");
        estado.etapa = "concluido";
        return fim("Não consegui entender sua escolha. Encaminhei a conversa para a equipe, que responde por aqui.", "encaminhada_sem_entendimento");
      }
      return fim(`Não entendi qual opção você prefere. Responda com o número:\n${listaOfertas(estado.ofertas)}\nOu diga outros dias ou períodos que eu procuro de novo.`, "escolha_nao_entendida");
    }
    estado.mostradas = []; // mudou preferências: procura de novo
    return ofertar(estado, deps, "Certo, vou procurar com essa preferência.");
  }

  // ── levantamento de preferências ──
  estado.etapa = estado.modalidade ? "preferencias" : "modalidade";
  if (!estado.modalidade) return fim(comApresentacao(estado, ctx.nomeClinica, `Vamos marcar sua consulta${nome1}. ${PERGUNTA_MODALIDADE}`), "perguntou_modalidade");
  const faltaDia = estado.dias === undefined && !estado.datas;
  const faltaPeriodo = !estado.periodo;
  if (faltaDia || faltaPeriodo) {
    if (estado.tentativas >= 1) { // já perguntou uma vez: segue com "qualquer" no que faltar
      if (faltaDia) estado.dias = null;
      if (faltaPeriodo) estado.periodo = "qualquer";
    } else {
      estado.tentativas++;
      return fim(comApresentacao(estado, ctx.nomeClinica, `Certo, ${rotulo(estado.modalidade)}. ${perguntaFaltante(estado)}`), "perguntou_preferencias");
    }
  }
  return ofertar(estado, deps, comApresentacao(estado, ctx.nomeClinica, "Deixa eu ver a agenda."));
}

async function ofertar(estado: EstadoConversa, deps: DepsAgendamento, prefixo: string): Promise<ResultadoAgendamento> {
  const r = await deps.buscarHorarios({
    modalidade: estado.modalidade!, dias: estado.datas ? null : (estado.dias ?? null), datas: estado.datas ?? null,
    periodo: estado.periodo ?? "qualquer", excluir: estado.mostradas ?? [], max: 4,
  });
  if (r.ofertas.length === 0 && (estado.periodo !== "qualquer" || estado.dias != null || estado.datas)) {
    // Nada na preferência pedida: mostra alternativas reais (qualquer dia/período) antes de chamar a equipe.
    const alt = await deps.buscarHorarios({
      modalidade: estado.modalidade!, dias: null, datas: null, periodo: "qualquer", excluir: estado.mostradas ?? [], max: 4,
    });
    if (alt.ofertas.length > 0) {
      estado.ofertas = alt.ofertas;
      estado.etapa = "escolha";
      estado.tentativas = 0;
      return { tratada: true, estado, desfecho: "ofereceu_alternativas", resposta:
        `${prefixo} Não há horário livre ${rotulo(estado.modalidade!)} nessa preferência, mas estes outros estão livres:\n${listaOfertas(alt.ofertas)}\nResponda com o número da opção que prefere, ou diga outros dias e períodos.` };
    }
  }
  if (r.ofertas.length === 0) {
    await deps.encaminharEquipe("sem_horario_disponivel");
    estado.etapa = "concluido";
    return { tratada: true, estado, desfecho: "sem_horario_encaminhada", resposta:
      `${prefixo} Não encontrei horário livre ${rotulo(estado.modalidade!)} com essa preferência. Encaminhei seu pedido para a equipe, que procura uma alternativa e responde por aqui.` };
  }
  estado.ofertas = r.ofertas;
  estado.etapa = "escolha";
  estado.tentativas = 0;
  return { tratada: true, estado, desfecho: "ofereceu_horarios", resposta:
    `${prefixo} Estes horários estão livres (${rotulo(estado.modalidade!)}):\n${listaOfertas(r.ofertas)}\nResponda com o número da opção que prefere, ou diga outros dias e períodos.` };
}

async function reservarEResponder(estado: EstadoConversa, deps: DepsAgendamento, nome1: string): Promise<ResultadoAgendamento> {
  const o = estado.escolhida!;
  const r = await deps.reservar(o);
  if (r.ok) {
    estado.etapa = "concluido";
    const end = o.modalidade === "presencial" ? await deps.endereco("presencial") : null;
    return { tratada: true, estado, desfecho: "reservado", resposta:
      `Pronto${nome1}! Sua consulta ${rotulo(o.modalidade)} está reservada para ${dataPorExtenso(o.data)}, às ${o.hora}.${end ? ` Local: ${end}.` : ""} A equipe da clínica acompanha esta conversa e confirma qualquer detalhe por aqui.` };
  }
  if (r.motivo === "limite" || r.motivo === "erro") {
    await deps.encaminharEquipe(r.motivo === "limite" ? "limite_de_reservas" : "falha_ao_reservar");
    estado.etapa = "concluido";
    return { tratada: true, estado, desfecho: r.motivo === "limite" ? "limite_encaminhada" : "erro_encaminhada", resposta:
      r.motivo === "limite"
        ? "Para novas reservas hoje preciso da ajuda da equipe. Encaminhei seu pedido e ela responde por aqui."
        : "Não consegui gravar essa reserva agora, então ela NÃO foi feita. Encaminhei para a equipe resolver, e ela responde por aqui." };
  }
  // Horário foi ocupado no meio tempo: procura de novo, sem prometer nada.
  estado.mostradas = [...(estado.mostradas ?? []), chaveOferta(o)];
  estado.escolhida = undefined;
  return ofertar(estado, deps, "Esse horário acabou de ser ocupado por outra pessoa, e nada foi reservado para você.");
}
