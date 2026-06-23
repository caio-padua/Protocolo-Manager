import { useCallback, useEffect, useState } from "react";

export type ScreenTheme = "dark" | "light";

const KEY = "paxter.theme";

function readTheme(): ScreenTheme {
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem(KEY);
  return v === "dark" || v === "light" ? v : "light";
}

/**
 * Tema claro/escuro das telas do cliente (anamnese-v2, agendar).
 * Aplica a classe `.dark` no wrapper da tela — os tokens `.dark` do index.css
 * fazem o resto. Persiste em localStorage (`paxter.theme`).
 */
export function useScreenTheme() {
  const [theme, setThemeState] = useState<ScreenTheme>(readTheme);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* localStorage indisponivel — ignora */
    }
  }, [theme]);

  const setTheme = useCallback((t: ScreenTheme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, toggle, setTheme };
}
