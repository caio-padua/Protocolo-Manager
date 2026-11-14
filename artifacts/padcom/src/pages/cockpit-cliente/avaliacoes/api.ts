import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TipoAvaliacao, ValoresAvaliacao } from "@workspace/avaliacoes-corporais";
import { BASE } from "@/pages/comunicacao/_shared";
import { collabAuthHeaders } from "@/lib/collab-auth";

export type Medicao = {
  id: number;
  tipo: TipoAvaliacao;
  data: string; // AAAA-MM-DD
  valores: ValoresAvaliacao;
  observacoes: string | null;
  criadoEm: string;
};

async function erroDe(r: Response, padrao: string): Promise<Error> {
  try {
    const j = (await r.json()) as { error?: string };
    return new Error(j.error || padrao);
  } catch {
    return new Error(padrao);
  }
}

const chave = (clientId: number) => ["avaliacoes-corporais", clientId] as const;

export function useMedicoes(clientId: number) {
  return useQuery<Medicao[]>({
    queryKey: chave(clientId),
    queryFn: async ({ signal }) => {
      const r = await fetch(`${BASE}/api/clients/${clientId}/avaliacoes`, { signal, headers: collabAuthHeaders() });
      if (!r.ok) throw await erroDe(r, "Não foi possível carregar as medições.");
      return r.json();
    },
    retry: false,
  });
}

export function useSalvarMedicao(clientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (corpo: { tipo: TipoAvaliacao; data: string; valores: ValoresAvaliacao; observacoes: string }) => {
      const r = await fetch(`${BASE}/api/clients/${clientId}/avaliacoes`, {
        method: "POST", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(corpo),
      });
      if (!r.ok) throw await erroDe(r, "Não foi possível salvar a medição.");
      return (await r.json()) as Medicao;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(clientId) }),
  });
}

export function useRemoverMedicao(clientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/clients/${clientId}/avaliacoes/${id}`, {
        method: "DELETE", headers: collabAuthHeaders(),
      });
      if (!r.ok) throw await erroDe(r, "Não foi possível remover a medição.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(clientId) }),
  });
}

export function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function numeroBr(v: number, casas: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
