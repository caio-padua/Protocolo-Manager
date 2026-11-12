import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { chaveDependeDeAgenda, propagarMudancaDeAgenda } from "./agenda-propagacao";

describe("propagação de mudança de agenda", () => {
  it.each([
    "/api/agenda/resources",
    "/api/sessions",
    "/api/locations",
    "agenda-integracao",
    "agenda-profissionais-vinculados",
    "agendas-google-conta",
    "google-compromissos",
    "professional-locations",
    "empresas-locais-confirmados",
    "cliente-agendas-clinica",
    "pit-stop",
  ])("a consulta %s recarrega quando a agenda muda", (chave) => {
    expect(chaveDependeDeAgenda(chave)).toBe(true);
  });

  it.each(["/api/clients", "/api/professionals", "dashboard", 42, null, undefined, ["agenda"]])(
    "a consulta %j não é tocada",
    (chave) => {
      expect(chaveDependeDeAgenda(chave as unknown)).toBe(false);
    },
  );

  it("invalida só as consultas de agenda e deixa as demais intactas", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["agenda-integracao", 1], { x: 1 });
    qc.setQueryData(["/api/agenda/resources"], []);
    qc.setQueryData(["/api/clients"], []);
    await propagarMudancaDeAgenda(qc);
    expect(qc.getQueryState(["agenda-integracao", 1])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["/api/agenda/resources"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["/api/clients"])?.isInvalidated).toBe(false);
  });
});
