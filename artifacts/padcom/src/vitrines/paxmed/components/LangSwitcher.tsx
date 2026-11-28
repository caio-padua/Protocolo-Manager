import { useLang } from "@paxmed/contexts/LanguageContext";

export function LangSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label="Language selector"
      className={
        "inline-flex items-center gap-0.5 rounded-[4px] border border-[rgba(242,184,23,0.38)] bg-[rgba(5,5,5,0.78)] px-1 py-1 shadow-[inset_0_1px_0_rgba(255,245,210,0.12),0_2px_8px_-2px_rgba(0,0,0,0.6)] " +
        className
      }
    >
      <LangBtn active={lang === "en"} onClick={() => setLang("en")}>EN</LangBtn>
      <span aria-hidden className="text-[color:var(--gold)]/40 text-[10px]">·</span>
      <LangBtn active={lang === "pt"} onClick={() => setLang("pt")}>PT</LangBtn>
    </div>
  );
}

function LangBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={typeof children === "string" ? `Idioma ${children}` : undefined}
      className={
        "inline-flex items-center justify-center min-h-10 min-w-11 px-3.5 py-1.5 rounded-[3px] text-[10px] tracking-[0.28em] uppercase font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black " +
        (active
          ? "text-[#0a0505] bg-[color:var(--gold)] shadow-[0_0_14px_rgba(242,184,23,0.38)]"
          : "text-[color:var(--gold)] hover:bg-[rgba(242,184,23,0.1)]")
      }
    >
      {children}
    </button>
  );
}