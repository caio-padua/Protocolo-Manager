import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Calculator, ChevronDown, Copy, FileSpreadsheet, Lock, Minus, Plus, RefreshCw, Search, ShoppingCart, Trophy, X,
} from "lucide-react";
import "./matriz-fornecedores-v2.css";
import { DADOS_V2 } from "./dados-v2";

/* ------------------------------------------------------------------ dados */
type Status = "ok" | "conf" | "hist" | "div";
type Tipo = "ampola" | "frasco" | "implante";
type Offer = { lab: 0 | 1 | 2; unit: number; caixa: number; qtd: number; tipo: Tipo; pag: number; linha: number; st: Status; obs: string };
type Cat = "IM" | "SC" | "IMP" | "OT" | "SV";
type Row = { id: number; nome: string; dose: string; concs: string[]; cad: boolean; via: string; cat: Cat; offers: (Offer | null)[] };

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

const TIPOS: Tipo[] = ["ampola", "frasco", "implante"];
const ROWS: Row[] = DADOS_V2.map((d, i) => {
  const [nome, dose, cat, via, cad, concs, of] = d;
  const offers: (Offer | null)[] = of.map((o, lab) =>
    o ? { lab: lab as 0 | 1 | 2, unit: o[0], caixa: o[1], qtd: o[2], tipo: TIPOS[o[3]], pag: o[4], linha: o[5], st: o[6], obs: o[7] } : null);
  return { id: i + 1, nome, dose, concs, cad: cad === 1, via, cat: cat as Cat, offers };
});

/** Dose curta: composições longas viram "composto"; o texto inteiro fica no título e na barra de fórmula. */
const doseCurta = (d: string): string => {
  if (d.length <= 24) return d;
  const n = d.split(/\s*(?:\+|\/)\s*/).length;
  return `composto · ${n} ativos`;
};
const unidadeTxt = (o: Offer) => (o.tipo === "implante" ? "implante" : o.tipo === "frasco" ? (o.qtd > 1 ? "frascos" : "frasco") : "ampolas");

/* ------------------------------------------------------------ formatação */
const brl = (c: number) => `R$ ${Math.floor(c / 100).toLocaleString("pt-BR")},${String(c % 100).padStart(2, "0")}`;
const pct1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctTxt = (x: number) => `${pct1.format(x)}%`;

const sinal = (x: number) => `${x >= 0 ? "+" : "−"}${pct1.format(Math.abs(x))}%`;
const fmtIn = (n: number) => String(n).replace(".", ",");

/** Campo numérico com vírgula decimal; guarda o texto digitado e normaliza ao sair do campo. */
function NumField({ value, onChange, max = 95, label, w = 64 }: { value: number; onChange: (n: number) => void; max?: number; label: string; w?: number }) {
  const [txt, setTxt] = useState(fmtIn(value));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setTxt(fmtIn(value)); }, [value]);
  return (
    <input className="mx-num" style={{ width: w }} value={txt} inputMode="decimal" aria-label={label}
      onFocus={(e) => { foco.current = true; e.currentTarget.select(); }}
      onBlur={() => { foco.current = false; setTxt(fmtIn(value)); }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d,.]/g, "");
        setTxt(t);
        const n = parseFloat(t.replace(",", "."));
        onChange(Number.isNaN(n) ? 0 : Math.min(max, Math.max(0, Math.round(n * 10) / 10)));
      }} />
  );
}

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
type Arred = "nenhum" | "inteiro" | "90";
/** Custos e encargos (valem para todos). frete e perda incidem sobre o custo; os demais, sobre a venda. */
type Preco = { frete: number; perda: number; imp: number; cartao: number; comissao: number; desp: number; arred: Arred };
type Congelado = Record<Cat, Record<number, number> | null>;
type Cfg = { base: Base; modo: Modo; incConf: boolean; incHist: boolean; labsOn: boolean[]; mg: Record<Cat, number>; preco: Preco; cong: Congelado };
type Forma = { ref: number; entrada: number; custoEf: number; imp: number; cartao: number; comissao: number; desp: number; lucro: number; venda: number; margemReal: number };
type Calc = {
  row: Row; incl: Offer[]; min: number | null; max: number | null; ref: number | null;
  forma: Forma | null; invalido: boolean; venda: number | null; pub: number | null; pend: boolean;
  winners: Offer[]; eco: number | null; margem: number;
};
const val = (o: Offer, base: Base) => (base === "unit" ? o.unit : o.caixa);
const PRECO0: Preco = { frete: 2.5, perda: 1.5, imp: 6, cartao: 3.2, comissao: 2, desp: 8, arred: "90" };
const MG0: Record<Cat, number> = { IM: 38, SC: 42, IMP: 35, OT: 30, SV: 30 };
const CONG0: Congelado = { IM: null, SC: null, IMP: null, OT: null, SV: null };

/** Preço = custo efetivo ÷ (1 − impostos − cartão − comissão − despesas − margem). Devolve null se a soma passar de 95%. */
function formar(ref: number, margem: number, p: Preco): Forma | null {
  const custoEf = ref * (1 + p.frete / 100) * (1 + p.perda / 100);
  const divisor = 1 - (p.imp + p.cartao + p.comissao + p.desp + margem) / 100;
  if (divisor < 0.05) return null;
  const bruto = custoEf / divisor;
  const venda = p.arred === "inteiro" ? Math.ceil(bruto / 100) * 100 : p.arred === "90" ? Math.max(90, Math.ceil((bruto - 90) / 100) * 100 + 90) : Math.round(bruto);
  const imp = (venda * p.imp) / 100, cartao = (venda * p.cartao) / 100, comissao = (venda * p.comissao) / 100, desp = (venda * p.desp) / 100;
  const lucro = venda - custoEf - imp - cartao - comissao - desp;
  return { ref, entrada: custoEf - ref, custoEf, imp, cartao, comissao, desp, lucro, venda, margemReal: (lucro / venda) * 100 };
}

function calcular(row: Row, cfg: Cfg): Calc {
  const incl = row.offers.filter((o): o is Offer =>
    !!o && cfg.labsOn[o.lab] && o.st !== "div" && (o.st === "ok" || (o.st === "conf" && cfg.incConf) || (o.st === "hist" && cfg.incHist)));
  const vs = incl.map((o) => val(o, cfg.base));
  const min = vs.length ? Math.min(...vs) : null;
  const max = vs.length ? Math.max(...vs) : null;
  const ref = !vs.length ? null : cfg.modo === "maior" ? max : cfg.modo === "menor" ? min : Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
  const margem = cfg.mg[row.cat];
  const forma = ref === null ? null : formar(ref, margem, cfg.preco);
  const venda = forma ? Math.round(forma.venda) : null;
  const snap = cfg.cong[row.cat];
  const pub = snap ? (snap[row.id] ?? null) : venda;
  return {
    row, incl, min, max, ref, margem, forma, venda, pub,
    invalido: ref !== null && forma === null,
    pend: !!snap && pub !== venda,
    winners: min === null ? [] : incl.filter((o) => val(o, cfg.base) === min),
    eco: incl.length >= 2 && max ? (max - (min as number)) / max : null,
  };
}

/* --------------------------------------------------------------- colunas */
type ColKind = "prod" | "via" | "lab" | "best" | "eco" | "ref" | "custo" | "venda";
type Col = { kind: ColKind; lab?: 0 | 1 | 2; w: number; letter: string };
type SortKey = "prod" | "best" | "eco" | "venda";
const MODO_TXT: Record<Modo, string> = { maior: "Maior valor", media: "Média", menor: "Menor valor" };

function numeroDaCelula(c: Calc, col: Col, base: Base): { v: number; tipo: "money" | "pct" } | null {
  if (col.kind === "lab") { const o = c.row.offers[col.lab as number]; return o ? { v: val(o, base), tipo: "money" } : null; }
  if (col.kind === "best") return c.min === null ? null : { v: c.min, tipo: "money" };
  if (col.kind === "eco") return c.eco === null ? null : { v: c.eco * 100, tipo: "pct" };
  if (col.kind === "ref") return c.ref === null ? null : { v: c.ref, tipo: "money" };
  if (col.kind === "custo") return c.forma === null ? null : { v: c.forma.custoEf, tipo: "money" };
  if (col.kind === "venda") return c.pub === null ? null : { v: c.pub, tipo: "money" };
  return null;
}
const fmtNum = (n: { v: number; tipo: "money" | "pct" }) => (n.tipo === "money" ? brl(Math.round(n.v)) : pctTxt(n.v));

/* ------------------------------------------------------------------ tela */
export function MatrizFornecedoresV2() {
  const [busca, setBusca] = useState("");
  const [catSel, setCatSel] = useState<Cat | "TODAS">("TODAS");
  const [soComp, setSoComp] = useState(false);
  const [base, setBase] = useState<Base>("unit");
  const [modo, setModo] = useState<Modo>("maior");
  const [incConf, setIncConf] = useState(true);
  const [incHist, setIncHist] = useState(true);
  const [labsOn, setLabsOn] = useState([true, true, true]);
  const [mg, setMg] = useState<Record<Cat, number>>(MG0);
  const [preco, setPreco] = useState<Preco>(PRECO0);
  const [cong, setCong] = useState<Congelado>(CONG0);
  const [dockAberto, setDockAberto] = useState(true);
  const [igual, setIgual] = useState(35);
  const [fechados, setFechados] = useState<Cat[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>({ key: "eco", dir: -1 });
  const [sel, setSel] = useState<{ r: number; c: number; modo: "cell" | "col" | "row" }>({ r: 0, c: 5, modo: "cell" });
  const [modal, setModal] = useState<null | "ref" | "ped">(null);
  const [toast, setToast] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const toastT = useRef<number | undefined>(undefined);

  const cfg: Cfg = useMemo(() => ({ base, modo, incConf, incHist, labsOn, mg, preco, cong }), [base, modo, incConf, incHist, labsOn, mg, preco, cong]);
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
          k === "prod" ? `${c.row.nome} ${c.row.dose}` : k === "best" ? c.min : k === "eco" ? c.eco : c.pub;
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
      { kind: "prod", w: 272 }, { kind: "via", w: 112 },
      ...([0, 1, 2] as const).filter((i) => labsOn[i]).map((i) => ({ kind: "lab" as const, lab: i, w: 168 })),
      { kind: "best", w: 160 }, { kind: "eco", w: 128 }, { kind: "ref", w: 112 }, { kind: "custo", w: 128 }, { kind: "venda", w: 176 },
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
  const ajustar = (cat: Cat, d: number) => setMg((m) => ({ ...m, [cat]: Math.min(95, Math.max(0, Math.round((m[cat] + d) * 10) / 10)) }));
  const ajusteGeral = (d: number) => { setMg((m) => Object.fromEntries(CATS.map((x) => [x.id, Math.min(95, Math.max(0, m[x.id] + d))])) as Record<Cat, number>); avisar(`Todas as margens ${d > 0 ? "subiram" : "desceram"} ${Math.abs(d)} ponto`); };
  const igualarTodas = () => { setMg(Object.fromEntries(CATS.map((x) => [x.id, igual])) as Record<Cat, number>); avisar(`Todas as categorias com margem de ${pctTxt(igual)}`); };
  const mudarPreco = (k: keyof Preco, v: number | Arred) => setPreco((p) => ({ ...p, [k]: v }));

  /* ---- precificação: toggle por categoria (automático x congelado) ---- */
  const fotografar = (cat: Cat) =>
    Object.fromEntries(todos.filter((t) => t.row.cat === cat && t.venda !== null).map((t) => [t.row.id, t.venda as number]));
  const definirAuto = (cat: Cat, ligado: boolean) => {
    setCong((c) => ({ ...c, [cat]: ligado ? null : fotografar(cat) }));
    avisar(ligado ? `${CATS.find((x) => x.id === cat)?.curto}: preços voltam a acompanhar custo e margem` : `${CATS.find((x) => x.id === cat)?.curto}: preços congelados no valor de agora`);
  };
  const definirTodas = (ligado: boolean) => {
    setCong((c) => {
      const n = { ...c };
      for (const x of CATS) n[x.id] = ligado ? null : fotografar(x.id);
      return n;
    });
    avisar(ligado ? "Todos os preços voltam a acompanhar custo e margem" : "Todos os preços congelados no valor de agora");
  };
  const aplicarAgora = (cat: Cat) => { setCong((c) => ({ ...c, [cat]: fotografar(cat) })); avisar(`${CATS.find((x) => x.id === cat)?.curto}: novos preços aplicados`); };

  /* ---- indicadores ---- */
  const comparaveis = filtrados.filter((x) => x.incl.length >= 2);
  const ecoMedia = comparaveis.length ? (comparaveis.reduce((a, x) => a + (x.eco as number), 0) / comparaveis.length) * 100 : null;
  const aConferir = filtrados.reduce((a, x) => a + x.row.offers.filter((o) => o && o.st !== "ok").length, 0);
  const nPorLab = LABS.map((_, i) => ROWS.filter((x) => x.offers[i]).length);
  const catsAtivas = CATS.filter((x) => todos.some((t) => t.row.cat === x.id));
  const todasAuto = catsAtivas.every((x) => cong[x.id] === null);
  const encargos = preco.imp + preco.cartao + preco.comissao + preco.desp;
  const statCat = useMemo(() => {
    const out = {} as Record<Cat, { n: number; avg: number | null; pend: number; diff: number | null; ruim: boolean }>;
    for (const cat of CATS) {
      const ls = todos.filter((t) => t.row.cat === cat.id);
      const com = ls.filter((t) => t.pub !== null);
      const pend = ls.filter((t) => t.pend && t.venda !== null);
      const diffs = pend.filter((t) => t.pub).map((t) => (((t.venda as number) - (t.pub as number)) / (t.pub as number)) * 100);
      out[cat.id] = {
        n: ls.length, pend: pend.length, ruim: ls.some((t) => t.invalido),
        avg: com.length ? Math.round(com.reduce((a, t) => a + (t.pub as number), 0) / com.length) : null,
        diff: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
      };
    }
    return out;
  }, [todos]);
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
      return <>{row.nome} · dose {row.dose} · concentração {row.concs.join(" ou ")} · {CATS.find((x) => x.id === row.cat)?.nome}{row.cad ? "" : " · fora do cadastro de Substâncias (a incluir)"} · mesma dose = mesmo produto, mesmo com concentração diferente</>;
    if (colAtual.kind === "via") return <>Via de uso cadastrada: {row.via || "não informada (a categoria não é adivinhada)"}</>;
    if (colAtual.kind === "lab") {
      const o = row.offers[colAtual.lab as number];
      const lab = LABS[colAtual.lab as number];
      if (!o) return <>{lab.nome} · sem preço para esta apresentação</>;
      const st = o.st === "ok" ? "Confirmado" : o.st === "conf" ? "A conferir: fora da comparação se a chave estiver desligada" : o.st === "hist" ? "Histórico de 2022" : "Divergência no documento: não conciliar";
      return <>{lab.nome} · {o.pag ? `pág. ${o.pag}` : ""}{o.linha ? `, linha ${o.linha}` : ""} · caixa com {o.qtd} {unidadeTxt(o)} <b>{brl(o.caixa)}</b> · <b>{brl(o.unit)}</b> por unidade · {st}{o.obs ? ` · ${o.obs}` : ""}</>;
    }
    if (colAtual.kind === "best")
      return cc.min === null ? <>Sem preço comparável.</> : <>Menor preço: <b>{brl(cc.min)}</b> · {cc.winners.map((w) => LABS[w.lab].nome).join(" e ")}{cc.max !== null && cc.max !== cc.min ? ` · maior: ${brl(cc.max)}` : " · única oferta, sem comparação"}</>;
    if (colAtual.kind === "eco") return cc.eco === null ? <>É preciso ao menos 2 ofertas para comparar.</> : <>Economia de <b>{pctTxt(cc.eco * 100)}</b> do menor sobre o maior preço.</>;
    if (colAtual.kind === "ref") return cc.ref === null ? <>Sem referência.</> : <>Referência ({MODO_TXT[modo].toLowerCase()}): <b>{brl(cc.ref)}</b>. Alimenta Substâncias e Orçamento na etapa 4.</>;
    if (colAtual.kind === "custo")
      return cc.forma === null ? <>{cc.invalido ? "A soma de encargos e margem passa de 95%: ajuste a precificação." : "Sem custo."}</> :
        <>{brl(cc.forma.ref)} + frete {pct1.format(preco.frete)}% + perda {pct1.format(preco.perda)}% = custo efetivo <b>{brl(Math.round(cc.forma.custoEf))}</b></>;
    if (cc.forma === null) return <>{cc.invalido ? "A soma de encargos e margem passa de 95%: ajuste a precificação." : "Sem preço."}</>;
    return <>{brl(Math.round(cc.forma.custoEf))} ÷ (1 − {pct1.format(encargos)}% encargos − {pct1.format(cc.margem)}% margem) = <b>{brl(cc.forma.venda)}</b>{preco.arred !== "nenhum" ? ` (arredondado ${preco.arred === "90" ? "para ,90" : "para o real"})` : ""} · lucro <b>{brl(Math.round(cc.forma.lucro))}</b> ({pctTxt(cc.forma.margemReal)}){cong[cc.row.cat] ? ` · preço congelado em ${cc.pub === null ? "—" : brl(cc.pub)}` : ""}</>;
  };

  /* ---- pedidos por laboratório ---- */
  const pedidos = useMemo(() => LABS.map((lab, i) => {
    const itens = filtrados.filter((x) => x.winners[0]?.lab === i).map((x) => ({ nome: `${x.row.nome} ${x.row.dose}`, caixa: x.winners[0].caixa, qtd: x.winners[0].qtd }));
    return { lab, i, itens, total: itens.reduce((a, b) => a + b.caixa, 0) };
  }), [filtrados]);
  const copiarPedido = (i: number) => {
    const p = pedidos[i];
    const t = `Rascunho de pedido, ${p.lab.nome}\n${p.itens.map((x) => `1 cx c/ ${x.qtd} un.  ${x.nome}  ${brl(x.caixa)}`).join("\n")}\nTotal: ${brl(p.total)}`;
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
          <div className="mx-td-in mx-3f">
            <div className="mx-f1 mx-prod" title={row.nome}>
              <span className="mx-prod-n">{row.nome}</span>
              {!row.cad && <span className="mx-tag mx-tag-new" title="Ainda não existe no cadastro de Substâncias">novo</span>}
            </div>
            <div className="mx-f2 mx-dose" title={row.dose}><i>Dose</i><b>{doseCurta(row.dose)}</b></div>
            <div className="mx-f3 mx-conc" title={row.concs.join("  |  ")}>
              <i>Conc.</i><span>{row.concs[0]}</span>
              {row.concs.length > 1 && <em className="mx-more">+{row.concs.length - 1}</em>}
            </div>
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
      const cheias = Math.min(o.qtd, 10);
      return (
        <td key={ci} {...tdProps(ri, ci)} style={{ ["--wc" as string]: lab.cor }}
          className={cls(ri, ci, `${ganha ? "mx-win" : ""} ${o.st === "conf" ? "mx-conf-cell" : ""} ${excl ? "mx-excl" : ""}`)}>
          <div className="mx-td-in mx-3f">
            <div className="mx-f1 mx-line" data-base={base === "unit" ? 1 : 0}>
              {ganha ? <span className="mx-tag mx-tag-win"><Trophy size={9} />menor</span>
                : o.st === "conf" ? <span className="mx-tag mx-tag-conf">conferir</span>
                : o.st === "hist" ? <span className="mx-tag mx-tag-hist">2022</span>
                : o.st === "div" ? <span className="mx-tag mx-tag-div">conflito</span> : <span className="mx-lbl">unid.</span>}
              <Money c={o.unit} />
            </div>
            <div className="mx-f2 mx-line mx-cx" data-base={base === "caixa" ? 1 : 0}>
              <span className="mx-lbl">{o.tipo === "implante" ? "unidade" : "caixa"}</span>
              <Money c={o.caixa} />
            </div>
            <div className="mx-f3 mx-pres" title={`Apresentação: ${o.qtd} ${unidadeTxt(o)} por caixa`}>
              <span className="mx-pres-t">c/ {o.qtd} un.</span>
              <span className="mx-slots" aria-hidden="true">
                {Array.from({ length: 10 }, (_, k) => <i key={k} data-on={k < cheias ? 1 : 0} />)}
              </span>
            </div>
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
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="mx-td-in mx-r">{cc.ref === null ? <span className="mx-empty">—</span> : <><Money c={cc.ref} /><span className="mx-sub2">{MODO_TXT[modo].toLowerCase()}</span></>}</div>
        </td>
      );
    if (col.kind === "custo")
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="mx-td-in mx-r">
            {cc.forma === null ? <span className="mx-empty">{cc.invalido ? "inviável" : "—"}</span> : <><Money c={Math.round(cc.forma.custoEf)} /><span className="mx-sub2">+{pct1.format((cc.forma.custoEf / cc.forma.ref - 1) * 100)}% frete e perda</span></>}
          </div>
        </td>
      );
    const f = cc.forma;
    const frz = !!cong[row.cat];
    const dif = cc.pend && cc.venda !== null && cc.pub ? ((cc.venda - cc.pub) / cc.pub) * 100 : null;
    return (
      <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, `mx-venda ${frz ? "mx-frz" : ""}`)}>
        <div className="mx-td-in mx-3f">
          <div className="mx-f1 mx-line">
            {frz ? <span className="mx-tag mx-tag-frz"><Lock size={9} />congelado</span> : <span className="mx-lbl">venda</span>}
            {cc.pub === null ? <span className="mx-empty">{cc.invalido ? "inviável" : "—"}</span> : <Money c={cc.pub} />}
          </div>
          <div className="mx-f2 mx-line mx-cx">
            {cc.pend && cc.venda !== null ? (
              <span className="mx-pend">seria <Money c={cc.venda} />{dif !== null && <b data-up={dif >= 0 ? 1 : 0}>{sinal(dif)}</b>}</span>
            ) : (<><span className="mx-lbl">lucro</span>{f ? <Money c={Math.round(f.lucro)} /> : <span className="mx-empty">—</span>}</>)}
          </div>
          <div className="mx-f3 mx-comp" title={f ? `Custo ${brl(Math.round(f.custoEf))} · encargos ${brl(Math.round(f.imp + f.cartao + f.comissao + f.desp))} · lucro ${brl(Math.round(f.lucro))}` : ""}>
            {f && (<>
              <span className="mx-compbar" aria-hidden="true">
                <i style={{ flexGrow: f.custoEf, background: "#16284a" }} />
                <i style={{ flexGrow: f.imp + f.cartao + f.comissao + f.desp, background: "#c9962f" }} />
                <i style={{ flexGrow: Math.max(f.lucro, 0), background: "#3fa66b" }} />
              </span>
              <span className="mx-comp-t">margem {pctTxt(f.margemReal)}</span>
            </>)}
          </div>
        </div>
      </td>
    );
  }

  const cabecalho = (col: Col, ci: number) => {
    const on = (sel.modo === "col" && c === ci) || (sel.modo === "cell" && c === ci);
    const sortKey: SortKey | null = col.kind === "prod" ? "prod" : col.kind === "best" ? "best" : col.kind === "eco" ? "eco" : col.kind === "venda" ? "venda" : null;
    const lab = col.kind === "lab" ? LABS[col.lab as number] : null;
    const titulo = lab ? lab.nome : { prod: "Produto", via: "Via", best: "Melhor valor", eco: "Economia", ref: "Referência", custo: "Custo efetivo", venda: "Venda", lab: "" }[col.kind];
    const sub = lab ? lab.sub : { prod: `${flat.length} apresentações`, via: "cadastro", best: "menor + laboratório", eco: "menor vs. maior", ref: MODO_TXT[modo], custo: "ref. + frete e perda", venda: base === "unit" ? "publicada · unidade" : "publicada · caixa", lab: "" }[col.kind];
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

      {/* ------------------------------ controles: 3 linhas, rótulo na mesma coluna */}
      <div className="mx-panel mx-ctrl">
        <div className="mx-crow">
          <span className="mx-rowlab">Buscar</span>
          <div className="mx-cl">
            <div className="mx-search">
              <Search size={15} />
              <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar substância ou dose" aria-label="Buscar substância ou dose" />
              {busca ? <button type="button" aria-label="Limpar busca" className="mx-search-x" onClick={() => setBusca("")}><X size={14} /></button> : <kbd>/</kbd>}
            </div>
          </div>
          <div className="mx-cr">
            <button type="button" className="mx-btn" onClick={() => setModal("ped")}><ShoppingCart size={15} />Pedido por laboratório</button>
            <button type="button" className="mx-btn mx-btn-gold" onClick={() => setModal("ref")}><FileSpreadsheet size={15} />Enviar referência às Substâncias</button>
          </div>
        </div>
        <div className="mx-crow">
          <span className="mx-rowlab">Laboratórios</span>
          <div className="mx-cl" role="group" aria-label="Laboratórios">
            <button type="button" className="mx-chip" aria-pressed={labsOn.every(Boolean)} onClick={() => setLabsOn([true, true, true])}>Todos <small>{LABS.length}</small></button>
            <span className="mx-vsep" />
            {LABS.map((l, i) => (
              <button key={l.nome} type="button" className="mx-chip mx-chip-lab" style={{ ["--lc" as string]: l.cor }} aria-pressed={labsOn[i]} onClick={() => alternarLab(i)}>
                <span className="mx-sw" style={{ background: l.cor }} />{l.nome}<small>{nPorLab[i]}</small>
              </button>
            ))}
          </div>
          <div className="mx-cr">
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
          </div>
        </div>
        <div className="mx-crow">
          <span className="mx-rowlab">Via de uso</span>
          <div className="mx-cl" role="group" aria-label="Via de uso">
            <button type="button" className="mx-chip" aria-pressed={catSel === "TODAS"} onClick={() => setCatSel("TODAS")}>Todas <small>{todos.length}</small></button>
            <span className="mx-vsep" />
            {CATS.map((x) => {
              const n = todos.filter((t) => t.row.cat === x.id).length;
              return n ? <button key={x.id} type="button" className="mx-chip" aria-pressed={catSel === x.id} onClick={() => setCatSel(x.id)}>{x.curto} <small>{n}</small></button> : null;
            })}
          </div>
          <div className="mx-cr">
            <div className="mx-group"><label>Incluir</label>
              <div className="mx-well mx-checks">
                <label className="mx-check"><input type="checkbox" checked={soComp} onChange={(e) => setSoComp(e.target.checked)} />Só comparáveis</label>
                <label className="mx-check"><input type="checkbox" checked={incConf} onChange={(e) => setIncConf(e.target.checked)} />A conferir</label>
                <label className="mx-check"><input type="checkbox" checked={incHist} onChange={(e) => setIncHist(e.target.checked)} />2022</label>
              </div>
            </div>
          </div>
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

      {/* ------------------------------ barra de status (como no Excel) */}
      <div className="mx-panel mx-stat" aria-live="polite">
        <div className="mx-statlab"><span>Seleção</span><b>{estat ? estat.rotulo : "—"}</b></div>
        <div><span>Contagem</span><b>{estat ? estat.n : "—"}</b></div>
        <div><span>Mínimo</span><b>{estat ? estat.min : "—"}</b></div>
        <div><span>Média</span><b>{estat ? estat.media : "—"}</b></div>
        <div><span>Máximo</span><b>{estat ? estat.max : "—"}</b></div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}><span>Atalhos</span><b style={{ fontFamily: "Inter", fontSize: 11 }}>Setas navegam · Ctrl+C copia · / busca</b></div>
      </div>

      {/* ------------------------------ precificação */}
      <section className="mx-panel mx-dock" aria-label="Precificação">
        <header className="mx-dock-h">
          <button type="button" className="mx-dock-t" aria-expanded={dockAberto} onClick={() => setDockAberto((v) => !v)}>
            <ChevronDown size={16} className="mx-chev" data-open={dockAberto ? 1 : 0} /><Calculator size={16} />Precificação
          </button>
          <span className="mx-dock-f">Venda = custo efetivo ÷ (1 − impostos − cartão − comissão − despesas − margem)</span>
          <div className="mx-dock-act">
            <div className="mx-well mx-adj" role="group" aria-label="Ajuste geral das margens">
              <span>Ajuste geral</span>
              <button type="button" aria-label="Diminuir todas as margens em 1 ponto" onClick={() => ajusteGeral(-1)}><Minus size={13} /></button>
              <b>1 pt</b>
              <button type="button" aria-label="Aumentar todas as margens em 1 ponto" onClick={() => ajusteGeral(1)}><Plus size={13} /></button>
            </div>
            <div className="mx-well mx-adj" role="group" aria-label="Igualar todas as margens">
              <span>Igualar todas a</span>
              <NumField label="Margem única em porcentagem" value={igual} onChange={setIgual} w={52} /><b>%</b>
              <button type="button" className="mx-adj-go" onClick={igualarTodas}>Igualar</button>
            </div>
            <button type="button" className="mx-switch mx-switch-all" role="switch" aria-checked={todasAuto} onClick={() => definirTodas(!todasAuto)}>
              <i /><span>{todasAuto ? "Todos os preços atualizam sozinhos" : "Atualizar todos os preços"}</span>
            </button>
          </div>
        </header>
        {dockAberto && (
          <div className="mx-dock-b">
            <div className="mx-dz mx-dz-a">
              <h3><b>1</b>Custos e encargos <em>valem para todos os produtos</em></h3>
              <div className="mx-flds">
              <div className="mx-fld"><span>Frete e entrada</span><div className="mx-well mx-fld-in"><NumField label="Frete e entrada em porcentagem" value={preco.frete} onChange={(v) => mudarPreco("frete", v)} w={58} /><b>%</b></div><em>sobre o custo</em></div>
              <div className="mx-fld"><span>Perda (quebra)</span><div className="mx-well mx-fld-in"><NumField label="Perda por quebra ou validade em porcentagem" value={preco.perda} onChange={(v) => mudarPreco("perda", v)} w={58} /><b>%</b></div><em>quebra e validade</em></div>
              <div className="mx-fld"><span>Impostos</span><div className="mx-well mx-fld-in"><NumField label="Impostos em porcentagem" value={preco.imp} onChange={(v) => mudarPreco("imp", v)} w={58} /><b>%</b></div><em>sobre a venda</em></div>
              <div className="mx-fld"><span>Taxa de cartão</span><div className="mx-well mx-fld-in"><NumField label="Taxa de cartão em porcentagem" value={preco.cartao} onChange={(v) => mudarPreco("cartao", v)} w={58} /><b>%</b></div><em>média, sobre a venda</em></div>
              <div className="mx-fld"><span>Comissão</span><div className="mx-well mx-fld-in"><NumField label="Comissão em porcentagem" value={preco.comissao} onChange={(v) => mudarPreco("comissao", v)} w={58} /><b>%</b></div><em>sobre a venda</em></div>
              <div className="mx-fld"><span>Despesas rateadas</span><div className="mx-well mx-fld-in"><NumField label="Despesas fixas rateadas em porcentagem" value={preco.desp} onChange={(v) => mudarPreco("desp", v)} w={58} /><b>%</b></div><em>sobre a venda</em></div>
                <div className="mx-fld"><span>Arredondar preço</span>
                  <div className="mx-well mx-seg mx-seg-s" role="group" aria-label="Arredondamento do preço">
                    {([["nenhum", "Não"], ["inteiro", ",00"], ["90", ",90"]] as [Arred, string][]).map(([k, t]) => <button key={k} type="button" aria-pressed={preco.arred === k} onClick={() => mudarPreco("arred", k)}>{t}</button>)}
                  </div>
                  <em>sempre para cima</em>
                </div>
                <div className="mx-fld mx-fld-sum"><span>Encargos sobre a venda</span><div className="mx-sumv"><b className="mx-serif">{pctTxt(encargos)}</b></div><em>impostos + cartão + comissão + despesas</em></div>
              </div>
              <p className="mx-note mx-ex">Percentuais de exemplo. Confirmar alíquotas com o contador antes de gravar.</p>
            </div>

            <div className="mx-dz mx-dz-b">
              <h3><b>2</b>Margem de lucro por categoria <em>um valor muda a categoria inteira; o interruptor decide se o preço acompanha</em></h3>
              <div className="mx-cats" style={{ ["--n" as string]: catsAtivas.length }}>
                {catsAtivas.map((x) => {
                  const st = statCat[x.id];
                  const auto = cong[x.id] === null;
                  return (
                    <div key={x.id} className="mx-cat" data-auto={auto ? 1 : 0} data-bad={st.ruim ? 1 : 0}>
                      <div className="mx-cat-h"><b>{x.curto}</b><em>{st.n} produtos</em></div>
                      <div className="mx-well mx-mgin2">
                        <button type="button" aria-label={`Diminuir margem de ${x.curto}`} onClick={() => ajustar(x.id, -1)}><Minus size={13} /></button>
                        <NumField label={`Margem de ${x.curto} em porcentagem`} value={mg[x.id]} onChange={(v) => setMg((m) => ({ ...m, [x.id]: v }))} w={52} /><b>%</b>
                        <button type="button" aria-label={`Aumentar margem de ${x.curto}`} onClick={() => ajustar(x.id, 1)}><Plus size={13} /></button>
                      </div>
                      <input type="range" className="mx-range" min={0} max={70} step={0.5} value={Math.min(mg[x.id], 70)} aria-label={`Ajustar margem de ${x.curto}`}
                        onChange={(e) => setMg((m) => ({ ...m, [x.id]: Number(e.target.value) }))} />
                      <div className="mx-cat-m"><span>Preço médio</span>{st.avg === null ? <span className="mx-empty">—</span> : <Money c={st.avg} />}</div>
                      <button type="button" className="mx-switch" role="switch" aria-checked={auto} onClick={() => definirAuto(x.id, !auto)}>
                        <i /><span>{auto ? "Atualiza sozinho" : "Congelado"}</span>
                      </button>
                      <div className="mx-cat-s" data-k={st.ruim ? "bad" : st.pend ? "pend" : "ok"}>
                        {st.ruim ? <>Inviável: soma passa de 95%</>
                          : st.pend ? (<><span>{st.pend} preços mudariam{st.diff !== null ? ` (${sinal(st.diff)})` : ""}</span><button type="button" onClick={() => aplicarAgora(x.id)}><RefreshCw size={11} />Aplicar agora</button></>)
                          : auto ? <>Preços em dia com o custo</> : <>Congelado, sem diferença</>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mx-dz mx-dz-c">
              <h3><b>3</b>Como se forma o preço <em>{atual ? `${atual.row.nome} ${atual.row.dose}` : "selecione uma linha"}</em></h3>
              {atual?.forma ? (() => {
                const f = atual.forma;
                const itens: [string, number, string][] = [
                  ["Custo do produto", f.ref, "#16284a"], ["Frete e perda", f.entrada, "#5f719b"], ["Impostos", f.imp, "#a86a0c"],
                  ["Cartão", f.cartao, "#d3a14a"], ["Comissão", f.comissao, "#c9b27a"], ["Despesas rateadas", f.desp, "#9aa4b8"], ["Lucro líquido", f.lucro, "#3fa66b"],
                ];
                return (<>
                  <div className="mx-stack" role="img" aria-label="Composição do preço de venda">
                    {itens.map(([n, v, c]) => <i key={n} style={{ flexGrow: Math.max(v, 0), background: c }} title={n} />)}
                  </div>
                  <ul className="mx-legend">
                    {itens.map(([n, v, c]) => (
                      <li key={n}><span className="mx-sw" style={{ background: c }} /><span>{n}</span><Money c={Math.round(v)} /><em>{pctTxt((v / f.venda) * 100)}</em></li>
                    ))}
                    <li className="mx-legend-t"><span /><span>Preço de venda</span><Money c={Math.round(f.venda)} /><em>100%</em></li>
                  </ul>
                </>);
              })() : <p className="mx-note">{atual?.invalido ? "A soma de encargos e margem passa de 95%." : "Esta linha ainda não tem preço de custo."}</p>}
            </div>
          </div>
        )}
      </section>

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
                        <th style={{ padding: "8px 10px" }}>Produto</th><th style={{ textAlign: "right" }}>Referência</th><th style={{ textAlign: "right" }}>Custo efetivo</th><th style={{ textAlign: "right", paddingRight: 10 }}>Venda publicada</th></tr></thead>
                      <tbody>
                        {filtrados.filter((x) => x.ref !== null).slice(0, 7).map((x) => (
                          <tr key={x.row.id} style={{ borderTop: "1px solid var(--line)" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 600, textTransform: "uppercase" }}>{x.row.nome} <span style={{ color: "var(--muted)", fontWeight: 500 }}>{x.row.dose}</span></td>
                            <td style={{ textAlign: "right" }}><Money c={x.ref as number} /></td>
                            <td style={{ textAlign: "right" }}>{x.forma ? <Money c={Math.round(x.forma.custoEf)} /> : "—"}</td>
                            <td style={{ textAlign: "right", paddingRight: 10 }}>{x.pub === null ? "—" : <Money c={x.pub} />}</td>
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

export default MatrizFornecedoresV2;
