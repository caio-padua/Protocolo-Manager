import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import type { EnderecoExternoForm } from "@/components/EnderecoExternoCampos";

const apiBase = import.meta.env.VITE_API_URL || "/api";
const CHAVE = ["agenda-locais-externos"] as const;

export type LocalExterno = {
  id: number;
  nome: string;
  observacao: string | null;
  active: boolean;
  endereco: { cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string };
};

export const enderecoComoForm = (l: LocalExterno): EnderecoExternoForm => ({ ...l.endereco, complemento: l.endereco.complemento ?? "" });

export const textoDoLocal = (l: LocalExterno) => {
  const e = l.endereco;
  return `${e.logradouro}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ""} · ${e.bairro} · ${e.cidade}/${e.uf} · CEP ${e.cep}`;
};

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${apiBase}/agenda/locais-externos${caminho}`, {
    ...init,
    headers: collabAuthHeaders({ "Content-Type": "application/json" }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((corpo as { error?: string }).error ?? "Não foi possível concluir a operação.");
  return corpo as T;
}

export function useLocaisExternos() {
  return useQuery({
    queryKey: CHAVE,
    retry: false,
    queryFn: () => chamar<{ locais: LocalExterno[]; podeGerir: boolean }>(""),
  });
}

export function useSalvarLocalExterno() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nome, observacao, endereco }: { id?: number; nome: string; observacao: string; endereco: EnderecoExternoForm }) =>
      chamar<LocalExterno>(id ? `/${id}` : "", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          nome, observacao: observacao.trim() || null,
          endereco: { ...endereco, complemento: endereco.complemento.trim() || null },
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useInativarLocalExterno() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => chamar<{ ok: true }>(`/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
