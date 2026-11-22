/**
 * REFERÊNCIAS DA AJUDA ("?") DA ANTROPOMETRIA — fonte única.
 * Regra completa: specs/regra-ajuda-antropometria-referencias.md
 * Toda ajuda "?" deve listar as referências nacionais e internacionais mais importantes e a mais
 * recente de cada lado, explicar as faixas do gráfico e dizer o que a tela NÃO faz.
 * Ao incluir fonte nova, conferir o endereço aberto e preencher `conferidoEm`.
 */
export type Referencia = {
  id: string;
  ambito: "nacional" | "internacional";
  titulo: string;
  orgao: string;
  ano: string;
  paraQue: string;
  url: string;
  /** Medidas em que a fonte se aplica (chaves das métricas da antropometria). */
  medidas: ("imc" | "peso" | "rcq" | "rce" | "circunferencia" | "tecnica")[];
  maisRecente?: boolean;
};

export const CONFERIDO_EM = "22/11/2026";

export const REFERENCIAS_ANTROPOMETRIA: Referencia[] = [
  // ---- Nacionais ----
  {
    id: "diretriz-conjunta-2025", ambito: "nacional", maisRecente: true,
    titulo: "Diretriz para tratamento da obesidade e prevenção de doença cardiovascular (edição 2026)",
    orgao: "ABESO, SBD, SBEM, SBC e ABS (diretriz conjunta)", ano: "2025/2026",
    paraQue: "Condutas atuais no Brasil para obesidade e risco cardiovascular.",
    url: "https://diretriz.diabetes.org.br/diretriz-para-tratamento-da-obesidade-e-prevencao-de-doenca-cardiovascular-2",
    medidas: ["imc", "peso", "circunferencia", "rcq", "rce"],
  },
  {
    id: "abeso-2016", ambito: "nacional",
    titulo: "Diretrizes Brasileiras de Obesidade (4ª edição)",
    orgao: "ABESO", ano: "2016",
    paraQue: "Diagnóstico da obesidade pelo índice de massa corporal e pela circunferência abdominal.",
    url: "https://abeso.org.br/wp-content/uploads/2019/12/Diretrizes-Download-Diretrizes-Brasileiras-de-Obesidade-2016.pdf",
    medidas: ["imc", "peso", "circunferencia", "rcq"],
  },
  {
    id: "abeso-sbem-2022", ambito: "nacional",
    titulo: "Classificação da obesidade pela trajetória do peso (obesidade reduzida e controlada)",
    orgao: "ABESO e SBEM", ano: "2022",
    paraQue: "Complementa o índice de massa corporal: avalia a perda sobre o maior peso da vida. Não substitui as classificações anteriores.",
    url: "https://abeso.org.br/nossa-proposta-de-uma-nova-maneira-de-classificar-a-obesidade",
    medidas: ["imc", "peso"],
  },
  {
    id: "sisvan-2011", ambito: "nacional",
    titulo: "Orientações para a coleta e análise de dados antropométricos em serviços de saúde (SISVAN)",
    orgao: "Ministério da Saúde", ano: "2011",
    paraQue: "Técnica de medição e classificação oficial do SUS, inclusive pontos de corte próprios para idosos.",
    url: "https://www.gov.br/saude/pt-br/composicao/saps/vigilancia-alimentar-e-nutricional/arquivos/orientacoes-para-a-coleta-e-analise-de-dados-antropometricos-em-servicos-de-saude",
    medidas: ["imc", "peso", "circunferencia", "tecnica"],
  },
  // ---- Internacionais ----
  {
    id: "lancet-2025", ambito: "internacional", maisRecente: true,
    titulo: "Definition and diagnostic criteria of clinical obesity",
    orgao: "Lancet Diabetes & Endocrinology Commission", ano: "2025 (14/01/2025)",
    paraQue: "O índice de massa corporal sozinho não basta para diagnosticar: combinar com medidas de cintura e avaliação clínica.",
    url: "https://www.thelancet.com/commissions/clinical-obesity",
    medidas: ["imc", "peso", "circunferencia", "rcq", "rce"],
  },
  {
    id: "nice-ng246", ambito: "internacional",
    titulo: "Overweight and obesity management (NG246)",
    orgao: "NICE (Reino Unido)", ano: "2025 (atualizada em 08/01/2026)",
    paraQue: "Uso do índice de massa corporal com a relação cintura/estatura e cuidados com grupos étnicos de maior risco em índice mais baixo.",
    url: "https://www.nice.org.uk/guidance/ng246/chapter/identifying-and-assessing-overweight-obesity-and-central-adiposity",
    medidas: ["imc", "peso", "rce", "circunferencia"],
  },
  {
    id: "health-canada", ambito: "internacional",
    titulo: "Canadian Guidelines for Body Weight Classification in Adults",
    orgao: "Health Canada (alinhada à OMS)", ano: "vigente",
    paraQue: "Fonte das faixas de índice de massa corporal usadas no gráfico.",
    url: "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/healthy-weights/canadian-guidelines-body-weight-classification-adults/quick-reference-tool-professionals.html",
    medidas: ["imc", "peso"],
  },
  {
    id: "oms-2008", ambito: "internacional",
    titulo: "Waist Circumference and Waist–Hip Ratio: Report of a WHO Expert Consultation",
    orgao: "Organização Mundial da Saúde", ano: "2008 (consulta); publicado em 2011",
    paraQue: "Como medir a cintura e o quadril e quais pontos de corte de cintura e relação cintura/quadril indicam risco.",
    url: "https://www.who.int/publications/i/item/9789241501491",
    medidas: ["circunferencia", "rcq", "tecnica"],
  },
  {
    id: "oms-2000", ambito: "internacional",
    titulo: "Obesity: Preventing and Managing the Global Epidemic (Série de Relatórios Técnicos 894)",
    orgao: "Organização Mundial da Saúde", ano: "2000",
    paraQue: "Origem das faixas de índice de massa corporal para adultos (18,5; 25; 30; 35; 40).",
    url: "https://iris.who.int/bitstream/handle/10665/42330/WHO_TRS_894.pdf",
    medidas: ["imc", "peso"],
  },
];

export type MedidaAjuda = Referencia["medidas"][number];

export function referenciasDaMedida(medida: MedidaAjuda) {
  const lista = REFERENCIAS_ANTROPOMETRIA.filter((r) => r.medidas.includes(medida));
  return {
    nacionais: lista.filter((r) => r.ambito === "nacional"),
    internacionais: lista.filter((r) => r.ambito === "internacional"),
  };
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
