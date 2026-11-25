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
import type { ConferirEscolha, ConferirLeitura, Interpretar } from "./telegram-interprete";
import { linhaDoNome, type FraseDeps } from "./telegram-frases";

export type Modalidade = "online" | "presencial";
export type Periodo = "manha" | "tarde" | "noite" | "qualquer";

export interface Oferta {
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm
  recursoId: number;
  modalidade: Modalidade;
}

export type Etapa = "inicio" | "vinculo" | "confirmar_paciente" | "identidade" | "modalidade" | "preferencias" | "escolha" | "nome" | "telefone" | "concluido";

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
  /** "nova" = primeira vez; "cliente" = identidade conferida contra o cadastro. */
  situacao?: "nova" | "cliente";
  /** Preenchido só quando a identidade foi conferida pelo servidor. */
  clienteId?: number;
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
  /** Link público de marcação. Quando presente, cliente que pede consulta recebe o link em vez das perguntas. */
  linkMarcacao?: () => string;
  /** Interpretação por IA do que a pessoa escreveu (opcional). Sem ela, valem os leitores por regras. */
  interpretar?: Interpretar;
  /** Conferência independente da escolha antes de qualquer reserva ou pedido. */
  conferirEscolha: ConferirEscolha;
  /** Conferência adicional quando o Intérprete devolver leitura de confiança média. */
  conferirLeitura?: ConferirLeitura;
  /** Frases cadastradas (tabela telegram_frases). */
  frase: FraseDeps;
  /** Confere nome + 4 primeiros dígitos do CPF + ano de nascimento. Só devolve id quando há UM cadastro compatível. */
  conferirIdentidade: (p: { nome: string; cpf4: string; ano: string }) => Promise<{ ok: true; clienteId: number } | { ok: false }>;
}

export interface ContextoAgendamento {
  ehCliente: boolean;
  /** Interruptor da clínica: mesmo reconhecido, o paciente responde "já é paciente?" antes de receber o link. */
  perguntarSeJaPaciente?: boolean;
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
  caminhoResolucao: "regra" | "interprete" | "conferente" | "equipe";
  interpreteChamado: boolean;
  conferenteChamado: boolean;
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

export function lerNome(texto: string): string | null {
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
const descreve = (o: Oferta) => `${rotulo(o.modalidade)}, ${dataPorExtenso(o.data)}, às ${o.hora}`;

/** A assistente se apresenta como virtual e com o nome da CLÍNICA (nunca o nome do sistema, nunca nome inventado). */
export function apresentacao(frase: FraseDeps, nomeClinica?: string): string {
  const n = nomeClinica?.trim();
  return n ? frase("apresentacao", { clinica: n }) : frase("apresentacao_sem_clinica");
}

function comApresentacao(estado: EstadoConversa, nomeClinica: string | undefined, frase: FraseDeps, corpo: string, primeiroNome?: string): string {
  if (estado.apresentada) return `${linhaDoNome(primeiroNome)}${corpo}`;
  estado.apresentada = true;
  return `${apresentacao(frase, nomeClinica)}\n\n${corpo}`;
}

// ─────────────────────────── identidade ───────────────────────────

const JA_CLIENTE = /\b(ja sou|sou cliente|sou paciente|ja sou cliente|ja sou paciente|ja tenho cadastro|ja me consulto|ja me consultei|ja fui|ja consultei|ja atendida|ja atendido|cliente)\b/;
const PRIMEIRA_VEZ = /\b(primeira vez|primeira consulta|nova|novo|nunca (fui|me consultei|consultei)|nao sou (cliente|paciente)|ainda nao sou|nao tenho cadastro)\b/;

export function lerVinculo(texto: string): "nova" | "cliente" | null {
  const n = normalizar(texto);
  if (PRIMEIRA_VEZ.test(n)) return "nova";
  if (JA_CLIENTE.test(n)) return "cliente";
  return null;
}

/** Nome completo + 4 primeiros dígitos do CPF + ano de nascimento (nessa ordem, números de 4 dígitos). */
export function lerIdentidade(texto: string): { nome: string; cpf4: string; ano: string } | null {
  const quatro = [...texto.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map((m) => m[1]);
  if (quatro.length !== 2) return null;
  const anoOk = (x: string) => Number(x) >= 1900 && Number(x) <= new Date().getFullYear();
  // Aceita qualquer ordem: o número que parece ano de nascimento é o ano; o outro, os 4 dígitos do CPF.
  let [cpf4, ano] = quatro;
  if (!anoOk(ano) && anoOk(cpf4)) [cpf4, ano] = [ano, cpf4];
  if (!anoOk(ano)) return null;
  const nome = lerNome(texto.replace(/[\d.,;:()/\\-]+/g, " ").replace(/\s+/g, " ").trim());
  if (!nome) return null;
  return { nome, cpf4, ano };
}

// ─────────────────────────── orquestração ───────────────────────────

export async function conduzirAgendamento(
  anterior: EstadoConversa | null, texto: string, ctx: ContextoAgendamento, deps: DepsAgendamento, agoraISO: string,
): Promise<ResultadoAgendamento> {
  const F = deps.frase;
  const valido = anterior && Date.now() - Date.parse(anterior.atualizadoEm) < VALIDADE_MS && anterior.etapa !== "concluido";
  const estado: EstadoConversa = valido ? structuredClone(anterior) : ESTADO_INICIAL(agoraISO);
  if (anterior && !valido) estado.apresentada = anterior.apresentada;
  estado.atualizadoEm = agoraISO;
  const emAndamento = estado.etapa !== "inicio";
  const n = normalizar(texto);
  let caminhoResolucao: ResultadoAgendamento["caminhoResolucao"] = "regra";
  let interpreteChamado = false;
  let conferenteChamado = false;
  const nome1 = ctx.primeiroNome ? `, ${ctx.primeiroNome}` : "";
  const interpretarSeguro: Interpretar = async (t) => {
    try { return await deps.interpretar?.(t) ?? null; }
    catch { return null; }
  };
  const conferirSeguro: ConferirLeitura = async (p) => {
    try { return await deps.conferirLeitura?.(p) ?? false; }
    catch { return false; }
  };
  const fim = (resposta: string | null, desfecho: string, tratada = true): ResultadoAgendamento => ({
    tratada, estado, resposta, desfecho, caminhoResolucao, interpreteChamado, conferenteChamado,
  });
  const ap = (corpo: string) => comApresentacao(estado, ctx.nomeClinica, F, corpo, ctx.primeiroNome);

  // Queixa de saúde nunca é tratada aqui: segue para a equipe.
  if (classificarQueixa(texto)) return fim(null, "queixa_nao_tratada", false);

  if (emAndamento && PALAVRAS_REINICIAR.test(n)) {
    const novo = ESTADO_INICIAL(agoraISO);
    novo.apresentada = true;
    if (!ctx.ehCliente && estado.situacao) { novo.situacao = estado.situacao; novo.clienteId = estado.clienteId; novo.nome = estado.nome; }
    novo.etapa = "modalidade";
    return fim(F("recomecar", { nome1, pergunta_modalidade: F("pergunta_modalidade") }), "reiniciada");
  }
  if (PALAVRAS_CANCELAR.test(n)) {
    await deps.encaminharEquipe("cancelar_ou_remarcar");
    return fim(ap(F("cancelar_remarcar", { nome1 })), "encaminhada_cancelar_remarcar");
  }
  if (PALAVRAS_EQUIPE.test(n) && !emAndamento) {
    await deps.encaminharEquipe("pediu_pessoa");
    return fim(ap(F("pediu_pessoa", { nome1 })), "encaminhada_pediu_pessoa");
  }

  // Sem conversa em andamento: cliente só entra se pediu agendamento; visitante recebe orientação e a equipe é avisada.
  if (!emAndamento && !ehPedidoDeAgendamento(texto)) {
    if (ctx.ehCliente) return fim(null, "fora_do_assunto", false);
    await deps.encaminharEquipe("duvida_de_visitante");
    return fim(ap(F("visitante_encaminhado")), "visitante_encaminhado");
  }

  // Cliente vinculado que quer marcar consulta: recebe o link de marcação (quando configurado).
  if (ctx.ehCliente && deps.linkMarcacao && estado.etapa === "confirmar_paciente") {
    if (!lerVinculo(texto) && estado.tentativas < 1) { estado.tentativas++; return fim(F("vinculo_nao_entendido"), "vinculo_nao_entendido"); }
    estado.etapa = "concluido";
    return fim(ap(F("enviar_link_marcacao", { link: deps.linkMarcacao() })), "link_marcacao_enviado");
  }
  if (ctx.ehCliente && deps.linkMarcacao && ctx.perguntarSeJaPaciente && !emAndamento && ehPedidoDeAgendamento(texto)) {
    estado.etapa = "confirmar_paciente";
    estado.tentativas = 0;
    return fim(ap(F("pergunta_ja_paciente")), "perguntou_vinculo");
  }
  if (ctx.ehCliente && deps.linkMarcacao && ehPedidoDeAgendamento(texto)) {
    estado.etapa = "concluido";
    return fim(ap(F("enviar_link_marcacao", { link: deps.linkMarcacao() })), "link_marcacao_enviado");
  }

  // ── quem é a pessoa (só quem não está vinculado) ──
  if (!ctx.ehCliente && !estado.situacao && estado.etapa !== "nome" && estado.etapa !== "telefone") {
    if (estado.etapa !== "vinculo" && estado.etapa !== "identidade") {
      estado.etapa = "vinculo";
      return fim(ap(F("pergunta_ja_paciente")), "perguntou_vinculo");
    }
    if (estado.etapa === "vinculo") {
      let v = lerVinculo(texto);
      if (!v && deps.interpretar) {
        const ia = await interpretarSeguro({ tipo: "vinculo", texto });
        if (ia?.situacao && ia.confianca !== "baixa") {
          interpreteChamado = true;
          caminhoResolucao = "interprete";
          if (ia.confianca === "media" || !ia.confianca) {
            const confirmado = await conferirSeguro({
              texto, proposta: `A situação informada é ${ia.situacao}.`, opcoes: ["cliente", "nova"],
            });
            conferenteChamado = !!deps.conferirLeitura;
            caminhoResolucao = deps.conferirLeitura ? "conferente" : "interprete";
            if (!confirmado) v = null;
            else v = ia.situacao;
          } else {
            v = ia.situacao;
          }
        }
      }
      if (!v) {
        estado.tentativas++;
        if (estado.tentativas >= 3) {
          await deps.encaminharEquipe("vinculo_sem_entendimento");
          estado.etapa = "concluido";
          return fim(F("encaminhada_sem_entendimento"), "encaminhada_vinculo");
        }
        return fim(F("vinculo_nao_entendido"), "vinculo_nao_entendido");
      }
      estado.tentativas = 0;
      if (v === "cliente") { estado.etapa = "identidade"; return fim(F("pedir_identidade"), "pediu_identidade"); }
      estado.situacao = "nova"; // segue para as perguntas de agendamento
    } else {
      const id = lerIdentidade(texto);
      if (!id) {
        estado.tentativas++;
        if (estado.tentativas >= 2) {
          await deps.encaminharEquipe("identidade_nao_lida");
          estado.etapa = "concluido";
          return fim(F("identidade_encaminhada"), "identidade_encaminhada");
        }
        return fim(F("identidade_formato"), "identidade_formato");
      }
      const r = await deps.conferirIdentidade(id);
      if (!r.ok) {
        estado.tentativas++;
        if (estado.tentativas >= 2) {
          await deps.encaminharEquipe("identidade_nao_confirmada");
          estado.etapa = "concluido";
          return fim(F("identidade_encaminhada"), "identidade_encaminhada");
        }
        return fim(F("identidade_nao_confirmada"), "identidade_nao_confirmada");
      }
      estado.situacao = "cliente"; estado.clienteId = r.clienteId; estado.nome = id.nome; estado.tentativas = 0;
      estado.etapa = "modalidade";
      const p1 = id.nome.split(/\s+/)[0];
      return fim(F("identidade_confirmada", { nome_linha: linhaDoNome(`${p1.charAt(0).toUpperCase()}${p1.slice(1).toLowerCase()}`), pergunta_modalidade: F("pergunta_modalidade") }), "identidade_confirmada");
    }
  }

  // ── dados de quem ainda não é cliente (não reinterpreta o texto como preferência) ──
  if (estado.etapa === "nome") {
    const nome = lerNome(texto);
    if (!nome) { estado.tentativas++; return fim(F("pediu_nome_de_novo"), "pediu_nome_de_novo"); }
    estado.nome = nome; estado.etapa = "telefone";
    return fim(F("pediu_telefone"), "pediu_telefone");
  }
  if (estado.etapa === "telefone") {
    const tel = lerTelefone(texto);
    if (!tel) { estado.tentativas++; return fim(F("pediu_telefone_de_novo"), "pediu_telefone_de_novo"); }
    const id = await deps.registrarPedido({ nome: estado.nome ?? "", telefone: tel, estado, oferta: estado.escolhida ?? null });
    estado.etapa = "concluido";
    const o = estado.escolhida;
    return fim(F(estado.situacao === "cliente" ? "pedido_registrado_cliente" : "pedido_registrado", { protocolo: String(id), detalhe: o ? `: ${descreve(o)}` : "" }), "pedido_registrado");
  }

  // Interpreta o que a pessoa já informou, em qualquer ordem.
  const modRegra = lerModalidade(texto);
  const diasRegra = lerDias(texto, deps.hojeISO());
  const periodoRegra = lerPeriodo(texto);
  const temPreferenciaExplicita = /\b(manha|cedo|tarde|almoco|noite|noturno|horario|hora|dia|dias|semana|hoje|amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|depois|antes|web|video)\b|\b\d{1,2}\s*(?:h|horas)\b/i.test(n);
  const qualquerRegraLocal = !!modRegra || !!periodoRegra || diasRegra.dias !== undefined || !!diasRegra.datas;
  const etapaDePreferencia = estado.etapa === "modalidade" || estado.etapa === "preferencias";
  const precisaInterpretar = etapaDePreferencia && temPreferenciaExplicita && !qualquerRegraLocal;
  const ia = estado.etapa === "escolha" || !precisaInterpretar || !deps.interpretar
    ? null
    : await interpretarSeguro({ tipo: "preferencias", texto, hojeISO: deps.hojeISO() });
  if (ia) {
    interpreteChamado = true;
    caminhoResolucao = "interprete";
  }
  let iaPreferencias = ia && ia.confianca !== "baixa" ? ia : null;
  if (iaPreferencias && (iaPreferencias.confianca === "media" || !iaPreferencias.confianca)) {
    const proposta = JSON.stringify({
      modalidade: iaPreferencias.modalidade ?? null, periodo: iaPreferencias.periodo ?? null, dias: iaPreferencias.dias ?? null,
    });
    const confirmado = await conferirSeguro({
      texto, proposta, opcoes: ["modalidade online ou presencial", "período e dias de preferência"],
    });
    conferenteChamado = !!deps.conferirLeitura;
    caminhoResolucao = deps.conferirLeitura ? "conferente" : "interprete";
    if (!confirmado) iaPreferencias = null;
  }
  const mod = modRegra ?? iaPreferencias?.modalidade ?? null;
  if (mod) estado.modalidade = mod;
  const dias = diasRegra.datas || diasRegra.dias !== undefined ? diasRegra
    : iaPreferencias?.dias === "qualquer" ? { dias: null } : Array.isArray(iaPreferencias?.dias) && iaPreferencias.dias.length ? { dias: iaPreferencias.dias } : diasRegra;
  if (dias.datas) { estado.datas = dias.datas; estado.dias = undefined; }
  else if (dias.dias !== undefined) { estado.dias = dias.dias; estado.datas = null; }
  const per = periodoRegra ?? iaPreferencias?.periodo ?? null;
  if (per) estado.periodo = per;

  // ── escolha de horário ──
  if (estado.etapa === "escolha" && estado.ofertas?.length) {
    const opcoes = estado.ofertas.map(descreve);
    let esc = lerEscolha(texto, estado.ofertas);
    if (esc.indice == null && !esc.recusou && !esc.ambiguo && deps.interpretar) {
      const iaEsc = await interpretarSeguro({ tipo: "escolha", texto, opcoes });
      if (iaEsc) {
        interpreteChamado = true;
        caminhoResolucao = "interprete";
      }
      if (iaEsc && iaEsc.confianca !== "baixa" && (iaEsc.recusou || (iaEsc.escolha != null && iaEsc.escolha >= 1 && iaEsc.escolha <= estado.ofertas.length))) {
        esc = { indice: iaEsc.recusou ? null : iaEsc.escolha! - 1, recusou: !!iaEsc.recusou, ambiguo: false };
      }
    }
    if (esc.indice != null) {
      // Escolher horário leva a uma reserva ou a um pedido; o segundo modelo confirma antes de qualquer efeito.
      let confirma = false;
      try { confirma = await deps.conferirEscolha({ texto, opcoes, escolha: esc.indice + 1 }); } catch { confirma = false; }
      conferenteChamado = true;
      caminhoResolucao = "conferente";
      if (!confirma) {
        estado.tentativas++;
        return fim(F("escolha_nao_entendida", { lista: listaOfertas(estado.ofertas) }), "escolha_conferencia_recusada");
      }
      estado.escolhida = estado.ofertas[esc.indice];
      const meta = { caminhoResolucao, interpreteChamado, conferenteChamado };
      if (ctx.ehCliente) return reservarEResponder(estado, deps, nome1, meta);
      const escolha = descreve(estado.escolhida);
      if (estado.situacao === "cliente") { estado.etapa = "telefone"; return fim(F("escolha_pede_telefone", { escolha }), "pediu_telefone"); }
      estado.etapa = "nome";
      return fim(F("escolha_pede_nome", { escolha }), "pediu_nome");
    }
    if (esc.ambiguo) return fim(F("escolha_ambigua"), "escolha_ambigua");
    if (esc.recusou) {
      estado.mostradas = [...(estado.mostradas ?? []), ...estado.ofertas.map(chaveOferta)];
      return ofertar(estado, deps, F("procurando_outras"), { caminhoResolucao, interpreteChamado, conferenteChamado });
    }
    if (!mod && dias.dias === undefined && !dias.datas && !per) {
      estado.tentativas++;
      if (estado.tentativas >= 3) {
        await deps.encaminharEquipe("agendamento_sem_entendimento");
        estado.etapa = "concluido";
        return fim(F("encaminhada_sem_entendimento"), "encaminhada_sem_entendimento");
      }
      return fim(F("escolha_nao_entendida", { lista: listaOfertas(estado.ofertas) }), "escolha_nao_entendida");
    }
    estado.mostradas = []; // mudou preferências: procura de novo
    return ofertar(estado, deps, F("procurando_preferencia"), { caminhoResolucao, interpreteChamado, conferenteChamado });
  }

  // ── levantamento de preferências ──
  estado.etapa = estado.modalidade ? "preferencias" : "modalidade";
  if (!estado.modalidade) return fim(ap(F("vamos_marcar", { nome1, pergunta_modalidade: F("pergunta_modalidade") })), "perguntou_modalidade");
  const faltaDia = estado.dias === undefined && !estado.datas;
  const faltaPeriodo = !estado.periodo;
  if (faltaDia || faltaPeriodo) {
    if (estado.tentativas >= 1) { // já perguntou uma vez: segue com "qualquer" no que faltar
      if (faltaDia) estado.dias = null;
      if (faltaPeriodo) estado.periodo = "qualquer";
    } else {
      estado.tentativas++;
      const pergunta = estado.dias === undefined && !estado.datas ? F("pergunta_preferencias") : F("pergunta_periodo");
      return fim(ap(F("certo_modalidade", { modalidade: rotulo(estado.modalidade), pergunta })), "perguntou_preferencias");
    }
  }
  return ofertar(estado, deps, ap(F("olhando_agenda")), { caminhoResolucao, interpreteChamado, conferenteChamado });
}

type MetadadosResolucao = Pick<ResultadoAgendamento, "caminhoResolucao" | "interpreteChamado" | "conferenteChamado">;

async function ofertar(
  estado: EstadoConversa, deps: DepsAgendamento, prefixo: string, meta: MetadadosResolucao = { caminhoResolucao: "regra", interpreteChamado: false, conferenteChamado: false },
): Promise<ResultadoAgendamento> {
  const F = deps.frase;
  const mod = rotulo(estado.modalidade!);
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
      return { tratada: true, estado, desfecho: "ofereceu_alternativas", resposta: F("ofereceu_alternativas", { prefixo, modalidade: mod, lista: listaOfertas(alt.ofertas) }), ...meta };
    }
  }
  if (r.ofertas.length === 0) {
    await deps.encaminharEquipe("sem_horario_disponivel");
    estado.etapa = "concluido";
    return { tratada: true, estado, desfecho: "sem_horario_encaminhada", resposta: F("sem_horario_encaminhada", { prefixo, modalidade: mod }), ...meta, caminhoResolucao: "equipe" };
  }
  estado.ofertas = r.ofertas;
  estado.etapa = "escolha";
  estado.tentativas = 0;
  return { tratada: true, estado, desfecho: "ofereceu_horarios", resposta: F("ofereceu_horarios", { prefixo, modalidade: mod, lista: listaOfertas(r.ofertas) }), ...meta };
}

async function reservarEResponder(estado: EstadoConversa, deps: DepsAgendamento, nome1: string, meta: MetadadosResolucao): Promise<ResultadoAgendamento> {
  const F = deps.frase;
  const o = estado.escolhida!;
  const r = await deps.reservar(o);
  if (r.ok) {
    estado.etapa = "concluido";
    const end = o.modalidade === "presencial" ? await deps.endereco("presencial") : null;
    return { tratada: true, estado, desfecho: "reservado", resposta: F("reservado", { nome1, modalidade: rotulo(o.modalidade), data: dataPorExtenso(o.data), hora: o.hora, local: end ? `\n\nLocal: ${end}.` : "" }), ...meta };
  }
  if (r.motivo === "limite" || r.motivo === "erro") {
    await deps.encaminharEquipe(r.motivo === "limite" ? "limite_de_reservas" : "falha_ao_reservar");
    estado.etapa = "concluido";
    return { tratada: true, estado, desfecho: r.motivo === "limite" ? "limite_encaminhada" : "erro_encaminhada", resposta: F(r.motivo === "limite" ? "limite_reservas" : "erro_reserva"), ...meta, caminhoResolucao: "equipe" };
  }
  // Horário foi ocupado no meio tempo: procura de novo, sem prometer nada.
  estado.mostradas = [...(estado.mostradas ?? []), chaveOferta(o)];
  estado.escolhida = undefined;
  return ofertar(estado, deps, F("horario_ocupado"), meta);
}
