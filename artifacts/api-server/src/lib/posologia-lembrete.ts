// POSOLOGIA DE UMA TOMADA PARA O LEMBRETE (texto do catálogo -> linha da mensagem).
// Função pura (sem banco). Campos usados: quantidade, via, momento (antes/após/durante
// a refeição, com minutos) e período do dia. O que não for lido com certeza vira
// `alertas` e o motor de lembrete NÃO envia (ver lembrete-periodo.ts).
//
// O leitor de posologia do primo (@workspace/posologia) não é alterado: ajustes de
// negócio ficam aqui, em quem consome.
import { parsePosologia, semAcento, VIA_LABEL } from "@workspace/posologia";
import type { PeriodoAntigo } from "./lembrete-periodo";

const norm = (t: string) => semAcento(t.toLowerCase());

const NUMERO_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, meia: 0.5, meio: 0.5,
};

/** Período canônico do dia de UMA posologia (9 períodos do cânone). Sem pista: undefined. */
export function periodoDaPosologia(poso: string): PeriodoAntigo | undefined {
  const t = norm(poso);
  if (/(jejum|acordar)/.test(t)) return "jejum";
  if (/(cafe|desjejum|manha)/.test(t)) return "manha";
  if (/(almoco|meio-?dia)/.test(t)) return "almoco";
  if (/tarde/.test(t)) return "tarde";
  if (/ceia/.test(t)) return "ceia";
  if (/(deitar|dormir)/.test(t)) return "final_noite";
  if (/(jantar|noite|treino)/.test(t)) return "noite";
  return undefined;
}

type Ancora = { re: RegExp; de: string; art: string; nome: string; neutro: string };
// Ordem importa ("cafe da manha" antes de "manha").
const ANCORAS: Ancora[] = [
  { re: /(cafe|desjejum)/, de: "do", art: "o", nome: "cafe da manha", neutro: "no cafe da manha" },
  { re: /(almoco)/, de: "do", art: "o", nome: "almoco", neutro: "no almoco" },
  { re: /meio-?dia/, de: "do", art: "o", nome: "meio-dia", neutro: "ao meio-dia" },
  { re: /jantar/, de: "do", art: "o", nome: "jantar", neutro: "no jantar" },
  { re: /ceia/, de: "da", art: "a", nome: "ceia", neutro: "na ceia" },
  { re: /treino/, de: "do", art: "o", nome: "treino", neutro: "no treino" },
];

/**
 * Momento da tomada, sem perder "antes/após/durante" nem os minutos.
 * Ex.: "antes do jantar", "30 minutos antes do treino", "apos o almoco".
 * Devolve alerta quando o texto pede algo que a frase não consegue representar.
 */
export function momentoDaPosologia(poso: string): { texto?: string; alertas: string[] } {
  const t = norm(poso);
  const alertas: string[] = [];

  if (/jejum/.test(t)) return { texto: "em jejum", alertas };
  if (/acordar/.test(t)) return { texto: "ao acordar", alertas };
  if (/(deitar|dormir)/.test(t)) return { texto: "antes de dormir", alertas };

  const mTempo = /(\d+(?:[.,]\d+)?)\s*(minutos?|min|horas?|h)\s+(antes|apos|depois)\b/.exec(t);
  const relativo = mTempo ? (mTempo[3] === "antes" ? "antes" : "apos")
    : /\bantes\b/.test(t) ? "antes"
    : /\b(apos|depois)\b/.test(t) ? "apos"
    : /\b(durante|junto)\b/.test(t) ? "durante"
    : undefined;

  const ancora = ANCORAS.find((a) => a.re.test(t));
  if (ancora) {
    const com = !relativo && new RegExp(`\\bcom (?:o|a) ${ancora.re.source}`).test(t);
    let texto = ancora.neutro;
    if (com) texto = `com ${ancora.art} ${ancora.nome}`;
    else if (relativo === "antes") texto = `antes ${ancora.de} ${ancora.nome}`;
    else if (relativo === "apos") texto = `apos ${ancora.art} ${ancora.nome}`;
    else if (relativo === "durante") texto = `durante ${ancora.art} ${ancora.nome}`;
    if (mTempo && relativo !== "durante") {
      const n = mTempo[1].replace(".", ",");
      const un = /^h/.test(mTempo[2]) ? "hora" : "minuto";
      const plural = Number(mTempo[1].replace(",", ".")) === 1 ? "" : "s";
      texto = `${n} ${un}${plural} ${texto}`;
    }
    return { texto, alertas };
  }

  if (relativo || mTempo) {
    alertas.push('momento relativo ("antes/apos") sem refeicao ou treino reconhecido');
  }
  if (/manha/.test(t)) return { texto: "pela manha", alertas };
  if (/tarde/.test(t)) return { texto: "a tarde", alertas };
  if (/noite/.test(t)) return { texto: "a noite", alertas };
  return { texto: undefined, alertas };
}

/** Quantidade da tomada. Nunca assume 1: sem leitura segura, devolve undefined. */
export function quantidadeDaPosologia(poso: string): number | undefined {
  const t = norm(poso);
  const formas = "(?:doses?|capsulas?|comprimidos?|sache?s?|gotas?|ampolas?|puffs?|sprays?|pellets?|unidades?)";
  const m = new RegExp(`(?<![\\p{L}\\d.,])(\\d+(?:[.,]\\d+)?|${Object.keys(NUMERO_POR_EXTENSO).join("|")})\\s+${formas}\\b`, "u").exec(t);
  if (m) {
    const bruto = m[1];
    return NUMERO_POR_EXTENSO[bruto] ?? Number(bruto.replace(",", "."));
  }
  // Sem a palavra da forma: aceita a leitura do primo só se NÃO for tempo ("30 minutos").
  const q = parsePosologia(poso).quantidade;
  if (q !== undefined && !/^\s*\d+(?:[.,]\d+)?\s*(min|minutos?|h|horas?)\b/.test(t)) return q;
  return undefined;
}

function textoQuantidade(qtd: number): string {
  const num = String(qtd).replace(".", ",");
  return `${num} ${qtd <= 1 ? "dose" : "doses"}`;
}

/** Linha da posologia: "1 dose, via oral, antes do jantar" + alertas de dúvida. */
export function linhaPosologia(poso: string, viaRaw: string): { linha: string; alertas: string[] } {
  const alertas: string[] = [];
  const p = parsePosologia(poso);

  const qtd = quantidadeDaPosologia(poso);
  if (qtd === undefined) alertas.push("quantidade da posologia nao lida");
  if (qtd !== undefined && qtd <= 0) alertas.push("quantidade da posologia igual a zero");

  const t = norm(poso);
  if (/\ba cada\b|\d+\s*x\b|\bvezes\b|dias alternados|\bsemana|\bmensal|\bpor dia\b/.test(t)) {
    alertas.push("frequencia da posologia nao e representada no lembrete");
  }

  const via = parsePosologia(viaRaw).via ?? p.via;
  if (!via && viaRaw.trim()) alertas.push("via de administracao nao reconhecida");

  const momento = momentoDaPosologia(poso);
  alertas.push(...momento.alertas);

  const partes: string[] = [];
  if (qtd !== undefined) partes.push(textoQuantidade(qtd));
  if (via) partes.push(VIA_LABEL[via]);
  if (momento.texto) partes.push(momento.texto);
  return { linha: partes.join(", "), alertas };
}
