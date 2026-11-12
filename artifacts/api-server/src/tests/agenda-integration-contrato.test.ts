import { describe, expect, it } from "vitest";
import { GetAgendaIntegrationResponse } from "@workspace/api-zod";

// Regressão: agenda sem local físico (Home Care, Outro local) tem locationId nulo. O contrato exigia número,
// a rota respondia 500 para TODOS e Agenda Configuração inteira caía em "somente leitura".
const base = {
  agendas: [{ id: 8, name: "Sede", color: "#112233", role: "local", enabled: true, lastSuccess: null, lastAttempt: null, error: null, personalOwnerId: null, canManage: true }],
  professionals: [{ id: 26, name: "Enf. Sintetica", categoryId: 2 }],
  globalSettingsOwnerOnly: false,
  canManageGlobalSettings: true,
  companyId: 5,
};

describe("contrato de /agenda/integration", () => {
  it("aceita agenda sem local físico (locationId nulo)", () => {
    const r = GetAgendaIntegrationResponse.safeParse({
      ...base,
      resources: [{ id: 22, name: "AGENDA MEDICO - SEDE", locationId: 8 }, { id: 27, name: "AGENDA ENFERMAGEM - HOME CARE", locationId: null }],
      companyName: "Clinica Sintetica A",
    });
    expect(r.success).toBe(true);
  });

  it("aceita resposta sem nome de empresa (campo opcional) e com nome nulo", () => {
    expect(GetAgendaIntegrationResponse.safeParse({ ...base, resources: [] }).success).toBe(true);
    expect(GetAgendaIntegrationResponse.safeParse({ ...base, resources: [], companyName: null }).success).toBe(true);
  });

  it("continua recusando locationId ausente ou de tipo errado", () => {
    expect(GetAgendaIntegrationResponse.safeParse({ ...base, resources: [{ id: 1, name: "x" }] }).success).toBe(false);
    expect(GetAgendaIntegrationResponse.safeParse({ ...base, resources: [{ id: 1, name: "x", locationId: "8" }] }).success).toBe(false);
  });
});
