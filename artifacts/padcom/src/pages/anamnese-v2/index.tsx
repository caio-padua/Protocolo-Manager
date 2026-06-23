import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Home,
  RotateCcw,
  Info,
  Loader2,
  ListChecks,
  Play,
  Save,
  Shield,
  SkipForward,
  Sparkles,
  Volume2,
  Square,
} from "lucide-react";
import {
  useListAnamneseQuestions,
  useGetAnamneseSession,
  getGetAnamneseSessionQueryKey,
  useCreateAnamneseSession,
  useUpsertAnamneseAnswer,
  useRefuseAnamneseBlock,
  useRemoveAnamneseRefusal,
  useCompleteAnamneseSession,
  type AnamneseQuestion,
  type AnamneseFinding,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ControlRenderer } from "./controls";
import { controlKind, isAnswered, isDiscrete, valorIncludesAny, type Valor } from "./types";
import { PaxterLogo } from "@/components/branding/PaxterLogo";

const PETROLEO = "#3D7A7A";
const CIANO = "#45B8CC";
const TOKEN_KEY = "anamnese_v2_token";
const DEMO_KEY = "anamnese_v2_demo";
const AREA_URL = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/area`;
// R1 — modo teste reversivel: VITE_OPEN_ACCESS="1" libera o acesso aberto (sem
// senha de colaborador) com faixa visivel "MODO TESTE". Default DESLIGADO.
const OPEN_ACCESS = import.meta.env.VITE_OPEN_ACCESS === "1";

export default function AnamneseV2() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [answers, setAnswers] = useState<Record<number, Valor>>({});
  const [refused, setRefused] = useState<Set<string>>(new Set());
  const [groupIdx, setGroupIdx] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [findings, setFindings] = useState<AnamneseFinding[]>([]);
  const [demo, setDemo] = useState<boolean>(() => localStorage.getItem(DEMO_KEY) === "1");

  const startRef = useRef<number>(Date.now());
  const milestoneRef = useRef<Set<number>>(new Set());
  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<number, { q: AnamneseQuestion; v: Valor }>>({});

  const { data: questions, isLoading: loadingQ } = useListAnamneseQuestions();
  const { data: sessionState } = useGetAnamneseSession(token ?? "", {
    query: { enabled: !!token, queryKey: getGetAnamneseSessionQueryKey(token ?? "") },
  });

  const createSession = useCreateAnamneseSession();
  const upsert = useUpsertAnamneseAnswer();
  const refuse = useRefuseAnamneseBlock();
  const unrefuse = useRemoveAnamneseRefusal();
  const complete = useCompleteAnamneseSession();

  // Inicia a sessao APOS identificacao (Opcao A). O `portalToken` amarra a
  // sessao ao cliente no servidor (anti-IDOR); sem ele, sessao de demonstracao.
  const startSession = useCallback(
    (portalToken?: string) => {
      if (createSession.isPending) return;
      createSession.mutate(
        { data: { mode: "paciente", ...(portalToken ? { portalToken } : {}) } },
        {
          onSuccess: (s) => {
            localStorage.setItem(TOKEN_KEY, s.token);
            const isDemo = !portalToken;
            localStorage.setItem(DEMO_KEY, isDemo ? "1" : "0");
            setDemo(isDemo);
            setToken(s.token);
          },
          onError: () => {
            toast({
              title: "Não foi possível iniciar",
              description: "Identifique-se novamente, por favor.",
              variant: "destructive",
            });
          },
        },
      );
    },
    [createSession, toast],
  );

  // hidrata respostas/recusas do servidor (retomada)
  useEffect(() => {
    if (!sessionState) return;
    const map: Record<number, Valor> = {};
    for (const a of sessionState.answers) {
      if (a.valor && typeof a.valor === "object") map[a.questionRowId] = a.valor as Valor;
    }
    setAnswers(map);
    setRefused(new Set(sessionState.refusals.map((r) => `${r.escopo}:${r.alvo}`)));
    if (sessionState.session.status === "concluida") {
      setFinished(true);
      setFindings(sessionState.findings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState?.session.id]);

  // Link de demonstracao direto: /anamnese/v2?demo=1 SEMPRE comeca uma demo NOVA
  // (limpa qualquer sessao anterior presa, inclusive uma ja concluida). Sem isso,
  // um token antigo no navegador prendia o usuario na tela "Anamnese concluida".
  const demoBootRef = useRef(false);
  useEffect(() => {
    if (demoBootRef.current) return;
    const wantDemo = new URLSearchParams(window.location.search).get("demo") === "1";
    if (!wantDemo) return;
    demoBootRef.current = true;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEMO_KEY);
    setFinished(false);
    setAnswers({});
    setRefused(new Set());
    setToken(null);
    startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // agrupa por bloco preservando a ordem; aplica visibilidade condicional por
  // sexo biologico (A04) e por dependencia de outra resposta (dependeDe).
  // Recalcula quando as respostas mudam (revela/esconde perguntas dependentes).
  const groups = useMemo(() => {
    const byPid = new Map<string, AnamneseQuestion>();
    for (const q of questions ?? []) if (q.perguntaId) byPid.set(q.perguntaId, q);
    const sexoQ = byPid.get("A04");
    const sexoVal = sexoQ ? answers[sexoQ.id] : undefined;
    const sexo =
      sexoVal?.tipo === "single" ? String(sexoVal.valor ?? sexoVal.opcao) : undefined;

    const isVisible = (q: AnamneseQuestion): boolean => {
      const ap = q.aplicavelEm as { sexo?: "M" | "F" } | null | undefined;
      // Caso extremo: antes de A04 ser respondida (sexo indefinido), NAO esconder
      // perguntas de sexo precipitadamente — so filtra quando o sexo e conhecido.
      if (ap?.sexo && sexo && sexo !== ap.sexo) return false;
      const dep = q.dependeDe as { perguntaId?: string; inclui?: unknown[] } | null | undefined;
      if (dep?.perguntaId && Array.isArray(dep.inclui)) {
        const refQ = byPid.get(dep.perguntaId);
        const refVal = refQ ? answers[refQ.id] : undefined;
        if (!valorIncludesAny(refVal, dep.inclui)) return false;
      }
      return true;
    };

    const list: { bloco: string; questions: AnamneseQuestion[] }[] = [];
    const idx = new Map<string, number>();
    for (const q of questions ?? []) {
      if (!isVisible(q)) continue;
      const b = q.bloco || "Outros";
      if (!idx.has(b)) {
        idx.set(b, list.length);
        list.push({ bloco: b, questions: [] });
      }
      list[idx.get(b)!].questions.push(q);
    }
    return list;
  }, [questions, answers]);

  const isRefused = useCallback((bloco: string) => refused.has(`bloco:${bloco}`), [refused]);

  // perguntas "ativas" (de blocos nao recusados) — base de progresso e modo foco
  const activeQuestions = useMemo(
    () => groups.filter((g) => !isRefused(g.bloco)).flatMap((g) => g.questions),
    [groups, isRefused],
  );

  const totalAtivas = activeQuestions.length;
  const respondidas = activeQuestions.filter((q) => isAnswered(answers[q.id])).length;
  const pct = totalAtivas > 0 ? Math.round((respondidas / totalAtivas) * 100) : 0;

  const gruposTotais = groups.length;
  const gruposCompletos = groups.filter(
    (g) => isRefused(g.bloco) || g.questions.every((q) => isAnswered(answers[q.id])),
  ).length;

  // tempo medio por resposta + estimativa
  const elapsedSeg = Math.round((Date.now() - startRef.current) / 1000);
  const tempoMedio = respondidas > 0 ? Math.max(2, Math.round(elapsedSeg / respondidas)) : 6;
  const restanteMin = Math.max(0, Math.ceil(((totalAtivas - respondidas) * tempoMedio) / 60));

  // marcos de progresso (25/50/75/100)
  useEffect(() => {
    for (const m of [25, 50, 75, 100]) {
      if (pct >= m && !milestoneRef.current.has(m)) {
        milestoneRef.current.add(m);
        if (respondidas > 0) {
          toast({
            title: m === 100 ? "Tudo respondido!" : `${m}% concluído`,
            description:
              m === 100
                ? "Você pode revisar e finalizar."
                : "Continue, você está indo muito bem.",
          });
        }
      }
    }
  }, [pct, respondidas, toast]);

  // R2: rolar para o topo ao trocar de grupo ou de pergunta (modo foco).
  // NAO inclui `focusMode` nas dependencias: ligar/desligar o foco nao deve
  // provocar "pulo" de rolagem (requisito A7 da spec), so a troca de conteudo.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [groupIdx, focusIdx]);

  // gravacao (upsert) com debounce p/ texto/numero, imediata p/ escolhas
  const persist = useCallback(
    (q: AnamneseQuestion, v: Valor) => {
      if (!token) return;
      setSaving(true);
      upsert.mutate(
        {
          token,
          data: {
            questionRowId: q.id,
            perguntaId: q.perguntaId ?? undefined,
            valor: v,
            tempoSeg: tempoMedio,
          },
        },
        {
          onSuccess: () => {
            setSaving(false);
            setSavedAt(
              new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            );
          },
          onError: () => setSaving(false),
        },
      );
    },
    [token, upsert, tempoMedio],
  );

  const handleAnswer = useCallback(
    (q: AnamneseQuestion, v: Valor, opts?: { commit?: boolean }) => {
      setAnswers((prev) => ({ ...prev, [q.id]: v }));
      const kind = controlKind(q);
      const debounced = kind === "texto" || kind === "number";
      if (debounced) {
        pending.current[q.id] = { q, v };
        clearTimeout(saveTimers.current[q.id]);
        saveTimers.current[q.id] = setTimeout(() => {
          persist(q, v);
          delete pending.current[q.id];
        }, 800);
      } else {
        persist(q, v);
      }
      // auto-avanco no modo foco (nunca em pergunta de alarme)
      if (focusMode && opts?.commit && isDiscrete(kind) && !q.eSinalAlarme) {
        setTimeout(() => setFocusIdx((i) => Math.min(i + 1, totalAtivas - 1)), 280);
      }
    },
    [persist, focusMode, totalAtivas],
  );

  const toggleRefuse = (bloco: string) => {
    if (!token) return;
    const key = `bloco:${bloco}`;
    if (refused.has(key)) {
      unrefuse.mutate({ token, data: { escopo: "bloco", alvo: bloco } });
      setRefused((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    } else {
      refuse.mutate({ token, data: { escopo: "bloco", alvo: bloco, motivo: "Não se aplica / prefiro não responder" } });
      setRefused((p) => new Set(p).add(key));
    }
  };

  const flushPending = useCallback(async () => {
    const drafts = Object.values(pending.current);
    pending.current = {};
    for (const id of Object.keys(saveTimers.current)) clearTimeout(saveTimers.current[Number(id)]);
    saveTimers.current = {};
    if (!token || drafts.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        drafts.map((d) =>
          upsert.mutateAsync({
            token,
            data: {
              questionRowId: d.q.id,
              perguntaId: d.q.perguntaId ?? undefined,
              valor: d.v,
              tempoSeg: tempoMedio,
            },
          }),
        ),
      );
      setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setSaving(false);
    }
  }, [token, upsert, tempoMedio]);

  // Drena rascunhos pendentes ao sair/recarregar (keepalive sobrevive ao unload).
  const flushBeacon = useCallback(() => {
    if (!token) return;
    const drafts = Object.values(pending.current);
    if (drafts.length === 0) return;
    pending.current = {};
    for (const id of Object.keys(saveTimers.current)) clearTimeout(saveTimers.current[Number(id)]);
    saveTimers.current = {};
    for (const d of drafts) {
      try {
        void fetch(`/api/anamnese-v2/sessions/${token}/answers`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            questionRowId: d.q.id,
            perguntaId: d.q.perguntaId ?? undefined,
            valor: d.v,
            tempoSeg: 0,
          }),
          keepalive: true,
        });
      } catch {
        // best-effort: nada a fazer durante o unload
      }
    }
  }, [token]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushBeacon();
    };
    window.addEventListener("pagehide", flushBeacon);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushBeacon);
      document.removeEventListener("visibilitychange", onHide);
      flushBeacon(); // drena tambem na desmontagem do componente
    };
  }, [flushBeacon]);

  const finalizar = async () => {
    if (!token) return;
    await flushPending(); // garante que a ultima resposta digitada foi gravada
    complete.mutate(
      { token },
      {
        onSuccess: (state) => {
          setFindings(state.findings);
          setFinished(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      },
    );
  };

  // ---------- RENDER ----------
  // Opcao A: sem sessao iniciada -> exige identificacao (ou demonstracao).
  if (!token) {
    return <IdentifyGate onStart={startSession} pending={createSession.isPending} />;
  }
  if (loadingQ || !questions) {
    return <CenterLoader label="Preparando sua anamnese..." />;
  }
  if (finished) {
    return <FinishScreen findings={findings} respondidas={respondidas} total={totalAtivas} demo={demo} />;
  }

  const safeGroupIdx = Math.min(groupIdx, Math.max(0, groups.length - 1));
  const group = groups[safeGroupIdx];
  const isLastGroup = safeGroupIdx >= groups.length - 1;
  if (!group) {
    return <CenterLoader label="Preparando sua anamnese..." />;
  }

  return (
    <div className="min-h-screen bg-[#f1f5f5] pb-28" style={{ ["--brand" as any]: PETROLEO }}>
      {/* Faixa ambar visivel (R1): MODO TESTE (VITE_OPEN_ACCESS) ou demonstracao */}
      {(demo || OPEN_ACCESS) && (
        <div className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-amber-950">
          <AlertTriangle className="h-3.5 w-3.5" />
          {OPEN_ACCESS
            ? "Modo teste — acesso aberto, respostas não são de um cliente real"
            : "Modo demonstração — respostas não são de um cliente real"}
        </div>
      )}
      {/* HEADER / TIMELINE */}
      <header className="sticky top-0 z-20 border-b border-[#d7e0e0] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            <PaxterLogo variant="compact" />
            <button
              type="button"
              onClick={() => setFocusMode((f) => !f)}
              className="btn-3d-soft flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold"
              style={focusMode ? { boxShadow: `0 0 0 2px ${CIANO}`, color: PETROLEO } : undefined}
            >
              {focusMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {focusMode ? "Sair do foco" : "Modo foco"}
            </button>
          </div>

          {/* barra de progresso com camada de vidro */}
          <div className="concave-3d relative mb-2 h-3 w-full overflow-hidden rounded-md">
            <div
              className="h-full rounded-md transition-all duration-500"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg,#16294a,#b8924d)" }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-md"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,.45) 0%, rgba(255,255,255,.10) 45%, rgba(255,255,255,0) 55%)",
              }}
            />
          </div>

          {/* 4 medidores */}
          <div className="grid grid-cols-4 gap-2">
            <Meter icon={<ListChecks className="h-3.5 w-3.5" />} label="Concluído" value={`${pct}%`} />
            <Meter icon={<Check className="h-3.5 w-3.5" />} label="Perguntas" value={`${respondidas}/${totalAtivas}`} />
            <Meter icon={<Activity className="h-3.5 w-3.5" />} label="Grupos" value={`${gruposCompletos}/${gruposTotais}`} />
            <Meter icon={<Clock className="h-3.5 w-3.5" />} label="Faltam" value={`~${restanteMin}min`} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4">
        {/* MAPA DE GRUPOS (ordem livre) — escondido no modo foco */}
        {!focusMode && (
          <div className="mb-4 flex flex-wrap gap-2">
            {groups.map((g, i) => {
              const done = g.questions.every((q) => isAnswered(answers[q.id]));
              const ref = isRefused(g.bloco);
              const active = i === groupIdx;
              const letra = g.bloco.split(".")[0].trim().slice(0, 2);
              return (
                <button
                  key={g.bloco}
                  type="button"
                  onClick={() => setGroupIdx(i)}
                  title={g.bloco}
                  className="flex h-9 min-w-9 items-center gap-1 rounded-md px-2 text-xs font-bold transition-all"
                  style={{
                    background: active ? PETROLEO : ref ? "#e5e7eb" : done ? "#d6f0e6" : "#fff",
                    color: active ? "#fff" : ref ? "#9ca3af" : done ? "#15803d" : "#4b5563",
                    boxShadow: active ? `0 0 0 2px ${CIANO}` : "inset 0 0 0 1px #d7e0e0",
                  }}
                >
                  {done && !active ? <Check className="h-3 w-3" /> : null}
                  {letra}
                </button>
              );
            })}
          </div>
        )}

        {/* CONTEUDO */}
        {focusMode ? (
          <FocusView
            questions={activeQuestions}
            idx={Math.min(focusIdx, Math.max(0, totalAtivas - 1))}
            answers={answers}
            onAnswer={handleAnswer}
            onPrev={() => setFocusIdx((i) => Math.max(0, i - 1))}
            onNext={() => setFocusIdx((i) => Math.min(totalAtivas - 1, i + 1))}
            onFinish={finalizar}
            finishing={complete.isPending}
          />
        ) : (
          <GroupView
            group={group}
            answers={answers}
            refused={isRefused(group.bloco)}
            onAnswer={handleAnswer}
            onToggleRefuse={() => toggleRefuse(group.bloco)}
          />
        )}

        {/* HEALTH TWIN LITE */}
        {!focusMode && (
          <HealthTwin groups={groups} answers={answers} isRefused={isRefused} />
        )}

        {/* NAVEGACAO (modo grupo) */}
        {!focusMode && (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={groupIdx === 0}
              onClick={() => setGroupIdx((i) => Math.max(0, i - 1))}
              className="btn-3d-soft flex items-center gap-1.5 rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            {isLastGroup ? (
              <button
                type="button"
                onClick={finalizar}
                disabled={complete.isPending}
                className="btn-3d flex items-center gap-2 rounded-md px-5 py-3 text-sm font-bold text-white"
                style={{ background: PETROLEO }}
              >
                {complete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Concluir anamnese
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setGroupIdx((i) => Math.min(groups.length - 1, i + 1))}
                className="btn-3d flex items-center gap-1.5 rounded-md px-5 py-3 text-sm font-bold text-white"
                style={{ background: PETROLEO }}
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </main>

      {/* SELO DE SALVAMENTO */}
      <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2">
        <div
          className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium shadow-md"
          style={{ color: saving ? "#9ca3af" : PETROLEO, boxShadow: "0 2px 10px rgba(0,0,0,.12)" }}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Salvando..." : savedAt ? `Salvo às ${savedAt}` : "Tudo salvo automaticamente"}
        </div>
      </div>
    </div>
  );
}

// ---------- subcomponentes ----------

function Meter({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="screen-3d flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5">
      <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
        {icon}
        {label}
      </span>
      <span className="text-sm font-bold" style={{ color: PETROLEO }}>
        {value}
      </span>
    </div>
  );
}

function QuestionCard({
  q,
  value,
  onAnswer,
}: {
  q: AnamneseQuestion;
  value: Valor | undefined;
  onAnswer: (q: AnamneseQuestion, v: Valor, opts?: { commit?: boolean }) => void;
}) {
  const answered = isAnswered(value);
  const [showVideo, setShowVideo] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Voz premium: toca o mp3 gerado (audioUrl). Sem Web Speech API (proibida).
  const toggleAudio = () => {
    if (!q.audioUrl) return;
    let el = audioRef.current;
    if (!el) {
      el = new Audio(q.audioUrl);
      el.onended = () => setPlaying(false);
      el.onpause = () => setPlaying(false);
      audioRef.current = el;
    }
    if (playing) {
      el.pause();
      el.currentTime = 0;
      setPlaying(false);
    } else {
      el.currentTime = 0;
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  useEffect(() => {
    return () => {
      try {
        audioRef.current?.pause();
      } catch {
        /* noop */
      }
    };
  }, []);

  return (
    <div
      className="panel-3d rounded-md p-4"
      style={q.eSinalAlarme ? { boxShadow: "0 0 0 2px #ef4444, 0 6px 16px rgba(0,0,0,.08)" } : undefined}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-base font-semibold leading-snug" style={{ color: "#1f2937" }}>
          {q.pergunta}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {q.audioUrl && (
            <button
              type="button"
              onClick={toggleAudio}
              aria-label={playing ? "Parar leitura da pergunta" : "Ouvir a pergunta"}
              className="btn-3d-soft flex h-8 w-8 items-center justify-center rounded-md"
              style={playing ? { boxShadow: `0 0 0 2px ${CIANO}`, color: PETROLEO } : { color: PETROLEO }}
            >
              {playing ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          {q.eSinalAlarme && (
            <span className="flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600">
              <AlertTriangle className="h-3 w-3" /> Atenção
            </span>
          )}
          {answered && <Check className="h-4 w-4" style={{ color: CIANO }} />}
        </div>
      </div>

      {/* Ajuda em linguagem leiga (observacao) */}
      {q.observacao && (
        <div className="mb-3 flex gap-2 rounded-md px-3 py-2" style={{ background: "#eef6f6" }}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PETROLEO }} />
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-600">
            {q.observacao}
          </p>
        </div>
      )}

      {/* Video explicativo opcional */}
      {q.videoUrl && (
        <div className="mb-3">
          {showVideo ? (
            <video
              src={q.videoUrl}
              controls
              autoPlay
              className="w-full rounded-md"
              style={{ maxHeight: 220 }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowVideo(true)}
              className="btn-3d-soft flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold"
              style={{ color: PETROLEO }}
            >
              <Play className="h-4 w-4" /> Ver vídeo explicativo
            </button>
          )}
        </div>
      )}

      <ControlRenderer question={q} value={value} onChange={(v, o) => onAnswer(q, v, o)} />

      {/* Exemplo de preenchimento */}
      {q.exemplo && <p className="mt-2 text-[12px] italic text-gray-400">{q.exemplo}</p>}
    </div>
  );
}

function GroupView({
  group,
  answers,
  refused,
  onAnswer,
  onToggleRefuse,
}: {
  group: { bloco: string; questions: AnamneseQuestion[] };
  answers: Record<number, Valor>;
  refused: boolean;
  onAnswer: (q: AnamneseQuestion, v: Valor, opts?: { commit?: boolean }) => void;
  onToggleRefuse: () => void;
}) {
  const podeRecusar = !group.questions.some((q) => q.eSinalAlarme);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="bevel-3d rounded-md px-3 py-2 text-sm font-bold uppercase tracking-wide" style={{ color: PETROLEO }}>
          {group.bloco}
        </h2>
        {podeRecusar && (
          <button
            type="button"
            onClick={onToggleRefuse}
            className="btn-3d-soft flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold"
            style={refused ? { boxShadow: `0 0 0 2px ${CIANO}`, color: PETROLEO } : undefined}
          >
            <SkipForward className="h-3.5 w-3.5" />
            {refused ? "Bloco recusado — reabrir" : "Pular este bloco"}
          </button>
        )}
      </div>

      {refused ? (
        <div className="concave-3d rounded-md p-6 text-center text-sm text-gray-500">
          Você optou por não responder este bloco. Isso foi registrado para sua equipe clínica.
        </div>
      ) : (
        group.questions.map((q) => (
          <QuestionCard key={q.id} q={q} value={answers[q.id]} onAnswer={onAnswer} />
        ))
      )}
    </section>
  );
}

function FocusView({
  questions,
  idx,
  answers,
  onAnswer,
  onPrev,
  onNext,
  onFinish,
  finishing,
}: {
  questions: AnamneseQuestion[];
  idx: number;
  answers: Record<number, Valor>;
  onAnswer: (q: AnamneseQuestion, v: Valor, opts?: { commit?: boolean }) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  finishing: boolean;
}) {
  const q = questions[idx];
  if (!q) return null;
  const last = idx >= questions.length - 1;
  return (
    <section className="flex flex-col gap-4">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
        {q.bloco} · {idx + 1} de {questions.length}
      </p>
      <QuestionCard key={q.id} q={q} value={answers[q.id]} onAnswer={onAnswer} />
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={idx === 0}
          onClick={onPrev}
          className="btn-3d-soft flex items-center gap-1.5 rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar
        </button>
        {last ? (
          <button
            type="button"
            onClick={onFinish}
            disabled={finishing}
            className="btn-3d flex items-center gap-2 rounded-md px-5 py-3 text-sm font-bold text-white"
            style={{ background: PETROLEO }}
          >
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Concluir
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="btn-3d flex items-center gap-1.5 rounded-md px-5 py-3 text-sm font-bold text-white"
            style={{ background: PETROLEO }}
          >
            Próxima <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}

function HealthTwin({
  groups,
  answers,
  isRefused,
}: {
  groups: { bloco: string; questions: AnamneseQuestion[] }[];
  answers: Record<number, Valor>;
  isRefused: (b: string) => boolean;
}) {
  return (
    <div className="panel-3d-sub mt-5 rounded-md p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: PETROLEO }}>
        <Shield className="h-4 w-4" /> Seu mapa de saúde
      </h3>
      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const total = g.questions.length;
          const done = g.questions.filter((q) => isAnswered(answers[q.id])).length;
          const ref = isRefused(g.bloco);
          const p = ref ? 100 : total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div key={g.bloco} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-[11px] font-medium text-gray-500" title={g.bloco}>
                {g.bloco.replace(/^[A-Z]\.\s*/, "")}
              </span>
              <div className="concave-3d h-2.5 flex-1 overflow-hidden rounded-md">
                <div
                  className="h-full rounded-md transition-all duration-500"
                  style={{ width: `${p}%`, background: ref ? "#cbd5e1" : `linear-gradient(90deg, ${PETROLEO}, ${CIANO})` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinishScreen({
  findings,
  respondidas,
  total,
  demo,
}: {
  findings: AnamneseFinding[];
  respondidas: number;
  total: number;
  demo: boolean;
}) {
  const diag = findings.filter((f) => f.tipo === "diagnosticado");
  const susp = findings.filter((f) => f.tipo === "suspeito");
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f1f5f5] px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="panel-3d-hero mb-5 rounded-md p-6 text-center">
          <div className="mb-4 flex items-center justify-center">
            <PaxterLogo variant="compact" />
          </div>
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-md"
            style={{ background: PETROLEO }}
          >
            <Check className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: PETROLEO }}>
            Anamnese concluída
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {respondidas} de {total} perguntas respondidas. Obrigado!
          </p>
        </div>

        {(diag.length > 0 || susp.length > 0) && (
          <div className="panel-3d rounded-md p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide" style={{ color: PETROLEO }}>
              <Activity className="h-4 w-4" /> Resumo para sua equipe clínica
            </h2>
            {diag.length > 0 && (
              <FindingGroup title="Relatado por você" items={diag} color={PETROLEO} />
            )}
            {susp.length > 0 && (
              <FindingGroup title="Pontos de atenção" items={susp} color="#d97706" />
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              Este resumo NÃO é um diagnóstico. É um apoio para a sua equipe clínica revisar com você na consulta.
            </p>
          </div>
        )}

        {/* R13 — ao concluir, caminho de volta para a area do cliente */}
        {!demo && (
          <a
            href={AREA_URL}
            className="btn-3d mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md text-sm font-black uppercase tracking-widest text-white"
          >
            <Home className="h-4 w-4" /> Voltar à minha área
          </a>
        )}
        {/* Demonstracao: caminho para recomecar (nunca prender ninguem nesta tela) */}
        {demo && (
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem(DEMO_KEY);
              window.location.href = `${window.location.pathname}?demo=1`;
            }}
            className="btn-3d mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md text-sm font-black uppercase tracking-widest text-white"
          >
            <RotateCcw className="h-4 w-4" /> Recomeçar demonstração
          </button>
        )}
      </div>
    </div>
  );
}

function FindingGroup({ title, items, color }: { title: string; items: AnamneseFinding[]; color: string }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="flex flex-col gap-1.5">
        {items.map((f) => (
          <div key={f.id} className="concave-3d flex items-center gap-2 rounded-md px-3 py-2 text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
            <span className="text-gray-700">{f.rotulo}</span>
            {f.severidade && (
              <span className="ml-auto text-[10px] font-bold uppercase" style={{ color }}>
                {f.severidade}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CenterLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f5f5]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: PETROLEO }} />
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opcao A — Portao de identificacao do paciente (CPF + nascimento).
// Reusa POST /api/client-portal/identify; o token devolvido amarra a sessao.
// ---------------------------------------------------------------------------
function IdentifyGate({
  onStart,
  pending,
}: {
  onStart: (portalToken?: string) => void;
  pending: boolean;
}) {
  const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [cpf, setCpf] = useState("");
  const [birth, setBirth] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fmtCpf = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };
  const fmtDate = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})(\d)/, "$1/$2");
  };

  const handleIdentify = useCallback(async () => {
    const cleanCpf = cpf.replace(/\D/g, "");
    const cleanDate = birth.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      setError("Digite os 11 dígitos do CPF");
      return;
    }
    if (cleanDate.length !== 8) {
      setError("Digite a data completa (DD/MM/AAAA)");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/client-portal/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCpf, birthDate: cleanDate }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setError("CPF ou data de nascimento incorretos");
        return;
      }
      onStart(data.token as string);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [cpf, birth, API_BASE, onStart]);

  const busy = loading || pending;

  return (
    <div
      className="area-elite flex min-h-screen flex-col bg-[#f1f5f5]"
      style={{ ["--brand" as any]: PETROLEO }}
    >
      <header className="panel-3d flex flex-col items-center justify-center gap-2 border-b border-teal-200/60 px-4 py-6">
        <PaxterLogo variant="appHeader" tone="light" />
        <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: "#8a7a52" }}>
          Ficha de Saúde — Anamnese
        </p>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="panel-3d overflow-hidden rounded-xl">
            <div className="bg-teal-700 px-5 py-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-cyan-300" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white">
                  Identificação
                </h2>
              </div>
              <p className="mt-1 text-xs text-teal-200">
                CPF e data de nascimento para começar sua anamnese
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-teal-700">
                  CPF
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => {
                    setCpf(fmtCpf(e.target.value));
                    setError("");
                  }}
                  className="concave-3d h-12 w-full rounded-lg px-4 font-mono text-lg text-teal-900 placeholder:text-teal-300 focus:outline-none focus:ring-2 focus:ring-[#45B8CC]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-teal-700">
                  Data de nascimento
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={birth}
                  onChange={(e) => {
                    setBirth(fmtDate(e.target.value));
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleIdentify();
                  }}
                  className="concave-3d h-12 w-full rounded-lg px-4 font-mono text-lg text-teal-900 placeholder:text-teal-300 focus:outline-none focus:ring-2 focus:ring-[#45B8CC]"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                onClick={handleIdentify}
                disabled={
                  busy ||
                  cpf.replace(/\D/g, "").length !== 11 ||
                  birth.replace(/\D/g, "").length !== 8
                }
                className="btn-3d flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Começar <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => onStart()}
              disabled={busy}
              className="text-[11px] uppercase tracking-widest text-teal-400 hover:text-teal-600 disabled:opacity-40"
            >
              Entrar como demonstração (sem identificar)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
