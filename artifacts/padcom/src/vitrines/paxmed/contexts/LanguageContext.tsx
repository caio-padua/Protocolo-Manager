import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "pt";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; toggle: () => void };

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("parxis-lang") as Lang | null;
      if (stored === "en" || stored === "pt") {
        setLangState(stored);
        document.documentElement.lang = stored;
        return;
      }
      // Padrão sempre PT — o visitante só vê EN se escolher explicitamente.
      setLangState("pt");
      document.documentElement.lang = "pt";
    } catch {
      /* SSR / restricted storage — ignore */
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("parxis-lang", l);
      document.documentElement.lang = l;
    } catch {
      /* ignore */
    }
  };

  const toggle = () => setLang(lang === "pt" ? "en" : "pt");

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) return { lang: "pt", setLang: () => {}, toggle: () => {} };
  return ctx;
}

export function tr<T>(bilingual: { en: T; pt: T }, lang: Lang): T {
  return bilingual[lang];
}

export function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US").format(value);
}