// Espelho frontend do catálogo Anvisa (Portaria 344/98).
// Mantido em sincronia com artifacts/api-server/src/lib/anvisa-catalog.ts.
// Verde e lilás NÃO existem no padrão oficial — só cores internas da clínica.

export interface AnvisaRecipeType {
  code: "A" | "B" | "C";
  label: string;
  color: string;
  colorName: string;
  requiresNotificationNumber: boolean;
  covers: string[];
}

export const ANVISA_RECIPE_TYPES: Record<string, AnvisaRecipeType> = {
  A: {
    code: "A",
    label: "Notificação de Receita A (entorpecentes/psicotrópicos)",
    color: "#F2C200",
    colorName: "Amarela",
    requiresNotificationNumber: true,
    covers: ["A1", "A2", "A3"],
  },
  B: {
    code: "B",
    label: "Notificação de Receita B (psicotrópicos/anorexígenos)",
    color: "#3B82F6",
    colorName: "Azul",
    requiresNotificationNumber: true,
    covers: ["B1", "B2"],
  },
  C: {
    code: "C",
    label: "Receita de Controle Especial (branca, 2 vias)",
    color: "#FFFFFF",
    colorName: "Branca",
    requiresNotificationNumber: false,
    covers: ["C1", "C2", "C3", "C4", "C5"],
  },
};

export const ANVISA_CONTROLLED_CLASSES: Array<{ value: string; label: string; recipe: string }> = [
  { value: "A1", label: "A1 — Entorpecentes", recipe: "A" },
  { value: "A2", label: "A2 — Entorpecentes (uso permitido)", recipe: "A" },
  { value: "A3", label: "A3 — Psicotrópicos", recipe: "A" },
  { value: "B1", label: "B1 — Psicotrópicos", recipe: "B" },
  { value: "B2", label: "B2 — Psicotrópicos anorexígenos", recipe: "B" },
  { value: "C1", label: "C1 — Outras substâncias sujeitas a controle especial", recipe: "C" },
  { value: "C2", label: "C2 — Retinoides sistêmicos", recipe: "C" },
  { value: "C3", label: "C3 — Imunossupressores (talidomida)", recipe: "C" },
  { value: "C4", label: "C4 — Antirretrovirais", recipe: "C" },
  { value: "C5", label: "C5 — Anabolizantes", recipe: "C" },
];

export function recipeTypeForControlledClass(anvisaClass: string | null | undefined): AnvisaRecipeType | null {
  if (!anvisaClass) return null;
  const cls = anvisaClass.toUpperCase().trim();
  const found = ANVISA_CONTROLLED_CLASSES.find((c) => c.value === cls);
  if (found) return ANVISA_RECIPE_TYPES[found.recipe] ?? null;
  const letter = cls.charAt(0);
  return ANVISA_RECIPE_TYPES[letter] ?? null;
}

export const PHARMACY_TYPES: Array<{ value: string; label: string }> = [
  { value: "farma.manip", label: "Farmácia de Manipulação" },
  { value: "farma.droga", label: "Drogaria" },
  { value: "farma.labor", label: "Laboratório de Injetáveis" },
];

export function pharmacyTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PHARMACY_TYPES.find((t) => t.value === value)?.label ?? value;
}
