/**
 * Cascata de atendimento (ISOLADA E DESATIVADA): Sinapses (custo zero) -> IA 1 triadora -> IA 2 auditora -> IA 3 (divergências).
 * Módulo puro: todas as ligações externas entram por `deps`. Não envia mensagem, não executa ação no sistema,
 * não é chamado por nenhum webhook. Só produz uma DECISÃO auditável que vai para a fila de revisão.
 *
 * Travas fixas (valem para qualquer etapa e também para o texto que a IA devolve):
 *  - identidade e clínica confirmadas; controle (emergência/modo humano/canal) consultado antes e DEPOIS de cada etapa;
 *  - urgência e conduta clínica (diagnóstico, dose, prescrição, troca de remédio) vão para humano, sem IA;
 *  - texto com dado pessoal nunca vai ao provedor; contexto enviado à IA = só orientações aprovadas da clínica;
 *  - falha, JSON inválido ou dúvida em qualquer etapa = encaminhar para humano.
 */

export type EstagioCascata = "sinapse" | "ia1" | "ia2" | "ia3" | "regra" | "bloqueio";
export type AcaoCascata = "responder" | "encaminhar_humano" | "urgente_humano" | "bloqueado";

export interface ParecerIA {
  acao: "responder" | "encaminhar";
  intencao?: string;
  resposta?: string | null;
  confianca: number; // 0..1
  duvida?: boolean;
  composto?: boolean;
  concorda?: boolean; // só IA 2
  riscos?: string[];
  motivo?: string;
  uso?: UsoIAMedido;
}
export interface UsoIAMedido { modelo: string; inputTokens: number | null; outputTokens: number | null }

export interface EntradaCascata {
  empresaId: number;
  clienteId: number | null;
  clinicaConfirmada: boolean;
  canal: "whatsapp" | "telegram";
  texto: string;
}
export interface BaseClinicaItem { tema: string; resposta: string }

export interface DepsCascata {
  controle: () => Promise<"automatico" | "assistido" | "humano" | string>;
  buscarSinapse: (empresaId: number, texto: string) => Promise<{ id: number; resposta: string; intencao: string | null } | null>;
  baseClinica: (empresaId: number) => Promise<BaseClinicaItem[]>;
  sanitizar: (texto: string) => string | null;
  ia1: (p: { texto: string; base: BaseClinicaItem[] }) => Promise<ParecerIA>;
  ia2: (p: { texto: string; base: BaseClinicaItem[]; parecer1: ParecerIA }) => Promise<ParecerIA>;
  ia3: (p: { texto: string; base: BaseClinicaItem[]; parecer1: ParecerIA; parecer2: ParecerIA }) => Promise<ParecerIA>;
}

export interface DecisaoCascata {
  acao: AcaoCascata;
  estagio: EstagioCascata;
  resposta: string | null;
  intencao: string | null;
  motivo: string;
  sinapseId: number | null;
  parecer1: ParecerIA | null;
  parecer2: ParecerIA | null;
  parecer3: ParecerIA | null;
  chamadasIA: number;
  /** Nada é enviado nem executado por este módulo; a decisão só vira ação depois da liberação humana do projeto. */
  executada: false;
}

const SEM_ACENTO = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const normalizarGatilho = (t: string): string =>
  SEM_ACENTO(t.toLowerCase()).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const URGENTE = [
  /dor (forte )?no peito/, /falta de ar/, /nao consigo respirar/, /desmai/, /convuls/, /sangramento (forte|intenso)|sangrando muito/,
  /suicid|me matar|tirar minha vida|quero morrer/, /garganta (fechando|inchando)|rosto inchad|inchaco no rosto/, /overdose/,
  /infarto|\bavc\b|derrame/, /passando (muito )?mal/, /reacao alergica/, /perdi a consciencia/,
];
const CLINICO = [
  /\bdose\b|dosagem|quantos? (mg|ml|ui|comprimidos?|gotas?)|\d+\s?(mg|ml|ui|mcg)\b/, /posso tomar|devo tomar|pode tomar|tomar junto/,
  /receita|prescri|renova(r|cao) .*(receita|remedio)/, /diagnostic|o que (eu )?tenho|sera que (e|estou)/,
  /sintoma|efeito colateral|reacao|dor |febre|enjoo|tontura/, /trocar (o )?(remedio|medicamento|medicacao)|aumentar|reduzir|suspender|parar (de )?tomar/,
  /resultado (do|de) (meu |minha )?exame.*(significa|esta (alto|baixo)|normal)/, /gravida|amament/,
];
export function classificarRisco(texto: string): "urgente" | "clinico" | null {
  const t = normalizarGatilho(texto);
  if (URGENTE.some((r) => r.test(t))) return "urgente";
  if (CLINICO.some((r) => r.test(t))) return "clinico";
  return null;
}

const DADO_NA_RESPOSTA = [/\b\d{8,}\b/, /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, /[\w.+-]+@[\w-]+\.\w+/];
const CONDUTA_NA_RESPOSTA = [
  /\b\d+(?:[.,]\d+)?\s?(mg|ml|ui|mcg|comprimidos?|gotas?)\b/i, /\b(tome|use|aplique|aumente|reduza|suspenda|pare de tomar)\b/i,
  /\b(voce tem|voce esta com|seu diagnostico|isso e sinal de|provavelmente (e|tem))\b/i,
];
/** Valida o texto que seria enviado ao cliente (IA ou sinapse ratificada). */
export function validarRespostaSegura(resposta: string | null | undefined): { ok: true } | { ok: false; motivo: string } {
  const r = (resposta ?? "").trim();
  if (!r) return { ok: false, motivo: "resposta_vazia" };
  if (r.length > 700) return { ok: false, motivo: "resposta_longa_demais" };
  const sem = SEM_ACENTO(r);
  if (DADO_NA_RESPOSTA.some((x) => x.test(sem))) return { ok: false, motivo: "resposta_com_dado_pessoal_ou_numero_longo" };
  if (CONDUTA_NA_RESPOSTA.some((x) => x.test(sem))) return { ok: false, motivo: "resposta_com_conduta_clinica" };
  return { ok: true };
}

function decisao(p: Partial<DecisaoCascata> & Pick<DecisaoCascata, "acao" | "estagio" | "motivo">): DecisaoCascata {
  return { resposta: null, intencao: null, sinapseId: null, parecer1: null, parecer2: null, parecer3: null, chamadasIA: 0, executada: false, ...p };
}

export const LIMIAR_CONFIANCA_IA1 = 0.85;
export const LIMIAR_CONCORDANCIA = 0.7;

export async function executarCascata(e: EntradaCascata, deps: DepsCascata): Promise<DecisaoCascata> {
  // 0. Identidade e clínica
  if (!e.clinicaConfirmada || !e.clienteId || !Number.isSafeInteger(e.empresaId) || e.empresaId <= 0) {
    return decisao({ acao: "encaminhar_humano", estagio: "regra", motivo: "identidade_ou_clinica_nao_confirmada" });
  }
  // 1. Controle (emergência, modo humano, canal, clínica) antes de qualquer custo
  const c0 = await deps.controle();
  if (c0 !== "automatico") return decisao({ acao: "bloqueado", estagio: "bloqueio", motivo: `controle:${c0}` });
  // 2. Risco clínico/urgência: regra fixa, sem IA
  const risco = classificarRisco(e.texto);
  if (risco === "urgente") return decisao({ acao: "urgente_humano", estagio: "regra", motivo: "urgencia_detectada" });
  if (risco === "clinico") return decisao({ acao: "encaminhar_humano", estagio: "regra", motivo: "conduta_clinica_exige_humano" });

  // Reconsulta o controle antes de devolver qualquer decisão automática (interrupção de emergência no meio do caminho)
  const fechar = async (d: DecisaoCascata): Promise<DecisaoCascata> => {
    if (d.acao === "responder") {
      const c = await deps.controle();
      if (c !== "automatico") return { ...d, acao: "bloqueado", resposta: null, motivo: `controle_alterado_durante_a_analise:${c}` };
      const v = validarRespostaSegura(d.resposta);
      if (!v.ok) return { ...d, acao: "encaminhar_humano", resposta: null, motivo: v.motivo };
    }
    return d;
  };

  // 3. Nível 0: sinapses (custo zero)
  const sin = await deps.buscarSinapse(e.empresaId, e.texto);
  if (sin) {
    return fechar(decisao({ acao: "responder", estagio: "sinapse", resposta: sin.resposta, intencao: sin.intencao, sinapseId: sin.id, motivo: "sinapse_ativa" }));
  }

  // 4. Dado mínimo para IA
  const seguro = deps.sanitizar(e.texto);
  if (!seguro) return decisao({ acao: "encaminhar_humano", estagio: "regra", motivo: "texto_com_dado_pessoal_nao_vai_para_ia" });
  const base = (await deps.baseClinica(e.empresaId)).slice(0, 20).map((b) => ({ tema: b.tema.slice(0, 120), resposta: b.resposta.slice(0, 300) }));

  let chamadas = 0;
  const seguraChamada = async <T>(f: () => Promise<T>): Promise<T | null> => {
    chamadas++;
    try { return await f(); } catch { return null; }
  };
  const bloqueioMeio = async (): Promise<DecisaoCascata | null> => {
    const c = await deps.controle();
    return c !== "automatico" ? decisao({ acao: "bloqueado", estagio: "bloqueio", motivo: `controle_alterado_durante_a_analise:${c}`, chamadasIA: chamadas }) : null;
  };
  const humano = (motivo: string, p: Partial<DecisaoCascata>) => decisao({ acao: "encaminhar_humano", estagio: p.estagio ?? "regra", motivo, chamadasIA: chamadas, ...p });
  const parecerValido = (p: ParecerIA | null): p is ParecerIA =>
    !!p && (p.acao === "responder" || p.acao === "encaminhar") && typeof p.confianca === "number" && p.confianca >= 0 && p.confianca <= 1;

  // 5. IA 1
  const p1 = await seguraChamada(() => deps.ia1({ texto: seguro, base }));
  if (!parecerValido(p1)) return humano("ia1_indisponivel_ou_invalida", { estagio: "ia1" });
  let m = await bloqueioMeio(); if (m) return { ...m, parecer1: p1 };
  // IA que sugere conduta clínica no texto => humano
  if (p1.acao === "responder" && !validarRespostaSegura(p1.resposta).ok) return humano(`ia1_${(validarRespostaSegura(p1.resposta) as { motivo: string }).motivo}`, { estagio: "ia1", parecer1: p1 });
  if (p1.acao === "responder" && p1.confianca >= LIMIAR_CONFIANCA_IA1 && !p1.duvida && !p1.composto) {
    return fechar(decisao({ acao: "responder", estagio: "ia1", resposta: p1.resposta ?? null, intencao: p1.intencao ?? null, motivo: "ia1_confiante", parecer1: p1, chamadasIA: chamadas }));
  }

  // 6. IA 2 (só quando IA 1 teve dúvida, pedido composto, baixa confiança ou quis encaminhar)
  const p2 = await seguraChamada(() => deps.ia2({ texto: seguro, base, parecer1: p1 }));
  if (!parecerValido(p2)) return humano("ia2_indisponivel_ou_invalida", { estagio: "ia2", parecer1: p1 });
  m = await bloqueioMeio(); if (m) return { ...m, parecer1: p1, parecer2: p2 };
  const concordam = p2.concorda === true && p2.acao === p1.acao && p1.confianca >= LIMIAR_CONCORDANCIA && p2.confianca >= LIMIAR_CONCORDANCIA && !p2.riscos?.length;
  if (concordam) {
    if (p1.acao === "encaminhar") return humano("ia1_e_ia2_concordam_em_encaminhar", { estagio: "ia2", parecer1: p1, parecer2: p2 });
    return fechar(decisao({ acao: "responder", estagio: "ia2", resposta: p1.resposta ?? null, intencao: p1.intencao ?? null, motivo: "ia1_e_ia2_concordam", parecer1: p1, parecer2: p2, chamadasIA: chamadas }));
  }

  // 7. IA 3 (divergência)
  const p3 = await seguraChamada(() => deps.ia3({ texto: seguro, base, parecer1: p1, parecer2: p2 }));
  if (!parecerValido(p3)) return humano("ia3_indisponivel_ou_invalida", { estagio: "ia3", parecer1: p1, parecer2: p2 });
  m = await bloqueioMeio(); if (m) return { ...m, parecer1: p1, parecer2: p2, parecer3: p3 };
  if (p3.acao === "encaminhar" || p3.confianca < LIMIAR_CONCORDANCIA || p3.duvida) {
    return humano("ia3_encaminha_ou_com_duvida", { estagio: "ia3", parecer1: p1, parecer2: p2, parecer3: p3 });
  }
  return fechar(decisao({ acao: "responder", estagio: "ia3", resposta: p3.resposta ?? null, intencao: p3.intencao ?? null, motivo: "ia3_decidiu", parecer1: p1, parecer2: p2, parecer3: p3, chamadasIA: chamadas }));
}
