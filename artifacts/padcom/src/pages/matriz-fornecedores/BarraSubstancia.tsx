import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Calc } from "./calculo";
import { doseCurta, nomeDe } from "./calculo";
import { V } from "./componentes";
import { Quadrado, type CategoriaSubst } from "./Categorias";

/** Barra logo acima da tabela: à esquerda a substância selecionada com a dose; à direita o seletor de busca (padrão do seletor de clientes). */
export function BarraSubstancia({ atual, lista, onEscolher, soEsta, onSoEsta, catDe, cats, onGerenciar }: {
  catDe: (l: Calc["linha"]) => CategoriaSubst; cats: CategoriaSubst[]; onGerenciar: () => void;
  atual: Calc | undefined; lista: Calc[]; onEscolher: (varianteId: number) => void; soEsta: boolean; onSoEsta: (v: boolean) => void;
}) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [catSel, setCatSel] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const opcoes = useMemo(() => {
    const t = semAcento(texto.trim());
    return lista.filter((c) => (!catSel || catDe(c.linha).chave === catSel) && (!t || semAcento(`${nomeDe(c.linha)} ${c.linha.doseTotal}`).includes(t))).slice(0, 40);
  }, [lista, texto, catSel, catDe]);

  useEffect(() => { setAtivo(0); }, [texto, catSel]);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const escolher = (c: Calc) => { onEscolher(c.linha.varianteId); setTexto(""); setAberto(false); };
  const l = atual?.linha;

  return (
    <div className="mx-sbar" data-testid="barra-substancia">
      <div className="mx-sbar-sel">
        <small>Substância selecionada</small>
        {l ? (
          <div className="mx-sbar-nome"><Quadrado cat={catDe(l)} blend={l.isBlend} tam={34} /><b>{nomeDe(l)}</b><span>{doseCurta(l.doseTotal)}</span>{l.via && <em>{l.via}</em>}</div>
        ) : <div className="mx-sbar-nome"><b>Nenhuma</b></div>}
      </div>
      <label className="mx-check mx-sbar-so"><input type="checkbox" checked={soEsta} onChange={(e) => onSoEsta(e.target.checked)} disabled={!l} />Só esta substância</label>
      <div className="mx-sbar-busca" ref={ref}>
        <div className="mx-search mx-search-prem">
          <Search size={15} />
          <input value={texto} placeholder="Buscar substância ou ativo…" aria-label="Buscar substância ou ativo" role="combobox" aria-expanded={aberto}
            onFocus={() => setAberto(true)} onChange={(e) => { setTexto(e.target.value); setAberto(true); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(a + 1, opcoes.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && opcoes[ativo]) { e.preventDefault(); escolher(opcoes[ativo]); }
              else if (e.key === "Escape") setAberto(false);
            }} />
          {texto && <button type="button" aria-label="Limpar" className="mx-search-x" onClick={() => setTexto("")}><X size={14} /></button>}
        </div>
        {aberto && (
          <div className="mx-sbar-pop" onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== "SELECT" && (e.target as HTMLElement).tagName !== "OPTION") e.preventDefault(); }}>
          <div className="mx-sbar-filtro">
            <select value={catSel} onChange={(e) => setCatSel(e.target.value)} aria-label="Filtrar por categoria">
              <option value="">Todas as categorias</option>{cats.filter((c) => c.ativo).map((c) => <option key={c.chave} value={c.chave}>{c.nome}</option>)}
            </select>
            <button type="button" className="mx-sbar-ger" onClick={onGerenciar}>Gerenciar</button>
          </div>
          <ul className="mx-sbar-lista" role="listbox">
            {opcoes.length === 0 && <li className="mx-sbar-vazio">Nenhuma substância com esse nome.</li>}
            {opcoes.map((c, i) => (
              <li key={c.linha.varianteId} role="option" aria-selected={i === ativo} data-on={i === ativo ? 1 : 0}
                onMouseEnter={() => setAtivo(i)} onMouseDown={(e) => { e.preventDefault(); escolher(c); }}>
                <Quadrado cat={catDe(c.linha)} blend={c.linha.isBlend} />
                <span className="mx-sbar-ot"><b>{nomeDe(c.linha)}</b><small>{doseCurta(c.linha.doseTotal)}{c.linha.via ? ` · ${c.linha.via}` : ""}</small></span>
                {c.min !== null && <span className="mx-sbar-pr"><V c={c.min} peso={700} className="" /></span>}
              </li>
            ))}
          </ul>
          </div>
        )}
      </div>
    </div>
  );
}
