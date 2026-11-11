import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import type { EnderecoExternoForm } from "@/components/EnderecoExternoCampos";

const apiBase = import.meta.env.VITE_API_URL || "/api";
const CHAVE = ["agenda-locais-externos"] as const; // prefixo: invalida todas as empresas

export type LocalExterno = {
  id: number;
  nome: string;
  observacao: string | null;
  active: boolean;
  empresaId?: number;
  dados?: Record<string, string | boolean | null>;
  endereco: { cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string };
};

export const enderecoComoForm = (l: LocalExterno): EnderecoExternoForm => ({ ...l.endereco, complemento: l.endereco.complemento ?? "" });

export const textoDoLocal = (l: LocalExterno) => {
  const e = l.endereco;
  return `${e.logradouro}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ""} · ${e.bairro} · ${e.cidade}/${e.uf} · CEP ${e.cep}`;
};

async function chamar<T>(caminho: string, init?: RequestInit, empresaId?: number): Promise<T> {
  const consulta = empresaId ? `?empresaId=${empresaId}` : "";
  const r = await fetch(`${apiBase}/agenda/locais-externos${caminho}${consulta}`, {
    ...init,
    headers: collabAuthHeaders({ "Content-Type": "application/json" }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((corpo as { error?: string }).error ?? "Não foi possível concluir a operação.");
  return corpo as T;
}

/** Sem empresaId = empresa da sessão (agenda). Com empresaId = aba do cadastro da empresa. */
export function useLocaisExternos(empresaId?: number) {
  return useQuery({
    queryKey: [...CHAVE, empresaId ?? "sessao"],
    retry: false,
    queryFn: () => chamar<{ locais: LocalExterno[]; podeGerir: boolean }>("", undefined, empresaId),
  });
}

export type CorpoLocalExterno = {
  nome: string; observacao: string | null;
  endereco: { cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string };
  dados: Record<string, string | boolean>;
};

export function useSalvarLocalExterno(empresaId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, corpo }: { id?: number; corpo: CorpoLocalExterno }) =>
      chamar<LocalExterno>(id ? `/${id}` : "", { method: id ? "PUT" : "POST", body: JSON.stringify(corpo) }, empresaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useInativarLocalExterno(empresaId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => chamar<{ ok: true }>(`/${id}`, { method: "DELETE" }, empresaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
