import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Files, ListFilter, Pencil, Search, ShoppingCart, Swords, Layers, Trophy, X } from "lucide-react";
import "./matriz-finale.css";
import { DADOS_V2 } from "./dados-v2";

/* ------------------------------------------------------------------ dados */
type Offer = { unit: number; qtd: number };
type Comp = { nome: string; mg: number };
type Row = {
  id: number; nome: string; dose: string; conc: string; vol: string; via: string;
  tipo: "ampola" | "frasco" | "implante"; comps: Comp[] | null; offers: (Offer | null)[];
};
const LABS = [
  { nome: "Farmatec", full: "Farmatec Laboratório de Injetáveis", cor: "#2d73b5", sub: "Tabela 29/09/2025" },
  { nome: "Bio meds Brasil", full: "Bio meds Brasil", cor: "#8a4fb0", sub: "A conferir" },
  { nome: "Formédica", full: "Formédica", cor: "#c4572f", sub: "Histórico 05/2022" },
  { nome: "Indose", full: "Indose Produtos Farmacêuticos", cor: "#2f8a68", sub: "Tabela 11/2026" },
  { nome: "Magistra Sul", full: "Magistra Sul", cor: "#b08a1c", sub: "Novo · 3 itens" },
] as const;
const PALETA = ["#2d73b5", "#c4572f", "#2f8a68", "#8a4fb0", "#b08a1c"];

function montar(): Row[] {
  const base = DADOS_V2.map((d, i) => ({ d, i }));
  const comBio = base.filter((x) => x.d[6][1]).slice(0, 7);
  const comImp = base.filter((x) => x.d[6][2]).slice(0, 2);
  const ids = new Set([...comBio, ...comImp].map((x) => x.i));
  const rest = base.filter((x) => x.d[6][0] && !ids.has(x.i) && x.i % 7 === 0).slice(0, 16);
  const pick = [...comBio, ...comImp, ...rest];
  const rows: Row[] = pick.map(({ d }, k) => {
    const [nome, dose, , via, , concs, of] = d;
    const [conc, vol] = (concs[0] ?? "—").split(" · ");
    const orig = of.map((o) => (o ? { unit: o[0], qtd: o[2] } : null));
    const ref = orig.find(Boolean) as Offer;
    const syn = (lab: number, ok: boolean, qtd: number): Offer | null => {
      if (!ok) return null;
      const f = 0.9 + ((k * 37 + lab * 11) % 21) / 100;
      return { unit: Math.round(ref.unit * f), qtd };
    };
    const tipo = of.find((o) => o)?.[3] ?? 0;
    return {
      id: k + 1, nome, dose, conc, vol: vol ?? "—", via, tipo: (["ampola", "frasco", "implante"] as const)[tipo], comps: null,
      offers: [orig[0], orig[1], orig[2], syn(3, k % 5 !== 2, k % 3 === 0 ? 5 : 10), syn(4, k % 4 === 1, [1, 3, 5][k % 3])],
    };
  });
  const blends: Row[] = [
    { id: 101, nome: "Moro Citrus", dose: "176 mg", conc: "", vol: "5 mL", via: "EV / IM", tipo: "frasco",
      comps: [{ nome: "Citrus sinensis (Morosil)", mg: 20 }, { nome: "L-Carnitina", mg: 150 }, { nome: "Cafeína benzoica", mg: 6 }],
      offers: [{ unit: 2890, qtd: 10 }, null, null, { unit: 2740, qtd: 5 }, null] },
    { id: 102, nome: "Pool Capilar", dose: "36 mg", conc: "", vol: "2 mL", via: "IM", tipo: "ampola",
      comps: [{ nome: "Biotina", mg: 10 }, { nome: "Pantenol", mg: 25 }, { nome: "Cobre", mg: 1 }],
      offers: [{ unit: 450, qtd: 10 }, { unit: 410, qtd: 5 }, null, { unit: 468, qtd: 10 }, { unit: 395, qtd: 3 }] },
    { id: 103, nome: "Lipo Mix", dose: "225 mg", conc: "", vol: "10 mL", via: "IM / SC", tipo: "frasco",
      comps: [{ nome: "Colina", mg: 100 }, { nome: "Inositol", mg: 50 }, { nome: "Metionina", mg: 25 }, { nome: "Carnitina", mg: 50 }],
      offers: [{ unit: 1890, qtd: 10 }, { unit: 1960, qtd: 5 }, null, { unit: 1820, qtd: 10 }, null] },
  ];
  return [...rows, ...blends].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
const ROWS = montar();

/* ------------------------------------------------------------ formatação */
const nf = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const iniciais = (s: string) => s.split(/\s+/).filter((w) => w.length > 1 || /\d/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const volNum = (v: string) => parseFloat(v.replace(",", ".")) || 1;

function Money({ c, className }: { c: number; className?: string }) {
  return (
    <span className={`mf-money ${className ?? ""}`} aria-label={`R$ ${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`}>
      <i>R$</i>{Math.floor(c / 100).toLocaleString("pt-BR")}<u>,{String(c % 100).padStart(2, "0")}</u>
    </span>
  );
}
function Marca({ t, q }: { t: string; q: string }) {
  const i = q ? norm(t).indexOf(norm(q)) : -1;
  if (i < 0) return <>{t}</>;
  return <>{t.slice(0, i)}<mark>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>;
}
const Flag = () => (
  <span className="mf-flag" title="Menor preço" aria-label="Menor preço"><span><Trophy size={9} strokeWidth={2.4} fill="currentColor" /></span></span>
);

/* ------------------------------------------------------- célula de laboratório */
function LabCell({ o, qtd, win, row, onQtd }: { o: Offer | null; qtd: number; win: boolean; row: Row; onQtd: (n: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const [txt, setTxt] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  if (!o) return <div className="mf-none"><span>sem oferta</span></div>;
  const custom = ![1, 5, 10].includes(qtd);
  const n = parseInt(txt, 10);
  // autocompletar: apresentações já cadastradas (a partir do cadastro do produto)
  const cadastradas = [2, 3, 4, 6, 12, 20, 25, 50].filter((x) => !txt || String(x).startsWith(txt));
  const aplicar = (v: number) => { if (v > 0) onQtd(v); setAberto(false); setTxt(""); };
  const un = row.tipo === "frasco" ? "frascos" : row.tipo === "implante" ? "implantes" : "ampolas";
  return (
    <div className="mf-lc">
      {win && <Flag />}
      <div className="mf-lr u"><span className="mf-k">Unid.</span><Money c={o.unit} /></div>
      <div className="mf-lr c"><span className="mf-k">Cx.</span><Money c={o.unit * qtd} /></div>
      <div className="mf-chips" ref={ref} role="group" aria-label={`Apresentação: ${qtd} ${un}`}>
        {[1, 5, 10].map((q) => <span key={q} className="mf-chip" data-on={qtd === q ? 1 : 0} style={{ display: "grid", placeItems: "center" }}>{q} Unid</span>)}
        <button className="mf-chip x" data-on={custom ? 1 : 0} onClick={(e) => { e.stopPropagation(); setAberto((a) => !a); }} title="Outra apresentação">
          {custom ? `${qtd} Unid` : "X Unid"}
        </button>
        {aberto && (
          <div className="mf-ap" onClick={(e) => e.stopPropagation()}>
            <h6>Apresentação em {un}</h6>
            <div className="mf-ap-in">
              <input autoFocus inputMode="numeric" value={txt} placeholder="ex.: 3" onChange={(e) => setTxt(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") aplicar(n || cadastradas[0]); if (e.key === "Escape") setAberto(false); }} />
              <span>Unid</span>
            </div>
            <div className="mf-ap-sug">
              {cadastradas.map((x, i) => <button key={x} data-hi={i === 0 && !!txt ? 1 : 0} onClick={() => aplicar(x)}>{x} Unid</button>)}
              {cadastradas.length === 0 && <span style={{ fontSize: 10.5, color: "#5d6a85" }}>Nova apresentação: {txt} Unid</span>}
            </div>
            <div className="mf-ap-act"><button onClick={() => setAberto(false)}>Cancelar</button><button className="p" onClick={() => aplicar(n || cadastradas[0] || 0)}>Gravar</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tela */
type Lado = 0 | 1 | 2;
export function MatrizFinale() {
  const [modo, setModo] = useState<"juntos" | "confronto">(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("m") === "confronto" ? "confronto" : "juntos"));
  const [on, setOn] = useState([true, true, true, true, true]);
  const [lado, setLado] = useState<Lado[]>([1, 2, 0, 1, 0]);
  const [foco, setFoco] = useState<number>(102);
  const [soEsta, setSoEsta] = useState(false);
  const [abertos, setAbertos] = useState<number[]>([102]);
  const [qtds, setQtds] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [lista, setLista] = useState(false);
  const [hi, setHi] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const inRef = useRef<HTMLInputElement>(null);
  const selRef = useRef<HTMLDivElement>(null);
  const tT = useRef<number | undefined>(undefined);

  const avisar = (t: string) => { setToast(t); window.clearTimeout(tT.current); tT.current = window.setTimeout(() => setToast(null), 1800); };

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ver") === "blend") window.setTimeout(() => document.getElementById("mf-r-102")?.scrollIntoView({ block: "start" }), 60);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); inRef.current?.focus(); } };
    const fora = (e: MouseEvent) => { if (selRef.current && !selRef.current.contains(e.target as Node)) setLista(false); };
    window.addEventListener("keydown", k); document.addEventListener("mousedown", fora);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("mousedown", fora); };
  }, []);

  /* laboratórios visíveis, na ordem das colunas */
  const cols = useMemo(() => {
    const idx = [0, 1, 2, 3, 4];
    if (modo === "juntos") return idx.filter((i) => on[i]);
    return [...idx.filter((i) => lado[i] === 1), ...idx.filter((i) => lado[i] === 2)];
  }, [modo, on, lado]);

  const qtdDe = (r: Row, l: number) => qtds[`${r.id}-${l}`] ?? r.offers[l]?.qtd ?? 1;
  const foc = ROWS.find((r) => r.id === foco) ?? ROWS[0];

  const rows = useMemo(() => ROWS.filter((r) => !soEsta || r.nome === foc.nome), [soEsta, foc.nome]);

  const info = (r: Row) => {
    const vis = cols.filter((l) => r.offers[l]);
    const min = vis.length ? Math.min(...vis.map((l) => (r.offers[l] as Offer).unit)) : null;
    const venc = min === null ? [] : vis.filter((l) => (r.offers[l] as Offer).unit === min);
    const melhorLado = (s: Lado) => {
      const v = cols.filter((l) => lado[l] === s && r.offers[l]).map((l) => ({ l, u: (r.offers[l] as Offer).unit }));
      return v.length ? v.reduce((a, b) => (b.u < a.u ? b : a)) : null;
    };
    return { vis, min, venc, A: melhorLado(1), B: melhorLado(2) };
  };

  const placar = useMemo(() => {
    let a = 0, b = 0, e = 0;
    if (modo === "confronto") rows.forEach((r) => { const i = info(r); if (i.A && i.B) { if (i.A.u < i.B.u) a++; else if (i.B.u < i.A.u) b++; else e++; } });
    return { a, b, e };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, rows, cols]);

  const nomesLado = (s: Lado) => LABS.filter((_, i) => lado[i] === s).map((l) => l.nome).join(" + ") || "—";

  /* seletor */
  const resultados = useMemo(() => {
    const t = norm(q.trim());
    const l = ROWS.filter((r) => !t || norm(`${r.nome} ${r.dose} ${r.comps?.map((c) => c.nome).join(" ") ?? ""}`).includes(t));
    return l.slice(0, 9);
  }, [q]);
  const escolher = (r: Row) => {
    setFoco(r.id); setLista(false); setQ(""); inRef.current?.blur();
    window.setTimeout(() => document.getElementById(`mf-r-${r.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 30);
  };
  const menorDe = (r: Row) => { const v = r.offers.filter(Boolean) as Offer[]; return v.length ? Math.min(...v.map((o) => o.unit)) : null; };
  const labsDe = (r: Row) => r.offers.filter(Boolean).length;
  const alt = (id: number) => setAbertos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const dockRef = useRef<HTMLDivElement>(null);
  const [dockH, setDockH] = useState(190);
  useEffect(() => {
    const el = dockRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setDockH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el); setDockH(Math.round(el.getBoundingClientRect().height));
    return () => ro.disconnect();
  }, []);

  const totalLabs = modo === "juntos" ? on.filter(Boolean).length : cols.length;

  return (
    <div className="mf">
      <div className="mf-top">
        <div>
          <div className="mf-eyebrow">Cadastros clínicos</div>
          <h1 className="mf-title">Matrix: Substâncias × Fornecedores</h1>
        </div>
        <div className="mf-kpis">
          <div className="mf-kpi"><small>Produtos na tela</small><b>{rows.length}</b><em>de {ROWS.length}</em></div>
          <div className="mf-kpi"><small>Laboratórios</small><b>{totalLabs}</b><em>de {LABS.length}</em></div>
          <div className="mf-kpi"><small>Legenda</small>
            <div className="mf-legend" style={{ marginTop: 3 }}><Flag /><span>menor preço</span></div></div>
        </div>
      </div>

      {/* tabela */}
      <div className="mf-wrap" style={{ ["--dock-h" as string]: `${dockH}px` }}>
        <div className="mf-dock" ref={dockRef}>
        {/* comparador */}
        <section className="mf-cmp" aria-label="Comparar laboratórios">
          <div className="mf-cmp-h">
            <div className="mf-eyebrow">Laboratórios</div>
            <div className="mf-seg" role="group" aria-label="Modo de comparação">
              <button aria-pressed={modo === "juntos"} onClick={() => setModo("juntos")}><Layers size={13} />Juntos</button>
              <button aria-pressed={modo === "confronto"} onClick={() => setModo("confronto")}><Swords size={13} />Confronto A × B</button>
            </div>
            <div className="mf-cmp-res">
              {modo === "confronto" ? (
                <>
                  <span className="mf-vs"><i data-s="A">A</i><b>{nomesLado(1)}</b></span>
                  <span style={{ color: "#8f98ad" }}>contra</span>
                  <span className="mf-vs"><i data-s="B">B</i><b>{nomesLado(2)}</b></span>
                  <span>· A vence <b>{placar.a}</b> · B vence <b>{placar.b}</b> · empate <b>{placar.e}</b></span>
                </>
              ) : <span>Toque num laboratório para ligar ou desligar. No Confronto, ponha cada um de um lado.</span>}
            </div>
          </div>
          <div className="mf-labs">
            {LABS.map((l, i) => {
              const n = ROWS.filter((r) => r.offers[i]).length;
              const ativo = modo === "juntos" ? on[i] : lado[i] > 0;
              return (
                <div key={l.nome} className="mf-lab" data-on={ativo ? 1 : 0} style={{ ["--lc" as string]: l.cor }}>
                  <button className="mf-lab-main" aria-pressed={ativo}
                    onClick={() => modo === "juntos" ? setOn((o) => o.map((x, j) => (j === i ? !x : x))) : setLado((s) => s.map((x, j) => (j === i ? ((x + 1) % 3) as Lado : x)))}>
                    <b>{l.nome}</b><span className="mf-lab-n">{n}</span><small>{l.sub}</small>
                  </button>
                  {modo === "confronto" && (
                    <div className="mf-ab" role="group" aria-label={`Lado de ${l.nome}`}>
                      {([[1, "A"], [2, "B"], [0, "Fora"]] as [Lado, string][]).map(([v, t]) => (
                        <button key={t} data-s={v === 0 ? "0" : t} aria-pressed={lado[i] === v} onClick={() => setLado((s) => s.map((x, j) => (j === i ? v : x)))}>{t}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* barra da substância */}
        <section className="mf-bar" aria-label="Substância selecionada">
          <div className="mf-av">{iniciais(foc.nome)}</div>
          <div className="mf-bar-id">
            <div className="mf-bar-l1">
              <span className="mf-bar-nome">{foc.nome}</span>
              <span className="mf-bar-dose">{foc.dose}</span>
              {foc.comps && <span className="mf-tag mf-tag-b">Blend</span>}
            </div>
            <div className="mf-bar-l2">
              <span className="mf-vias" aria-label="Vias de uso"><i>Via</i>{["IM", "EV", "SC", "ID", "Tóp.", "Impl."].map((v) => (
                <em key={v} data-on={foc.via.split("/").map((x) => x.trim()).includes(v) ? 1 : 0}>{v}</em>
              ))}</span>
              <span>Vol. <b>{foc.vol}</b></span>
              {foc.conc && <span>Conc. <b>{foc.conc}</b></span>}
              <span><b>{labsDe(foc)}</b> laboratórios com preço</span>
              {menorDe(foc) !== null && <span>menor unidade <b>R$ {nf((menorDe(foc) as number) / 100)}</b></span>}
            </div>
          </div>
          <div className="mf-bar-tools">
            <button className="mf-tbtn" aria-pressed={soEsta} onClick={() => setSoEsta((s) => !s)} title="Mostrar só as doses desta substância"><ListFilter size={14} />Só esta substância</button>
            <button className="mf-tbtn" onClick={() => avisar("Linha copiada")}><Copy size={14} />Copiar</button>
          </div>
          <div className="mf-sel" ref={selRef}>
            <div className="mf-sel-in">
              <Search size={16} color="#5d6a85" />
              <input ref={inRef} value={q} placeholder="Trocar substância ou ativo" aria-label="Buscar substância ou ativo" role="combobox" aria-expanded={lista}
                onFocus={() => setLista(true)} onChange={(e) => { setQ(e.target.value); setHi(0); setLista(true); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, resultados.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                  if (e.key === "Enter" && resultados[hi]) escolher(resultados[hi]);
                  if (e.key === "Escape") { setLista(false); inRef.current?.blur(); }
                }} />
              {q ? <button aria-label="Limpar" onClick={() => setQ("")} style={{ border: 0, background: "transparent", display: "grid" }}><X size={15} /></button> : <span className="mf-kbd">/</span>}
            </div>
            {lista && (
              <div className="mf-pop" role="listbox">
                <div className="mf-pop-h">{q ? `${resultados.length} resultado(s)` : "Substâncias e ativos"}</div>
                {resultados.length === 0 && <div className="mf-pop-empty">Nada encontrado para “{q}”.</div>}
                {resultados.map((r, i) => (
                  <div key={r.id} className="mf-opt" role="option" aria-selected={r.id === foco} data-hi={i === hi ? 1 : 0} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); escolher(r); }}>
                    <div className="mf-av">{iniciais(r.nome)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="mf-opt-n"><Marca t={r.nome} q={q} /> {r.comps && <span className="mf-tag mf-tag-b" style={{ marginLeft: 4 }}>Blend</span>}</div>
                      <div className="mf-opt-s"><b>{r.dose}</b><span>{r.via}</span><span>{r.vol}</span></div>
                    </div>
                    <div className="mf-opt-p">{menorDe(r) !== null && <b>R$ {nf((menorDe(r) as number) / 100)}</b>}{labsDe(r)} lab.</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        </div>
        <table className="mf-t" style={{ width: "100%", minWidth: 340 + 84 + cols.length * 204 + 176 }}>
          <colgroup><col style={{ width: 340 }} /><col style={{ width: 84 }} />{cols.map((l) => <col key={l} style={{ width: 204 }} />)}<col style={{ width: 176 }} /></colgroup>
          <thead>
            <tr>
              <th className="mf-th mf-th-fix" style={{ ["--tc" as string]: "#5f719b" }}><b>Produto</b><small>{rows.length} apresentações</small></th>
              <th className="mf-th" style={{ ["--tc" as string]: "#5f719b" }}><b>Via</b><small>cadastro</small></th>
              {cols.map((l) => (
                <th key={l} className="mf-th" style={{ ["--tc" as string]: LABS[l].cor }}>
                  <b>{modo === "confronto" && <span className="mf-side">{lado[l] === 1 ? "A" : "B"}</span>}{LABS[l].nome}</b>
                  <small>{ROWS.filter((r) => r.offers[l]).length} apresentações</small>
                </th>
              ))}
              <th className="mf-th" style={{ ["--tc" as string]: "#c9a24a" }}><b>{modo === "juntos" ? "Melhor valor" : "A × B"}</b><small>{modo === "juntos" ? "menor + laboratório" : "melhor de cada lado"}</small></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={cols.length + 3} className="mf-empty">Nenhum produto para mostrar.</td></tr>}
            {rows.map((r, ri) => {
              const inf = info(r);
              const isB = !!r.comps;
              const open = abertos.includes(r.id);
              const nC = r.comps?.length ?? 0;
              const h = isB ? 26 + (nC + 1) * 20 + 19 : 100;
              const totalMg = r.comps?.reduce((s, c) => s + c.mg, 0) ?? 0;
              const v = volNum(r.vol);
              return (
                <Fragment key={r.id}>
                  <tr id={`mf-r-${r.id}`} className="mf-r" data-z={ri % 2} data-foco={r.id === foco ? 1 : 0}
                    style={{ ["--row" as string]: `${Math.max(100, h)}px` }}
                    onClick={() => { setFoco(r.id); if (isB) alt(r.id); }}>
                    <td className="mf-td mf-td-fix">
                      <div className="mf-pc">
                        <div className="mf-pc-n">
                          <span className="n">{r.nome}</span>
                          {isB && <span className="mf-tag mf-tag-b">Blend</span>}
                          {isB && <span className="mf-chev" data-open={open ? 1 : 0} title={open ? "Fechar composição" : "Abrir composição"}><ChevronDown size={14} /></span>}
                        </div>
                        {isB ? (
                          <>
                            {r.comps!.map((c, i) => (
                              <div key={c.nome} className="mf-pr"><span className="mf-k">{i === 0 ? "Comp." : ""}</span><span className="mf-v" title={c.nome}>{c.nome}</span><span className="mf-v">{nf(c.mg)} mg</span><span className="mf-v">{nf(c.mg / v)} mg/mL</span></div>
                            ))}
                            <div className="mf-pr"><span className="mf-k">Vol.</span><span className="mf-v span">{r.tipo === "frasco" ? "Frasco" : "Ampola"} · {r.vol}</span></div>
                          </>
                        ) : (
                          <>
                            <div className="mf-pr"><span className="mf-k">Dose</span><span className="mf-v span">{r.dose}</span></div>
                            <div className="mf-pr"><span className="mf-k">Conc.</span><span className="mf-v span">{r.conc || "—"}</span></div>
                            <div className="mf-pr"><span className="mf-k">Vol.</span><span className="mf-v span">{r.vol}</span></div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="mf-td"><div className="mf-via">{r.via}</div></td>
                    {cols.map((l) => {
                      const o = r.offers[l];
                      const win = !!o && inf.vis.length > 1 && inf.venc.includes(l);
                      return (
                        <td key={l} className={`mf-td ${win ? "mf-win" : ""} ${o ? "" : "mf-hatch"}`}>
                          <LabCell o={o} qtd={qtdDe(r, l)} win={win} row={r} onQtd={(n) => setQtds((s) => ({ ...s, [`${r.id}-${l}`]: n }))} />
                        </td>
                      );
                    })}
                    <td className="mf-td mf-bestc" style={{ ["--lc" as string]: inf.venc.length ? LABS[inf.venc[0]].cor : undefined }}>
                      {modo === "juntos" ? (
                        inf.min === null ? <div className="mf-best"><span className="mf-none"><span>sem preço</span></span></div> : (
                          <div className="mf-best">
                            <Money c={inf.min} />
                            <div className="mf-best-l"><i /><span>{inf.venc.map((l) => LABS[l].nome).join(" · ")}</span></div>
                          </div>
                        )
                      ) : (
                        <div className="mf-best">
                          {inf.A && inf.B ? (
                            <>
                              <div className="mf-duel">
                                <div data-w={inf.A.u <= inf.B.u ? 1 : 0}><small>A</small><Money c={inf.A.u} /></div><em>×</em>
                                <div data-w={inf.B.u <= inf.A.u ? 1 : 0}><small>B</small><Money c={inf.B.u} /></div>
                              </div>
                              {inf.A.u === inf.B.u ? <span className="mf-best-l"><span>Empate</span></span>
                                : <span className="mf-diff">{inf.A.u < inf.B.u ? "A" : "B"} −{nf(Math.abs(inf.A.u - inf.B.u) / Math.max(inf.A.u, inf.B.u) * 100, 1)}%</span>}
                            </>
                          ) : <span className="mf-best-l"><span>{inf.A ? "Só o lado A tem preço" : inf.B ? "Só o lado B tem preço" : "Sem preço"}</span></span>}
                        </div>
                      )}
                    </td>
                  </tr>
                  {isB && open && (
                    <tr key={`${r.id}-x`} className="mf-xrow">
                      <td colSpan={cols.length + 3}>
                        <div className="mf-xp">
                          <div>
                            <h5>Composição de 1 {r.tipo === "frasco" ? "frasco" : "ampola"} · {r.vol}</h5>
                            <table className="mf-comp">
                              <thead><tr><th>Substância</th><th>Dose</th><th>Conc.</th><th>Parte</th></tr></thead>
                              <tbody>
                                {r.comps!.map((c, i) => (
                                  <tr key={c.nome}><td><i style={{ background: PALETA[i % 5] }} />{c.nome}</td><td>{nf(c.mg)} mg</td><td>{nf(c.mg / v)} mg/mL</td><td>{nf((c.mg / totalMg) * 100, 1)}%</td></tr>
                                ))}
                              </tbody>
                              <tfoot><tr><td>Total no {r.tipo === "frasco" ? "frasco" : "volume"}</td><td>{nf(totalMg)} mg</td><td>{nf(totalMg / v)} mg/mL</td><td>{r.vol}</td></tr></tfoot>
                            </table>
                          </div>
                          <div>
                            <h5>Proporção da mistura</h5>
                            <div className="mf-mix">{r.comps!.map((c, i) => <i key={c.nome} style={{ width: `${(c.mg / totalMg) * 100}%`, background: PALETA[i % 5] }} />)}</div>
                            <div className="mf-mix-l">{r.comps!.map((c) => <div key={c.nome}><span>{c.nome}</span><b>{nf(c.mg)} mg</b></div>)}</div>
                            <h5>Unidade por laboratório</h5>
                            <div className="mf-cmpl">
                              {cols.filter((l) => r.offers[l]).map((l) => {
                                const mx = Math.max(...cols.filter((x) => r.offers[x]).map((x) => (r.offers[x] as Offer).unit));
                                const u = (r.offers[l] as Offer).unit;
                                return <div key={l} style={{ ["--lc" as string]: LABS[l].cor }}><span>{LABS[l].nome}</span><span className="bar"><i style={{ width: `${(u / mx) * 100}%` }} /></span><b>R$ {nf(u / 100)}</b></div>;
                              })}
                            </div>
                          </div>
                          <div className="mf-tools">
                            <h5>Ferramentas</h5>
                            <button onClick={() => avisar("Composição copiada")}><Copy size={14} />Copiar composição</button>
                            <button onClick={() => avisar("Abrindo o editor do blend")}><Pencil size={14} />Editar blend</button>
                            <button onClick={() => avisar("Cópia criada para edição")}><Files size={14} />Duplicar como novo</button>
                            <button className="p" onClick={() => avisar("Pedido iniciado no menor preço")}><ShoppingCart size={14} />Pedir no menor preço</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {toast && <div className="mf-toast" role="status">{toast}</div>}
    </div>
  );
}
export default MatrizFinale;
