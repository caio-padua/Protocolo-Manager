import { describe, expect, it } from "vitest";
import { TIPOS_ATENDIMENTO, alternarTipoDeAtendimento, normalizarTiposAtendimento, tiposParaFormulario } from "./tipos-atendimento";

describe("tipos de atendimento do profissional", () => {
  it("todo profissional tem os quatro interruptores, nesta ordem", () => {
    expect(TIPOS_ATENDIMENTO.map((t) => t.label)).toEqual(["Sede", "Local externo", "Online", "Home Care"]);
  });

  it.each([
    [["clinic"], ["presencial"]],
    [["Sede"], ["presencial"]],
    [["local"], ["presencial"]],
    [["clinic", "homecare"], ["presencial", "home_care"]],
    [["home", "presencial"], ["presencial", "home_care"]],
    [["clinic", "online"], ["presencial", "online"]],
    [["presencial"], ["presencial"]],
    [["Local externo"], ["externo"]],
    [["outro-local"], ["externo"]],
    [["Home Care", "ONLINE"], ["online", "home_care"]],
    [["home-care"], ["home_care"]],
  ])("traduz o valor antigo %j para %j", (entrada, esperado) => {
    expect(normalizarTiposAtendimento(entrada).oficiais).toEqual(esperado);
  });

  it("preserva valor desconhecido em vez de apagar", () => {
    const r = normalizarTiposAtendimento(["clinic", "domiciliar_legado"]);
    expect(r.oficiais).toEqual(["presencial"]);
    expect(r.desconhecidos).toEqual(["domiciliar_legado"]);
    expect(tiposParaFormulario(["clinic", "domiciliar_legado"])).toEqual(["presencial", "domiciliar_legado"]);
  });

  it("sem nada gravado usa o padrão presencial, sem inventar Home Care", () => {
    expect(tiposParaFormulario([])).toEqual(["presencial"]);
    expect(tiposParaFormulario(null)).toEqual(["presencial"]);
  });

  it("não repete valores equivalentes", () => {
    expect(normalizarTiposAtendimento(["home", "homecare", "home_care"]).oficiais).toEqual(["home_care"]);
    expect(normalizarTiposAtendimento(["externo", "Local externo", "outro local"]).oficiais).toEqual(["externo"]);
  });

  it("alternar mantém a ordem Sede, Local externo, Online, Home Care", () => {
    expect(alternarTipoDeAtendimento(["online"], "presencial")).toEqual(["presencial", "online"]);
    expect(alternarTipoDeAtendimento(["presencial"], "externo")).toEqual(["presencial", "externo"]);
    expect(alternarTipoDeAtendimento(["presencial"], "home_care")).toEqual(["presencial", "home_care"]);
    expect(alternarTipoDeAtendimento(["presencial", "externo", "online", "home_care"], "online"))
      .toEqual(["presencial", "externo", "home_care"]);
  });

  it("alternar traduz valor antigo e nunca deixa a lista vazia", () => {
    expect(alternarTipoDeAtendimento(["clinic"], "home_care")).toEqual(["presencial", "home_care"]);
    expect(alternarTipoDeAtendimento(["presencial"], "presencial")).toEqual(["presencial"]);
    expect(alternarTipoDeAtendimento(["clinic"], "presencial")).toEqual(["clinic"]);
  });

  it("alternar preserva valor desconhecido", () => {
    expect(alternarTipoDeAtendimento(["clinic", "legado_x"], "online")).toEqual(["presencial", "online", "legado_x"]);
    expect(alternarTipoDeAtendimento(["legado_x"], "presencial")).toEqual(["presencial", "legado_x"]);
  });
});
