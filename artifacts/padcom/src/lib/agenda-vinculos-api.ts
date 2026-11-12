import { useQuery } from "@tanstack/react-query";
import { collabAuthHeaders, getCollabProfessional } from "@/lib/collab-auth";

const apiBase = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`;

/** Ligação agenda <-> profissional. As chaves de consulta começam com "agenda": entram na propagação central. */
export type OrigemVinculo = "individual" | "local" | "preferencia";

export interface ProfissionalVinculado {
  id: number;
  name: string;
  active: boolean;
  categoriaId: number | null;
  categoriaNome: string | null;
  habilitacaoNivel: string | null;
  origens: OrigemVinculo[];
}

export interface VinculosDaAgenda {
  agenda: { id: number; name: string; locationId: number | null; professionalId: number | null };
  profissionais: ProfissionalVinculado[];
}

export interface AgendaDoProfissional {
  id: number;
  name: string;
  locationId: number | null;
  empresaId: number;
  modality: string | null;
  color: string | null;
  categoriaId: number | null;
  categoriaNome: string | null;
  vinculado: boolean;
  origens: OrigemVinculo[];
  editavelNoCadastro: boolean;
  motivoBloqueio: string | null;
}

export const ROTULO_ORIGEM: Record<OrigemVinculo, string> = {
  individual: "Titular da agenda",
  local: "Vínculo do cadastro",
  preferencia: "Preferido da agenda",
};

async function lerCorpo(r: Response): Promise<unknown> {
  return r.json().catch(() => null);
}

function mensagemDoErro(corpo: unknown, padrao: string): string {
  const erro = (corpo as { error?: unknown } | null)?.error;
  return typeof erro === "string" && erro ? erro : padrao;
}

export async function carregarVinculosDaAgenda(agendaId: number, signal?: AbortSignal): Promise<VinculosDaAgenda> {
  const r = await fetch(`${apiBase}/agenda/resources/${agendaId}/profissionais-vinculados`, { headers: collabAuthHeaders(), signal });
  const corpo = await lerCorpo(r);
  if (!r.ok) throw new Error(mensagemDoErro(corpo, "Não foi possível consultar os profissionais desta agenda."));
  const vinculos = corpo as Partial<VinculosDaAgenda> | null;
  if (!vinculos || !Array.isArray(vinculos.profissionais)) throw new Error("Resposta de profissionais da agenda inválida.");
  return vinculos as VinculosDaAgenda;
}

export async function carregarAgendasDoProfissional(professionalId: number, signal?: AbortSignal): Promise<AgendaDoProfissional[]> {
  const r = await fetch(`${apiBase}/professionals/${professionalId}/agendas`, { headers: collabAuthHeaders(), signal });
  const corpo = await lerCorpo(r);
  if (!r.ok) throw new Error(mensagemDoErro(corpo, "Não foi possível consultar as agendas da clínica."));
  const agendas = (corpo as { agendas?: AgendaDoProfissional[] } | null)?.agendas;
  if (!Array.isArray(agendas)) throw new Error("Resposta de agendas inválida.");
  return agendas;
}

export async function definirVinculoComAgenda(professionalId: number, agendaId: number, vinculado: boolean): Promise<void> {
  const r = await fetch(`${apiBase}/professionals/${professionalId}/agendas/${agendaId}/preferencia`, {
    method: "PUT",
    headers: collabAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ vinculado }),
  });
  if (!r.ok) throw new Error(mensagemDoErro(await lerCorpo(r), "Não foi possível alterar o vínculo com a agenda."));
}

/** Agenda Configuração: quem o cadastro liga a esta agenda. */
export function useProfissionaisVinculadosDaAgenda(agendaId: number | null) {
  const quem = getCollabProfessional()?.id ?? null;
  return useQuery({
    queryKey: ["agenda-profissionais-vinculados", quem, agendaId],
    enabled: agendaId != null,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => carregarVinculosDaAgenda(agendaId as number, signal),
  });
}
