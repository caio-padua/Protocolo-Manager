// Vocabulario unico da agenda (decisao do CEO, 11/11/2026; ver specs/agenda-forma-online.md).
// A FORMA de atendimento de uma agenda tem QUATRO valores de tela: Sede, Online, Local externo, Home Care (decisao do CEO, 22/11/2026).
// Valores gravados: agenda_resources.modality = local | online | externo | home_care; locations.agenda_papel = local | online | externo | pessoal | geral.
export const FORMA_ROTULO: Record<string, string> = {
  local: "Sede",
  online: "Online",
  externo: "Local externo",
  home_care: "Home Care",
  domiciliar: "Domiciliar (legado)",
};
export const rotuloDaForma = (valor: string | null | undefined): string => FORMA_ROTULO[valor ?? ""] ?? (valor || "Não informada");
