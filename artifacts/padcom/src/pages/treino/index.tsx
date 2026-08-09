import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import {
  Dumbbell,
  Plus,
  Trash2,
  Flame,
  Activity,
  Inbox,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ============================================================================
// ORGAO TREINO — ONDA C do Master Loop Paxter (espelha o Orgao Dieta).
// Montador de ficha de treino TDAH-friendly: parametros -> conta volume,
// tonelagem, duracao e gasto calorico ao vivo -> tabela de exercicios
// (carro-chefe) -> salva prescricao. Fila de Indicacao mostra o que o Cerebro
// (motor) sugeriu e ainda aguarda validacao humana.
// ============================================================================

const MET_PADRAO: Record<string, number> = {
  peito: 5.0,
  costas: 5.0,
  perna: 6.0,
  gluteo: 6.0,
  ombro: 4.5,
  biceps: 4.0,
  triceps: 4.0,
  core: 4.0,
  panturrilha: 4.0,
  cardio: 8.0,
};
const MET_GENERICO = 5.0;
const SEG_POR_SERIE_EXEC = 40;

const DIAS_TREINO = [
  { key: "A", label: "Treino A" },
  { key: "B", label: "Treino B" },
  { key: "C", label: "Treino C" },
  { key: "D", label: "Treino D" },
  { key: "E", label: "Treino E" },
];

interface Exercicio {
  id: number;
  codigo: string;
  nome: string;
  grupoMuscular: string | null;
  equipamento: string | null;
  met: number | null;
  seriesPadrao: number | null;
  repeticoesPadrao: string | null;
  descansoPadraoSeg: number | null;
}
interface Cliente {
  id: number;
  name: string;
}
interface ItemLinha {
  uid: string;
  diaTreino: string;
  exercicioId: number | null;
  series: number | null;
  repeticoes: string;
  cargaKg: number | null;
  descansoSeg: number | null;
}

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number | null | undefined, sufixo = "") =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `${round1(n)}${sufixo}`;

// Extrai o numero de repeticoes a partir do texto ("8-12" -> 12; "15" -> 15).
function repsNum(texto: string): number | null {
  const m = texto.match(/\d+/g);
  if (!m || !m.length) return null;
  return Number(m[m.length - 1]);
}
function metDoEx(ex: Exercicio | undefined): number {
  if (ex?.met && ex.met > 0) return ex.met;
  const g = (ex?.grupoMuscular ?? "").toLowerCase();
  return MET_PADRAO[g] ?? MET_GENERICO;
}

export default function TreinoPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="bevel-3d flex h-11 w-11 items-center justify-center text-primary">
            <Dumbbell className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Órgão Treino
            </h1>
            <p className="text-sm text-muted-foreground">
              Montagem de ficha de treino com cálculo de volume, tonelagem e gasto calórico
            </p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="montar" className="space-y-5">
        <TabsList className="bevel-3d">
          <TabsTrigger value="montar">Montar ficha</TabsTrigger>
          <TabsTrigger value="fila">Fila de indicação</TabsTrigger>
        </TabsList>

        <TabsContent value="montar">
          <MontarFicha />
        </TabsContent>
        <TabsContent value="fila">
          <FilaIndicacao />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MontarFicha() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: clientes } = useQuery<Cliente[]>({
    queryKey: ["treino", "clientes"],
    queryFn: async () => {
      const r = await fetch("/api/clients");
      if (!r.ok) throw new Error("Falha ao carregar clientes");
      const d = await r.json();
      return Array.isArray(d) ? d : (d.data ?? []);
    },
  });

  const { data: exercicios } = useQuery<Exercicio[]>({
    queryKey: ["treino", "exercicios"],
    queryFn: async () => {
      const r = await fetch("/api/treino/catalogo/exercicios");
      if (!r.ok) throw new Error("Falha ao carregar exercícios");
      return r.json();
    },
  });

  const exById = useMemo(
    () => new Map((exercicios ?? []).map((e) => [e.id, e])),
    [exercicios],
  );

  const [clientId, setClientId] = useState<number | null>(null);
  const [objetivo, setObjetivo] = useState("hipertrofia");
  const [divisao, setDivisao] = useState("ABC");
  const [frequencia, setFrequencia] = useState("3");
  const [peso, setPeso] = useState("");
  const [idade, setIdade] = useState("");
  const [sexo, setSexo] = useState("M");
  const [nivel, setNivel] = useState("intermediario");
  const [itens, setItens] = useState<ItemLinha[]>([]);

  // ---- Conta volume/tonelagem/duracao/gasto ao vivo (espelha o backend) ----
  const linhasCalc = useMemo(() => {
    return itens.map((it) => {
      const ex = it.exercicioId ? exById.get(it.exercicioId) : undefined;
      const series = it.series ?? 0;
      const reps = repsNum(it.repeticoes ?? "") ?? 0;
      const carga = it.cargaKg ?? 0;
      const tonelagem = series && reps && carga ? series * reps * carga : null;
      const descanso = it.descansoSeg ?? 0;
      const duracaoMin = series ? (series * (SEG_POR_SERIE_EXEC + descanso)) / 60 : 0;
      return { ...it, ex, series, reps, tonelagem, duracaoMin };
    });
  }, [itens, exById]);

  const totais = useMemo(() => {
    const p = parseFloat(peso.replace(",", "."));
    let volumeSeries = 0;
    let tonelagem = 0;
    let duracao = 0;
    let kcal = 0;
    let temGasto = false;
    for (const l of linhasCalc) {
      if (l.series > 0) volumeSeries += l.series;
      if (l.tonelagem) tonelagem += l.tonelagem;
      duracao += l.duracaoMin;
      if (p && l.duracaoMin > 0) {
        const met = metDoEx(l.ex);
        kcal += met * p * (l.duracaoMin / 60);
        temGasto = true;
      }
    }
    return {
      volumeSeries,
      tonelagem: round1(tonelagem),
      duracao: round1(duracao),
      kcal: temGasto ? round(kcal) : null,
    };
  }, [linhasCalc, peso]);

  function addLinha(dia = "A") {
    setItens((prev) => [
      ...prev,
      { uid: crypto.randomUUID(), diaTreino: dia, exercicioId: null, series: null, repeticoes: "", cargaKg: null, descansoSeg: null },
    ]);
  }
  function updLinha(uid: string, patch: Partial<ItemLinha>) {
    setItens((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  }
  function delLinha(uid: string) {
    setItens((prev) => prev.filter((it) => it.uid !== uid));
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const body = {
        clientId: clientId ?? 0,
        objetivo,
        divisao,
        frequenciaSemanal: frequencia ? parseInt(frequencia, 10) : null,
        pesoKg: peso ? parseFloat(peso.replace(",", ".")) : null,
        idade: idade ? parseInt(idade, 10) : null,
        sexo,
        nivelExperiencia: nivel,
        status: "ativa" as const,
        itens: itens
          .filter((it) => it.exercicioId)
          .map((it, idx) => ({
            diaTreino: it.diaTreino,
            ordem: idx + 1,
            exercicioId: it.exercicioId,
            series: it.series,
            repeticoes: it.repeticoes || null,
            repeticoesNum: repsNum(it.repeticoes ?? ""),
            cargaKg: it.cargaKg,
            descansoSeg: it.descansoSeg,
          })),
      };
      const r = await fetch("/api/treino/prescricoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao salvar ficha");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Ficha salva", description: "O treino foi gravado com sucesso." });
      qc.invalidateQueries({ queryKey: ["treino"] });
      setItens([]);
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" });
    },
  });

  const podeSalvar = clientId && itens.some((it) => it.exercicioId);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
      {/* ----- Coluna de parametros ----- */}
      <div className="space-y-5">
        <div className="panel-3d p-4 space-y-4">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
            Cliente e objetivo
          </h2>
          <div className="space-y-3">
            <Field label="Cliente">
              <PaxterClientSelector
                clientes={clientes ?? []}
                value={clientId}
                onChange={setClientId}
                placeholder="Selecionar cliente…"
              />
            </Field>
            <Field label="Objetivo">
              <Select value={objetivo} onValueChange={setObjetivo}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hipertrofia">Hipertrofia (ganho de massa)</SelectItem>
                  <SelectItem value="forca">Força</SelectItem>
                  <SelectItem value="resistencia">Resistência muscular</SelectItem>
                  <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                  <SelectItem value="mobilidade">Mobilidade</SelectItem>
                  <SelectItem value="condicionamento">Condicionamento geral</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Divisão">
                <Select value={divisao} onValueChange={setDivisao}>
                  <SelectTrigger className="field-engraved">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full body">Full body</SelectItem>
                    <SelectItem value="AB">AB</SelectItem>
                    <SelectItem value="ABC">ABC</SelectItem>
                    <SelectItem value="ABCD">ABCD</SelectItem>
                    <SelectItem value="push/pull/legs">Push/Pull/Legs</SelectItem>
                    <SelectItem value="upper/lower">Upper/Lower</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Frequência (dias/sem)">
                <Input value={frequencia} onChange={(e) => setFrequencia(e.target.value)} inputMode="numeric" placeholder="—" className="field-engraved" />
              </Field>
            </div>
          </div>
        </div>

        <div className="panel-3d p-4 space-y-4">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
            Perfil do cliente
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peso (kg)">
              <Input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" placeholder="—" className="field-engraved" />
            </Field>
            <Field label="Idade">
              <Input value={idade} onChange={(e) => setIdade(e.target.value)} inputMode="numeric" placeholder="—" className="field-engraved" />
            </Field>
            <Field label="Sexo">
              <Select value={sexo} onValueChange={setSexo}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nível">
              <Select value={nivel} onValueChange={setNivel}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iniciante">Iniciante</SelectItem>
                  <SelectItem value="intermediario">Intermediário</SelectItem>
                  <SelectItem value="avancado">Avançado</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        {/* ----- Painel de volume/gasto ao vivo ----- */}
        <div className="screen-3d p-4 space-y-3">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" /> Carga de trabalho (ao vivo)
          </h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Séries" value={fmt(totais.volumeSeries)} unit="total" />
            <Metric label="Tonelagem" value={fmt(totais.tonelagem)} unit="kg" />
            <Metric label="Duração" value={fmt(totais.duracao)} unit="min" gold />
          </div>
          <div className="concave-3d flex items-center justify-between px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <Flame className="h-3 w-3" /> Gasto estimado
            </span>
            <span className="text-lg font-black leading-none text-primary">
              {totais.kcal != null ? `${totais.kcal} kcal` : "—"}
            </span>
          </div>
          {totais.kcal == null && (
            <p className="text-[11px] text-muted-foreground">
              Informe o peso do cliente para estimar o gasto calórico.
            </p>
          )}
        </div>
      </div>

      {/* ----- Coluna da ficha (tabela = carro-chefe) ----- */}
      <div className="space-y-4">
        <div className="panel-3d overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
              Ficha de treino
            </h2>
            <span className="concave-3d px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
              {itens.length} {itens.length === 1 ? "exercício" : "exercícios"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary/5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 text-left">Dia</th>
                  <th className="px-3 py-2 text-left">Exercício</th>
                  <th className="px-3 py-2 text-right">Séries</th>
                  <th className="px-3 py-2 text-right">Reps</th>
                  <th className="px-3 py-2 text-right">Carga (kg)</th>
                  <th className="px-3 py-2 text-right">Desc. (s)</th>
                  <th className="px-3 py-2 text-right">Tonelagem</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {linhasCalc.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      Nenhum exercício ainda. Clique em “Adicionar exercício” para montar a ficha.
                    </td>
                  </tr>
                ) : (
                  linhasCalc.map((l) => (
                    <tr key={l.uid} className="border-t border-border/40 align-middle">
                      <td className="px-3 py-1.5">
                        <Select value={l.diaTreino} onValueChange={(v) => updLinha(l.uid, { diaTreino: v })}>
                          <SelectTrigger className="field-engraved h-8 min-w-[90px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DIAS_TREINO.map((d) => (
                              <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <Select value={l.exercicioId ? String(l.exercicioId) : ""} onValueChange={(v) => {
                          const ex = exById.get(Number(v));
                          updLinha(l.uid, {
                            exercicioId: Number(v),
                            series: l.series ?? ex?.seriesPadrao ?? 3,
                            repeticoes: l.repeticoes || ex?.repeticoesPadrao || "10",
                            descansoSeg: l.descansoSeg ?? ex?.descansoPadraoSeg ?? 60,
                          });
                        }}>
                          <SelectTrigger className="field-engraved h-8 min-w-[200px] text-xs"><SelectValue placeholder="Escolher exercício" /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {(exercicios ?? []).map((e) => (
                              <SelectItem key={e.id} value={String(e.id)}>
                                {e.nome} <span className="text-muted-foreground">· {e.grupoMuscular}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input inputMode="numeric" value={l.series ?? ""} onChange={(e) => updLinha(l.uid, { series: e.target.value ? Number(e.target.value) : null })} className="field-engraved h-8 w-[60px] text-right text-xs ml-auto" placeholder="—" />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input value={l.repeticoes} onChange={(e) => updLinha(l.uid, { repeticoes: e.target.value })} className="field-engraved h-8 w-[72px] text-right text-xs ml-auto" placeholder="8-12" />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input inputMode="decimal" value={l.cargaKg ?? ""} onChange={(e) => updLinha(l.uid, { cargaKg: e.target.value ? Number(e.target.value) : null })} className="field-engraved h-8 w-[72px] text-right text-xs ml-auto" placeholder="—" />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input inputMode="numeric" value={l.descansoSeg ?? ""} onChange={(e) => updLinha(l.uid, { descansoSeg: e.target.value ? Number(e.target.value) : null })} className="field-engraved h-8 w-[64px] text-right text-xs ml-auto" placeholder="—" />
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold text-foreground">{fmt(l.tonelagem)}</td>
                      <td className="px-2 py-1.5 text-center">
                        <button type="button" onClick={() => delLinha(l.uid)} aria-label="Remover" className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {linhasCalc.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-primary/30 bg-primary/5 text-sm font-black">
                    <td className="px-3 py-2 uppercase tracking-widest text-[10px] text-primary" colSpan={2}>Total da ficha</td>
                    <td className="px-3 py-2 text-right text-primary">{fmt(totais.volumeSeries)}</td>
                    <td colSpan={3}></td>
                    <td className="px-3 py-2 text-right text-primary">{fmt(totais.tonelagem)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
            <Button variant="outline" size="sm" className="bevel-3d" onClick={() => addLinha()}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar exercício
            </Button>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" /> O exercício já vem com séries, reps e descanso sugeridos; ajuste se precisar.
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            className="btn-3d-soft"
            disabled={!podeSalvar || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? "Salvando…" : "Salvar ficha"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilaIndicacao() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ["treino", "indicacoes", "pendente"],
    queryFn: async () => {
      const r = await fetch("/api/treino/indicacoes?status=pendente");
      if (!r.ok) throw new Error("Falha ao carregar fila");
      return r.json();
    },
  });

  const descartar = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/treino/indicacoes/${id}/descartar`, { method: "POST" });
      if (!r.ok) throw new Error("Falha ao descartar");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Indicação descartada" });
      qc.invalidateQueries({ queryKey: ["treino", "indicacoes"] });
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (isError)
    return (
      <div className="panel-3d-sub border-l-4 border-red-500 p-4 text-sm font-bold text-red-600">
        Não foi possível carregar a fila de indicação.
      </div>
    );

  const rows = data ?? [];
  if (rows.length === 0)
    return (
      <div className="panel-3d flex flex-col items-center justify-center gap-2 p-12 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Nenhuma indicação de treino aguardando validação. O Cérebro escreve aqui ao analisar a anamnese.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={String(r.id)} className="panel-3d border-l-4 border-primary p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="concave-3d px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                  #{String(r.id)}
                </span>
                <span className="font-bold text-foreground">{String(r.clientName ?? "—")}</span>
                {r.escore != null && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                    Escore {String(r.escore)}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {String(r.objetivoSugerido ?? "—")}
                {r.divisaoSugerida ? ` · ${String(r.divisaoSugerida)}` : ""}
              </p>
              {r.justificativa ? (
                <p className="text-[13px] text-foreground/80">{String(r.justificativa)}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" className="bevel-3d" disabled>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Prescrever
              </Button>
              <Button variant="ghost" size="sm" onClick={() => descartar.mutate(Number(r.id))}>
                <XCircle className="mr-1 h-4 w-4" /> Descartar
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({ label, value, unit, gold }: { label: string; value: string; unit: string; gold?: boolean }) {
  return (
    <div className="concave-3d px-2 py-2">
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-lg font-black leading-none ${gold ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">{unit}</div>
    </div>
  );
}
