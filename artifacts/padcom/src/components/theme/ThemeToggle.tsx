import { Moon, Sun } from "lucide-react";
import type { ScreenTheme } from "./useScreenTheme";

interface ThemeToggleProps {
  theme: ScreenTheme;
  onToggle: () => void;
  className?: string;
}

/**
 * Botao sol/lua para alternar tema claro/escuro nas telas do cliente.
 * Cantos quadrados (design Paxter); ouro sobre painel; visivel nos dois temas.
 */
export function ThemeToggle({ theme, onToggle, className = "" }: ThemeToggleProps) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={dark ? "Tema claro" : "Tema escuro"}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[#c9a24e]/55 bg-card text-[#c9a24e] shadow-sm transition-colors hover:bg-[#c9a24e]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24e]/70 ${className}`}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
