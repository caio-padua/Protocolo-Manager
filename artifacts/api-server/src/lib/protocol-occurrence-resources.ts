/**
 * Classificação isolada de uma ocorrência clínica.
 *
 * Esta função não lê catálogo, banco ou agenda e não reserva recursos.
 * Datas, substâncias e doses não são necessárias para classificar uma consulta.
 * A montagem de visitas e a ordem entre consulta e aplicação não são decididas aqui.
 */
export type TipoOcorrencia = "consulta" | "enfermagem" | "medico";
export type RecursoOcorrencia = "medico" | "enfermagem";

export interface OcorrenciaParaClassificacao {
  /** Classificação clínica explícita, não inferida a partir da via. */
  tipo: TipoOcorrencia;
  /** "implant" corresponde ao valor já usado no cadastro; "outro" admite outro procedimento. */
  procedimento?: "implant" | "outro";
  /** A via é informativa para esta função e nunca determina a equipe. */
  via?: string;
  /** Quando informado, este dado deve concordar com a classificação explícita. */
  participacaoMedica?: boolean;
}

function classificacaoInvalida(motivo: string): never {
  throw new Error(`CLASSIFICACAO_INVALIDA: ${motivo}`);
}

export function recursosPorOcorrencia(ocorrencia: OcorrenciaParaClassificacao): RecursoOcorrencia[] {
  if (ocorrencia === null || typeof ocorrencia !== "object" || Array.isArray(ocorrencia)) {
    return classificacaoInvalida("informe uma ocorrência");
  }

  const { tipo, procedimento, via, participacaoMedica } = ocorrencia;
  let recursos: RecursoOcorrencia[];
  switch (tipo) {
    case "consulta":
      recursos = ["medico"];
      break;
    case "enfermagem":
      recursos = ["enfermagem"];
      break;
    case "medico":
      recursos = ["medico", "enfermagem"];
      break;
    default:
      return classificacaoInvalida("tipo de ocorrência ausente ou desconhecido");
  }

  if (procedimento !== undefined && procedimento !== "implant" && procedimento !== "outro") {
    return classificacaoInvalida("procedimento desconhecido");
  }
  if (via !== undefined && (typeof via !== "string" || via.trim().length === 0)) {
    return classificacaoInvalida("via inválida");
  }
  if (participacaoMedica !== undefined && typeof participacaoMedica !== "boolean") {
    return classificacaoInvalida("participação médica inválida");
  }
  if (procedimento === "implant" && tipo !== "medico") {
    return classificacaoInvalida("implante exige classificação de procedimento médico");
  }
  if (participacaoMedica !== undefined && participacaoMedica !== (tipo !== "enfermagem")) {
    return classificacaoInvalida("participação médica contradiz o tipo de ocorrência");
  }
  return recursos;
}
