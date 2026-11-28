import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { getCollabToken } from "@/lib/collab-auth";
import { BASE } from "@/pages/comunicacao/_shared";

/** A identificação do documento não substitui a sessão nem a autorização. */
export default function ReceitaProtegida() {
  const { token } = useParams<{ token: string }>();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);
    async function load() {
      try {
        const response = await fetch(`${BASE}/api/recipes/secure/${encodeURIComponent(token)}`, {
          headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` },
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("Documento indisponível para este acesso ou código expirado.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Não foi possível abrir o documento.");
      }
    }
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [token]);

  return <main className="mx-auto max-w-6xl space-y-4 p-4">
    <h1 className="text-xl font-semibold">Receita protegida</h1>
    <p className="text-sm">A cópia exige acesso autorizado. Para verificar a assinatura, use o validador indicado na receita.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!error && !url && <p>Consultando documento…</p>}
    {url && <iframe title="Receita protegida" src={url} className="min-h-[75vh] w-full border" />}
  </main>;
}
