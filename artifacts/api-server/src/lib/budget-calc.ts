// ---------------------------------------------------------------------------
// MOTOR DE CALCULO DO ORCAMENTO (fonte unica da verdade).
// Regras Opcao A (planilha do CEO), parametros editaveis vindos de budget_settings.
// Dinheiro SEMPRE em centavos inteiros. Arredondamento por Math.round no fim.
//
// FASE 2 — Desconto por VOLUME (decisao CEO 18/06/2026):
//   1) Cada item ganha desconto conforme as sessoes DAQUELE item (escada por item).
//   2) O carrinho inteiro ganha um BONUS conforme o total de sessoes (escada de carrinho).
//   3) O resultado vira o "preco do protocolo" (volumeDiscountedCents = ANCORA viva).
//   4) Os descontos de PAGAMENTO (A/B/C) incidem SOBRE esse preco, com TETO total
//      (maxTotalDiscountPct) vs o preco cheio, para nunca dar desconto absurdo.
// ---------------------------------------------------------------------------

export type CardFee = { installments: number; feePct: number };

export type VolumeTier = { minSessions: number; discountPct: number };

export type CalcItem = {
  unitPriceCents: number;
  sessions: number;
  include: boolean;
  volumeTiers?: VolumeTier[] | null; // override da escada por item (null => global)
};

export type CalcSettings = {
  cashDiscountPct: number;
  down50DiscountPct: number;
  down30DiscountPct: number;
  maxNoInterestInstallments: number;
  planMonths: number;
  planWeeks: number;
  planDays: number;
  cardFees: CardFee[];
  recommendedScenario: string;
  passCardFeeDefault: boolean;
  itemVolumeTiers: VolumeTier[];
  cartVolumeTiers: VolumeTier[];
  maxTotalDiscountPct: number;
};

export type FreeCalcInput = {
  downPaymentPct: number; // entrada em % (tipicamente < 30)
  installments: number; // 2..10
  passCardFee?: boolean; // override do repasse de taxa
};

export type Perspective = {
  perMonthCents: number;
  perWeekCents: number;
  perDayCents: number;
  perSessionCents: number;
};

export type InstallmentOption = { installments: number; installmentCents: number };

// Resultado do desconto por volume de UM item (alinhado por indice aos itens incluidos).
export type ItemVolumeResult = {
  sessions: number;
  grossCents: number; // unitPrice * sessions
  discountPct: number; // % da faixa atingida
  discountCents: number;
  netCents: number; // grossCents - discountCents
  effectiveUnitCents: number; // preco POR SESSAO ja com desconto (ancoragem viva)
  nextTierSessions: number | null; // quantas sessoes faltam p/ a proxima faixa
  nextTierPct: number | null; // desconto da proxima faixa
};

export type CashScenario = {
  key: "A";
  label: string;
  discountPct: number; // desconto de PAGAMENTO (sobre o preco do protocolo)
  finalCents: number;
  savingsCents: number; // economia TOTAL vs preco cheio (volume + pagamento)
  perspective: Perspective;
};

export type DownScenario = {
  key: "B" | "C";
  label: string;
  discountPct: number;
  downPaymentPct: number;
  discountedCents: number;
  downPaymentCents: number;
  balanceCents: number;
  installmentOptions: InstallmentOption[];
  savingsCents: number;
  perspective: Perspective;
};

export type FreeScenario = {
  key: "free";
  label: string;
  downPaymentPct: number;
  downPaymentCents: number;
  balanceCents: number;
  passCardFee: boolean;
  feePct: number;
  installments: number;
  totalWithFeeCents: number;
  installmentCents: number;
};

export type CalcResult = {
  totalCents: number; // valor cheio (ancora superior, riscado)
  totalSessions: number;
  // --- Fase 2: desconto por volume ---
  itemVolumeDiscountCents: number; // soma do desconto por item
  cartBonusPct: number; // % do bonus de carrinho atingido
  cartBonusCents: number; // valor do bonus de carrinho
  cartNextTierSessions: number | null; // faltam X sessoes p/ proximo bonus
  cartNextTierPct: number | null;
  volumeDiscountCents: number; // desconto total por volume (item + carrinho)
  volumeDiscountedCents: number; // PRECO DO PROTOCOLO (apos volume, antes do pagamento)
  volumeDiscountPct: number; // % efetivo do desconto por volume vs cheio
  items: ItemVolumeResult[];
  maxTotalDiscountPct: number;
  // --- cenarios de pagamento (incidem sobre volumeDiscountedCents) ---
  scenarioA: CashScenario;
  scenarioB: DownScenario;
  scenarioC: DownScenario;
  free: FreeScenario | null;
  recommendedScenario: string;
};

// Normaliza e ordena a escada (faixas crescentes por minSessions).
function normTiers(tiers: VolumeTier[] | null | undefined): VolumeTier[] {
  if (!Array.isArray(tiers) || tiers.length === 0) return [];
  return [...tiers]
    .filter((t) => Number.isFinite(t.minSessions) && Number.isFinite(t.discountPct))
    .map((t) => ({ minSessions: Math.max(0, Math.floor(t.minSessions)), discountPct: Math.max(0, t.discountPct) }))
    .sort((a, b) => a.minSessions - b.minSessions);
}

// Faixa atingida = a de maior minSessions <= quantidade. Retorna 0 se nenhuma.
function tierPctFor(tiers: VolumeTier[], qty: number): number {
  let pct = 0;
  for (const t of tiers) {
    if (qty >= t.minSessions) pct = t.discountPct;
    else break;
  }
  return pct;
}

// Proxima faixa estritamente acima da quantidade (gatilho de venda).
function nextTierFor(tiers: VolumeTier[], qty: number): { sessions: number; pct: number } | null {
  for (const t of tiers) {
    if (t.minSessions > qty) return { sessions: t.minSessions - qty, pct: t.discountPct };
  }
  return null;
}

function perspectiveOf(valueCents: number, s: CalcSettings, totalSessions: number): Perspective {
  return {
    perMonthCents: s.planMonths > 0 ? Math.round(valueCents / s.planMonths) : 0,
    perWeekCents: s.planWeeks > 0 ? Math.round(valueCents / s.planWeeks) : 0,
    perDayCents: s.planDays > 0 ? Math.round(valueCents / s.planDays) : 0,
    perSessionCents: totalSessions > 0 ? Math.round(valueCents / totalSessions) : 0,
  };
}

function buildInstallmentOptions(balanceCents: number, maxN: number): InstallmentOption[] {
  const opts: InstallmentOption[] = [];
  for (let n = 1; n <= Math.max(1, maxN); n++) {
    opts.push({ installments: n, installmentCents: Math.round(balanceCents / n) });
  }
  return opts;
}

export function calculateBudget(
  items: CalcItem[],
  settings: CalcSettings,
  freeCalc?: FreeCalcInput,
): CalcResult {
  const included = items.filter((i) => i.include);
  const globalItemTiers = normTiers(settings.itemVolumeTiers);
  const cartTiers = normTiers(settings.cartVolumeTiers);

  // --- 1) Desconto por ITEM ---
  let totalCents = 0;
  let totalSessions = 0;
  let itemVolumeDiscountCents = 0;
  const itemResults: ItemVolumeResult[] = included.map((i) => {
    const sessions = Math.max(0, Math.floor(i.sessions));
    const unit = Math.round(i.unitPriceCents);
    const grossCents = unit * sessions;
    const tiers = normTiers(i.volumeTiers);
    const effTiers = tiers.length > 0 ? tiers : globalItemTiers;
    const discountPct = tierPctFor(effTiers, sessions);
    const discountCents = Math.round(grossCents * (discountPct / 100));
    const netCents = grossCents - discountCents;
    const next = nextTierFor(effTiers, sessions);
    totalCents += grossCents;
    totalSessions += sessions;
    itemVolumeDiscountCents += discountCents;
    return {
      sessions,
      grossCents,
      discountPct,
      discountCents,
      netCents,
      effectiveUnitCents: sessions > 0 ? Math.round(netCents / sessions) : unit,
      nextTierSessions: next ? next.sessions : null,
      nextTierPct: next ? next.pct : null,
    };
  });

  const subtotalAfterItem = totalCents - itemVolumeDiscountCents;

  // --- 2) BONUS de carrinho (sobre o total de sessoes) ---
  const cartBonusPct = tierPctFor(cartTiers, totalSessions);
  const cartBonusCents = Math.round(subtotalAfterItem * (cartBonusPct / 100));
  const cartNext = nextTierFor(cartTiers, totalSessions);

  // --- 3) Preco do protocolo (ANCORA viva apos volume) ---
  const volumeDiscountedCents = subtotalAfterItem - cartBonusCents;
  const volumeDiscountCents = totalCents - volumeDiscountedCents;
  const volumeDiscountPct = totalCents > 0 ? (volumeDiscountCents / totalCents) * 100 : 0;

  // Teto: o preco final NUNCA pode ser menor que (preco cheio * (1 - maxTotal%)).
  const maxTotal = Math.max(0, Math.min(100, settings.maxTotalDiscountPct ?? 100));
  const floorCents = Math.round(totalCents * (1 - maxTotal / 100));
  const capFinal = (v: number) => Math.max(v, floorCents);

  // --- 4) Cenarios de PAGAMENTO incidem sobre volumeDiscountedCents ---
  // Cenario A: a vista (PIX/dinheiro)
  const aRaw = Math.round(volumeDiscountedCents * (1 - settings.cashDiscountPct / 100));
  const aFinal = capFinal(aRaw);
  const scenarioA: CashScenario = {
    key: "A",
    label: "A vista (PIX ou dinheiro)",
    discountPct: settings.cashDiscountPct,
    finalCents: aFinal,
    savingsCents: totalCents - aFinal,
    perspective: perspectiveOf(aFinal, settings, totalSessions),
  };

  // Cenario B: entrada 50%
  const bRaw = Math.round(volumeDiscountedCents * (1 - settings.down50DiscountPct / 100));
  const bDiscounted = capFinal(bRaw);
  const bDown = Math.round(bDiscounted * 0.5);
  const bBalance = bDiscounted - bDown;
  const scenarioB: DownScenario = {
    key: "B",
    label: "Entrada de 50%",
    discountPct: settings.down50DiscountPct,
    downPaymentPct: 50,
    discountedCents: bDiscounted,
    downPaymentCents: bDown,
    balanceCents: bBalance,
    installmentOptions: buildInstallmentOptions(bBalance, settings.maxNoInterestInstallments),
    savingsCents: totalCents - bDiscounted,
    perspective: perspectiveOf(bDiscounted, settings, totalSessions),
  };

  // Cenario C: entrada 30%
  const cRaw = Math.round(volumeDiscountedCents * (1 - settings.down30DiscountPct / 100));
  const cDiscounted = capFinal(cRaw);
  const cDown = Math.round(cDiscounted * 0.3);
  const cBalance = cDiscounted - cDown;
  const scenarioC: DownScenario = {
    key: "C",
    label: "Entrada de 30%",
    discountPct: settings.down30DiscountPct,
    downPaymentPct: 30,
    discountedCents: cDiscounted,
    downPaymentCents: cDown,
    balanceCents: cBalance,
    installmentOptions: buildInstallmentOptions(cBalance, settings.maxNoInterestInstallments),
    savingsCents: totalCents - cDiscounted,
    perspective: perspectiveOf(cDiscounted, settings, totalSessions),
  };

  // Calculadora livre: base = preco do protocolo (ja com volume), SEM desconto de
  // pagamento, com taxa de cartao opcional.
  let free: FreeScenario | null = null;
  if (freeCalc) {
    const base = volumeDiscountedCents;
    const downPct = Math.max(0, Math.min(100, freeCalc.downPaymentPct));
    const n = Math.max(1, Math.min(10, Math.round(freeCalc.installments)));
    const downCents = Math.round(base * (downPct / 100));
    const balanceCents = base - downCents;
    const passFee = freeCalc.passCardFee ?? settings.passCardFeeDefault;
    const feeRow = settings.cardFees?.find((f) => f.installments === n);
    const feePct = passFee && feeRow ? feeRow.feePct : 0;
    const totalWithFeeCents = feePct > 0 ? Math.round(balanceCents / (1 - feePct / 100)) : balanceCents;
    free = {
      key: "free",
      label: "Calculadora livre",
      downPaymentPct: downPct,
      downPaymentCents: downCents,
      balanceCents,
      passCardFee: passFee,
      feePct,
      installments: n,
      totalWithFeeCents,
      installmentCents: Math.round(totalWithFeeCents / n),
    };
  }

  return {
    totalCents,
    totalSessions,
    itemVolumeDiscountCents,
    cartBonusPct,
    cartBonusCents,
    cartNextTierSessions: cartNext ? cartNext.sessions : null,
    cartNextTierPct: cartNext ? cartNext.pct : null,
    volumeDiscountCents,
    volumeDiscountedCents,
    volumeDiscountPct,
    items: itemResults,
    maxTotalDiscountPct: maxTotal,
    scenarioA,
    scenarioB,
    scenarioC,
    free,
    recommendedScenario: settings.recommendedScenario,
  };
}

// Defaults estruturais (usados no seed quando o settings nao tem escada definida).
export const DEFAULT_ITEM_VOLUME_TIERS: VolumeTier[] = [
  { minSessions: 1, discountPct: 0 },
  { minSessions: 9, discountPct: 5 },
  { minSessions: 17, discountPct: 10 },
  { minSessions: 25, discountPct: 15 },
];

export const DEFAULT_CART_VOLUME_TIERS: VolumeTier[] = [
  { minSessions: 1, discountPct: 0 },
  { minSessions: 24, discountPct: 2 },
  { minSessions: 40, discountPct: 4 },
  { minSessions: 60, discountPct: 6 },
];
