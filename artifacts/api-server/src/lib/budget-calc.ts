// ---------------------------------------------------------------------------
// MOTOR DE CALCULO DO ORCAMENTO (fonte unica da verdade).
// Regras Opcao A (planilha do CEO), parametros editaveis vindos de budget_settings.
// Dinheiro SEMPRE em centavos inteiros. Arredondamento por Math.round no fim.
// ---------------------------------------------------------------------------

export type CardFee = { installments: number; feePct: number };

export type CalcItem = {
  unitPriceCents: number;
  sessions: number;
  include: boolean;
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

export type CashScenario = {
  key: "A";
  label: string;
  discountPct: number;
  finalCents: number;
  savingsCents: number;
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
  totalCents: number; // valor cheio (ancora)
  totalSessions: number;
  scenarioA: CashScenario;
  scenarioB: DownScenario;
  scenarioC: DownScenario;
  free: FreeScenario | null;
  recommendedScenario: string;
};

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
  const totalCents = included.reduce((sum, i) => sum + Math.round(i.unitPriceCents) * Math.max(0, i.sessions), 0);
  const totalSessions = included.reduce((sum, i) => sum + Math.max(0, i.sessions), 0);

  // Cenario A: a vista (PIX/dinheiro)
  const aFinal = Math.round(totalCents * (1 - settings.cashDiscountPct / 100));
  const scenarioA: CashScenario = {
    key: "A",
    label: "A vista (PIX ou dinheiro)",
    discountPct: settings.cashDiscountPct,
    finalCents: aFinal,
    savingsCents: totalCents - aFinal,
    perspective: perspectiveOf(aFinal, settings, totalSessions),
  };

  // Cenario B: entrada 50%
  const bDiscounted = Math.round(totalCents * (1 - settings.down50DiscountPct / 100));
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
  const cDiscounted = Math.round(totalCents * (1 - settings.down30DiscountPct / 100));
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

  // Calculadora livre: entrada < 30%, SEM desconto, com taxa de cartao opcional
  let free: FreeScenario | null = null;
  if (freeCalc) {
    const downPct = Math.max(0, Math.min(100, freeCalc.downPaymentPct));
    const n = Math.max(1, Math.min(10, Math.round(freeCalc.installments)));
    const downCents = Math.round(totalCents * (downPct / 100));
    const balanceCents = totalCents - downCents;
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
    scenarioA,
    scenarioB,
    scenarioC,
    free,
    recommendedScenario: settings.recommendedScenario,
  };
}
