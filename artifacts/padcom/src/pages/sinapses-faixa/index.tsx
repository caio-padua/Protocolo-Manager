import "../matriz-fornecedores/matriz.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Lock, Unlock, Search, Pencil, Play, Eye, AlertTriangle } from "lucide-react";

// ============================================================================
// SINAPSES CLINICAS - modelo "Faixa": blocos de dendritos (codigos) nas pontas,
// fios no centro e sanfona vertical com as correspondencias de cada pergunta.
// Dados reais (GET /api/cadastros/sinapses/painel). Excluir = desativar.
// Simulacao nao grava nada. Nao toca o Cockpit nem o motor.
// ============================================================================

type Categoria = "EXAME" | "PRESCRICAO" | "INJETAVEL_IM" | "INJETAVEL_SC" | "INJETAVEL_EV" | "IMPLANTE";
type Modo = "VISUALIZACAO" | "EDICAO" | "SIMULACAO";
const CATEGORIAS: Array<{ chave: Categoria; rotulo: string; sigla: string; cor: string }> = [
  { chave: "EXAME", rotulo: "Exames", sigla: "EXA", cor: "#2563eb" },
  { chave: "PRESCRICAO", rotulo: "Prescrições", sigla: "FOR", cor: "#7c3aed" },
  { chave: "INJETAVEL_IM", rotulo: "Injetáveis IM", sigla: "IM", cor: "#ea580c" },
  { chave: "INJETAVEL_SC", rotulo: "Injetáveis SC", sigla: "SC", cor: "#0d9488" },
  { chave: "INJETAVEL_EV", rotulo: "Injetáveis EV", sigla: "EV", cor: "#dc2626" },
  { chave: "IMPLANTE", rotulo: "Implantes", sigla: "IMP", cor: "#ca8a04" },
];
const COR = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, c.cor])) as Record<Categoria, string>;
const ROTULO = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, c.rotulo])) as Record<Categoria, string>;
const SIGLA = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, c.sigla])) as Record<Categoria, string>;
const ROW_H = 24;

interface Pergunta { perguntaId: string; pergunta: string; bloco: string | null; eSinalAlarme: boolean }
interface Destino { tipo: string; id: number; nome: string; detalhe?: string | null; incompleto?: boolean }
interface Sinapse { id: number; perguntaId: string; categoria: Categoria; destinoTipo: string; destinoId: number; cloneDe: number | null }
interface Painel { perguntas: Pergunta[]; destinos: Record<Categoria, Destino[]>; injetaveisSemVia: number; sinapses: Sinapse[] }

const chave = (c: Categoria, tipo: string, id: number) => `${c}|${tipo}|${id}`;
const codigoDestino = (c: Categoria, tipo: string, id: number) => `${tipo === "bloco_exames" ? "BLK" : SIGLA[c]}-${id}`;
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const emCampo = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

function Faixa({ titulo, aberta, onToggle, direita, children, testid }: { titulo: string; aberta: boolean; onToggle: () => void; direita?: React.ReactNode; children: React.ReactNode; testid: string }) {
  return (
    <section className="panel-3d-sub p-2" data-testid={testid}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggle} aria-expanded={aberta} className="tecla-3d flex flex-1 items-center gap-2 px-3 py-1 text-left" data-testid={`${testid}-toggle`}>
          {aberta ? <ChevronDown className="h-4 w-4 opacity-70" /> : <ChevronRight className="h-4 w-4 opacity-70" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary/80">{titulo}</span>
        </button>
        {direita}
      </div>
      {aberta && <div className="mt-2">{children}</div>}
    </section>
  );
}

export default function SinapsesFaixa() {
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

  const [modo, setModo] = useState<Modo>("VISUALIZACAO");
  const [busca, setBusca] = useState("");
  const [cats, setCats] = useState<Categoria[]>([]);
  const [todos, setTodos] = useState(true);
  const [faixaAberta, setFaixaAberta] = useState(true);
  const [sanfonaAberta, setSanfonaAberta] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string[]>([]);
  const [ancora, setAncora] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [copia, setCopia] = useState<number[]>([]);
  const [armadas, setArmadas] = useState<Set<number>>(new Set());
  const [arraste, setArraste] = useState<{ de: string; x0: number; y0: number; x: number; y: number; clonar: boolean } | null>(null);
  const arrasteRef = useRef(arraste);
  arrasteRef.current = arraste;

  const invalidar = () => qc.invalidateQueries({ queryKey: ["/api/cadastros/sinapses/painel"] });
  const enviar = async (url: string, method: string, body: unknown) => {
    const r = await fetch(url, { method, headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error ?? "Não foi possível salvar");
    }
    return r.json();
  };
  const onErro = (e: Error) => toast({ title: "Não foi salvo", description: e.message, variant: "destructive" });
  const criar = useMutation({
    mutationFn: (v: { perguntaId: string; categoria: Categoria; destinoTipo: string; destinoId: number }) => enviar("/api/cadastros/sinapses", "POST", v),
    onSuccess: () => { invalidar(); toast({ title: "Ligação salva" }); },
    onError: onErro,
  });
  const clonar = useMutation({
    mutationFn: (v: { perguntaOrigemId?: string; sinapseIds?: number[]; perguntaDestinoId: string }) => enviar("/api/cadastros/sinapses/clonar", "POST", v),
    onSuccess: (r: { copiadas: number }) => { invalidar(); toast({ title: `${r.copiadas} ligação(ões) copiada(s)`, description: "As originais não foram alteradas." }); },
    onError: onErro,
  });
  const desativar = useMutation({
    mutationFn: (id: number) => enviar(`/api/cadastros/sinapses/${id}/ativo`, "PATCH", { ativo: false }),
    onSuccess: () => { invalidar(); toast({ title: "Ligação desativada", description: "Nada foi apagado: ela só deixou de valer." }); },
    onError: onErro,
  });

  const nomeDe = useMemo(() => {
    const m = new Map<string, Destino>();
    for (const c of CATEGORIAS) for (const d of data?.destinos[c.chave] ?? []) m.set(chave(c.chave, d.tipo, d.id), d);
    return m;
  }, [data]);
  const porPergunta = useMemo(() => {
    const m = new Map<string, Sinapse[]>();
    for (const s of data?.sinapses ?? []) {
      if (cats.length && !cats.includes(s.categoria)) continue;
      const a = m.get(s.perguntaId); if (a) a.push(s); else m.set(s.perguntaId, [s]);
    }
    return m;
  }, [data, cats]);

  const q = semAcento(busca.trim());
  // Esquerda: na EDICAO todas as perguntas (para ligar); nos demais modos so as que tem ligacao.
  const esquerda = useMemo(() => {
    return (data?.perguntas ?? []).filter((p) => {
      const lig = porPergunta.get(p.perguntaId) ?? [];
      if (!todos && modo !== "EDICAO" && lig.length === 0) return false;
      if (!q) return true;
      return semAcento(`${p.perguntaId} ${p.pergunta} ${p.bloco ?? ""}`).includes(q) || lig.some((s) => semAcento(nomeDe.get(chave(s.categoria, s.destinoTipo, s.destinoId))?.nome ?? "").includes(q));
    }).sort((a, b) => Number((porPergunta.get(b.perguntaId)?.length ?? 0) > 0) - Number((porPergunta.get(a.perguntaId)?.length ?? 0) > 0));
  }, [data, porPergunta, modo, q, nomeDe, todos]);

  // Direita: destinos ligados; na EDICAO com saida escolhida, o catalogo inteiro dela.
  const direita = useMemo(() => {
    const m = new Map<string, { k: string; cat: Categoria; tipo: string; id: number; nome: string; n: number }>();
    if (todos || modo === "EDICAO") {
      for (const c of (cats.length ? cats : CATEGORIAS.map((x) => x.chave))) for (const d of data?.destinos[c] ?? []) {
        if (q && !semAcento(d.nome).includes(q)) continue;
        m.set(chave(c, d.tipo, d.id), { k: chave(c, d.tipo, d.id), cat: c, tipo: d.tipo, id: d.id, nome: d.nome, n: 0 });
      }
    }
    const visiveis = new Set(esquerda.map((p) => p.perguntaId));
    porPergunta.forEach((lig, pid) => {
      if (!visiveis.has(pid)) return;
      for (const s of lig) {
        const k = chave(s.categoria, s.destinoTipo, s.destinoId);
        const e = m.get(k);
        if (e) e.n++; else m.set(k, { k, cat: s.categoria, tipo: s.destinoTipo, id: s.destinoId, nome: nomeDe.get(k)?.nome ?? `#${s.destinoId}`, n: 1 });
      }
    });
    return Array.from(m.values()).sort((a, b) => Number(b.n > 0) - Number(a.n > 0) || a.cat.localeCompare(b.cat) || a.nome.localeCompare(b.nome));
  }, [data, modo, cats, q, esquerda, porPergunta, nomeDe, todos]);

  const yE = useMemo(() => new Map(esquerda.map((p, i) => [p.perguntaId, (i + 0.5) * ROW_H])), [esquerda]);
  const yD = useMemo(() => new Map(direita.map((d, i) => [d.k, (i + 0.5) * ROW_H])), [direita]);
  const altura = Math.max(esquerda.length, direita.length, 1) * ROW_H;
  const fios = useMemo(() => esquerda.flatMap((p) => (porPergunta.get(p.perguntaId) ?? []).map((s) => ({ s, y1: yE.get(p.perguntaId)!, y2: yD.get(chave(s.categoria, s.destinoTipo, s.destinoId)) }))).filter((f) => f.y2 !== undefined), [esquerda, porPergunta, yE, yD]);

  const foco = hover ?? (sel.length === 1 ? sel[0] : null);
  const simAcesos = useMemo(() => {
    const set = new Set<string>();
    if (modo === "SIMULACAO") for (const pid of sel) for (const s of porPergunta.get(pid) ?? []) set.add(chave(s.categoria, s.destinoTipo, s.destinoId));
    return set;
  }, [modo, sel, porPergunta]);
  const resumoSim = useMemo(() => {
    const r = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, 0])) as Record<Categoria, number>;
    simAcesos.forEach((k) => { r[k.split("|")[0] as Categoria] += 1; });
    return r;
  }, [simAcesos]);

  // ---- selecao (clique, Ctrl, Shift) ----
  const clicar = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey && ancora) {
      const ordem = esquerda.map((p) => p.perguntaId);
      const a = ordem.indexOf(ancora), b = ordem.indexOf(id);
      if (a >= 0 && b >= 0) { const [i, j] = a < b ? [a, b] : [b, a]; setSel(ordem.slice(i, j + 1)); return; }
    }
    setAncora(id);
    if (e.ctrlKey || e.metaKey || modo === "SIMULACAO") { setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); return; }
    setSel((s) => (s.length === 1 && s[0] === id ? [] : [id]));
  };
  const alternarAberto = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const copiar = useCallback(() => {
    const ids = sel.flatMap((p) => (data?.sinapses ?? []).filter((s) => s.perguntaId === p).map((s) => s.id));
    setCopia(ids);
    toast({ title: ids.length ? `${ids.length} ligação(ões) copiada(s)` : "Nada para copiar", description: ids.length ? "Selecione outras perguntas e use Ctrl+V." : undefined });
  }, [sel, data, toast]);
  const colar = useCallback(() => {
    if (!copia.length) { toast({ title: "Nada copiado ainda" }); return; }
    for (const pid of sel) clonar.mutate({ sinapseIds: copia, perguntaDestinoId: pid });
  }, [copia, sel, clonar, toast]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (emCampo(e.target)) return;
      const t = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && t === "c" && modo === "EDICAO") { e.preventDefault(); copiar(); return; }
      if ((e.ctrlKey || e.metaKey) && t === "v" && modo === "EDICAO") { e.preventDefault(); colar(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t === "v") setModo("VISUALIZACAO");
      if (t === "e") setModo("EDICAO");
      if (t === "s") setModo("SIMULACAO");
      if (t === "escape") { setSel([]); setArraste(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [modo, copiar, colar]);

  // ---- puxar o fio ----
  useEffect(() => {
    if (!arraste) return;
    const mover = (e: PointerEvent) => setArraste((a) => (a ? { ...a, x: e.clientX, y: e.clientY } : a));
    const soltar = (e: PointerEvent) => {
      const a = arrasteRef.current;
      setArraste(null);
      if (!a) return;
      const alvo = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (a.clonar) {
        const destino = (alvo?.closest("[data-pergunta]") as HTMLElement | null)?.dataset.pergunta;
        if (destino && destino !== a.de) clonar.mutate({ perguntaOrigemId: a.de, perguntaDestinoId: destino });
        return;
      }
      const d = (alvo?.closest("[data-dest]") as HTMLElement | null)?.dataset.dest;
      if (!d) return;
      const [categoria, destinoTipo, id] = d.split("|");
      const origens = sel.includes(a.de) && sel.length > 1 ? sel : [a.de];
      for (const perguntaId of origens) criar.mutate({ perguntaId, categoria: categoria as Categoria, destinoTipo, destinoId: Number(id) });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!arraste]);
  const iniciar = (e: React.PointerEvent, de: string) => {
    if (modo !== "EDICAO") return;
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setArraste({ de, x0: r.left + r.width / 2, y0: r.top + r.height / 2, x: e.clientX, y: e.clientY, clonar: e.altKey });
  };

  const cliqueExcluir = (id: number) => {
    if (armadas.has(id)) { setArmadas((s) => { const n = new Set(s); n.delete(id); return n; }); desativar.mutate(id); return; }
    setArmadas((s) => new Set(s).add(id));
    window.setTimeout(() => setArmadas((s) => { const n = new Set(s); n.delete(id); return n; }), 4000);
  };

  const total = data?.sinapses.length ?? 0;
  const ajuda =
    modo === "EDICAO"
      ? "Escolha uma saída (EXA, FOR, IM, SC, EV, IMP) para ver o catálogo e puxe o círculo da pergunta até o código da saída. Alt + soltar noutra pergunta copia as ligações. Ctrl+clique e Shift+clique selecionam várias; Ctrl+C e Ctrl+V copiam."
      : modo === "SIMULACAO"
        ? "Simulação, nada é gravado: marque perguntas como respondidas “sim” e veja quais saídas acenderiam."
        : "Clique num código para destacar os fios e abrir as correspondências na sanfona.";

  return (
    <div className="space-y-3" data-testid="pagina-sinapses-faixa">
      <section className="panel-3d-sub p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold uppercase tracking-widest text-primary">Sinapses Clínicas</h1>
            <p className="text-xs text-muted-foreground">Esquerda: códigos das perguntas. Direita: códigos das saídas. Passe o mouse numa linha para ver o texto completo. A pergunta é a ignição: clique nela para acender os fios até as saídas. Esta tela só cadastra ligações; não emite nem envia nada.</p>
          </div>
          <div className="mx-ev-g w-[26rem]" style={{ gridTemplateColumns: "repeat(3,1fr)" }} role="group" aria-label="Modo da tela">
            {([["VISUALIZACAO", "Visualização (V)", Eye], ["EDICAO", "Edição (E)", Pencil], ["SIMULACAO", "Simulação (S)", Play]] as const).map(([m, rot, Ic]) => (
              <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)} className={`evo-bevel mx-ev-b h40 ${modo === m ? "evo-bevel-ativo" : ""}`} data-testid={`faixa-modo-${m}`}>
                <Ic className="mr-1 inline h-4 w-4" />{rot}
              </button>
            ))}
          </div>
          <div className="screen-3d px-3 py-2 text-xs font-black tracking-wide" data-testid="faixa-contagem">{total} ligações ativas</div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, pergunta ou saída..." className="h-9 pl-9 field-engraved" data-testid="faixa-busca" />
          </div>
          {CATEGORIAS.map((c) => {
            const ativo = cats.includes(c.chave);
            return (
              <button key={c.chave} type="button" aria-pressed={ativo} title={c.rotulo} data-testid={`faixa-cat-${c.chave}`}
                onClick={() => setCats((s) => (ativo ? s.filter((x) => x !== c.chave) : [...s, c.chave]))}
                className={`evo-bevel px-3 py-1 text-[11px] font-black ${ativo ? "evo-bevel-ativo" : ""}`} style={{ color: ativo ? undefined : c.cor }}>{c.sigla}</button>
            );
          })}
          {cats.length > 0 && <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => setCats([])}>limpar saídas</button>}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="faixa-ajuda">{ajuda}</p>
        {modo === "SIMULACAO" && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 md:grid-cols-6" data-testid="faixa-resumo-simulacao">
            {CATEGORIAS.map((c) => (
              <div key={c.chave} className="concave-3d px-2 py-1 text-center text-[10px] font-bold uppercase" style={{ color: c.cor, opacity: resumoSim[c.chave] ? 1 : 0.45 }}>{c.sigla}: {resumoSim[c.chave]}</div>
            ))}
          </div>
        )}
      </section>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError || !data ? (
        <div className="panel-3d-sub p-6 text-sm text-red-600" data-testid="faixa-erro">
          Não foi possível carregar as sinapses. Isto não significa que não existam ligações.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>Tentar de novo</button>
        </div>
      ) : (
        <>
          <div className="panel-3d-sub flex flex-wrap items-center gap-3 px-3 py-2 text-[11px]" data-testid="faixa-conducao">
            <span className="font-bold uppercase tracking-wider text-primary/80">Condução</span>
            <span><b>{new Set(data.sinapses.map((x) => x.perguntaId)).size}</b> de <b>{data.perguntas.length}</b> perguntas têm saída ligada</span>
            <span>·</span>
            <span>Saídas ligadas: {CATEGORIAS.map((c) => `${c.sigla} ${new Set(data.sinapses.filter((x) => x.categoria === c.chave).map((x) => `${x.destinoTipo}${x.destinoId}`)).size}/${data.destinos[c.chave].length}`).join(" · ")}</span>
            <span className="text-muted-foreground">Círculo cheio = com condução. Círculo vazio = fio sem corrente (ainda sem par).</span>
            <button type="button" onClick={() => setTodos((v) => !v)} className="evo-bevel ml-auto px-2 py-1 text-[10px] font-bold" data-testid="faixa-todos">{todos ? "Mostrar só os ligados" : "Mostrar todos os terminais"}</button>
          </div>
          <Faixa testid="faixa-grafo" titulo={`Faixa da sinapse · ${esquerda.length} perguntas · ${direita.length} saídas`} aberta={faixaAberta} onToggle={() => setFaixaAberta((v) => !v)}>
            {esquerda.length === 0 && direita.length === 0 ? (
              <div className="concave-3d p-6 text-center text-sm text-muted-foreground" data-testid="faixa-vazio">
                {total === 0 ? "Ainda não há ligações ativas. Entre em Edição (E), escolha uma saída e puxe o fio da pergunta." : "Nada corresponde à busca ou aos filtros."}
              </div>
            ) : (
              <div className="concave-3d max-h-[26rem] overflow-y-auto">
                <div className="relative grid" style={{ gridTemplateColumns: "minmax(190px,30%) 1fr minmax(190px,30%)", height: altura }}>
                  {/* DENDRITOS ESQUERDA */}
                  <div className="relative border-r border-black/10">
                    {esquerda.map((p) => {
                      const n = porPergunta.get(p.perguntaId)?.length ?? 0;
                      const marcada = sel.includes(p.perguntaId);
                      return (
                        <div key={p.perguntaId} data-pergunta={p.perguntaId} className="absolute flex w-full items-center gap-1 px-1" style={{ top: (yE.get(p.perguntaId) ?? 0) - (ROW_H - 3) / 2, height: ROW_H - 3 }}
                          onMouseEnter={() => setHover(p.perguntaId)} onMouseLeave={() => setHover(null)} title={`${p.perguntaId} · ${p.pergunta}`}>
                          <button type="button" onClick={(e) => clicar(e, p.perguntaId)} data-testid={`faixa-dendrito-${p.perguntaId}`}
                            className={`tecla-3d flex h-full min-w-0 flex-1 items-center gap-1 px-1.5 text-left select-none ${marcada ? "evo-bevel-ativo" : ""}`}>
                            {p.eSinalAlarme && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />}
                            <span className="h-2 w-2 shrink-0 rounded-full" style={n ? { background: "#f59e0b", boxShadow: marcada || foco === p.perguntaId ? "0 0 6px 2px #fbbf24" : "0 0 2px #d9770688" } : { border: "1.5px solid #94a3b8", background: "transparent" }} title={n ? "Com condução" : "Sem condução: nenhuma saída ligada"} aria-hidden />
                            <span className="shrink-0 font-mono text-[10px] font-bold">{p.perguntaId}</span>
                            <span className="truncate text-[10px] opacity-80">{p.pergunta}</span>
                            <span className="ml-auto text-[9px] tabular-nums opacity-60">{n || ""}</span>
                          </button>
                          {modo === "EDICAO" && (
                            <button type="button" onPointerDown={(e) => iniciar(e, p.perguntaId)} onClick={(e) => e.stopPropagation()} data-testid={`faixa-porta-${p.perguntaId}`}
                              className="bevel-3d h-3.5 w-3.5 shrink-0 cursor-crosshair touch-none" style={{ borderRadius: 999 }} aria-label={`Ligar a pergunta ${p.perguntaId}`}
                              title="Puxe até uma saída. Alt: solte noutra pergunta para copiar." />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* FIOS */}
                  <svg className="h-full w-full" style={{ background: "#fff", backgroundImage: "linear-gradient(#f1f5f9 1px,transparent 1px),linear-gradient(90deg,#f1f5f9 1px,transparent 1px)", backgroundSize: "24px 24px" }} viewBox={`0 0 100 ${altura}`} preserveAspectRatio="none" aria-hidden>
                    {fios.map(({ s, y1, y2 }) => {
                      const em = foco === s.perguntaId || (modo === "SIMULACAO" && sel.includes(s.perguntaId));
                      const apagado = (foco !== null || (modo === "SIMULACAO" && sel.length > 0)) && !em;
                      return (
                        <path key={s.id} d={`M 0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`} fill="none" stroke={COR[s.categoria]} strokeWidth={em ? 3.5 : 1.3} vectorEffect="non-scaling-stroke"
                          style={{ opacity: apagado ? 0.1 : 0.9, filter: em ? `drop-shadow(0 0 3px ${COR[s.categoria]})` : undefined }} data-testid={`faixa-fio-${s.id}`} />
                      );
                    })}
                  </svg>
                  {/* DENDRITOS DIREITA */}
                  <div className="relative border-l border-black/10">
                    {direita.map((d) => {
                      const aceso = simAcesos.has(d.k) || (foco !== null && (porPergunta.get(foco) ?? []).some((s) => chave(s.categoria, s.destinoTipo, s.destinoId) === d.k));
                      const apagado = modo === "SIMULACAO" && sel.length > 0 && !aceso;
                      return (
                        <div key={d.k} data-dest={d.k} className={`absolute flex w-full items-center gap-1 px-1 ${apagado ? "opacity-35" : !d.n && modo !== "EDICAO" ? "opacity-60" : ""}`} style={{ top: (yD.get(d.k) ?? 0) - (ROW_H - 3) / 2, height: ROW_H - 3 }}
                          title={`${ROTULO[d.cat]} · ${d.nome}`} data-testid={`faixa-saida-${d.k}`}>
                          <div className="tecla-3d flex h-full min-w-0 flex-1 items-center gap-1.5 px-1.5" style={aceso ? { boxShadow: `inset 3px 0 0 ${COR[d.cat]}` } : undefined}>
                            <span className="h-2 w-2 shrink-0 rounded-full" style={d.n ? { background: COR[d.cat] } : { border: `1.5px solid ${COR[d.cat]}`, background: "transparent" }} title={d.n ? "Com condução" : "Sem condução: nenhuma pergunta ligada"} aria-hidden />
                            <span className="shrink-0 font-mono text-[10px] font-bold" style={{ color: COR[d.cat] }}>{codigoDestino(d.cat, d.tipo, d.id)}</span>
                            <span className="truncate text-[10px] opacity-80">{d.nome}</span>
                            <span className="ml-auto text-[9px] tabular-nums opacity-60">{d.n || ""}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Faixa>

          <Faixa testid="faixa-sanfona" titulo={`Sanfona das correspondências · ${esquerda.length} perguntas`} aberta={sanfonaAberta} onToggle={() => setSanfonaAberta((v) => !v)}
            direita={sanfonaAberta ? (
              <div className="flex gap-1">
                <button type="button" className="evo-bevel px-2 py-1 text-[10px] font-bold" onClick={() => setAbertos(new Set(esquerda.map((p) => p.perguntaId)))}>Abrir todas</button>
                <button type="button" className="evo-bevel px-2 py-1 text-[10px] font-bold" onClick={() => setAbertos(new Set())}>Recolher todas</button>
              </div>
            ) : null}>
            <div className="concave-3d max-h-[28rem] overflow-y-auto">
              {esquerda.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma pergunta para mostrar.</div>}
              {esquerda.map((p, i) => {
                const lig = porPergunta.get(p.perguntaId) ?? [];
                const aberto = abertos.has(p.perguntaId);
                const marcada = sel.includes(p.perguntaId);
                return (
                  <div key={p.perguntaId} data-testid={`faixa-item-${p.perguntaId}`}
                    style={{ background: marcada ? "rgba(217,119,6,0.16)" : i % 2 === 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)" }}
                    onMouseEnter={() => setHover(p.perguntaId)} onMouseLeave={() => setHover(null)}>
                    <button type="button" aria-expanded={aberto} onClick={(e) => { clicar(e, p.perguntaId); alternarAberto(p.perguntaId); }} className="flex w-full items-center gap-3 px-3 py-1.5 text-left">
                      {aberto ? <ChevronDown className="h-4 w-4 shrink-0 opacity-60" /> : <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />}
                      <span className="w-24 shrink-0 font-mono text-[11px] font-bold text-[#5b6578]">{p.perguntaId}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1b2433]">{p.pergunta}</span>
                      {p.bloco && <span className="hidden shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground md:inline">{p.bloco}</span>}
                      <span className="concave-3d flex h-6 min-w-8 shrink-0 items-center justify-center px-1 text-[10px] font-bold tabular-nums">{lig.length}</span>
                    </button>
                    {aberto && (
                      <div className="space-y-1.5 px-10 pb-2.5">
                        {lig.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma correspondência ativa para esta pergunta.</div>}
                        {CATEGORIAS.map((c) => {
                          const itens = lig.filter((s) => s.categoria === c.chave);
                          if (!itens.length) return null;
                          return (
                            <div key={c.chave} className="flex flex-wrap items-center gap-1.5">
                              <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider" style={{ color: c.cor }}>{c.rotulo}</span>
                              {itens.map((s) => {
                                const d = nomeDe.get(chave(s.categoria, s.destinoTipo, s.destinoId));
                                const armada = armadas.has(s.id);
                                return (
                                  <span key={s.id} className="inline-flex max-w-full items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold"
                                    style={{ color: c.cor, borderColor: `color-mix(in srgb, ${c.cor} 45%, transparent)`, background: `color-mix(in srgb, ${c.cor} 10%, white)` }}>
                                    <span className="font-mono text-[9px] opacity-70">{codigoDestino(s.categoria, s.destinoTipo, s.destinoId)}</span>
                                    <span className="truncate">{d?.nome ?? `#${s.destinoId}`}</span>
                                    {s.cloneDe && <span className="text-[9px] opacity-60">cópia</span>}
                                    {modo === "EDICAO" && (
                                      <button type="button" onClick={() => cliqueExcluir(s.id)} data-testid={`faixa-excluir-${s.id}`}
                                        className="inline-flex shrink-0 items-center gap-0.5 rounded-[3px] border border-current px-1 text-[9px] uppercase"
                                        title={armada ? "Clique de novo para confirmar" : "Excluir esta ligação (desativa, não apaga)"}>
                                        {armada ? <><Unlock className="h-3 w-3" />Confirmar</> : <><Lock className="h-3 w-3" />Excluir</>}
                                      </button>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Faixa>
          {data.injetaveisSemVia > 0 && <p className="px-1 text-[11px] text-muted-foreground">{data.injetaveisSemVia} injetáveis sem via cadastrada não aparecem em IM, SC nem EV até a via ser preenchida no cadastro.</p>}
        </>
      )}

      {arraste && (
        <svg className="pointer-events-none fixed inset-0 z-50" width="100%" height="100%" aria-hidden>
          <path d={`M ${arraste.x0} ${arraste.y0} C ${arraste.x0 + 80} ${arraste.y0}, ${arraste.x - 80} ${arraste.y}, ${arraste.x} ${arraste.y}`} fill="none" stroke={arraste.clonar ? "#2563eb" : "#d97706"} strokeWidth={2.5} strokeDasharray={arraste.clonar ? "6 4" : undefined} />
          <circle cx={arraste.x} cy={arraste.y} r={5} fill={arraste.clonar ? "#2563eb" : "#d97706"} />
        </svg>
      )}
    </div>
  );
}
