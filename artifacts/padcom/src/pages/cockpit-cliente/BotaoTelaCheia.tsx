import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import "./tela-cheia.css";

/** Ampliar o gráfico para a tela inteira (tela cheia do navegador; se ele recusar, cobre a janela). Esc ou o mesmo botão volta. */
export function BotaoTelaCheia({ className = "btn-3d-soft pn-mini", seletor = "section" }: { className?: string; seletor?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [cheia, setCheia] = useState(false);
  const alvo = () => ref.current?.closest<HTMLElement>(seletor) ?? null;

  useEffect(() => {
    const sync = () => { const a = alvo(); if (a && document.fullscreenElement === a) setCheia(true); else if (a && !a.classList.contains("tela-cheia-fallback")) setCheia(false); };
    document.addEventListener("fullscreenchange", sync);
    const esc = (e: KeyboardEvent) => { const a = alvo(); if (e.key === "Escape" && a?.classList.contains("tela-cheia-fallback")) sair(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("fullscreenchange", sync); document.removeEventListener("keydown", esc); };
  }, []);

  const sair = () => {
    const a = alvo();
    a?.classList.remove("tela-cheia-fallback", "tela-cheia-alvo");
    document.documentElement.classList.remove("tela-cheia-ativa");
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setCheia(false);
  };
  const entrar = async () => {
    const a = alvo(); if (!a) return;
    a.classList.add("tela-cheia-alvo");
    try { await a.requestFullscreen(); setCheia(true); }
    catch { a.classList.add("tela-cheia-fallback"); document.documentElement.classList.add("tela-cheia-ativa"); setCheia(true); }
    window.dispatchEvent(new Event("resize"));
  };
  const Icone = cheia ? Minimize2 : Maximize2;
  return (
    <button ref={ref} type="button" className={className} onClick={() => (cheia ? sair() : void entrar())}
      aria-label={cheia ? "Sair da tela inteira" : "Ver o gráfico em tela inteira"} title={cheia ? "Sair da tela inteira (Esc)" : "Tela inteira"}>
      <Icone size={15} aria-hidden="true" />
    </button>
  );
}
