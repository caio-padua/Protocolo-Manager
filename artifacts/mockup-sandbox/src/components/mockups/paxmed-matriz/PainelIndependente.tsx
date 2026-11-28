import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import "./matriz-finale.css";
import "./painel.css";
import "./painel-ind.css";
import { LABS, ROWS, LabCell, Money, iniciais, nf, norm, Marca, Flag, type Offer, type Row } from "./MatrizFinale";

const VIAS = ["IM", "EV", "SC", "ID", "TOP", "IMP"] as const;
const viaKey = (v: string) => { const n = norm(v.trim()); return n.startsWith("top") ? "TOP" : n.startsWith("imp") ? "IMP" : v.trim().toUpperCase(); };

function Tg({ on, onChange, children, disabled }: { on: boolean; onChange: (v: boolean) => void; children: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className="pn-tg" onClick={() => onChange(!on)}>
      <i />{children}
    </button>
  );
}

export function PainelIndependente() {
  const layout = "D";
  const [on, setOn] = useState([true, true, true, true, true]);
  const [foco, setFoco] = useState(102);
  const [soEsta, setSoEsta] = useState(false);
  const [menor, setMenor] = useState(true);
  const [soComp, setSoComp] = useState(false);
  const [soBlend, setSoBlend] = useState(false);
  const [ordem, setOrdem] = useState(false);
  const [qtds, setQtds] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [lista, setLista] = useState(false);
  const [hi, setHi] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const selRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (selRef.current && !selRef.current.contains(e.target as Node)) setLista(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); inRef.current?.focus(); } };
    document.addEventListener("mousedown", fora); window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", fora); window.removeEventListener("keydown", k); };
  }, []);

  const foc = ROWS.find((r) => r.id === foco) ?? ROWS[0];
  const cols = [0, 1, 2, 3, 4].filter((i) => on[i]);
  const menorDe = (r: Row) => { const v = r.offers.filter(Boolean) as Offer[]; return v.length ? Math.min(...v.map((o) => o.unit)) : null; };
  const nVis = (r: Row) => cols.filter((l) => r.offers[l]).length;

  const rows = useMemo(() => {
    let l = ROWS.filter((r) => (!soEsta || r.nome === foc.nome) && (!soBlend || !!r.comps) && (!soComp || cols.filter((c) => r.offers[c]).length >= 2));
    if (ordem) l = [...l].sort((a, b) => (menorDe(a) ?? 1e9) - (menorDe(b) ?? 1e9));
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soEsta, soBlend, soComp, ordem, foc.nome, on]);

  const resultados = useMemo(() => {
    const t = norm(q.trim());
    return ROWS.filter((r) => !t || norm(`${r.nome} ${r.dose} ${r.comps?.map((c) => c.nome).join(" ") ?? ""}`).includes(t)).slice(0, 8);
  }, [q]);
  const escolher = (r: Row) => {
    setFoco(r.id); setLista(false); setQ(""); inRef.current?.blur();
    window.setTimeout(() => document.getElementById(`pn-r-${r.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
  };
  const copiar = () => {
    try { void navigator.clipboard?.writeText(`${foc.nome} ${foc.dose} ${foc.via}`); } catch { /* sem permissão */ }
    setCopiado(true); window.setTimeout(() => setCopiado(false), 1400);
  };

  const viasFoc = foc.via.split("/").map(viaKey);

  /* ---- peças ---- */
  const ident = (
    <div className="pn-id">
      <div className="pn-sym" title="Categoria">{iniciais(foc.nome)}</div>
      <div className="pn-idtxt">
        <div className="pn-l1">
          <span className="pn-nome">{foc.nome}</span>
          <span className="pn-dose">{foc.dose}</span>
        </div>
        <div className="pn-l2">
          <div className="pn-facts">
            <span><i>Conc.</i><b>{foc.conc || "—"}</b></span>
            <span><i>Vol.</i><b>{foc.vol}</b></span>
          </div>
          <div className="pn-vias" role="group" aria-label="Vias de uso">
            {VIAS.map((v) => <em key={v} data-on={viasFoc.includes(v) ? 1 : 0} title={viasFoc.includes(v) ? "Via usada nesta substância" : ""}>{v}</em>)}
          </div>
        </div>
      </div>
    </div>
  );
  const btnCopiar = (
    <button type="button" className="pn-btn" onClick={copiar}>
      {copiado ? <Check size={14} /> : <Copy size={14} />}{copiado ? "Dados copiados" : "Copiar dados da substância"}
    </button>
  );
  const tgSoEsta = <Tg on={soEsta} onChange={setSoEsta}>Mostrar só esta na planilha</Tg>;
  const busca = (
    <div className="pn-sel" ref={selRef}>
      <div className="pn-sel-in">
        <Search size={14} color="#5d6a85" />
        <input ref={inRef} value={q} placeholder="Buscar substância ou ativo" aria-label="Buscar substância ou ativo" role="combobox" aria-expanded={lista}
          onFocus={() => setLista(true)} onChange={(e) => { setQ(e.target.value); setHi(0); setLista(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, resultados.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            if (e.key === "Enter" && resultados[hi]) escolher(resultados[hi]);
            if (e.key === "Escape") { setLista(false); inRef.current?.blur(); }
          }} />
        {q ? <button aria-label="Limpar" onClick={() => setQ("")} style={{ border: 0, background: "transparent", display: "grid" }}><X size={14} /></button> : <span className="mf-kbd">/</span>}
      </div>
      {lista && (
        <div className="pn-pop" role="listbox">
          <div className="mf-pop-h">{q ? `${resultados.length} resultado(s)` : "Substâncias e ativos"}</div>
          {resultados.length === 0 && <div className="mf-pop-empty">Nada encontrado para “{q}”.</div>}
          {resultados.map((r, i) => (
            <div key={r.id} className="mf-opt" role="option" aria-selected={r.id === foco} data-hi={i === hi ? 1 : 0} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); escolher(r); }}>
              <div className="mf-av">{iniciais(r.nome)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="mf-opt-n"><Marca t={r.nome} q={q} /> {r.comps && <span className="mf-tag mf-tag-b" style={{ marginLeft: 4 }}>Blend</span>}</div>
                <div className="mf-opt-s"><b>{r.dose}</b><span>{r.via}</span><span>{r.vol}</span></div>
              </div>
              <div className="mf-opt-p">{menorDe(r) !== null && <b>R$ {nf((menorDe(r) as number) / 100)}</b>}{r.offers.filter(Boolean).length} lab.</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const tgs = [
    <Tg key="m" on={menor} onChange={setMenor}>Menor preço</Tg>,
    <Tg key="c" on={soComp} onChange={setSoComp}>Só comparáveis</Tg>,
    <Tg key="b" on={soBlend} onChange={setSoBlend}>Só blends</Tg>,
    <Tg key="o" on={ordem} onChange={setOrdem}>Do mais barato</Tg>,
  ];
  const contagem = <span className="pn-count"><b>{rows.length}</b> de {ROWS.length} substâncias</span>;

  const labs = (
    <div className="pn-labs" role="group" aria-label="Laboratórios">
      <div className="pn-labs-l">
        <span className="pn-cap">Laboratórios · toque para ligar</span>
        <span className="pn-count"><b>{on.filter(Boolean).length}</b> de {LABS.length} ligados</span>
      </div>
      {LABS.map((l, i) => (
        <button key={l.nome} type="button" className="pn-lab" data-on={on[i] ? 1 : 0} aria-pressed={on[i]} style={{ ["--lc" as string]: l.cor }}
          onClick={() => setOn((o) => (o.filter(Boolean).length === 1 && o[i] ? o : o.map((x, j) => (j === i ? !x : x))))}>
          <span className="pn-ck">{on[i] && <Check size={13} strokeWidth={3} />}</span>
          <span style={{ minWidth: 0 }}><b>{l.nome}</b><small>{l.sub}</small></span>
          <span className="pn-lab-n">{ROWS.filter((r) => r.offers[i]).length}<small> apres.</small></span>
        </button>
      ))}
      <div className="pn-lab-best"><b>Melhor valor</b><small>menor + laboratório</small></div>
    </div>
  );

  return (
    <div className="mf pn pn-D">
      <div className="pn-wrap">
        <div className="pn-dock pd-dock">
          <div className="pd-card">
            <div className="pd-sub">{ident}</div>
            <div className="pd-mid">
              <div className="pd-mid-r1">{btnCopiar}{tgSoEsta}</div>
              {busca}
            </div>
            <div className="pd-tools" aria-label="Ferramentas">
              {tgs}
              <div className="pd-count">{contagem}</div>
            </div>
          </div>
          {labs}
        </div>

        <table className="pn-t">
          <colgroup><col style={{ width: "var(--c0)" }} /><col style={{ width: "var(--c1)" }} /><col style={{ width: "var(--c2)" }} />{LABS.map((l) => <col key={l.nome} style={{ width: "var(--lab)" }} />)}<col style={{ width: "var(--best)" }} /></colgroup>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="pn-empty">Nenhuma substância com estes filtros.</td></tr>}
            {rows.map((r, ri) => {
              const vis = cols.filter((l) => r.offers[l]);
              const min = vis.length ? Math.min(...vis.map((l) => (r.offers[l] as Offer).unit)) : null;
              const venc = min === null ? [] : vis.filter((l) => (r.offers[l] as Offer).unit === min);
              return (
                <tr key={r.id} id={`pn-r-${r.id}`} className="mf-r" data-z={ri % 2} data-foco={r.id === foco ? 1 : 0} onClick={() => setFoco(r.id)}>
                  <td className="mf-td pn-cat"><span>{iniciais(r.nome).slice(0, 2)}</span></td>
                  <td className="mf-td">
                    <div className="mf-pc">
                      <div className="mf-pc-n"><span className="n">{r.nome}</span>{r.comps && <span className="mf-tag mf-tag-b">Blend</span>}</div>
                      <div className="mf-pr"><span className="mf-k">Dose</span><span className="mf-v span">{r.dose}</span></div>
                      <div className="mf-pr"><span className="mf-k">Conc.</span><span className="mf-v span">{r.conc || "—"}</span></div>
                      <div className="mf-pr"><span className="mf-k">Vol.</span><span className="mf-v span">{r.vol}</span></div>
                    </div>
                  </td>
                  <td className="mf-td"><div className="mf-via">{r.via}</div></td>
                  {LABS.map((lab, l) => {
                    const o = r.offers[l];
                    if (!on[l]) return <td key={lab.nome} className="mf-td pn-off"><span>desligado</span></td>;
                    const win = !!o && vis.length > 1 && venc.includes(l) && menor;
                    return (
                      <td key={lab.nome} className={`mf-td ${win ? "mf-win" : ""} ${o ? "" : "mf-hatch"}`}>
                        <LabCell o={o} qtd={qtds[`${r.id}-${l}`] ?? o?.qtd ?? 1} win={win} row={r} onQtd={(n) => setQtds((s) => ({ ...s, [`${r.id}-${l}`]: n }))} />
                      </td>
                    );
                  })}
                  <td className="mf-td mf-bestc" style={{ ["--lc" as string]: venc.length ? LABS[venc[0]].cor : undefined }}>
                    <div className="mf-best">
                      {min === null ? <span className="mf-none"><span>sem preço</span></span> : (
                        <>
                          <Money c={min} />
                          <div className="mf-best-l"><i /><span>{venc.map((l) => LABS[l].nome).join(" · ")}</span></div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <span style={{ display: "none" }}><Flag />{nVis(foc)}</span>
      </div>
    </div>
  );
}

export default PainelIndependente;
