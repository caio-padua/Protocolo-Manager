import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";

const apiBase = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`;

export type OpcaoAgenda = { id: number; nome: string; modalidade: string; professionalId: number | null };
export type Participante = {
  ordem: number; categoryId: number; categoryName: string; alternativeCategoryIds: number[]; professionalIds: number[];
  modalidade: "local" | "online" | "externo" | "home_care"; agendaId: number | null; agendaOrigem: "sugerida" | "escolhida" | null;
  agendaNome: string | null; opcoesAgenda: OpcaoAgenda[];
  /** Nível mínimo exigido pelo procedimento ("enfermeiro"); o servidor reaplica, a tela só informa. */
  exigeNivel: string | null;
  /** "preferencia" = profissional sugerido pela preferência da agenda (editável); null = escolhido por pessoa ou nenhum. */
  profissionalOrigem: string | null;
};
export type Visita = { sessionId: number; agenda: string | null; googleEventId: string | null; pendente: boolean };
export type Ocorrencia = {
  id: number; numero: number; data: string | null; hora: string | null; origem: "automatica" | "manual";
  motivo: string | null; reservada: boolean; visitas: Visita[];
  enderecoVisita: string | null; enderecoVisitaOrigem: "paciente" | "informado" | null;
};
export type ItemPlano = {
  id: number; procedimentoId: number; nome: string; totalSessoes: number; intervaloDias: number; dataInicio: string | null;
  duracaoSegundos: number; dose: string | null; equipeOrigem: string; origemRequisito: string | null;
  homeCare: boolean;
  equipe: Participante[]; problema: { code: string; message: string; opcoes?: unknown } | null; ocorrencias: Ocorrencia[];
};
export type EstadoPlano = "pendente" | "em_revisao" | "confirmado" | "cancelado";
export type SyncEstado = "nao_iniciada" | "sincronizado" | "parcial" | "erro";
export type Plano = {
  id: number; estado: EstadoPlano; syncEstado: SyncEstado; syncDetalhe: { visitas?: { sessionId: number; date: string; time: string; status: string; error?: string; agenda: string | null; procedimento: string }[]; motivo?: string | null } | null;
  syncEm: string | null; versao: number; protocolId: number; protocolo: string; clienteId: number; cliente: string;
  prescritor: string | null; prescritorId: number | null; revisor: string | null; revisorId: number | null;
  revisaoExpiraEm: string | null; revisaoExpirada: boolean; confirmador: string | null; confirmadoEm: string | null;
  itens: ItemPlano[];
  profissionaisPorCategoria: { id: number; name: string; categoryId: number; habilitacaoNivel: string | null; situacaoRegistro: string }[];
  categorias: { id: number; name: string }[];
  enderecoPaciente: string | null; preferidosPorAgenda: Record<string, number[]>;
};
export type LinhaFila = {
  id: number; estado: EstadoPlano; syncEstado: SyncEstado; protocolId: number; versao: number; criadoEm: string; confirmadoEm: string | null;
  revisaoExpiraEm: string | null; revisaoExpirada: boolean; clienteId: number; cliente: string; prescritor: string | null;
  revisor: string | null; revisorId: number | null; itens: number; ocorrencias: number; semData: number;
};
export type ResultadoOcorrencia = { itemId: number; numero: number; data: string | null; hora: string | null; ok: boolean; code?: string; message?: string };

export class PitStopErro extends Error {
  constructor(message: string, readonly code: string, readonly corpo: Record<string, unknown>) { super(message); }
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${apiBase}${caminho}`, { ...init, headers: collabAuthHeaders({ "Content-Type": "application/json" }) });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new PitStopErro(String(corpo.error ?? "Não foi possível concluir a operação."), String(corpo.code ?? "erro"), corpo);
  return corpo as T;
}
const post = <T,>(c: string, body: unknown = {}) => chamar<T>(c, { method: "POST", body: JSON.stringify(body) });
const put = <T,>(c: string, body: unknown) => chamar<T>(c, { method: "PUT", body: JSON.stringify(body) });

type RespostaPlano = { plano: Plano; planoId?: number; repetido?: boolean; sincronizacao?: { estado: SyncEstado; motivo?: string } | null };

export const CHAVE_FILA = ["pit-stop", "fila"] as const;
export const chavePlano = (id: number) => ["pit-stop", "plano", id] as const;

export function useFilaPitStop(estado?: string, busca?: string) {
  return useQuery({
    queryKey: [...CHAVE_FILA, estado ?? "todos", busca ?? ""],
    queryFn: () => chamar<{ planos: LinhaFila[] }>(`/agendamento/pit-stop?${new URLSearchParams({ ...(estado ? { estado } : {}), ...(busca ? { busca } : {}) })}`),
    refetchInterval: 20_000,
  });
}

export function usePlano(id: number | null) {
  return useQuery({
    queryKey: chavePlano(id ?? 0),
    enabled: id !== null,
    queryFn: () => chamar<RespostaPlano>(`/agendamento/planos/${id}`).then((r) => r.plano),
    refetchInterval: 15_000,
  });
}

/** Todas as ações devolvem o plano completo e atualizado: a tela nunca monta o estado por conta própria. */
export function useAcoesPlano(id: number) {
  const qc = useQueryClient();
  const atualizar = (r: RespostaPlano) => {
    qc.setQueryData(chavePlano(id), r.plano);
    void qc.invalidateQueries({ queryKey: CHAVE_FILA });
    return r;
  };
  const m = <V,>(fn: (v: V) => Promise<RespostaPlano>) => useMutation({ mutationFn: fn, onSuccess: atualizar });
  return {
    abrir: m(() => post<RespostaPlano>(`/agendamento/planos/${id}/abrir`)),
    liberar: m(() => post<RespostaPlano>(`/agendamento/planos/${id}/liberar`)),
    cancelar: m(() => post<RespostaPlano>(`/agendamento/planos/${id}/cancelar`)),
    confirmar: m((versao: number) => post<RespostaPlano>(`/agendamento/planos/${id}/confirmar`, { versao })),
    sincronizar: m(() => post<RespostaPlano>(`/agendamento/planos/${id}/sincronizar`)),
    ocorrencias: m((v: { versao: number; ajustes: AjusteOcorrencia[] }) =>
      put<RespostaPlano>(`/agendamento/planos/${id}/ocorrencias`, v)),
    equipe: m((v: { versao: number; itemId: number; equipe: { categoryId: number; alternativeCategoryIds?: number[]; professionalIds?: number[]; modalidade?: string; agendaId?: number | null }[] }) =>
      put<RespostaPlano>(`/agendamento/planos/${id}/itens/${v.itemId}/equipe`, { versao: v.versao, equipe: v.equipe })),
    revalidar: useMutation({
      mutationFn: () => post<{ ok: boolean; resultados: ResultadoOcorrencia[] }>(`/agendamento/planos/${id}/revalidar`),
    }),
  };
}

export type AjusteOcorrencia = { id: number; data: string | null; hora: string | null; enderecoVisita?: string; usarEnderecoPaciente?: boolean };
export const ROTULO_NIVEL: Record<string, string> = { enfermeiro: "Enfermeiro(a)", tecnico_enfermagem: "Técnico(a) de enfermagem", auxiliar_enfermagem: "Auxiliar de enfermagem" };

export type EntradaProcedimento = {
  procedimentoId: number; totalSessoes?: number; intervaloDias?: number; dataInicio?: string | null;
  produtoId?: number | null; dose?: string | null;
};
export const criarPlanoDoProtocolo = (protocoloId: number, procedimentos: EntradaProcedimento[], assumir = true) =>
  post<RespostaPlano>(`/protocols/${protocoloId}/plano-agendamento`, { procedimentos, assumir });

export type ProcedimentoCatalogo = { id: number; nome: string; duracaoMinutos: number; ativo: boolean };
export function useProcedimentosAtivos(enabled = true) {
  return useQuery({
    queryKey: ["pit-stop", "catalogo-procedimentos"], enabled,
    queryFn: () => chamar<{ procedimentos: ProcedimentoCatalogo[] }>("/procedimentos").then((r) => r.procedimentos.filter((p) => p.ativo)),
  });
}

export const ROTULO_ESTADO: Record<EstadoPlano, string> = {
  pendente: "Pendente", em_revisao: "Em revisão", confirmado: "Confirmado", cancelado: "Cancelado",
};
export const ROTULO_SYNC: Record<SyncEstado, string> = {
  nao_iniciada: "Google: ainda não enviado", sincronizado: "Google: sincronizado", parcial: "Google: parcial, há pendência", erro: "Google: erro, há pendência",
};
export const ROTULO_MOTIVO: Record<string, string> = {
  escolha_agenda_pendente: "Escolha pendente: há mais de uma agenda possível e nenhuma é a padrão da clínica.",
  sem_agenda_da_categoria: "Nenhuma agenda ativa desta categoria e modalidade na clínica.",
  sem_horario_disponivel: "Sem horário livre para a equipe inteira nas próximas semanas.",
  sem_data_escolhida: "Data ainda não escolhida.",
  sem_data: "Falta escolher data e horário.",
  horario_indisponivel: "Horário já ocupado para alguém da equipe.",
};
export const motivoLegivel = (code: string | null | undefined, fallback?: string) => (code && ROTULO_MOTIVO[code]) || fallback || code || "";
