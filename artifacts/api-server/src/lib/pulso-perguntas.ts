import { and, eq, gte } from "drizzle-orm";
import { db, pulsoDiarioTable } from "@workspace/db";

/**
 * Regra do Pulso Diário (Dr. Caio, 22/11/2026): uma nota por período.
 *   manhã = sono · tarde = energia · noite = libido.
 * Nota sem resposta reaparece: sono na tarde e na noite; energia na noite;
 * libido de ontem à noite é perguntada na manhã seguinte.
 * Mesma regra da tela "Registrar agora" (MeuPulsoCliente) e do mini aplicativo do Telegram.
 */
export type CampoNota = "sono" | "energia" | "libido";
export type PeriodoPulso = "manha" | "tarde" | "noite";

export const NOTA_DO_PERIODO: Record<PeriodoPulso, CampoNota> = { manha: "sono", tarde: "energia", noite: "libido" };
export const ROTULO_NOTA: Record<CampoNota, string> = { sono: "Sono", energia: "Energia", libido: "Libido" };

const somaDias = (iso: string, d: number): string => {
  const [a, m, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, dia! + d)).toISOString().slice(0, 10);
};

export type PerguntaPulso = { campo: CampoNota; pendente: string | null };

export async function perguntasDoPeriodo(clienteId: number, hoje: string, periodo: PeriodoPulso): Promise<PerguntaPulso[]> {
  const ontem = somaDias(hoje, -1);
  const linhas = await db.select().from(pulsoDiarioTable)
    .where(and(eq(pulsoDiarioTable.clienteId, clienteId), gte(pulsoDiarioTable.data, ontem)));
  const tem = (data: string, c: CampoNota, per?: PeriodoPulso) =>
    linhas.some((r) => r.data === data && r[c] != null && (!per || r.periodo === per));
  const lista: PerguntaPulso[] = [{ campo: NOTA_DO_PERIODO[periodo], pendente: null }];
  if (periodo !== "manha" && !tem(hoje, "sono")) lista.push({ campo: "sono", pendente: "Você não respondeu sobre o sono de manhã. Responda agora." });
  if (periodo === "noite" && !tem(hoje, "energia")) lista.push({ campo: "energia", pendente: "Você não respondeu sobre a energia à tarde. Responda agora." });
  if (periodo === "manha" && !tem(ontem, "libido") && !tem(hoje, "libido", "manha")) lista.push({ campo: "libido", pendente: "Você não respondeu sobre a libido ontem à noite. Responda agora." });
  return lista;
}

export async function jaRespondeuAPrincipal(clienteId: number, hoje: string, periodo: PeriodoPulso): Promise<boolean> {
  const campo = NOTA_DO_PERIODO[periodo];
  const linhas = await db.select().from(pulsoDiarioTable)
    .where(and(eq(pulsoDiarioTable.clienteId, clienteId), eq(pulsoDiarioTable.data, hoje)));
  return linhas.some((r) => r[campo] != null);
}
