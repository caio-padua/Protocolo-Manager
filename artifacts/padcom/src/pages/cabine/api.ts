import { collabAuthHeaders } from "@/lib/collab-auth";

const base = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export async function cabineJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${base()}/api${path}`, {
    ...init,
    headers: { ...collabAuthHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((corpo as { error?: string }).error ?? `Erro ${r.status}`);
  return corpo as T;
}

export async function cabineBlob(path: string): Promise<{ url: string; tipo: string }> {
  const r = await fetch(`${base()}/api${path}`, { headers: collabAuthHeaders() });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error((corpo as { error?: string }).error ?? `Erro ${r.status}`);
  }
  const blob = await r.blob();
  return { url: URL.createObjectURL(blob), tipo: r.headers.get("content-type") ?? blob.type };
}
