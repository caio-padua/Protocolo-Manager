// Templates de mensagem do LEMBRETE POR PERÍODO (portado do IHE, nativo).
// Rodapé de marca PAXTER (não "PAWARDS/Instituto Padua" — isso é do primo IHE).
//
// A saudação varia por hora (bom dia/boa tarde/boa noite) e por gênero
// (Sr./Sra.). O Manager NÃO guarda gênero do cliente hoje, então o tratamento
// cai no primeiro nome (sem Sr./Sra.) — comportamento esperado.
import type { LembretePeriodoJson } from "@workspace/db";
import { semAcento } from "@workspace/posologia";

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
  const cumprimento = cumprimentoPorHora(agora.getHours());
  const tratamento = tratamentoPorGenero(genero, nome);
  return `${cumprimento}\n\n${tratamento}, tudo bem?`;
}

// Só a listagem de PERÍODOS/FÓRMULAS (sem saudação nem rodapé). Reutilizado pelo
// template simples E pelo montador rico (Mensageria Opus), que injeta este bloco
// no lugar do placeholder {BLOCO_PRESCRICAO}.
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
      linhas.push(`${cor} *${formula.nome}*`);
      if (formula.ativoPrincipal) {
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
  linhas.push("PAXTER — Padcon Conect");

  // Funil de normalização (regra do CEO, 09/07/2026): mensagem inteira SEM acento.
  return semAcento(linhas.join("\n"));
}
