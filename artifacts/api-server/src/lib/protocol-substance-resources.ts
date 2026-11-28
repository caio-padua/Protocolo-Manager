import type { Substance } from "@workspace/db/schema";
import { recursosPorOcorrencia, type RecursoOcorrencia } from "./protocol-occurrence-resources";

/**
 * Campos reais do cadastro necessários para a classificação.
 * A via de uso é opcional e não determina a equipe.
 */
export type CadastroParaClassificacao = Readonly<
  Pick<Substance, "procedureType" | "doctorParticipation"> &
  Partial<Pick<Substance, "viaUso">>
>;

/**
 * Traduz um cadastro já recebido em recursos, sem ler ou alterar o cadastro.
 * Não agenda, não consulta banco e não cria ocorrências de consulta.
 */
export function recursosParaSubstancia(cadastro: CadastroParaClassificacao): RecursoOcorrencia[] {
  if (cadastro === null || typeof cadastro !== "object" || Array.isArray(cadastro)) {
    throw new Error("CADASTRO_INVALIDO: informe um cadastro de substância");
  }

  const { procedureType, doctorParticipation } = cadastro;
  if (doctorParticipation === null || doctorParticipation === undefined) {
    throw new Error("PARTICIPACAO_INDEFINIDA: defina a participação médica no cadastro");
  }
  if (typeof doctorParticipation !== "boolean") {
    throw new Error("PARTICIPACAO_INVALIDA: participação médica deve ser verdadeira ou falsa");
  }
  if (procedureType !== "im" && procedureType !== "sc" &&
      procedureType !== "iv" && procedureType !== "implant") {
    throw new Error("PROCEDIMENTO_NAO_SUPORTADO: confira o procedimento cadastrado");
  }
  if (procedureType === "implant" && doctorParticipation === false) {
    throw new Error("IMPLANTE_CONTRADITORIO: implante exige participação médica");
  }

  return recursosPorOcorrencia({
    tipo: doctorParticipation ? "medico" : "enfermagem",
    procedimento: procedureType === "implant" ? "implant" : "outro",
    participacaoMedica: doctorParticipation,
  });
}
