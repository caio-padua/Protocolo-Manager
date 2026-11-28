import { eq } from "drizzle-orm";
import { db, protocolItemsTable, protocolsTable } from "@workspace/db";

/**
 * K7 — Protocolo completo constante.
 *
 * Toda visita mostra TODAS as substâncias do protocolo. As que não têm linha na visita (a frequência não permite
 * naquela semana, ou o ciclo delas já terminou) aparecem como "constantes". O cálculo é feito na LEITURA, por esta
 * função única (Google e tela usam a mesma): nenhuma linha é gravada e nenhum dado antigo é alterado.
 */

export interface ItemDoProtocolo { substanceId: number; dose: string; totalSessions: number }
export interface AplicacaoDaVisita { substanceId: number; availability: string }

export interface ResumoSubstanciasDaVisita {
  /** Substâncias distintas que têm aplicação disponível (DISP) nesta visita. */
  visitCount: number;
  /**
   * Substâncias distintas LISTADAS na visita: itens do protocolo mais qualquer linha da visita sem item correspondente.
   * Assim X nunca passa de Y e Y é exatamente o que a enfermagem vê na lista.
   */
  protocolCount: number;
  /** Substâncias do protocolo sem linha nesta visita, na ordem do protocolo. */
  constants: ItemDoProtocolo[];
}

/** Nulo = protocolo sem itens gravados: não há como afirmar a composição, então nada é acrescentado. */
export function resumirSubstanciasDaVisita(
  applications: AplicacaoDaVisita[], items: ItemDoProtocolo[],
): ResumoSubstanciasDaVisita | null {
  if (items.length === 0) return null;
  const inVisit = new Set(applications.map(a => a.substanceId));
  const due = new Set(applications.filter(a => a.availability === "disp").map(a => a.substanceId));
  const seen = new Set<number>();
  const constants: ItemDoProtocolo[] = [];
  for (const item of items) {
    if (seen.has(item.substanceId)) continue; // mesma substância em dois itens conta uma vez
    seen.add(item.substanceId);
    if (!inVisit.has(item.substanceId)) constants.push(item);
  }
  const protocolSubstances = new Set([...seen, ...inVisit]);
  return { visitCount: due.size, protocolCount: protocolSubstances.size, constants };
}

/**
 * Itens do protocolo da visita. `memo` evita repetir a consulta por visita quando a lista de sessões é montada.
 * Isolamento: só devolve itens se o protocolo pertence à MESMA empresa da visita. Referência inconsistente
 * (protocolo de outra empresa ou sem empresa) não expõe nada: devolve vazio e registra o aviso.
 */
export function carregarItensDoProtocolo(
  protocolId: number, empresaId: number | null, memo?: Map<number, Promise<ItemDoProtocolo[]>>,
): Promise<ItemDoProtocolo[]> {
  const cached = memo?.get(protocolId);
  if (cached) return cached;
  // Promise de verdade (o construtor de consultas do drizzle re-executa a cada await). Ordem do protocolo = ordem de gravação.
  const loading: Promise<ItemDoProtocolo[]> = (async () => {
    const [protocol] = await db.select({ empresaId: protocolsTable.empresaId }).from(protocolsTable)
      .where(eq(protocolsTable.id, protocolId));
    if (!protocol || empresaId === null || protocol.empresaId !== empresaId) {
      console.warn(`[substancias-constantes] protocolo ${protocolId} não pertence à empresa da visita; itens não carregados.`);
      return [];
    }
    const rows = await db.select({
      id: protocolItemsTable.id, substanceId: protocolItemsTable.substanceId, dose: protocolItemsTable.dose,
      totalSessions: protocolItemsTable.totalSessions,
    }).from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocolId));
    return [...rows].sort((a, b) => a.id - b.id)
      .map(({ substanceId, dose, totalSessions }) => ({ substanceId, dose, totalSessions }));
  })();
  memo?.set(protocolId, loading);
  return loading;
}
