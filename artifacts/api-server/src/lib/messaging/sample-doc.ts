// Documento de AMOSTRA do e-mail/mensagem Paxter. Fonte ÚNICA usada tanto pela
// rota de pré-visualização (GET /api/brand/email-preview) quanto pelo envio de
// teste (POST /api/brand/email-test) — assim o que o CEO vê no link é EXATAMENTE
// o que chega na caixa.
// Dados fictícios, apenas para validar o layout (Art. 68: dado real antes de
// fixture não se aplica aqui — é amostra declarada de layout).
import type { PaxterDoc } from "./types";
import { blocoTabelaSubstancias } from "./substance-table";

export function docAmostraBoasVindas(): PaxterDoc {
  // Cartões de substância (layout aprovado pelo CEO em 30/06/2026): cada
  // substância num cartão, com as informações ALINHADAS por uma linha vertical
  // imaginária — nome + Dose (só miligramagem) na linha 1; Sessão + Frequência
  // na linha 2. A dose entra CRUA com "/ 2 ml" de propósito, para o CEO conferir
  // que o motor mantém só a miligramagem ("5 mg / 2 ml" -> "5 mg").
  const tabela = blocoTabelaSubstancias([
    {
      nome: "Tirzepatida",
      dose: "5 mg / 2 ml",
      sessao: "4/12",
      frequencia: "a cada 7 dias",
      status: "applied",
      cor: "#45B8CC",
    },
    {
      nome: "Coenzima Q10",
      dose: "100 mg / 2 ml",
      sessao: "2/4",
      frequencia: "a cada 15 dias",
      status: "applied",
      cor: "#e8cf95",
    },
    {
      nome: "Testosterona Bioidêntica",
      dose: "200 mg / 1 ml",
      sessao: "3/8",
      frequencia: "a cada 7 dias",
      status: "applied",
      cor: "#7c9cf0",
    },
    {
      nome: "Vitamina B12 (Cianocobalamina)",
      dose: "2.500 mcg / 1 ml",
      sessao: "1/6",
      frequencia: "a cada 30 dias",
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
      "Abaixo, as substâncias da sessão em cartões com as informações alinhadas:",
    ],
    blocosHtml: [tabela],
    botao: { label: "Acessar minha área", url: "https://app.paxter.exemplo/area" },
    notaRodape: "Mensagem de AMOSTRA — dados fictícios, apenas para validação do layout.",
    assunto: "PAXTER | Amostra do padrão de e-mail",
  };
}
