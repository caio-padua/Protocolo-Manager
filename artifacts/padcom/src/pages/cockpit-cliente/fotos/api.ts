import { useQuery } from "@tanstack/react-query";
import { BASE } from "@/pages/comunicacao/_shared";
import { collabAuthHeaders } from "@/lib/collab-auth";
import type { AnguloInfo, SerieFotos } from "@/components/fotos-corpo/shared";

export type FotosCliente = { angulos: AnguloInfo[]; series: SerieFotos[] };

export const urlArquivoFoto = (clientId: number, fotoId: number) => `${BASE}/api/clients/${clientId}/fotos-corpo/${fotoId}/arquivo`;

export function useFotosCorpo(clientId: number) {
  return useQuery<FotosCliente>({
    queryKey: ["fotos-corpo", clientId],
    queryFn: async ({ signal }) => {
      const r = await fetch(`${BASE}/api/clients/${clientId}/fotos-corpo`, { signal, headers: collabAuthHeaders() });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Não foi possível carregar as fotos.");
      }
      return r.json();
    },
    retry: false,
  });
}
