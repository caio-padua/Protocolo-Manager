import "../matriz-fornecedores/matriz.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ChevronDown, Lock, Unlock, Search, Pencil, Play } from "lucide-react";

// ============================================================================
// SINAPSES CLINICAS: liga pergunta da Anamnese (esquerda) -> saida clinica (direita).
// Esta tela SO cadastra ligacoes. Nao toca o Cockpit da Consulta nem emite nada.
// Excluir = desativar (Regra de Ouro), com trava de cadeado em dois cliques.
// ============================================================================

type Categoria = "EXAME" | "PRESCRICAO" | "INJETAVEL_IM" | "INJETAVEL_SC" | "INJETAVEL_EV" | "IMPLANTE";
const CATEGORIAS: Array<{ chave: Categoria; rotulo: string; cor: string }> = [
  { chave: "EXAME", rotulo: "Exames", cor: "#2563eb" },
  { chave: "PRESCRICAO", rotulo: "Prescrições", cor: "#7c3aed" },
  { chave: "INJETAVEL_IM", rotulo: "Injetáveis IM", cor: "#ea580c" },
  { chave: "INJETAVEL_SC", rotulo: "Injetáveis SC", cor: "#0d9488" },
  { chave: "INJETAVEL_EV", rotulo: "Injetáveis EV", cor: "#dc2626" },
  { chave: "IMPLANTE", rotulo: "Implantes", cor: "#ca8a04" },
];
const COR = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, c.cor])) as Record<Categoria, string>;

interface Pergunta { perguntaId: string; pergunta: string; bloco: string | null; eSinalAlarme: boolean }
interface Destino { tipo: string; id: number; nome: string; detalhe?: string | null; incompleto?: boolean }
interface Sinapse { id: number; perguntaId: string; categoria: Categoria; destinoTipo: string; destinoId: number; cloneDe: number | null }
interface Painel {
  perguntas: Pergunta[];
  destinos: Record<Categoria, Destino[]>;
  injetaveisSemVia: number;
  sinapses: Sinapse[];
}

const chaveDestino = (c: Categoria, tipo: string, id: number) => `${c}|${tipo}|${id}`;
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const emCampoDeTexto = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

export default function SinapsesClinicas() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<Painel>({
    queryKey: ["/api/cadastros/sinapses/painel"],
    queryFn: async () => {
      const r = await fetch("/api/cadastros/sinapses/painel");
      if (!r.ok) throw new Error("Falha ao carregar as sinapses");
      return r.json();
    },
  });

  const [modo, setModo] = useState<"edicao" | "simulacao">("edicao");
  const [buscaP, setBuscaP] = useState("");
  const [buscaD, setBuscaD] = useState("");
  const [fechadosP, setFechadosP] = useState<Set<string>>(new Set());
  const [abertosD, setAbertosD] = useState<Set<Categoria>>(new Set());
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [ancora, setAncora] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
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
  const onErro = (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" });

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

  const porPergunta = useMemo(() => {
    const m = new Map<string, Sinapse[]>();
    for (const s of data?.sinapses ?? []) {
      if (!m.has(s.perguntaId)) m.set(s.perguntaId, []);
      m.get(s.perguntaId)!.push(s);
    }
    return m;
  }, [data]);
  const porDestino = useMemo(() => {
    const m = new Map<string, Sinapse[]>();
    for (const s of data?.sinapses ?? []) {
      const k = chaveDestino(s.categoria, s.destinoTipo, s.destinoId);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [data]);
  const nomeDestino = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of CATEGORIAS) for (const d of data?.destinos[c.chave] ?? []) m.set(chaveDestino(c.chave, d.tipo, d.id), d.nome);
    return m;
  }, [data]);

  const gruposP = useMemo(() => {
    const q = semAcento(buscaP.trim());
    const m = new Map<string, Pergunta[]>();
    for (const p of data?.perguntas ?? []) {
      if (q && !semAcento(`${p.perguntaId} ${p.pergunta} ${p.bloco ?? ""}`).includes(q)) continue;
      const k = p.bloco ?? "SEM BLOCO";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return Array.from(m, ([nome, itens]) => ({ nome, itens }));
  }, [data, buscaP]);
  const ordemVisivel = useMemo(() => gruposP.filter((g) => !fechadosP.has(g.nome)).flatMap((g) => g.itens.map((p) => p.perguntaId)), [gruposP, fechadosP]);

  // Perguntas que "valem" para destacar a direita: a focada (edicao) ou as marcadas (simulacao).
  const ativasNaDireita = useMemo(() => {
    const base = modo === "simulacao" ? selecionadas : foco ? [foco] : [];
    const set = new Set<string>();
    for (const pid of base) for (const s of porPergunta.get(pid) ?? []) set.add(chaveDestino(s.categoria, s.destinoTipo, s.destinoId));
    return { set, ligado: base.length > 0 };
  }, [modo, selecionadas, foco, porPergunta]);

  const resumoSimulacao = useMemo(() => {
    const r = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, 0])) as Record<Categoria, number>;
    ativasNaDireita.set.forEach((k) => { r[k.split("|")[0] as Categoria] += 1; });
    return r;
  }, [ativasNaDireita]);

  // ---- seleção ----
  const clicarPergunta = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey && ancora) {
      const a = ordemVisivel.indexOf(ancora), b = ordemVisivel.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [i, j] = a < b ? [a, b] : [b, a];
        setSelecionadas(ordemVisivel.slice(i, j + 1));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
      setAncora(id);
      return;
    }
    setSelecionadas([id]);
    setAncora(id);
    setFoco((f) => (modo === "edicao" ? (f === id ? null : id) : f));
  };

  // ---- atalhos ----
  const copiarSelecionadas = useCallback(() => {
    const ids = selecionadas.flatMap((p) => (porPergunta.get(p) ?? []).map((s) => s.id));
    setCopia(ids);
    toast({ title: ids.length ? `${ids.length} ligação(ões) copiada(s)` : "Nada para copiar", description: ids.length ? "Selecione outras perguntas e use Ctrl+V." : "As perguntas selecionadas não têm ligações." });
  }, [selecionadas, porPergunta, toast]);
  const colarNasSelecionadas = useCallback(() => {
    if (!copia.length) { toast({ title: "Nada copiado ainda" }); return; }
    for (const pid of selecionadas) clonar.mutate({ sinapseIds: copia, perguntaDestinoId: pid });
  }, [copia, selecionadas, clonar, toast]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (emCampoDeTexto(e.target)) return;
      const t = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && t === "c" && modo === "edicao") { e.preventDefault(); copiarSelecionadas(); return; }
      if ((e.ctrlKey || e.metaKey) && t === "v" && modo === "edicao") { e.preventDefault(); colarNasSelecionadas(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t === "e") setModo("edicao");
      if (t === "s") setModo("simulacao");
      if (t === "escape") { setFoco(null); setSelecionadas([]); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [modo, copiarSelecionadas, colarNasSelecionadas]);

  // ---- arrastar para ligar (ponteiro) ----
  useEffect(() => {
    if (!arraste) return;
    const mover = (e: PointerEvent) => setArraste((a) => (a ? { ...a, x: e.clientX, y: e.clientY } : a));
    const soltar = (e: PointerEvent) => {
      const a = arrasteRef.current;
      setArraste(null);
      if (!a) return;
      const alvo = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (a.clonar) {
        const p = alvo?.closest("[data-pergunta]") as HTMLElement | null;
        const destino = p?.dataset.pergunta;
        if (destino && destino !== a.de) clonar.mutate({ perguntaOrigemId: a.de, perguntaDestinoId: destino });
        return;
      }
      const d = alvo?.closest("[data-dest]") as HTMLElement | null;
      if (!d?.dataset.dest) return;
      const [categoria, destinoTipo, id] = d.dataset.dest.split("|");
      criar.mutate({ perguntaId: a.de, categoria: categoria as Categoria, destinoTipo, destinoId: Number(id) });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!arraste]);

  const iniciarArraste = (e: React.PointerEvent, de: string) => {
    if (modo !== "edicao") return;
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setArraste({ de, x0: r.left + r.width / 2, y0: r.top + r.height / 2, x: e.clientX, y: e.clientY, clonar: e.altKey });
  };

  // ---- exclusão protegida por cadeado (dois cliques) ----
  const cliqueExcluir = (id: number) => {
    if (armadas.has(id)) {
      setArmadas((s) => { const n = new Set(s); n.delete(id); return n; });
      desativar.mutate(id);
      return;
    }
    setArmadas((s) => new Set(s).add(id));
    window.setTimeout(() => setArmadas((s) => { const n = new Set(s); n.delete(id); return n; }), 4000);
  };

  const qD = semAcento(buscaD.trim());
  const totalLigacoes = data?.sinapses.length ?? 0;
  const incompletos = (data?.destinos.EXAME ?? []).filter((d) => d.incompleto).length;

  return (
    <div className="space-y-4" data-testid="pagina-sinapses">
      <section className="panel-3d-sub p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold uppercase tracking-widest text-primary">Sinapses Clínicas</h1>
            <p className="text-xs text-muted-foreground">Esquerda: perguntas da Anamnese. Direita: o que o sistema pode indicar. Esta tela só cadastra ligações; não emite nem envia nada.</p>
          </div>
          <div className="mx-ev-g mx-ev-g2 w-72" role="group" aria-label="Modo da tela">
            <button type="button" aria-pressed={modo === "edicao"} onClick={() => setModo("edicao")} className={`evo-bevel mx-ev-b h40 ${modo === "edicao" ? "evo-bevel-ativo" : ""}`} data-testid="modo-edicao"><Pencil className="mr-1 inline h-4 w-4" />Edição (E)</button>
            <button type="button" aria-pressed={modo === "simulacao"} onClick={() => setModo("simulacao")} className={`evo-bevel mx-ev-b h40 ${modo === "simulacao" ? "evo-bevel-ativo" : ""}`} data-testid="modo-simulacao"><Play className="mr-1 inline h-4 w-4" />Simulação (S)</button>
          </div>
          <div className="screen-3d px-3 py-2 text-xs font-black tracking-wide" data-testid="contagem-ligacoes">{totalLigacoes} ligações ativas</div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="ajuda-modo">
          {modo === "edicao"
            ? "Arraste o círculo da pergunta até um destino para ligar. Alt + arrastar até outra pergunta copia as ligações. Ctrl + clique alterna a seleção; Shift + clique seleciona uma faixa; Ctrl+C e Ctrl+V copiam ligações. Clique numa pergunta para focar."
            : "Simulação, nada é gravado: marque perguntas (clique, Ctrl ou Shift) como respondidas “sim” e veja quais saídas acenderiam."}
        </p>
        {incompletos > 0 && (
          <p className="mt-1 text-[11px] text-amber-700">{incompletos} blocos de exames não têm nenhum exame ativo e aparecem com o alerta BLOCO INCOMPLETO.</p>
        )}
      </section>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError || !data ? (
        <div className="panel-3d-sub p-6 text-sm text-red-600">Não foi possível carregar as sinapses. Tente recarregar a página.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ===== ESQUERDA: PERGUNTAS ===== */}
          <section className="panel-3d-sub flex max-h-[calc(100vh-15rem)] min-h-[24rem] flex-col p-2" data-testid="coluna-perguntas">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={buscaP} onChange={(e) => setBuscaP(e.target.value)} placeholder={`Buscar entre ${data.perguntas.length} perguntas...`} className="h-10 pl-9 field-engraved" data-testid="busca-perguntas" />
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {gruposP.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma pergunta encontrada.</div>}
              {gruposP.map((g) => {
                const fechado = fechadosP.has(g.nome);
                return (
                  <div key={g.nome}>
                    <button type="button" aria-expanded={!fechado} onClick={() => setFechadosP((s) => { const n = new Set(s); if (n.has(g.nome)) n.delete(g.nome); else n.add(g.nome); return n; })}
                      className="tecla-3d flex w-full items-center gap-3 px-3 py-1.5 text-left">
                      <span className="concave-3d flex h-5 w-9 shrink-0 items-center justify-center text-[10px] font-bold tabular-nums text-primary/80">{g.itens.length}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-widest text-primary/80">{g.nome}</span>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${fechado ? "-rotate-90" : ""}`} />
                    </button>
                    {!fechado && (
                      <div className="concave-3d mt-1 overflow-hidden">
                        {g.itens.map((p, i) => {
                          const lig = porPergunta.get(p.perguntaId) ?? [];
                          const sel = selecionadas.includes(p.perguntaId);
                          const emFoco = foco === p.perguntaId;
                          const apagada = modo === "edicao" && foco && !emFoco;
                          return (
                            <div key={p.perguntaId} data-pergunta={p.perguntaId} onClick={(e) => clicarPergunta(e, p.perguntaId)}
                              className={`flex cursor-pointer items-start gap-2 px-3 py-2 transition-opacity ${apagada ? "opacity-40" : ""}`}
                              style={{ background: sel ? "rgba(217,119,6,0.16)" : i % 2 === 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)", outline: emFoco ? "2px solid #d97706" : undefined, outlineOffset: -2 }}
                              data-testid={`pergunta-${p.perguntaId}`}>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-[#5b6578]">{p.perguntaId}</span>
                                  {p.eSinalAlarme && <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-red-600"><AlertTriangle className="h-3 w-3" />Alarme</span>}
                                </div>
                                <div className="text-sm font-semibold leading-snug text-[#1b2433]">{p.pergunta}</div>
                                {lig.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {lig.map((s) => {
                                      const k = chaveDestino(s.categoria, s.destinoTipo, s.destinoId);
                                      const armada = armadas.has(s.id);
                                      return (
                                        <span key={s.id} className="inline-flex max-w-full items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold"
                                          style={{ color: COR[s.categoria], borderColor: `color-mix(in srgb, ${COR[s.categoria]} 45%, transparent)`, background: `color-mix(in srgb, ${COR[s.categoria]} 10%, white)` }}>
                                          <span className="truncate">{nomeDestino.get(k) ?? `#${s.destinoId}`}</span>
                                          {modo === "edicao" && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); cliqueExcluir(s.id); }}
                                              className="inline-flex shrink-0 items-center gap-0.5 rounded-[3px] border border-current px-1 text-[9px] uppercase"
                                              title={armada ? "Clique de novo para confirmar" : "Excluir esta ligação (desativa, não apaga)"} data-testid={`excluir-${s.id}`}>
                                              {armada ? <><Unlock className="h-3 w-3" />Confirmar</> : <><Lock className="h-3 w-3" />Excluir</>}
                                            </button>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              {modo === "edicao" && (
                                <button type="button" onPointerDown={(e) => iniciarArraste(e, p.perguntaId)} onClick={(e) => e.stopPropagation()}
                                  className="bevel-3d mt-1 h-5 w-5 shrink-0 cursor-crosshair rounded-full touch-none" style={{ borderRadius: 999 }}
                                  title="Arraste até um destino. Alt + arrastar até outra pergunta copia as ligações." aria-label={`Ligar a pergunta ${p.perguntaId}`} data-testid={`porta-${p.perguntaId}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ===== DIREITA: SAIDAS ===== */}
          <section className="panel-3d-sub flex max-h-[calc(100vh-15rem)] min-h-[24rem] flex-col p-2" data-testid="coluna-saidas">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={buscaD} onChange={(e) => setBuscaD(e.target.value)} placeholder="Buscar exame, fórmula, injetável ou implante..." className="h-10 pl-9 field-engraved" data-testid="busca-destinos" />
            </div>
            {modo === "simulacao" && (
              <div className="mb-2 grid grid-cols-3 gap-1.5" data-testid="resumo-simulacao">
                {CATEGORIAS.map((c) => (
                  <div key={c.chave} className="concave-3d px-2 py-1 text-center text-[10px] font-bold uppercase" style={{ color: c.cor, opacity: resumoSimulacao[c.chave] ? 1 : 0.45 }}>
                    {c.rotulo}: {resumoSimulacao[c.chave]}
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {CATEGORIAS.map((c) => {
                const todos = data.destinos[c.chave];
                const lista = qD ? todos.filter((d) => semAcento(`${d.nome} ${d.detalhe ?? ""}`).includes(qD)) : todos;
                if (qD && lista.length === 0) return null;
                const aberto = qD ? true : abertosD.has(c.chave);
                return (
                  <div key={c.chave} data-testid={`saida-${c.chave}`}>
                    <button type="button" aria-expanded={aberto} onClick={() => setAbertosD((s) => { const n = new Set(s); if (n.has(c.chave)) n.delete(c.chave); else n.add(c.chave); return n; })}
                      className="tecla-3d flex w-full items-center gap-3 px-3 py-1.5 text-left">
                      <span aria-hidden className="bevel-3d inline-flex h-6 w-10 shrink-0" style={{ borderRadius: 5, border: "1px solid", background: `linear-gradient(180deg, rgba(255,255,255,.30) 0%, rgba(255,255,255,0) 48%, rgba(0,0,0,.16) 100%), ${c.cor}`, borderColor: c.cor }} />
                      <span className="concave-3d flex h-5 w-9 shrink-0 items-center justify-center text-[10px] font-bold tabular-nums text-primary/80">{lista.length}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-widest" style={{ color: c.cor }}>{c.rotulo}</span>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${aberto ? "" : "-rotate-90"}`} />
                    </button>
                    {aberto && (
                      <div className="concave-3d mt-1 overflow-hidden">
                        {lista.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">Nenhum item cadastrado para esta saída.</div>}
                        {lista.map((d, i) => {
                          const k = chaveDestino(c.chave, d.tipo, d.id);
                          const ligados = porDestino.get(k)?.length ?? 0;
                          const aceso = ativasNaDireita.set.has(k);
                          const apagado = ativasNaDireita.ligado && !aceso;
                          return (
                            <div key={k} data-dest={k}
                              className={`flex items-center gap-2 px-3 py-2 transition-opacity ${apagado ? "opacity-35" : ""}`}
                              style={{ background: aceso ? `color-mix(in srgb, ${c.cor} 16%, white)` : i % 2 === 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)", boxShadow: aceso ? `inset 3px 0 0 ${c.cor}` : undefined }}
                              data-testid={`destino-${k}`}>
                              <div className="min-w-0 flex-1">
                                <div className="break-words text-sm font-bold leading-tight text-[#1b2433]">{d.nome}</div>
                                {d.detalhe && <div className="truncate text-[11px] text-[#5b6578]">{d.detalhe}</div>}
                                {d.incompleto && (
                                  <div className="mt-1 flex flex-wrap items-center gap-2" data-testid={`bloco-incompleto-${d.id}`}>
                                    <span className="paxter-alert paxter-alert-amber inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800"><AlertTriangle className="h-3 w-3" />Bloco incompleto</span>
                                    <Link href="/cadastros/cadastro-exames" className="evo-bevel inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase">+ Completar Bloco</Link>
                                  </div>
                                )}
                              </div>
                              <span className="concave-3d flex h-6 min-w-8 shrink-0 items-center justify-center px-1 text-[10px] font-bold tabular-nums" style={{ color: c.cor }} title="Perguntas ligadas a este destino">{ligados}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {data.injetaveisSemVia > 0 && (
                <p className="px-1 text-[11px] text-muted-foreground">{data.injetaveisSemVia} injetáveis sem via cadastrada não aparecem em IM, SC nem EV até a via ser preenchida no cadastro de injetáveis.</p>
              )}
            </div>
          </section>
        </div>
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
