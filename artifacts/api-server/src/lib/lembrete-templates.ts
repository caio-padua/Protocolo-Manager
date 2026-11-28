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
// legenda | espaço | nome (esquerda, cortado com "...") | dose (direita).
const LARGURA_LINHA = 27;
const LARGURA_NOME_MINIMA = 8;

type LinhaSubs = { rotulo: string; nome: string; dose?: string };

/**
 * Linhas alinhadas: legenda | nome à esquerda | dose à direita, sempre com LARGURA_LINHA
 * caracteres. Nome longo usa TODO o espaço até a dose e termina em "..." seguido de UM
 * espaço (a folga entre nome cortado e dose é de um caractere).
 */
export function linhasSubstancias(entrada: LinhaSubs[]): string[] {
  // Dentro do bloco de código só a crase é perigosa (fecharia o bloco).
  const semCrase = (t: string) => t.replace(/`/g, "");
  const subs = entrada.map((s) => ({ rotulo: semCrase(s.rotulo), nome: semCrase(s.nome), dose: s.dose ? semCrase(s.dose) : "" }));
  const rot = Math.max(...subs.map((s) => s.rotulo.length));
  return subs.map((s) => {
    const cabe = Math.max(LARGURA_NOME_MINIMA, LARGURA_LINHA - rot - 1 - 1 - s.dose.length);
    const nome = s.nome.length <= cabe ? s.nome : `${s.nome.slice(0, cabe - 3).trimEnd()}...`;
    const esquerda = `${s.rotulo.padEnd(rot)} ${nome}`;
    const folga = Math.max(1, LARGURA_LINHA - esquerda.length - s.dose.length);
    return `${esquerda}${" ".repeat(folga)}${s.dose}`;
  });
}

/**
 * Posologia em linhas de no máximo LARGURA_LINHA caracteres. Parte na vírgula
 * ("1 dose, via oral, antes do jantar") e junta partes enquanto couberem; parte que
 * sozinha passa da largura quebra por palavra. Quebras já existentes são respeitadas.
 */
export function linhasPosologia(texto: string): string[] {
  const saida: string[] = [];
  for (const bloco of texto.replace(/`/g, "").split("\n")) {
    const partes = bloco.split(/,\s+/).map((p) => p.trim()).filter(Boolean);
    let atual = "";
    const fecha = () => { if (atual) saida.push(atual); atual = ""; };
    for (const parte of partes) {
      if (parte.length > LARGURA_LINHA) {
        // Quebra equilibrada: nº mínimo de linhas e largura-alvo igual entre elas
        // ("30 minutos antes" / "do cafe da manha", nunca "...da" / "manha").
        fecha();
        const n = Math.ceil(parte.length / LARGURA_LINHA);
        const alvo = Math.ceil(parte.length / n);
        let linha = "";
        for (const palavra of parte.split(/\s+/)) {
          const tenta = linha ? `${linha} ${palavra}` : palavra;
          if (linha && tenta.length > alvo) { saida.push(linha); linha = palavra; } else linha = tenta;
        }
        atual = linha;
        continue;
      }
      const tenta = atual ? `${atual}, ${parte}` : parte;
      if (tenta.length > LARGURA_LINHA) { fecha(); atual = parte; } else atual = tenta;
    }
    fecha();
  }
  return saida;
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
        // UM único bloco de código (substâncias + horário + posologia): dois blocos seguidos
        // faziam o WhatsApp abrir um vão grande entre eles.
        const bloco = linhasSubstancias(formula.substancias.slice(0, 3));
        const tecnico: string[] = [];
        if (formula.horario) tecnico.push(`Horario: ${formula.horario.replace(/`/g, "")}`);
        if (formula.posologia) tecnico.push("Posologia:", ...linhasPosologia(formula.posologia));
        if (tecnico.length) bloco.push("", ...tecnico);
        linhas.push("```", ...bloco, "```");
        if (formula.observacaoRefeicao) linhas.push(colarUnidades(limparTextoMensagem(formula.observacaoRefeicao)));
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
