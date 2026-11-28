import { BASE } from "./_shared";
import { collabAuthHeaders } from "@/lib/collab-auth";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers: collabAuthHeaders({ "Content-Type": "application/json" }) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((corpo as { error?: string }).error ?? `Falha (${r.status})`);
  return corpo as T;
}
