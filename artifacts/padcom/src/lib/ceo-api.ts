import { getCollabToken } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function authHeaders(): Record<string, string> {
  const token = getCollabToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function ceoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? "Falha na operação.");
  }
  return r.json() as Promise<T>;
}

export async function baixarFoto(path: string): Promise<string | null> {
  const r = await fetch(`${BASE}/api${path}`, { headers: authHeaders(), cache: "no-store" });
  if (!r.ok) return null;
  return URL.createObjectURL(await r.blob());
}
