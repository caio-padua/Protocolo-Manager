import { useState, useEffect } from "react";

export interface ClientSearchResult {
  id: number;
  name: string;
  cpf: string | null;
  birthDate: string | null;
  photo: string | null;
}

export function useCockpitSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(query)}&limit=20`);
        if (!res.ok) throw new Error("Erro na busca");
        const data: ClientSearchResult[] = await res.json();
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function clear() {
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return { query, setQuery, results, loading, open, setOpen, clear };
}
