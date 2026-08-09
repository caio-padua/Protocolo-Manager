/**
 * useClientFilter — lógica de filtragem local e server-side para PaxterClientSelector.
 *
 * Busca por nome (sem acento), CPF (dígitos) e telefone (dígitos).
 * Digitar limpa a letra selecionada.
 * Clicar em letra limpa o texto de busca.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { PaxterClientOption } from "./types";

// ── Utilitários ──────────────────────────────────────────────────────────────

export function norm(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

export function initialOf(name: string): string {
  const c = norm(name).trim().charAt(0);
  return c >= "A" && c <= "Z" ? c : "#";
}

function clienteAtivo(c: PaxterClientOption): boolean {
  if (c.deletedAt != null) return false;
  if (c.status != null && c.status !== "active") return false;
  return true;
}

/** Formata CPF para exibição: 000.000.000-00 */
export function formatCpf(cpf: string | null | undefined): string {
  if (!cpf) return "";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ── Hook: modo LOCAL (clientes em memória) ───────────────────────────────────

export interface UseClientFilterReturn {
  busca: string;
  setBusca: (q: string) => void;
  letra: string | null;
  setLetra: (l: string | null) => void;
  letrasDisponiveis: Set<string>;
  filtrados: PaxterClientOption[];
  overflow: boolean;        // true quando truncou em maxResults
  loading: false;
}

export function useClientFilter(
  clientes: PaxterClientOption[],
  maxResults = 300,
): UseClientFilterReturn {
  const [busca, setBuscaRaw] = useState("");
  const [letra, setLetraRaw] = useState<string | null>(null);

  const ativos = useMemo(() => clientes.filter(clienteAtivo), [clientes]);

  const letrasDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const c of ativos) s.add(initialOf(c.name));
    return s;
  }, [ativos]);

  const filtrados = useMemo(() => {
    let pool = ativos;
    if (letra) {
      pool = pool.filter((c) => initialOf(c.name) === letra);
    }
    if (busca.trim()) {
      const q = norm(busca);
      const digits = busca.replace(/\D/g, "");
      pool = pool.filter((c) => {
        if (norm(c.name).includes(q)) return true;
        if (digits.length >= 3) {
          if ((c.cpf ?? "").replace(/\D/g, "").includes(digits)) return true;
          if ((c.phone ?? "").replace(/\D/g, "").includes(digits)) return true;
        }
        return false;
      });
    }
    return pool;
  }, [ativos, letra, busca]);

  // Digitar → limpa letra selecionada
  const setBusca = useCallback((q: string) => {
    setBuscaRaw(q);
    if (q.trim()) setLetraRaw(null);
  }, []);

  // Clicar letra → limpa busca; clicar mesma letra → deseleciona
  const setLetra = useCallback((l: string | null) => {
    setLetraRaw((prev) => (prev === l ? null : l));
    setBuscaRaw("");
  }, []);

  const truncados = filtrados.slice(0, maxResults);

  return {
    busca,
    setBusca,
    letra,
    setLetra,
    letrasDisponiveis,
    filtrados: truncados,
    overflow: filtrados.length > maxResults,
    loading: false,
  };
}

// ── Hook: modo SERVER-SIDE (debounce + fetch) ────────────────────────────────

export interface UseServerSearchReturn {
  busca: string;
  setBusca: (q: string) => void;
  letra: string | null;
  setLetra: (l: string | null) => void;
  letrasDisponiveis: Set<string>;
  filtrados: PaxterClientOption[];
  overflow: boolean;
  loading: boolean;
}

export function useServerSearch(
  endpoint = "/api/clients",
  limit = 20,
): UseServerSearchReturn {
  const [busca, setBuscaRaw] = useState("");
  const [letra, setLetraRaw] = useState<string | null>(null);
  const [results, setResults] = useState<PaxterClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Limpar timer anterior
    if (timerRef.current) clearTimeout(timerRef.current);

    const query = busca.trim();
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      // Cancelar fetch anterior
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const params = new URLSearchParams({ search: query, limit: String(limit) });
        const res = await fetch(`${endpoint}?${params}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error("Erro na busca");
        const data = await res.json();
        // Aceita tanto { clients: [...] } quanto [...] direto
        setResults(Array.isArray(data) ? data : (data.clients ?? data.data ?? []));
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [busca, endpoint, limit]);

  const letrasDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const c of results) s.add(initialOf(c.name));
    return s;
  }, [results]);

  const filtrados = useMemo(() => {
    if (!letra) return results;
    return results.filter((c) => initialOf(c.name) === letra);
  }, [results, letra]);

  const setBusca = useCallback((q: string) => {
    setBuscaRaw(q);
    if (q.trim()) setLetraRaw(null);
  }, []);

  const setLetra = useCallback((l: string | null) => {
    setLetraRaw((prev) => (prev === l ? null : l));
  }, []);

  return {
    busca,
    setBusca,
    letra,
    setLetra,
    letrasDisponiveis,
    filtrados,
    overflow: false,
    loading,
  };
}
