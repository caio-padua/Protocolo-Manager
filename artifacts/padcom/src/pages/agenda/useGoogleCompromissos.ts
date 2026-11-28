import { useQuery } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useCollabIdentity } from "./agenda-integration-api";
import type { GoogleAgendaCommitments } from "@workspace/api-client-react";

/**
 * Compromissos do Google já importados (somente leitura) num período AAAA-MM-DD.
 * Uma única chave de cache para o mês e para a linha do tempo: trocar de visão não repete a consulta.
 */
export function useGoogleCompromissos(de: string, ate: string) {
  const identity = useCollabIdentity();
  return useQuery({
    queryKey: ["google-compromissos", identity, de, ate],
    queryFn: async ({ signal }) => {
      const base = import.meta.env.VITE_API_URL || "/api";
      const r = await fetch(`${base}/agenda/google-compromissos?${new URLSearchParams({ de, ate })}`, { headers: collabAuthHeaders(), signal });
      if (!r.ok) throw Object.assign(new Error("Não foi possível carregar os compromissos do Google."), { status: r.status });
      return r.json() as Promise<GoogleAgendaCommitments>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
