/**
 * Catálogo tributário do PAX FINANCE: valores e explicações em português simples, cada um com a fonte oficial
 * (lei no Planalto ou página do órgão) lida em 21/11/2026. Conferência humana DISPENSADA pelo CEO nesta etapa
 * (21/11/2026): os valores são utilizáveis, mas continuam marcados como "a conferir".
 * Nada aqui é apuração oficial: a tela calcula SIMULAÇÃO.
 */
export const CONSULTADO_EM = "2026-11-21";
export const CONFERENCIA = "Fonte oficial lida em 21/11/2026. Conferência humana dispensada pelo CEO nesta etapa; fica pendente.";

export const FONTES = {
  lc123: { nome: "Lei Complementar 123/2006 (Simples Nacional), Anexos III e V, texto atual", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm" },
  l9249: { nome: "Lei 9.249/1995, arts. 3º, 15 e 20 (IRPJ, presunção e CSLL no lucro presumido)", url: "https://www.planalto.gov.br/ccivil_03/leis/l9249.htm" },
  lc224: { nome: "Lei Complementar 224/2025, art. 4º, §§ 4º e 5º (acréscimo de 10% na presunção acima de R$ 5 milhões)", url: "https://www.planalto.gov.br/ccivil_03/Leis/LCP/Lcp224.htm" },
  l7689: { nome: "Lei 7.689/1988, art. 3º (CSLL 9%)", url: "https://www.planalto.gov.br/ccivil_03/leis/l7689.htm" },
  l9715: { nome: "Lei 9.715/1998, art. 8º (PIS 0,65%)", url: "https://www.planalto.gov.br/ccivil_03/leis/l9715.htm" },
  l9718: { nome: "Lei 9.718/1998, art. 8º (COFINS 3%)", url: "https://www.planalto.gov.br/ccivil_03/leis/l9718.htm" },
  l10637: { nome: "Lei 10.637/2002, art. 2º (PIS não cumulativo 1,65%)", url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10637.htm" },
  l10833: { nome: "Lei 10.833/2003, art. 2º (COFINS não cumulativa 7,6%)", url: "https://www.planalto.gov.br/ccivil_03/leis/2003/l10.833.htm" },
  lc116: { nome: "Lei Complementar 116/2003, arts. 8º e 8º-A e item 4.01 da lista (ISS entre 2% e 5%; medicina)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm" },
  lc214: { nome: "Lei Complementar 214/2025, arts. 130, 343, 346 e 348 (CBS 0,9% e IBS 0,1% em 2026; saúde com redução de 60%)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm" },
  l15270: { nome: "Lei 15.270/2025, art. 6º-A e art. 3º-A (dividendos acima de R$ 50 mil/mês; redução do IRPF)", url: "https://www.planalto.gov.br/CCivil_03/_Ato2023-2026/2025/Lei/L15270.htm" },
  inss: { nome: "INSS, tabela de contribuição mensal a partir de janeiro de 2026", url: "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal/tabela-de-contribuicao-mensal" },
  irrf: { nome: "Receita Federal, tabela do imposto de renda de 2026 (incidência mensal)", url: "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026" },
  prevPj: { nome: "Receita Federal, contribuições previdenciárias de pessoas jurídicas (20%, RAT, terceiros)", url: "https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/contribuicoes-previdenciarias-pj" },
  fgts: { nome: "CAIXA, FGTS: empregador deposita 8% do salário", url: "http://www.caixa.gov.br/beneficios-trabalhador/fgts/Paginas/default.aspx" },
} as const;
export type FonteKey = keyof typeof FONTES;

/** Valores numéricos lidos nas fontes (percentuais em %, dinheiro em reais). */
export const VALORES = {
  simples: {
    // faixa: teto do RBT12 (reais), alíquota nominal %, parcela a deduzir (reais)
    anexoIII: [
      { ate: 180000, aliq: 6.0, pd: 0 }, { ate: 360000, aliq: 11.2, pd: 9360 }, { ate: 720000, aliq: 13.5, pd: 17640 },
      { ate: 1800000, aliq: 16.0, pd: 35640 }, { ate: 3600000, aliq: 21.0, pd: 125640 }, { ate: 4800000, aliq: 33.0, pd: 648000 },
    ],
    anexoV: [
      { ate: 180000, aliq: 15.5, pd: 0 }, { ate: 360000, aliq: 18.0, pd: 4500 }, { ate: 720000, aliq: 19.5, pd: 9900 },
      { ate: 1800000, aliq: 20.5, pd: 17100 }, { ate: 3600000, aliq: 23.0, pd: 62100 }, { ate: 4800000, aliq: 30.5, pd: 540000 },
    ],
    // repartição por faixa: IRPJ, CSLL, COFINS, PIS, CPP, ISS (% do valor do DAS)
    reparticaoIII: [
      [4, 3.5, 12.82, 2.78, 43.4, 33.5], [4, 3.5, 14.05, 3.05, 43.4, 32.0], [4, 3.5, 13.64, 2.96, 43.4, 32.5],
      [4, 3.5, 13.64, 2.96, 43.4, 32.5], [4, 3.5, 12.82, 2.78, 43.4, 33.5], [35, 15, 16.03, 3.47, 30.5, 0],
    ],
    reparticaoV: [
      [25, 15, 14.1, 3.05, 28.85, 14], [23, 15, 14.1, 3.05, 27.85, 17], [24, 15, 14.92, 3.23, 23.85, 19],
      [21, 15, 15.74, 3.41, 23.85, 21], [23, 12.5, 14.1, 3.05, 23.85, 23.5], [35, 15.5, 16.44, 3.56, 29.5, 0],
    ],
    iss5Limite: 14.92537, iss5Repart: [6.02, 5.26, 19.28, 4.18, 65.26], // Anexo III, faixa 5, quando a alíquota efetiva passa de 14,92537%
    fatorRPct: 28, limiteEPP: 4800000, limiteME: 360000, sublimite: 3600000,
  },
  presumido: { presuncaoServicos: 32, presuncaoHospitalar: 8, csllServicos: 32, csllHospitalar: 12, irpj: 15, adicional: 10, adicionalLimiteMensal: 20000, csll: 9, pis: 0.65, cofins: 3, acrescimoLc224: 10, acrescimoLc224Limite: 5000000 },
  real: { pis: 1.65, cofins: 7.6, irpj: 15, adicional: 10, adicionalLimiteMensal: 20000, csll: 9 },
  iss: { minimo: 2, maximo: 5 },
  reforma2026: { cbs: 0.9, ibs: 0.1 },
  folha: { patronal: 20, fgts: 8 },
  inss: { aliquotaSocio: 11, teto: 8475.55, salarioMinimo: 1621 },
  irrf: {
    faixas: [
      { ate: 2428.8, aliq: 0, ded: 0 }, { ate: 2826.65, aliq: 7.5, ded: 182.16 }, { ate: 3751.05, aliq: 15, ded: 394.16 },
      { ate: 4664.68, aliq: 22.5, ded: 675.49 }, { ate: Infinity, aliq: 27.5, ded: 908.73 },
    ],
    simplificada: 607.2, reducaoAte5000: 312.89, reducaoA: 978.62, reducaoB: 0.133145, limiteIsento: 5000, limiteReducao: 7350,
  },
  dividendos: { limiteMensal: 50000, aliquota: 10 },
} as const;

export interface Explicacao { nome: string; sigla: string; oQueE: string; quemPaga: string; comoCalcula: string; fontes: FonteKey[]; }

/** Explicações em português simples. A chave é a mesma usada nas linhas do painel. */
export const EXPLICACOES: Record<string, Explicacao> = {
  DAS: { nome: "Documento de Arrecadação do Simples Nacional", sigla: "DAS", oQueE: "Uma única guia mensal que junta vários impostos (IRPJ, CSLL, COFINS, PIS, INSS da empresa e ISS). Quem escolhe o Simples paga só ela.", quemPaga: "A empresa, todo mês.", comoCalcula: "Faturamento do mês x alíquota efetiva. A alíquota efetiva vem da faixa da receita dos últimos 12 meses (RBT12).", fontes: ["lc123"] },
  SIMPLES_IRPJ: { nome: "Imposto de Renda da Pessoa Jurídica dentro do DAS", sigla: "IRPJ", oQueE: "Imposto federal sobre o lucro da empresa. No Simples ele já vem embutido na guia única.", quemPaga: "A empresa (dentro do DAS).", comoCalcula: "Parcela do DAS definida na tabela de repartição do Anexo.", fontes: ["lc123"] },
  SIMPLES_CSLL: { nome: "Contribuição Social sobre o Lucro Líquido dentro do DAS", sigla: "CSLL", oQueE: "Contribuição federal que financia a seguridade social, calculada sobre o lucro. No Simples vem dentro do DAS.", quemPaga: "A empresa (dentro do DAS).", comoCalcula: "Parcela do DAS definida na tabela de repartição do Anexo.", fontes: ["lc123"] },
  SIMPLES_COFINS: { nome: "Contribuição para o Financiamento da Seguridade Social dentro do DAS", sigla: "COFINS", oQueE: "Contribuição federal sobre o faturamento que financia saúde, previdência e assistência social. No Simples vem dentro do DAS.", quemPaga: "A empresa (dentro do DAS).", comoCalcula: "Parcela do DAS definida na tabela de repartição do Anexo.", fontes: ["lc123"] },
  SIMPLES_PIS: { nome: "Programa de Integração Social dentro do DAS", sigla: "PIS", oQueE: "Contribuição federal sobre o faturamento que financia o seguro-desemprego e o abono salarial. No Simples vem dentro do DAS.", quemPaga: "A empresa (dentro do DAS).", comoCalcula: "Parcela do DAS definida na tabela de repartição do Anexo.", fontes: ["lc123"] },
  SIMPLES_CPP: { nome: "Contribuição Previdenciária Patronal dentro do DAS", sigla: "CPP (INSS da empresa)", oQueE: "É o INSS que a empresa paga sobre a folha de pagamento. Nos Anexos III e V do Simples ele já está dentro do DAS, então não se soma de novo.", quemPaga: "A empresa (dentro do DAS).", comoCalcula: "Parcela do DAS definida na tabela de repartição do Anexo.", fontes: ["lc123"] },
  SIMPLES_ISS: { nome: "Imposto Sobre Serviços dentro do DAS", sigla: "ISS", oQueE: "Imposto municipal cobrado sobre serviços, como consultas e procedimentos médicos (item 4.01 da lista de serviços). No Simples vem dentro do DAS.", quemPaga: "A empresa (dentro do DAS), repassado ao município.", comoCalcula: "Parcela do DAS definida na tabela de repartição do Anexo. Na última faixa (receita acima de R$ 3,6 milhões) o ISS é recolhido fora do DAS.", fontes: ["lc123", "lc116"] },
  IRPJ: { nome: "Imposto de Renda da Pessoa Jurídica", sigla: "IRPJ", oQueE: "Imposto federal sobre o lucro da empresa. No Lucro Presumido o governo supõe um lucro (32% do faturamento para consultas médicas) e cobra 15% sobre ele.", quemPaga: "A empresa.", comoCalcula: "Faturamento x percentual de presunção x 15%.", fontes: ["l9249", "lc224"] },
  IRPJ_ADICIONAL: { nome: "Adicional do Imposto de Renda", sigla: "Adicional de IRPJ", oQueE: "Mais 10% de imposto de renda sobre a parte do lucro que passa de R$ 20.000 por mês (R$ 60.000 por trimestre).", quemPaga: "A empresa, só quando o lucro (presumido ou real) passa do limite.", comoCalcula: "(Lucro do mês - R$ 20.000) x 10%.", fontes: ["l9249"] },
  CSLL: { nome: "Contribuição Social sobre o Lucro Líquido", sigla: "CSLL", oQueE: "Contribuição federal sobre o lucro da empresa. No Lucro Presumido a base também é presumida (32% do faturamento em serviços; 12% em serviços hospitalares) e a alíquota é 9%.", quemPaga: "A empresa.", comoCalcula: "Faturamento x percentual de presunção da CSLL x 9%.", fontes: ["l9249", "l7689"] },
  PIS_CUM: { nome: "Programa de Integração Social (cumulativo)", sigla: "PIS", oQueE: "Contribuição federal sobre o faturamento. No Lucro Presumido é cumulativo: 0,65%, sem desconto de créditos.", quemPaga: "A empresa.", comoCalcula: "Faturamento x 0,65%.", fontes: ["l9715", "l10637"] },
  COFINS_CUM: { nome: "Contribuição para o Financiamento da Seguridade Social (cumulativa)", sigla: "COFINS", oQueE: "Contribuição federal sobre o faturamento. No Lucro Presumido é cumulativa: 3%, sem desconto de créditos.", quemPaga: "A empresa.", comoCalcula: "Faturamento x 3%.", fontes: ["l9718", "l10833"] },
  PIS_NC: { nome: "Programa de Integração Social (não cumulativo)", sigla: "PIS", oQueE: "No Lucro Real o PIS é de 1,65% sobre o faturamento, mas a empresa pode descontar créditos das compras (insumos, aluguel etc.).", quemPaga: "A empresa.", comoCalcula: "Faturamento x 1,65%, sem os créditos (esta tela não conhece suas compras, então mostra o valor bruto, que é o máximo).", fontes: ["l10637"] },
  COFINS_NC: { nome: "Contribuição para o Financiamento da Seguridade Social (não cumulativa)", sigla: "COFINS", oQueE: "No Lucro Real a COFINS é de 7,6% sobre o faturamento, com direito a créditos das compras.", quemPaga: "A empresa.", comoCalcula: "Faturamento x 7,6%, sem os créditos (valor bruto, o máximo).", fontes: ["l10833"] },
  ISS: { nome: "Imposto Sobre Serviços", sigla: "ISS", oQueE: "Imposto do município onde o serviço é prestado. Para medicina (item 4.01) a lei federal fixa o mínimo de 2% e o máximo de 5%; a alíquota exata é da lei do seu município. Algumas prefeituras cobram valor fixo por profissional em sociedades de profissionais: confira com a prefeitura.", quemPaga: "A empresa.", comoCalcula: "Faturamento x alíquota do município (campo que você preenche).", fontes: ["lc116"] },
  CPP: { nome: "Contribuição Previdenciária Patronal", sigla: "INSS patronal", oQueE: "É o INSS que a empresa paga por ter empregados e sócios que recebem pró-labore: 20% sobre a folha e o pró-labore (fora do Simples Anexos III e V).", quemPaga: "A empresa.", comoCalcula: "(Folha + pró-labore) x 20%.", fontes: ["prevPj"] },
  RAT: { nome: "Riscos Ambientais do Trabalho", sigla: "RAT", oQueE: "Adicional de INSS da empresa de 1%, 2% ou 3% sobre a folha, conforme o grau de risco da atividade (ajustado depois pelo FAP). Qual vale para a sua empresa depende do CNAE.", quemPaga: "A empresa.", comoCalcula: "Folha dos empregados x alíquota que você informa (1, 2 ou 3%).", fontes: ["prevPj"] },
  TERCEIROS: { nome: "Contribuições a Terceiros (Sistema S e outras entidades)", sigla: "Terceiros", oQueE: "Contribuições sobre a folha repassadas a entidades como Sesc, Senac, Sebrae e INCRA. A alíquota depende do enquadramento da empresa (FPAS) e não é única.", quemPaga: "A empresa.", comoCalcula: "Folha dos empregados x alíquota do seu enquadramento (campo que você preenche; peça ao contador).", fontes: ["prevPj"] },
  FGTS: { nome: "Fundo de Garantia do Tempo de Serviço", sigla: "FGTS", oQueE: "Depósito mensal de 8% do salário em conta do empregado. Não é imposto, é um direito do trabalhador, mas é custo da folha.", quemPaga: "A empresa, por empregado com carteira assinada. Não incide sobre pró-labore.", comoCalcula: "Folha dos empregados x 8%.", fontes: ["fgts"] },
  CBS_IBS: { nome: "CBS e IBS (reforma tributária, ano de teste 2026)", sigla: "CBS 0,9% + IBS 0,1%", oQueE: "Os novos tributos sobre consumo. Em 2026 são cobrados em alíquota de teste (CBS 0,9% e IBS 0,1%), compensados com PIS e COFINS e dispensados de recolhimento para quem cumprir as obrigações acessórias. Serviços de saúde terão redução de 60% nas alíquotas quando o sistema valer por completo. Optantes do Simples não pagam em 2026.", quemPaga: "Empresas fora do Simples. Em 2026 o valor é compensado, então não soma no total.", comoCalcula: "Faturamento x 1,0% (informativo).", fontes: ["lc214"] },
  INSS_SOCIO: { nome: "INSS do sócio sobre o pró-labore", sigla: "INSS do sócio", oQueE: "O sócio que recebe pró-labore é contribuinte individual: 11% sobre o pró-labore, até o teto de R$ 8.475,55. É descontado do pró-labore e vale para aposentadoria.", quemPaga: "O sócio (pessoa física), descontado do pró-labore.", comoCalcula: "Pró-labore (até o teto) x 11%.", fontes: ["inss"] },
  IRRF_PROLABORE: { nome: "Imposto de Renda retido na fonte sobre o pró-labore", sigla: "IRRF", oQueE: "Imposto de renda do sócio, retido pela empresa no pagamento do pró-labore, pela tabela mensal de 2026 com a redução da Lei 15.270 (zera para quem ganha até R$ 5.000).", quemPaga: "O sócio, retido pela empresa.", comoCalcula: "Tabela progressiva sobre (pró-labore - INSS ou dedução simplificada de R$ 607,20, o que for maior), menos a redução legal.", fontes: ["irrf", "l15270"] },
  IRRF_DIVIDENDOS: { nome: "Imposto de Renda retido sobre lucros e dividendos", sigla: "IRRF sobre dividendos", oQueE: "A partir de 2026, quando uma mesma empresa paga mais de R$ 50.000 por mês de lucros a um mesmo sócio, retém 10% sobre o total pago. Lucros de resultados apurados até 2025 ficam de fora.", quemPaga: "O sócio, retido pela empresa.", comoCalcula: "Se lucros distribuídos no mês > R$ 50.000: total x 10%. Senão: zero.", fontes: ["l15270"] },
};

export const REGIMES_TEXTO = {
  simples: "Simples Nacional: um regime único que reúne vários impostos em uma guia (DAS). Para medicina, o Anexo III vale quando a folha de pagamento é pelo menos 28% da receita (Fator R); abaixo disso vale o Anexo V, mais caro. Limite: receita de até R$ 4,8 milhões por ano.",
  presumido: "Lucro Presumido: o governo presume o lucro (32% do faturamento nas consultas médicas) e cobra os impostos de renda sobre ele; PIS e COFINS são sobre o faturamento. O limite anual de receita deste regime não foi pesquisado nesta etapa.",
  real: "Lucro Real: os impostos de renda incidem sobre o lucro de verdade (faturamento menos despesas dedutíveis). Exige contabilidade completa. Só faz sentido se as despesas forem altas.",
} as const;
