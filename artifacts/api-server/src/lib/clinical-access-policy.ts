export type ClinicalWorkflowMode = "direto" | "conferir" | "bloqueado";
export type ClinicalToolId = "prescricao" | "pedido_exames";

export function clinicalWorkflowMode(input: {
  active: boolean;
  professionalType: string | null;
  category: string | null;
  globalAllowed: boolean;
  localAllowed: boolean;
}): ClinicalWorkflowMode {
  if (!input.active || !input.globalAllowed || !input.localAllowed) return "bloqueado";
  if (input.professionalType === "medico" && input.category === "medico") return "direto";
  if (input.professionalType !== "medico" && input.category === "enfermagem") return "conferir";
  return "bloqueado";
}
