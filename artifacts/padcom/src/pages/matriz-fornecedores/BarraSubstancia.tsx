import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import type { Calc } from "./calculo";
import { doseCurta, nomeDe } from "./calculo";
import { V } from "./componentes";
import { ToggleWell } from "./ToggleWell";
import { Quadrado, type CategoriaSubst } from "./Categorias";

/** Barra logo acima da tabela: à esquerda a substância selecionada com a dose; à direita o seletor de busca (padrão do seletor de clientes). */
export function BarraSubstancia({ atual, lista, onEscolher, soEsta, onSoEsta, catDe, cats }: {
  catDe: (l: Calc["linha"]) => CategoriaSubst; cats: CategoriaSubst[]; onGerenciar?: () => void;
  atual: Calc | undefined; lista: Calc[]; onEscolher: (varianteId: number) => void; soEsta: boolean; onSoEsta: (v: boolean) => void;
}) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [catSel, setCatSel] = useState("");
  const [copiado, setCopiado] = useState(false);
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

  const copiar = () => {
    if (!l) return;
    const t = `${nomeDe(l)} ${doseCurta(l.doseTotal)}${l.via ? ` ${l.via}` : ""}`.trim();
    try { void navigator.clipboard?.writeText(t); } catch { /* sem permissão */ }
    setCopiado(true); window.setTimeout(() => setCopiado(false), 1400);
  };

  return (
    <div className="mx-sbar" data-testid="barra-substancia">
      <div className="mx-sbar-z1">
      {l ? <Quadrado cat={catDe(l)} blend={l.isBlend} tam={64} /> : <span className="mx-cat-q-vazio" />}
      <div className="mx-sbar-sel">
        <small>Substância selecionada</small>
        <div className="mx-sbar-l1" title={l ? nomeDe(l) : ""}><b>{l ? nomeDe(l) : "Nenhuma"}</b></div>
        <div className="mx-sbar-l2"><i>Dose</i><span>{l ? doseCurta(l.doseTotal) : "—"}</span>{l?.via && <em>{l.via}</em>}</div>
        <div className="mx-sbar-l3"><i>Conc.</i><span className="mx-c1">{l?.concentracao ?? "—"}</span><i>Vol.</i><span className="mx-c2">{l?.volumeMl ? `${Number(l.volumeMl).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mL` : "—"}</span></div>
      </div>
      </div>
      <div className="mx-sbar-togs mx-sbar-z2">
        <div className="mx-sbar-tog"><ToggleWell checked={soEsta} disabled={!l} onChange={onSoEsta} label="Só esta substância" title="Mostra na tabela apenas as apresentações dela." /></div>
        <div className="mx-sbar-qtd"><i>Apresentações desta substância</i><b>{l ? lista.filter((x) => x.linha.substanciaId === l.substanciaId).length : 0}</b></div>
      </div>
      <div className="mx-sbar-z3">
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
      <button type="button" className="mx-sbar-copy2 evo-bevel" onClick={copiar} disabled={!l} title="Copia nome, dose e via da substância selecionada" aria-label="Copiar dados da substância selecionada" data-testid="botao-copiar-dados-substancia">
        {copiado ? <Check size={15} /> : <Copy size={15} />}<span>{copiado ? "Dados copiados" : "Copiar dados da substância"}</span>
      </button>
      </div>
    </div>
  );
}
