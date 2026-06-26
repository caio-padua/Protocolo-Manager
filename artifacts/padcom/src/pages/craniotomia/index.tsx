import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import PaxterLogo from "@/components/branding/PaxterLogo";
import {
  BrainCircuit,
  Play,
  RotateCcw,
  Zap,
  AlertTriangle,
  Salad,
  Dumbbell,
  Syringe,
  FlaskConical,
  Pill,
  CircleDot,
} from "lucide-react";

// ============================================================================
// ONDA D — CRANIOTOMIA VIVA (a tela das sinapses) do Master Loop Paxter.
// Visualiza o subgrafo CONECTADO do Cerebro em 3 colunas estritas:
//   Dendritos (entradas) -> Corpo Celular (doencas + escore) -> Axonios (saidas).
// Modo Simular: escolhe um perfil, a tela escurece, os dendritos acionados
// ganham borda dourada, as linhas SVG correm da esquerda para a direita e o
// escore pisca no centro. Edicao in situ: clicar num axonio abre um popover
// para editar o PESO da ligacao, salvando no banco em tempo real.
// ============================================================================

const GOLD = "#c2a05a";
const GOLD_FORTE = "#d9bd7e";

interface Opcao {
  label: string;
  valor: string | number;
  peso: number;
}
interface Dendrito {
  perguntaId: string;
  pergunta: string;
  bloco: string | null;
  sistema: string | null;
  eSinalAlarme: boolean;
  opcoes: Opcao[] | null;
}
interface Doenca {
  idIhe: number;
  nomeDoenca: string;
  grupo: string | null;
}
interface Axonio {
  id: number;
  itemTipo: string;
  itemRef: string;
  itemNome: string;
  doencaIdIhe: number;
  peso: number;
}
interface Ligacao {
  id: number;
  perguntaId: string;
  doencaIdIhe: number;
  gatilhoValor: string | null;
  peso: number;
}
interface Perfil {
  id: string;
  nome: string;
  respostas: { perguntaId: string; valor: string | number }[];
}
interface Grafo {
  dendritos: Dendrito[];
  corpoCelular: Doenca[];
  axonios: Axonio[];
  ligacoes: Ligacao[];
  perfis: Perfil[];
}
interface SimResult {
  escoreTotal: number;
  gradeGlobal: string;
  redFlag: boolean;
  dendritosAcionados: string[];
  doencasAcesas: number[];
  axoniosAcionados: number[];
}

interface Edge {
  key: string;
  d: string;
  ativa: boolean;
}

const TIPO_LABEL: Record<string, string> = {
  dieta_regra: "Dieta",
  treino_regra: "Treino",
  injetavel: "Injetável",
  formula: "Fórmula",
  implante: "Implante",
  substance: "Substância",
};

function iconeTipo(tipo: string) {
  switch (tipo) {
    case "dieta_regra":
      return <Salad className="h-4 w-4" />;
    case "treino_regra":
      return <Dumbbell className="h-4 w-4" />;
    case "injetavel":
      return <Syringe className="h-4 w-4" />;
    case "formula":
      return <FlaskConical className="h-4 w-4" />;
    case "implante":
      return <Pill className="h-4 w-4" />;
    default:
      return <CircleDot className="h-4 w-4" />;
  }
}

export default function Craniotomia() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<Grafo>({
    queryKey: ["craniotomia"],
    queryFn: async () => {
      const r = await fetch("/api/motor/craniotomia");
      if (!r.ok) throw new Error("Falha ao carregar o Cérebro");
      return r.json();
    },
  });

  // ---- Modo Simular ----
  const [perfilId, setPerfilId] = useState<string>("");
  const [sim, setSim] = useState<SimResult | null>(null);

  const simularMut = useMutation({
    mutationFn: async (respostas: { perguntaId: string; valor: string | number }[]) => {
      const r = await fetch("/api/motor/craniotomia/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas }),
      });
      if (!r.ok) throw new Error("Falha ao simular");
      return (await r.json()) as SimResult;
    },
    onSuccess: (res) => setSim(res),
    onError: () => toast({ title: "Erro ao simular", variant: "destructive" }),
  });

  const rodarSimulacao = () => {
    const perfil = data?.perfis.find((p) => p.id === perfilId);
    if (!perfil) {
      toast({ title: "Escolha um perfil de teste primeiro" });
      return;
    }
    simularMut.mutate(perfil.respostas);
  };

  const limparSimulacao = () => {
    setSim(null);
    setPerfilId("");
  };

  const simulando = sim != null;

  const acesoDend = useMemo(() => new Set(sim?.dendritosAcionados ?? []), [sim]);
  const acesoDoe = useMemo(() => new Set(sim?.doencasAcesas ?? []), [sim]);
  const acesoAxon = useMemo(() => new Set(sim?.axoniosAcionados ?? []), [sim]);

  // ---- Edicao in situ do peso do axonio ----
  const pesoMut = useMutation({
    mutationFn: async ({ id, peso }: { id: number; peso: number }) => {
      const r = await fetch(`/api/motor/axonio/${id}/peso`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peso }),
      });
      if (!r.ok) throw new Error("Falha ao salvar peso");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["craniotomia"] });
      toast({ title: "Peso da ligação salvo" });
    },
    onError: () => toast({ title: "Erro ao salvar peso", variant: "destructive" }),
  });

  // ---- Medicao das sinapses (linhas SVG entre as colunas) ----
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [edges, setEdges] = useState<Edge[]>([]);
  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const setNodeRef = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  const computeEdges = useCallback(() => {
    const cont = containerRef.current;
    if (!cont || !data) return;
    const cr = cont.getBoundingClientRect();
    setSvgSize({ w: cont.scrollWidth, h: cont.scrollHeight });
    const rect = (id: string) => {
      const el = nodeRefs.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left - cr.left + cont.scrollLeft,
        right: r.right - cr.left + cont.scrollLeft,
        midY: r.top - cr.top + cont.scrollTop + r.height / 2,
      };
    };
    const bezier = (from: string, to: string) => {
      const a = rect(from);
      const b = rect(to);
      if (!a || !b) return null;
      const x1 = a.right;
      const y1 = a.midY;
      const x2 = b.left;
      const y2 = b.midY;
      const dx = Math.max(40, (x2 - x1) / 2);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    };

    const next: Edge[] = [];
    for (const l of data.ligacoes) {
      const d = bezier(`d:${l.perguntaId}`, `c:${l.doencaIdIhe}`);
      if (!d) continue;
      const ativa = simulando && acesoDend.has(l.perguntaId) && acesoDoe.has(l.doencaIdIhe);
      next.push({ key: `dc-${l.id}`, d, ativa });
    }
    for (const a of data.axonios) {
      const d = bezier(`c:${a.doencaIdIhe}`, `a:${a.id}`);
      if (!d) continue;
      const ativa = simulando && acesoDoe.has(a.doencaIdIhe) && acesoAxon.has(a.id);
      next.push({ key: `ca-${a.id}`, d, ativa });
    }
    setEdges(next);
  }, [data, simulando, acesoDend, acesoDoe, acesoAxon]);

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(computeEdges);
    return () => cancelAnimationFrame(raf);
  }, [computeEdges]);

  useEffect(() => {
    const onResize = () => computeEdges();
    window.addEventListener("resize", onResize);
    const cont = containerRef.current;
    const ro = cont ? new ResizeObserver(() => computeEdges()) : null;
    if (cont && ro) ro.observe(cont);
    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, [computeEdges]);

  const nomePorDoenca = useMemo(
    () => new Map((data?.corpoCelular ?? []).map((d) => [d.idIhe, d.nomeDoenca])),
    [data],
  );

  return (
    <div className="dark min-h-full rounded-xl bg-[#16284a] p-5 text-slate-100">
      {/* Cabecalho + logo dourada no canto superior direito (exigencia da spec) */}
      <header className="relative mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="bevel-3d flex h-11 w-11 items-center justify-center"
            style={{ color: GOLD_FORTE }}
          >
            <BrainCircuit className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: GOLD_FORTE }}>
              Craniotomia Viva
            </h1>
            <p className="text-sm text-slate-300">
              As sinapses do Cérebro: Dendritos (entradas) → Corpo Celular (doenças) → Axônios (saídas)
            </p>
          </div>
        </div>
        <PaxterLogo variant="compact" tone="dark" className="hidden shrink-0 sm:flex" />
      </header>

      {/* Barra do Modo Simular */}
      <div className="panel-3d mb-5 flex flex-wrap items-center gap-3 rounded-lg p-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Modo Simular
        </span>
        <div className="min-w-[260px] flex-1">
          <Select value={perfilId} onValueChange={setPerfilId}>
            <SelectTrigger className="field-engraved">
              <SelectValue placeholder="Escolha um perfil de teste…" />
            </SelectTrigger>
            <SelectContent>
              {(data?.perfis ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="btn-3d-soft"
          onClick={rodarSimulacao}
          disabled={simularMut.isPending || !perfilId}
          style={{ color: GOLD_FORTE }}
        >
          <Play className="mr-2 h-4 w-4" /> Simular
        </Button>
        {simulando && (
          <Button variant="ghost" className="text-slate-300" onClick={limparSimulacao}>
            <RotateCcw className="mr-2 h-4 w-4" /> Limpar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-full bg-white/5" />
          ))}
        </div>
      ) : (
        <div ref={containerRef} className="relative">
          {/* Vidro de escurecimento (20%) quando simulando */}
          {simulando && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-lg bg-black/20" />
          )}

          {/* Overlay SVG com as sinapses */}
          <svg
            className="pointer-events-none absolute inset-0 z-20"
            width={svgSize.w}
            height={svgSize.h}
            style={{ overflow: "visible" }}
          >
            {edges.map((e) => (
              <path
                key={e.key}
                d={e.d}
                fill="none"
                stroke={e.ativa ? GOLD_FORTE : "rgba(148,163,184,0.28)"}
                strokeWidth={e.ativa ? 2.5 : 1.2}
                className={e.ativa ? "craniotomia-edge-active" : ""}
              />
            ))}
          </svg>

          <div className="relative z-30 grid grid-cols-3 gap-4">
            {/* ===== COLUNA 1 — DENDRITOS ===== */}
            <ColunaTitulo titulo="Dendritos" subtitulo="Entradas (perguntas)" />
            {/* ===== COLUNA 2 — CORPO CELULAR ===== */}
            <ColunaTitulo titulo="Corpo Celular" subtitulo="Doenças + escore" />
            {/* ===== COLUNA 3 — AXÔNIOS ===== */}
            <ColunaTitulo titulo="Axônios" subtitulo="Saídas (indicações)" />

            {/* CONTEUDO DAS 3 COLUNAS (grade estrita) */}
            <div className="space-y-3">
              {(data?.dendritos ?? []).map((d) => {
                const aceso = simulando && acesoDend.has(d.perguntaId);
                return (
                  <div
                    key={d.perguntaId}
                    ref={setNodeRef(`d:${d.perguntaId}`)}
                    className="panel-3d-sub rounded-lg p-3 transition-all"
                    style={{
                      opacity: simulando && !aceso ? 0.4 : 1,
                      border: aceso ? `2px solid ${GOLD_FORTE}` : "1px solid rgba(255,255,255,0.06)",
                      boxShadow: aceso ? `0 0 18px ${GOLD}66` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-400">
                        {d.perguntaId}
                      </span>
                      {d.eSinalAlarme && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-red-400">
                          <AlertTriangle className="h-3 w-3" /> Alarme
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium leading-snug text-slate-100">
                      {d.pergunta}
                    </p>
                    {d.bloco && (
                      <p className="mt-1 text-[11px] text-slate-400">{d.bloco}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              {/* Escore central que pisca durante a simulacao */}
              <div
                className="screen-3d rounded-lg p-4 text-center"
                style={{ border: `1px solid ${GOLD}55` }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Escore total
                </p>
                <div
                  className={simulando ? "craniotomia-pisca" : ""}
                  style={{ color: GOLD_FORTE }}
                >
                  <div className="text-4xl font-extrabold tabular-nums">
                    {sim ? sim.escoreTotal : "—"}
                  </div>
                  <div className="text-xs font-semibold tracking-wide">
                    {sim ? sim.gradeGlobal : "aguardando simulação"}
                  </div>
                </div>
                {sim?.redFlag && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-[11px] font-bold uppercase text-red-300">
                    <Zap className="h-3 w-3" /> Sinal de alarme
                  </div>
                )}
              </div>

              {(data?.corpoCelular ?? []).map((d) => {
                const aceso = simulando && acesoDoe.has(d.idIhe);
                return (
                  <div
                    key={d.idIhe}
                    ref={setNodeRef(`c:${d.idIhe}`)}
                    className="panel-3d rounded-lg p-3 transition-all"
                    style={{
                      opacity: simulando && !aceso ? 0.4 : 1,
                      border: aceso ? `2px solid ${GOLD_FORTE}` : "1px solid rgba(255,255,255,0.06)",
                      boxShadow: aceso ? `0 0 22px ${GOLD}77` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold" style={{ color: aceso ? GOLD_FORTE : undefined }}>
                        {d.nomeDoenca}
                      </p>
                      <span className="font-mono text-[10px] text-slate-500">#{d.idIhe}</span>
                    </div>
                    {d.grupo && <p className="mt-1 text-[11px] text-slate-400">{d.grupo}</p>}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              {(data?.axonios ?? []).map((a) => {
                const aceso = simulando && acesoAxon.has(a.id);
                return (
                  <AxonioCard
                    key={a.id}
                    axonio={a}
                    doencaNome={nomePorDoenca.get(a.doencaIdIhe) ?? `#${a.doencaIdIhe}`}
                    aceso={aceso}
                    dim={simulando && !aceso}
                    refCb={setNodeRef(`a:${a.id}`)}
                    onSalvar={(peso) => pesoMut.mutate({ id: a.id, peso })}
                    salvando={pesoMut.isPending}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColunaTitulo({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="concave-3d mb-1 rounded-lg px-3 py-2 text-center">
      <p className="text-sm font-bold uppercase tracking-wider" style={{ color: GOLD_FORTE }}>
        {titulo}
      </p>
      <p className="text-[11px] text-slate-400">{subtitulo}</p>
    </div>
  );
}

function AxonioCard({
  axonio,
  doencaNome,
  aceso,
  dim,
  refCb,
  onSalvar,
  salvando,
}: {
  axonio: Axonio;
  doencaNome: string;
  aceso: boolean;
  dim: boolean;
  refCb: (el: HTMLElement | null) => void;
  onSalvar: (peso: number) => void;
  salvando: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pesoLocal, setPesoLocal] = useState(String(axonio.peso));

  useEffect(() => {
    setPesoLocal(String(axonio.peso));
  }, [axonio.peso]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          ref={refCb as (el: HTMLButtonElement | null) => void}
          className="panel-3d-sub w-full rounded-lg p-3 text-left transition-all hover:brightness-110"
          style={{
            opacity: dim ? 0.4 : 1,
            border: aceso ? `2px solid ${GOLD_FORTE}` : "1px solid rgba(255,255,255,0.06)",
            boxShadow: aceso ? `0 0 18px ${GOLD}66` : undefined,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {iconeTipo(axonio.itemTipo)}
              {TIPO_LABEL[axonio.itemTipo] ?? axonio.itemTipo}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
              style={{ background: `${GOLD}22`, color: GOLD_FORTE }}
              title="Peso da ligação"
            >
              peso {axonio.peso}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-100">{axonio.itemNome}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">← {doencaNome}</p>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Peso da ligação
        </p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          {doencaNome} → {axonio.itemNome}
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={99}
            value={pesoLocal}
            onChange={(e) => setPesoLocal(e.target.value)}
            className="h-9"
          />
          <Button
            size="sm"
            disabled={salvando}
            onClick={() => {
              const n = Number(pesoLocal);
              if (!Number.isInteger(n) || n < 0 || n > 99) return;
              onSalvar(n);
              setOpen(false);
            }}
          >
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
