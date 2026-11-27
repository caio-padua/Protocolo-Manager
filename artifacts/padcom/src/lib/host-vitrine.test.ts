import { describe, expect, it } from "vitest";
import { vitrineDoEndereco } from "./host-vitrine";

describe("vitrineDoEndereco", () => {
  it("paxcare.com.br abre a vitrine só em / e /medicos", () => {
    expect(vitrineDoEndereco("paxcare.com.br", "/")).toBe("paxcare");
    expect(vitrineDoEndereco("www.paxcare.com.br", "/medicos/")).toBe("paxcare");
    expect(vitrineDoEndereco("paxcare.com.br", "/area")).toBeNull();
    expect(vitrineDoEndereco("paxcare.com.br", "/login")).toBeNull();
  });
  it("paxmed.com.br abre o pedido de convite em /convite", () => {
    expect(vitrineDoEndereco("paxmed.com.br", "/convite")).toBe("paxmed");
    expect(vitrineDoEndereco("www.paxmed.com.br", "/convite/")).toBe("paxmed");
    expect(vitrineDoEndereco("paxcare.com.br", "/convite")).toBeNull();
  });
  it("paxmed.com.br abre a vitrine só na raiz; /login, /area e /dashboard são do Manager", () => {
    expect(vitrineDoEndereco("paxmed.com.br", "/")).toBe("paxmed");
    expect(vitrineDoEndereco("www.paxmed.com.br", "/")).toBe("paxmed");
    for (const c of ["/login", "/area", "/dashboard", "/portal", "/anamnese/v2", "/medicos"]) expect(vitrineDoEndereco("paxmed.com.br", c)).toBeNull();
  });
  it("outros domínios não mudam", () => {
    expect(vitrineDoEndereco("localhost", "/")).toBeNull();
    expect(vitrineDoEndereco("exemplo.replit.dev", "/")).toBeNull();
  });
});
