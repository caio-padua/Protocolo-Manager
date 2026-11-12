import { useQuery } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { errorStatus, useCollabIdentity } from "./agenda-integration-api";
import { GoogleDescription } from "./GoogleDescription";
import type { GoogleAgendaCommitment } from "@workspace/api-client-react";

/**
 * Descrição importada de um compromisso do Google (somente leitura), carregada sob demanda ao abrir os detalhes.
 * Usada pela lista de compromissos e pela linha do tempo: mesma consulta, mesmas recusas, mesma sanitização.
 */
export function InformacoesCompromisso({ evento }: { evento: Pick<GoogleAgendaCommitment, "id" | "inicio"> }) {
  const identity = useCollabIdentity();
  const description = useQuery({
    queryKey: ["google-compromisso-descricao", identity, evento.id],
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const base = import.meta.env.VITE_API_URL || "/api";
      const id = evento.id.split(":")[0];
      const params = new URLSearchParams({ inicio: evento.inicio });
      const response = await fetch(`${base}/agenda/google-compromissos/${encodeURIComponent(id)}/descricao?${params}`, {
        headers: collabAuthHeaders(), signal, cache: "no-store",
      });
      if (!response.ok) throw Object.assign(new Error("Não foi possível consultar a descrição."), { status: response.status });
      return response.json() as Promise<{ descricao: string | null }>;
    },
  });
  return (
    <section className="concave-3d p-3 space-y-2" aria-label="Informações do compromisso">
      <h3 className="text-xs font-bold uppercase tracking-wider">Informações do compromisso</h3>
      <p className="text-xs text-muted-foreground">Descrição importada do Google. Pode não refletir alterações ainda não sincronizadas.</p>
      {description.isPending && <p className="text-xs" role="status">Carregando informações…</p>}
      {description.isError && (
        <p className="text-xs" role="alert">
          {errorStatus(description.error) === 403
            ? "A descrição importada está disponível somente ao proprietário."
            : "Não foi possível carregar as informações deste compromisso."}
        </p>
      )}
      {description.isSuccess && (description.data.descricao
        ? <GoogleDescription description={description.data.descricao} />
        : <p className="text-xs">Este compromisso não possui descrição importada.</p>)}
    </section>
  );
}
