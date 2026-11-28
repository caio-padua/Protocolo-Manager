import { and, eq, gte } from "drizzle-orm";
import { db, pulsoDiarioTable } from "@workspace/db";

/**
 * Regra do Pulso Diário (Dr. Caio, 22/11/2026). Documento oficial: docs/parametrizacoes-gerais/pulso-diario.md
 *   manhã = sono da NOITE PASSADA · tarde = energia · noite = libido.
 * Pendências: sono repete à tarde e à noite; energia repete à noite;
 * libido não avaliada à noite só pode ser avaliada na MANHÃ SEGUINTE e é gravada na noite de ontem.
 * Depois da manhã o prazo da libido de ontem acaba; resposta dada à tarde vale para o próprio dia.
 * A tela "Registrar agora" (MeuPulsoCliente) repete esta regra com os mesmos textos.
 */
export type CampoNota = "sono" | "energia" | "libido";
export type PeriodoPulso = "manha" | "tarde" | "noite";

export const NOTA_DO_PERIODO: Record<PeriodoPulso, CampoNota> = { manha: "sono", tarde: "energia", noite: "libido" };
export const ROTULO_NOTA: Record<CampoNota, string> = { sono: "Sono", energia: "Energia", libido: "Libido" };

export const somaDias = (iso: string, d: number): string => {
  const [a, m, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, dia! + d)).toISOString().slice(0, 10);
};
export const dataBr = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

export type PerguntaPulso = {
  campo: CampoNota;
  /** Texto da pergunta, dizendo exatamente a que momento a nota se refere. */
  enunciado: string;
  /** Preenchido quando a nota é atrasada (não respondida no momento certo). */
  pendente: string | null;
  /** libido de ontem à noite é gravada no registro de ontem. */
  gravaEm: "hoje" | "ontem_noite";
};

export function enunciadoPrincipal(campo: CampoNota, hoje: string): string {
  const ontem = somaDias(hoje, -1);
  if (campo === "sono") return `Como foi o seu sono na noite passada (de ${dataBr(ontem)} para ${dataBr(hoje)})? Dê uma nota de 0 a 10.`;
  if (campo === "energia") return `Como está a sua energia hoje à tarde (${dataBr(hoje)})? Dê uma nota de 0 a 10.`;
  return `Como está a sua libido hoje, ${dataBr(hoje)}? Dê uma nota de 0 a 10. Responder é opcional.`;
}

export function montarPerguntas(
  registros: Array<{ data: string; periodo: string; sono: number | null; energia: number | null; libido: number | null }>,
  hoje: string,
  periodo: PeriodoPulso,
): PerguntaPulso[] {
  const ontem = somaDias(hoje, -1);
  const tem = (d: string, c: CampoNota) => registros.some((r) => r.data === d && r[c] != null);
  const p = (campo: CampoNota, pendente: string | null, gravaEm: "hoje" | "ontem_noite" = "hoje", enunciado?: string): PerguntaPulso =>
    ({ campo, pendente, gravaEm, enunciado: enunciado ?? enunciadoPrincipal(campo, hoje) });
  const lista = [p(NOTA_DO_PERIODO[periodo], null)];
  if (periodo !== "manha" && !tem(hoje, "sono"))
    lista.push(p("sono", `Você não avaliou o sono da noite passada (de ${dataBr(ontem)} para ${dataBr(hoje)}). Avalie agora.`));
  if (periodo === "noite" && !tem(hoje, "energia"))
    lista.push(p("energia", `Você não avaliou a sua energia desta tarde (${dataBr(hoje)}). Avalie agora.`));
  if (periodo === "manha" && !tem(ontem, "libido"))
    lista.push(p("libido", `Você não avaliou a sua libido de ontem à noite (${dataBr(ontem)}). Avalie agora: depois desta manhã esse prazo termina.`, "ontem_noite",
      `Como foi a sua libido ontem à noite, ${dataBr(ontem)}? Dê uma nota de 0 a 10. Responder é opcional.`));
  return lista;
}

export async function perguntasDoPeriodo(clienteId: number, hoje: string, periodo: PeriodoPulso): Promise<PerguntaPulso[]> {
  const registros = await db.select().from(pulsoDiarioTable)
    .where(and(eq(pulsoDiarioTable.clienteId, clienteId), gte(pulsoDiarioTable.data, somaDias(hoje, -1))));
  return montarPerguntas(registros, hoje, periodo);
}

export async function jaRespondeuAPrincipal(clienteId: number, hoje: string, periodo: PeriodoPulso): Promise<boolean> {
  const campo = NOTA_DO_PERIODO[periodo];
  const linhas = await db.select().from(pulsoDiarioTable)
    .where(and(eq(pulsoDiarioTable.clienteId, clienteId), eq(pulsoDiarioTable.data, hoje)));
  return linhas.some((r) => r[campo] != null);
}

/** Grava a libido de ontem à noite sem tocar nos outros campos do registro de ontem. Só se ainda não houver nota. */
export async function gravarLibidoOntem(clienteId: number, hoje: string, nota: number, origem: string): Promise<void> {
  const ontem = somaDias(hoje, -1);
  const [atual] = await db.select().from(pulsoDiarioTable).where(and(
    eq(pulsoDiarioTable.clienteId, clienteId), eq(pulsoDiarioTable.data, ontem), eq(pulsoDiarioTable.periodo, "noite")));
  if (atual?.libido != null) return;
  if (atual) {
    await db.update(pulsoDiarioTable).set({ libido: nota, updatedAt: new Date() }).where(eq(pulsoDiarioTable.id, atual.id));
  } else {
    await db.insert(pulsoDiarioTable).values({ clienteId, data: ontem, periodo: "noite", libido: nota, origem });
  }
}
