import { useEffect, useRef, useState, type SetStateAction } from "react";
import type { z } from "zod";

/** Browser-local only. The caller must obtain scope from a fresh clinical-context response. */
export function useClinicalDraft<T extends object>(key: string, schema: z.ZodType<T>, empty: T) {
  const initial = useRef<{ raw: string | null; pending: boolean; error: string | null } | null>(null);
  if (!initial.current) {
    try {
      const raw = localStorage.getItem(key);
      initial.current = { raw, pending: raw !== null, error: null };
      if (raw !== null) schema.parse(JSON.parse(raw));
    } catch {
      initial.current = {
        raw: initial.current?.raw ?? null, pending: true,
        error: "Não foi possível ler o rascunho. Não iniciaremos outro por cima dele.",
      };
    }
  }
  const [value, setValue] = useState<T>(empty);
  const current = useRef(value);
  const baseline = useRef(initial.current.raw);
  const [pending, setPending] = useState(initial.current.pending);
  const [error, setError] = useState<string | null>(initial.current.error);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const warn = (event: BeforeUnloadEvent) => {
      if (error) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => { alive.current = false; window.removeEventListener("beforeunload", warn); };
  }, [error]);

  const persist = (next: T) => {
    try {
      if (localStorage.getItem(key) !== baseline.current) {
        throw new Error("Este rascunho mudou em outra aba. Seus dados continuam nesta tela; não sobrescrevemos a outra versão. Feche esta aba após conferir as duas versões.");
      }
      const raw = JSON.stringify(next);
      localStorage.setItem(key, raw);
      baseline.current = raw;
      setSaved(true);
      setError(null);
    } catch (e) {
      setSaved(false);
      setError(e instanceof Error && e.message.startsWith("Este rascunho")
        ? e.message : "Rascunho não salvo neste navegador. Mantenha esta tela aberta e tente salvar novamente.");
    }
  };
  const field = <K extends keyof T>(name: K) => (action: SetStateAction<T[K]>) => {
    if (pending) return;
    const previous = current.current;
    const next = { ...previous, [name]: typeof action === "function"
      ? (action as (v: T[K]) => T[K])(previous[name]) : action };
    current.current = next;
    setValue(next);
    persist(next);
  };
  const recover = () => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) throw new Error("missing");
      const next = schema.parse(JSON.parse(raw));
      baseline.current = raw;
      current.current = next;
      setValue(next);
      setPending(false);
      setSaved(true);
      setError(null);
    } catch {
      setError("Não foi possível recuperar o rascunho. Ele foi mantido; tente novamente ou confirme o descarte.");
    }
  };
  const discard = () => {
    if (!window.confirm("Descartar definitivamente o rascunho deste paciente, médico e clínica neste navegador?")) return false;
    try {
      // Confirmation applies only to the version this screen has actually seen,
      // including while waiting for recovery. Never discard a newer unseen draft.
      if (localStorage.getItem(key) !== baseline.current) throw new Error("conflict");
      localStorage.removeItem(key);
      baseline.current = null;
      current.current = empty;
      setValue(empty);
      setPending(false);
      setSaved(false);
      setError(null);
      return true;
    } catch {
      setError("Não foi possível descartar: armazenamento indisponível ou outra aba alterou o rascunho. Nada foi apagado.");
      return false;
    }
  };
  const complete = (snapshot: T) => {
    if (!alive.current || JSON.stringify(current.current) !== JSON.stringify(snapshot)) return;
    try {
      if (localStorage.getItem(key) !== baseline.current) throw new Error("conflict");
      localStorage.removeItem(key);
      baseline.current = null;
      current.current = empty;
      setValue(empty);
      setSaved(false);
      setError(null);
    } catch {
      setError("Documento gerado, mas não foi possível remover seu rascunho. Confira o histórico antes de gerar novamente.");
    }
  };
  return { value, field, pending, error, saved, recover, discard, complete,
    retry: () => persist(current.current), isCurrent: () => alive.current };
}
