import { describe, expect, it } from "vitest";
import { nomeProcessoExibido } from "../lib/padteam-nome-processo";

describe("nome apresentado da responsabilidade", () => {
  it("apresenta RASP sem mudar a chave antiga", () => {
    const nomeGuardado = "Gerar RAS Assinado";
    expect(nomeProcessoExibido(nomeGuardado)).toBe("Gerar RASP Assinado");
    expect(nomeGuardado).toBe("Gerar RAS Assinado");
  });

  it("não altera nomes diferentes ou personalizados", () => {
    expect(nomeProcessoExibido("Aprovar Protocolo")).toBe("Aprovar Protocolo");
    expect(nomeProcessoExibido("Gerar RAS Assinado — personalizado")).toBe(
      "Gerar RAS Assinado — personalizado",
    );
  });
});
