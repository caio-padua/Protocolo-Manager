import { collabAuthHeaders } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** fetch autenticado do colaborador; devolve JSON ou lança Error com a mensagem do servidor (sem falha silenciosa). */
export async function apiJson<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}/api${caminho}`, {
    ...init, headers: { "Content-Type": "application/json", ...collabAuthHeaders(), ...(init.headers ?? {}) },
  });
  if (r.status === 204) return undefined as T;
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((corpo as { error?: string }).error ?? `Erro ${r.status}`);
  return corpo as T;
}
