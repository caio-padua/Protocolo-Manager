import type { QueryClient } from "@tanstack/react-query";
import { getListAgendaResourcesQueryKey } from "@workspace/api-client-react";

/**
 * Regra do CEO: mudou a Agenda Configuração (ou o vínculo no cadastro do profissional), mudou em TUDO.
 * Esta é a lista única das consultas que dependem de agenda. Toda tela que muda agenda, janela, titular,
 * local ou vínculo chama `propagarMudancaDeAgenda`; toda tela nova que lê agenda usa uma chave que
 * começa com um destes prefixos e entra sozinha na propagação.
 */
const PREFIXOS_QUE_DEPENDEM_DE_AGENDA = [
  "/api/agenda",
  "/api/sessions",
  "/api/locations",
  "agenda", // agenda-integracao, agenda-solicitacoes, agenda-calendars, agenda-booking-*, agenda-do-profissional, agendas-google-conta
  "google-compromissos",
  "professional-locations",
  "semantic-code-locations",
  "empresas-locais-confirmados",
  "cliente-agendas-clinica",
  "pit-stop",
] as const;

export function chaveDependeDeAgenda(chave: unknown): boolean {
  return typeof chave === "string" && PREFIXOS_QUE_DEPENDEM_DE_AGENDA.some((p) => chave.startsWith(p));
}

/** Marca como desatualizado e recarrega tudo que depende de agenda (as telas abertas atualizam na hora). */
export function propagarMudancaDeAgenda(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => chaveDependeDeAgenda(q.queryKey[0]) });
}

/**
 * Opções das consultas de agenda: sempre buscam ao abrir a tela e ao voltar para a aba.
 * Assim, uma mudança feita em outra aba ou por outra pessoa aparece sem recarregar a página.
 */
export const agendaResourcesFrescas = {
  query: { queryKey: getListAgendaResourcesQueryKey(), staleTime: 0, refetchOnWindowFocus: true },
} as const;
