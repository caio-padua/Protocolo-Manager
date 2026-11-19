/** Tipos da tela e réplica do cálculo de preço. O servidor é a autoridade; aqui só se simula antes de salvar. */
export type Categoria = "IM" | "SC" | "IMPLANTE" | "OUTRAS" | "SEM_VIA";
export type Arredondamento = "nenhum" | "inteiro" | "90";
export type ReferenciaModo = "maior" | "media" | "menor";
export type ModoCategoria = "auto" | "congelado";

export type Celula = { fornecedorId: number; custoUnitarioCentavos: number; custoEmbalagemCentavos: number; quantidadeEmbalagem: number };
export type Estoque = { fisico: number; dinamico: number; estatico: number; falta: number; minimo: number };
export type Linha = {
  varianteId: number; substanciaId: number; produto: string; doseTotal: string; forma: string; volumeMl: string | null;
  concentracao: string | null; via: string | null; categoria: Categoria; celulas: Celula[];
  estoque: Estoque | null;
  publicado: { precoCentavos: number; origem: string; publicadoEm: string } | null;
  orcamento: { catalogoId: number; nome: string; precoCentavos: number } | null;
};
export type Fornecedor = { id: number; nome: string; ativo: boolean };
export type Parametros = {
  fretePct: number; perdaPct: number; impostosPct: number; cartaoPct: number; comissaoPct: number; despesasPct: number;
  arredondamento: Arredondamento; referenciaModo: ReferenciaModo;
};
export type ConfigCategoria = { categoria: Categoria; margemPct: number; modo: ModoCategoria };
export type Matriz = {
  fornecedores: Fornecedor[]; linhas: Linha[]; parametros: Parametros; categorias: ConfigCategoria[];
  reservasAtivas: number; semLote: number;
};

export const CATEGORIAS: { id: Categoria; nome: string; curto: string }[] = [
  { id: "IM", nome: "Injetáveis IM", curto: "IM" },
  { id: "SC", nome: "Injetáveis SC", curto: "SC" },
  { id: "IMPLANTE", nome: "Implantes", curto: "Implantes" },
  { id: "OUTRAS", nome: "Outras vias (EV, ID, tópico)", curto: "Outras vias" },
  { id: "SEM_VIA", nome: "Sem via informada", curto: "Sem via" },
];
export const MODO_TXT: Record<ReferenciaModo, string> = { maior: "Maior valor", media: "Média", menor: "Menor valor" };

export type Formacao = {
  referencia: number; entrada: number; custoEfetivo: number; impostos: number; cartao: number; comissao: number; despesas: number;
  lucro: number; venda: number; margemReal: number;
};

export function formarPreco(ref: number, margemPct: number, p: Parametros): Formacao | null {
  if (!(ref > 0)) return null;
  const custoEfetivo = ref * (1 + p.fretePct / 100) * (1 + p.perdaPct / 100);
  const divisor = 1 - (p.impostosPct + p.cartaoPct + p.comissaoPct + p.despesasPct + margemPct) / 100;
  if (divisor < 0.05) return null;
  const bruto = custoEfetivo / divisor;
  const venda = p.arredondamento === "inteiro" ? Math.ceil(bruto / 100) * 100
    : p.arredondamento === "90" ? Math.max(90, Math.ceil((bruto - 90) / 100) * 100 + 90) : Math.round(bruto);
  const impostos = (venda * p.impostosPct) / 100, cartao = (venda * p.cartaoPct) / 100;
  const comissao = (venda * p.comissaoPct) / 100, despesas = (venda * p.despesasPct) / 100;
  const lucro = venda - custoEfetivo - impostos - cartao - comissao - despesas;
  return { referencia: ref, entrada: custoEfetivo - ref, custoEfetivo, impostos, cartao, comissao, despesas, lucro, venda, margemReal: (lucro / venda) * 100 };
}

export type Calc = {
  linha: Linha; incl: Celula[]; min: number | null; max: number | null; ref: number | null;
  forma: Formacao | null; invalido: boolean; venda: number | null; pub: number | null; pend: boolean;
  vencedoras: Celula[]; eco: number | null; margem: number;
};

export function calcular(linha: Linha, labsOn: Set<number>, p: Parametros, margens: Record<Categoria, number>): Calc {
  const incl = linha.celulas.filter((c) => labsOn.has(c.fornecedorId));
  const vs = incl.map((c) => c.custoUnitarioCentavos).filter((v) => v > 0);
  const min = vs.length ? Math.min(...vs) : null;
  const max = vs.length ? Math.max(...vs) : null;
  const ref = !vs.length ? null : p.referenciaModo === "maior" ? max : p.referenciaModo === "menor" ? min : Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
  const margem = margens[linha.categoria];
  const forma = ref === null ? null : formarPreco(ref, margem, p);
  const venda = forma ? Math.round(forma.venda) : null;
  const pub = linha.publicado?.precoCentavos ?? null;
  return {
    linha, incl, min, max, ref, margem, forma, venda, pub,
    invalido: ref !== null && forma === null,
    pend: venda !== null && pub !== venda,
    vencedoras: min === null ? [] : incl.filter((c) => c.custoUnitarioCentavos === min),
    eco: incl.length >= 2 && max ? (max - (min as number)) / max : null,
  };
}

/** Dose curta: composições longas viram "composto"; o texto inteiro fica no título e na barra de fórmula. */
export const doseCurta = (d: string): string => (d.length <= 24 ? d : `composto · ${d.split(/\s*(?:\+|\/)\s*/).length} ativos`);
export const unidadeTxt = (forma: string, qtd: number) => (forma === "implante" ? "implante" : forma === "frasco" ? (qtd > 1 ? "frascos" : "frasco") : qtd > 1 ? "ampolas" : "ampola");
