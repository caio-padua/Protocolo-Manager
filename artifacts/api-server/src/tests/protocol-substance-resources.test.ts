import { describe, expect, it } from "vitest";
import type { Substance } from "@workspace/db/schema";
import { recursosPorOcorrencia } from "../lib/protocol-occurrence-resources";
import {
  recursosParaSubstancia,
  type CadastroParaClassificacao,
} from "../lib/protocol-substance-resources";

/**
 * Contrato deste bloco:
 * - Usa os campos reais procedureType e doctorParticipation do cadastro.
 * - Reconhece somente os quatro valores hoje oferecidos no cadastro:
 *   im, sc, iv e implant. A via isolada não define a equipe.
 * - Participação false exige enfermagem; true exige médico e enfermagem.
 * - Implante com participação false, participação desconhecida e procedimento
 *   desconhecido são recusados; o objeto de entrada não é alterado.
 * - A consulta continua uma ocorrência independente, sem registro de substância.
 * - Não há acesso a banco, reservas, telas ou integrações nesta função.
 */
describe("Adaptação dos recursos a partir do cadastro de substâncias", () => {
  it.each(["im", "sc", "iv"])("%s sem participação médica requer enfermagem", procedureType => {
    const cadastro: Pick<Substance, "procedureType" | "doctorParticipation"> = {
      procedureType,
      doctorParticipation: false,
    };
    expect(recursosParaSubstancia(cadastro)).toEqual(["enfermagem"]);
  });

  it.each(["im", "sc", "iv"])("%s com participação médica explícita requer os dois", procedureType => {
    expect(recursosParaSubstancia({ procedureType, doctorParticipation: true }))
      .toEqual(["medico", "enfermagem"]);
  });

  it("implante com participação médica requer médico e enfermagem", () => {
    expect(recursosParaSubstancia({ procedureType: "implant", doctorParticipation: true }))
      .toEqual(["medico", "enfermagem"]);
  });

  it("implante continua exigindo os dois mesmo com via de uso intramuscular", () => {
    const cadastro: CadastroParaClassificacao = {
      procedureType: "implant",
      doctorParticipation: true,
      viaUso: "IM",
    };
    expect(recursosParaSubstancia(cadastro)).toEqual(["medico", "enfermagem"]);
  });

  it.each([null, undefined])("recusa participação médica não informada: %s", doctorParticipation => {
    expect(() => recursosParaSubstancia({
      procedureType: "im",
      doctorParticipation,
    } as CadastroParaClassificacao)).toThrow(/PARTICIPACAO_INDEFINIDA/);
  });

  it.each(["true", 1, 0, {}, []])("recusa participação médica não booleana", doctorParticipation => {
    expect(() => recursosParaSubstancia({
      procedureType: "im",
      doctorParticipation,
    } as CadastroParaClassificacao)).toThrow(/PARTICIPACAO_INVALIDA/);
  });

  it("recusa implante com participação médica falsa", () => {
    expect(() => recursosParaSubstancia({
      procedureType: "implant",
      doctorParticipation: false,
      viaUso: "IM",
    })).toThrow(/IMPLANTE_CONTRADITORIO/);
  });

  it.each(["outro", "IM", "consulta", "", " ", null, undefined, 4])(
    "recusa tipo de procedimento não suportado: %s",
    procedureType => {
      expect(() => recursosParaSubstancia({
        procedureType,
        doctorParticipation: true,
      } as CadastroParaClassificacao)).toThrow(/PROCEDIMENTO_NAO_SUPORTADO/);
    },
  );

  it.each([null, undefined, "im", [], 1])("recusa cadastro inválido", cadastro => {
    expect(() => recursosParaSubstancia(cadastro as unknown as CadastroParaClassificacao))
      .toThrow(/CADASTRO_INVALIDO/);
  });

  it("não altera o objeto recebido, nem substitui valores da via de uso", () => {
    const cadastro = Object.freeze({
      procedureType: "implant",
      doctorParticipation: true,
      viaUso: "IM",
    } satisfies CadastroParaClassificacao);
    expect(recursosParaSubstancia(cadastro)).toEqual(["medico", "enfermagem"]);
    expect(cadastro).toEqual({ procedureType: "implant", doctorParticipation: true, viaUso: "IM" });
  });

  it("classifica datas diferentes sem levar os recursos médicos para a aplicação de enfermagem", () => {
    const ocorrencias = [
      { data: "2030-01-07", recursos: recursosPorOcorrencia({ tipo: "consulta" }) },
      { data: "2030-01-14", recursos: recursosParaSubstancia({ procedureType: "im", doctorParticipation: false }) },
      { data: "2030-01-21", recursos: recursosParaSubstancia({ procedureType: "implant", doctorParticipation: true }) },
    ];
    expect(ocorrencias).toEqual([
      { data: "2030-01-07", recursos: ["medico"] },
      { data: "2030-01-14", recursos: ["enfermagem"] },
      { data: "2030-01-21", recursos: ["medico", "enfermagem"] },
    ]);
  });
});
