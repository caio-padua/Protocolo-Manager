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

export function canViewOwnClinicalApproval(input: {
  requestLocationId: number;
  requestEmpresaId: number;
  linkLocationId: number | null;
  linkEmpresaId: number | null;
  grantEmpresaId: number | null;
  active: boolean;
  professionalType: string | null;
  category: string | null;
  globalAllowed: boolean;
  localAllowed: boolean;
}): boolean {
  if (
    input.linkLocationId !== input.requestLocationId ||
    input.linkEmpresaId !== input.requestEmpresaId ||
    input.grantEmpresaId !== input.requestEmpresaId
  ) return false;
  return clinicalWorkflowMode({
    active: input.active,
    professionalType: input.professionalType,
    category: input.category,
    globalAllowed: input.globalAllowed,
    localAllowed: input.localAllowed,
  }) !== "bloqueado";
}
