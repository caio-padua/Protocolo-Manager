import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Copy, FileSpreadsheet, FlaskConical, Lock, Search, ShoppingCart, Trophy, Boxes, X } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Numeral } from "@/components/numeral/Numeral";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BOTOES_VIA, CATEGORIAS, MODO_TXT, calcular, classeTxt, componentesDe, doseCurta, nomeDe, temVia, unidadeTxt,
  type Calc, type FiltroVia, type Categoria, type ConfigCategoria, type Matriz, type Parametros, type ReferenciaModo,
} from "./calculo";
import { P, V, brl, pctTxt, qtdTxt, sinal } from "./componentes";
import { Modal, PedidoPorLaboratorio, ReservasDeEstoque } from "./Modais";
import { NovoBlend, type BlendInicial } from "./NovoBlend";
import { NovaApresentacao } from "./NovaApresentacao";
import { PrecificacaoDock } from "./PrecificacaoDock";
import { BarraSubstancia } from "./BarraSubstancia";
import { GerenciarCategorias, useCategorias } from "./Categorias";
import "./matriz.css";

const CORES = ["#2d73b5", "#8a4fb0", "#c4572f", "#2f7d6b", "#c9962b", "#6d7a8f"];

async function carregar(): Promise<Matriz> {
  const r = await fetch("/api/matriz-fornecedores/completa", { headers: collabAuthHeaders() });
  if (r.status === 401) throw new Error("Entre novamente com seu acesso profissional.");
  if (r.status === 403) throw new Error("Somente o proprietário pode ver esta matriz.");
  if (!r.ok) throw new Error("A matriz está indisponível neste momento.");
  return r.json();
}

type Rascunho = { p: Parametros; c: ConfigCategoria[] };
type ColKind = "prod" | "via" | "lab" | "best" | "eco" | "ref" | "custo" | "venda" | "orc" | "estq";
type Col = { kind: ColKind; lab?: number; w: number; letter: string };
type SortKey = "prod" | "best" | "eco" | "venda" | "estq";
type Num = { v: number; tipo: "money" | "pct" | "qtd" };

const numeroDaCelula = (c: Calc, col: Col): Num | null => {
  if (col.kind === "lab") { const o = c.linha.celulas.find((x) => x.fornecedorId === col.lab); return o ? { v: o.custoUnitarioCentavos, tipo: "money" } : null; }
  if (col.kind === "best") return c.min === null ? null : { v: c.min, tipo: "money" };
  if (col.kind === "eco") return c.eco === null ? null : { v: c.eco * 100, tipo: "pct" };
  if (col.kind === "ref") return c.ref === null ? null : { v: c.ref, tipo: "money" };
  if (col.kind === "custo") return c.forma === null ? null : { v: c.forma.custoEfetivo, tipo: "money" };
  if (col.kind === "venda") return c.pub === null ? null : { v: c.pub, tipo: "money" };
  if (col.kind === "orc") return c.linha.orcamento ? { v: c.linha.orcamento.precoCentavos, tipo: "money" } : null;
  if (col.kind === "estq") return c.linha.estoque ? { v: c.linha.estoque.estatico, tipo: "qtd" } : null;
  return null;
};
const fmtNum = (n: Num) => (n.tipo === "money" ? brl(Math.round(n.v)) : n.tipo === "pct" ? pctTxt(n.v) : qtdTxt(n.v));

export default function MatrizFornecedores() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["matriz-fornecedores-completa"], queryFn: carregar });
  const dados = q.data;

  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const servidorRef = useRef("");
  useEffect(() => {
    if (!dados) return;
    const novo: Rascunho = { p: dados.parametros, c: dados.categorias };
    const json = JSON.stringify(novo);
    setRascunho((prev) => (prev === null || JSON.stringify(prev) === servidorRef.current ? novo : prev));
    servidorRef.current = json;
  }, [dados]);
  const sujo = !!rascunho && JSON.stringify(rascunho) !== servidorRef.current;

  const [busca, setBusca] = useState("");
  const [viaSel, setViaSel] = useState<FiltroVia>("TODAS");
  const [agrupar, setAgrupar] = useState<"via" | "classe">("via");
  const [soComp, setSoComp] = useState(false);
  const [soReserva, setSoReserva] = useState(false);
  const [soFalta, setSoFalta] = useState(false);
  const [desligados, setDesligados] = useState<number[] | null>(null);
  const [fechados, setFechados] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>({ key: "eco", dir: -1 });
  const [sel, setSel] = useState<{ r: number; c: number; modo: "cell" | "col" | "row" }>({ r: 0, c: 3, modo: "cell" });
  const [modal, setModal] = useState<null | "ped" | "res" | "blend" | "cat" | "apr">(null);
  const [blendInicial, setBlendInicial] = useState<BlendInicial | undefined>(undefined);
  const [apr, setApr] = useState<{ varianteId: number; fornecedorId: number } | null>(null);
  const cats = useCategorias();
  const [confA, setConfA] = useState<number | null>(null);
  const [confB, setConfB] = useState<number | null>(null);
  const trocarCat = useMutation({
    mutationFn: async (a: { id: number; nome: string }) => {
      const r = await fetch(`/api/substances/${a.id}`, { method: "PATCH", headers: { ...collabAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ category: a.nome }) });
      if (!r.ok) throw new Error("Não foi possível trocar a categoria. Nada foi alterado.");
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["matriz-fornecedores-completa"] }); avisar("Categoria da substância atualizada."); },
    onError: (e: Error) => avisar(e.message),
  });
  const [ferrAberto, setFerrAberto] = useState(true);
  const [substFoco, setSubstFoco] = useState<number | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [blendsAbertos, setBlendsAbertos] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  
  const toastT = useRef<number | undefined>(undefined);

  const forn = dados?.fornecedores ?? [];
  const corDe = useCallback((id: number) => CORES[Math.max(0, forn.findIndex((f) => f.id === id)) % CORES.length], [forn]);
  // Por padrão a comparação usa os laboratórios ativos do cadastro (a mesma regra do servidor ao publicar).
  const ligados = useMemo(() => new Set(forn.filter((f) => (desligados ?? forn.filter((x) => !x.ativo).map((x) => x.id)).indexOf(f.id) < 0).map((f) => f.id)), [forn, desligados]);
  const difereDoCadastro = forn.some((f) => ligados.has(f.id) !== f.ativo);

  const parametros = rascunho?.p ?? dados?.parametros;
  const categorias = rascunho?.c ?? dados?.categorias;
  const margens = useMemo(() => Object.fromEntries((categorias ?? []).map((c) => [c.categoria, c.margemPct])) as Record<Categoria, number>, [categorias]);
  const todos = useMemo(() => (dados && parametros ? dados.linhas.map((l) => calcular(l, ligados, parametros, margens)) : []), [dados, parametros, margens, ligados]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return todos.filter((c) =>
      (substFoco === null || c.linha.substanciaId === substFoco) &&
      temVia(c.linha, viaSel) &&
      (!soComp || c.incl.length >= 2) &&
      (!soReserva || (c.linha.estoque?.dinamico ?? 0) > 0) &&
      (!soFalta || (c.linha.estoque?.falta ?? 0) > 0) &&
      (!t || `${c.linha.produto} ${nomeDe(c.linha)} ${c.linha.doseTotal} ${c.linha.composicao ?? ""} ${c.linha.classe}`.toLowerCase().includes(t)));
  }, [todos, busca, viaSel, soComp, soReserva, soFalta, substFoco]);

  const grupos = useMemo(() => {
    type G = { id: string; titulo: string; margem: number | null; lista: Calc[] };
    const brutos: G[] = [];
    if (agrupar === "classe") {
      const m = new Map<string, G>();
      for (const c of filtrados) {
        const chave = c.linha.classe.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
        const g = m.get(chave) ?? { id: `classe-${chave}`, titulo: classeTxt(c.linha.classe), margem: null, lista: [] };
        g.lista.push(c); m.set(chave, g);
      }
      brutos.push(...[...m.values()].sort((x, y) => x.titulo.localeCompare(y.titulo, "pt-BR")));
    } else if (viaSel !== "TODAS") {
      // Via escolhida: tudo que pode ser aplicado por ela, em um bloco só (um produto "EV / IM" não se repete).
      const nome = BOTOES_VIA.find((x) => x.id === viaSel)?.nome ?? viaSel;
      brutos.push({ id: `via-${viaSel}`, titulo: `Pode ser aplicado: ${nome}`, margem: null, lista: filtrados });
    } else {
      for (const cat of CATEGORIAS) brutos.push({ id: cat.id, titulo: cat.nome, margem: margens[cat.id], lista: filtrados.filter((c) => c.linha.categoria === cat.id) });
    }
    return brutos.map((g) => {
      let lista = g.lista;
      if (sort) {
        const chave = (c: Calc): number | string | null =>
          sort.key === "prod" ? `${nomeDe(c.linha)} ${c.linha.doseTotal}` : sort.key === "best" ? c.min : sort.key === "eco" ? c.eco : sort.key === "estq" ? (c.linha.estoque?.estatico ?? null) : c.pub;
        lista = [...lista].sort((a, b) => {
          const x = chave(a), y = chave(b);
          if (x === null && y === null) return 0;
          if (x === null) return 1;
          if (y === null) return -1;
          return (typeof x === "string" ? x.localeCompare(y as string, "pt-BR") : (x as number) - (y as number)) * sort.dir;
        });
      }
      return { ...g, todos: lista, abertos: fechados.includes(g.id) ? [] : lista };
    }).filter((g) => g.todos.length > 0);
  }, [filtrados, sort, fechados, agrupar, viaSel, margens]);

  const flat = useMemo(() => grupos.flatMap((g) => g.abertos), [grupos]);
  const labsVisiveis = forn.filter((f) => ligados.has(f.id));
  const cols: Col[] = useMemo(() => {
    const base: Omit<Col, "letter">[] = [
      { kind: "prod", w: 272 }, { kind: "via", w: 104 },
      ...labsVisiveis.map((f) => ({ kind: "lab" as const, lab: f.id, w: 168 })),
      { kind: "best", w: 160 }, { kind: "eco", w: 128 }, { kind: "ref", w: 112 }, { kind: "custo", w: 128 },
      { kind: "venda", w: 176 }, { kind: "orc", w: 168 }, { kind: "estq", w: 176 },
    ];
    return base.map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) }));
  }, [labsVisiveis]);

  const r = Math.min(Math.max(sel.r, 0), Math.max(flat.length - 1, 0));
  const c = Math.min(sel.c, cols.length - 1);
  const atual = flat[r];
  const colAtual = cols[c];

  useEffect(() => {
    if (pick === null) return;
    const i = flat.findIndex((x) => x.linha.varianteId === pick);
    if (i >= 0) { setSel((p) => ({ r: i, c: p.c, modo: "cell" })); setPick(null); return; }
    const alvo = todos.find((x) => x.linha.varianteId === pick);
    if (alvo) { setBusca(""); setViaSel("TODAS"); setSoComp(false); setSoReserva(false); setSoFalta(false); setFechados([]); }
    else setPick(null);
  }, [pick, flat, todos]);

  const avisar = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") { e.preventDefault(); document.querySelector<HTMLInputElement>('[data-testid="barra-substancia"] input')?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    wrapRef.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [r, c, flat.length]);

  /* ---- gravar ---- */
  const enviar = async (url: string, metodo: string, corpo: unknown) => {
    const resp = await fetch(url, { method: metodo, headers: { ...collabAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(j.error ?? "Não foi possível gravar agora. Nada foi alterado.");
    return j as { publicadas: number; inviaveis: number };
  };
  const recarregar = () => qc.invalidateQueries({ queryKey: ["matriz-fornecedores-completa"] });
  const salvar = useMutation({
    mutationFn: async () => enviar("/api/precificacao", "PUT", { parametros: rascunho!.p, categorias: rascunho!.c }),
    onSuccess: async (j) => { await recarregar(); avisar(`Precificação salva. ${j.publicadas} preços publicados${j.inviaveis ? `, ${j.inviaveis} inviáveis` : ""}.`); },
    onError: (e: Error) => avisar(e.message),
  });
  const aplicar = useMutation({
    mutationFn: async (cat: Categoria) => {
      if (sujo) await enviar("/api/precificacao", "PUT", { parametros: rascunho!.p, categorias: rascunho!.c });
      return enviar("/api/precificacao/aplicar", "POST", { categorias: [cat] });
    },
    onSuccess: async (j) => { await recarregar(); avisar(`Novos preços aplicados: ${j.publicadas} publicados no Orçamento e nas Substâncias.`); },
    onError: (e: Error) => avisar(e.message),
  });

  const textoCelula = (cc: Calc, col: Col): string => {
    if (col.kind === "prod") return `${nomeDe(cc.linha)} ${cc.linha.doseTotal}`;
    if (col.kind === "via") return cc.linha.via || "—";
    const n = numeroDaCelula(cc, col);
    return n ? fmtNum(n) : "—";
  };
  const copiar = () => {
    if (!atual || !colAtual) return;
    const t = textoCelula(atual, colAtual);
    try { void navigator.clipboard?.writeText(t); } catch { /* sem permissão */ }
    avisar(`Copiado: ${t}`);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mov = (dr: number, dc: number) => { e.preventDefault(); setSel({ r: Math.min(Math.max(r + dr, 0), flat.length - 1), c: Math.min(Math.max(c + dc, 0), cols.length - 1), modo: "cell" }); };
    if (e.key === "ArrowDown") mov(1, 0);
    else if (e.key === "ArrowUp") mov(-1, 0);
    else if (e.key === "ArrowRight") mov(0, 1);
    else if (e.key === "ArrowLeft") mov(0, -1);
    else if (e.key === "Home") { e.preventDefault(); setSel({ r: e.ctrlKey ? 0 : r, c: 0, modo: "cell" }); }
    else if (e.key === "End") { e.preventDefault(); setSel({ r: e.ctrlKey ? flat.length - 1 : r, c: cols.length - 1, modo: "cell" }); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); copiar(); }
  };
  const alternarLab = (id: number) => {
    const atuais = forn.filter((f) => ligados.has(f.id)).map((f) => f.id);
    if (ligados.has(id) && atuais.length === 1) { avisar("Mantenha ao menos um laboratório ligado."); return; }
    const novos = ligados.has(id) ? atuais.filter((x) => x !== id) : [...atuais, id];
    setDesligados(forn.filter((f) => !novos.includes(f.id)).map((f) => f.id));
  };
  const ciclarSort = (key: SortKey) => setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  /* ---- ferramentas do blend ---- */
  const emMg = (dose: string): number | null => {
    const m = /^([\d.,]+)\s*(mg|mcg|g)\b/i.exec(dose.trim()); if (!m) return null;
    const v = parseFloat(m[1].replace(/\./g, "").replace(",", ".")); if (!Number.isFinite(v)) return null;
    const u = m[2].toLowerCase(); return u === "g" ? v * 1000 : u === "mcg" ? v / 1000 : v;
  };
  const propDe = (l: Calc["linha"], dose: string): string => {
    const mg = emMg(dose); if (mg === null) return "";
    const total = componentesDe(l).reduce((a, k) => a + (emMg(k.dose) ?? 0), 0);
    const vol = l.volumeMl ? Number(l.volumeMl) : 0;
    const partes = [vol > 0 ? `${(mg / vol).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mg/mL` : "", total > 0 ? `${((mg / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : ""];
    return partes.filter(Boolean).join(" · ");
  };
  const blendDe = (l: Calc["linha"], copia: boolean): BlendInicial => ({
    nome: copia ? `${nomeDe(l)} (cópia)` : nomeDe(l),
    via: l.via?.split(/[\s/,]+/)[0], forma: l.forma === "frasco" ? "frasco" : "ampola",
    volume: l.volumeMl ? String(Number(l.volumeMl)).replace(".", ",") : undefined,
    comps: componentesDe(l).map((k) => { const m = /^([\d.,]+)\s*(mg|mcg|g|UI|%|mL)/i.exec(k.dose.trim()); return { nome: k.nome, dose: m ? m[1] : "", unidade: m ? m[2].replace(/^ui$/i, "UI") : "mg" }; }),
  });

  /* ---- confronto A x B ---- */
  const confronto = useMemo(() => {
    if (confA === null || confB === null || confA === confB) return null;
    let a = 0, b = 0, empate = 0, soma = 0;
    for (const x of filtrados) {
      const ca = x.linha.celulas.find((k) => k.fornecedorId === confA), cb = x.linha.celulas.find((k) => k.fornecedorId === confB);
      if (!ca || !cb || ca.custoUnitarioCentavos <= 0 || cb.custoUnitarioCentavos <= 0) continue;
      if (ca.custoUnitarioCentavos < cb.custoUnitarioCentavos) a++; else if (cb.custoUnitarioCentavos < ca.custoUnitarioCentavos) b++; else empate++;
      soma += (cb.custoUnitarioCentavos - ca.custoUnitarioCentavos) / Math.max(ca.custoUnitarioCentavos, cb.custoUnitarioCentavos);
    }
    const n = a + b + empate;
    return { a, b, empate, n, medio: n ? (soma / n) * 100 : 0 };
  }, [filtrados, confA, confB]);

  /* ---- indicadores ---- */
  const comparaveis = filtrados.filter((x) => x.incl.length >= 2);
  const ecoMedia = comparaveis.length ? (comparaveis.reduce((a, x) => a + (x.eco as number), 0) / comparaveis.length) * 100 : null;
  const unicas = useMemo(() => { const m = new Map<number, NonNullable<Calc["linha"]["estoque"]>>(); for (const t of todos) if (t.linha.estoque) m.set(t.linha.substanciaId, t.linha.estoque); return [...m.values()]; }, [todos]);
  const reservadas = unicas.reduce((a, e) => a + e.dinamico, 0);
  const emFalta = unicas.filter((e) => e.falta > 0).length;
  const placar = forn.map((f) => filtrados.filter((x) => x.vencedoras[0]?.fornecedorId === f.id).length);
  const nPorLab = forn.map((f) => todos.filter((x) => x.linha.celulas.some((cl) => cl.fornecedorId === f.id)).length);
  const comPreco = todos.filter((x) => x.linha.celulas.length > 0).length;

  const estat = useMemo(() => {
    let nums: Num[] = []; let rotulo = "";
    if (sel.modo === "row" && atual) { nums = cols.map((cl) => numeroDaCelula(atual, cl)).filter((x): x is Num => !!x && x.tipo === "money"); rotulo = `Linha ${r + 1}`; }
    else if (colAtual) { nums = flat.map((cc) => numeroDaCelula(cc, colAtual)).filter((x): x is Num => !!x); rotulo = `Coluna ${colAtual.letter}`; }
    if (!nums.length) return null;
    const vs = nums.map((n) => n.v); const tipo = nums[0].tipo; const f = (v: number) => fmtNum({ v, tipo });
    return { rotulo, n: vs.length, min: f(Math.min(...vs)), max: f(Math.max(...vs)), media: f(vs.reduce((a, b) => a + b, 0) / vs.length) };
  }, [sel.modo, atual, cols, colAtual, flat, r]);

  /* ---- barra de fórmula ---- */
  const nomeForn = (id: number) => forn.find((f) => f.id === id)?.nome ?? "—";
  const modo = parametros?.referenciaModo ?? "maior";
  const descricao = (): ReactNode => {
    if (!atual || !colAtual || !parametros) return <span style={{ color: "var(--muted)" }}>Nenhuma célula selecionada.</span>;
    const l = atual.linha;
    const enc = parametros.impostosPct + parametros.cartaoPct + parametros.comissaoPct + parametros.despesasPct;
    if (colAtual.kind === "prod")
      return <>{nomeDe(l)}{l.isBlend && l.produto !== nomeDe(l) ? ` (blend ${l.produto})` : ""} · dose {l.doseTotal} · concentração {l.concentracao ?? "não informada"} · {CATEGORIAS.find((x) => x.id === l.categoria)?.nome} · classe {classeTxt(l.classe)}{!l.disponivel ? " · INDISPONÍVEL até revisão clínica" : ""}
        {l.isBlend && <span className="mx-fx-chips">{componentesDe(l).map((k, i) => <span key={i} className="mx-bchip"><b>{k.nome}</b>{k.dose}</span>)}</span>}</>;
    if (colAtual.kind === "via") return <>Via de uso cadastrada: {l.via || "não informada (a categoria não é adivinhada)"}</>;
    if (colAtual.kind === "lab") {
      const o = l.celulas.find((x) => x.fornecedorId === colAtual.lab);
      if (!o) return <>{nomeForn(colAtual.lab as number)} · sem preço para esta apresentação</>;
      return <>{nomeForn(o.fornecedorId)} · caixa com {o.quantidadeEmbalagem} {unidadeTxt(l.forma, o.quantidadeEmbalagem)} <V c={o.custoEmbalagemCentavos} className="mx-fxn" /> · <V c={o.custoUnitarioCentavos} className="mx-fxn" /> por unidade</>;
    }
    if (colAtual.kind === "best")
      return atual.min === null ? <>Sem preço comparável.</> : <>Menor preço: <V c={atual.min} className="mx-fxn" /> · {atual.vencedoras.map((w) => nomeForn(w.fornecedorId)).join(" e ")}{atual.max !== null && atual.max !== atual.min ? " · maior: " : " · única oferta, sem comparação"}{atual.max !== null && atual.max !== atual.min && <V c={atual.max} className="mx-fxn" />}</>;
    if (colAtual.kind === "eco") return atual.eco === null ? <>É preciso ao menos 2 ofertas para comparar.</> : <>Economia de <P v={atual.eco * 100} className="mx-fxn" /> do menor sobre o maior preço.</>;
    if (colAtual.kind === "ref") return atual.ref === null ? <>Sem referência.</> : <>Referência ({MODO_TXT[modo].toLowerCase()}): <V c={atual.ref} className="mx-fxn" />. É a base do preço de venda que alimenta Orçamento e Substâncias.</>;
    if (colAtual.kind === "custo")
      return atual.forma === null ? <>{atual.invalido ? "A soma de encargos e margem passa de 95%: ajuste a precificação." : "Sem custo."}</> :
        <><V c={atual.forma.referencia} className="mx-fxn" /> + frete <P v={parametros.fretePct} className="mx-fxn" /> + perda <P v={parametros.perdaPct} className="mx-fxn" /> = custo efetivo <V c={Math.round(atual.forma.custoEfetivo)} className="mx-fxn" /></>;
    if (colAtual.kind === "orc")
      return l.orcamento
        ? <>Item do Orçamento &quot;{l.orcamento.nome}&quot; está com <V c={l.orcamento.precoCentavos} className="mx-fxn" />{atual.pub === null ? " · ainda não há preço publicado pela matriz" : l.orcamento.precoCentavos === atual.pub ? " · igual ao preço publicado" : " · diferente do preço publicado (o Orçamento só muda quando a matriz publica)"}</>
        : <>Sem ligação automática com o Orçamento: a substância tem mais de uma apresentação ou não consta no catálogo do Orçamento.</>;
    if (colAtual.kind === "estq")
      return l.estoque
        ? <>Físico {qtdTxt(l.estoque.fisico)} · reservado para protocolos confirmados {qtdTxt(l.estoque.dinamico)} · livre {qtdTxt(l.estoque.estatico)}{l.estoque.falta > 0 ? ` · faltam ${qtdTxt(l.estoque.falta)} para cobrir as reservas` : ""} (estoque por substância, todas as apresentações)</>
        : <>Sem lote cadastrado e sem reserva para esta substância.</>;
    if (atual.forma === null) return <>{atual.invalido ? "A soma de encargos e margem passa de 95%: ajuste a precificação." : "Sem preço."}</>;
    return <><V c={Math.round(atual.forma.custoEfetivo)} className="mx-fxn" /> ÷ (1 − <P v={enc} className="mx-fxn" /> encargos − <P v={atual.margem} className="mx-fxn" /> margem) = <V c={atual.forma.venda} className="mx-fxn" />{parametros.arredondamento !== "nenhum" ? ` (arredondado ${parametros.arredondamento === "90" ? "para ,90" : "para o real"})` : ""} · lucro <V c={Math.round(atual.forma.lucro)} className="mx-fxn" />{atual.linha.publicado ? ` · publicado em ${new Date(atual.linha.publicado.publicadoEm).toLocaleDateString("pt-BR")}` : " · ainda não publicado"}</>;
  };

  /* ---- células ---- */
  const tdProps = (ri: number, ci: number) => ({ "data-r": ri, "data-c": ci, onClick: () => { setSel({ r: ri, c: ci, modo: "cell" }); wrapRef.current?.focus(); } });
  const cls = (ri: number, ci: number, extra = "") =>
    `mx-td ${extra} ${sel.modo === "cell" && r === ri && c === ci ? "mx-sel" : ""} ${(sel.modo === "col" && c === ci) || (sel.modo === "row" && r === ri) ? "mx-colsel" : ""}`;
  const vazia = (key: number, ri: number, ci: number, txt: string) =>
    <td key={key} {...tdProps(ri, ci)} className={cls(ri, ci, "mx-hatch")}><div className="mx-td-in mx-r"><span className="mx-empty">{txt}</span></div></td>;

  function celula(cc: Calc, col: Col, ri: number, ci: number) {
    const l = cc.linha;
    if (col.kind === "prod") {
      const comps = l.isBlend ? componentesDe(l) : [];
      const volTxt = l.volumeMl ? `${Number(l.volumeMl).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mL` : "—";
      const formaTxt = l.forma === "frasco" ? "Frasco" : l.forma === "implante" ? "Implante" : "Ampola";
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "mx-td-fix")}>
          <div className="mx-td-in mx-pc" title={l.isBlend ? `${nomeDe(l)} (${l.produto})` : nomeDe(l)}>
            <div className="mx-pc-n">
              <span className="mx-prod-n mx-prod">{nomeDe(l)}</span>
              {l.isBlend && <button type="button" className="mx-tag mx-tag-blend mx-blend-btn" aria-expanded={blendsAbertos.includes(l.varianteId)} title="Abrir a composição do blend" onClick={(e) => { e.stopPropagation(); setBlendsAbertos((a) => (a.includes(l.varianteId) ? a.filter((x) => x !== l.varianteId) : [...a, l.varianteId])); }}><ChevronRight size={10} className="mx-bl-chev" data-open={blendsAbertos.includes(l.varianteId) ? 1 : 0} />Blend</button>}
              {!l.disponivel && <span className="mx-tag mx-tag-off" title="Aguardando revisão clínica">Indisp.</span>}
            </div>
            {l.isBlend ? (
              <>
                {comps.map((k, i) => (
                  <div key={i} className="mx-pc-r"><i>{i === 0 ? "Comp." : ""}</i><span title={k.nome}>{k.nome}</span><em>{k.dose || "—"}</em></div>
                ))}
                <div className="mx-pc-r"><i>Vol.</i><span>{formaTxt} · {volTxt}</span></div>
              </>
            ) : (
              <>
                <div className="mx-pc-r" title={l.doseTotal}><i>Dose</i><span>{doseCurta(l.doseTotal)}</span></div>
                <div className="mx-pc-r" title={l.concentracao ?? ""}><i>Conc.</i><span>{l.concentracao ?? "—"}</span></div>
              </>
            )}
          </div>
        </td>
      );
    }
    if (col.kind === "via")
      return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}><div className="mx-td-in"><span className="mx-via" title={l.via ?? ""}>{l.via || "—"}</span></div></td>;
    if (col.kind === "lab") {
      const o = l.celulas.find((x) => x.fornecedorId === col.lab);
      if (!o) return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, "mx-hatch")}><div className="mx-td-in mx-r"><button type="button" className="mx-addpreco" title="Gravar apresentação deste laboratório" onClick={(e) => { e.stopPropagation(); setApr({ varianteId: l.varianteId, fornecedorId: col.lab as number }); setModal("apr"); }}>+ preço</button></div></td>;
      const ganha = cc.incl.length > 1 && cc.vencedoras.includes(o);
      const q = o.quantidadeEmbalagem;
      const fixos = [1, 5, 10];
      const quarto = fixos.includes(q) ? null : q;
      return (
        <td key={ci} {...tdProps(ri, ci)} style={{ ["--wc" as string]: corDe(o.fornecedorId) }} className={cls(ri, ci, ganha ? "mx-win" : "")}>
          <div className="mx-lab" data-ganha={ganha ? 1 : 0}>
            <div className="mx-lab-1">
              <span className="mx-lab-k">Unid.</span>
              <V c={o.custoUnitarioCentavos} peso={800} className="mx-money mx-big" />
            </div>
            <div className="mx-lab-2">
              <span className="mx-lab-k">Cx.</span>
              <V c={o.custoEmbalagemCentavos} peso={700} className="mx-money mx-mid" />
            </div>
            <div className="mx-lab-3" role="group" aria-label={`Apresentação: ${q} ${unidadeTxt(l.forma, q)} por caixa`}>
              {fixos.map((n) => (
                <span key={n} className="mx-apr" data-on={n === q ? 1 : 0} aria-current={n === q ? "true" : undefined}>{n} Unid</span>
              ))}
              <button type="button" className="mx-apr mx-apr-x" data-on={quarto !== null ? 1 : 0} aria-current={quarto !== null ? "true" : undefined} title="Gravar outra quantidade na caixa" onClick={(e) => { e.stopPropagation(); setApr({ varianteId: l.varianteId, fornecedorId: o.fornecedorId }); setModal("apr"); }}>{quarto ?? "X"} Unid</button>
            </div>
            {ganha && <span className="mx-lapela" title="Menor preço" role="img" aria-label="Menor preço"><Trophy size={10} fill="currentColor" /></span>}
          </div>
        </td>
      );
    }
    if (col.kind === "best") {
      if (cc.min === null) return vazia(ci, ri, ci, "sem preço");
      return (
        <td key={ci} {...tdProps(ri, ci)} style={{ ["--bc" as string]: corDe(cc.vencedoras[0].fornecedorId) }} className={cls(ri, ci, "mx-best")}>
          <div className="mx-td-in mx-r">
            <V c={cc.min} peso={800} />
            <div className="mx-bestlab"><span className="mx-sw" style={{ background: corDe(cc.vencedoras[0].fornecedorId) }} /><span className="mx-bestlab-t" title={cc.vencedoras.map((x) => nomeForn(x.fornecedorId)).join(" · ")}>{cc.vencedoras.map((x) => nomeForn(x.fornecedorId)).join(" · ")}</span></div>
          </div>
        </td>
      );
    }
    if (col.kind === "eco")
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="mx-td-in">
            {cc.eco === null ? <span className="mx-empty mx-r" style={{ textAlign: "right" }}>1 oferta</span> : (
              <div className="mx-eco"><div className="mx-ecobar"><i style={{ width: `${Math.min(100, (cc.eco / 0.6) * 100)}%` }} /></div><P v={cc.eco * 100} /></div>
            )}
          </div>
        </td>
      );
    if (col.kind === "ref")
      return <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}><div className="mx-td-in mx-r">{cc.ref === null ? <span className="mx-empty">—</span> : <><V c={cc.ref} /><span className="mx-sub2">{MODO_TXT[modo].toLowerCase()}</span></>}</div></td>;
    if (col.kind === "custo")
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="mx-td-in mx-r">
            {cc.forma === null ? <span className="mx-empty">{cc.invalido ? "inviável" : "—"}</span> : <><V c={Math.round(cc.forma.custoEfetivo)} /><span className="mx-sub2">+{pctTxt((cc.forma.custoEfetivo / cc.forma.referencia - 1) * 100)} frete e perda</span></>}
          </div>
        </td>
      );
    if (col.kind === "orc") {
      const o = l.orcamento;
      if (!o) return vazia(ci, ri, ci, "sem ligação");
      const igual = cc.pub !== null && o.precoCentavos === cc.pub;
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="mx-td-in mx-3f">
            <div className="mx-f1 mx-line"><span className="mx-tag mx-tag-link">orçamento</span><V c={o.precoCentavos} peso={800} /></div>
            <div className="mx-f2 mx-line mx-cx">{cc.pub === null ? <span className="mx-empty">aguarda publicação</span> : igual ? <span className="mx-tag mx-tag-ok">em dia</span> : <span className="mx-pend">publicado <V c={cc.pub} peso={600} className="mx-money mx-m13" /></span>}</div>
            <div className="mx-f3 mx-conc" title={o.nome}><span>{o.nome}</span></div>
          </div>
        </td>
      );
    }
    if (col.kind === "estq") {
      const e = l.estoque;
      if (!e) return vazia(ci, ri, ci, "sem lote");
      const total = Math.max(e.fisico, e.dinamico, 1);
      return (
        <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci)}>
          <div className="mx-td-in mx-3f">
            <div className="mx-f1 mx-line"><span className="mx-lbl">livre</span><Numeral peso={800} className={`mx-money ${e.estatico < 0 ? "mx-num-bad" : "mx-num-ok"}`}>{qtdTxt(e.estatico)}</Numeral></div>
            <div className="mx-f2 mx-line mx-cx"><span className="mx-lbl">reservado</span><Numeral peso={600} className="mx-money mx-m13">{qtdTxt(e.dinamico)}</Numeral></div>
            <div className="mx-f3 mx-comp" title={`Físico ${qtdTxt(e.fisico)} · reservado ${qtdTxt(e.dinamico)}`}>
              <span className="mx-stk" aria-hidden="true">
                <i style={{ flexGrow: Math.min(e.dinamico, e.fisico), background: "#c9962f" }} />
                <i style={{ flexGrow: Math.max(e.fisico - e.dinamico, 0), background: "#3fa66b" }} />
                {e.falta > 0 && <i style={{ flexGrow: e.falta, background: "#c4503f" }} />}
                <i style={{ flexGrow: Math.max(total - Math.max(e.fisico, e.dinamico), 0), background: "transparent" }} />
              </span>
              {e.falta > 0 ? <span className="mx-tag mx-tag-bad">falta {qtdTxt(e.falta)}</span> : <span className="mx-comp-t">físico {qtdTxt(e.fisico)}</span>}
            </div>
          </div>
        </td>
      );
    }
    const f = cc.forma;
    const congelada = categorias?.find((x) => x.categoria === l.categoria)?.modo === "congelado";
    const dif = cc.pend && cc.venda !== null && cc.pub ? ((cc.venda - cc.pub) / cc.pub) * 100 : null;
    return (
      <td key={ci} {...tdProps(ri, ci)} className={cls(ri, ci, `mx-venda ${congelada ? "mx-frz" : ""}`)}>
        <div className="mx-td-in mx-3f">
          <div className="mx-f1 mx-line">
            {congelada ? <span className="mx-tag mx-tag-frz"><Lock size={9} />congelado</span> : <span className="mx-lbl">venda</span>}
            {cc.pub === null ? <span className="mx-empty">{cc.invalido ? "inviável" : "não publicado"}</span> : <V c={cc.pub} peso={800} />}
          </div>
          <div className="mx-f2 mx-line mx-cx">
            {cc.pend && cc.venda !== null ? (
              <span className="mx-pend">seria <V c={cc.venda} peso={600} className="mx-money mx-m13" />{dif !== null && <b data-up={dif >= 0 ? 1 : 0}>{sinal(dif)}</b>}</span>
            ) : (<><span className="mx-lbl">lucro</span>{f ? <V c={Math.round(f.lucro)} peso={600} className="mx-money mx-m13" /> : <span className="mx-empty">—</span>}</>)}
          </div>
          <div className="mx-f3 mx-comp" title={f ? `Custo ${brl(Math.round(f.custoEfetivo))} · encargos ${brl(Math.round(f.impostos + f.cartao + f.comissao + f.despesas))} · lucro ${brl(Math.round(f.lucro))}` : ""}>
            {f && (<>
              <span className="mx-compbar" aria-hidden="true">
                <i style={{ flexGrow: f.custoEfetivo, background: "#16284a" }} />
                <i style={{ flexGrow: f.impostos + f.cartao + f.comissao + f.despesas, background: "#c9962f" }} />
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
    const on = c === ci && sel.modo !== "row";
    const sortKey: SortKey | null = col.kind === "prod" ? "prod" : col.kind === "best" ? "best" : col.kind === "eco" ? "eco" : col.kind === "venda" ? "venda" : col.kind === "estq" ? "estq" : null;
    const lab = col.kind === "lab" ? forn.find((f) => f.id === col.lab) : null;
    const titulo = lab ? lab.nome : ({ prod: "Produto", via: "Via", best: "Melhor valor", eco: "Economia", ref: "Referência", custo: "Custo efetivo", venda: "Venda", orc: "Orçamento", estq: "Estoque", lab: "" } as const)[col.kind];
    const sub = lab ? `${nPorLab[forn.indexOf(lab)]} apresentações${lab.ativo ? "" : " · inativo"}` : ({ prod: `${flat.length} apresentações`, via: "cadastro", best: "menor + laboratório", eco: "menor vs. maior", ref: MODO_TXT[modo], custo: "ref. + frete e perda", venda: "publicada · unidade", orc: "preço no Orçamento", estq: "livre · reservado", lab: "" } as const)[col.kind];
    const Seta = sort && sortKey === sort.key ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th key={ci} className={`mx-th ${col.kind === "best" ? "mx-th-best" : ""} ${col.kind === "prod" ? "mx-th-fix" : ""}`}
        style={{ ["--tc" as string]: lab ? corDe(lab.id) : col.kind === "best" ? undefined : "#5f719b", left: col.kind === "prod" ? 48 : undefined }}
        data-on={on ? 1 : 0} onClick={() => setSel({ r, c: ci, modo: "col" })}>
        <div className="mx-th-in">
          <div className="mx-th-t"><b title={lab?.nome}>{titulo}</b><span>{sub}</span></div>
          {sortKey && (
            <button type="button" className="mx-th-sort" data-on={sort?.key === sortKey ? 1 : 0} aria-label={`Ordenar por ${titulo}`}
              onClick={(e) => { e.stopPropagation(); ciclarSort(sortKey); }}><Seta size={13} /></button>
          )}
        </div>
      </th>
    );
  };

  if (q.isLoading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;
  if (q.isError || !dados || !rascunho || !parametros || !categorias)
    return <div className="p-6"><div className="panel-3d p-4 text-sm" role="alert">{q.isError ? (q.error as Error).message : "Carregando a matriz…"}</div></div>;

  let numero = 0;
  const larguraTotal = 48 + cols.reduce((a, x) => a + x.w, 0);
  
  return (
    <div className="mx-root" data-testid="page-matriz-fornecedores">
      <div className="mx-top">
        <div className="mx-bevel mx-plate"><small>CADASTROS CLÍNICOS</small><h1>Matrix: Substâncias x Fornecedores</h1></div>
        <div className="mx-kpis">
          <div className="mx-panel mx-kpi"><span>Produtos na tela</span><b><Numeral peso={800}>{filtrados.length}</Numeral></b><em>de {todos.length} · {comPreco} com preço</em></div>
          <div className="mx-panel mx-kpi"><span>Economia média</span><b>{ecoMedia === null ? "—" : <P v={ecoMedia} peso={800} className="" />}</b><em>menor sobre o maior · {comparaveis.length} comparáveis</em></div>
          <div className="mx-panel mx-kpi"><span>Unidades reservadas</span><b><Numeral peso={800}>{qtdTxt(reservadas)}</Numeral></b><em>{dados.reservasAtivas} reservas de protocolo</em></div>
          <div className="mx-panel mx-kpi"><span>Substâncias em falta</span><b style={{ color: emFalta ? "#8c2f1b" : undefined }}><Numeral peso={800}>{emFalta}</Numeral></b><em>{dados.semLote ? `${dados.semLote} baixas sem lote` : "reserva maior que o físico"}</em></div>
        </div>
        <div className="mx-panel mx-score">
          <span>Quem tem o menor preço</span>
          <div className="mx-scorebar" role="img" aria-label="Placar de menores preços por laboratório">
            {forn.map((f, i) => placar[i] > 0 && <i key={f.id} style={{ flexGrow: placar[i], background: corDe(f.id) }} title={`${f.nome}: ${placar[i]}`} />)}
          </div>
          <div className="mx-scoreleg">{forn.map((f, i) => <span key={f.id}><i className="mx-sw" style={{ background: corDe(f.id), marginRight: 5 }} /><b>{placar[i]}</b> {f.nome.split(" ")[0]}</span>)}</div>
        </div>
      </div>

      <div className="mx-panel mx-ferr">
        <button type="button" className="mx-ferr-h" aria-expanded={ferrAberto} onClick={() => setFerrAberto((v) => !v)} data-testid="botao-ferramentas-planilha">
          <ChevronDown size={15} className="mx-chev" data-open={ferrAberto ? 1 : 0} />
          <b>Ferramentas da planilha</b>
          {!ferrAberto && (
            <span className="mx-ferr-pills">
              <i>Via: {BOTOES_VIA.find((x) => x.id === viaSel)?.rotulo}</i>
              <i>{labsVisiveis.length} laboratórios</i>
              <i>{agrupar === "via" ? "Por via" : "Por categoria clínica"}</i>
              <i>Referência: {MODO_TXT[modo]}</i>
              {busca && <i>Busca: {busca}</i>}
              {(soComp || soReserva || soFalta) && <i>Filtros ativos</i>}
            </span>
          )}
          <small>{ferrAberto ? "recolher" : "abrir"}</small>
        </button>
      {ferrAberto && <div className="mx-ctrl">
        <div className="mx-crow">
          <span className="mx-rowlab">Ações</span>
          <div className="mx-cl" />
          <div className="mx-cr">
            <button type="button" className="mx-btn" onClick={() => { setBlendInicial(undefined); setModal("blend"); }} data-testid="botao-novo-blend"><FlaskConical size={15} />Novo blend</button>
            <button type="button" className="mx-btn" onClick={() => setModal("cat")} data-testid="botao-categorias">Categorias</button>
            <button type="button" className="mx-btn" onClick={() => setModal("ped")}><ShoppingCart size={15} />Pedido por laboratório</button>
            <button type="button" className="mx-btn mx-btn-gold" onClick={() => setModal("res")}><Boxes size={15} />Reservas de estoque</button>
          </div>
        </div>
        <div className="mx-crow">
          <span className="mx-rowlab">Laboratórios</span>
          <div className="mx-cl" role="group" aria-label="Laboratórios">
            {forn.map((f) => (
              <button key={f.id} type="button" className="mx-chip mx-chip-lab" style={{ ["--lc" as string]: corDe(f.id) }} aria-pressed={ligados.has(f.id)} onClick={() => alternarLab(f.id)}>
                <span className="mx-sw" style={{ background: corDe(f.id) }} />{f.nome}<small>{nPorLab[forn.indexOf(f)]}</small>
              </button>
            ))}
            {difereDoCadastro && <span className="mx-dirty" title="O preço publicado sempre usa os laboratórios ativos no cadastro de fornecedores.">Simulação: difere do cadastro</span>}
          </div>
          <div className="mx-cr">
            <div className="mx-group"><label>Referência</label>
              <div className="mx-well mx-seg" role="group" aria-label="Regra da referência">
                {(["maior", "media", "menor"] as ReferenciaModo[]).map((m) => <button key={m} type="button" aria-pressed={modo === m} onClick={() => setRascunho({ ...rascunho, p: { ...rascunho.p, referenciaModo: m } })}>{MODO_TXT[m]}</button>)}
              </div>
            </div>
          </div>
        </div>
        <div className="mx-crow">
          <span className="mx-rowlab">Confronto</span>
          <div className="mx-cl mx-conf" role="group" aria-label="Confronto entre dois laboratórios">
            <select value={confA ?? ""} onChange={(e) => setConfA(e.target.value ? Number(e.target.value) : null)} aria-label="Laboratório A"><option value="">Laboratório A</option>{forn.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            <span className="mx-conf-x">×</span>
            <select value={confB ?? ""} onChange={(e) => setConfB(e.target.value ? Number(e.target.value) : null)} aria-label="Laboratório B"><option value="">Laboratório B</option>{forn.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            {confronto ? (
              confronto.n === 0 ? <span className="mx-empty">Nenhuma substância com preço dos dois.</span> : (
                <span className="mx-conf-res" data-testid="confronto-resultado">
                  <b style={{ color: corDe(confA as number) }}>{nomeForn(confA as number)}</b> mais barato em <b>{confronto.a}</b>
                  <i /> <b style={{ color: corDe(confB as number) }}>{nomeForn(confB as number)}</b> mais barato em <b>{confronto.b}</b>
                  <i /> empate em <b>{confronto.empate}</b><i /> de <b>{confronto.n}</b> comparáveis · diferença média <P v={Math.abs(confronto.medio)} className="" /> a favor de {confronto.medio === 0 ? "nenhum" : nomeForn(confronto.medio > 0 ? (confA as number) : (confB as number))}
                </span>
              )
            ) : <span className="mx-empty">Escolha dois laboratórios diferentes.</span>}
          </div>
          <div className="mx-cr" />
        </div>
        <div className="mx-crow">
          <span className="mx-rowlab">Via de uso</span>
          <div className="mx-cl" role="group" aria-label="Via de uso">
            {BOTOES_VIA.map((x) => {
              const n = x.id === "TODAS" ? todos.length : todos.filter((t) => temVia(t.linha, x.id)).length;
              return (
                <span key={x.id} style={{ display: "contents" }}>
                  {x.id === "IM" && <span className="mx-vsep" />}
                  <button type="button" className="mx-chip" title={x.nome} data-vazio={n === 0 ? 1 : 0} aria-pressed={viaSel === x.id} onClick={() => setViaSel(x.id)}>{x.rotulo} <small>{n}</small></button>
                </span>
              );
            })}
          </div>
          <div className="mx-cr">
            <div className="mx-group"><label>Agrupar por</label>
              <div className="mx-well mx-seg" role="group" aria-label="Agrupar a lista">
                <button type="button" aria-pressed={agrupar === "via"} onClick={() => setAgrupar("via")}>Via</button>
                <button type="button" aria-pressed={agrupar === "classe"} onClick={() => setAgrupar("classe")}>Categoria clínica</button>
              </div>
            </div>
            <div className="mx-group"><label>Mostrar</label>
              <div className="mx-well mx-checks">
                <label className="mx-check"><input type="checkbox" checked={soComp} onChange={(e) => setSoComp(e.target.checked)} />Só comparáveis</label>
                <label className="mx-check"><input type="checkbox" checked={soReserva} onChange={(e) => setSoReserva(e.target.checked)} />Com reserva</label>
                <label className="mx-check"><input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} />Em falta</label>
              </div>
            </div>
          </div>
        </div>
      </div>}
      </div>

      <div className="mx-panel mx-fx" aria-live="polite">
        <div className="mx-fx-name">{atual && colAtual ? `${colAtual.letter}${r + 1}` : "—"}</div>
        <div className="mx-fx-i">fx</div>
        <div className="mx-fx-txt">{descricao()}</div>
        <div className="mx-fx-act"><button type="button" className="mx-btn" style={{ height: 28 }} onClick={copiar} disabled={!atual}><Copy size={13} />Copiar <kbd style={{ fontSize: 10, opacity: .6 }}>Ctrl+C</kbd></button></div>
      </div>

      <BarraSubstancia atual={atual} lista={todos} onEscolher={setPick} soEsta={substFoco !== null}
        onTrocarCat={(id, nome) => trocarCat.mutate({ id, nome })} catDe={cats.de} cats={cats.lista} onGerenciar={() => setModal("cat")}
        onSoEsta={(v) => setSubstFoco(v && atual ? atual.linha.substanciaId : null)} />

      <div className="mx-gridwrap" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-label="Matriz de preços por substância e fornecedor" data-testid="planilha-matriz">
        {grupos.length === 0 ? (
          <div className="mx-none">
            <FileSpreadsheet size={36} /><b>Nenhum produto com esses filtros</b>
            <span>Tire a busca ou volte para &quot;Todas&quot; as vias.</span>
            <button type="button" className="mx-btn" onClick={() => { setBusca(""); setViaSel("TODAS"); setSoComp(false); setSoReserva(false); setSoFalta(false); }}>Limpar filtros</button>
          </div>
        ) : (
          <table className="mx-table" style={{ width: "100%", minWidth: larguraTotal }} data-testid="tabela-matriz">
            <colgroup><col style={{ width: 48 }} />{cols.map((x, i) => <col key={i} style={{ width: x.w }} />)}</colgroup>
            <thead>
              <tr>
                <th className="mx-corner" style={{ height: 26 }} />
                {cols.map((x, i) => <th key={i} className="mx-letter" data-on={sel.modo !== "row" && c === i ? 1 : 0} onClick={() => setSel({ r, c: i, modo: "col" })}>{x.letter}</th>)}
              </tr>
              <tr>
                <th className="mx-corner" style={{ top: 26, height: 56, zIndex: 8 }}><div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--gold-d)" }}><FileSpreadsheet size={16} /></div></th>
                {cols.map(cabecalho)}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const aberto = !fechados.includes(g.id);
                const comp = g.todos.filter((x) => x.incl.length >= 2);
                const eco = comp.length ? (comp.reduce((a, x) => a + (x.eco as number), 0) / comp.length) * 100 : null;
                return [
                  <tr key={`b-${g.id}`} className="mx-band" onClick={() => setFechados((f) => (f.includes(g.id) ? f.filter((x) => x !== g.id) : [...f, g.id]))}>
                    <td colSpan={cols.length + 1}>
                      <div className="mx-band-in" data-open={aberto ? 1 : 0}>
                        <ChevronDown size={15} className="mx-chev" />{g.titulo}
                        <small>{g.todos.length} produtos</small>{g.margem !== null && <small>margem {pctTxt(g.margem)}</small>}
                        {eco !== null && <small>economia média {pctTxt(eco)}</small>}
                      </div>
                    </td>
                  </tr>,
                  ...g.abertos.map((cc) => {
                    const ri = numero++;
                    return [
                      <tr key={cc.linha.varianteId} data-zebra={ri % 2} style={cc.linha.isBlend ? { ["--row" as string]: `${Math.max(84, 52 + componentesDe(cc.linha).length * 20 + 24)}px` } : undefined}>
                        <th className="mx-rn" scope="row" data-on={(sel.modo === "row" || sel.modo === "cell") && r === ri ? 1 : 0} onClick={() => setSel({ r: ri, c, modo: "row" })}>{ri + 1}</th>
                        {cols.map((col, ci) => celula(cc, col, ri, ci))}
                      </tr>,
                      cc.linha.isBlend && blendsAbertos.includes(cc.linha.varianteId) && (
                        <tr key={`bp-${cc.linha.varianteId}`} className="mx-blend-open">
                          <td colSpan={cols.length + 1}>
                            <div className="mx-blend-pn">
                              <div className="mx-blend-t"><b>Composição de {nomeDe(cc.linha)}</b><span>todas as substâncias abaixo estão dentro de {cc.linha.volumeMl ? `${Number(cc.linha.volumeMl).toLocaleString("pt-BR")} mL` : "um mesmo volume"}</span></div>
                              <div className="mx-blend-l">
                                {componentesDe(cc.linha).map((k, i) => <div key={i} className="mx-blend-i"><span>{k.nome}</span><b>{k.dose || "—"}</b><em className="mx-blend-prop">{propDe(cc.linha, k.dose)}</em></div>)}
                              </div>
                              <div className="mx-blend-l">
                                {cc.linha.celulas.map((o) => <div key={o.fornecedorId} className="mx-blend-i"><span><i className="mx-sw" style={{ background: corDe(o.fornecedorId), marginRight: 6 }} />{nomeForn(o.fornecedorId)}</span><V c={o.custoUnitarioCentavos} peso={700} className="" /></div>)}
                              </div>
                              <div className="mx-blend-tools">
                                <button type="button" className="mx-btn" onClick={() => { setBlendInicial(blendDe(cc.linha, false)); setModal("blend"); }}>Editar / incluir preço</button>
                                <button type="button" className="mx-btn" onClick={() => { setBlendInicial(blendDe(cc.linha, true)); setModal("blend"); }}>Duplicar</button>
                                <button type="button" className="mx-btn" disabled={cc.min === null} onClick={() => { avisar(`Menor preço de ${nomeDe(cc.linha)}: ${cc.vencedoras.map((w) => nomeForn(w.fornecedorId)).join(" e ")}. Abrindo o pedido por laboratório.`); setModal("ped"); }}>Pedir no menor preço</button>
                              </div>
                              <button type="button" className="mx-btn" onClick={() => { const t = `${nomeDe(cc.linha)}: ${componentesDe(cc.linha).map((k) => `${k.nome} ${k.dose}`.trim()).join(" + ")}`; try { void navigator.clipboard?.writeText(t); } catch { /* sem permissão */ } avisar("Composição copiada."); }}><Copy size={13} />Copiar composição</button>
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  }),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mx-panel mx-stat" aria-live="polite" data-testid="barra-estado-matriz">
        <div className="mx-statlab"><span>Seleção</span><b>{estat ? estat.rotulo : "—"}</b></div>
        <div><span>Contagem</span><b>{estat ? estat.n : "—"}</b></div>
        <div><span>Mínimo</span><b>{estat ? estat.min : "—"}</b></div>
        <div><span>Média</span><b>{estat ? estat.media : "—"}</b></div>
        <div><span>Máximo</span><b>{estat ? estat.max : "—"}</b></div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}><span>Atalhos</span><b style={{ fontFamily: "Inter", fontSize: 11 }}>Setas navegam · Ctrl+C copia · / busca</b></div>
      </div>

      <PrecificacaoDock
        parametros={rascunho.p} categorias={rascunho.c} todos={todos} atual={atual} sujo={sujo} salvando={salvar.isPending || aplicar.isPending}
        onParametros={(p) => setRascunho({ ...rascunho, p })} onCategorias={(cs) => setRascunho({ ...rascunho, c: cs })}
        onSalvar={() => salvar.mutate()} onAplicar={(cat) => aplicar.mutate(cat)} avisar={avisar} />

      {modal === "ped" && <Modal titulo="Pedido por laboratório" onFechar={() => setModal(null)}><PedidoPorLaboratorio fornecedores={labsVisiveis} cor={corDe} linhas={filtrados} avisar={avisar} /></Modal>}
      {modal === "cat" && <GerenciarCategorias lista={cats.lista} onFechar={() => setModal(null)} />}
      {modal === "apr" && apr && (() => { const lh = todos.find((t) => t.linha.varianteId === apr.varianteId)?.linha; return lh ? <Modal titulo="Gravar apresentação" onFechar={() => setModal(null)}><NovaApresentacao linha={lh} fornecedorId={apr.fornecedorId} fornecedorNome={nomeForn(apr.fornecedorId)} avisar={avisar} aoGravar={() => { setModal(null); void recarregar(); }} /></Modal> : null; })()}
      {modal === "blend" && <Modal titulo={blendInicial ? "Blend a partir de um existente" : "Novo blend"} onFechar={() => setModal(null)}><NovoBlend key={blendInicial?.nome ?? "novo"} inicial={blendInicial} fornecedores={forn} avisar={avisar} aoCriar={() => { setModal(null); void recarregar(); }} /></Modal>}
      {modal === "res" && <Modal titulo="Reservas de estoque" onFechar={() => setModal(null)}><ReservasDeEstoque avisar={avisar} aoMudar={() => void recarregar()} /></Modal>}
      {toast && <div className="mx-bevel mx-toast" role="status">{toast}</div>}
    </div>
  );
}
