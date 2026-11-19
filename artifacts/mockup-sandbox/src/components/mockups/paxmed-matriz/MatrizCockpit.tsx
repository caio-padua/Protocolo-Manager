import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, Copy, FileSpreadsheet, History, Minus, Pencil, Plus, Search, ShoppingCart, SlidersHorizontal, Tags, Trophy, Upload, X, Zap,
} from "lucide-react";
import "./matriz-cockpit.css";
import { DADOS_V3, FAMILIAS_V3 } from "./dados-v3";

/* ------------------------------------------------------------------ tipos */
type Status = "ok" | "conf" | "div";
type Tipo = "ampola" | "frasco" | "implante";
type Cat = "IM" | "SC" | "OT" | "IMP" | "C5" | "SV";
type Offer = { catId: number; lab: number; unit: number; caixa: number; qtd: number; tipo: Tipo; linha: number; st: Status; obs: string };
type Row = { id: number; nome: string; dose: string; concs: string[]; cad: boolean; via: string; cat: Cat; fam: number; offers: Offer[] };

/* Classificação própria dos laboratórios e das versões dos catálogos.
   Cada laboratório tem uma linha do tempo: a última versão é a vigente, as anteriores ficam no histórico. */
type Versao = { cat: number; data: string; arquivo: string; conf?: boolean };
type Lab = { nome: string; full: string; cor: string; perfil: string; vers: Versao[] };
const LABS: Lab[] = [
  { nome: "Farmatec", full: "Farmatec Laboratório de Injetáveis", cor: "#2d73b5", perfil: "Manipulação injetável de linha completa",
    vers: [{ cat: 0, data: "29/09/2025", arquivo: "FARMATEC_ORTO_ESTETICA_atualizado_29-09-25.pdf" }] },
  { nome: "Formédica", full: "Formédica", cor: "#c4572f", perfil: "Implantes, controlados C5 e HCG",
    vers: [{ cat: 2, data: "05/2022", arquivo: "Tabela de implantes 2022" }, { cat: 3, data: "09/2026", arquivo: "Tabela_de_Preços_Comercial_Formédica_SETEMBRO-2026.pdf" }] },
  { nome: "Bio meds Brasil", full: "Bio meds Brasil", cor: "#8a4fb0", perfil: "Nicho: ADEK, GHK-Cu, tirzepatida, hormônios",
    vers: [{ cat: 1, data: "sem data", arquivo: "Tabela Bio meds Brasil", conf: true }] },
  { nome: "Indose", full: "Indose Portfólio", cor: "#1f8a78", perfil: "Portfólio pronto, preço por caixa",
    vers: [{ cat: 4, data: "07/2025", arquivo: "Indose_tabela_2.pdf" }, { cat: 5, data: "08/2025", arquivo: "Indose_tabela_1.pdf" }] },
];
const CAT2LAB = [0, 2, 1, 1, 3, 3];
const ULTIMAS = LABS.map((l) => l.vers.length - 1);
const ANTERIORES = LABS.map((l) => Math.max(0, l.vers.length - 2));

const CATS: { id: Cat; nome: string; curto: string }[] = [
  { id: "IM", nome: "Injetáveis IM", curto: "IM" },
  { id: "SC", nome: "Injetáveis SC", curto: "SC" },
  { id: "OT", nome: "EV, ID e outras vias", curto: "EV / outras" },
  { id: "IMP", nome: "Implantes", curto: "Implantes" },
  { id: "C5", nome: "Controlados (lista C5)", curto: "C5" },
  { id: "SV", nome: "Sem via informada", curto: "Sem via" },
];
const NOVA_COR = ["#b0563a", "#2f8f8f", "#8f6bb0", "#7a9a3a", "#c27a2c", "#4f6fb0"];
const FAM_COR = ["#d98b2b", "#3f8f6b", "#5f7fb8", "#8a4fb0", "#c4572f", "#c2557f", "#3b9bb0", "#a8832f", "#7a8aa8", "#9aa4b8"];

const TIPOS: Tipo[] = ["ampola", "frasco", "implante"];
const ROWS: Row[] = DADOS_V3.map((d, i) => {
  const [nome, dose, cat, via, cad, concs, fam, of] = d;
  const offers: Offer[] = of.map((o) => ({
    catId: o[0], lab: CAT2LAB[o[0]], unit: o[1], caixa: o[2], qtd: o[3], tipo: TIPOS[o[4]], linha: o[6], st: o[7], obs: o[8],
  }));
  return { id: i + 1, nome, dose, concs, cad: cad === 1, via, cat: cat as Cat, fam, offers };
});

const doseCurta = (d: string): string => {
  if (d.length <= 24) return d;
  const n = d.split(/\s*(?:\+|\/)\s*/).length;
  return `composto · ${n} ativos`;
};
const unidadeTxt = (o: Offer) => (o.tipo === "implante" ? "implante" : o.tipo === "frasco" ? (o.qtd > 1 ? "frascos" : "frasco") : o.qtd > 1 ? "ampolas" : "ampola");

/* ------------------------------------------------------------ formatação */
const brl = (c: number) => `R$ ${Math.floor(c / 100).toLocaleString("pt-BR")},${String(Math.round(c) % 100).padStart(2, "0")}`;
const pct1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctTxt = (x: number) => `${pct1.format(x)}%`;
const sinal = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${pct1.format(Math.abs(x))}%`;

function Money({ c }: { c: number }) {
  return (
    <span className="kp-money">
      <i>R$</i>
      {Math.floor(c / 100).toLocaleString("pt-BR")}
      <u>,{String(Math.round(c) % 100).padStart(2, "0")}</u>
    </span>
  );
}

/* --------------------------------------------------------------- cálculo */
type Modo = "maior" | "media" | "menor";
type Base = "unit" | "caixa";
type Cfg = { base: Base; modo: Modo; incConf: boolean; labsOn: boolean[]; mg: Record<Cat, number>; ver: number[] };
type Calc = {
  row: Row; act: (Offer | null)[]; prev: (Offer | null)[]; incl: Offer[]; min: number | null; max: number | null;
  ref: number | null; venda: number | null; winners: Offer[]; eco: number | null; margem: number;
};
const val = (o: Offer, base: Base) => (base === "unit" ? o.unit : o.caixa);

function calcular(row: Row, cfg: Cfg): Calc {
  const act = LABS.map((l, i) => row.offers.find((o) => o.catId === l.vers[cfg.ver[i]].cat) ?? null);
  const prev = LABS.map((l, i) => (cfg.ver[i] > 0 ? row.offers.find((o) => o.catId === l.vers[cfg.ver[i] - 1].cat) ?? null : null));
  const incl = act.filter((o): o is Offer => !!o && cfg.labsOn[o.lab] && o.st !== "div" && (o.st === "ok" || cfg.incConf));
  const vs = incl.map((o) => val(o, cfg.base));
  const min = vs.length ? Math.min(...vs) : null;
  const max = vs.length ? Math.max(...vs) : null;
  const ref = !vs.length ? null : cfg.modo === "maior" ? max : cfg.modo === "menor" ? min : Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
  const margem = cfg.mg[row.cat];
  return {
    row, act, prev, incl, min, max, ref, margem,
    venda: ref === null ? null : Math.round(ref / (1 - margem / 100)),
    winners: min === null ? [] : incl.filter((o) => val(o, cfg.base) === min),
    eco: incl.length >= 2 && max ? (max - (min as number)) / max : null,
  };
}

/* variação de uma versão contra a anterior (independe dos filtros da tela) */
function diffVersao(lab: number, k: number) {
  if (k === 0) return null;
  const a = LABS[lab].vers[k].cat, b = LABS[lab].vers[k - 1].cat;
  let novos = 0, sairam = 0, subiu = 0, caiu = 0, igual = 0, soma = 0;
  for (const r of ROWS) {
    const x = r.offers.find((o) => o.catId === a), y = r.offers.find((o) => o.catId === b);
    if (x && !y) novos++;
    else if (!x && y) sairam++;
    else if (x && y) {
      if (x.unit > y.unit) subiu++; else if (x.unit < y.unit) caiu++; else igual++;
      soma += (x.unit - y.unit) / y.unit;
    }
  }
  const n = subiu + caiu + igual;
  return { novos, sairam, subiu, caiu, igual, media: n ? (soma / n) * 100 : 0 };
}
const itensDaVersao = (lab: number, k: number) => ROWS.filter((r) => r.offers.some((o) => o.catId === LABS[lab].vers[k].cat)).length;
/** "novo" só faz sentido quando a versão anterior cobria o catálogo de forma comparável (mínimo 50% da atual). */
const PREV_COMPARAVEL = LABS.map((l, i) => l.vers.map((_, k) => k > 0 && itensDaVersao(i, k - 1) >= itensDaVersao(i, k) * 0.5));

/* --------------------------------------------------------------- colunas */
type ColKind = "prod" | "cls" | "lab" | "best" | "eco" | "ref" | "mg" | "venda";
type Col = { kind: ColKind; lab?: number; w: number; letter: string };
type SortKey = "prod" | "best" | "eco" | "venda";
type Aba = "matriz" | "dono" | "labs";
const MODO_TXT: Record<Modo, string> = { maior: "Maior valor", media: "Média", menor: "Menor valor" };

function numeroDaCelula(c: Calc, col: Col, base: Base): { v: number; tipo: "money" | "pct" } | null {
  if (col.kind === "lab") { const o = c.act[col.lab as number]; return o ? { v: val(o, base), tipo: "money" } : null; }
  if (col.kind === "best") return c.min === null ? null : { v: c.min, tipo: "money" };
  if (col.kind === "eco") return c.eco === null ? null : { v: c.eco * 100, tipo: "pct" };
  if (col.kind === "ref") return c.ref === null ? null : { v: c.ref, tipo: "money" };
  if (col.kind === "mg") return { v: c.margem, tipo: "pct" };
  if (col.kind === "venda") return c.venda === null ? null : { v: c.venda, tipo: "money" };
  return null;
}
const fmtNum = (n: { v: number; tipo: "money" | "pct" }) => (n.tipo === "money" ? brl(Math.round(n.v)) : pctTxt(n.v));

function Delta({ cur, prev, base, comparavel }: { cur: Offer; prev: Offer | null; base: Base; comparavel: boolean }) {
  if (!prev) return comparavel ? <span className="kp-delta" data-d="new" title="Não estava na versão anterior">novo</span> : <span className="kp-other">sem versão anterior</span>;
  const a = val(cur, base), b = val(prev, base);
  const p = ((a - b) / b) * 100;
  if (Math.abs(p) < 0.05) return <span className="kp-delta" data-d="eq" title="Mesmo preço da versão anterior">igual</span>;
  return <span className="kp-delta" data-d={p > 0 ? "up" : "down"} title={`Versão anterior: ${brl(b)}`}>{p > 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}{sinal(p)}</span>;
}

/* ------------------------------------------------------------------ tela */
export function MatrizCockpit() {
  const [aba, setAba] = useState<Aba>(() => { const a = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("aba") : null; return a === "dono" || a === "labs" ? a : "matriz"; });
  const [busca, setBusca] = useState("");
  const [catSel, setCatSel] = useState<Cat | "TODAS">("TODAS");
  const [famSel, setFamSel] = useState<number | "TODAS">("TODAS");
  const [soComp, setSoComp] = useState(false);
  const [base, setBase] = useState<Base>("unit");
  const [modo, setModo] = useState<Modo>("maior");
  const [incConf, setIncConf] = useState(true);
  const [mostrarVar, setMostrarVar] = useState(true);
  const [labsOn, setLabsOn] = useState(LABS.map(() => true));
  const [ver, setVer] = useState<number[]>(ULTIMAS);
  const [mg, setMg] = useState<Record<Cat, number>>({ IM: 38, SC: 42, OT: 30, IMP: 35, C5: 28, SV: 30 });
  const [fechados, setFechados] = useState<Cat[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>({ key: "eco", dir: -1 });
  const [sel, setSel] = useState<{ r: number; c: number; modo: "cell" | "col" | "row" }>({ r: 0, c: 0, modo: "cell" });
  const [modal, setModal] = useState<null | "ref" | "ped" | "imp" | "cad" | "cats">(null);
  const [tools, setTools] = useState(true);
  const [secFechadas, setSecFechadas] = useState<string[]>([]);
  const [lado, setLado] = useState(true);
  const [fams, setFams] = useState(() => FAMILIAS_V3.map((nome, i) => ({ nome, cor: FAM_COR[i] ?? "#7a8aa8" })));
  const [famOver, setFamOver] = useState<Record<number, number>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [pickFam, setPickFam] = useState(0);
  const [novoNome, setNovoNome] = useState("");
  const [novaCor, setNovaCor] = useState(0);
  const [buscaFoco, setBuscaFoco] = useState(false);
  const [impLab, setImpLab] = useState(0);
  const [impData, setImpData] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const toastT = useRef<number | undefined>(undefined);

  const cfg: Cfg = useMemo(() => ({ base, modo, incConf, labsOn, mg, ver }), [base, modo, incConf, labsOn, mg, ver]);
  const rows = useMemo(() => ROWS.map((r) => (famOver[r.id] === undefined ? r : { ...r, fam: famOver[r.id] })), [famOver]);
  const todos = useMemo(() => rows.map((r) => calcular(r, cfg)).filter((c) => c.act.some(Boolean)), [rows, cfg]);
  const foraDaVersao = ROWS.length - todos.length;
  const todasUltimas = ver.every((v, i) => v === ULTIMAS[i]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return todos.filter((c) =>
      (catSel === "TODAS" || c.row.cat === catSel) &&
      (famSel === "TODAS" || c.row.fam === famSel) &&
      (!soComp || c.incl.length >= 2) &&
      (!t || `${c.row.nome} ${c.row.dose}`.toLowerCase().includes(t)));
  }, [todos, busca, catSel, famSel, soComp]);

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
    const b: Omit<Col, "letter">[] = [
      { kind: "prod", w: 272 }, { kind: "cls", w: 156 },
      ...LABS.map((_, i) => i).filter((i) => labsOn[i]).map((i) => ({ kind: "lab" as const, lab: i, w: 196 })),
      { kind: "best", w: 172 }, { kind: "eco", w: 136 }, { kind: "ref", w: 128 }, { kind: "mg", w: 92 }, { kind: "venda", w: 152 },
    ];
    return b.map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) }));
  }, [labsOn]);

  const r = Math.min(Math.max(sel.r, 0), Math.max(flat.length - 1, 0));
  const c = Math.min(sel.c, cols.length - 1);
  const atual = flat[r];
  const colAtual = cols[c];

  const avisar = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "SELECT") { e.preventDefault(); setAba("matriz"); window.setTimeout(() => buscaRef.current?.focus(), 30); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const primeiroScroll = useRef(true);
  useEffect(() => {
    if (aba !== "matriz") return;
    if (primeiroScroll.current) { primeiroScroll.current = false; return; }
    const el = wrapRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [r, c, flat.length, aba]);

  const textoCelula = (cc: Calc, col: Col): string => {
    if (col.kind === "prod") return `${cc.row.nome} ${cc.row.dose}`;
    if (col.kind === "cls") return `${cc.row.via || "sem via"} · ${CATS.find((x) => x.id === cc.row.cat)?.nome} · ${fams[cc.row.fam].nome}`;
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

  /* ---- ações de versão ---- */
  const escolherVersao = (lab: number, k: number) => setVer((v) => v.map((x, i) => (i === lab ? k : x)));
  const ativarUltimas = () => {
    if (todasUltimas) { avisar("Todos os laboratórios já estão na última versão."); return; }
    const mudou = LABS.filter((_, i) => ver[i] !== ULTIMAS[i]).map((l) => l.nome);
    setVer(ULTIMAS);
    avisar(`Última versão ativada: ${mudou.join(", ")}`);
  };
  const usarAnteriores = () => {
    setVer(ANTERIORES);
    avisar("Fechamento anterior: cada laboratório voltou à versão anterior (quando existe).");
  };
  const alternarLab = (i: number) => {
    if (labsOn[i] && labsOn.filter(Boolean).length === 1) { avisar("Mantenha ao menos um laboratório ligado."); return; }
    setLabsOn((l) => l.map((v, k) => (k === i ? !v : v)));
  };
  const ciclarSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const ajustar = (cat: Cat, d: number) => setMg((m) => ({ ...m, [cat]: Math.min(95, Math.max(0, m[cat] + d)) }));
  const irParaMatriz = (f: { busca?: string; fam?: number | "TODAS"; cat?: Cat | "TODAS" }) => {
    setBusca(f.busca ?? ""); setFamSel(f.fam ?? "TODAS"); setCatSel(f.cat ?? "TODAS"); setSoComp(false); setAba("matriz");
  };

  /* ---- categorias clínicas (cadastro de substâncias) ---- */
  const abrirCad = (id: number) => {
    const rw = ROWS.find((x) => x.id === id);
    if (!rw) return;
    setEditId(id); setPickFam(famOver[id] ?? rw.fam); setNovoNome(""); setModal("cad");
  };
  const criarCat = (): number | null => {
    const nome = novoNome.trim();
    if (!nome) { avisar("Digite o nome da categoria."); return null; }
    const ja = fams.findIndex((f) => f.nome.toLowerCase() === nome.toLowerCase());
    if (ja >= 0) { avisar("Essa categoria já existe."); return ja; }
    setFams((f) => [...f, { nome, cor: NOVA_COR[novaCor % NOVA_COR.length] }]);
    setNovoNome(""); setNovaCor((n) => n + 1);
    avisar(`Categoria "${nome}" criada.`);
    return fams.length;
  };
  const salvarCad = () => {
    const rw = ROWS.find((x) => x.id === editId);
    if (!rw) return;
    const irmaos = ROWS.filter((x) => x.nome.toLowerCase() === rw.nome.toLowerCase());
    setFamOver((o) => { const n = { ...o }; irmaos.forEach((x) => { n[x.id] = pickFam; }); return n; });
    setModal(null);
    avisar(`${rw.nome}: categoria "${fams[pickFam]?.nome}" em ${irmaos.length} apresentação(ões). Prévia: grava no cadastro de Substâncias na etapa seguinte.`);
  };
  const sugestoes = useMemo(() => {
    const sa = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const t = sa(busca.trim());
    if (!t) return [] as Calc[];
    const vistos = new Set<string>();
    return todos.filter((x) => sa(`${x.row.nome} ${x.row.dose}`).includes(t) && !vistos.has(`${x.row.nome}|${x.row.dose}`) && !!vistos.add(`${x.row.nome}|${x.row.dose}`)).slice(0, 7);
  }, [todos, busca]);

  /* ---- indicadores ---- */
  const comparaveis = filtrados.filter((x) => x.incl.length >= 2);
  const ecoMedia = comparaveis.length ? (comparaveis.reduce((a, x) => a + (x.eco as number), 0) / comparaveis.length) * 100 : null;
  const aConferir = filtrados.reduce((a, x) => a + x.act.filter((o) => o && o.st !== "ok").length, 0);
  const placar = LABS.map((_, i) => filtrados.filter((x) => x.incl.length >= 2 && x.winners[0]?.lab === i).length);

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
    const f = (v: number) => fmtNum({ v, tipo: nums[0].tipo });
    return { rotulo, n: vs.length, min: f(Math.min(...vs)), max: f(Math.max(...vs)), media: f(vs.reduce((a, b) => a + b, 0) / vs.length) };
  }, [sel.modo, atual, cols, colAtual, flat, base, r]);

  const descricao = (): ReactNode => {
    if (!atual || !colAtual) return <span style={{ color: "var(--muted)" }}>Nenhuma célula selecionada.</span>;
    const cc = atual, row = cc.row;
    if (colAtual.kind === "prod")
      return <>{row.nome} · dose {row.dose} · concentração {row.concs.length ? row.concs.join(" ou ") : "não informada"}{row.cad ? "" : " · fora do cadastro de Substâncias (a incluir)"} · mesma dose = mesmo produto</>;
    if (colAtual.kind === "cls")
      return <>Via: {row.via || "não informada"} · categoria de margem: <b>{CATS.find((x) => x.id === row.cat)?.nome}</b> · família clínica: <b>{fams[row.fam].nome}</b></>;
    if (colAtual.kind === "lab") {
      const i = colAtual.lab as number, lab = LABS[i], o = cc.act[i], v = lab.vers[ver[i]];
      if (!o) {
        const outra = row.offers.find((x) => x.lab === i);
        const vo = outra ? lab.vers.find((x) => x.cat === outra.catId) : null;
        return <>{lab.nome} · versão {v.data} sem preço para esta dose{vo ? ` · existe na versão ${vo.data}: ${brl(outra!.unit)} por unidade` : ""}</>;
      }
      const st = o.st === "ok" ? "Confirmado" : "A conferir: entra na comparação só com a chave ligada";
      return <>{lab.nome} · versão {v.data} · {o.linha ? `linha ${o.linha} · ` : ""}caixa com {o.qtd} {unidadeTxt(o)} <b>{brl(o.caixa)}</b> · <b>{brl(o.unit)}</b> por unidade · {st}{o.obs ? ` · ${o.obs}` : ""}</>;
    }
    if (colAtual.kind === "best")
      return cc.min === null ? <>Sem preço comparável.</> : <>Menor preço: <b>{brl(cc.min)}</b> · {cc.winners.map((w) => LABS[w.lab].nome).join(" e ")}{cc.max !== null && cc.max !== cc.min ? ` · maior: ${brl(cc.max)}` : " · única oferta, sem comparação"}</>;
    if (colAtual.kind === "eco") return cc.eco === null ? <>É preciso ao menos 2 ofertas para comparar.</> : <>Economia de <b>{pctTxt(cc.eco * 100)}</b> do menor sobre o maior preço.</>;
    if (colAtual.kind === "ref") return cc.ref === null ? <>Sem referência.</> : <>Referência ({MODO_TXT[modo].toLowerCase()}): <b>{brl(cc.ref)}</b>. Alimenta Substâncias e Orçamento na etapa 4.</>;
    if (colAtual.kind === "mg") return <>Margem de lucro da categoria <b>{pctTxt(cc.margem)}</b>. Edite no quadro abaixo.</>;
    return cc.venda === null ? <>Sem preço.</> : <>{brl(cc.ref as number)} ÷ (1 − {pct1.format(cc.margem)}%) = <b>{brl(cc.venda)}</b></>;
  };

  /* ---- pedidos ---- */
  const pedidos = useMemo(() => LABS.map((lab, i) => {
    const itens = filtrados.filter((x) => x.incl.length >= 2 ? x.winners[0]?.lab === i : x.incl[0]?.lab === i)
      .map((x) => { const w = x.incl.length >= 2 ? x.winners[0] : x.incl[0]; return { nome: `${x.row.nome} ${x.row.dose}`, caixa: w.caixa, qtd: w.qtd }; });
    return { lab, i, itens, total: itens.reduce((a, b) => a + b.caixa, 0) };
  }), [filtrados]);
  const copiarPedido = (i: number) => {
    const p = pedidos[i];
    const t = `Rascunho de pedido, ${p.lab.nome} (versão ${p.lab.vers[ver[i]].data})\n${p.itens.map((x) => `1 cx c/ ${x.qtd} un.  ${x.nome}  ${brl(x.caixa)}`).join("\n")}\nTotal: ${brl(p.total)}`;
    try { void navigator.clipboard?.writeText(t); } catch { /* idem */ }
    avisar(`Lista de ${p.lab.nome} copiada (${p.itens.length} itens)`);
  };

  /* ---- visão do dono ---- */
  const dono = useMemo(() => {
    const comp = todos.filter((x) => x.incl.length >= 2);
    const gastoMax = comp.reduce((a, x) => a + (x.max as number), 0);
    const gastoMin = comp.reduce((a, x) => a + (x.min as number), 0);
    const unica = todos.filter((x) => x.incl.length === 1);
    const unicaPorLab = LABS.map((_, i) => unica.filter((x) => x.incl[0].lab === i).length);
    const porFam = fams.map(({ nome }, f) => {
      const rs = todos.filter((x) => x.row.fam === f);
      const cp = rs.filter((x) => x.incl.length >= 2);
      return {
        f, nome, n: rs.length, comp: cp.length,
        eco: cp.length ? (cp.reduce((a, x) => a + (x.eco as number), 0) / cp.length) * 100 : null,
        wins: LABS.map((_, i) => cp.filter((x) => x.winners[0]?.lab === i).length),
      };
    }).filter((x) => x.n > 0);
    const maiores = comp.filter((x) => x.incl.every((o) => o.st === "ok")).sort((a, b) => ((b.max as number) - (b.min as number)) - ((a.max as number) - (a.min as number))).slice(0, 6);
    const movers = todos.flatMap((x) => x.act.map((o, i) => (o && x.prev[i] ? { x, i, o, p: x.prev[i] as Offer, pct: ((val(o, base) - val(x.prev[i] as Offer, base)) / val(x.prev[i] as Offer, base)) * 100 } : null)))
      .filter((m): m is NonNullable<typeof m> => !!m && Math.abs(m.pct) >= 0.05)
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return { comp, gastoMax, gastoMin, unica, unicaPorLab, porFam, maiores, movers };
  }, [todos, base, fams]);

  const labInd = useMemo(() => LABS.map((lab, i) => {
    const ativos = todos.filter((x) => x.act[i]);
    const emDisputa = todos.filter((x) => x.incl.length >= 2 && x.incl.some((o) => o.lab === i));
    const indice = emDisputa.length ? (emDisputa.reduce((a, x) => a + (val(x.incl.find((o) => o.lab === i) as Offer, base) / (x.min as number)), 0) / emDisputa.length) * 100 : null;
    const cats = CATS.map((k) => ({ k, n: ativos.filter((x) => x.row.cat === k.id).length })).filter((x) => x.n);
    const famTop = fams.map(({ nome }, f) => ({ nome, f, n: ativos.filter((x) => x.row.fam === f).length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 5);
    const papel = ativos.length >= 120 ? "Principal" : ativos.length >= 40 ? "Complementar" : "Nicho";
    return { i, lab, n: ativos.length, vitorias: emDisputa.filter((x) => x.winners[0]?.lab === i).length, disputa: emDisputa.length, indice, cats, fams: famTop, papel, unica: dono.unicaPorLab[i] };
  }), [todos, base, dono.unicaPorLab, fams]);

  /* ---- render de célula ---- */
  const tdProps = (ri: number, ci: number) => ({
    "data-r": ri, "data-c": ci,
    onClick: () => { setSel({ r: ri, c: ci, modo: "cell" }); wrapRef.current?.focus(); },
  });
  const cls = (ri: number, ci: number, extra = "") =>
    `kp-td ${extra} ${sel.modo === "cell" && r === ri && c === ci ? "kp-sel" : ""} ${(sel.modo === "col" && c === ci) || (sel.modo === "row" && r === ri) ? "kp-colsel" : ""}`;

  function celula(cc: Calc, col: Col, ri: number, ci: number) {
    const row = cc.row;
    if (col.kind === "prod")
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "kp-td-fix")}>
          <div className="kp-td-in kp-pc" title={`${row.nome} · ${row.dose}`}>
            <div className="kp-pc-n">
              <span className="kp-prod-n kp-prod">{row.nome}</span>
              {!row.cad && <span className="kp-tag kp-tag-new" title="Ainda não existe no cadastro de Substâncias">novo</span>}
              <button type="button" className="kp-pen" aria-label={`Editar categoria de ${row.nome}`} title="Editar categoria no cadastro" onClick={(e) => { e.stopPropagation(); abrirCad(row.id); }}><Pencil size={11} /></button>
            </div>
            <div className="kp-pc-r" title={row.dose}><i>Dose</i><span>{doseCurta(row.dose)}</span></div>
            <div className="kp-pc-r" title={row.concs.join("  |  ")}>
              <i>Conc.</i><span>{row.concs[0] || "não informada"}</span>
              {row.concs.length > 1 && <em className="kp-more">+{row.concs.length - 1}</em>}
            </div>
          </div>
        </td>
      );
    if (col.kind === "cls")
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="kp-td-in kp-pc">
            <div className="kp-pc-r"><i>Via</i><span title={row.via}>{row.via || "sem via"}</span></div>
            <div className="kp-pc-r"><i>Cat.</i><span>{CATS.find((x) => x.id === row.cat)?.curto}</span></div>
            <div className="kp-pc-r"><i>Fam.</i>
              <button type="button" className="kp-fchip kp-fchip-s" title={`${fams[row.fam].nome}: clique para mudar`} onClick={(e) => { e.stopPropagation(); abrirCad(row.id); }}>
                <span className="kp-fdot" style={{ ["--fc" as string]: fams[row.fam].cor }} />{fams[row.fam].nome}
              </button>
            </div>
          </div>
        </td>
      );
    if (col.kind === "lab") {
      const i = col.lab as number, lab = LABS[i], o = cc.act[i];
      if (!o) {
        const outra = row.offers.find((x) => x.lab === i);
        const vo = outra ? lab.vers.find((x) => x.cat === outra.catId) : null;
        return (
          <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "kp-hatch")}>
            <div className="kp-td-in kp-r">
              <span className="kp-empty" title="sem preço nesta versão">—</span>
              {vo && <span className="kp-other">só em {vo.data}</span>}
            </div>
          </td>
        );
      }
      const ganha = cc.incl.length > 1 && cc.winners.includes(o);
      const excl = !cc.incl.includes(o);
      const temVar = mostrarVar && ver[i] > 0 && (!!cc.prev[i] || PREV_COMPARAVEL[i][ver[i]]);
      const fixos = [1, 5, 10];
      const quarto = fixos.includes(o.qtd) ? null : o.qtd;
      return (
        <td key={ci} {...tdProps(ri, ci)} style={{ ["--wc" as string]: lab.cor }}
          className={cls(ri, ci, `${ganha ? "kp-win" : ""} ${o.st === "conf" ? "kp-conf-cell" : ""} ${excl ? "kp-excl" : ""}`)}>
          <div className="kp-td-in kp-labc" title={`Apresentação: ${o.qtd} ${unidadeTxt(o)} por caixa`}>
            <div className="kp-lab-1" data-base={base === "unit" ? 1 : 0}>
              <span className="kp-lab-k">Unid.</span>
              {o.st === "conf" ? <span className="kp-tag kp-tag-conf" title="A conferir">conf.</span> : <span />}
              <Money c={o.unit} />
            </div>
            <div className="kp-lab-2" data-base={base === "caixa" ? 1 : 0}>
              <span className="kp-lab-k">Cx.</span>
              {temVar ? <Delta cur={o} prev={cc.prev[i]} base={base} comparavel={PREV_COMPARAVEL[i][ver[i]]} /> : <span />}
              <Money c={o.caixa} />
            </div>
            <div className="kp-lab-3" role="group" aria-label={`Caixa com ${o.qtd} ${unidadeTxt(o)}`}>
              {fixos.map((n) => <span key={n} className="kp-apr" data-on={n === o.qtd ? 1 : 0}>{n} Unid</span>)}
              <span className="kp-apr" data-on={quarto !== null ? 1 : 0}>{quarto ?? "X"} Unid</span>
            </div>
            {ganha && <span className="kp-lapela" role="img" aria-label="Menor preço" title="Menor preço"><Trophy size={10} fill="currentColor" /></span>}
          </div>
        </td>
      );
    }
    if (col.kind === "best") {
      if (cc.min === null)
        return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "kp-hatch")}><div className="kp-td-in kp-r"><span className="kp-empty">sem preço</span></div></td>;
      const w = cc.winners[0];
      return (
        <td key={ci} {...tdProps(ri, ci)} style={{ ["--bc" as string]: LABS[w.lab].cor }} className={cls(ri, ci, "kp-best")}>
          <div className="kp-td-in kp-r">
            <Money c={cc.min} />
            <div className="kp-bestlab"><span className="kp-sw" style={{ background: LABS[w.lab].cor }} />{cc.winners.map((x) => LABS[x.lab].nome.split(" ")[0]).join(" · ")}</div>
          </div>
        </td>
      );
    }
    if (col.kind === "eco")
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="kp-td-in">
            {cc.eco === null ? <span className="kp-empty kp-r" style={{ textAlign: "right" }}>1 oferta</span> : (
              <div className="kp-eco">
                <div className="kp-ecobar"><i style={{ width: `${Math.min(100, (cc.eco / 0.6) * 100)}%` }} /></div>
                <span className="kp-money" style={{ fontSize: 15 }}>{pctTxt(cc.eco * 100)}</span>
              </div>
            )}
          </div>
        </td>
      );
    if (col.kind === "ref")
      return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}><div className="kp-td-in kp-r">{cc.ref === null ? <span className="kp-empty">—</span> : <Money c={cc.ref} />}</div></td>;
    if (col.kind === "mg")
      return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}><div className="kp-td-in kp-r"><span className="kp-mg">{pctTxt(cc.margem)}</span></div></td>;
    return (
      <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "kp-venda")}>
        <div className="kp-td-in kp-r">{cc.venda === null ? <span className="kp-empty">—</span> : <Money c={cc.venda} />}</div>
      </td>
    );
  }

  const cabecalho = (col: Col, ci: number) => {
    const on = c === ci && sel.modo !== "row";
    const sortKey: SortKey | null = col.kind === "prod" ? "prod" : col.kind === "best" ? "best" : col.kind === "eco" ? "eco" : col.kind === "venda" ? "venda" : null;
    const lab = col.kind === "lab" ? LABS[col.lab as number] : null;
    const v = lab ? lab.vers[ver[col.lab as number]] : null;
    const vigente = lab && v ? ver[col.lab as number] === lab.vers.length - 1 : false;
    const titulo = lab ? lab.nome : { prod: "Produto", cls: "Classificação", best: "Melhor valor", eco: "Economia", ref: "Referência", mg: "Margem", venda: "Venda", lab: "" }[col.kind];
    const sub = lab && v ? `${v.data} · ${v.conf ? "a conferir" : vigente ? "vigente" : "anterior"}` : { prod: `${flat.length} apresentações`, cls: "via · categoria · família", best: "menor + laboratório", eco: "menor vs. maior", ref: MODO_TXT[modo], mg: "da categoria", venda: base === "unit" ? "sugerida · unidade" : "sugerida · caixa", lab: "" }[col.kind];
    const Seta = sort && sortKey === sort.key ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th key={ci} className={`kp-th ${col.kind === "best" ? "kp-th-best" : ""} ${col.kind === "prod" ? "kp-th-fix" : ""}`}
        style={{ ["--tc" as string]: lab ? lab.cor : col.kind === "best" ? undefined : "#5f719b", left: col.kind === "prod" ? 48 : undefined }}
        data-on={on ? 1 : 0} onClick={() => setSel({ r, c: ci, modo: "col" })}>
        <div className="kp-th-in">
          <div className="kp-th-t">
            <b title={lab?.full}>{titulo}</b>
            <span>{lab && v && <i className={`kp-led ${v.conf ? "kp-led-amber" : vigente ? "" : "kp-led-gray"}`} />}{sub}</span>
          </div>
          {sortKey && (
            <button type="button" className="kp-th-sort" data-on={sort?.key === sortKey ? 1 : 0} aria-label={`Ordenar por ${titulo}`}
              onClick={(e) => { e.stopPropagation(); ciclarSort(sortKey); }}><Seta size={13} /></button>
          )}
        </div>
      </th>
    );
  };

  const sec = (id: string, titulo: string, dica: string, corpo: ReactNode, cheia = false) => {
    const aberta = !secFechadas.includes(id);
    return (
      <div className="kp-sec" key={id} data-open={aberta ? 1 : 0} data-full={cheia ? 1 : 0}>
        <button type="button" className="kp-sec-l" aria-expanded={aberta} onClick={() => setSecFechadas((f) => (aberta ? [...f, id] : f.filter((x) => x !== id)))}>
          <span>{titulo}</span><i title={dica}>i</i><ChevronDown size={13} className="kp-sec-chev" />
        </button>
        {aberta && <div className="kp-sec-b">{corpo}</div>}
      </div>
    );
  };
  const resumo = [
    MODO_TXT[modo], base === "unit" ? "Por unidade" : "Por caixa",
    famSel === "TODAS" ? "Todas as famílias" : fams[famSel]?.nome ?? "Família",
    catSel === "TODAS" ? "Todas as vias" : CATS.find((x) => x.id === catSel)?.curto ?? "",
    `${labsOn.filter(Boolean).length} laboratórios`,
  ];

  let numero = 0;
  const larguraTotal = 48 + cols.reduce((a, x) => a + x.w, 0);
  const ecoTotal = dono.gastoMax ? ((dono.gastoMax - dono.gastoMin) / dono.gastoMax) * 100 : 0;

  /* ---------------------------------------------------------------- JSX */
  return (
    <div className="kp-root">
      {/* ------------------------------ topo */}
      <div className="kp-top">
        <div className="kp-bevel kp-plate">
          <small>CADASTROS CLÍNICOS · VISÃO DO DONO</small>
          <h1>Matrix: Substâncias x Fornecedores</h1>
        </div>
        <div className="kp-kpis">
          <div className="kp-panel kp-kpi"><span>Produtos na tela</span><b>{filtrados.length}</b><em>{foraDaVersao} fora das versões em uso</em></div>
          <div className="kp-panel kp-kpi"><span>Comparáveis</span><b>{comparaveis.length}</b><em>com 2 ofertas ou mais</em></div>
          <div className="kp-panel kp-kpi"><span>Economia média</span><b>{ecoMedia === null ? "—" : pctTxt(ecoMedia)}</b><em>menor sobre o maior</em></div>
          <div className="kp-panel kp-kpi"><span>Ofertas a conferir</span><b style={{ color: "#a86a0c" }}>{aConferir}</b><em>Bio meds, composições</em></div>
        </div>
        <div className="kp-panel kp-score">
          <span>Quem tem o menor preço</span>
          <div className="kp-scorebar" role="img" aria-label="Placar de menores preços por laboratório">
            {LABS.map((l, i) => placar[i] > 0 && <i key={l.nome} style={{ flexGrow: placar[i], background: l.cor }} title={`${l.nome}: ${placar[i]}`} />)}
          </div>
          <div className="kp-scoreleg">
            {LABS.map((l, i) => <span key={l.nome}><i className="kp-sw" style={{ background: l.cor, marginRight: 5 }} /><b>{placar[i]}</b> {l.nome.split(" ")[0]}</span>)}
          </div>
        </div>
      </div>

      {/* ------------------------------ abas */}
      <div className="kp-tabs3" role="tablist">
        <button type="button" role="tab" className="kp-tab3" aria-selected={aba === "matriz"} onClick={() => setAba("matriz")}>Matriz de preços <small>{todos.length}</small></button>
        <button type="button" role="tab" className="kp-tab3" aria-selected={aba === "dono"} onClick={() => setAba("dono")}>Visão do dono</button>
        <button type="button" role="tab" className="kp-tab3" aria-selected={aba === "labs"} onClick={() => setAba("labs")}>Laboratórios e versões <small>{LABS.reduce((a, l) => a + l.vers.length, 0)}</small></button>
        <div className="kp-tabs3-r">
          <button type="button" className="kp-btn" onClick={() => setModal("imp")}><Upload size={15} />Importar catálogo</button>
          <button type="button" className="kp-btn" onClick={() => setModal("ped")}><ShoppingCart size={15} />Pedido por laboratório</button>
          <button type="button" className="kp-btn kp-btn-gold" onClick={() => setModal("ref")}><FileSpreadsheet size={15} />Enviar referência às Substâncias</button>
        </div>
      </div>

      {/* ------------------------------ ferramentas da planilha (abre e fecha com um clique) */}
      <section className="kp-tools" data-open={tools ? 1 : 0} aria-label="Ferramentas da planilha">
        <div className="kp-tools-h">
          <button type="button" className="kp-tools-t" aria-expanded={tools} onClick={() => setTools((v) => !v)}>
            <SlidersHorizontal size={15} /><b>Ferramentas da planilha</b>
            {!tools && <span className="kp-resumo">{resumo.map((t) => <em key={t}>{t}</em>)}</span>}
          </button>
          {tools && (
            <div className="kp-lado" role="group" aria-label="Disposição">
              <button type="button" aria-pressed={!lado} onClick={() => setLado(false)}>Empilhado</button>
              <button type="button" aria-pressed={lado} onClick={() => setLado(true)}>Ao lado</button>
            </div>
          )}
          <button type="button" className="kp-round" aria-label={tools ? "Fechar ferramentas" : "Abrir ferramentas"} onClick={() => setTools((v) => !v)}>
            <ChevronDown size={16} className="kp-tchev" data-open={tools ? 1 : 0} />
          </button>
        </div>
        {tools && (
          <div className="kp-tools-b" data-lado={lado ? 1 : 0}>
            {sec("versoes", "Versões dos laboratórios", "A última versão é a vigente. Clique no nome para tirar o laboratório da comparação.", (
              <div className="kp-vgrid">
                {LABS.map((l, i) => (
                  <div key={l.nome} className="kp-lt" data-off={labsOn[i] ? 0 : 1} style={{ ["--lc" as string]: l.cor }}>
                    <button type="button" className="kp-lt-n" onClick={() => alternarLab(i)} aria-pressed={labsOn[i]} title={labsOn[i] ? "Tirar da comparação" : "Voltar à comparação"}>
                      <b>{l.nome}</b><span>{l.vers.length > 1 ? `${l.vers.length} versões` : l.vers[0].conf ? "a conferir" : "versão única"}</span>
                    </button>
                    <div className="kp-lt-v" role="group" aria-label={`Versão de ${l.nome}`}>
                      {l.vers.map((v, k) => (
                        <button key={v.cat} type="button" aria-pressed={ver[i] === k} onClick={() => escolherVersao(i, k)} title={v.arquivo}>{k === l.vers.length - 1 && <i />}{v.data}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="kp-vacts">
                  <button type="button" className="kp-tile" aria-pressed={mostrarVar} onClick={() => setMostrarVar((v) => !v)} title="Mostra, em cada preço, a variação contra a versão anterior">Mostrar variação</button>
                  <button type="button" className="kp-tile" onClick={usarAnteriores}><History size={14} />Fechamento anterior</button>
                  <button type="button" className="kp-tile kp-tile-gold" onClick={ativarUltimas}><Zap size={14} />{todasUltimas ? "Todas na última" : "Ativar última de todos"}</button>
                  <button type="button" className="kp-tile" onClick={() => setModal("imp")}><Upload size={14} />Importar catálogo</button>
                </div>
              </div>
            ), true)}

            {aba === "matriz" && sec("familia", "Família clínica", "Mesma lista do cadastro de Substâncias. Clique em Gerenciar para criar outra.", (
              <div className="kp-tiles">
                <button type="button" className="kp-tile" aria-pressed={famSel === "TODAS"} onClick={() => setFamSel("TODAS")}>Todas<small>{todos.length}</small></button>
                {fams.map(({ nome, cor }, f) => {
                  const n = todos.filter((t) => t.row.fam === f).length;
                  return n ? (
                    <button key={nome} type="button" className="kp-tile" aria-pressed={famSel === f} onClick={() => setFamSel(f)}>
                      <span className="kp-fdot" style={{ ["--fc" as string]: cor }} />{nome}<small>{n}</small>
                    </button>
                  ) : null;
                })}
                <button type="button" className="kp-tile kp-tile-ghost" onClick={() => { setNovoNome(""); setModal("cats"); }}><Tags size={14} />Gerenciar categorias</button>
              </div>
            ))}

            {aba === "matriz" && sec("via", "Via de uso e categoria de margem", "Define a margem de lucro aplicada ao produto.", (
              <div className="kp-tiles">
                <button type="button" className="kp-tile" aria-pressed={catSel === "TODAS"} onClick={() => setCatSel("TODAS")}>Todas<small>{todos.length}</small></button>
                {CATS.map((x) => {
                  const n = todos.filter((t) => t.row.cat === x.id).length;
                  return n ? <button key={x.id} type="button" className="kp-tile" aria-pressed={catSel === x.id} onClick={() => setCatSel(x.id)}>{x.curto}<small>{n}</small></button> : null;
                })}
              </div>
            ))}

            {aba === "matriz" && sec("preco", "Preço e referência", "A referência é a base do preço de venda sugerido.", (
              <div className="kp-tiles">
                <span className="kp-lbl2">Preço por</span>
                <button type="button" className="kp-tile" aria-pressed={base === "unit"} onClick={() => setBase("unit")}>Unidade</button>
                <button type="button" className="kp-tile" aria-pressed={base === "caixa"} onClick={() => setBase("caixa")}>Caixa</button>
                <span className="kp-lbl2">Referência</span>
                {(["maior", "media", "menor"] as Modo[]).map((m) => <button key={m} type="button" className="kp-tile" aria-pressed={modo === m} onClick={() => setModo(m)}>{MODO_TXT[m]}</button>)}
                <span className="kp-lbl2">Mostrar</span>
                <button type="button" className="kp-tile" aria-pressed={soComp} onClick={() => setSoComp((v) => !v)}>Só comparáveis</button>
                <button type="button" className="kp-tile" aria-pressed={incConf} onClick={() => setIncConf((v) => !v)}>Incluir a conferir</button>
              </div>
            ))}

            {aba === "matriz" && sec("margem", "Margem de lucro por categoria", "Venda = referência ÷ (1 − margem). Margens de exemplo.", (
              <div className="kp-tiles">
                {CATS.filter((x) => todos.some((t) => t.row.cat === x.id)).map((x) => (
                  <div key={x.id} className="kp-mgin">
                    <span>{x.curto}<em>{todos.filter((t) => t.row.cat === x.id).length} produtos</em></span>
                    <button type="button" aria-label={`Diminuir margem de ${x.curto}`} onClick={() => ajustar(x.id, -1)}><Minus size={13} /></button>
                    <input value={mg[x.id]} inputMode="numeric" aria-label={`Margem de ${x.curto} em porcentagem`}
                      onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); setMg((m) => ({ ...m, [x.id]: Math.min(95, n) })); }} />
                    <b>%</b>
                    <button type="button" aria-label={`Aumentar margem de ${x.curto}`} onClick={() => ajustar(x.id, 1)}><Plus size={13} /></button>
                  </div>
                ))}
              </div>
            ), true)}
          </div>
        )}
      </section>

      {aba === "matriz" && (
        <>
          {/* ------------------------------ barra da substância (logo acima da planilha) */}
          <div className="kp-sbar">
            <div className="kp-sbar-sel">
              <small>Substância selecionada</small>
              {atual ? (
                <div className="kp-sbar-nome">
                  <b>{atual.row.nome}</b><span>{doseCurta(atual.row.dose)}</span>
                  <button type="button" className="kp-fchip" onClick={() => abrirCad(atual.row.id)} title="Mudar a categoria no cadastro">
                    <span className="kp-fdot" style={{ ["--fc" as string]: fams[atual.row.fam].cor }} />{fams[atual.row.fam].nome}<Pencil size={10} />
                  </button>
                </div>
              ) : <div className="kp-sbar-nome"><b>Nenhuma</b></div>}
            </div>
            <div className="kp-sbar-busca">
              <div className="kp-search kp-search-prem">
                <Search size={15} />
                <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} onFocus={() => setBuscaFoco(true)} onBlur={() => window.setTimeout(() => setBuscaFoco(false), 120)}
                  placeholder="Buscar substância ou ativo…" aria-label="Buscar substância ou ativo" />
                {busca ? <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")} className="kp-search-x"><X size={14} /></button> : <kbd>/</kbd>}
              </div>
              {buscaFoco && sugestoes.length > 0 && (
                <ul className="kp-sug" role="listbox">
                  {sugestoes.map((x) => (
                    <li key={x.row.id} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); setBusca(x.row.nome); setBuscaFoco(false); }}>
                      <span className="kp-sug-av">{x.row.nome.slice(0, 2).toUpperCase()}</span>
                      <span className="kp-sug-t"><b>{x.row.nome}</b><small>{doseCurta(x.row.dose)} · {fams[x.row.fam].nome}</small></span>
                      {x.min !== null && <Money c={x.min} />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ------------------------------ barra de fórmula */}
          <div className="kp-panel kp-fx" aria-live="polite">
            <div className="kp-fx-name">{atual && colAtual ? `${colAtual.letter}${r + 1}` : "—"}</div>
            <div className="kp-fx-i">fx</div>
            <div className="kp-fx-txt">{descricao()}</div>
            <div className="kp-fx-act">
              <button type="button" className="kp-btn" style={{ height: 28 }} onClick={copiar} disabled={!atual}><Copy size={13} />Copiar <kbd style={{ fontSize: 10, opacity: .6 }}>Ctrl+C</kbd></button>
            </div>
          </div>

          {/* ------------------------------ grade */}
          <div className="kp-gridwrap" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-label="Matriz de preços por substância e fornecedor">
            {flat.length === 0 && grupos.length === 0 ? (
              <div className="kp-none">
                <FileSpreadsheet size={36} />
                <b>Nenhum produto com esses filtros</b>
                <span>Tire a busca, volte para &quot;Todas&quot; as categorias e famílias, ou ative a versão mais recente.</span>
                <button type="button" className="kp-btn" onClick={() => { setBusca(""); setCatSel("TODAS"); setFamSel("TODAS"); setSoComp(false); }}>Limpar filtros</button>
              </div>
            ) : (
              <table className="kp-table" style={{ width: "100%", minWidth: larguraTotal }}>
                <colgroup><col style={{ width: 48 }} />{cols.map((x, i) => <col key={i} style={{ width: x.w }} />)}</colgroup>
                <thead>
                  <tr>
                    <th className="kp-corner" style={{ height: 26 }} />
                    {cols.map((x, i) => (
                      <th key={i} className="kp-letter" data-on={(sel.modo !== "row" && c === i) ? 1 : 0} onClick={() => setSel({ r, c: i, modo: "col" })}>{x.letter}</th>
                    ))}
                  </tr>
                  <tr>
                    <th className="kp-corner" style={{ top: 26, height: 56, zIndex: 8 }}>
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
                      <tr key={`b-${g.cat.id}`} className="kp-band" onClick={() => setFechados((f) => (f.includes(g.cat.id) ? f.filter((x) => x !== g.cat.id) : [...f, g.cat.id]))}>
                        <td colSpan={cols.length + 1} style={{ top: 82 }}>
                          <div className="kp-band-in" data-open={aberto ? 1 : 0}>
                            <ChevronDown size={15} className="kp-chev" />
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
                            <th className="kp-rn" scope="row" data-on={(sel.modo === "row" || sel.modo === "cell") && r === ri ? 1 : 0}
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
          <div className="kp-foot">
            <div className="kp-panel kp-stat" aria-live="polite">
              <div className="kp-statlab"><span>Seleção</span><b>{estat ? estat.rotulo : "—"}</b></div>
              <div><span>Contagem</span><b>{estat ? estat.n : "—"}</b></div>
              <div><span>Mínimo</span><b>{estat ? estat.min : "—"}</b></div>
              <div><span>Média</span><b>{estat ? estat.media : "—"}</b></div>
              <div><span>Máximo</span><b>{estat ? estat.max : "—"}</b></div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}><span>Atalhos</span><b style={{ fontFamily: "Inter", fontSize: 11 }}>Setas navegam · Ctrl+C copia · / busca</b></div>
            </div>
          </div>
        </>
      )}

      {aba === "dono" && (
        <div className="kp-dono">
          <div className="kp-panel kp-card kp-hero">
            <h3>Se eu comprar tudo no menor preço <em style={{ color: "#aebbd9" }}>1 {base === "unit" ? "unidade" : "caixa"} de cada produto comparável</em></h3>
            <div className="kp-big">{pctTxt(ecoTotal)} <u>a menos</u></div>
            <div className="kp-compare">
              <div><span>No maior preço</span><b>{brl(dono.gastoMax)}</b></div>
              <div><span>No menor preço</span><b style={{ color: "var(--gold)" }}>{brl(dono.gastoMin)}</b></div>
            </div>
            <p>Conta feita com as versões em uso: {LABS.map((l, i) => `${l.nome} ${l.vers[ver[i]].data}`).join(", ")}. {dono.comp.length} produtos têm ao menos dois laboratórios.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="kp-btn kp-btn-gold" onClick={() => setModal("ped")}><ShoppingCart size={15} />Gerar pedido por laboratório</button>
              <button type="button" className="kp-btn" onClick={() => irParaMatriz({})}>Abrir a matriz</button>
            </div>
          </div>

          <div className="kp-panel kp-card kp-c4">
            <h3>Laboratório único <em>{dono.unica.length} produtos</em></h3>
            <div className="kp-bars">
              {LABS.map((l, i) => (
                <div key={l.nome}>
                  <span>{l.nome.split(" ")[0]}</span>
                  <div className="kp-bar"><i style={{ width: `${dono.unica.length ? (dono.unicaPorLab[i] / dono.unica.length) * 100 : 0}%`, background: l.cor }} /></div>
                  <b>{dono.unicaPorLab[i]}</b>
                </div>
              ))}
            </div>
            <span className="kp-note">Produtos que só um laboratório vende nas versões em uso. É onde falta alternativa de compra e o preço não tem comparação.</span>
          </div>

          <div className="kp-panel kp-card kp-c3">
            <h3>Pendências</h3>
            <div className="kp-row2"><div><b>{aConferir}</b><span>ofertas a conferir</span></div><button type="button" className="kp-link" onClick={() => { setIncConf(false); avisar("Ofertas a conferir saíram da comparação."); }}>Tirar da conta</button></div>
            <div className="kp-row2"><div><b>{todos.filter((x) => !x.row.cad).length}</b><span>fora do cadastro de Substâncias</span></div><button type="button" className="kp-link" onClick={() => setModal("ref")}>Ver envio</button></div>
            <div className="kp-row2"><div><b>{foraDaVersao}</b><span>só existem em versão que não está em uso</span></div><button type="button" className="kp-link" onClick={ativarUltimas}>Ativar última</button></div>
          </div>

          <div className="kp-panel kp-card kp-c7">
            <h3>Por família clínica <em>clique para abrir na matriz</em></h3>
            <table className="kp-tbl">
              <thead><tr><th>Família</th><th className="kp-n">Produtos</th><th className="kp-n">Comparáveis</th><th className="kp-n">Economia</th><th>Quem vence</th></tr></thead>
              <tbody>
                {dono.porFam.map((f) => (
                  <tr key={f.nome} data-go="1" onClick={() => irParaMatriz({ fam: f.f })}>
                    <td><span className="kp-cls-f" style={{ color: "var(--ink)", fontWeight: 600 }}><span className="kp-fdot" style={{ ["--fc" as string]: fams[f.f].cor }} />{f.nome}</span></td>
                    <td className="kp-n">{f.n}</td><td className="kp-n">{f.comp}</td><td className="kp-n">{f.eco === null ? "—" : pctTxt(f.eco)}</td>
                    <td><div className="kp-mini">{LABS.map((l, i) => f.wins[i] > 0 && <i key={l.nome} style={{ flexGrow: f.wins[i], background: l.cor }} title={`${l.nome}: ${f.wins[i]}`} />)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="kp-panel kp-card kp-c5">
            <h3>Maiores diferenças confirmadas <em>por {base === "unit" ? "unidade" : "caixa"}</em></h3>
            {dono.maiores.map((x) => (
              <div key={x.row.id} className="kp-row2">
                <div><b>{x.row.nome} {doseCurta(x.row.dose)}</b><span>{LABS[x.winners[0].lab].nome} {brl(x.min as number)} contra {brl(x.max as number)}</span></div>
                <button type="button" className="kp-link" onClick={() => irParaMatriz({ busca: x.row.nome.split(" ")[0] })}>Ver</button>
              </div>
            ))}
            {dono.maiores.length === 0 && <span className="kp-note">Sem produtos comparáveis com os filtros atuais.</span>}
          </div>

          <div className="kp-panel kp-card kp-c7">
            <h3>Radar de reajuste <em>versão em uso contra a anterior do mesmo laboratório</em></h3>
            {dono.movers.length === 0 ? (
              <span className="kp-note">Nenhum laboratório está numa versão que tenha anterior para comparar. Escolha uma versão anterior e a seguinte, ou use &quot;Fechamento anterior&quot;.</span>
            ) : (
              <table className="kp-tbl">
                <thead><tr><th>Produto</th><th>Laboratório</th><th className="kp-n">Antes</th><th className="kp-n">Agora</th><th className="kp-n">Variação</th></tr></thead>
                <tbody>
                  {dono.movers.slice(0, 7).map((m) => (
                    <tr key={`${m.x.row.id}-${m.i}`}>
                      <td style={{ fontWeight: 600 }}>{m.x.row.nome} <span style={{ color: "var(--muted)", fontWeight: 500 }}>{doseCurta(m.x.row.dose)}</span></td>
                      <td><span className="kp-sw" style={{ background: LABS[m.i].cor, marginRight: 6 }} />{LABS[m.i].nome.split(" ")[0]}</td>
                      <td className="kp-n">{brl(val(m.p, base))}</td><td className="kp-n">{brl(val(m.o, base))}</td>
                      <td className="kp-n"><span className="kp-delta" data-d={m.pct > 0 ? "up" : "down"}>{sinal(m.pct)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="kp-panel kp-card kp-c5">
            <h3>Margem por categoria <em>exemplos, edite na matriz</em></h3>
            <table className="kp-tbl">
              <thead><tr><th>Categoria</th><th className="kp-n">Itens</th><th className="kp-n">Margem</th><th className="kp-n">Venda média</th></tr></thead>
              <tbody>
                {CATS.map((k) => {
                  const rs = todos.filter((x) => x.row.cat === k.id && x.venda !== null);
                  if (!rs.length) return null;
                  return (
                    <tr key={k.id} data-go="1" onClick={() => irParaMatriz({ cat: k.id })}>
                      <td style={{ fontWeight: 600 }}>{k.nome}</td><td className="kp-n">{rs.length}</td>
                      <td className="kp-n">{pctTxt(mg[k.id])}</td><td className="kp-n">{brl(Math.round(rs.reduce((a, x) => a + (x.venda as number), 0) / rs.length))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === "labs" && (
        <>
          <div className="kp-regras">
            <div className="kp-panel kp-regra"><i>1</i><b>A última versão é a vigente</b><span>Cada laboratório tem uma linha do tempo. A data mais recente entra sozinha na comparação.</span></div>
            <div className="kp-panel kp-regra"><i>2</i><b>Nada é apagado</b><span>A versão antiga fica no histórico e pode ser religada com um clique, por laboratório.</span></div>
            <div className="kp-panel kp-regra"><i>3</i><b>Nunca misturar datas</b><span>Um laboratório entra na conta com uma versão só. Dois catálogos do mesmo laboratório não competem entre si.</span></div>
            <div className="kp-panel kp-regra"><i>4</i><b>Variação à vista</b><span>Cada preço mostra quanto mudou contra a versão anterior. Novo catálogo vira radar de reajuste.</span></div>
          </div>
          <div className="kp-labs">
            {labInd.map((li) => (
              <div key={li.lab.nome} className="kp-panel kp-lcard" style={{ ["--lc" as string]: li.lab.cor }}>
                <div className="kp-lcard-h">
                  <div><h3>{li.lab.nome}</h3><span>{li.lab.perfil}</span></div>
                  <span className="kp-role">{li.papel}</span>
                </div>
                <div className="kp-lcard-b">
                  <div className="kp-ind">
                    <div className="kp-well"><span>Produtos</span><b>{li.n}</b></div>
                    <div className="kp-well"><span>Menor preço</span><b>{li.vitorias}<small style={{ fontSize: 12, color: "var(--muted)" }}> de {li.disputa}</small></b></div>
                    <div className="kp-well"><span>Índice de preço</span><b>{li.indice === null ? "—" : Math.round(li.indice)}</b></div>
                    <div className="kp-well"><span>Só ele vende</span><b>{li.unica}</b></div>
                  </div>
                  <div className="kp-chips">
                    {li.cats.map((x) => <span key={x.k.id} className="kp-pill">{x.k.curto}<small>{x.n}</small></span>)}
                    {li.fams.map((x) => <span key={x.f} className="kp-pill" style={{ background: "#f3efe5", borderColor: "var(--line-2)", color: "var(--muted)" }}>{x.nome}<small>{x.n}</small></span>)}
                  </div>
                  <div className="kp-vlist">
                    {[...li.lab.vers].map((v, k) => ({ v, k })).reverse().map(({ v, k }) => {
                      const d = diffVersao(li.i, k);
                      const vig = k === li.lab.vers.length - 1;
                      return (
                        <div key={v.cat} className="kp-ver" data-use={ver[li.i] === k ? 1 : 0}>
                          <span className="kp-ver-dot" />
                          <div>
                            <b>{v.data}<span className="kp-st" data-k={v.conf ? "conf" : vig ? "vig" : "ant"}>{v.conf ? "a conferir" : vig ? "vigente" : "anterior"}</span></b>
                            <small>{itensDaVersao(li.i, k)} produtos · {v.arquivo}</small>
                            <small>{d ? `${d.novos} novos · ${d.sairam} saíram · ${d.subiu} subiram · ${d.caiu} caíram · média ${sinal(d.media)}` : "Primeira versão registrada, sem comparação"}</small>
                          </div>
                          {ver[li.i] === k ? <span className="kp-btn" style={{ height: 30, pointerEvents: "none" }}><Check size={13} />Em uso</span>
                            : <button type="button" className="kp-btn" style={{ height: 30 }} onClick={() => { escolherVersao(li.i, k); avisar(`${li.lab.nome}: versão ${v.data} em uso`); }}>Usar esta</button>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="kp-btn kp-btn-gold" disabled={ver[li.i] === ULTIMAS[li.i]} onClick={() => { escolherVersao(li.i, ULTIMAS[li.i]); avisar(`${li.lab.nome}: última versão ativada (${li.lab.vers[ULTIMAS[li.i]].data})`); }}><Zap size={14} />Usar a última</button>
                    <button type="button" className="kp-btn" onClick={() => { setImpLab(li.i); setModal("imp"); }}><Upload size={14} />Nova versão</button>
                    <button type="button" className="kp-btn" onClick={() => irParaMatriz({})}>Ver na matriz</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="kp-panel kp-card">
            <h3>Como ler o índice de preço</h3>
            <span className="kp-note">100 é o laboratório que sempre cobra o menor preço nos produtos em que há disputa. 130 quer dizer 30% acima do melhor, em média. Considera só produtos com 2 ofertas ou mais nas versões em uso. Papel do laboratório: Principal (120 produtos ou mais), Complementar (40 a 119), Nicho (menos de 40).</span>
          </div>
        </>
      )}

      {/* ------------------------------ modal */}
      {modal && (
        <div className="kp-scrim" onClick={() => setModal(null)}>
          <div className="kp-panel kp-modal" data-w={modal === "cad" || modal === "cats" ? "s" : "l"} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="kp-bevel kp-modal-h" style={{ borderRadius: "6px 6px 0 0" }}>
              <h2>{modal === "ref" ? "Enviar referência às Substâncias" : modal === "ped" ? "Pedido por laboratório" : modal === "cad" ? "Cadastro da substância" : modal === "cats" ? "Categorias clínicas" : "Importar catálogo de laboratório"}</h2>
              <button type="button" className="kp-modal-x" aria-label="Fechar" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="kp-modal-b">
              {(modal === "cad" || modal === "cats") && (
                <div className="kp-cad">
                  {modal === "cad" && editId !== null && (() => {
                    const rw = ROWS.find((x) => x.id === editId);
                    if (!rw) return null;
                    const irm = ROWS.filter((x) => x.nome.toLowerCase() === rw.nome.toLowerCase()).length;
                    return (
                      <div className="kp-cad-sub">
                        <b>{rw.nome}</b><span>{doseCurta(rw.dose)} · via {rw.via || "não informada"} · {irm} apresentação(ões) com este nome</span>
                      </div>
                    );
                  })()}
                  <div className="kp-sec-l kp-sec-static"><span>{modal === "cad" ? "Categoria clínica" : "Categorias existentes"}</span></div>
                  <div className="kp-tiles">
                    {fams.map((f, i) => {
                      const n = ROWS.filter((r) => (famOver[r.id] ?? r.fam) === i).length;
                      return (
                        <button key={f.nome} type="button" className="kp-tile" aria-pressed={modal === "cad" ? pickFam === i : false}
                          onClick={() => { if (modal === "cad") setPickFam(i); }} style={modal === "cats" ? { cursor: "default" } : undefined}>
                          <span className="kp-fdot" style={{ ["--fc" as string]: f.cor }} />{f.nome}<small>{n}</small>
                        </button>
                      );
                    })}
                  </div>
                  <div className="kp-sec-l kp-sec-static"><span>Nova categoria</span></div>
                  <div className="kp-novacat">
                    <input value={novoNome} placeholder="ex.: Peptídeos" aria-label="Nome da nova categoria" maxLength={32}
                      onChange={(e) => setNovoNome(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { const k = criarCat(); if (k !== null && modal === "cad") setPickFam(k); } }} />
                    <span className="kp-fdot kp-fdot-lg" style={{ ["--fc" as string]: NOVA_COR[novaCor % NOVA_COR.length] }} />
                    <button type="button" className="kp-tile" onClick={() => { const k = criarCat(); if (k !== null && modal === "cad") setPickFam(k); }}><Plus size={14} />Criar</button>
                  </div>
                  <p className="kp-note" style={{ margin: 0 }}>A lista é uma só: a mesma categoria aparece aqui, na matriz e no cadastro de Substâncias. Prévia visual, nada é gravado.</p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button type="button" className="kp-btn" onClick={() => setModal(null)}>{modal === "cad" ? "Cancelar" : "Fechar"}</button>
                    {modal === "cad" && <button type="button" className="kp-btn kp-btn-gold" onClick={salvarCad}><Check size={14} />Salvar categoria</button>}
                  </div>
                </div>
              )}
              {modal === "ref" && (
                <>
                  <p className="kp-note" style={{ margin: 0 }}>
                    Regra ativa: <b>{MODO_TXT[modo]}</b>, preço {base === "unit" ? "por unidade" : "por caixa"}, com {LABS.map((l, i) => `${l.nome} ${l.vers[ver[i]].data}`).join(", ")}.
                    O cadastro de Substâncias e o Orçamento passam a ler este valor. Custo nunca sobrescreve o preço de venda atual.
                  </p>
                  <div className="kp-sum">
                    <div className="kp-well"><span>Recebem referência</span><b>{filtrados.filter((x) => x.ref !== null).length}</b></div>
                    <div className="kp-well"><span>Já no cadastro</span><b>{filtrados.filter((x) => x.ref !== null && x.row.cad).length}</b></div>
                    <div className="kp-well"><span>Novas a incluir</span><b>{filtrados.filter((x) => x.ref !== null && !x.row.cad).length}</b></div>
                  </div>
                  <div className="kp-well" style={{ padding: 4 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead><tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>
                        <th style={{ padding: "8px 10px" }}>Produto</th><th style={{ textAlign: "right" }}>Referência</th><th style={{ textAlign: "right" }}>Margem</th><th style={{ textAlign: "right", paddingRight: 10 }}>Venda sugerida</th></tr></thead>
                      <tbody>
                        {filtrados.filter((x) => x.ref !== null).slice(0, 6).map((x) => (
                          <tr key={x.row.id} style={{ borderTop: "1px solid var(--line)" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 600, textTransform: "uppercase" }}>{x.row.nome} <span style={{ color: "var(--muted)", fontWeight: 500 }}>{doseCurta(x.row.dose)}</span></td>
                            <td style={{ textAlign: "right" }}><Money c={x.ref as number} /></td>
                            <td style={{ textAlign: "right" }}><span className="kp-mg">{pctTxt(x.margem)}</span></td>
                            <td style={{ textAlign: "right", paddingRight: 10 }}><Money c={x.venda as number} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="kp-note" style={{ padding: "8px 10px" }}>e mais {Math.max(0, filtrados.filter((x) => x.ref !== null).length - 6)} substâncias.</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button type="button" className="kp-btn" onClick={() => setModal(null)}>Voltar</button>
                    <button type="button" className="kp-btn kp-btn-gold" onClick={() => { setModal(null); avisar("Prévia: nada foi gravado. A gravação entra na etapa 4."); }}>Gravar referência (prévia)</button>
                  </div>
                </>
              )}
              {modal === "ped" && (
                <>
                  <p className="kp-note" style={{ margin: 0 }}>Cada produto vai para o laboratório de menor preço na versão em uso. Rascunho: nada é enviado a laboratório e o estoque não muda.</p>
                  <div className="kp-pedidos4">
                    {pedidos.map((p) => (
                      <div key={p.lab.nome} className="kp-panel kp-ped kp-ped4" style={{ ["--pc" as string]: p.lab.cor }}>
                        <h3>{p.lab.nome} <span style={{ color: "var(--muted)", letterSpacing: 0, textTransform: "none", fontWeight: 600 }}>· {p.lab.vers[ver[p.i]].data}</span></h3>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span className="kp-serif" style={{ fontSize: 30, fontWeight: 800 }}>{p.itens.length}</span><span className="kp-note">itens · 1 caixa de cada</span>
                        </div>
                        <Money c={p.total} />
                        <ul>{p.itens.slice(0, 5).map((x) => <li key={x.nome}><span>{x.nome}</span><Money c={x.caixa} /></li>)}{p.itens.length === 0 && <li><span className="kp-empty">Nenhum item vence aqui.</span></li>}</ul>
                        {p.itens.length > 5 && <span className="kp-note">e mais {p.itens.length - 5}</span>}
                        <button type="button" className="kp-btn" disabled={!p.itens.length} onClick={() => copiarPedido(p.i)}><Copy size={13} />Copiar lista</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {modal === "imp" && (
                <div className="kp-form">
                  <p className="kp-note" style={{ margin: 0 }}>Cadastre o novo PDF como uma <b>nova versão</b> do laboratório. Ela vira a vigente, a anterior vai para o histórico e a matriz mostra a variação de cada preço. Simulação: nada é gravado.</p>
                  <label className="kp-field">Laboratório
                    <select value={impLab} onChange={(e) => setImpLab(Number(e.target.value))}>
                      {LABS.map((l, i) => <option key={l.nome} value={i}>{l.nome} (última: {l.vers[l.vers.length - 1].data})</option>)}
                    </select>
                  </label>
                  <label className="kp-field">Data do catálogo (dd/mm/aaaa)
                    <input type="text" value={impData} placeholder="ex.: 15/01/2027" inputMode="numeric" onChange={(e) => setImpData(e.target.value.replace(/[^\d/]/g, "").slice(0, 10))} />
                  </label>
                  <div className="kp-drop"><Upload size={22} /><span>Arraste o PDF da tabela de preços ou</span>
                    <button type="button" className="kp-btn" onClick={() => avisar("Seleção de arquivo é simulada neste protótipo.")}>Escolher arquivo</button></div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button type="button" className="kp-btn" onClick={() => setModal(null)}>Cancelar</button>
                    <button type="button" className="kp-btn kp-btn-gold" disabled={!/^\d{2}\/\d{2}\/\d{4}$/.test(impData)}
                      onClick={() => { setModal(null); avisar(`Simulação: ${LABS[impLab].nome} ${impData} ficaria vigente; ${LABS[impLab].vers[LABS[impLab].vers.length - 1].data} iria para o histórico.`); setImpData(""); }}>Registrar nova versão</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {toast && <div className="kp-bevel kp-toast" role="status">{toast}</div>}
    </div>
  );
}

export default MatrizCockpit;
