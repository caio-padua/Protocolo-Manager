import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Copy, FileSpreadsheet, Minus, Plus, Search, ShoppingCart, Trophy, X,
} from "lucide-react";
import "./matriz-fornecedores.css";
import { DADOS } from "./dados";

/* ------------------------------------------------------------------ dados */
type Status = "ok" | "conf" | "hist" | "div";
type Offer = { lab: 0 | 1 | 2; unit: number; caixa: number; qtd: number; pag: number; linha: number; st: Status };
type Cat = "IM" | "SC" | "IMP" | "OT" | "SV";
type Row = { id: number; nome: string; dose: string; forma: string; vol: string; via: string; cat: Cat; offers: (Offer | null)[] };

const LABS = [
  { nome: "Farmatec", full: "Farmatec Laboratório de Injetáveis", cor: "#2d73b5", led: "ok", sub: "Tabela 29/09/2025" },
  { nome: "Bio meds Brasil", full: "Bio meds Brasil", cor: "#8a4fb0", led: "amber", sub: "A conferir" },
  { nome: "Formédica", full: "Formédica", cor: "#c4572f", led: "gray", sub: "Histórico 05/2022" },
] as const;
const CATS: { id: Cat; nome: string; curto: string }[] = [
  { id: "IM", nome: "Injetáveis IM", curto: "IM" },
  { id: "SC", nome: "Injetáveis SC", curto: "SC" },
  { id: "IMP", nome: "Implantes", curto: "Implantes" },
  { id: "OT", nome: "Outras vias (EV, ID, tópico)", curto: "Outras vias" },
  { id: "SV", nome: "Sem via informada", curto: "Sem via" },
];

const ROWS: Row[] = DADOS.map((d) => {
  const [id, nome, dose, forma, vol, via, cat0, f, b, m] = d;
  const cat = cat0 === "OT" || cat0 === "SV" || cat0 === "IM" || cat0 === "SC" || cat0 === "IMP" ? cat0 : "SV";
  const offers: (Offer | null)[] = [
    f ? { lab: 0, unit: f[0], caixa: f[1], qtd: f[2], pag: f[3], linha: f[4], st: "ok" } : null,
    b ? { lab: 1, unit: b[0], caixa: b[1], qtd: b[2], pag: b[3], linha: 0, st: "conf" } : null,
    m ? { lab: 2, unit: m[0], caixa: m[1], qtd: m[2], pag: m[3], linha: m[4], st: m[5] ? "div" : "hist" } : null,
  ];
  return { id, nome: nome.replace(/\*.*?\*/g, "").trim(), dose, forma, vol, via, cat: (cat === "IMP" ? "IMP" : cat) as Cat, offers };
});

/* ------------------------------------------------------------ formatação */
const brl = (c: number) => `R$ ${Math.floor(c / 100).toLocaleString("pt-BR")},${String(c % 100).padStart(2, "0")}`;
const pct1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctTxt = (x: number) => `${pct1.format(x)}%`;

function Money({ c }: { c: number }) {
  return (
    <span className="mx-money">
      <i>R$</i>
      {Math.floor(c / 100).toLocaleString("pt-BR")}
      <u>,{String(c % 100).padStart(2, "0")}</u>
    </span>
  );
}

/* --------------------------------------------------------------- cálculo */
type Modo = "maior" | "media" | "menor";
type Base = "unit" | "caixa";
type Cfg = { base: Base; modo: Modo; incConf: boolean; incHist: boolean; labsOn: boolean[]; mg: Record<Cat, number> };
type Calc = {
  row: Row; incl: Offer[]; min: number | null; max: number | null; ref: number | null; venda: number | null;
  winners: Offer[]; eco: number | null; margem: number;
};
const val = (o: Offer, base: Base) => (base === "unit" ? o.unit : o.caixa);

function calcular(row: Row, cfg: Cfg): Calc {
  const incl = row.offers.filter((o): o is Offer =>
    !!o && cfg.labsOn[o.lab] && o.st !== "div" && (o.st === "ok" || (o.st === "conf" && cfg.incConf) || (o.st === "hist" && cfg.incHist)));
  const vs = incl.map((o) => val(o, cfg.base));
  const min = vs.length ? Math.min(...vs) : null;
  const max = vs.length ? Math.max(...vs) : null;
  const ref = !vs.length ? null : cfg.modo === "maior" ? max : cfg.modo === "menor" ? min : Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
  const margem = cfg.mg[row.cat];
  return {
    row, incl, min, max, ref, margem,
    venda: ref === null ? null : Math.round(ref / (1 - margem / 100)),
    winners: min === null ? [] : incl.filter((o) => val(o, cfg.base) === min),
    eco: incl.length >= 2 && max ? (max - (min as number)) / max : null,
  };
}

/* --------------------------------------------------------------- colunas */
type ColKind = "prod" | "via" | "lab" | "best" | "eco" | "ref" | "mg" | "venda";
type Col = { kind: ColKind; lab?: 0 | 1 | 2; w: number; letter: string };
type SortKey = "prod" | "best" | "eco" | "venda";
const MODO_TXT: Record<Modo, string> = { maior: "Maior valor", media: "Média", menor: "Menor valor" };

function numeroDaCelula(c: Calc, col: Col, base: Base): { v: number; tipo: "money" | "pct" } | null {
  if (col.kind === "lab") { const o = c.row.offers[col.lab as number]; return o ? { v: val(o, base), tipo: "money" } : null; }
  if (col.kind === "best") return c.min === null ? null : { v: c.min, tipo: "money" };
  if (col.kind === "eco") return c.eco === null ? null : { v: c.eco * 100, tipo: "pct" };
  if (col.kind === "ref") return c.ref === null ? null : { v: c.ref, tipo: "money" };
  if (col.kind === "mg") return { v: c.margem, tipo: "pct" };
  if (col.kind === "venda") return c.venda === null ? null : { v: c.venda, tipo: "money" };
  return null;
}
const fmtNum = (n: { v: number; tipo: "money" | "pct" }) => (n.tipo === "money" ? brl(Math.round(n.v)) : pctTxt(n.v));

/* ------------------------------------------------------------------ tela */
export function MatrizFornecedores() {
  const [busca, setBusca] = useState("");
  const [catSel, setCatSel] = useState<Cat | "TODAS">("TODAS");
  const [soComp, setSoComp] = useState(false);
  const [base, setBase] = useState<Base>("unit");
  const [modo, setModo] = useState<Modo>("maior");
  const [incConf, setIncConf] = useState(true);
  const [incHist, setIncHist] = useState(true);
  const [labsOn, setLabsOn] = useState([true, true, true]);
  const [mg, setMg] = useState<Record<Cat, number>>({ IM: 38, SC: 42, IMP: 35, OT: 30, SV: 30 });
  const [fechados, setFechados] = useState<Cat[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>({ key: "eco", dir: -1 });
  const [sel, setSel] = useState<{ r: number; c: number; modo: "cell" | "col" | "row" }>({ r: 0, c: 5, modo: "cell" });
  const [modal, setModal] = useState<null | "ref" | "ped">(null);
  const [toast, setToast] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const toastT = useRef<number | undefined>(undefined);

  const cfg: Cfg = useMemo(() => ({ base, modo, incConf, incHist, labsOn, mg }), [base, modo, incConf, incHist, labsOn, mg]);
  const todos = useMemo(() => ROWS.map((r) => calcular(r, cfg)), [cfg]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return todos.filter((c) =>
      (catSel === "TODAS" || c.row.cat === catSel) &&
      (!soComp || c.incl.length >= 2) &&
      (!t || `${c.row.nome} ${c.row.dose}`.toLowerCase().includes(t)));
  }, [todos, busca, catSel, soComp]);

  const grupos = useMemo(() => {
    return CATS.map((cat) => {
      let lista = filtrados.filter((c) => c.row.cat === cat.id);
      if (sort) {
        const k = sort.key;
        const chave = (c: Calc): number | string | null =>
          k === "prod" ? `${c.row.nome} ${c.row.dose}` : k === "best" ? c.min : k === "eco" ? c.eco : c.venda;
        lista = [...lista].sort((a, b) => {
          const x = chave(a), y = chave(b);
          if (x === null && y === null) return 0;
          if (x === null) return 1;
          if (y === null) return -1;
          return (typeof x === "string" ? x.localeCompare(y as string, "pt-BR") : (x as number) - (y as number)) * sort.dir;
        });
      }
      return { cat, todos: lista, abertos: fechados.includes(cat.id) ? [] : lista };
    }).filter((g) => g.todos.length > 0);
  }, [filtrados, sort, fechados]);

  const flat = useMemo(() => grupos.flatMap((g) => g.abertos), [grupos]);

  const cols: Col[] = useMemo(() => {
    const base: Omit<Col, "letter">[] = [
      { kind: "prod", w: 256 }, { kind: "via", w: 112 },
      ...([0, 1, 2] as const).filter((i) => labsOn[i]).map((i) => ({ kind: "lab" as const, lab: i, w: 152 })),
      { kind: "best", w: 168 }, { kind: "eco", w: 136 }, { kind: "ref", w: 128 }, { kind: "mg", w: 96 }, { kind: "venda", w: 152 },
    ];
    return base.map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) }));
  }, [labsOn]);

  // mantém a seleção dentro dos limites quando filtros mudam
  const r = Math.min(Math.max(sel.r, 0), Math.max(flat.length - 1, 0));
  const c = Math.min(sel.c, cols.length - 1);
  const atual = flat[r];
  const colAtual = cols[c];

  const avisar = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); buscaRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = wrapRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [r, c, flat.length]);

  const textoCelula = (cc: Calc, col: Col): string => {
    if (col.kind === "prod") return `${cc.row.nome} ${cc.row.dose}`;
    if (col.kind === "via") return cc.row.via || "—";
    const n = numeroDaCelula(cc, col, base);
    return n ? fmtNum(n) : "—";
  };

  const copiar = () => {
    if (!atual || !colAtual) return;
    const t = textoCelula(atual, colAtual);
    try { void navigator.clipboard?.writeText(t); } catch { /* sem permissão: segue só com o aviso */ }
    avisar(`Copiado: ${t}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mov = (dr: number, dc: number) => {
      e.preventDefault();
      setSel({ r: Math.min(Math.max(r + dr, 0), flat.length - 1), c: Math.min(Math.max(c + dc, 0), cols.length - 1), modo: "cell" });
    };
    if (e.key === "ArrowDown") mov(1, 0);
    else if (e.key === "ArrowUp") mov(-1, 0);
    else if (e.key === "ArrowRight") mov(0, 1);
    else if (e.key === "ArrowLeft") mov(0, -1);
    else if (e.key === "Home") { e.preventDefault(); setSel({ r: e.ctrlKey ? 0 : r, c: 0, modo: "cell" }); }
    else if (e.key === "End") { e.preventDefault(); setSel({ r: e.ctrlKey ? flat.length - 1 : r, c: cols.length - 1, modo: "cell" }); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); copiar(); }
  };

  const alternarLab = (i: number) => {
    if (labsOn[i] && labsOn.filter(Boolean).length === 1) { avisar("Mantenha ao menos um laboratório ligado."); return; }
    setLabsOn((l) => l.map((v, k) => (k === i ? !v : v)));
  };
  const ciclarSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const ajustar = (cat: Cat, d: number) => setMg((m) => ({ ...m, [cat]: Math.min(95, Math.max(0, m[cat] + d)) }));

  /* ---- indicadores ---- */
  const comparaveis = filtrados.filter((x) => x.incl.length >= 2);
  const ecoMedia = comparaveis.length ? (comparaveis.reduce((a, x) => a + (x.eco as number), 0) / comparaveis.length) * 100 : null;
  const aConferir = filtrados.reduce((a, x) => a + x.row.offers.filter((o) => o && o.st !== "ok").length, 0);
  const placar = LABS.map((_, i) => filtrados.filter((x) => x.winners[0]?.lab === i).length);
  const placarTotal = placar.reduce((a, b) => a + b, 0);

  /* ---- estatística da coluna (barra de status, como no Excel) ---- */
  const estat = useMemo(() => {
    let nums: { v: number; tipo: "money" | "pct" }[] = [];
    let rotulo = "";
    if (sel.modo === "row" && atual) {
      nums = cols.map((cl) => numeroDaCelula(atual, cl, base)).filter((x): x is NonNullable<typeof x> => !!x && x.tipo === "money");
      rotulo = `Linha ${r + 1}`;
    } else if (colAtual) {
      nums = flat.map((cc) => numeroDaCelula(cc, colAtual, base)).filter((x): x is NonNullable<typeof x> => !!x);
      rotulo = `Coluna ${colAtual.letter}`;
    }
    if (!nums.length) return null;
    const vs = nums.map((n) => n.v);
    const tipo = nums[0].tipo;
    const f = (v: number) => fmtNum({ v, tipo });
    return { rotulo, n: vs.length, min: f(Math.min(...vs)), max: f(Math.max(...vs)), media: f(vs.reduce((a, b) => a + b, 0) / vs.length) };
  }, [sel.modo, atual, cols, colAtual, flat, base, r]);

  /* ---- descrição da célula na barra de fórmula ---- */
  const descricao = (): ReactNode => {
    if (!atual || !colAtual) return <span style={{ color: "var(--muted)" }}>Nenhuma célula selecionada.</span>;
    const cc = atual, row = cc.row;
    if (colAtual.kind === "prod")
      return <>{row.nome} · {row.dose} · {row.forma}{row.vol ? ` · ${row.vol} ml` : ""} · {CATS.find((x) => x.id === row.cat)?.nome}</>;
    if (colAtual.kind === "via") return <>Via de uso cadastrada: {row.via || "não informada (a categoria não é adivinhada)"}</>;
    if (colAtual.kind === "lab") {
      const o = row.offers[colAtual.lab as number];
      const lab = LABS[colAtual.lab as number];
      if (!o) return <>{lab.nome} · sem preço para esta apresentação</>;
      const st = o.st === "ok" ? "Confirmado" : o.st === "conf" ? "A conferir: fora da comparação se a chave estiver desligada" : o.st === "hist" ? "Histórico de 2022" : "Divergência no documento: não conciliar";
      return <>{lab.nome} · {o.pag ? `pág. ${o.pag}` : ""}{o.linha ? `, linha ${o.linha}` : ""} · caixa com {o.qtd} <b>{brl(o.caixa)}</b> · <b>{brl(o.unit)}</b> por unidade · {st}</>;
    }
    if (colAtual.kind === "best")
      return cc.min === null ? <>Sem preço comparável.</> : <>Menor preço: <b>{brl(cc.min)}</b> · {cc.winners.map((w) => LABS[w.lab].nome).join(" e ")}{cc.max !== null && cc.max !== cc.min ? ` · maior: ${brl(cc.max)}` : " · única oferta, sem comparação"}</>;
    if (colAtual.kind === "eco") return cc.eco === null ? <>É preciso ao menos 2 ofertas para comparar.</> : <>Economia de <b>{pctTxt(cc.eco * 100)}</b> do menor sobre o maior preço.</>;
    if (colAtual.kind === "ref") return cc.ref === null ? <>Sem referência.</> : <>Referência ({MODO_TXT[modo].toLowerCase()}): <b>{brl(cc.ref)}</b>. Alimenta Substâncias e Orçamento na etapa 4.</>;
    if (colAtual.kind === "mg") return <>Margem de lucro da categoria <b>{pctTxt(cc.margem)}</b>. Edite no quadro abaixo.</>;
    return cc.venda === null ? <>Sem preço.</> : <>{brl(cc.ref as number)} ÷ (1 − {pct1.format(cc.margem)}%) = <b>{brl(cc.venda)}</b></>;
  };

  /* ---- pedidos por laboratório ---- */
  const pedidos = useMemo(() => LABS.map((lab, i) => {
    const itens = filtrados.filter((x) => x.winners[0]?.lab === i).map((x) => ({ nome: `${x.row.nome} ${x.row.dose}`, caixa: x.winners[0].caixa, qtd: x.winners[0].qtd }));
    return { lab, i, itens, total: itens.reduce((a, b) => a + b.caixa, 0) };
  }), [filtrados]);
  const copiarPedido = (i: number) => {
    const p = pedidos[i];
    const t = `Rascunho de pedido, ${p.lab.nome}\n${p.itens.map((x) => `1 caixa c/ ${x.qtd}  ${x.nome}  ${brl(x.caixa)}`).join("\n")}\nTotal: ${brl(p.total)}`;
    try { void navigator.clipboard?.writeText(t); } catch { /* idem */ }
    avisar(`Lista de ${p.lab.nome} copiada (${p.itens.length} itens)`);
  };

  /* ---- render de célula ---- */
  const tdProps = (ri: number, ci: number) => ({
    "data-r": ri, "data-c": ci,
    onClick: () => { setSel({ r: ri, c: ci, modo: "cell" }); wrapRef.current?.focus(); },
  });
  const cls = (ri: number, ci: number, extra = "") =>
    `mx-td ${extra} ${sel.modo === "cell" && r === ri && c === ci ? "mx-sel" : ""} ${(sel.modo === "col" && c === ci) || (sel.modo === "row" && r === ri) ? "mx-colsel" : ""}`;

  function celula(cc: Calc, col: Col, ri: number, ci: number) {
    const row = cc.row;
    if (col.kind === "prod")
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "mx-td-fix")}>
          <div className="mx-td-in">
            <div className="mx-prod" title={row.nome}>{row.nome}</div>
            <div className="mx-prod-sub">{row.dose} · {row.forma}{row.vol ? ` · ${row.vol} ml` : ""}</div>
          </div>
        </td>
      );
    if (col.kind === "via")
      return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}><div className="mx-td-in"><span className="mx-via" title={row.via}>{row.via || "—"}</span></div></td>;
    if (col.kind === "lab") {
      const o = row.offers[col.lab as number];
      const lab = LABS[col.lab as number];
      if (!o)
        return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "mx-hatch")}><div className="mx-td-in mx-r"><span className="mx-empty" title="sem preço">—</span></div></td>;
      const ganha = cc.incl.length > 1 && cc.winners.includes(o);
      const excl = !cc.incl.includes(o);
      const main = base === "unit" ? o.unit : o.caixa;
      const sub = base === "unit" ? o.caixa : o.unit;
      return (
        <td key={ci} {...tdProps(ri, ci)} style={{ ["--wc" as string]: lab.cor }}
          className={cls(ri, ci, `${ganha ? "mx-win" : ""} ${o.st === "conf" ? "mx-conf-cell" : ""} ${excl ? "mx-excl" : ""}`)}>
          <div className="mx-td-in">
            <div className="mx-line">
              {ganha ? <span className="mx-tag mx-tag-win"><Trophy size={9} />menor</span>
                : o.st === "conf" ? <span className="mx-tag mx-tag-conf">conferir</span>
                : o.st === "hist" ? <span className="mx-tag mx-tag-hist">2022</span>
                : o.st === "div" ? <span className="mx-tag mx-tag-div">conflito</span> : <span />}
              <Money c={main} />
            </div>
            <div className="mx-sub mx-r" style={{ textAlign: "right" }}>{base === "unit" ? `cx c/${o.qtd} ` : "unid. "}<Money c={sub} /></div>
          </div>
        </td>
      );
    }
    if (col.kind === "best") {
      if (cc.min === null)
        return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "mx-hatch")}><div className="mx-td-in mx-r"><span className="mx-empty">sem preço</span></div></td>;
      const w = cc.winners[0];
      return (
        <td key={ci} {...tdProps(ri, ci)} style={{ ["--bc" as string]: LABS[w.lab].cor }} className={cls(ri, ci, "mx-best")}>
          <div className="mx-td-in mx-r">
            <Money c={cc.min} />
            <div className="mx-bestlab"><span className="mx-sw" style={{ background: LABS[w.lab].cor }} />{cc.winners.map((x) => LABS[x.lab].nome).join(" · ")}</div>
          </div>
        </td>
      );
    }
    if (col.kind === "eco")
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="mx-td-in">
            {cc.eco === null ? <span className="mx-empty mx-r" style={{ textAlign: "right" }}>1 oferta</span> : (
              <div className="mx-eco">
                <div className="mx-ecobar"><i style={{ width: `${Math.min(100, (cc.eco / 0.6) * 100)}%` }} /></div>
                <span className="mx-money" style={{ fontSize: 15 }}>{pctTxt(cc.eco * 100)}</span>
              </div>
            )}
          </div>
        </td>
      );
    if (col.kind === "ref")
      return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}><div className="mx-td-in mx-r">{cc.ref === null ? <span className="mx-empty">—</span> : <Money c={cc.ref} />}</div></td>;
    if (col.kind === "mg")
      return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}><div className="mx-td-in mx-r"><span className="mx-mg">{pctTxt(cc.margem)}</span></div></td>;
    return (
      <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "mx-venda")}>
        <div className="mx-td-in mx-r">{cc.venda === null ? <span className="mx-empty">—</span> : <Money c={cc.venda} />}</div>
      </td>
    );
  }

  const cabecalho = (col: Col, ci: number) => {
    const on = (sel.modo === "col" && c === ci) || (sel.modo === "cell" && c === ci);
    const sortKey: SortKey | null = col.kind === "prod" ? "prod" : col.kind === "best" ? "best" : col.kind === "eco" ? "eco" : col.kind === "venda" ? "venda" : null;
    const lab = col.kind === "lab" ? LABS[col.lab as number] : null;
    const titulo = lab ? lab.nome : { prod: "Produto", via: "Via", best: "Melhor valor", eco: "Economia", ref: "Referência", mg: "Margem", venda: "Venda", lab: "" }[col.kind];
    const sub = lab ? lab.sub : { prod: `${flat.length} apresentações`, via: "cadastro", best: "menor + laboratório", eco: "menor vs. maior", ref: MODO_TXT[modo], mg: "da categoria", venda: base === "unit" ? "sugerida · unidade" : "sugerida · caixa", lab: "" }[col.kind];
    const Seta = sort && sortKey === sort.key ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th key={ci} className={`mx-th ${col.kind === "best" ? "mx-th-best" : ""} ${col.kind === "prod" ? "mx-th-fix" : ""}`}
        style={{ ["--tc" as string]: lab ? lab.cor : col.kind === "best" ? undefined : "#5f719b", left: col.kind === "prod" ? 48 : undefined }}
        data-on={on ? 1 : 0} onClick={() => setSel({ r, c: ci, modo: "col" })}>
        <div className="mx-th-in">
          <div className="mx-th-t">
            <b title={lab?.full}>{titulo}</b>
            <span>{lab && <i className={`mx-led ${lab.led === "amber" ? "mx-led-amber" : lab.led === "gray" ? "mx-led-gray" : ""}`} />}{sub}</span>
          </div>
          {sortKey && (
            <button type="button" className="mx-th-sort" data-on={sort?.key === sortKey ? 1 : 0} aria-label={`Ordenar por ${titulo}`}
              onClick={(e) => { e.stopPropagation(); ciclarSort(sortKey); }}><Seta size={13} /></button>
          )}
        </div>
      </th>
    );
  };

  let numero = 0;
  const larguraTotal = 48 + cols.reduce((a, x) => a + x.w, 0);

  return (
    <div className="mx-root">
      {/* ------------------------------ topo */}
      <div className="mx-top">
        <div className="mx-bevel mx-plate">
          <small>CADASTROS CLÍNICOS</small>
          <h1>Matrix: Substâncias x Fornecedores</h1>
        </div>
        <div className="mx-kpis">
          <div className="mx-panel mx-kpi"><span>Produtos na tela</span><b>{filtrados.length}</b><em>de {ROWS.length} com preço</em></div>
          <div className="mx-panel mx-kpi"><span>Comparáveis</span><b>{comparaveis.length}</b><em>com 2 ofertas ou mais</em></div>
          <div className="mx-panel mx-kpi"><span>Economia média</span><b>{ecoMedia === null ? "—" : pctTxt(ecoMedia)}</b><em>menor sobre o maior</em></div>
          <div className="mx-panel mx-kpi"><span>Ofertas a conferir</span><b style={{ color: "#a86a0c" }}>{aConferir}</b><em>Bio meds, Formédica 2022</em></div>
        </div>
        <div className="mx-panel mx-score">
          <span>Quem tem o menor preço</span>
          <div className="mx-scorebar" role="img" aria-label="Placar de menores preços por laboratório">
            {LABS.map((l, i) => placar[i] > 0 && <i key={l.nome} style={{ flexGrow: placar[i], background: l.cor }} title={`${l.nome}: ${placar[i]}`} />)}
          </div>
          <div className="mx-scoreleg">
            {LABS.map((l, i) => <span key={l.nome}><i className="mx-sw" style={{ background: l.cor, marginRight: 5 }} /><b>{placar[i]}</b> {l.nome.split(" ")[0]}{placarTotal ? "" : ""}</span>)}
          </div>
        </div>
      </div>

      {/* ------------------------------ controles */}
      <div className="mx-panel mx-ctrl">
        <div className="mx-search">
          <Search size={15} />
          <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar substância ou dose" aria-label="Buscar substância ou dose" />
          {busca ? <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")} style={{ position: "absolute", right: 6, top: 6, width: 24, height: 24, border: 0, background: "transparent", display: "grid", placeItems: "center" }}><X size={14} /></button> : <kbd>/</kbd>}
        </div>
        <div className="mx-group" role="group" aria-label="Categoria">
          <button type="button" className="mx-chip" aria-pressed={catSel === "TODAS"} onClick={() => setCatSel("TODAS")}>Todas <small>{todos.length}</small></button>
          {CATS.map((x) => {
            const n = todos.filter((t) => t.row.cat === x.id).length;
            return n ? <button key={x.id} type="button" className="mx-chip" aria-pressed={catSel === x.id} onClick={() => setCatSel(x.id)}>{x.curto} <small>{n}</small></button> : null;
          })}
        </div>
        <div className="mx-sep" />
        <div className="mx-group" role="group" aria-label="Laboratórios">
          {LABS.map((l, i) => (
            <button key={l.nome} type="button" className="mx-lab" aria-pressed={labsOn[i]} onClick={() => alternarLab(i)}>
              <span className="mx-sw" style={{ background: l.cor }} />{l.nome}
            </button>
          ))}
        </div>
        <div className="mx-sep" />
        <div className="mx-group"><label>Preço por</label>
          <div className="mx-well mx-seg" role="group" aria-label="Base do preço">
            <button type="button" aria-pressed={base === "unit"} onClick={() => setBase("unit")}>Unidade</button>
            <button type="button" aria-pressed={base === "caixa"} onClick={() => setBase("caixa")}>Caixa</button>
          </div>
        </div>
        <div className="mx-group"><label>Referência</label>
          <div className="mx-well mx-seg" role="group" aria-label="Regra da referência">
            {(["maior", "media", "menor"] as Modo[]).map((m) => <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}>{MODO_TXT[m]}</button>)}
          </div>
        </div>
        <div className="mx-well" style={{ display: "flex", alignItems: "center" }}>
          <label className="mx-check"><input type="checkbox" checked={soComp} onChange={(e) => setSoComp(e.target.checked)} />Só comparáveis</label>
          <label className="mx-check"><input type="checkbox" checked={incConf} onChange={(e) => setIncConf(e.target.checked)} />Incluir a conferir</label>
          <label className="mx-check"><input type="checkbox" checked={incHist} onChange={(e) => setIncHist(e.target.checked)} />Incluir 2022</label>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button type="button" className="mx-btn" onClick={() => setModal("ped")}><ShoppingCart size={15} />Pedido por laboratório</button>
          <button type="button" className="mx-btn mx-btn-gold" onClick={() => setModal("ref")}><FileSpreadsheet size={15} />Enviar referência às Substâncias</button>
        </div>
      </div>

      {/* ------------------------------ barra de fórmula */}
      <div className="mx-panel mx-fx" aria-live="polite">
        <div className="mx-fx-name">{atual && colAtual ? `${colAtual.letter}${r + 1}` : "—"}</div>
        <div className="mx-fx-i">fx</div>
        <div className="mx-fx-txt">{descricao()}</div>
        <div className="mx-fx-act">
          <button type="button" className="mx-btn" style={{ height: 28 }} onClick={copiar} disabled={!atual}><Copy size={13} />Copiar <kbd style={{ fontSize: 10, opacity: .6 }}>Ctrl+C</kbd></button>
        </div>
      </div>

      {/* ------------------------------ grade */}
      <div className="mx-gridwrap" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-label="Matriz de preços por substância e fornecedor">
        {flat.length === 0 && grupos.length === 0 ? (
          <div className="mx-none">
            <FileSpreadsheet size={36} />
            <b>Nenhum produto com esses filtros</b>
            <span>Tire a busca ou volte para &quot;Todas&quot; as categorias.</span>
            <button type="button" className="mx-btn" onClick={() => { setBusca(""); setCatSel("TODAS"); setSoComp(false); }}>Limpar filtros</button>
          </div>
        ) : (
          <table className="mx-table" style={{ width: "100%", minWidth: larguraTotal }}>
            <colgroup><col style={{ width: 48 }} />{cols.map((x, i) => <col key={i} style={{ width: x.w }} />)}</colgroup>
            <thead>
              <tr>
                <th className="mx-corner" style={{ height: 26 }} />
                {cols.map((x, i) => (
                  <th key={i} className="mx-letter" data-on={(sel.modo !== "row" && c === i) ? 1 : 0} onClick={() => setSel({ r, c: i, modo: "col" })}>{x.letter}</th>
                ))}
              </tr>
              <tr>
                <th className="mx-corner" style={{ top: 26, height: 56, zIndex: 8 }}>
                  <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--gold-d)" }}><FileSpreadsheet size={16} /></div>
                </th>
                {cols.map(cabecalho)}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const aberto = !fechados.includes(g.cat.id);
                const comp = g.todos.filter((x) => x.incl.length >= 2);
                const eco = comp.length ? (comp.reduce((a, x) => a + (x.eco as number), 0) / comp.length) * 100 : null;
                return [
                  <tr key={`b-${g.cat.id}`} className="mx-band" onClick={() => setFechados((f) => (f.includes(g.cat.id) ? f.filter((x) => x !== g.cat.id) : [...f, g.cat.id]))}>
                    <td colSpan={cols.length + 1}>
                      <div className="mx-band-in" data-open={aberto ? 1 : 0}>
                        <ChevronDown size={15} className="mx-chev" />
                        {g.cat.nome}
                        <small>{g.todos.length} produtos</small>
                        <small>margem {pctTxt(mg[g.cat.id])}</small>
                        {eco !== null && <small>economia média {pctTxt(eco)}</small>}
                      </div>
                    </td>
                  </tr>,
                  ...g.abertos.map((cc) => {
                    const ri = numero++;
                    return (
                      <tr key={cc.row.id} data-zebra={ri % 2}>
                        <th className="mx-rn" scope="row" data-on={(sel.modo === "row" || sel.modo === "cell") && r === ri ? 1 : 0}
                          onClick={() => setSel({ r: ri, c, modo: "row" })}>{ri + 1}</th>
                        {cols.map((col, ci) => celula(cc, col, ri, ci))}
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ------------------------------ margem + status */}
      <div className="mx-foot">
        <div className="mx-panel mx-margins">
          <b>Margem de lucro<br />por categoria</b>
          {CATS.filter((x) => todos.some((t) => t.row.cat === x.id)).map((x) => (
            <div key={x.id} className="mx-well mx-mgin">
              <span>{x.curto}<em>{todos.filter((t) => t.row.cat === x.id).length} produtos</em></span>
              <button type="button" aria-label={`Diminuir margem de ${x.curto}`} onClick={() => ajustar(x.id, -1)}><Minus size={13} /></button>
              <input value={mg[x.id]} inputMode="numeric" aria-label={`Margem de ${x.curto} em porcentagem`}
                onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); setMg((m) => ({ ...m, [x.id]: Math.min(95, n) })); }} />
              <span style={{ minWidth: 0, fontWeight: 700 }}>%</span>
              <button type="button" aria-label={`Aumentar margem de ${x.curto}`} onClick={() => ajustar(x.id, 1)}><Plus size={13} /></button>
            </div>
          ))}
          <span className="mx-note" style={{ marginLeft: "auto", maxWidth: 260 }}>Venda = referência ÷ (1 − margem). Margens de exemplo.</span>
        </div>
        <div className="mx-panel mx-stat" aria-live="polite">
          <div className="mx-statlab"><span>Seleção</span><b>{estat ? estat.rotulo : "—"}</b></div>
          <div><span>Contagem</span><b>{estat ? estat.n : "—"}</b></div>
          <div><span>Mínimo</span><b>{estat ? estat.min : "—"}</b></div>
          <div><span>Média</span><b>{estat ? estat.media : "—"}</b></div>
          <div><span>Máximo</span><b>{estat ? estat.max : "—"}</b></div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}><span>Atalhos</span><b style={{ fontFamily: "Inter", fontSize: 11 }}>Setas navegam · Ctrl+C copia · / busca</b></div>
        </div>
      </div>

      {/* ------------------------------ modal */}
      {modal && (
        <div className="mx-scrim" onClick={() => setModal(null)}>
          <div className="mx-panel mx-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="mx-bevel mx-modal-h" style={{ borderRadius: "6px 6px 0 0" }}>
              <h2>{modal === "ref" ? "Enviar referência às Substâncias" : "Pedido por laboratório"}</h2>
              <button type="button" className="mx-modal-x" aria-label="Fechar" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="mx-modal-b">
              {modal === "ref" ? (
                <>
                  <p className="mx-note" style={{ margin: 0 }}>
                    Regra ativa: <b>{MODO_TXT[modo]}</b>, preço {base === "unit" ? "por unidade" : "por caixa"}. {filtrados.filter((x) => x.ref !== null).length} substâncias recebem referência;
                    o cadastro de Substâncias e o Orçamento passam a ler este valor. Custo nunca sobrescreve o preço de venda atual.
                  </p>
                  <div className="mx-well" style={{ padding: 4 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead><tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>
                        <th style={{ padding: "8px 10px" }}>Produto</th><th style={{ textAlign: "right" }}>Referência</th><th style={{ textAlign: "right" }}>Margem</th><th style={{ textAlign: "right", paddingRight: 10 }}>Venda sugerida</th></tr></thead>
                      <tbody>
                        {filtrados.filter((x) => x.ref !== null).slice(0, 7).map((x) => (
                          <tr key={x.row.id} style={{ borderTop: "1px solid var(--line)" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 600, textTransform: "uppercase" }}>{x.row.nome} <span style={{ color: "var(--muted)", fontWeight: 500 }}>{x.row.dose}</span></td>
                            <td style={{ textAlign: "right" }}><Money c={x.ref as number} /></td>
                            <td style={{ textAlign: "right" }}><span className="mx-mg">{pctTxt(x.margem)}</span></td>
                            <td style={{ textAlign: "right", paddingRight: 10 }}><Money c={x.venda as number} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mx-note" style={{ padding: "8px 10px" }}>e mais {Math.max(0, filtrados.filter((x) => x.ref !== null).length - 7)} substâncias.</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button type="button" className="mx-btn" onClick={() => setModal(null)}>Voltar</button>
                    <button type="button" className="mx-btn mx-btn-gold" onClick={() => { setModal(null); avisar("Prévia: nada foi gravado. A gravação entra na etapa 4."); }}>Gravar referência (prévia)</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mx-note" style={{ margin: 0 }}>Cada produto vai para o laboratório de menor preço. É um rascunho: nada é enviado a laboratório e o estoque não muda.</p>
                  <div className="mx-pedidos">
                    {pedidos.map((p) => (
                      <div key={p.lab.nome} className="mx-panel mx-ped" style={{ ["--pc" as string]: p.lab.cor }}>
                        <h3>{p.lab.nome}</h3>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span className="mx-serif" style={{ fontSize: 30, fontWeight: 800 }}>{p.itens.length}</span><span className="mx-note">itens · 1 caixa de cada</span>
                        </div>
                        <Money c={p.total} />
                        <ul>{p.itens.slice(0, 6).map((x) => <li key={x.nome}><span>{x.nome}</span><Money c={x.caixa} /></li>)}{p.itens.length === 0 && <li><span className="mx-empty">Nenhum item vence aqui.</span></li>}</ul>
                        {p.itens.length > 6 && <span className="mx-note">e mais {p.itens.length - 6}</span>}
                        <button type="button" className="mx-btn" disabled={!p.itens.length} onClick={() => copiarPedido(p.i)}><Copy size={13} />Copiar lista</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {toast && <div className="mx-bevel mx-toast" role="status">{toast}</div>}
    </div>
  );
}

export default MatrizFornecedores;
