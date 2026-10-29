import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { COLLAB_EVENT, getCollabToken } from "@/lib/collab-auth";
import { BASE } from "@/pages/comunicacao/_shared";

export interface ClinicalIdentity {
  professional: { id: number; name: string; crm: string; uf: string | null };
  client: { id: number; name: string; cpf: string | null; phone: string | null; email: string | null; birthDate: string | null };
  clinic: { id: number; empresaId: number; name: string };
  canPrescribe: boolean;
  issue: string | null;
}

export function useClinicalIdentity(clientId: number | null | undefined) {
  // Token remains in the auth helper, never in a query key or a diagnostic.
  const [sessionVersion, setSessionVersion] = useState(0);
  useEffect(() => {
    const changed = () => setSessionVersion(v => v + 1);
    const storageChanged = (event: StorageEvent) => {
      if (!event.key || event.key === "padcom_collab_token") changed();
    };
    window.addEventListener(COLLAB_EVENT, changed);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(COLLAB_EVENT, changed);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);
  return useQuery<ClinicalIdentity>({
    queryKey: ["clinical-identity", clientId, sessionVersion],
    enabled: !!clientId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const token = getCollabToken();
      if (!token) throw new Error("Faça login de colaborador para identificar o médico.");
      const response = await fetch(`${BASE}/api/clinical-context/${clientId}`, {
        signal, headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível validar a identidade clínica.");
      return data;
    },
  });
}
