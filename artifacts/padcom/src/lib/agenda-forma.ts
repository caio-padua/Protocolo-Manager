// Vocabulario unico da agenda (decisao do CEO, 11/11/2026; ver specs/agenda-forma-online.md).
// A FORMA de atendimento de uma agenda tem tres valores de tela: Sede, Online, Outro local.
// Valores gravados: agenda_resources.modality = local | online | externo; locations.agenda_papel = local | online | externo | pessoal | geral.
export const FORMA_ROTULO: Record<string, string> = {
  local: "Sede",
  online: "Online",
  externo: "Outro local",
  domiciliar: "Domiciliar (legado)",
};
export const rotuloDaForma = (valor: string | null | undefined): string => FORMA_ROTULO[valor ?? ""] ?? (valor || "Não informada");
