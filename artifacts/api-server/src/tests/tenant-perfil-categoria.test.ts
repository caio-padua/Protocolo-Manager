import { describe, expect, it } from "vitest";
import { perfilPlataformaDaCategoria as p } from "../middleware/tenantContext";

/** Regra antiga (busca textual sem remover acento), mantida aqui só para provar que nenhum cadastro real mudou de perfil. */
function antiga(cat: string, dono = false) {
  const c = cat.toLowerCase();
  return dono ? "platform_owner" : c.includes("medic") ? "medico" : c.includes("enferm") ? "enfermeira" : c.includes("admin") ? "admin" : "recepcionista";
}

describe("perfil de plataforma pela categoria profissional", () => {
  it("categorias gravadas nos cadastros reais (lidas do banco de desenvolvimento em 28/11/2026) mantêm exatamente o perfil de antes", () => {
    for (const c of ["medico", "enfermagem", "outro", "recepcao", "administrativo", "licenciado", "administrador_clinica", "financeiro"]) {
      expect(p(c), c).toBe(antiga(c));
    }
    expect(p("medico")).toBe("medico");
    expect(p("enfermagem")).toBe("enfermeira");
    expect(p("administrador_clinica")).toBe("admin");
    expect(p("administrativo")).toBe("admin");
  });
  it("médico com e sem acento, caixa e separadores são reconhecidos", () => {
    for (const c of ["medico", "Médico", "MÉDICO", " médico ", "medica", "Médica", "médico(a)", "médico_clínico", "Médico-Clínico"]) expect(p(c), c).toBe("medico");
  });
  it("enfermagem e administração com variações válidas", () => {
    for (const c of ["Enfermagem", "enfermeira", "Enfermeiro", "ENFERMEIRA"]) expect(p(c), c).toBe("enfermeira");
    for (const c of ["Administrador", "administradora_clínica", "Administrativo", "admin"]) expect(p(c), c).toBe("admin");
  });
  it("categorias que NÃO devem virar médico (nem outro perfil elevado)", () => {
    for (const c of ["paramedico", "medicamento", "medicina", "medic", "comedico", "recepcao", "financeiro", "outro", "licenciado", "", "   ", "123", "médic0"]) {
      expect(p(c), c).toBe("recepcionista");
    }
    expect(p(null)).toBe("recepcionista");
    expect(p(undefined)).toBe("recepcionista");
  });
  it("dono da plataforma continua platform_owner; categoria médica não eleva quem não é dono", () => {
    expect(p("recepcao", true)).toBe("platform_owner");
    expect(p("Médico", false)).not.toBe("platform_owner");
  });
});
