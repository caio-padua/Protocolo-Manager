/**
 * Linha do tempo mostrada ao cliente em cada pedido médico.
 * O cliente vê SEMPRE os mesmos cinco passos, com a validação médica ligada ou desligada:
 * nunca informamos se houve avaliação manual ou automática (a responsabilidade é do médico).
 */
export type EtapaPedido = { chave: string; rotulo: string; estado: "feito" | "atual" | "pendente" };

const ROTULOS: Array<[string, string]> = [
  ["recebida", "Solicitação recebida"],
  ["aguardando", "Solicitação aguardando análise"],
  ["analisada", "Solicitação analisada"],
  ["liberada", "Solicitação liberada"],
  ["encaminhada", "Solicitação encaminhada"],
];

export function linhaDoTempoPedido(r: { status: string; doc_send_status?: string | null }): EtapaPedido[] | null {
  if (r.status === "recusado" || r.status === "cancelado") return null;
  let atual: number; // índice da etapa corrente; tudo antes dela está feito
  if (r.status === "aguardando_pagamento") atual = 0;
  else if (r.status === "pago" || r.status === "em_analise") atual = 1;
  else if (r.status === "emitido") atual = r.doc_send_status === "enviado" ? 5 : 4;
  else atual = 0;
  return ROTULOS.map(([chave, rotulo], i) => ({
    chave, rotulo, estado: i < atual ? "feito" : i === atual ? "atual" : "pendente",
  }));
}

/** Previsão em texto simples. Não promete assinatura automática: só o prazo esperado. */
export function previsaoPedido(p: { status: string; isento: boolean; validacaoAtiva: boolean }): string | null {
  if (p.status !== "pago" && p.status !== "em_analise") return null;
  if (!p.validacaoAtiva) return "A previsão é de aproximadamente 10 minutos.";
  return p.isento ? "Como Pax Member, o seu pedido tem preferência. A previsão é de poucas horas." : "A previsão é de até 12 horas.";
}

export const MENSAGEM_PAX_MEMBER =
  "Como Pax Member, a sua confiança no nosso trabalho tem valor. Por isso o seu pedido tem preferência na avaliação médica.";
export const CONVITE_PAX_MEMBER =
  "Quer ter preferência nos próximos pedidos? Aproveite a oportunidade de se tornar Pax Member.";
