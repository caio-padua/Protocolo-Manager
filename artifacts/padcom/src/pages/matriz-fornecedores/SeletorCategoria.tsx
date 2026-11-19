import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type OpcaoCategoria = { chave: string; titulo: string; n: number; cor: string };

const TODAS = "linear-gradient(135deg, #16284a 0 50%, #b8924d 50% 100%)";

/**
 * Seletor de categoria no cabeçalho do Produto. Lista comum, vertical, com rolagem
 * (alinhada ao botão, nunca maior que a tela). Cada opção leva um quadradinho à esquerda, como no seletor de cliente.
 */
export function SeletorCategoria({ opcoes, valor, onChange }: { opcoes: OpcaoCategoria[]; valor: string | null; onChange: (v: string | null) => void }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, w: 0 });
  const bt = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const atual = opcoes.find((o) => o.chave === valor);

  const abrir = () => {
    const b = bt.current?.getBoundingClientRect();
    if (b) { const w = Math.min(Math.max(b.width, 280), window.innerWidth - 24); setPos({ left: Math.max(12, Math.min(b.left, window.innerWidth - w - 12)), top: b.bottom + 6, w }); }
    setAberto((v) => !v);
  };

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { const t = e.target as Node; if (!caixa.current?.contains(t) && !bt.current?.contains(t)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); bt.current?.focus(); } };
    const rolar = (e: Event) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("pointerdown", fora); document.addEventListener("keydown", tecla); window.addEventListener("scroll", rolar, true); window.addEventListener("resize", rolar);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", tecla); window.removeEventListener("scroll", rolar, true); window.removeEventListener("resize", rolar); };
  }, [aberto]);

  const escolher = (v: string | null) => { onChange(v); setAberto(false); };
  const linha = (chave: string | null, titulo: string, n: number | null, cor?: string) => {
    const sel = valor === chave;
    return (
      <button key={chave ?? "todas"} type="button" role="option" aria-selected={sel} className="mx-cs-op" data-sel={sel ? 1 : 0} onClick={() => escolher(chave)}>
        <span className="mx-cs-q bevel-3d" style={{ background: cor ? `linear-gradient(180deg, rgba(255,255,255,.32) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,.18) 100%), ${cor}` : TODAS }} aria-hidden />
        <span className="mx-cs-nm">{titulo}</span>
        {n !== null && <em>{n}</em>}
        {sel && <Check size={14} className="mx-cs-ck" aria-hidden />}
      </button>
    );
  };

  return (
    <>
      <button ref={bt} type="button" className="mx-cs-bt concave-3d" data-ativo={valor ? 1 : 0} aria-haspopup="listbox" aria-expanded={aberto}
        onClick={(e) => { e.stopPropagation(); abrir(); }} data-testid="seletor-categoria" title="Escolher uma categoria para listar só os produtos dela">
        <span className="mx-cs-q bevel-3d" style={{ background: atual ? `linear-gradient(180deg, rgba(255,255,255,.32) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,.18) 100%), ${atual.cor}` : TODAS }} aria-hidden />
        <span className="mx-cs-nm">{atual ? atual.titulo : "Categorias"}</span><ChevronDown size={13} aria-hidden />
      </button>
      {aberto && createPortal(
        <div ref={caixa} className="mx-cs-pop panel-3d" role="listbox" aria-label="Categorias" style={{ left: pos.left, top: pos.top, width: pos.w }} onClick={(e) => e.stopPropagation()}>
          {linha(null, "Todas as categorias", null)}
          <div className="mx-cs-grade">{opcoes.map((o) => linha(o.chave, o.titulo, o.n, o.cor))}</div>
        </div>, document.body)}
    </>
  );
}
