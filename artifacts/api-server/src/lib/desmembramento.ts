// Motor de desmembramento (Regra 14): transforma 1 prescrição em N receitas
// separadas por destino (farmácia) e legalidade (controlado isolado).
//
// Regras travadas com o usuário:
// - Cada item controlado vai INTEGRAL no blend de manipulação E também sai em
//   uma cópia ISOLADA e numerada (cobertura legal).
// - Receitas são agrupadas por destino (pharmacyId).
import { recipeTypeForControlledClass } from "./anvisa-catalog";

export interface PrescriptionItemInput {
  name: string;
  ativos?: string | null;
  posologia?: string | null;
  dose?: string | null;
  via?: string | null;
  frequencia?: string | null;
  periodo?: string | null;
  observacao?: string | null;
  category?: string | null;
  internalColor?: string | null;
  isControlled?: boolean | null;
  anvisaType?: string | null;
  pharmacyId?: number | null;
}

export type RecipeKind = "manipulacao" | "controlado_isolado";

export interface RecipePlan {
  recipeType: RecipeKind;
  pharmacyId: number | null;
  anvisaType: string | null;
  anvisaColor: string | null;
  anvisaColorName: string | null;
  internalColor: string | null;
  needsSncr: boolean;
  title: string;
  items: PrescriptionItemInput[];
}

function groupKey(pharmacyId: number | null | undefined): string {
  return pharmacyId == null ? "none" : String(pharmacyId);
}

function colorKey(internalColor: string | null | undefined): string {
  return internalColor == null || internalColor === "" ? "__sem_cor__" : internalColor;
}

export function planDesmembramento(items: PrescriptionItemInput[]): RecipePlan[] {
  const plans: RecipePlan[] = [];

  // Agrupa por destino (farmácia).
  const byPharmacy = new Map<string, PrescriptionItemInput[]>();
  for (const item of items) {
    const key = groupKey(item.pharmacyId);
    if (!byPharmacy.has(key)) byPharmacy.set(key, []);
    byPharmacy.get(key)!.push(item);
  }

  for (const [, group] of byPharmacy) {
    const pharmacyId = group[0]?.pharmacyId ?? null;

    // 1) Receita(s) de manipulação — uma por COR INTERNA (organização/destino).
    //    O blend mantém os controlados integralmente (a cópia isolada é adicional).
    const byColor = new Map<string, PrescriptionItemInput[]>();
    for (const item of group) {
      const ck = colorKey(item.internalColor);
      if (!byColor.has(ck)) byColor.set(ck, []);
      byColor.get(ck)!.push(item);
    }
    const multiColor = byColor.size > 1;
    for (const [ck, colorItems] of byColor) {
      if (colorItems.length === 0) continue;
      const internalColor = ck === "__sem_cor__" ? null : ck;
      plans.push({
        recipeType: "manipulacao",
        pharmacyId,
        anvisaType: null,
        anvisaColor: null,
        anvisaColorName: null,
        internalColor,
        needsSncr: false,
        title: multiColor && internalColor
          ? `Receita de Manipulação — ${internalColor}`
          : "Receita de Manipulação",
        items: colorItems,
      });
    }

    // 2) Cópia isolada e numerada por item controlado (legalidade).
    for (const item of group) {
      if (item.isControlled) {
        const recipe = recipeTypeForControlledClass(item.anvisaType);
        plans.push({
          recipeType: "controlado_isolado",
          pharmacyId,
          anvisaType: item.anvisaType ?? null,
          anvisaColor: recipe?.color ?? null,
          anvisaColorName: recipe?.colorName ?? null,
          internalColor: item.internalColor ?? null,
          needsSncr: recipe?.requiresNotificationNumber ?? false,
          title: recipe
            ? `${recipe.label}`
            : "Receita de Controle Especial",
          items: [item],
        });
      }
    }
  }

  return plans;
}
