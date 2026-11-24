import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./craniotomia-v4.css";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Search, Plus, Eye, Pencil, FlaskConical, AlertTriangle, Trash2, Copy, Beaker, Syringe, Cpu,
  Layers, Keyboard, Focus, ChevronLeft, ChevronRight, Maximize2, History, X, Lock, Unlock,
} from "lucide-react";

// ============================================================================
// CRANIOTOMIA V4 (visual do pacote de referencia) SOBRE AS SINAPSES CLINICAS.
// Dados 100% reais: GET /api/cadastros/sinapses/painel. Nada vem de _mockData.
// Cada aresta = uma linha ativa de sinapses_clinicas (pergunta -> saida).
// Campos que o pacote mostrava e que NAO existem no banco (peso, governanca,
// acertos em 30 dias, ultima edicao, historico) ficam de fora ou desabilitados:
// nada e inventado. Excluir = desativar (Regra de Ouro). Simulacao nao grava.
// ============================================================================

type Modo = "VISUALIZACAO" | "EDICAO" | "SIMULACAO";
type Categoria = "EXAME" | "PRESCRICAO" | "INJETAVEL_IM" | "INJETAVEL_SC" | "INJETAVEL_EV" | "IMPLANTE";
type Tipo = "EXAM" | "FORM" | "INJE" | "IMPL";

interface Pergunta { perguntaId: string; pergunta: string; bloco: string | null; eSinalAlarme: boolean }
interface Destino { tipo: string; id: number; nome: string; detalhe?: string | null; incompleto?: boolean }
interface SinapseApi { id: number; perguntaId: string; categoria: Categoria; destinoTipo: string; destinoId: number; cloneDe: number | null }
interface Painel { perguntas: Pergunta[]; destinos: Record<Categoria, Destino[]>; injetaveisSemVia: number; sinapses: SinapseApi[] }

interface Linha {
  id: number;
  perguntaId: string;
  pergunta: string;
  bloco: string;
  categoria: Categoria;
  tipo: Tipo;
  destinoChave: string; // nó direito
  destinoNome: string;
  destinoDetalhe: string | null;
  cloneDe: number | null;
}

const CATEGORIAS: Categoria[] = ["EXAME", "PRESCRICAO", "INJETAVEL_IM", "INJETAVEL_SC", "INJETAVEL_EV", "IMPLANTE"];
const TIPO_DE: Record<Categoria, Tipo> = { EXAME: "EXAM", PRESCRICAO: "FORM", INJETAVEL_IM: "INJE", INJETAVEL_SC: "INJE", INJETAVEL_EV: "INJE", IMPLANTE: "IMPL" };
const TIPO_LABEL: Record<Tipo, string> = { EXAM: "EXAME", FORM: "PRESCRIÇÃO", INJE: "INJETÁVEL", IMPL: "IMPLANTE" };
const TIPO_COR: Record<Tipo, string> = { EXAM: "var(--crn-tipo-exam)", FORM: "var(--crn-tipo-form)", INJE: "var(--crn-tipo-inje)", IMPL: "var(--crn-tipo-impl)" };
const TipoIcon: Record<Tipo, React.ElementType> = { EXAM: Activity, FORM: Beaker, INJE: Syringe, IMPL: Cpu };
const ROTULO_CAT: Record<Categoria, string> = {
  EXAME: "Exame", PRESCRICAO: "Prescrição", INJETAVEL_IM: "Injetável IM", INJETAVEL_SC: "Injetável SC", INJETAVEL_EV: "Injetável EV", IMPLANTE: "Implante",
};
const ROW_H = 36;

function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (raw !== null) return JSON.parse(raw) as T;
    } catch { /* preferencia de tela: ignora leitura invalida */ }
    return initial;
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(val)); } catch { /* sem armazenamento: so nao lembra */ }
  }, [key, val]);
  return [val, setVal];
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const corBloco = (indice: number) => `hsl(${(indice * 47 + 260) % 360} 55% 52%)`;

export default function SinapsesV4() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<Painel>({
    queryKey: ["/api/cadastros/sinapses/painel"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/sinapses/painel");
      if (!r.ok) throw new Error("Falha ao carregar as sinapses");
      return r.json();
    },
  });

  // preferências de tela (nao sao dados clinicos)
  const [modo, setModo] = usePersisted<Modo>("sv4-modo", "VISUALIZACAO");
  const [search, setSearch] = usePersisted<string>("sv4-search", "");
  const [filtroBlocoArr, setFiltroBlocoArr] = usePersisted<string[]>("sv4-filtro-bloco", []);
  const [selectedId, setSelectedId] = usePersisted<number | null>("sv4-selected", null);
  const [splitPct, setSplitPct] = usePersisted<number>("sv4-split-pct", 50);
  const [inspectorW, setInspectorW] = usePersisted<number>("sv4-inspector-w", 320);
  const [legendCollapsed, setLegendCollapsed] = usePersisted<boolean>("sv4-legend-collapsed", false);
  const [inspectorCollapsed, setInspectorCollapsed] = usePersisted<boolean>("sv4-inspector-collapsed", false);
  const [marcadasArr, setMarcadasArr] = usePersisted<number[]>("sv4-marcadas", []);

  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [isolatedNode, setIsolatedNode] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [simulacao, setSimulacao] = useState<string[]>([]); // perguntas "respondidas sim" (efêmero)
  const [armada, setArmada] = useState<number | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  const filtroBloco = useMemo(() => new Set(filtroBlocoArr), [filtroBlocoArr]);
  const marcadas = useMemo(() => new Set(marcadasArr), [marcadasArr]);
  const tableRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const bodyContainerRef = useRef<HTMLDivElement>(null);

  // ---------- Linhas reais (uma por sinapse ativa) ----------
  const blocosOrdem = useMemo(() => {
    const s = new Set<string>();
    (data?.perguntas ?? []).forEach((p) => s.add(p.bloco ?? "SEM BLOCO"));
    return Array.from(s).sort();
  }, [data]);
  const corDoBloco = useCallback((b: string) => corBloco(Math.max(0, blocosOrdem.indexOf(b))), [blocosOrdem]);

  const linhas: Linha[] = useMemo(() => {
    if (!data) return [];
    const perg = new Map(data.perguntas.map((p) => [p.perguntaId, p]));
    const nomes = new Map<string, Destino>();
    for (const c of CATEGORIAS) for (const d of data.destinos[c]) nomes.set(`${c}|${d.tipo}|${d.id}`, d);
    return data.sinapses.map((s) => {
      const p = perg.get(s.perguntaId);
      const d = nomes.get(`${s.categoria}|${s.destinoTipo}|${s.destinoId}`);
      return {
        id: s.id,
        perguntaId: s.perguntaId,
        pergunta: p?.pergunta ?? s.perguntaId,
        bloco: p?.bloco ?? "SEM BLOCO",
        categoria: s.categoria,
        tipo: TIPO_DE[s.categoria],
        destinoChave: `${s.categoria}|${s.destinoTipo}|${s.destinoId}`,
        destinoNome: d?.nome ?? `Destino #${s.destinoId} (não encontrado no catálogo)`,
        destinoDetalhe: d?.detalhe ?? null,
        cloneDe: s.cloneDe,
      };
    });
  }, [data]);

  const filtradas = useMemo(() => {
    const t = semAcento(search.trim());
    return linhas.filter((s) => {
      if (filtroBloco.size > 0 && !filtroBloco.has(s.bloco)) return false;
      if (isolatedNode && s.perguntaId !== isolatedNode && s.destinoChave !== isolatedNode) return false;
      if (t) return semAcento(`${s.perguntaId} ${s.pergunta} ${s.destinoNome} ${s.bloco}`).includes(t);
      return true;
    });
  }, [linhas, search, filtroBloco, isolatedNode]);

  const leftNodes = useMemo(() => {
    const m = new Map<string, { id: string; bloco: string; texto: string; count: number }>();
    for (const s of filtradas) {
      const n = m.get(s.perguntaId);
      if (n) n.count++; else m.set(s.perguntaId, { id: s.perguntaId, bloco: s.bloco, texto: s.pergunta, count: 1 });
    }
    return Array.from(m.values()).sort((a, b) => a.bloco.localeCompare(b.bloco) || a.id.localeCompare(b.id));
  }, [filtradas]);

  const rightNodes = useMemo(() => {
    const m = new Map<string, { id: string; tipo: Tipo; categoria: Categoria; nome: string; count: number }>();
    for (const s of filtradas) {
      const n = m.get(s.destinoChave);
      if (n) n.count++; else m.set(s.destinoChave, { id: s.destinoChave, tipo: s.tipo, categoria: s.categoria, nome: s.destinoNome, count: 1 });
    }
    return Array.from(m.values()).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
  }, [filtradas]);

  const grafoH = Math.max(leftNodes.length, rightNodes.length, 1) * ROW_H + 8;
  const yEsq = useMemo(() => new Map(leftNodes.map((n, i) => [n.id, (i + 0.5) * (grafoH / leftNodes.length)])), [leftNodes, grafoH]);
  const yDir = useMemo(() => new Map(rightNodes.map((n, i) => [n.id, (i + 0.5) * (grafoH / rightNodes.length)])), [rightNodes, grafoH]);

  // ---------- Simulação (nada é gravado) ----------
  const simAtiva = modo === "SIMULACAO" && simulacao.length > 0;
  const destinosAcesos = useMemo(() => {
    const s = new Set<string>();
    if (simAtiva) for (const l of linhas) if (simulacao.includes(l.perguntaId)) s.add(l.destinoChave);
    return s;
  }, [simAtiva, simulacao, linhas]);
  const resumoSim = useMemo(() => {
    const r: Record<Tipo, number> = { EXAM: 0, FORM: 0, INJE: 0, IMPL: 0 };
    destinosAcesos.forEach((k) => { r[TIPO_DE[k.split("|")[0] as Categoria]] += 1; });
    return r;
  }, [destinosAcesos]);

  // ---------- Gravação real ----------
  const enviar = async (url: string, method: string, body: unknown) => {
    const r = await fetch(url, { method, headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error ?? "Não foi possível salvar");
    }
    return r.json();
  };
  const invalidar = () => qc.invalidateQueries({ queryKey: ["/api/cadastros/sinapses/painel"] });
  const onErro = (e: Error) => toast({ title: "Não foi salvo", description: e.message, variant: "destructive" });
  const criar = useMutation({
    mutationFn: (v: { perguntaId: string; categoria: Categoria; destinoTipo: string; destinoId: number }) => enviar("/api/cadastros/sinapses", "POST", v),
    onSuccess: () => { invalidar(); setNovaAberta(false); toast({ title: "Ligação salva" }); },
    onError: onErro,
  });
  const desativar = useMutation({
    mutationFn: (id: number) => enviar(`/api/cadastros/sinapses/${id}/ativo`, "PATCH", { ativo: false }),
    onSuccess: (_r, id) => {
      invalidar();
      setSelectedId((s) => (s === id ? null : s));
      toast({ title: "Ligação desativada", description: "Nada foi apagado: ela só deixou de valer." });
    },
    onError: onErro,
  });

  // ---------- Atalhos ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") setShowShortcuts((v) => !v);
      if (e.key === "Escape") { setShowShortcuts(false); setIsolatedNode(null); setArmada(null); setSimulacao([]); }
      if (e.key === "v" || e.key === "V") setModo("VISUALIZACAO");
      if (e.key === "e" || e.key === "E") setModo("EDICAO");
      if (e.key === "s" || e.key === "S") setModo("SIMULACAO");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setModo]);

  useEffect(() => {
    if (selectedId !== null) tableRowRefs.current.get(selectedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  // ---------- Divisores arrastáveis ----------
  const dragSplitRef = useRef(false);
  const dragInspectorRef = useRef(false);
  const onSplitDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); dragSplitRef.current = true; document.body.style.cursor = "row-resize"; document.body.style.userSelect = "none"; }, []);
  const onInspectorDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); dragInspectorRef.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }, []);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragSplitRef.current && splitContainerRef.current) {
        const rect = splitContainerRef.current.getBoundingClientRect();
        setSplitPct(Math.max(15, Math.min(85, ((e.clientY - rect.top) / rect.height) * 100)));
      }
      if (dragInspectorRef.current && bodyContainerRef.current) {
        const rect = bodyContainerRef.current.getBoundingClientRect();
        setInspectorW(Math.max(220, Math.min(560, rect.right - e.clientX)));
      }
    };
    const onUp = () => {
      if (dragSplitRef.current || dragInspectorRef.current) {
        dragSplitRef.current = false; dragInspectorRef.current = false;
        document.body.style.cursor = ""; document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [setSplitPct, setInspectorW]);

  const expandirPainel = (q: "GRAFO" | "MATRIZ" | "RESET") => {
    if (q === "GRAFO") setSplitPct(splitPct >= 80 ? 50 : 80);
    else if (q === "MATRIZ") setSplitPct(splitPct <= 20 ? 50 : 20);
    else setSplitPct(50);
  };

  // ---------- Bloco incompleto (mesma pergunta, parte das ligações marcada) ----------
  const blocosIncompletos = useMemo(() => {
    const por = new Map<string, Linha[]>();
    linhas.forEach((s) => { const a = por.get(s.perguntaId); if (a) a.push(s); else por.set(s.perguntaId, [s]); });
    const out: { key: string; bloco: string; texto: string; membros: Linha[]; marcados: Linha[] }[] = [];
    por.forEach((membros, key) => {
      const marcados = membros.filter((m) => marcadas.has(m.id));
      if (marcados.length > 0 && marcados.length < membros.length) out.push({ key, bloco: membros[0].bloco, texto: membros[0].pergunta, membros, marcados });
    });
    return out;
  }, [linhas, marcadas]);
  const perguntasMarcadas = useMemo(() => new Set(linhas.filter((s) => marcadas.has(s.id)).map((s) => s.perguntaId)).size, [linhas, marcadas]);
  const toggleMarcada = (id: number) => setMarcadasArr(marcadasArr.includes(id) ? marcadasArr.filter((x) => x !== id) : [...marcadasArr, id]);
  const completarBloco = (m: Linha[]) => setMarcadasArr([...new Set([...marcadasArr, ...m.map((x) => x.id)])]);
  const removerIsolado = (m: Linha[]) => { const ids = new Set(m.map((x) => x.id)); setMarcadasArr(marcadasArr.filter((x) => !ids.has(x))); };

  const selecionada = selectedId !== null ? linhas.find((s) => s.id === selectedId) ?? null : null;
  const modoCorEdicao = "#0e7490";
  const modoCor = (m: Modo) => (m === "EDICAO" ? modoCorEdicao : m === "SIMULACAO" ? "var(--crn-accent)" : "var(--crn-fg-dim)");

  const cliqueNo = (id: string) => {
    if (modo === "SIMULACAO") setSimulacao((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const contagemTipo = useMemo(() => {
    const r: Record<Tipo, number> = { EXAM: 0, FORM: 0, INJE: 0, IMPL: 0 };
    linhas.forEach((l) => { r[l.tipo]++; });
    return r;
  }, [linhas]);

  if (isLoading) return <div className="craniotomia-root p-6 text-[11px]" data-testid="v4-carregando">Carregando as sinapses...</div>;
  if (isError || !data) {
    return (
      <div className="craniotomia-root p-6 text-[11px]" data-testid="v4-erro">
        <p className="mb-2 text-red-400">Não foi possível carregar as sinapses. Isto não significa que não existam ligações.</p>
        <button onClick={() => refetch()} className="h-7 border border-[var(--crn-border-strong)] px-3">TENTAR DE NOVO</button>
      </div>
    );
  }

  return (
    <div className="craniotomia-root flex h-[calc(100vh-7rem)] min-h-[640px] w-full flex-col overflow-hidden text-[11px] leading-tight" data-testid="pagina-sinapses-v4">
      {/* ============ CABEÇALHO ============ */}
      <header className="flex-none border-b border-[var(--crn-border)] bg-[var(--crn-bg-panel)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-[var(--crn-accent-strong)]" />
            <div className="flex flex-col">
              <h1 className="craniotomia-serif text-sm font-semibold tracking-wide text-white">
                CRANIOTOMIA <span className="font-normal text-[var(--crn-fg-muted)]">— Split-View V4</span>
              </h1>
              <span className="text-[9px] uppercase tracking-wider text-[var(--crn-fg-dim)]">Grafo · matriz espelho · ligações pergunta → saída (dados reais)</span>
            </div>
          </div>

          <div className="flex border border-[var(--crn-border-strong)]" role="group" aria-label="Modo da tela">
            <ModoBtn icon={Eye} label="VISUALIZAÇÃO" hint="V" active={modo === "VISUALIZACAO"} onClick={() => setModo("VISUALIZACAO")} testid="v4-modo-visualizacao" />
            <ModoBtn icon={Pencil} label="EDIÇÃO" hint="E" active={modo === "EDICAO"} onClick={() => setModo("EDICAO")} accent={modoCorEdicao} testid="v4-modo-edicao" />
            <ModoBtn icon={FlaskConical} label="SIMULAÇÃO" hint="S" active={modo === "SIMULACAO"} onClick={() => setModo("SIMULACAO")} accent="var(--crn-accent-strong)" testid="v4-modo-simulacao" />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-56 items-center border border-[var(--crn-border)] bg-[var(--crn-bg)] px-2">
              <Search className="mr-2 h-3 w-3 text-[var(--crn-fg-dim)]" />
              <input type="text" placeholder="Buscar pergunta, código, saída..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="v4-busca"
                className="w-full border-none bg-transparent text-[var(--crn-fg)] outline-none placeholder:text-[var(--crn-fg-dim)]" />
            </div>
            <button onClick={() => setShowShortcuts((v) => !v)} className="flex h-7 items-center gap-1 border border-[var(--crn-border)] bg-[var(--crn-bg-row)] px-2 text-[var(--crn-fg-muted)] hover:text-[var(--crn-fg)]" title="Atalhos (?)">
              <Keyboard className="h-3 w-3" /><span className="text-[10px]">?</span>
            </button>
            <button disabled={modo !== "EDICAO"} onClick={() => setNovaAberta(true)} data-testid="v4-nova"
              title={modo !== "EDICAO" ? "Ative o modo EDIÇÃO (tecla E) para criar ligações" : "Criar nova ligação"}
              className="flex h-7 items-center gap-1 px-3 text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" style={{ backgroundColor: modoCorEdicao }}>
              <Plus className="h-3 w-3" /><span className="font-medium">NOVA SINAPSE</span>
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            <KpiPill label="LIGAÇÕES ATIVAS" value={linhas.length} color="var(--crn-estado-ativo)" />
            <KpiPill label="PERGUNTAS LIGADAS" value={new Set(linhas.map((l) => l.perguntaId)).size} />
            {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => <KpiPill key={t} label={TIPO_LABEL[t]} value={contagemTipo[t]} color={TIPO_COR[t]} />)}
            <KpiPill label="MARCADAS" value={marcadas.size} color="var(--crn-accent-strong)" />
          </div>
          <div className="flex flex-wrap items-center gap-1" aria-label="Filtro por bloco da anamnese">
            {blocosOrdem.map((b) => {
              const ativo = filtroBloco.has(b);
              return (
                <button key={b} onClick={() => setFiltroBlocoArr(ativo ? filtroBlocoArr.filter((x) => x !== b) : [...filtroBlocoArr, b])}
                  className={`border px-1.5 py-0.5 text-[9px] font-bold ${ativo ? "text-white" : "text-[var(--crn-fg-muted)] hover:text-[var(--crn-fg)]"}`}
                  style={{ borderColor: ativo ? corDoBloco(b) : "var(--crn-border)", backgroundColor: ativo ? corDoBloco(b) : "transparent" }} title={`Bloco ${b} da anamnese`}>
                  {b}
                </button>
              );
            })}
            {(filtroBloco.size > 0 || isolatedNode) && (
              <button onClick={() => { setFiltroBlocoArr([]); setIsolatedNode(null); }} className="ml-1 border border-[var(--crn-border)] px-1.5 py-0.5 text-[9px] text-[var(--crn-fg-dim)] hover:text-[var(--crn-fg)]">LIMPAR</button>
            )}
          </div>
        </div>

        {isolatedNode && (
          <div className="mt-2 flex items-center gap-2 border border-[var(--crn-estado-validacao)] bg-[var(--crn-estado-validacao)]/10 px-2 py-1 text-[10px] text-[var(--crn-estado-validacao)]">
            <Focus className="h-3 w-3" />
            <span>Isolado: <strong>{isolatedNode.includes("|") ? rightNodes.find((n) => n.id === isolatedNode)?.nome ?? isolatedNode : isolatedNode}</strong> ({filtradas.length} ligações) — Esc para sair</span>
          </div>
        )}

        {modo === "SIMULACAO" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border border-[var(--crn-accent-strong)] bg-[var(--crn-accent-strong)]/10 px-2 py-1 text-[10px] text-[var(--crn-accent)]" data-testid="v4-resumo-simulacao">
            <FlaskConical className="h-3 w-3" />
            <span className="font-bold">SIMULAÇÃO — nada é gravado.</span>
            <span>Clique nas perguntas (à esquerda do grafo) como se o cliente tivesse respondido sim.</span>
            {simulacao.length > 0 && (
              <>
                <span>{simulacao.length} pergunta(s) → acenderiam:</span>
                {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => <span key={t} style={{ color: TIPO_COR[t] }}>{TIPO_LABEL[t]}: {resumoSim[t]}</span>)}
                <button onClick={() => setSimulacao([])} className="border border-[var(--crn-border)] px-1.5 py-0.5 text-[9px] text-[var(--crn-fg-dim)] hover:text-[var(--crn-fg)]">LIMPAR SIMULAÇÃO</button>
              </>
            )}
          </div>
        )}

        {(blocosIncompletos.length > 0 || marcadas.size > 0) && (
          <div className="mt-2 flex flex-col gap-1">
            {blocosIncompletos.length > 0 && (
              <div className="flex items-start gap-2 border border-[var(--crn-estado-validacao)] bg-[var(--crn-estado-validacao)]/10 px-2 py-1 text-[10px] text-[var(--crn-estado-validacao)]" data-testid="v4-bloco-incompleto">
                <Layers className="mt-0.5 h-3 w-3 flex-none" />
                <div className="flex flex-1 flex-col gap-1">
                  <span className="font-bold uppercase tracking-wider">Bloco incompleto — {blocosIncompletos.length} pergunta(s) com saída isolada</span>
                  {blocosIncompletos.map((bl) => (
                    <div key={bl.key} className="flex flex-wrap items-center gap-2">
                      <span className="px-1 font-bold text-white" style={{ backgroundColor: corDoBloco(bl.bloco) }}>{bl.bloco}</span>
                      <span className="max-w-[320px] truncate text-[var(--crn-fg)]" title={bl.texto}>{bl.key} · {bl.texto}</span>
                      <span className="font-mono text-[var(--crn-fg-muted)]">{bl.marcados.length}/{bl.membros.length} marcada</span>
                      <button onClick={() => completarBloco(bl.membros)} className="flex items-center gap-1 border border-[var(--crn-estado-ativo)] px-1.5 py-0.5 text-[var(--crn-estado-ativo)] hover:bg-[var(--crn-estado-ativo)]/15"><Plus className="h-2.5 w-2.5" /> COMPLETAR BLOCO</button>
                      <button onClick={() => removerIsolado(bl.membros)} className="flex items-center gap-1 border border-[var(--crn-estado-bloqueado)] px-1.5 py-0.5 text-[var(--crn-estado-bloqueado)] hover:bg-[var(--crn-estado-bloqueado)]/15" title="Só desmarca na tela; não altera o banco"><Trash2 className="h-2.5 w-2.5" /> DESMARCAR ISOLADO</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {marcadas.size > 0 && (
              <div className="flex items-center gap-2 text-[9px] text-[var(--crn-fg-dim)]">
                <span>{marcadas.size} ligação(ões) marcada(s) em {perguntasMarcadas} pergunta(s). A marcação é só visual e não grava nada.</span>
                <button onClick={() => setMarcadasArr([])} className="border border-[var(--crn-border)] px-1.5 py-0.5 text-[var(--crn-fg-dim)] hover:text-[var(--crn-fg)]">LIMPAR MARCADAS</button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ============ CORPO ============ */}
      <div ref={bodyContainerRef} className="flex flex-1 overflow-hidden">
        {/* LEGENDA RECOLHÍVEL */}
        <aside className={`flex flex-none flex-col items-stretch gap-1 overflow-y-auto border-r border-[var(--crn-border)] bg-[var(--crn-bg-panel)] py-2 transition-[width] duration-150 ${legendCollapsed ? "w-[24px]" : "w-[64px]"}`}>
          <button onClick={() => setLegendCollapsed(!legendCollapsed)} className="mb-1 mr-1 self-end text-[var(--crn-fg-dim)] hover:text-[var(--crn-fg)]" title={legendCollapsed ? "Expandir legenda" : "Recolher legenda"} data-testid="v4-legenda-toggle">
            {legendCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
          </button>
          {!legendCollapsed && <div className="mb-1 text-center text-[8px] uppercase tracking-wider text-[var(--crn-fg-dim)]">BLOCO</div>}
          {blocosOrdem.map((b) => (
            <div key={b} className="flex flex-col items-center gap-0.5" title={`Bloco ${b}`}>
              <div className={`h-2 ${legendCollapsed ? "w-4" : "w-8"}`} style={{ backgroundColor: corDoBloco(b) }} />
              {!legendCollapsed && <span className="text-[8px] font-bold text-[var(--crn-fg-muted)]">{b}</span>}
            </div>
          ))}
          {!legendCollapsed && (
            <>
              <div className="my-2 border-t border-[var(--crn-border)]" />
              <div className="mb-1 text-center text-[8px] uppercase tracking-wider text-[var(--crn-fg-dim)]">SAÍDA</div>
              {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => {
                const Ic = TipoIcon[t];
                return (
                  <div key={t} className="flex flex-col items-center gap-0.5" title={TIPO_LABEL[t]}>
                    <Ic className="h-3 w-3" style={{ color: TIPO_COR[t] }} />
                    <span className="text-[8px] font-bold text-[var(--crn-fg-muted)]">{t}</span>
                  </div>
                );
              })}
            </>
          )}
        </aside>

        {/* CENTRO: GRAFO + MATRIZ */}
        <div ref={splitContainerRef} className="flex min-w-[420px] flex-1 flex-col overflow-hidden">
          {/* GRAFO */}
          <div className="relative overflow-hidden bg-[var(--crn-bg)]" style={{ height: `${splitPct}%` }} data-testid="v4-grafo">
            <div className="absolute left-0 right-0 top-0 z-20 flex justify-center">
              <div className="pointer-events-none px-2 py-0.5 text-[9px] uppercase tracking-wider" style={{ color: modoCor(modo), borderBottom: `1px solid ${modoCor(modo)}` }}>GRAFO · MODO {modo}</div>
            </div>
            {linhas.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-[var(--crn-fg-dim)]" data-testid="v4-vazio">
                Ainda não há ligações ativas. Ative o modo EDIÇÃO (tecla E) e use NOVA SINAPSE, ou cadastre pela tela Sinapses Clínicas.
              </div>
            ) : filtradas.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-[var(--crn-fg-dim)]">Nenhuma ligação corresponde à busca ou aos filtros.</div>
            ) : (
              <div className="absolute inset-0 overflow-y-auto pt-5">
                <div className="relative" style={{ height: grafoH }}>
                  <div className="absolute inset-y-0 left-[220px] right-[240px]">
                    <svg className="h-full w-full" viewBox={`0 0 100 ${grafoH}`} preserveAspectRatio="none">
                      {filtradas.map((s) => {
                        const y1 = yEsq.get(s.perguntaId); const y2 = yDir.get(s.destinoChave);
                        if (y1 === undefined || y2 === undefined) return null;
                        const ativa = hoveredId === s.id || selectedId === s.id;
                        const cor = corDoBloco(s.bloco);
                        const foraSim = simAtiva && !simulacao.includes(s.perguntaId);
                        const opacity = foraSim ? 0.08 : hoveredId === null && selectedId === null ? 0.85 : ativa ? 1 : 0.18;
                        const w = ativa ? 4 : simAtiva && !foraSim ? 3.5 : 2;
                        return (
                          <path key={s.id} d={`M 0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`} fill="none" stroke={cor} strokeWidth={w} vectorEffect="non-scaling-stroke"
                            data-testid={`v4-aresta-${s.id}`}
                            style={{ opacity, cursor: "pointer", filter: ativa ? `drop-shadow(0 0 4px ${cor}) drop-shadow(0 0 9px ${cor})` : `drop-shadow(0 0 0.8px ${cor})`, transition: "opacity 70ms ease-out, stroke-width 70ms ease-out" }}
                            onMouseEnter={() => setHoveredId(s.id)} onMouseLeave={() => setHoveredId(null)} onClick={() => setSelectedId(s.id)} />
                        );
                      })}
                    </svg>
                  </div>

                  {/* COLUNA ESQUERDA: perguntas */}
                  <div className="absolute inset-y-0 left-0 z-10 w-[220px] border-r border-[var(--crn-border)] bg-[var(--crn-bg-panel)]/60 p-2 backdrop-blur-sm">
                    <div className="relative h-full">
                      {leftNodes.map((node) => {
                        const top = yEsq.get(node.id) ?? 0;
                        const destaque = filtradas.some((s) => (s.id === hoveredId || s.id === selectedId) && s.perguntaId === node.id);
                        const simulada = simulacao.includes(node.id);
                        return (
                          <div key={node.id} className="absolute flex w-full items-center pr-2" style={{ top, transform: "translateY(-50%)" }}
                            onDoubleClick={() => setIsolatedNode(node.id)} title={`${node.id} · ${node.texto}\nDuplo clique isola a vizinhança`}>
                            <div onClick={() => cliqueNo(node.id)} data-testid={`v4-no-pergunta-${node.id}`}
                              className={`flex h-7 flex-1 cursor-pointer items-stretch border transition-all ${simulada ? "border-[var(--crn-accent)] bg-[var(--crn-bg-row-hover)]" : destaque ? "border-[var(--crn-accent)] bg-[var(--crn-bg-row-hover)]" : "border-[var(--crn-border)] bg-[var(--crn-bg)] hover:border-[var(--crn-fg-dim)]"}`}>
                              <div className="w-2 flex-none" style={{ backgroundColor: corDoBloco(node.bloco) }} />
                              <div className="flex flex-1 items-center justify-between truncate px-1.5 py-0.5">
                                <div className="flex min-w-0 flex-col leading-tight">
                                  <span className="text-[8px] font-bold text-[var(--crn-fg-dim)]">{node.bloco} · {node.id}</span>
                                  <span className="truncate text-[10px] font-medium text-[var(--crn-fg)]">{node.texto}</span>
                                </div>
                                <span className="ml-1 border border-[var(--crn-border)] bg-[var(--crn-bg-row)] px-1 text-[9px] text-[var(--crn-fg-dim)]">{node.count}</span>
                              </div>
                            </div>
                            <div className="ml-1 h-1.5 w-1.5" style={{ backgroundColor: corDoBloco(node.bloco) }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* COLUNA DIREITA: saídas */}
                  <div className="absolute inset-y-0 right-0 z-10 w-[240px] border-l border-[var(--crn-border)] bg-[var(--crn-bg-panel)]/60 p-2 backdrop-blur-sm">
                    <div className="relative h-full">
                      {rightNodes.map((node) => {
                        const top = yDir.get(node.id) ?? 0;
                        const Ic = TipoIcon[node.tipo];
                        const destaque = filtradas.some((s) => (s.id === hoveredId || s.id === selectedId) && s.destinoChave === node.id);
                        const aceso = destinosAcesos.has(node.id);
                        return (
                          <div key={node.id} className="absolute flex w-full items-center pl-2" style={{ top, transform: "translateY(-50%)" }}
                            onDoubleClick={() => setIsolatedNode(node.id)} title={`${ROTULO_CAT[node.categoria]} · ${node.nome}\nDuplo clique isola a vizinhança`}>
                            <div className="mr-1 h-1.5 w-1.5" style={{ backgroundColor: TIPO_COR[node.tipo] }} />
                            <div data-testid={`v4-no-saida-${node.id}`}
                              className={`flex h-7 flex-1 cursor-pointer items-stretch border transition-all ${aceso ? "bg-[var(--crn-bg-row-hover)]" : destaque ? "border-[var(--crn-accent)] bg-[var(--crn-bg-row-hover)]" : "border-[var(--crn-border)] bg-[var(--crn-bg)] hover:border-[var(--crn-fg-dim)]"}`}
                              style={aceso ? { borderColor: TIPO_COR[node.tipo], boxShadow: `0 0 8px ${TIPO_COR[node.tipo]}88` } : undefined}>
                              <div className="flex w-6 flex-none items-center justify-center border-r border-[var(--crn-border)]" style={{ color: TIPO_COR[node.tipo] }}><Ic className="h-3 w-3" /></div>
                              <div className="flex flex-1 items-center justify-between truncate px-1.5 py-0.5">
                                <div className="flex min-w-0 flex-col leading-tight">
                                  <span className="text-[8px] font-bold text-[var(--crn-fg-dim)]">{ROTULO_CAT[node.categoria].toUpperCase()}</span>
                                  <span className="truncate text-[10px] font-medium text-[var(--crn-fg)]">{node.nome}</span>
                                </div>
                                <span className="ml-1 border border-[var(--crn-border)] bg-[var(--crn-bg-row)] px-1 text-[9px] text-[var(--crn-fg-dim)]">{node.count}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* DIVISOR */}
          <div onMouseDown={onSplitDown} className="group relative flex h-[6px] flex-none cursor-row-resize items-center justify-center bg-[var(--crn-border)] hover:bg-[var(--crn-accent-strong)]" title="Arraste para ajustar a divisão" data-testid="v4-divisor">
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-60 group-hover:opacity-100" onMouseDown={(e) => e.stopPropagation()}>
              <button onClick={() => expandirPainel("GRAFO")} className="flex h-[14px] items-center gap-0.5 border border-[var(--crn-border-strong)] bg-[var(--crn-bg-panel)] px-1.5 text-[8px] text-[var(--crn-fg-muted)] hover:text-[var(--crn-fg)]" title="Expandir grafo (clique = 80% · novo clique = 50%)"><Maximize2 className="h-2.5 w-2.5" /> GRAFO</button>
              <button onClick={() => expandirPainel("RESET")} className="h-[14px] border border-[var(--crn-border-strong)] bg-[var(--crn-bg-panel)] px-1.5 text-[8px] text-[var(--crn-fg-muted)] hover:text-[var(--crn-fg)]" title="50/50 neutro">50/50</button>
              <button onClick={() => expandirPainel("MATRIZ")} className="flex h-[14px] items-center gap-0.5 border border-[var(--crn-border-strong)] bg-[var(--crn-bg-panel)] px-1.5 text-[8px] text-[var(--crn-fg-muted)] hover:text-[var(--crn-fg)]" title="Expandir matriz (clique = 80% · novo clique = 50%)"><Maximize2 className="h-2.5 w-2.5" /> MATRIZ</button>
            </div>
            <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[8px] text-[var(--crn-fg-dim)]">{Math.round(splitPct)}% / {Math.round(100 - splitPct)}%</div>
          </div>

          {/* MATRIZ-ESPELHO */}
          <div className="min-h-0 flex-1 overflow-auto bg-[var(--crn-bg)]" style={{ height: `${100 - splitPct}%` }} data-testid="v4-matriz">
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--crn-border)] bg-[var(--crn-bg-panel)] px-3 py-1.5">
              <span className="text-[9px] uppercase tracking-wider text-[var(--crn-fg-dim)]">MATRIZ-ESPELHO · {filtradas.length} ligações · sincronizada com o grafo acima</span>
              <span className="text-[9px] text-[var(--crn-fg-dim)]">{selectedId !== null ? `ligação #${selectedId} selecionada` : "clique numa aresta ou linha"}</span>
            </div>
            <table className="w-full whitespace-nowrap text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead className="sticky top-[28px] z-10 bg-[var(--crn-bg-panel)] text-[9px] uppercase tracking-wider text-[var(--crn-fg-dim)] shadow-[0_1px_0_var(--crn-border)]">
                <tr>
                  <th className="w-8 px-2 py-1.5 text-center" title="Marcar (visual, não grava)">✓</th>
                  <th className="w-14 px-2 py-1.5">BLOCO</th>
                  <th className="w-16 px-2 py-1.5">CÓDIGO</th>
                  <th className="w-[240px] px-2 py-1.5">SINAL DE ANAMNESE</th>
                  <th className="w-28 px-2 py-1.5">TIPO</th>
                  <th className="w-[240px] px-2 py-1.5">SAÍDA</th>
                  <th className="w-20 px-2 py-1.5">ESTADO</th>
                  <th className="w-24 px-2 py-1.5">ORIGEM</th>
                </tr>
              </thead>
              <tbody className="text-[10px]">
                {filtradas.map((s, idx) => {
                  const Ic = TipoIcon[s.tipo];
                  const cor = corDoBloco(s.bloco);
                  const sel = s.id === selectedId; const hov = s.id === hoveredId;
                  return (
                    <tr key={s.id} ref={(el) => { if (el) tableRowRefs.current.set(s.id, el); }}
                      onMouseEnter={() => setHoveredId(s.id)} onMouseLeave={() => setHoveredId(null)} onClick={() => setSelectedId(s.id)}
                      data-testid={`v4-linha-${s.id}`}
                      className={`cursor-pointer ${sel ? "bg-[var(--crn-bg-row-hover)]" : idx % 2 === 0 ? "bg-[var(--crn-bg-row)]" : "bg-[var(--crn-bg-row-alt)]"}`}
                      style={{ boxShadow: hov || sel ? `0 0 0 1px ${cor}, 0 0 8px ${cor}cc, 0 0 18px ${cor}55` : marcadas.has(s.id) ? `inset 3px 0 0 ${cor}` : "none", transition: "box-shadow 70ms ease-out, background-color 70ms ease-out" }}>
                      <td className="px-2 py-1 text-center">
                        <button onClick={(e) => { e.stopPropagation(); toggleMarcada(s.id); }} aria-label={marcadas.has(s.id) ? "Desmarcar" : "Marcar"} aria-pressed={marcadas.has(s.id)}
                          className={`inline-flex h-3.5 w-3.5 items-center justify-center border ${marcadas.has(s.id) ? "text-white" : "text-transparent hover:text-[var(--crn-fg-dim)]"}`}
                          style={{ borderColor: marcadas.has(s.id) ? cor : "var(--crn-border-strong)", backgroundColor: marcadas.has(s.id) ? cor : "transparent" }}>
                          <span className="text-[9px] leading-none">✓</span>
                        </button>
                      </td>
                      <td className="px-2 py-1"><span className="inline-flex border px-1.5 py-0.5 text-[8px] font-bold tracking-widest" style={{ color: cor, borderColor: `${cor}`, backgroundColor: "transparent" }}>{s.bloco}</span></td>
                      <td className="px-2 py-1 font-mono text-[var(--crn-fg-muted)]">{s.perguntaId}</td>
                      <td className="max-w-[240px] truncate px-2 py-1" title={s.pergunta}>{s.pergunta}</td>
                      <td className="px-2 py-1"><div className="flex items-center gap-1" style={{ color: TIPO_COR[s.tipo] }}><Ic className="h-3 w-3" /><span className="text-[9px] font-semibold">{ROTULO_CAT[s.categoria].toUpperCase()}</span></div></td>
                      <td className="max-w-[240px] truncate px-2 py-1 text-[var(--crn-accent)]" title={s.destinoNome}>{s.destinoNome}</td>
                      <td className="px-2 py-1"><div className="flex items-center gap-1"><div className="h-1.5 w-1.5" style={{ backgroundColor: "var(--crn-estado-ativo)" }} /><span className="text-[9px]" style={{ color: "var(--crn-estado-ativo)" }}>ATIVA</span></div></td>
                      <td className="px-2 py-1 text-[9px] text-[var(--crn-fg-dim)]">{s.cloneDe ? `cópia de #${s.cloneDe}` : "cadastro"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* INSPETOR */}
        {!inspectorCollapsed && <div onMouseDown={onInspectorDown} className="w-[4px] flex-none cursor-col-resize bg-[var(--crn-border)] hover:bg-[var(--crn-accent-strong)]" title="Arraste para redimensionar o inspetor" data-testid="v4-inspetor-divisor" />}
        <aside className="flex flex-none flex-col overflow-hidden border-l border-[var(--crn-border)] bg-[var(--crn-bg-panel)] transition-[width] duration-150" style={{ width: inspectorCollapsed ? 24 : inspectorW }} data-testid="v4-inspetor">
          <div className="flex h-9 items-center justify-between border-b border-[var(--crn-border)] px-2">
            <button onClick={() => setInspectorCollapsed(!inspectorCollapsed)} className="text-[var(--crn-fg-dim)] hover:text-[var(--crn-fg)]" title={inspectorCollapsed ? "Expandir inspetor" : "Recolher inspetor"} data-testid="v4-inspetor-toggle">
              {inspectorCollapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {!inspectorCollapsed && (<><h2 className="text-[11px] font-semibold text-[var(--crn-fg)]">INSPETOR</h2>{selecionada && <span className="text-[9px] text-[var(--crn-fg-dim)]">#{selecionada.id}</span>}</>)}
          </div>
          {!inspectorCollapsed && (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
              {selecionada ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[8px] uppercase text-[var(--crn-fg-dim)]">Pergunta da anamnese</span>
                      <span className="truncate text-[12px] font-bold tracking-wider text-[var(--crn-accent)]" title={selecionada.perguntaId}>{selecionada.perguntaId}</span>
                    </div>
                    <div className="whitespace-nowrap border px-1.5 py-0.5 text-[9px] font-bold" style={{ borderColor: "var(--crn-estado-ativo)", color: "var(--crn-estado-ativo)" }}>ATIVA</div>
                  </div>
                  <div className="flex flex-col gap-2 border border-[var(--crn-border)] bg-[var(--crn-bg)] p-2">
                    <div>
                      <span className="mb-0.5 block text-[8px] font-bold uppercase text-[var(--crn-fg-dim)]">Genótipo (sinal)</span>
                      <div className="flex items-start gap-2">
                        <div className="px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ backgroundColor: corDoBloco(selecionada.bloco) }}>{selecionada.bloco}</div>
                        <span className="text-[10px] text-[var(--crn-fg)]">{selecionada.pergunta}</span>
                      </div>
                    </div>
                    <div className="h-px bg-[var(--crn-border)]" />
                    <div>
                      <span className="mb-0.5 block text-[8px] font-bold uppercase text-[var(--crn-fg-dim)]">Fenótipo (saída)</span>
                      <div className="flex items-start gap-2">
                        <div className="flex items-center gap-1 border px-1.5 py-0.5 text-[9px] font-bold" style={{ color: TIPO_COR[selecionada.tipo], borderColor: TIPO_COR[selecionada.tipo] }}>
                          {React.createElement(TipoIcon[selecionada.tipo], { className: "w-3 h-3" })}{ROTULO_CAT[selecionada.categoria].toUpperCase()}
                        </div>
                        <span className="text-[10px] font-medium text-[var(--crn-fg)]">{selecionada.destinoNome}</span>
                      </div>
                      {selecionada.destinoDetalhe && <span className="mt-1 block text-[9px] text-[var(--crn-fg-dim)]">{selecionada.destinoDetalhe}</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Box label="ORIGEM" value={selecionada.cloneDe ? `cópia de #${selecionada.cloneDe}` : "cadastro direto"} />
                    <Box label="LIGAÇÕES DA PERGUNTA" value={String(linhas.filter((l) => l.perguntaId === selecionada.perguntaId).length)} />
                  </div>
                  <p className="text-[9px] leading-relaxed text-[var(--crn-fg-dim)]">Peso, governança, acertos em 30 dias e última edição ainda não existem no banco e por isso não aparecem aqui.</p>
                  <button disabled className="flex h-7 items-center justify-center gap-1.5 border border-[var(--crn-border)] bg-[var(--crn-bg-row)] text-[10px] text-[var(--crn-fg)] opacity-40" title="O histórico de alterações ainda não é registrado">
                    <History className="h-3 w-3" /> HISTÓRICO INDISPONÍVEL
                  </button>
                  <div className="mt-1 flex flex-col gap-1">
                    <button disabled={modo !== "EDICAO" || desativar.isPending} data-testid="v4-excluir"
                      onClick={() => {
                        if (armada === selecionada.id) { setArmada(null); desativar.mutate(selecionada.id); }
                        else { setArmada(selecionada.id); window.setTimeout(() => setArmada((a) => (a === selecionada.id ? null : a)), 4000); }
                      }}
                      title={modo !== "EDICAO" ? "Ative o modo EDIÇÃO (tecla E)" : "Desativa a ligação; nada é apagado"}
                      className="flex h-7 items-center justify-center gap-1.5 border border-[var(--crn-border)] bg-[var(--crn-bg-row)] text-[10px] text-[var(--crn-fg)] hover:bg-red-900/30 hover:text-red-400 disabled:opacity-40">
                      {armada === selecionada.id ? <><Unlock className="h-3 w-3" /> CONFIRMAR DESATIVAÇÃO</> : <><Lock className="h-3 w-3" /> DESATIVAR LIGAÇÃO</>}
                    </button>
                    <button disabled className="flex h-7 items-center justify-center gap-1.5 border border-[var(--crn-border)] bg-[var(--crn-bg-row)] text-[10px] text-[var(--crn-fg-dim)] opacity-40" title="Para copiar ligações use a tela Sinapses Clínicas (Alt + arrastar ou Ctrl+C / Ctrl+V)">
                      <Copy className="h-3 w-3" /> DUPLICAR (use Sinapses Clínicas)
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-[var(--crn-fg-dim)]">
                  <Activity className="h-6 w-6 opacity-40" />
                  <p className="text-[10px] leading-relaxed">Clique numa aresta do grafo ou numa linha da matriz para inspecionar.<br /><span className="opacity-70">Duplo clique num nó isola a vizinhança.</span></p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* RODAPÉ */}
      <footer className="flex h-7 flex-none items-center justify-between border-t border-[var(--crn-border)] bg-[var(--crn-bg-panel)] px-3 text-[9px] text-[var(--crn-fg-dim)]">
        <span>cor da linha = bloco da pergunta · {data.injetaveisSemVia} injetáveis sem via cadastrada não entram em IM/SC/EV</span>
        <span className="flex items-center gap-2">
          <Kbd>V</Kbd><Kbd>E</Kbd><Kbd>S</Kbd><span>modo</span><span className="mx-1">·</span><Kbd>?</Kbd><span>atalhos</span><span className="mx-1">·</span><Kbd>Esc</Kbd><span>limpar</span>
        </span>
      </footer>

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowShortcuts(false)}>
          <div className="w-[420px] max-w-[92vw] border border-[var(--crn-accent)] bg-[var(--crn-bg-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between"><h3 className="craniotomia-serif text-sm text-[var(--crn-accent)]">ATALHOS</h3><button onClick={() => setShowShortcuts(false)} aria-label="Fechar"><X className="h-4 w-4" /></button></div>
            <ul className="space-y-1 text-[10px]">
              <li><Kbd>V</Kbd> visualização · <Kbd>E</Kbd> edição · <Kbd>S</Kbd> simulação</li>
              <li><Kbd>Esc</Kbd> sai do isolamento, limpa simulação e fecha este painel</li>
              <li>Duplo clique num nó: isola a vizinhança</li>
              <li>Clique numa aresta ou linha: seleciona a mesma ligação</li>
              <li>Caixa ✓: marca a ligação (diferente de selecionar)</li>
            </ul>
          </div>
        </div>
      )}

      {novaAberta && (
        <NovaSinapse data={data} salvando={criar.isPending} onFechar={() => setNovaAberta(false)}
          onSalvar={(v) => criar.mutate(v)} />
      )}
    </div>
  );
}

function NovaSinapse({ data, salvando, onFechar, onSalvar }: {
  data: Painel; salvando: boolean; onFechar: () => void;
  onSalvar: (v: { perguntaId: string; categoria: Categoria; destinoTipo: string; destinoId: number }) => void;
}) {
  const [qp, setQp] = useState(""); const [qd, setQd] = useState("");
  const [pergunta, setPergunta] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<Categoria>("EXAME");
  const [destino, setDestino] = useState<Destino | null>(null);
  const perguntas = useMemo(() => {
    const t = semAcento(qp.trim());
    return data.perguntas.filter((p) => !t || semAcento(`${p.perguntaId} ${p.pergunta}`).includes(t)).slice(0, 8);
  }, [data, qp]);
  const destinos = useMemo(() => {
    const t = semAcento(qd.trim());
    return data.destinos[categoria].filter((d) => !t || semAcento(d.nome).includes(t)).slice(0, 8);
  }, [data, qd, categoria]);
  const perg = data.perguntas.find((p) => p.perguntaId === pergunta);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onFechar}>
      <div className="flex max-h-[88vh] w-[560px] max-w-[94vw] flex-col border border-[var(--crn-accent)] bg-[var(--crn-bg-panel)]" onClick={(e) => e.stopPropagation()} data-testid="v4-dialogo-nova">
        <div className="flex h-10 items-center justify-between border-b border-[var(--crn-border)] px-3">
          <h3 className="craniotomia-serif text-sm text-[var(--crn-accent)]">NOVA SINAPSE</h3>
          <button onClick={onFechar} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-3 text-[10px]">
          <div>
            <span className="mb-1 block font-bold uppercase text-[var(--crn-fg-dim)]">1. Pergunta da anamnese {perg && <span className="text-[var(--crn-accent)]">— {perg.perguntaId}</span>}</span>
            <input value={qp} onChange={(e) => setQp(e.target.value)} placeholder="Buscar pergunta..." className="mb-1 h-7 w-full border border-[var(--crn-border)] bg-[var(--crn-bg)] px-2 outline-none" />
            {perguntas.map((p) => (
              <button key={p.perguntaId} onClick={() => setPergunta(p.perguntaId)} className={`block w-full truncate border px-2 py-1 text-left ${pergunta === p.perguntaId ? "border-[var(--crn-accent)] bg-[var(--crn-bg-row-hover)]" : "border-[var(--crn-border)] hover:bg-[var(--crn-bg-row)]"}`}>
                <span className="mr-2 font-mono text-[var(--crn-fg-dim)]">{p.perguntaId}</span>{p.pergunta}
              </button>
            ))}
          </div>
          <div>
            <span className="mb-1 block font-bold uppercase text-[var(--crn-fg-dim)]">2. Tipo de saída</span>
            <div className="flex flex-wrap gap-1">
              {CATEGORIAS.map((c) => (
                <button key={c} onClick={() => { setCategoria(c); setDestino(null); }} className={`border px-2 py-1 ${categoria === c ? "border-[var(--crn-accent)] bg-[var(--crn-bg-row-hover)]" : "border-[var(--crn-border)]"}`}>{ROTULO_CAT[c]}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block font-bold uppercase text-[var(--crn-fg-dim)]">3. Saída {destino && <span className="text-[var(--crn-accent)]">— {destino.nome}</span>}</span>
            <input value={qd} onChange={(e) => setQd(e.target.value)} placeholder="Buscar saída..." className="mb-1 h-7 w-full border border-[var(--crn-border)] bg-[var(--crn-bg)] px-2 outline-none" />
            {destinos.length === 0 && <p className="text-[var(--crn-fg-dim)]">Nada encontrado para esta saída.</p>}
            {destinos.map((d) => (
              <button key={`${d.tipo}-${d.id}`} onClick={() => setDestino(d)} className={`block w-full truncate border px-2 py-1 text-left ${destino?.id === d.id && destino.tipo === d.tipo ? "border-[var(--crn-accent)] bg-[var(--crn-bg-row-hover)]" : "border-[var(--crn-border)] hover:bg-[var(--crn-bg-row)]"}`}>{d.nome}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--crn-border)] p-3">
          <button onClick={onFechar} className="h-7 border border-[var(--crn-border-strong)] px-3">CANCELAR</button>
          <button disabled={!pergunta || !destino || salvando} data-testid="v4-salvar-nova"
            onClick={() => pergunta && destino && onSalvar({ perguntaId: pergunta, categoria, destinoTipo: destino.tipo, destinoId: destino.id })}
            className="h-7 px-3 text-white disabled:opacity-40" style={{ backgroundColor: "#0e7490" }}>{salvando ? "SALVANDO..." : "SALVAR LIGAÇÃO"}</button>
        </div>
      </div>
    </div>
  );
}

function ModoBtn({ icon: Ic, label, hint, active, onClick, accent, testid }: { icon: React.ElementType; label: string; hint: string; active: boolean; onClick: () => void; accent?: string; testid: string }) {
  return (
    <button onClick={onClick} aria-pressed={active} data-testid={testid}
      className={`flex h-7 items-center gap-1.5 border-r border-[var(--crn-border-strong)] px-3 text-[10px] font-bold last:border-r-0 ${active ? "text-white" : "text-[var(--crn-fg-muted)] hover:text-[var(--crn-fg)]"}`}
      style={{ backgroundColor: active ? accent ?? "var(--crn-border-strong)" : "transparent" }}>
      <Ic className="h-3 w-3" />{label}<kbd className="ml-1 border border-[var(--crn-border-strong)] px-1 text-[8px] font-normal opacity-70">{hint}</kbd>
    </button>
  );
}
function KpiPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 border border-[var(--crn-border)] bg-[var(--crn-bg)] px-2 py-0.5">
      <span className="text-[8px] uppercase tracking-wider text-[var(--crn-fg-dim)]">{label}</span>
      <span className="font-mono text-[11px] font-bold" style={{ color: color ?? "var(--crn-fg)" }}>{value}</span>
    </div>
  );
}
function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--crn-border)] bg-[var(--crn-bg)] p-1.5">
      <span className="block text-[8px] uppercase text-[var(--crn-fg-dim)]">{label}</span>
      <span className="text-[10px] font-bold text-[var(--crn-fg)]">{value}</span>
    </div>
  );
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="border border-[var(--crn-border-strong)] bg-[var(--crn-border)] px-1 font-sans text-[var(--crn-fg)]">{children}</kbd>;
}
