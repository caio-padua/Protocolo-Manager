// Templates de mensagem do LEMBRETE POR PERÍODO (portado do IHE, nativo).
// Rodapé de marca PAXTER (não "PAWARDS/Instituto Padua" — isso é do primo IHE).
//
// A saudação varia por hora (bom dia/boa tarde/boa noite) e por gênero
// (Sr./Sra.). O Manager NÃO guarda gênero do cliente hoje, então o tratamento
// cai no primeiro nome (sem Sr./Sra.) — comportamento esperado.
import type { LembretePeriodoJson } from "@workspace/db";
import { semAcento } from "@workspace/posologia";
import { parseBrtParts } from "./brt";
import { colarUnidades, limparTextoMensagem } from "./dose-substancia";

export type Genero = "masculino" | "feminino" | "outro" | "nao_informado";

export interface LembretePrescricaoDados {
  clienteNome: string;
  clienteGenero?: Genero;
  /** Data/hora do envio (timezone já aplicada). Default: agora. */
  agora?: Date;
  /** Saudação opcional pré-calculada. Se não informada, é calculada por `agora`. */
  saudacao?: string;
  periodos: LembretePeriodoJson[];
}

function primeiroNome(nome: string): string {
  return (nome || "").trim().split(/\s+/)[0] || "";
}

export function cumprimentoPorHora(hora: number): string {
  if (hora >= 5 && hora < 12) return "Bom dia!";
  if (hora >= 12 && hora < 18) return "Boa tarde!";
  return "Boa noite!";
}

export function tratamentoPorGenero(genero: Genero | undefined, nome: string): string {
  const primeiro = primeiroNome(nome);
  switch (genero) {
    case "masculino":
      return `Sr. ${primeiro}`;
    case "feminino":
      return `Sra. ${primeiro}`;
    default:
      return primeiro;
  }
}

export function montarSaudacao(
  nome: string,
  genero: Genero | undefined,
  agora: Date = new Date(),
): string {
  const cumprimento = cumprimentoPorHora(parseInt(parseBrtParts(agora).hour, 10));
  const tratamento = tratamentoPorGenero(genero, nome);
  return `${cumprimento}\n\n${tratamento}, tudo bem?`;
}

// Só a listagem de PERÍODOS/FÓRMULAS (sem saudação nem rodapé). Reutilizado pelo
// template simples E pelo montador rico (Mensageria PAXMED), que injeta este bloco
// no lugar do placeholder {BLOCO_PRESCRICAO}.
// Largura total da linha de substância: 32 caracteres estimados no WhatsApp menos a
// margem de 5 = 27 (estimativa, ainda não medida no aparelho do CEO). Colunas:
// legenda | espaço | nome (esquerda, cortado com "...") | 2 espaços | dose (direita).
const LARGURA_LINHA = 27;
const LARGURA_DOSE_MINIMA = 7;
const LARGURA_NOME_MINIMA = 8;

type LinhaSubs = { rotulo: string; nome: string; dose?: string };

/** Linhas alinhadas em colunas fixas (mesma largura em todas as linhas do bloco). */
export function linhasSubstancias(entrada: LinhaSubs[]): string[] {
  // Dentro do bloco de código só a crase é perigosa (fecharia o bloco).
  const semCrase = (t: string) => t.replace(/`/g, "");
  const subs = entrada.map((s) => ({ rotulo: semCrase(s.rotulo), nome: semCrase(s.nome), dose: s.dose ? semCrase(s.dose) : undefined }));
  const rot = Math.max(...subs.map((s) => s.rotulo.length));
  const dw = Math.max(LARGURA_DOSE_MINIMA, ...subs.map((s) => (s.dose ?? "").length));
  const nw = Math.max(LARGURA_NOME_MINIMA, LARGURA_LINHA - rot - 1 - 2 - dw);
  return subs.map((s) => {
    const nome = s.nome.length <= nw ? s.nome : `${s.nome.slice(0, nw - 3).trimEnd()}...`;
    return `${s.rotulo.padEnd(rot)} ${nome.padEnd(nw)}  ${(s.dose ?? "").padStart(dw)}`;
  });
}

export function blocoPrescricaoPeriodos(periodos: LembretePeriodoJson[]): string {
  const linhas: string[] = [];
  for (const periodo of periodos) {
    if (linhas.length > 0) linhas.push("");
    linhas.push(`⬛ *Período:* _${periodo.nome}_`);

    const cor = periodo.tipo === "tomar" ? "🟩" : "🟨";
    if (periodo.tipo === "tomar") {
      linhas.push(`${cor} *Programado* para administrar:`);
    } else {
      linhas.push(`${cor} *NÃO TOMAR* as fórmulas abaixo:`);
    }

    for (const formula of periodo.formulas) {
      linhas.push("");
      linhas.push(`${cor} *${colarUnidades(limparTextoMensagem(formula.nome))}*`);
      if (formula.substancias?.length) {
        // Layout alinhado (ordem do CEO): legenda n/total, nome à esquerda (cortado com
        // "..."), dose à direita colada à unidade; fonte de largura fixa (crases triplas).
        const corpo = linhasSubstancias(formula.substancias.slice(0, 3));
        linhas.push("```", ...corpo, "```", "");
        const tecnico: string[] = [];
        if (formula.horario) tecnico.push(`Horario: ${formula.horario.replace(/`/g, "")}`);
        if (formula.posologia) tecnico.push("Posologia:", ...formula.posologia.replace(/`/g, "").split("\n"));
        if (tecnico.length) linhas.push("```", ...tecnico, "```");
        if (formula.observacaoRefeicao) linhas.push("", colarUnidades(limparTextoMensagem(formula.observacaoRefeicao)));
        linhas.push("");
        continue;
      }
      if (formula.substancias?.length) {
        for (const s of formula.substancias) {
          linhas.push(`   [${s.rotulo}] ${s.nome}${s.dose ? ` — ${s.dose}` : ""}`);
        }
      } else if (formula.ativoPrincipal) {
        const dose = formula.dose ? ` — ${formula.dose}` : "";
        linhas.push(`   ${formula.ativoPrincipal}${dose}`);
      }
      if (formula.horario) {
        linhas.push(`   Horário: ${formula.horario}`);
      }
      if (formula.observacaoRefeicao) {
        linhas.push(`   ${formula.observacaoRefeicao}`);
      }
      if (formula.posologia) {
        linhas.push(`   Posologia: ${formula.posologia}`);
      }
    }
  }
  return linhas.join("\n");
}

export function templateLembretePrescricao(dados: LembretePrescricaoDados): string {
  const saudacao =
    dados.saudacao ?? montarSaudacao(dados.clienteNome, dados.clienteGenero, dados.agora ?? new Date());

  const bloco = blocoPrescricaoPeriodos(dados.periodos);

  const linhas: string[] = [];
  linhas.push(saudacao);
  linhas.push("");
  linhas.push("Segue o lembrete da sua prescrição personalizada:");
  if (bloco) {
    linhas.push("");
    linhas.push(bloco);
  }
  linhas.push("");
  linhas.push("PaxMed — Padcon Conect");

  // Funil de normalização (regra do CEO, 09/07/2026): mensagem inteira SEM acento.
  return semAcento(linhas.join("\n"));
}
