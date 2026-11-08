import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  getAgendaIntegration,
  refreshAgendaIntegration,
  updateAgendaReadSettings,
  updateAgendaPersonalOwner,
  listAgendaChangeRequests,
  createAgendaChangeRequest,
  decideAgendaChangeRequest,
  type AgendaReadSettingsInput,
  type AgendaPersonalOwnerInput,
  type AgendaWindowChangeInput,
  type AgendaChangeDecisionInputDecision,
} from "@workspace/api-client-react";
import { COLLAB_EVENT, collabAuthHeaders, getCollabProfessional } from "@/lib/collab-auth";

/** Identidade usada nas chaves de cache: profissional + papel. Nunca o token. */
export function useCollabIdentity(): string {
  const read = () => {
    const p = getCollabProfessional();
    const company = new Headers(collabAuthHeaders()).get("x-empresa-id") ?? "padrao";
    return p ? `empresa:${company}:prof:${p.id}:${p.role}` : "anonimo";
  };
  const [id, setId] = useState(read);
  useEffect(() => {
    const on = () => setId(read());
    window.addEventListener(COLLAB_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(COLLAB_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return id;
}

export const integrationKey = (identity: string) => ["agenda-integracao", identity] as const;
export const requestsKey = (identity: string) => ["agenda-solicitacoes", identity] as const;

export function errorStatus(err: unknown): number | null {
  const s = (err as { status?: unknown })?.status;
  return typeof s === "number" ? s : null;
}

export function describeError(err: unknown, fallback: string): string {
  const s = errorStatus(err);
  if (s === 401) return "Sessão de colaborador ausente ou expirada. Entre novamente pelo Portão do Colaborador.";
  if (s === 403) return "Seu acesso não permite esta ação neste local. Peça a quem administra o local.";
  if (s === 409) return "O estado mudou enquanto você editava. Os dados foram recarregados.";
  const data = (err as { data?: { error?: string } })?.data;
  return data?.error ?? fallback;
}

/** Invalida tudo que depende de agenda: integração, solicitações, compromissos, recursos, janelas, slots, sessões. */
export function invalidateAgendaWorld(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey[0];
      if (typeof k !== "string") return false;
      return (
        k === "agenda-integracao" ||
        k === "agenda-solicitacoes" ||
        k === "google-compromissos" ||
        k.startsWith("/api/agenda") ||
        k.startsWith("/api/sessions")
      );
    },
  });
}

export function useAgendaIntegration(options: { refetchInterval?: number | false } = {}) {
  const identity = useCollabIdentity();
  return useQuery({
    queryKey: integrationKey(identity),
    queryFn: ({ signal }) => getAgendaIntegration({ signal, headers: collabAuthHeaders() }),
    staleTime: 15_000,
    refetchInterval: options.refetchInterval,
  });
}

export function useAgendaChangeRequests() {
  const identity = useCollabIdentity();
  return useQuery({
    queryKey: requestsKey(identity),
    queryFn: ({ signal }) => listAgendaChangeRequests({ signal, headers: collabAuthHeaders() }),
    staleTime: 15_000,
  });
}

export function useRefreshFromGoogle() {
  return useMutation({
    mutationFn: () => refreshAgendaIntegration({ headers: collabAuthHeaders() }),
  });
}

export function useUpdateReadSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgendaReadSettingsInput) => updateAgendaReadSettings(data, { headers: collabAuthHeaders() }),
    onSettled: () => invalidateAgendaWorld(qc),
  });
}

export function useUpdatePersonalOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgendaPersonalOwnerInput) => updateAgendaPersonalOwner(data, { headers: collabAuthHeaders() }),
    onSettled: () => invalidateAgendaWorld(qc),
  });
}

export function useCreateChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgendaWindowChangeInput) => createAgendaChangeRequest(data, { headers: collabAuthHeaders() }),
    onSettled: () => invalidateAgendaWorld(qc),
  });
}

export function useDecideChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: AgendaChangeDecisionInputDecision }) =>
      decideAgendaChangeRequest(id, { decision }, { headers: collabAuthHeaders() }),
    onSettled: () => invalidateAgendaWorld(qc),
  });
}

/**
 * Atualização assíncrona: o POST devolve 202. Depois disso consultamos o estado
 * até cada agenda ligada registrar tentativa posterior ao pedido (ou 2 minutos).
 */
export function useGoogleRefreshCycle() {
  const qc = useQueryClient();
  const refresh = useRefreshFromGoogle();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const integration = useAgendaIntegration({ refetchInterval: startedAt ? 3000 : false });

  const enabled = (integration.data?.agendas ?? []).filter((a) => a.enabled !== false);
  const pendingIds = startedAt
    ? enabled
        .filter((a) => !a.lastAttempt || new Date(a.lastAttempt).getTime() < startedAt)
        .map((a) => a.id)
    : [];

  useEffect(() => {
    if (!startedAt) return;
    if (integration.dataUpdatedAt > startedAt && pendingIds.length === 0) {
      setStartedAt(null);
      void invalidateAgendaWorld(qc);
      return;
    }
    if (Date.now() - startedAt > 120_000) {
      setStartedAt(null);
      void invalidateAgendaWorld(qc);
    }
  }, [startedAt, integration.dataUpdatedAt, pendingIds.length, qc]);

  function start(onError: (msg: string) => void) {
    refresh.mutate(undefined, {
      onSuccess: () => setStartedAt(Date.now()),
      onError: (err) => onError(describeError(err, "Não foi possível pedir a atualização do Google.")),
    });
  }

  return {
    start,
    running: refresh.isPending || startedAt !== null,
    startedAt,
    pendingIds,
    integration,
  };
}
