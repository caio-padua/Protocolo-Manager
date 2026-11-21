import { z } from "zod";
import { CONSULTADO_EM } from "./tributos-catalogo";

/**
 * Condições das linhas de crédito lidas nas páginas oficiais em 21/11/2026.
 * Valor null = a página oficial lida NÃO informa; a tela mostra "—" e o que é preciso para preencher.
 * Conferência humana dispensada pelo CEO nesta etapa: tudo fica marcado "a conferir".
 * Faturamento não garante aprovação: o limite calculado é teto teórico do programa, nunca oferta.
 */
export const CAMPOS_CREDITO = [
  { key: "taxa", rotulo: "Taxa de juros", ajuda: "Custo do dinheiro emprestado. Várias linhas somam a taxa básica Selic (definida pelo Banco Central) a um percentual fixo ao ano." },
  { key: "prazo", rotulo: "Prazo", ajuda: "Tempo total para pagar, incluindo a carência." },
  { key: "carencia", rotulo: "Carência", ajuda: "Período inicial em que ainda não se paga o principal (só juros, ou nada, conforme a linha)." },
  { key: "limite", rotulo: "Limite do programa", ajuda: "Valor máximo que o programa empresta por empresa. O banco pode aprovar menos." },
  { key: "percentual", rotulo: "Limite sobre o faturamento", ajuda: "Parte do faturamento anual que o programa aceita como teto de crédito." },
  { key: "publico", rotulo: "Quem pode contratar", ajuda: "Porte e perfil de empresa aceitos (MEI, microempresa, pequena, média)." },
  { key: "garantias", rotulo: "Garantias", ajuda: "O que o banco pode exigir para cobrir o risco: fundo garantidor, aval dos sócios, bens." },
  { key: "documentos", rotulo: "Documentos", ajuda: "Papéis que a instituição pede para analisar o pedido." },
  { key: "tarifas", rotulo: "Tarifas", ajuda: "Taxas cobradas pela instituição para abrir e administrar a operação, além dos juros." },
  { key: "vigencia", rotulo: "Vigência do programa", ajuda: "Período em que o programa aceita novos contratos." },
] as const;
export type CampoKey = (typeof CAMPOS_CREDITO)[number]["key"];

export interface LinhaPesquisada {
  key: string; nome: string; oQueE: string; finalidade: string;
  campos: Record<CampoKey, string | null>;
  faltaInformar: Partial<Record<CampoKey, string>>; // o que é preciso para preencher cada campo vazio
  percentualPct: number | null; percentualMulheresPct: number | null; tetoCents: number | null; tetoRotulo: string | null;
  fontes: { nome: string; url: string; consultadaEm: string }[];
  conferir: string[];
}
const F = (nome: string, url: string) => ({ nome, url, consultadaEm: CONSULTADO_EM });
const NC = "Não consta na página oficial lida. Consulte a instituição financeira (banco ou cooperativa) onde fará o pedido.";

export const LINHAS_PESQUISADAS: LinhaPesquisada[] = [
  {
    key: "pronampe", nome: "Pronampe", oQueE: "Programa federal de crédito para micro e pequenas empresas, com garantia do Fundo Garantidor de Operações (FGO).", finalidade: "Capital de giro e investimento",
    campos: { taxa: "Selic + até 6% ao ano (Caixa); Selic + 5,50% ao ano (BDMG)", prazo: "Até 48 meses para capital de giro; até 72 meses para investimento (BDMG)", carencia: "Até 6 meses (Caixa); 3, 6 ou 12 meses conforme a modalidade (BDMG)", limite: "R$ 250.000,00 por CNPJ", percentual: "Até 30% do faturamento anual (valor da Receita Federal)", publico: "MEI (até R$ 81 mil/ano), microempresa (até R$ 360 mil/ano) e empresa de pequeno porte (R$ 360 mil a R$ 4,8 milhões/ano); BDMG exige 12 meses de atividade", garantias: "Garantia do FGO (exigências adicionais não constam na página)", documentos: null, tarifas: null, vigencia: null },
    faltaInformar: { documentos: NC, tarifas: NC, vigencia: "Confirme no banco se o programa está aberto para novas contratações." },
    percentualPct: 30, percentualMulheresPct: null, tetoCents: 25000000, tetoRotulo: "R$ 250.000,00 por CNPJ",
    fontes: [F("CAIXA, Pronampe", "http://www.caixa.gov.br/empresa/credito-financiamento/capital-de-giro/pronampe/Paginas/default.aspx"), F("BDMG, Pronampe 2026 (14/08/2026)", "https://bdmgorienta.bdmg.mg.gov.br/pronampe-2026")],
    conferir: ["Condições variam por banco; a Selic muda com o tempo."],
  },
  {
    key: "procred360", nome: "ProCred 360", oQueE: "Programa federal de crédito para pequenos negócios e MEI, operado por bancos públicos federais.", finalidade: "Capital de giro e investimento",
    campos: { taxa: "Selic + até 5% ao ano", prazo: "Até 48 meses", carencia: "12 meses", limite: "R$ 150.000,00 (CAIXA)", percentual: "Até 30% do faturamento do ano anterior (50% se a empresa for liderada por mulheres)", publico: "MEI e microempresa com faturamento de até R$ 360 mil por ano", garantias: null, documentos: "Documento constitutivo; documento fiscal do último exercício (ECF, DEFIS ou DASN-SIMEI); identificação e comprovante de residência dos sócios (CAIXA)", tarifas: null, vigencia: "Programa permanente (gov.br)" },
    faltaInformar: { garantias: NC, tarifas: NC },
    percentualPct: 30, percentualMulheresPct: 50, tetoCents: 15000000, tetoRotulo: "R$ 150.000,00 (CAIXA)",
    fontes: [F("gov.br, ProCred 360 (10/09/2026)", "https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/procred-360/procred360"), F("CAIXA, ProCred 360", "https://www.caixa.gov.br/empresa/credito-financiamento/capital-de-giro/ProCred360/Paginas/default.aspx")],
    conferir: ["A empresa precisa compartilhar dados fiscais com a Receita (Compartilha Receita); fonte secundária."],
  },
  {
    key: "bndes", nome: "BNDES Crédito Pequenas Empresas", oQueE: "Financiamento do BNDES liberado por bancos credenciados (agentes financeiros) para micro, pequenas e médias empresas.", finalidade: "Capital de giro e investimento (manutenção e geração de empregos)",
    campos: { taxa: "Custo financeiro (TFB, TLP ou similar) + taxa do BNDES de 1,35% ao ano (0,95% no Norte e Nordeste) + taxa do banco agente (negociada)", prazo: "Até 5 anos, incluindo carência", carencia: "Até 2 anos (até 1 ano em TFB ou taxa fixa composta)", limite: "R$ 20 milhões por ano", percentual: null, publico: "Micro, pequenas e médias empresas (receita de até R$ 300 milhões)", garantias: "Livre negociação com o banco; aceita FGI e Fundo Garantidor BNDES-SEBRAE", documentos: "Certidões de regularidade fiscal (CND/CPEND), CRF do FGTS, ITR, RAIS/eSocial", tarifas: null, vigencia: null },
    faltaInformar: { percentual: "A página não limita por percentual do faturamento: o banco define a capacidade de pagamento.", tarifas: NC, vigencia: NC },
    percentualPct: null, percentualMulheresPct: null, tetoCents: 2000000000, tetoRotulo: "R$ 20.000.000,00 por ano",
    fontes: [F("BNDES, Crédito Pequenas e Médias Empresas", "https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-credito-pequenas-e-medias-empresas")],
    conferir: ["A taxa do agente é negociada com cada banco: sem número oficial."],
  },
  {
    key: "cartao_bndes", nome: "Cartão BNDES", oQueE: "Cartão de crédito empresarial do BNDES para comprar bens e serviços de fornecedores credenciados, parcelado.", finalidade: "Compra de bens e serviços credenciados (não é capital de giro)",
    campos: { taxa: "Definida todo mês no Portal de Operações do cartão", prazo: "Até 48 parcelas", carencia: null, limite: "Até R$ 2 milhões por banco emissor", percentual: null, publico: "Micro, pequenas e médias empresas (até R$ 300 milhões por ano) e MEI (até R$ 360 mil)", garantias: "A critério do banco emissor", documentos: null, tarifas: "Taxa de abertura de crédito (TAC) de até 2% do limite", vigencia: null },
    faltaInformar: { carencia: NC, percentual: "Não há regra de percentual do faturamento: o limite depende do banco emissor.", documentos: NC, vigencia: NC },
    percentualPct: null, percentualMulheresPct: null, tetoCents: 200000000, tetoRotulo: "R$ 2.000.000,00 por banco emissor",
    fontes: [F("BNDES, Cartão BNDES", "https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/cartao-bndes")],
    conferir: ["A taxa muda mensalmente: consultar o portal no dia da compra."],
  },
  {
    key: "finame", nome: "BNDES Finame (equipamentos)", oQueE: "Financiamento do BNDES para comprar máquinas e equipamentos novos credenciados.", finalidade: "Equipamentos",
    campos: { taxa: "Taxa fixa do BNDES ao ano: Baixo Carbono 0,75%; BK Aquisição e Comercialização 0,95%; Crédito Máquinas e Veículos Direto 1,30%; Materiais Industrializados 0,95%; Máquinas 4.0 0,75%; mais a taxa do banco agente", prazo: null, carencia: null, limite: null, percentual: null, publico: "Quem compra bens novos credenciados no BNDES", garantias: "Negociadas com o banco agente", documentos: null, tarifas: null, vigencia: null },
    faltaInformar: { prazo: "Não consta nessa página; o produto BNDES Máquinas e Serviços fala em até 16 anos, mas é outra página: confirme com o banco.", carencia: "Idem: o BNDES Máquinas e Serviços cita carência de até 36 meses; confirme com o banco.", limite: "Não consta; o BNDES Máquinas e Serviços exige mínimo de R$ 20 milhões, o que não serve para pequenas empresas: peça ao banco o enquadramento.", percentual: NC, documentos: NC, tarifas: NC, vigencia: NC },
    percentualPct: null, percentualMulheresPct: null, tetoCents: null, tetoRotulo: null,
    fontes: [F("BNDES, Finame (todos)", "https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-finame-todos"), F("BNDES, Máquinas e Serviços", "https://www.bndes.gov.br/wps/portal/site/home/financiamento/produto/bndes-maquinas-e-servicos")],
    conferir: ["Participação financiada de 90% a 100% do item."],
  },
  {
    key: "desenvolve_sp", nome: "Desenvolve SP", oQueE: "Linha de crédito simplificado de capital de giro da agência de fomento do Estado de São Paulo.", finalidade: "Capital de giro",
    campos: { taxa: "A partir de 1,67% pré-fixada (a página não deixa explícito se é ao mês ou ao ano)", prazo: "36 meses", carencia: "1 mês", limite: "Até R$ 300.000,00 (até 100% do valor)", percentual: null, publico: "Micro e pequenas empresas de SP com faturamento de R$ 81 mil a R$ 4,8 milhões e 12 meses de faturamento", garantias: "Fundo garantidor e aval dos sócios (obrigatórios)", documentos: null, tarifas: "Tabela de tarifas vigente desde 15/07/2026 (documento em PDF no site; não lido nesta etapa)", vigencia: null },
    faltaInformar: { percentual: "A página não limita por percentual do faturamento.", documentos: NC, vigencia: NC },
    percentualPct: null, percentualMulheresPct: null, tetoCents: 30000000, tetoRotulo: "R$ 300.000,00",
    fontes: [F("Desenvolve SP, Crédito Simplificado Giro", "https://www.desenvolvesp.com.br/empresas/linhas-de-credito/credito-simplificado-giro"), F("Desenvolve SP, tabela de tarifas", "https://www.desenvolvesp.com.br/wp-content/uploads/2026/07/TABELA-DE-TARIFAS_Vigencia-Brasao-15072026.pdf")],
    conferir: ["Unidade da taxa (mês ou ano) precisa ser confirmada no site ou com o Desenvolve SP.", "Só vale se a empresa for do Estado de São Paulo."],
  },
  {
    key: "fgi_peac", nome: "FGI / PEAC", oQueE: "Não é empréstimo: é uma garantia do governo (Fundo Garantidor para Investimentos) que o banco usa para aceitar o seu pedido de crédito sem exigir bens.", finalidade: "Garantia para capital de giro, investimento ou equipamentos",
    campos: { taxa: "Juros livremente negociados com o banco (média de até 1,75% ao mês, segundo o BNDES)", prazo: "12 a 96 meses", carencia: "12 a 36 meses", limite: "R$ 1.000,00 a R$ 10.000.000,00 por empresa e por banco", percentual: null, publico: "MEI, micro, pequenas e médias empresas (até R$ 300 milhões por ano), associações e cooperativas (exceto de crédito)", garantias: "Dispensa garantias pessoais e reais", documentos: null, tarifas: "Comissão de concessão de garantia (ECG) cobrada pelo fundo", vigencia: null },
    faltaInformar: { percentual: "Não há regra de percentual do faturamento: quem decide o valor é o banco.", documentos: NC, vigencia: "A página cita reabertura até 31/12/2024 apenas para o Rio Grande do Sul. Confirme com o banco se a garantia está disponível hoje para a sua empresa." },
    percentualPct: null, percentualMulheresPct: null, tetoCents: 1000000000, tetoRotulo: "R$ 10.000.000,00 por empresa e por banco",
    fontes: [F("BNDES, perguntas frequentes do PEAC", "https://www.bndes.gov.br/wps/portal/site/home/financiamento/garantias/peac/faq-peac")],
    conferir: ["Vigência atual do programa precisa ser confirmada."],
  },
  {
    key: "cooperativas", nome: "Cooperativas de crédito (Sicoob / Unicred)", oQueE: "Crédito empresarial de cooperativas, que só atendem associados (cooperados). Cada cooperativa define suas próprias condições.", finalidade: "Capital de giro e outras finalidades",
    campos: { taxa: null, prazo: null, carencia: null, limite: "Definido após análise do perfil financeiro (Unicred)", percentual: null, publico: "Empresas e MEI que sejam cooperados (Unicred)", garantias: null, documentos: "CNPJ e contrato social (Unicred)", tarifas: null, vigencia: null },
    faltaInformar: { taxa: "As páginas do Sicoob e da Unicred dizem apenas “taxas justas”, sem número. Peça proposta à cooperativa em que a empresa for associada.", prazo: "Não consta nas páginas; depende da cooperativa.", carencia: NC, percentual: NC, garantias: "Não consta para pessoa jurídica; a cooperativa define.", tarifas: NC, vigencia: "Não se aplica: não é programa com prazo de vigência." },
    percentualPct: null, percentualMulheresPct: null, tetoCents: null, tetoRotulo: null,
    fontes: [F("Sicoob, capital de giro", "https://www.sicoob.com.br/web/sicoob/credito-empresa/capital-giro"), F("Unicred, linhas de crédito", "https://www.unicred.com.br/solucoes/linhas-de-credito")],
    conferir: ["Sem números oficiais públicos: campos ficam vazios até haver proposta da cooperativa."],
  },
];

/**
 * Faixa de faturamento ANUAL que cada programa aceita, lida nas mesmas páginas oficiais dos campos acima.
 * min/max null = a página não fixa esse limite. Linha ausente = nenhuma faixa de faturamento pública.
 */
export const FAIXAS_FATURAMENTO: Record<string, { minAnualCents: number | null; maxAnualCents: number | null; mesesFaturamento: number | null; texto: string }> = {
  pronampe: { minAnualCents: null, maxAnualCents: 480000000, mesesFaturamento: null, texto: "MEI, microempresa e empresa de pequeno porte: até R$ 4,8 milhões por ano. Não há mínimo de faturamento na página lida." },
  procred360: { minAnualCents: null, maxAnualCents: 36000000, mesesFaturamento: null, texto: "MEI e microempresa com faturamento de até R$ 360 mil por ano. Não há mínimo." },
  bndes: { minAnualCents: null, maxAnualCents: 30000000000, mesesFaturamento: null, texto: "Receita de até R$ 300 milhões por ano. Não há mínimo." },
  cartao_bndes: { minAnualCents: null, maxAnualCents: 30000000000, mesesFaturamento: null, texto: "Até R$ 300 milhões por ano (MEI até R$ 360 mil). Não há mínimo." },
  desenvolve_sp: { minAnualCents: 8100000, maxAnualCents: 480000000, mesesFaturamento: 12, texto: "Faturamento de R$ 81 mil a R$ 4,8 milhões por ano, com 12 meses de faturamento." },
  fgi_peac: { minAnualCents: null, maxAnualCents: 30000000000, mesesFaturamento: null, texto: "Até R$ 300 milhões por ano. Não há mínimo." },
};

/** Campos que a regra do programa não usa. Aparecem na mesma posição, apagados, com o motivo. */
export const NAO_SE_APLICA: Record<string, Partial<Record<CampoKey, string>>> = {
  bndes: { percentual: "Este programa não limita o crédito por percentual do faturamento." },
  cartao_bndes: { percentual: "Este programa não limita o crédito por percentual do faturamento." },
  desenvolve_sp: { percentual: "Este programa não limita o crédito por percentual do faturamento." },
  fgi_peac: { percentual: "A garantia não define valor por percentual do faturamento: quem decide é o banco." },
  cooperativas: { vigencia: "Não é programa com prazo de vigência." },
};

export const CreditoPainelInput = z.object({
  faturamentoMensalCents: z.number().int().nonnegative().max(1e13).nullable().optional(),
  lideradaPorMulheres: z.boolean().optional(),
  /** Faturamento de cada mês do ano (janeiro a dezembro); null = sem dado naquele mês. */
  mesesCents: z.array(z.number().int().nonnegative().max(1e13).nullable()).length(12).optional(),
});

/** Teto teórico por linha: min(percentual do faturamento anual, teto do programa). Sem dado = null. Não é oferta. */
export function painelCredito(i: z.infer<typeof CreditoPainelInput>) {
  const fat = i.faturamentoMensalCents ?? 0; const anual = fat * 12;
  return {
    aviso: "Faturamento não garante aprovação. O limite abaixo é o teto teórico do programa; o banco decide com base na análise de crédito.",
    conferencia: "Fontes oficiais lidas em 21/11/2026. Conferência humana dispensada pelo CEO nesta etapa; fica pendente.",
    campos: CAMPOS_CREDITO,
    faturamentoAnualCents: fat > 0 ? anual : null,
    linhas: LINHAS_PESQUISADAS.map((l) => {
      const pct = i.lideradaPorMulheres && l.percentualMulheresPct ? l.percentualMulheresPct : l.percentualPct;
      const porFat = fat > 0 && pct ? Math.floor((anual * pct) / 100) : null;
      const limite = porFat !== null ? (l.tetoCents !== null ? Math.min(porFat, l.tetoCents) : porFat) : null;
      let motivo: string | null = null;
      if (fat <= 0) motivo = "Digite o faturamento mensal para calcular.";
      else if (!pct) motivo = "Este programa não define limite por percentual do faturamento: o valor é definido pelo banco na análise.";
      const faixa = FAIXAS_FATURAMENTO[l.key] ?? null;
      const necessarioCheio = pct && l.tetoCents ? Math.ceil((l.tetoCents * 100) / pct / 12) : null;
      const meta = faixa?.minAnualCents ? { cents: Math.ceil(faixa.minAnualCents / 12), rotulo: "Mínimo mensal exigido pelo programa" }
        : necessarioCheio ? { cents: necessarioCheio, rotulo: "Faturamento mensal para chegar ao limite cheio do programa" } : null;
      const serie = (i.mesesCents ?? Array(12).fill(null)).map((v, idx) => ({
        mes: idx + 1, valorCents: v, atingiu: v === null || !meta ? null : v >= meta.cents,
      }));
      const situacaoFaixa: "sem_dado" | "sem_faixa" | "abaixo" | "dentro" | "acima" =
        fat <= 0 ? "sem_dado" : !faixa ? "sem_faixa"
          : faixa.minAnualCents !== null && anual < faixa.minAnualCents ? "abaixo"
            : faixa.maxAnualCents !== null && anual > faixa.maxAnualCents ? "acima" : "dentro";
      return { ...l, faixa, naoSeAplica: NAO_SE_APLICA[l.key] ?? {}, metaMensalCents: meta?.cents ?? null, metaRotulo: meta?.rotulo ?? null,
        necessarioLimiteCheioMensalCents: necessarioCheio, serie, mesesAtingidos: serie.filter((x) => x.atingiu === true).length,
        mesesComDado: serie.filter((x) => x.valorCents !== null).length, situacaoFaixa,
        percentualUsadoPct: pct, limiteSobreFaturamentoCents: porFat, limiteTeoricoCents: limite, motivoLimiteVazio: motivo, limitadoPeloTeto: porFat !== null && l.tetoCents !== null && porFat > l.tetoCents };
    }),
  };
}
