import { describe, expect, it } from "vitest";
import { canViewOwnClinicalApproval, clinicalWorkflowMode } from "../lib/clinical-access-policy";

describe("clinicalWorkflowMode", () => {
  it("permite emissão direta ao médico ativo com liberação global e local", () => {
    expect(clinicalWorkflowMode({
      active: true,
      professionalType: "medico",
      category: "medico",
      globalAllowed: true,
      localAllowed: true,
    })).toBe("direto");
  });

  it("encaminha enfermagem liberada para conferência, sem permitir emissão direta", () => {
    expect(clinicalWorkflowMode({
      active: true,
      professionalType: "nao_medico",
      category: "enfermagem",
      globalAllowed: true,
      localAllowed: true,
    })).toBe("conferir");
  });

  it.each([
    { label: "profissional inativo", active: false, professionalType: "medico", category: "medico", globalAllowed: true, localAllowed: true },
    { label: "sem permissão global", active: true, professionalType: "medico", category: "medico", globalAllowed: false, localAllowed: true },
    { label: "sem liberação da clínica", active: true, professionalType: "medico", category: "medico", globalAllowed: true, localAllowed: false },
    { label: "função não autorizada", active: true, professionalType: "nao_medico", category: "administrativo", globalAllowed: true, localAllowed: true },
    { label: "enfermagem sem permissão global", active: true, professionalType: "nao_medico", category: "enfermagem", globalAllowed: false, localAllowed: true },
  ])("bloqueia $label", ({ active, professionalType, category, globalAllowed, localAllowed }) => {
    expect(clinicalWorkflowMode({
      active, professionalType, category, globalAllowed, localAllowed,
    })).toBe("bloqueado");
  });
});

describe("canViewOwnClinicalApproval", () => {
  const authorized = {
    requestLocationId: 8,
    requestEmpresaId: 5,
    linkLocationId: 8,
    linkEmpresaId: 5,
    grantEmpresaId: 5,
    active: true,
    professionalType: "nao_medico",
    category: "enfermagem",
    globalAllowed: true,
    localAllowed: true,
  };

  it("exibe a própria solicitação enquanto o vínculo e as liberações continuam ativos", () => {
    expect(canViewOwnClinicalApproval(authorized)).toBe(true);
  });

  it.each([
    { label: "clínica diferente", linkLocationId: 9, linkEmpresaId: 5, grantEmpresaId: 5 },
    { label: "empresa diferente", linkLocationId: 8, linkEmpresaId: 6, grantEmpresaId: 6 },
    { label: "vínculo removido", linkLocationId: null, linkEmpresaId: null, grantEmpresaId: null },
    { label: "liberação local revogada", localAllowed: false },
    { label: "liberação global revogada", globalAllowed: false },
    { label: "profissional inativo", active: false },
  ])("oculta dados da solicitação após $label", (overrides) => {
    expect(canViewOwnClinicalApproval({ ...authorized, ...overrides })).toBe(false);
  });
});
