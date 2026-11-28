/**
 * Ficha de efeito relatado: orientação prática reunida no MESMO texto da tela Dúvidas e Orientações.
 * Os textos são dados por clínica (editáveis na tela). Este módulo só define a ESTRUTURA mínima
 * e o fluxo de decisão testável. Nunca redige texto clínico e nunca envia nada.
 */
export const SECOES_FICHA = ["PERGUNTAS RÁPIDAS", "SE FOR LEVE", "SE FOR MODERADO", "QUANDO REAVALIAR", "PROCURE URGÊNCIA AGORA SE"] as const;
export type SecaoFicha = (typeof SECOES_FICHA)[number];

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().trim().replace(/[:\s]+$/, "");

/** Separa o texto em seções pelas linhas de título (linha inteira igual ao título, sem acento e sem diferenciar maiúscula). */
export function separarFicha(texto: string): { introducao: string; secoes: Partial<Record<SecaoFicha, string>> } {
  const alvo = new Map(SECOES_FICHA.map((s) => [norm(s), s]));
  const secoes: Partial<Record<SecaoFicha, string[]>> = {};
  const intro: string[] = [];
  let atual: SecaoFicha | null = null;
  for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const s = alvo.get(norm(linha.replace(/^[^\p{L}\p{N}]+/u, "")));
    if (s) { atual = s; secoes[s] = []; continue; }
    (atual ? secoes[atual]! : intro).push(linha);
  }
  const out: Partial<Record<SecaoFicha, string>> = {};
  for (const s of SECOES_FICHA) if (secoes[s]) out[s] = secoes[s]!.join("\n").trim();
  return { introducao: intro.join("\n").trim(), secoes: out };
}

export interface ProblemaFicha { codigo: string; mensagem: string }

/** Confere se a ficha tem tudo o que o médico pediu. Não avalia mérito clínico. */
export function validarFicha(texto: string): ProblemaFicha[] {
  const p: ProblemaFicha[] = [];
  const { secoes } = separarFicha(texto);
  for (const s of SECOES_FICHA) if (!secoes[s]) p.push({ codigo: "secao_ausente", mensagem: `Falta a seção "${s}".` });
  const urg = secoes["PROCURE URGÊNCIA AGORA SE"] ?? "";
  if (urg && !/192|samu|pronto[- ]socorro|urg[eê]ncia/i.test(urg)) p.push({ codigo: "urgencia_sem_destino", mensagem: "A seção de urgência não diz aonde ir (192 ou pronto-socorro)." });
  const orientaDose = texto.split(/[\n.]+/).some((frase) => {
    const f = frase.toLowerCase();
    return /\b(aument(e|ar)|dobr(e|ar)|tom(e|ar) (mais|outra|uma dose)|dose adicional|suspend(a|er) (por conta|o uso))/.test(f) && !/n[aã]o /.test(f);
  });
  if (orientaDose) p.push({ codigo: "orienta_dose", mensagem: "O texto parece orientar dose ou mudança de medicamento." });
  if (/(causad[oa] (pel[oa]|por)|com certeza|certamente|é efeito d)/i.test(texto)) p.push({ codigo: "presume_causa", mensagem: "O texto parece afirmar a causa com certeza." });
  return p;
}

export interface RespostasTriagem {
  subitoIntenso?: boolean;      // início súbito e muito intenso ("a pior dor da vida")
  neurologico?: boolean;        // fraqueza de um lado, fala enrolada, rosto torto, confusão, desmaio, convulsão
  dorNoPeito?: boolean;
  faltaDeArImportante?: boolean;
  naoConsegueHidratar?: boolean; // vômitos persistentes
  dorAbdominalIntensa?: boolean;
  intensidade?: "leve" | "moderada" | "intensa" | null;
  habitualEPrevisivel?: boolean; // já conhecida e igual ao costume da pessoa
}
export type NivelGravidade = "urgencia" | "equipe" | "autocuidado" | "indefinido";

/** Critérios de urgência valem sempre, a qualquer hora, e vencem qualquer outra resposta. Dúvida = nível acima. */
export function classificarGravidade(r: RespostasTriagem): NivelGravidade {
  if (r.subitoIntenso || r.neurologico || r.dorNoPeito || r.faltaDeArImportante || r.naoConsegueHidratar || r.dorAbdominalIntensa) return "urgencia";
  if (r.intensidade === "intensa") return "urgencia";
  if (r.intensidade === "moderada") return "equipe";
  if (r.intensidade === "leve") return r.habitualEPrevisivel === false ? "equipe" : "autocuidado";
  return "indefinido";
}

/** Escolhe o trecho da ficha para o nível. "indefinido" devolve só as perguntas (nunca presume leve). */
export function trechoParaNivel(texto: string, nivel: NivelGravidade): { secoes: SecaoFicha[]; texto: string } {
  const { secoes } = separarFicha(texto);
  const mapa: Record<NivelGravidade, SecaoFicha[]> = {
    urgencia: ["PROCURE URGÊNCIA AGORA SE"],
    equipe: ["SE FOR MODERADO", "QUANDO REAVALIAR"],
    autocuidado: ["SE FOR LEVE", "QUANDO REAVALIAR"],
    indefinido: ["PERGUNTAS RÁPIDAS"],
  };
  const lista = mapa[nivel].filter((s) => secoes[s]);
  return { secoes: lista, texto: lista.map((s) => secoes[s]).join("\n\n") };
}
