import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type OpcaoCategoria = { chave: string; titulo: string; n: number };

const sigla = (t: string) => t.replace(/[^A-Za-zÀ-ú ]/g, "").trim().slice(0, 2).toUpperCase() || "—";

/**
 * Seletor de categoria no cabeçalho do Produto. Lista abre em painel que ocupa toda a largura da planilha
 * (âncora = elemento marcado com data-ancora-lista). Cada opção leva um quadradinho à esquerda, como no seletor de cliente.
 */
export function SeletorCategoria({ opcoes, valor, onChange }: { opcoes: OpcaoCategoria[]; valor: string | null; onChange: (v: string | null) => void }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, w: 0 });
  const bt = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const atual = opcoes.find((o) => o.chave === valor);

  const abrir = () => {
    const b = bt.current?.getBoundingClientRect();
    const a = bt.current?.closest("[data-ancora-lista]")?.getBoundingClientRect();
    if (b) setPos({ left: a?.left ?? b.left, top: b.bottom + 6, w: a?.width ?? 520 });
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
  const linha = (chave: string | null, titulo: string, n: number | null) => {
    const sel = valor === chave;
    return (
      <button key={chave ?? "todas"} type="button" role="option" aria-selected={sel} className="mx-cs-op" data-sel={sel ? 1 : 0} onClick={() => escolher(chave)}>
        <span className="mx-cs-q">{chave === null ? "∗" : sigla(titulo)}</span>
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
        <span className="mx-cs-q">{atual ? sigla(atual.titulo) : "∗"}</span>
        <span className="mx-cs-nm">{atual ? atual.titulo : "Categorias"}</span><ChevronDown size={13} aria-hidden />
      </button>
      {aberto && createPortal(
        <div ref={caixa} className="mx-cs-pop panel-3d" role="listbox" aria-label="Categorias" style={{ left: pos.left, top: pos.top, width: pos.w }} onClick={(e) => e.stopPropagation()}>
          {linha(null, "Todas as categorias", null)}
          <div className="mx-cs-grade">{opcoes.map((o) => linha(o.chave, o.titulo, o.n))}</div>
        </div>, document.body)}
    </>
  );
}
