import type { LembretePeriodoJson } from "@workspace/db";
import { MAPA_PERIODO, type PeriodoAntigo } from "./lembrete-periodo";
import { montarMensagemPaxmed } from "./mensageria-paxmed";
import { templateLembretePrescricao } from "./lembrete-templates";

export function mapPeriodosTextoToCanonicos(texto: string): PeriodoAntigo[] {
  const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
  const map: Record<string, PeriodoAntigo> = {
    jejum: "jejum", "ao acordar": "manha", "inicio da manha": "manha", manha: "manha",
    "meio da manha": "meio_manha", "meio manha": "meio_manha",
    almoco: "almoco", "antes do almoco": "almoco", "2h antes do almoco": "almoco",
    "inicio da tarde": "tarde", "a tarde": "tarde", tarde: "tarde",
    "meio tarde": "meio_tarde", "meio da tarde": "meio_tarde",
    noite: "noite", "antes do jantar": "noite", "2h antes do jantar": "noite",
    "final da noite": "final_noite", "final noite": "final_noite", ceia: "ceia",
  };
  const result = texto.split(";").map(p => map[norm(p)]).filter((p): p is PeriodoAntigo => !!p);
  return result.length ? result : ["manha", "noite"];
}

export async function montarMensagemLembrete(clienteNome: string, periodos: LembretePeriodoJson[], agora: Date) {
  try {
    const nome = clienteNome.trim().split(/\s+/)[0] || clienteNome;
    const rich = await montarMensagemPaxmed({ nome, agora, periodos });
    if (rich) return rich;
  } catch { /* Same explicit fallback as the recurring engine. */ }
  return templateLembretePrescricao({ clienteNome, clienteGenero: "nao_informado", periodos, agora });
}

export async function prescriptionReminderMessage(
  nome: string, items: { name: string; dose: string | null; periodo: string | null }[],
) {
  const periodos = new Map<string, LembretePeriodoJson>();
  for (const item of items) for (const key of mapPeriodosTextoToCanonicos(item.periodo || "")) {
    const canon = MAPA_PERIODO[key];
    const block = periodos.get(canon.sigla) || { sigla: canon.sigla, nome: canon.nome, tipo: "tomar", formulas: [] };
    block.formulas.push({ nome: item.name, dose: item.dose ?? undefined });
    periodos.set(canon.sigla, block);
  }
  return montarMensagemLembrete(nome, [...periodos.values()], new Date());
}
