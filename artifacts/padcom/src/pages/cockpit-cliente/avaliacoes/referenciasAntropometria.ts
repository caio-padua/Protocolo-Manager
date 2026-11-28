/**
 * REFERÊNCIAS DA AJUDA ("?") DA ANTROPOMETRIA — fonte única.
 * Molde: skill-layout-paxter/references/botao-ajuda-interrogacao.md (cópia do "?" do Pulso Diário).
 * Regra de conteúdo: specs/regra-ajuda-antropometria-referencias.md
 */
import type { Referencia as ReferenciaCartao } from "../pulso-referencias";

/** Mesmo formato dos cartões do Pulso Diário (origem, título, autores, revista, link, serve) + medidas em que vale. */
export type Referencia = ReferenciaCartao & { medidas: MedidaAjuda[] };
export type MedidaAjuda = "imc" | "peso" | "rcq" | "rce" | "circunferencia" | "tecnica";

export const CONFERIDO_EM = "22/11/2026";

export const REFERENCIAS_ANTROPOMETRIA: Referencia[] = [
  { origem: "Nacional", titulo: "Diretriz para tratamento da obesidade e prevenção de doença cardiovascular (edição 2026)",
    autores: "ABESO, SBD, SBEM, SBC e ABS (diretriz conjunta)", revista: "Diretriz da Sociedade Brasileira de Diabetes, edição 2026",
    link: "https://diretriz.diabetes.org.br/diretriz-para-tratamento-da-obesidade-e-prevencao-de-doenca-cardiovascular-2",
    serve: "Mais recente no Brasil: condutas para obesidade e risco cardiovascular.", medidas: ["imc", "peso", "circunferencia", "rcq", "rce"] },
  { origem: "Nacional", titulo: "Diretrizes Brasileiras de Obesidade (4ª edição)",
    autores: "ABESO", revista: "ABESO. 2016",
    link: "https://abeso.org.br/wp-content/uploads/2019/12/Diretrizes-Download-Diretrizes-Brasileiras-de-Obesidade-2016.pdf",
    serve: "Diagnóstico da obesidade pelo índice de massa corporal e pela circunferência abdominal.", medidas: ["imc", "peso", "circunferencia", "rcq"] },
  { origem: "Nacional", titulo: "Classificação da obesidade pela trajetória do peso",
    autores: "ABESO e SBEM", revista: "ABESO. 2022",
    link: "https://abeso.org.br/nossa-proposta-de-uma-nova-maneira-de-classificar-a-obesidade",
    serve: "Complementa o índice de massa corporal; não substitui as classificações anteriores.", medidas: ["imc", "peso"] },
  { origem: "Nacional", titulo: "Orientações para a coleta e análise de dados antropométricos em serviços de saúde (SISVAN)",
    autores: "Ministério da Saúde", revista: "Ministério da Saúde. 2011",
    link: "https://www.gov.br/saude/pt-br/composicao/saps/vigilancia-alimentar-e-nutricional/arquivos/orientacoes-para-a-coleta-e-analise-de-dados-antropometricos-em-servicos-de-saude",
    serve: "Técnica de medição e classificação do SUS, com pontos de corte próprios para idosos.", medidas: ["imc", "peso", "circunferencia", "tecnica"] },
  { origem: "Internacional", titulo: "Definition and diagnostic criteria of clinical obesity",
    autores: "Rubino F, Cummings DE, Eckel RH, et al.", revista: "The Lancet Diabetes & Endocrinology. 2025 (14/01/2025)",
    link: "https://pubmed.ncbi.nlm.nih.gov/39824205",
    serve: "Mais recente: o índice de massa corporal sozinho não basta; combinar com cintura e avaliação clínica.", medidas: ["imc", "peso", "circunferencia", "rcq", "rce"] },
  { origem: "Internacional", titulo: "Overweight and obesity management (NG246)",
    autores: "NICE (Reino Unido)", revista: "NICE. 2025, atualizada em 08/01/2026",
    link: "https://www.nice.org.uk/guidance/ng246/chapter/identifying-and-assessing-overweight-obesity-and-central-adiposity",
    serve: "Uso do índice de massa corporal com a relação cintura/estatura.", medidas: ["imc", "peso", "rce", "circunferencia"] },
  { origem: "Internacional", titulo: "Canadian Guidelines for Body Weight Classification in Adults",
    autores: "Health Canada (alinhada à OMS)", revista: "Health Canada. Vigente",
    link: "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/healthy-weights/canadian-guidelines-body-weight-classification-adults/quick-reference-tool-professionals.html",
    serve: "Fonte das faixas de índice de massa corporal usadas no gráfico.", medidas: ["imc", "peso"] },
  { origem: "Internacional", titulo: "Waist Circumference and Waist–Hip Ratio: Report of a WHO Expert Consultation",
    autores: "Organização Mundial da Saúde", revista: "OMS. Consulta de 2008, publicada em 2011",
    link: "https://www.who.int/publications/i/item/9789241501491",
    serve: "Como medir cintura e quadril e como interpretar o risco.", medidas: ["circunferencia", "rcq", "tecnica"] },
  { origem: "Internacional", titulo: "Obesity: Preventing and Managing the Global Epidemic (Relatório Técnico 894)",
    autores: "Organização Mundial da Saúde", revista: "OMS. 2000",
    link: "https://iris.who.int/bitstream/handle/10665/42330/WHO_TRS_894.pdf",
    serve: "Origem das faixas de índice de massa corporal para adultos.", medidas: ["imc", "peso"] },
];

export function referenciasDaMedida(medida: MedidaAjuda): Referencia[] {
  return REFERENCIAS_ANTROPOMETRIA.filter((r) => r.medidas.includes(medida));
}

/** Qual conjunto de referências vale para a métrica aberta no gráfico. */
export function medidaDaMetrica(key: string): MedidaAjuda {
  if (key === "imc") return "imc";
  if (key === "peso") return "peso";
  if (key === "rcq") return "rcq";
  if (key === "rce") return "rce";
  if (/^c[A-Z]/.test(key)) return "circunferencia";
  return "tecnica";
}
