/** Interpretação única dos registros reais de aplicação usados nas agendas. */
export type EstadoAplicacao = "disp" | "prox" | "applied" | "notPerformed" | "unavailable" | "review";

export function estadoAplicacao(input: {
  status: string; availability: string; appliedAt: string | null;
}): EstadoAplicacao {
  if (input.status === "applied" && input.appliedAt && input.availability === "disp") return "applied";
  if (input.status === "missed" && !input.appliedAt && input.availability === "disp") return "notPerformed";
  if (input.status === "pending" && !input.appliedAt) {
    if (input.availability === "disp") return "disp";
    if (input.availability === "prox") return "prox";
    if (input.availability === "missed") return "unavailable";
  }
  return "review";
}
