import { describe, expect, it } from "vitest";
import {
  recursosPorOcorrencia,
  type OcorrenciaParaClassificacao,
} from "../lib/protocol-occurrence-resources";
import { sizeVisit } from "../lib/protocol-visit-sizing";

/**
 * Contrato deste bloco isolado:
 * - Cada ocorrência é classificada individualmente, sem reservar nem montar horários.
 * - Consulta exige somente médico; enfermagem, somente enfermagem; procedimento
 *   médico, os dois. Implante identificado é procedimento médico, independentemente
 *   da via. Campos opcionais informados devem ser válidos e não contraditórios.
 * - Consulta não depende de substância ou dose. Datas iguais não proíbem ocorrências,
 *   nem decidem sua ordem ou simultaneidade.
 * - Entrada ausente, inválida ou contraditória falha sem adivinhação.
 *
 * Fora deste bloco: persistência, agenda, autorização, integração externa e decisão
 * sobre a montagem de visitas que combinem consulta e aplicação.
 */
describe("Recursos por ocorrência clínica", () => {
  it("classifica consulta sem substância ou dose somente com médico", () => {
    expect(recursosPorOcorrencia({ tipo: "consulta" })).toEqual(["medico"]);
  });

  it("classifica aplicação de enfermagem somente com enfermagem", () => {
    expect(recursosPorOcorrencia({ tipo: "enfermagem", via: "im", participacaoMedica: false }))
      .toEqual(["enfermagem"]);
  });

  it("classifica implante com médico e enfermagem", () => {
    expect(recursosPorOcorrencia({ tipo: "medico", procedimento: "implant" }))
      .toEqual(["medico", "enfermagem"]);
  });

  it("mantém os dois recursos para implante mesmo com via intramuscular", () => {
    expect(recursosPorOcorrencia({ tipo: "medico", procedimento: "implant", via: "im" }))
      .toEqual(["medico", "enfermagem"]);
  });

  it("permite outro procedimento explicitamente médico com os dois recursos", () => {
    expect(recursosPorOcorrencia({ tipo: "medico", procedimento: "outro", via: "sc", participacaoMedica: true }))
      .toEqual(["medico", "enfermagem"]);
  });

  it("não deduz enfermagem a partir das vias de um procedimento médico", () => {
    for (const via of ["im", "sc", "iv"]) {
      expect(recursosPorOcorrencia({ tipo: "medico", via })).toEqual(["medico", "enfermagem"]);
    }
  });

  it("classifica ocorrências em datas distintas sem espalhar o médico para outras datas", () => {
    const ocorrencias = [
      { data: "2030-01-07", tipo: "consulta" as const },
      { data: "2030-01-14", tipo: "enfermagem" as const, via: "im" },
      { data: "2030-01-21", tipo: "medico" as const, procedimento: "implant" as const, via: "im" },
    ];
    expect(ocorrencias.map(({ data, ...ocorrencia }) => ({ data, recursos: recursosPorOcorrencia(ocorrencia) })))
      .toEqual([
        { data: "2030-01-07", recursos: ["medico"] },
        { data: "2030-01-14", recursos: ["enfermagem"] },
        { data: "2030-01-21", recursos: ["medico", "enfermagem"] },
      ]);
  });

  it("classifica consulta e aplicação na mesma data separadamente, sem decidir horários", () => {
    const ocorrencias = [
      { data: "2030-01-07", tipo: "consulta" as const },
      { data: "2030-01-07", tipo: "enfermagem" as const, via: "iv" },
    ];
    expect(ocorrencias.map(({ data, ...ocorrencia }) => ({ data, recursos: recursosPorOcorrencia(ocorrencia) })))
      .toEqual([
        { data: "2030-01-07", recursos: ["medico"] },
        { data: "2030-01-07", recursos: ["enfermagem"] },
      ]);
  });

  it.each([
    ["ausente", undefined],
    ["nula", null],
    ["texto no lugar de ocorrência", "consulta"],
    ["lista no lugar de ocorrência", []],
    ["tipo ausente", {}],
    ["tipo nulo", { tipo: null }],
    ["tipo desconhecido", { tipo: "cirurgia" }],
    ["tipo vazio", { tipo: "" }],
    ["tipo com caixa incorreta", { tipo: "Consulta" }],
    ["procedimento desconhecido", { tipo: "medico", procedimento: "desconhecido" }],
    ["procedimento nulo", { tipo: "medico", procedimento: null }],
    ["via não textual", { tipo: "medico", via: 12 }],
    ["via vazia", { tipo: "medico", via: "  " }],
    ["participação médica nula", { tipo: "enfermagem", participacaoMedica: null }],
    ["participação médica não booleana", { tipo: "medico", participacaoMedica: "sim" }],
    ["implante classificado como enfermagem", { tipo: "enfermagem", procedimento: "implant", via: "im" }],
    ["implante classificado como consulta", { tipo: "consulta", procedimento: "implant" }],
    ["enfermagem com participação médica afirmada", { tipo: "enfermagem", participacaoMedica: true }],
    ["procedimento médico sem participação médica", { tipo: "medico", participacaoMedica: false }],
    ["consulta sem participação médica", { tipo: "consulta", participacaoMedica: false }],
  ])("recusa entrada %s sem adivinhar", (_descricao, entrada) => {
    expect(() => recursosPorOcorrencia(entrada as OcorrenciaParaClassificacao))
      .toThrow(/CLASSIFICACAO_INVALIDA/);
  });

  it("explica que a classificação está ausente", () => {
    expect(() => recursosPorOcorrencia({} as OcorrenciaParaClassificacao))
      .toThrow("CLASSIFICACAO_INVALIDA: tipo de ocorrência ausente ou desconhecido");
  });

  it("explica a contradição entre implante e classificação de enfermagem", () => {
    expect(() => recursosPorOcorrencia({ tipo: "enfermagem", procedimento: "implant", via: "im" }))
      .toThrow("CLASSIFICACAO_INVALIDA: implante exige classificação de procedimento médico");
  });
});

describe("Regressão do dimensionamento existente", () => {
  const enfermagem = { durationSeconds: 150, requiresDoctor: false };
  const implante = { durationSeconds: 1800, requiresDoctor: true };
  const endovenosa = { durationSeconds: 1800, requiresDoctor: false };

  it.each([
    ["seis intramusculares", Array(6).fill(enfermagem), 20, false],
    ["sete intramusculares", Array(7).fill(enfermagem), 40, false],
    ["implante e intramuscular", [implante, enfermagem], 60, true],
    ["duas endovenosas de trinta minutos", [endovenosa, endovenosa], 80, false],
  ])("%s mantém o tempo reservado e a participação médica", (_descricao, itens, minutos, medico) => {
    expect(sizeVisit(itens)).toMatchObject({ reservedMinutes: minutos, requiresDoctor: medico });
  });
});
