// Documento de AMOSTRA do e-mail/mensagem Paxter. Fonte ÚNICA usada tanto pela
// rota de pré-visualização (GET /api/brand/email-preview) quanto pelo envio de
// teste — assim o que o CEO vê no link é EXATAMENTE o que chega na caixa.
// Dados fictícios, apenas para validar o layout (Art. 68: dado real antes de
// fixture não se aplica aqui — é amostra declarada de layout).
import type { PaxterDoc } from "./types";
import { blocoCartoesSubstancias } from "./substance-cards";

export function docAmostraBoasVindas(): PaxterDoc {
  // Cartões de substância (layout v2): nome COM dose (só miligrama, sem "/ ml"),
  // sessões + frequência, e a pílula de status. Cenário pós-sessão para o CEO
  // conferir as duas pílulas (Aplicado / Não aplicado).
  const cartoes = blocoCartoesSubstancias([
    {
      nomeComDose: "Tirzepatida 5 mg",
      sessoesFrequencia: "Sessão 4 de 12 · a cada 7 dias",
      status: "applied",
      cor: "#45B8CC",
    },
    {
      nomeComDose: "Coenzima Q10 100 mg",
      sessoesFrequencia: "Sessão 2 de 4 · a cada 15 dias",
      status: "applied",
      cor: "#e8cf95",
    },
    {
      nomeComDose: "Testosterona Bioidêntica 200 mg",
      sessoesFrequencia: "Sessão 3 de 8 · a cada 7 dias",
      status: "applied",
      cor: "#7c9cf0",
    },
    {
      nomeComDose: "Vitamina B12 (Cianocobalamina) 2.500 mcg",
      sessoesFrequencia: "Sessão 1 de 6 · a cada 30 dias",
      status: "notApplied",
      cor: "#34d399",
    },
  ]);

  return {
    eyebrow: "Olá, Caio",
    titulo: "Sessão concluída",
    paragrafos: [
      "Este é um e-mail de amostra para você conferir o padrão visual PAXTER.",
      "A cada etapa do tratamento (boas-vindas, lembrete pré-sessão, confirmação pós-sessão e documentos), você receberá uma mensagem como esta — com a mesma identidade no e-mail, no WhatsApp e no Telegram.",
      "Abaixo, as substâncias da sessão em cartões:",
    ],
    blocosHtml: [cartoes],
    botao: { label: "Acessar minha área", url: "https://app.paxter.exemplo/area" },
    notaRodape: "Mensagem de AMOSTRA — dados fictícios, apenas para validação do layout.",
    assunto: "PAXTER | Amostra do padrão de e-mail",
  };
}
