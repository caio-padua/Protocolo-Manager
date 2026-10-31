import { useCallback, useEffect, useState } from "react";

export type ScreenTheme = "dark" | "light";

const KEY = "paxter.theme";

function readTheme(storageKey: string, defaultTheme: ScreenTheme): ScreenTheme {
  if (typeof window === "undefined") return defaultTheme;
  const v = window.localStorage.getItem(storageKey);
  return v === "dark" || v === "light" ? v : defaultTheme;
}

/**
 * Tema claro/escuro das telas do cliente (anamnese-v2, agendar).
 * Aplica a classe `.dark` no wrapper da tela — os tokens `.dark` do index.css
 * fazem o resto. Persiste em localStorage (`paxter.theme`).
 */
export function useScreenTheme(
  defaultTheme: ScreenTheme = "light",
  storageKey = KEY,
) {
  const [theme, setThemeState] = useState<ScreenTheme>(() => readTheme(storageKey, defaultTheme));

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      /* localStorage indisponivel — ignora */
    }
  }, [storageKey, theme]);

  const setTheme = useCallback((t: ScreenTheme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, toggle, setTheme };
}
