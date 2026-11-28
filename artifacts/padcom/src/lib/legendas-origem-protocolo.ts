/**
 * Legenda de origem dos campos do lançador de protocolo (pedido do CEO, 11/11/2026).
 * Letra = de onde o dado nasce; número = ordem dentro dessa origem.
 *   C = Cadastro do cliente | M = Agenda Configuração | E = Equipe (profissionais)
 * Todo campo ligado mostra o código no canto da placa e o caminho da tela de origem.
 */
export const LEGENDAS_ORIGEM = {
  C1: "Cadastro de Clientes › Nome",
  C2: "Cliente › Clínica de origem",
  C3: "Cliente › Agenda de enfermagem",
  C4: "Cliente › Agenda médica",
  M1: "Agenda Configuração › Janelas › Início do expediente",
  M2: "Agenda Configuração › Janelas › Início do expediente",
  E1: "Equipe › Médico da agenda",
  E2: "Equipe › Enfermagem do local",
} as const;

export type CodigoLegenda = keyof typeof LEGENDAS_ORIGEM;
