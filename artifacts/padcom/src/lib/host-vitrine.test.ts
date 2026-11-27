import { describe, expect, it } from "vitest";
import { vitrineDoEndereco } from "./host-vitrine";

describe("vitrineDoEndereco", () => {
  it("paxcare.com.br abre a vitrine só em / e /medicos", () => {
    expect(vitrineDoEndereco("paxcare.com.br", "/")).toBe("paxcare");
    expect(vitrineDoEndereco("www.paxcare.com.br", "/medicos/")).toBe("paxcare");
    expect(vitrineDoEndereco("paxcare.com.br", "/area")).toBeNull();
    expect(vitrineDoEndereco("paxcare.com.br", "/login")).toBeNull();
  });
  it("paxmed.com.br e domínios do Manager não mudam", () => {
    expect(vitrineDoEndereco("paxmed.com.br", "/")).toBeNull();
    expect(vitrineDoEndereco("localhost", "/")).toBeNull();
  });
});
