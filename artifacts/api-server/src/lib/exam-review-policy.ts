import { medicalRegistration } from "./clinical-emitter.js";

export interface ExamReviewerProfile {
  id: number;
  name: string;
  role: string | null;
  category: string | null;
  professionalType: string | null;
  active: boolean;
  crm: string | null;
  registrationNumber: string | null;
  registrationCouncil: string | null;
}

export type ExamReviewAuthorization =
  | { allowed: true; professional: ExamReviewerProfile }
  | { allowed: false; status: 400 | 401 | 403 | 422; error: string };

export function authorizeExamReviewer(input: {
  phase: 1 | 2;
  authenticatedProfessionalId: number | null | undefined;
  requestedProfessionalId?: unknown;
  professional: ExamReviewerProfile | undefined;
  companyMatches: boolean;
  clinicalMembershipValidated: boolean;
}): ExamReviewAuthorization {
  const actorId = input.authenticatedProfessionalId;
  if (!Number.isSafeInteger(actorId) || !actorId || actorId <= 0) {
    return { allowed: false, status: 401, error: "Sessão de colaborador inválida." };
  }

  if (input.requestedProfessionalId !== undefined && input.requestedProfessionalId !== null) {
    const requestedId = Number(input.requestedProfessionalId);
    if (!Number.isSafeInteger(requestedId) || requestedId <= 0) {
      return { allowed: false, status: 400, error: "Identificador de conferente inválido." };
    }
    if (requestedId !== actorId) {
      return { allowed: false, status: 403, error: "O conferente deve ser o colaborador autenticado." };
    }
  }

  const professional = input.professional;
  if (!professional || professional.id !== actorId || !professional.active) {
    return { allowed: false, status: 403, error: "O colaborador autenticado não está ativo." };
  }
  if (!input.companyMatches) {
    return { allowed: false, status: 403, error: "Sem vínculo ativo com a clínica deste exame." };
  }

  if (input.phase === 2) {
    if (professional.professionalType !== "medico" || professional.category !== "medico") {
      return { allowed: false, status: 403, error: "A conferência clínica exige um médico ativo." };
    }
    if (!input.clinicalMembershipValidated) {
      return { allowed: false, status: 403, error: "O médico não tem vínculo clínico ativo com a unidade do cliente." };
    }
    try {
      const registration = medicalRegistration(professional);
      if (!registration.uf) {
        return { allowed: false, status: 422, error: "O registro médico precisa informar um estado válido." };
      }
    } catch {
      return { allowed: false, status: 422, error: "O cadastro do médico precisa ter registro profissional válido." };
    }
  }

  return { allowed: true, professional };
}

export function nextExamReviewStatus(
  currentStatus: string,
  phase: 1 | 2,
): { status: "conferido_1" | "conferido" } | { error: string } {
  if (phase === 1 && currentStatus === "recebido") return { status: "conferido_1" };
  if (phase === 2 && currentStatus === "conferido_1") return { status: "conferido" };
  if (currentStatus === "processando") return { error: "Documento ainda em processamento." };
  if (currentStatus === "erro") return { error: "Documento com erro de leitura; não pode ser conferido." };
  return phase === 1
    ? { error: "A conferência operacional só vale quando o documento está recebido." }
    : { error: "Faça a conferência operacional antes da conferência clínica." };
}
