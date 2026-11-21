import { useEffect, useMemo, useRef, useState, useCallback, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Moon,
  Sun,
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
  HelpCircle,
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
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { PaxterLockup } from "@/components/layout/paxter-fx/PaxterLockup";
import { PadconWordmark } from "@/components/layout/paxter-fx/PadconWordmark";
import { PaduaWordmark } from "@/components/layout/paxter-fx/PaduaWordmark";
import { useScreenTheme } from "@/components/theme/useScreenTheme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const NAVY = "#16294a";
const GOLD = "#c9a24e";
const TOKEN_KEY = "anamnese_v2_token";
const DEMO_KEY = "anamnese_v2_demo";
const AREA_URL = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/area`;
// R1 — modo teste reversivel: VITE_OPEN_ACCESS="1" libera o acesso aberto (sem
// senha de colaborador) com faixa visivel "MODO TESTE". Default DESLIGADO.
const OPEN_ACCESS = import.meta.env.VITE_OPEN_ACCESS === "1";

import RetornoPanel, { IDENTIDADE_IDS, SEXO_ID, type Retorno } from "./RetornoPanel";

export default function AnamneseV2() {
  const { toast } = useToast();
  const { theme, toggle } = useScreenTheme();
  // Link de consulta (?s=TOKEN): retoma a sessao aberta pelo medico (herdada da anterior), neste ou em outro aparelho.
  const [token, setToken] = useState<string | null>(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s && /^[a-f0-9]{48}$/.test(s)) {
      localStorage.setItem(TOKEN_KEY, s);
      localStorage.setItem(DEMO_KEY, "0");
      window.history.replaceState(null, "", window.location.pathname);
      return s;
    }
    return localStorage.getItem(TOKEN_KEY);
  });
  const [answers, setAnswers] = useState<Record<number, Valor>>({});
  const [refused, setRefused] = useState<Set<string>>(new Set());
  const [groupIdx, setGroupIdx] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [minimizado, setMinimizado] = useState<boolean>(() => localStorage.getItem("anamnese-header-min") === "1");
  useEffect(() => {
    localStorage.setItem("anamnese-header-min", minimizado ? "1" : "0");
  }, [minimizado]);
  const [focusIdx, setFocusIdx] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [findings, setFindings] = useState<AnamneseFinding[]>([]);
  const [demo, setDemo] = useState<boolean>(() => localStorage.getItem(DEMO_KEY) === "1");

  // Retomada: tela "Voce parou aqui" ao reabrir a pagina ou voltar de uma ligacao/outro aplicativo.
  const [retomadaAberta, setRetomadaAberta] = useState(false);
  const ultimaRespondidaRef = useRef<number | null>(null);
  const saiuEmRef = useRef<number | null>(null);
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
    const feitas = sessionState.answers
      .filter((a) => a.valor && typeof a.valor === "object" && isAnswered(a.valor as Valor))
      .sort((a, b) => String(a.respondidoEm ?? "").localeCompare(String(b.respondidoEm ?? "")));
    ultimaRespondidaRef.current = feitas.length ? feitas[feitas.length - 1].questionRowId : null;
    if (feitas.length > 0 && sessionState.session.status !== "concluida") setRetomadaAberta(true);
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
  const retorno = ((sessionState as unknown) as { retorno?: Retorno | null } | undefined)?.retorno ?? null;
  // Dados cadastrais/cirurgias: aparecem uma vez (primeiro grupo); ao avancar, nao voltam mais nesta sessao.
  const chaveRetorno = `anamnese-retorno-visto:${token ?? "s"}`;
  const [retornoDispensado, setRetornoDispensado] = useState(() => { try { return sessionStorage.getItem(chaveRetorno) === "1"; } catch { return false; } });
  useEffect(() => {
    if ((groupIdx > 0 || focusIdx > 0) && !retornoDispensado) {
      setRetornoDispensado(true);
      try { sessionStorage.setItem(chaveRetorno, "1"); } catch { /* ignora */ }
    }
  }, [groupIdx, focusIdx, retornoDispensado, chaveRetorno]);
  const ocultas = useMemo(() => {
    const set = new Set<number>();
    if (!retorno) return set;
    for (const id of IDENTIDADE_IDS) set.add(id); // identidade vem do cadastro
    if (retorno.identidade?.sexoBiologico) set.add(SEXO_ID); // sexo vem do cadastro e nao se muda
    for (const k of Object.keys(retorno.bloqueados ?? {})) set.add(Number(k)); // fatos ja registrados: somente leitura
    return set;
  }, [retorno]);
  const groups = useMemo(() => {
    const byPid = new Map<string, AnamneseQuestion>();
    for (const q of questions ?? []) if (q.perguntaId) byPid.set(q.perguntaId, q);
    const sexoQ = byPid.get("A04");
    const sexoVal = sexoQ ? answers[sexoQ.id] : undefined;
    // Sexo biologico: o CADASTRO manda; so sem cadastro vale a resposta unica da A04.
    const sexoCadastro = retorno?.identidade?.sexoBiologico ?? undefined;
    const sexo =
      sexoCadastro ?? (sexoVal?.tipo === "single" ? String(sexoVal.valor ?? sexoVal.opcao) : undefined);

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
      if (ocultas.has(q.id)) continue;
      const b = q.bloco || "Outros";
      if (!idx.has(b)) {
        idx.set(b, list.length);
        list.push({ bloco: b, questions: [] });
      }
      list[idx.get(b)!].questions.push(q);
    }
    return list;
  }, [questions, answers, ocultas, retorno]);

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

  // % de evolucao de cada titulo (grupo recusado conta como resolvido).
  const grupoPct = (g: { bloco: string; questions: AnamneseQuestion[] }): number => {
    if (isRefused(g.bloco)) return 100;
    if (g.questions.length === 0) return 0;
    return Math.round((g.questions.filter((q) => isAnswered(answers[q.id])).length / g.questions.length) * 100);
  };

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
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" }); // instantaneo: mais rapido
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
      if (isAnswered(v)) ultimaRespondidaRef.current = q.id;
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
      if (document.visibilityState === "hidden") {
        saiuEmRef.current = Date.now();
        flushBeacon();
      } else if (saiuEmRef.current && Date.now() - saiuEmRef.current >= 15000) {
        saiuEmRef.current = null;
        setRetomadaAberta(true); // voltou de ligacao/outro aplicativo: mostra onde parou
      }
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
          scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        },
      },
    );
  };

  // ---------- RENDER ----------
  const themeClass = theme === "dark" ? "dark" : "";
  // Opcao A: sem sessao iniciada -> exige identificacao (ou demonstracao).
  if (!token) {
    return (
      <div className={themeClass}>
        <IdentifyGate
          onStart={startSession}
          pending={createSession.isPending}
          theme={theme}
          onToggleTheme={toggle}
        />
      </div>
    );
  }
  if (loadingQ || !questions) {
    return (
      <div className={themeClass}>
        <CenterLoader label="Preparando sua anamnese..." />
      </div>
    );
  }
  if (finished) {
    return (
      <div className={themeClass}>
        <FinishScreen findings={findings} respondidas={respondidas} total={totalAtivas} demo={demo} />
      </div>
    );
  }

  const safeGroupIdx = Math.min(groupIdx, Math.max(0, groups.length - 1));
  const group = groups[safeGroupIdx];
  const isLastGroup = safeGroupIdx >= groups.length - 1;
  if (!group) {
    return <CenterLoader label="Preparando sua anamnese..." />;
  }

  return (
    <div
      className={`${themeClass} anamnese-solo${theme !== "dark" ? " anamnese-light" : ""} fixed inset-0 flex flex-col text-foreground`}
      style={{ ["--brand" as any]: NAVY }}
    >
      {/* TECIDO TERNO — faixa sutil ao fundo de toda a tela (linho marinho no escuro,
          risca de giz no claro). Fica atras de tudo; o conteudo sobe com z-[1]. */}
      <div className="leva-fabric" aria-hidden="true" />
      {/* Faixa ambar visivel (R1): MODO TESTE (VITE_OPEN_ACCESS) ou demonstracao */}
      {(demo || OPEN_ACCESS) && (
        <div className="relative z-[1] flex shrink-0 items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-amber-950">
          <AlertTriangle className="h-3.5 w-3.5" />
          {OPEN_ACCESS
            ? "Modo teste — acesso aberto, respostas não são de um cliente real"
            : "Modo demonstração — respostas não são de um cliente real"}
        </div>
      )}
      {/* HEADER / TIMELINE — fiel ao canvas: marca centralizada -> blocos -> barra de barinhas */}
      <header className={`anamnese-solo relative z-20 shrink-0 border-b border-border px-4 ${minimizado ? "py-2" : "py-4"}`}>
        {/* tecido terno CRISP sobre o painel do cabecalho (acima do bg, abaixo do conteudo).
            CEO confirmou em 24/06/2026: MANTER o tecido aqui (claro e escuro) e UNIFICAR com o das
            questoes — por isso a base do header e a MESMA .anamnese-solo da pagina (mesmo degrade/cor),
            nao bg-background (que era navy mais escuro/chapado e destoava ao redor do PaxMed). Assim a
            MESMA base + a MESMA .leva-fabric leem como um unico tecido. PaxMed por ultimo (z-[1]). */}
        <div className="leva-fabric" aria-hidden="true" />
        <div className="relative z-[1] mx-auto max-w-2xl">
          {/* controles verticais no canto superior direito (retangulos finos,
              texto girado 90 graus) — nao competem com a marca centralizada */}
          {(() => {
            // Os 3 botoes: MESMO tamanho, MESMO alinhamento, relevo saliente (bevel-3d).
            const cls = minimizado
              ? "bevel-3d relative flex h-7 w-9 items-center justify-center rounded-[4px]"
              : "bevel-3d relative flex h-6 w-[96px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] px-2";
            const lbl = "text-[9.5px] font-bold uppercase tracking-wide";
            const ic = "h-3.5 w-3.5 shrink-0";
            return (
              <div
                className={`absolute right-0 z-30 flex ${minimizado ? "top-0 flex-row items-center gap-1.5" : "-top-2.5 flex-col items-stretch gap-3"}`}
              >
                <TipButton
                  onClick={() => setFocusMode((f) => !f)}
                  label={focusMode ? "Ver todas as perguntas" : "Uma pergunta por vez"}
                  tip={focusMode ? "Volta a mostrar todas as perguntas do grupo juntas, na mesma tela." : "Mostra uma pergunta por vez, em tela cheia, para você responder com calma."}
                  className={cls}
                  style={focusMode ? { boxShadow: `0 0 0 2px ${GOLD}`, color: GOLD } : { color: GOLD }}
                >
                  {focusMode ? <EyeOff className={ic} /> : <Eye className={ic} />}
                  {!minimizado && <span className={lbl}>{focusMode ? "Ver todas" : "Uma a uma"}</span>}
                </TipButton>
                <TipButton
                  onClick={toggle}
                  label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
                  tip={theme === "dark" ? "Troca para o fundo claro, mais fácil de ler à luz do dia." : "Troca para o fundo escuro, mais confortável à noite."}
                  className={cls}
                  style={{ color: GOLD }}
                >
                  {theme === "dark" ? <Sun className={ic} /> : <Moon className={ic} />}
                  {!minimizado && <span className={lbl}>Tema</span>}
                </TipButton>
                <TipButton
                  onClick={() => setMinimizado((m) => !m)}
                  label={minimizado ? "Expandir cabeçalho" : "Minimizar cabeçalho"}
                  tip={minimizado ? "Abre o topo completo, com o resumo do seu progresso." : "Recolhe o topo para sobrar mais espaço para as perguntas."}
                  expanded={!minimizado}
                  className={cls}
                  style={{ color: GOLD }}
                >
                  {minimizado ? <ChevronDown className={ic} /> : <ChevronUp className={ic} />}
                  {!minimizado && <span className={lbl}>Minimizar</span>}
                </TipButton>
              </div>
            );
          })()}

          {minimizado ? (
            <div className="flex flex-col gap-2">
              <div className="flex min-h-[34px] items-center gap-2 pr-[7.5rem]">
                <div className="shrink-0"><PaxterSymbolGlass size={30} tone={theme === "dark" ? "dark" : "light"} /></div>
                <div className="flex min-w-0 flex-1 justify-center" aria-live="polite">
                  <div className="bevel-3d flex flex-col items-center rounded-[4px] px-4 py-1 leading-tight">
                    <span className="text-[20px] font-black tabular-nums tracking-tight" style={{ color: GOLD }}>{pct}% <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground">concluído</span></span>
                    <span className="text-[10.5px] font-bold uppercase tracking-wide text-foreground">Falta aprox. {restanteMin} min</span>
                  </div>
                </div>
              </div>
              <Trilho ativoKey={groupIdx}>
                {groups.map((g, i) => (
                  <GrupoChip
                    key={g.bloco}
                    compact
                    label={siglaBloco(g.bloco)}
                    title={g.bloco}
                    pct={grupoPct(g)}
                    active={i === groupIdx}
                    done={g.questions.every((q) => isAnswered(answers[q.id]))}
                    refused={isRefused(g.bloco)}
                    onClick={() => setGroupIdx(i)}
                  />
                ))}
              </Trilho>
            </div>
          ) : (
          <>
          {/* 1) marca centralizada — simbolo grande + PAXTER folgado na faixa navy */}
          <BrandMark tone={theme === "dark" ? "dark" : "light"} />

          {/* 2) blocos medidores */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Meter icon={<ListChecks className="h-3.5 w-3.5" />} label="Concluído" value={`${pct}%`} />
            <Meter icon={<Check className="h-3.5 w-3.5" />} label="Perguntas" value={`${respondidas}/${totalAtivas}`} />
            <Meter icon={<Activity className="h-3.5 w-3.5" />} label="Grupos" value={`${gruposCompletos}/${gruposTotais}`} />
            <Meter icon={<Clock className="h-3.5 w-3.5" />} label="Faltam" value={`~${restanteMin}min`} />
          </div>

          {/* 3) barra de evolucao com barinhas (um segmento por grupo) */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {gruposCompletos} de {gruposTotais} grupos
              </span>
              <span className="text-[10px] font-semibold" style={{ color: GOLD }}>
                {pct}%
              </span>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: gruposTotais }).map((_, i) => (
                <div key={i} className="paxter-bar-track h-3 flex-1">
                  {i < gruposCompletos && (
                    <div className="paxter-bar-fill" style={{ width: "100%" }} />
                  )}
                </div>
              ))}
            </div>
          </div>
          </>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
      <main className="relative z-[1] mx-auto max-w-2xl px-6 pb-8 pt-4">
        {/* MAPA DE GRUPOS (ordem livre) — escondido no modo foco */}
        {!focusMode && (
          <div className="leva-band -mx-6 -mt-4 mb-4 rounded-b-xl rounded-t-none px-6 pb-3 pt-4">
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
              {groups.map((g, i) => (
                <GrupoChip
                  key={g.bloco}
                  label={siglaBloco(g.bloco)}
                  title={g.bloco}
                  pct={grupoPct(g)}
                  active={i === groupIdx}
                  done={g.questions.every((q) => isAnswered(answers[q.id]))}
                  refused={isRefused(g.bloco)}
                  isDark={theme === "dark"}
                  onClick={() => setGroupIdx(i)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-xl px-1.5">
        {retorno && !retornoDispensado && (
          <RetornoPanel
            retorno={retorno}
            token={token}
            questions={questions}
            answers={answers}
            onAnswer={handleAnswer}
          />
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
              className="btn-3d-soft flex h-12 items-center gap-1.5 rounded-md px-5 text-sm font-bold disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            {isLastGroup ? (
              <button
                type="button"
                onClick={finalizar}
                disabled={complete.isPending}
                className="btn-3d flex h-12 items-center gap-2 rounded-md px-5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-60"
              >
                {complete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Concluir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setGroupIdx((i) => Math.min(groups.length - 1, i + 1))}
                className="btn-3d flex h-12 items-center gap-2 rounded-md px-6 text-sm font-bold uppercase tracking-wide text-white"
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        </div>

      </main>
      </div>

      {/* BARRA INFERIOR FIXA — selo de salvamento + FAIXA DE MARCA continua, sempre visivel ao
          rolar (congelada no limite inferior). A faixa e LONGITUDINAL (full-bleed, sem cantos
          curvos), na MESMA COR do painel de questao (.footer-brand-band == cor do .leva-card)
          com relevo "up breve". A frase inglesa "Engineered by" fica EMBAIXO, centralizada sob
          o nome PADCON; a assinatura do diretor fica EM CIMA do wordmark Instituto Padua. */}
      <div className="relative z-30 shrink-0">
        {/* selo de salvamento — flutua centralizado ACIMA da faixa (sem sobrepor) */}
        <div className="pointer-events-none absolute inset-x-0 -top-9 flex justify-center px-3">
          <div
            className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-primary"
            style={{ color: saving ? "#9ca3af" : undefined, boxShadow: "0 2px 10px rgba(0,0,0,.12)" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Salvando..." : savedAt ? `Salvo às ${savedAt}` : "Tudo salvo automaticamente"}
          </div>
        </div>
        {/* FAIXA continua full-bleed: fundo de ponta a ponta, conteudo centralizado em max-w-2xl.
            px-6 (mais respiro lateral) p/ os blocos virem MEDIAIS e nao cortarem em iPhone. */}
        {/* paddingBottom respeita a AREA SEGURA do iPhone (env safe-area) p/ a faixa
            nao ser cortada pelo "chao"/indicador inferior do celular. */}
        <div
          className="footer-brand-band px-6 pt-1.5"
          style={{ paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto flex max-w-2xl items-end justify-between gap-3">
            {/* ESQUERDA: wordmark Instituto Padua CENTRALIZADO sobre a assinatura (meio
                do logo alinhado ao meio da frase). Contorno preto p/ nitidez. */}
            <div className="flex flex-col items-center">
              <PaduaWordmark height={22} outlined />
              <span
                className="footer-credit-padua mt-0.5 whitespace-nowrap text-center text-[8px] leading-none"
                style={{ fontFamily: "PaxmedNum, 'Lora', Georgia, serif", fontStyle: "italic" }}
              >
                Dr. Caio Pádua — Medical Director
              </span>
            </div>
            {/* DIREITA: wordmark PADCON CENTRALIZADO sobre "Engineered by". Contorno preto. */}
            <div className="flex flex-col items-center">
              <PadconWordmark height={14} outlined />
              <span
                className="footer-credit-padua mt-0.5 w-full whitespace-nowrap text-center text-[8px] leading-none"
                style={{ fontFamily: "PaxmedNum, 'Lora', Georgia, serif", fontStyle: "italic" }}
              >
                Engineered by
              </span>
            </div>
          </div>
        </div>
      </div>
      {retomadaAberta && respondidas > 0 && (() => {
        const lastQ = (questions ?? []).find((q) => q.id === ultimaRespondidaRef.current) ?? null;
        const idxLast = lastQ ? activeQuestions.findIndex((q) => q.id === lastQ.id) : -1;
        const proxima =
          activeQuestions.slice(idxLast + 1).find((q) => !isAnswered(answers[q.id])) ??
          activeQuestions.find((q) => !isAnswered(answers[q.id])) ??
          null;
        const continuar = () => {
          setRetomadaAberta(false);
          if (!proxima) return;
          const gi = groups.findIndex((g) => g.questions.some((q) => q.id === proxima.id));
          if (gi >= 0) setGroupIdx(gi);
          setFocusIdx(Math.max(0, activeQuestions.findIndex((q) => q.id === proxima.id)));
        };
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Você parou aqui"
            data-testid="anamnese-retomada"
          >
            <div className="leva-card w-full max-w-sm rounded-xl p-5 text-center">
              <div className="relative z-[1] flex flex-col items-center gap-3">
                <PaxterSymbolGlass size={44} tone={theme === "dark" ? "dark" : "light"} />
                <h2 className="text-base font-extrabold uppercase tracking-wide" style={{ color: GOLD }}>Você parou aqui</h2>
                {lastQ && (
                  <p className="text-[13px] leading-snug text-foreground">
                    Última pergunta respondida:
                    <span className="mt-1 block font-semibold">{formatPergunta(lastQ.pergunta)}</span>
                  </p>
                )}
                <p className="text-[12px] text-muted-foreground">{pct}% concluído · {respondidas} de {totalAtivas} perguntas</p>
                <button
                  type="button"
                  onClick={continuar}
                  className="btn-3d flex h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-bold uppercase tracking-wide text-white"
                  data-testid="anamnese-retomada-continuar"
                >
                  <Play className="h-4 w-4" /> Vamos recomeçar de onde parei
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ---------- subcomponentes ----------

// Botao com balaozinho explicativo: passar o mouse, focar ou tocar com o dedo abre a explicacao.
function TipButton({
  tip, label, onClick, className, style, expanded, children,
}: {
  tip: string; label: string; onClick: () => void; className: string; style?: CSSProperties; expanded?: boolean; children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abrir = (auto: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    setAberto(true);
    if (auto) timer.current = setTimeout(() => setAberto(false), 1600);
  };
  const fechar = () => {
    if (timer.current) clearTimeout(timer.current);
    setAberto(false);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className={className}
      style={style}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") abrir(false); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") fechar(); }}
      onPointerDown={(e) => { if (e.pointerType !== "mouse") abrir(true); }}
      onFocus={() => abrir(true)}
      onBlur={fechar}
    >
      {children}
      {aberto && (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-48 whitespace-normal rounded-md px-2.5 py-2 text-left text-[11.5px] font-medium normal-case leading-snug tracking-normal"
          style={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: `1px solid ${GOLD}`, boxShadow: "0 6px 16px rgba(0,0,0,.18)" }}
        >
          {tip}
        </span>
      )}
    </button>
  );
}

// Titulo de grupo: placa saliente (up bevel) retangular; a barra de evolucao e um trilho afundado
// (inset bevel), retangular e mais alto; porcentagem nitida. O grupo atual NAO muda de cor: ganha moldura.
function GrupoChip({
  label, title, pct, active, done, refused, compact, onClick,
}: {
  label: string; title: string; pct: number; active: boolean; done: boolean; refused: boolean; isDark?: boolean; compact?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={`${title}: ${pct}% concluído`}
      aria-current={active ? "true" : undefined}
      data-grupo-ativo={active ? "true" : undefined}
      className={`bevel-3d flex min-w-0 flex-col justify-center gap-1 rounded-[3px] px-1.5 text-foreground ${compact ? "h-[42px] w-[88px] shrink-0" : "h-[54px]"} ${refused ? "opacity-60" : ""}`}
      style={active ? { outline: `2.5px solid ${GOLD}`, outlineOffset: "2px" } : undefined}
    >
      <span className={`flex items-center justify-center gap-1 font-bold tracking-tight ${compact ? "text-[10px]" : "text-[11px]"}`}>
        {done ? <Check className="h-3 w-3 shrink-0" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="paxter-bar-track !rounded-[2px] h-[9px] flex-1" style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.45), inset 0 -1px 0 rgba(255,255,255,.35)" }}>
          {pct > 0 && <span className="paxter-bar-fill !rounded-[1px] block h-full" style={{ width: `${pct}%` }} />}
        </span>
        <span className="w-8 shrink-0 text-right text-[10.5px] font-extrabold leading-none tabular-nums">{pct}%</span>
      </span>
    </button>
  );
}

// Trilho rolavel: deixa claro que da para arrastar para os lados (bordas com sombra + setas).
function Trilho({ children, ativoKey }: { children: ReactNode; ativoKey: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [esq, setEsq] = useState(false);
  const [dir, setDir] = useState(false);
  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEsq(el.scrollLeft > 4);
    setDir(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    medir();
    const el = ref.current;
    el?.querySelector<HTMLElement>('[data-grupo-ativo="true"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [ativoKey, medir]);
  const rolar = (d: number) => ref.current?.scrollBy({ left: d * 180, behavior: "smooth" });
  const seta = "absolute top-1/2 z-10 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-[3px] bevel-3d text-foreground";
  return (
    <div className="relative rounded-[4px] px-7 py-1.5" style={{ background: "rgba(0,0,0,0.10)", boxShadow: "inset 0 2px 5px rgba(0,0,0,.35), inset 0 -1px 0 rgba(255,255,255,.25)" }} role="group" aria-label="Grupos de perguntas (deslize para os lados)">
      {esq && <button type="button" onClick={() => rolar(-1)} aria-label="Ver grupos anteriores" className={`${seta} left-0.5`}><ChevronLeft className="h-4 w-4" /></button>}
      <div ref={ref} onScroll={medir} className="flex gap-2.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]" style={{ scrollSnapType: "x proximity" }}>
        {children}
      </div>
      {dir && <button type="button" onClick={() => rolar(1)} aria-label="Ver próximos grupos" className={`${seta} right-0.5`}><ChevronRight className="h-4 w-4" /></button>}
    </div>
  );
}

// Siglas que devem permanecer em CAIXA-ALTA mesmo na exibicao em caixa-baixa.
const PERGUNTA_SIGLAS = new Set([
  "CPF", "RG", "CEP", "IMC", "TSH", "HDL", "LDL", "DNA", "HIV", "DST", "IST",
  "PA", "FC", "IV", "IM", "SC", "SUS", "CRM", "COREN", "RX", "USG", "TC", "RM",
  "RNM", "ECG", "PCR", "HAS", "DM", "DPOC", "AVC", "IAM", "TPM", "DIU", "SOP", "HPV",
]);

// Sigla curta do bloco para o navegador de grupos: pega a PRIMEIRA PALAVRA apos
// o prefixo "A. ", aplica caixa de titulo e trunca em SIGLA_MAX letras + ponto.
// Palavra com ate SIGLA_MAX letras aparece inteira (sem ponto).
// Ex.: "E. CIRURGIAS E INTERNACOES" -> "Cirur."; "M. EIXOS..." -> "Eixos".
const SIGLA_MAX = 14;
function sigla(bloco: string): string {
  const semPrefixo = bloco.replace(/^[A-Za-z]\.\s*/, "");
  const primeira = semPrefixo.split(/[\s/\-]+/).filter(Boolean)[0] ?? bloco;
  const limpa = primeira.replace(/[^A-Za-zÀ-ÿ]/g, "") || bloco;
  const titulo = limpa.charAt(0).toUpperCase() + limpa.slice(1).toLowerCase();
  return titulo.length <= SIGLA_MAX ? titulo : `${titulo.slice(0, SIGLA_MAX)}…`;
}

function siglaBloco(bloco: string): string {
  return sigla(bloco);
}

// Estilo 3D dos chips do navegador de grupos (sem branco; recesso dourado-suave
// no estado inerte; concluido VERDE elevado; ativo navy + anel ouro). Controlado
// por tema (claro/escuro). So acabamento — nao toca logica.
function gchipStyle(active: boolean, done: boolean, ref: boolean, isDark: boolean): CSSProperties {
  if (active) {
    // No tema ESCURO --primary e quase branco (210 22% 92%): usar essa cor de fundo
    // deixava o botao selecionado BRANCO com texto branco (sumia). Por isso o ativo
    // tem fundo navy explicito no escuro; no claro --primary ja e navy e contrasta.
    return isDark
      ? {
          background: "linear-gradient(180deg, #1f4377 0%, #15315a 100%)",
          boxShadow: `0 0 0 2px ${GOLD}, 0 4px 12px -4px rgba(0,0,0,0.6)`,
          color: "#ffffff",
        }
      : {
          background: "linear-gradient(180deg, hsl(var(--primary) / 0.95), hsl(var(--primary) / 0.78))",
          boxShadow: `0 0 0 2px ${GOLD}, 0 4px 10px -4px hsl(var(--primary) / 0.5)`,
          color: "#ffffff",
        };
  }
  if (done) {
    return isDark
      ? {
          background: "linear-gradient(180deg, rgba(16,122,87,0.34), rgba(16,122,87,0.20))",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 0 -1px rgba(5,80,55,0.9), 0 7px 12px -6px rgba(16,122,87,0.55)",
          color: "#6ee7b7",
        }
      : {
          background: "linear-gradient(180deg, rgba(16,122,87,0.20), rgba(16,122,87,0.10))",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 0 -1px rgba(16,122,87,0.45), 0 7px 12px -6px rgba(16,122,87,0.4)",
          color: "#0e7a57",
        };
  }
  if (ref) {
    return isDark
      ? { background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)", color: "#7c8aa3" }
      : { background: "hsl(var(--muted))", boxShadow: "inset 0 0 0 1px hsl(var(--border))", color: "hsl(var(--muted-foreground))" };
  }
  return isDark
    ? {
        background: "linear-gradient(180deg, #16304f 0%, #102540 100%)",
        boxShadow: "inset 0 2px 5px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(0,0,0,0.5)",
        color: "#9fb2cc",
      }
    : {
        background: "linear-gradient(180deg, #f3ecda 0%, #e8dec9 100%)",
        boxShadow: "inset 0 2px 4px rgba(7,22,43,0.10), inset 0 -1px 0 rgba(255,255,255,0.9), 0 0 0 1px rgba(138,109,47,0.20)",
        color: "#6b6450",
      };
}

// Separa o texto explicativo entre parenteses do corpo da pergunta. O corpo fica
// na fonte elegante (Lora via .leva-q); as notas vao em fonte sans, menores, abaixo.
function splitNotas(texto: string): { main: string; notas: string[] } {
  const notas: string[] = [];
  const main = texto
    .replace(/\(([^)]*)\)/g, (_m, inner) => {
      const t = String(inner).trim();
      if (t) notas.push(t);
      return "";
    })
    .replace(/\s+([?!.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { main, notas };
}

// Exibe a pergunta com apenas a inicial maiuscula; siglas conhecidas seguem
// em caixa-alta. NAO altera o dado de origem (banco continua em caixa-alta);
// e apenas formatacao de apresentacao.
function formatPergunta(texto: string | null | undefined): string {
  if (!texto) return "";
  const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const tudoMaiusculo = letras.length > 0 && letras === letras.toUpperCase();
  if (!tudoMaiusculo) return texto;
  let primeiraFeita = false;
  return texto.replace(/[A-Za-zÀ-ÿ]+/g, (palavra) => {
    if (PERGUNTA_SIGLAS.has(palavra.toUpperCase())) {
      // Sigla inicial conta como "primeira palavra feita": o que vem depois fica minusculo.
      primeiraFeita = true;
      return palavra.toUpperCase();
    }
    const minuscula = palavra.toLowerCase();
    if (!primeiraFeita) {
      primeiraFeita = true;
      return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
    }
    return minuscula;
  });
}

// Cabecalho de marca Paxter: FONTE UNICA (cupula de vidro + PAXTER + frase 3D, mesma luz).
function BrandMark({ tone }: { tone: "dark" | "light" }) {
  return (
    <div className="pb-1 pt-1.5">
      <PaxterLockup orientation="vertical" symbolPx={66} wordWidth={236} showTagline tone={tone} />
    </div>
  );
}

function MiniMeter({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="leva-kpi flex items-center justify-center gap-1 rounded-[4px] px-1 py-0.5">
      <span className="leva-kpi-label">{icon}</span>
      <span className="leva-kpi-value text-[10px] font-extrabold leading-none">{value}</span>
    </div>
  );
}

function Meter({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="leva-kpi flex flex-col items-center gap-0.5 rounded-md px-1 py-2">
      <span className="leva-kpi-label flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide">
        {icon}
        {label}
      </span>
      <span className="leva-kpi-value text-sm font-extrabold">
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
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const referencia = (q as unknown as { referencia?: { titulo?: string; motivo?: string; fonte?: string; url?: string | null } | null }).referencia ?? null;
  const temAjuda = !!q.observacao || !!referencia;
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
      data-qid={q.id}
      className="leva-card leva-card-calm scroll-mt-3 rounded-md p-3"
      style={q.eSinalAlarme ? { boxShadow: "0 0 0 2px #ef4444, 0 6px 16px rgba(0,0,0,.18)" } : undefined}
    >
      <div className="relative z-[1] mb-2 flex items-start justify-between gap-2">
        {(() => {
          const { main, notas } = splitNotas(formatPergunta(q.pergunta));
          return (
            <div className="min-w-0">
              <p className="leva-q text-[13.5px] leading-snug text-foreground">{main}</p>
              {notas.map((n, i) => (
                <p
                  key={i}
                  className="mt-1 font-sans text-[12px] font-medium leading-snug text-muted-foreground"
                >
                  ({n})
                </p>
              ))}
            </div>
          );
        })()}
        <div className="flex shrink-0 items-center gap-1">
          {q.eSinalAlarme && (
            <span className="flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600 dark:bg-red-950/60 dark:text-red-300">
              <span className="paxter-led-alert" aria-hidden="true" />
              <AlertTriangle className="h-3 w-3" /> Atenção
            </span>
          )}
          {answered && <Check className="h-4 w-4" style={{ color: GOLD }} />}
        </div>
      </div>

      {/* Video explicativo opcional (player inline; toggle vive na fileira de acoes) */}
      {q.videoUrl && showVideo && (
        <div className="relative z-[1] mb-3">
          <video
            src={q.videoUrl}
            controls
            autoPlay
            className="w-full rounded-md"
            style={{ maxHeight: 220 }}
          />
        </div>
      )}

      <div className="relative z-[1]">
        <ControlRenderer question={q} value={value} onChange={(v, o) => onAnswer(q, v, o)} />
      </div>

      {/* Exemplo de preenchimento */}
      {q.exemplo && <p className="relative z-[1] mt-2 text-[12px] italic text-gray-400">{q.exemplo}</p>}

      {/* Fileira de acoes: Ouvir | Video a esquerda; "?" discreto a direita abre a explicacao detalhada
          (o que significa, por que perguntamos e de onde vem). Menos texto fixo na tela. */}
      {(q.audioUrl || q.videoUrl || temAjuda) && (
        <div className="relative z-[1] mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {q.audioUrl && (
              <button
                type="button"
                onClick={toggleAudio}
                aria-label={playing ? "Parar leitura da pergunta" : "Ouvir a pergunta"}
                className="leva-action inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
              >
                {playing ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {playing ? "Parar" : "Ouvir"}
              </button>
            )}
            {q.videoUrl && (
              <button
                type="button"
                onClick={() => setShowVideo((v) => !v)}
                aria-label={showVideo ? "Ocultar vídeo explicativo" : "Ver vídeo explicativo"}
                className="leva-action inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
              >
                <Play className="h-3.5 w-3.5" /> Vídeo
              </button>
            )}
          </div>
          {temAjuda && (
            <button
              type="button"
              onClick={() => setAjudaAberta((v) => !v)}
              aria-expanded={ajudaAberta}
              aria-label="Entender melhor esta pergunta"
              data-testid="pergunta-ajuda"
              className="btn-3d-soft ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ color: GOLD }}
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {temAjuda && ajudaAberta && (
        <div className="relative z-[1] mt-2 flex flex-col gap-1.5 rounded-md bg-muted px-3 py-2 text-[12px] leading-snug text-muted-foreground" data-testid="pergunta-ajuda-painel">
          {q.observacao && (
            <p className="whitespace-pre-line"><span className="font-semibold text-foreground">O que significa: </span>{q.observacao}</p>
          )}
          {referencia?.motivo && (
            <p><span className="font-semibold text-foreground">Por que perguntamos: </span>{referencia.motivo}</p>
          )}
          {referencia && (referencia.titulo || referencia.fonte) && (
            <p>
              <span className="font-semibold text-foreground">De onde vem: </span>
              {[referencia.titulo, referencia.fonte].filter(Boolean).join(" — ")}
              {referencia.url && (
                <>
                  {" "}
                  <a href={referencia.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: GOLD }}>
                    Abrir a fonte
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      )}
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
  // Ao escolher uma resposta (toque unico), a tela ja sobe ate a proxima pergunta sem resposta.
  const responder = (q: AnamneseQuestion, v: Valor, opts?: { commit?: boolean }) => {
    onAnswer(q, v, opts);
    if (!opts?.commit) return;
    const i = group.questions.findIndex((x) => x.id === q.id);
    const proxima = group.questions.slice(i + 1).find((x) => !isAnswered(answers[x.id])) ?? group.questions[i + 1];
    if (!proxima) return;
    requestAnimationFrame(() => {
      document.querySelector(`[data-qid="${proxima.id}"]`)?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="bevel-3d rounded-md px-3 py-2 text-sm font-bold uppercase tracking-wide text-primary">
          {group.bloco}
        </h2>
        {podeRecusar && (
          <button
            type="button"
            onClick={onToggleRefuse}
            className="btn-3d-soft flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold"
            style={refused ? { boxShadow: `0 0 0 2px ${GOLD}`, color: GOLD } : undefined}
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
        // gap-5 = mais RESPIRO vertical entre cartoes (o tecido creme aparece entre eles).
        <div className="flex flex-col gap-7">
          {group.questions.map((q) => (
            <QuestionCard key={q.id} q={q} value={answers[q.id]} onAnswer={responder} />
          ))}
        </div>
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
          className="btn-3d-soft flex h-12 items-center gap-1.5 rounded-md px-5 text-sm font-bold disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar
        </button>
        {last ? (
          <button
            type="button"
            onClick={onFinish}
            disabled={finishing}
            className="btn-3d flex h-12 items-center gap-2 rounded-md px-5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-60"
          >
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Concluir
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="btn-3d flex h-12 items-center gap-2 rounded-md px-6 text-sm font-bold uppercase tracking-wide text-white"
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
    <div className="leva-card mt-5 rounded-md p-3">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
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
              <div className="paxter-bar-track h-3 flex-1">
                <div
                  className="paxter-bar-fill transition-all duration-500"
                  style={
                    ref
                      ? ({ width: `${p}%`, "--fill": "#cbd5e1" } as CSSProperties)
                      : ({ width: `${p}%` } as CSSProperties)
                  }
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
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-xl">
        <div className="panel-3d-hero mb-5 rounded-md p-6 text-center">
          <div className="mb-4 flex items-center justify-center">
            <PaxterLogo variant="compact" tone="light" />
          </div>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-md bg-primary">
            <Check className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-primary">
            Anamnese concluída
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {respondidas} de {total} perguntas respondidas. Obrigado!
          </p>
        </div>

        {(diag.length > 0 || susp.length > 0) && (
          <div className="panel-3d rounded-md p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary">
              <Activity className="h-4 w-4" /> Resumo para sua equipe clínica
            </h2>
            {diag.length > 0 && (
              <FindingGroup title="Relatado por você" items={diag} color={GOLD} />
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
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
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
  theme,
  onToggleTheme,
}: {
  onStart: (portalToken?: string) => void;
  pending: boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
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
      className="area-elite flex min-h-screen flex-col bg-background text-foreground"
      style={{ ["--brand" as any]: NAVY }}
    >
      <header className="panel-3d relative flex flex-col items-center justify-center gap-2 border-b border-border px-4 py-6">
        <div className="absolute right-3 top-3">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <PaxterLogo variant="appHeader" tone="light" />
        <p className="text-[10px] uppercase tracking-[0.22em] text-accent">
          Ficha de Saúde — Anamnese
        </p>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="panel-3d overflow-hidden rounded-xl">
            <div className="bg-primary px-5 py-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-accent" />
                <h2 className="text-sm font-black uppercase tracking-widest text-primary-foreground">
                  Identificação
                </h2>
              </div>
              <p className="mt-1 text-xs text-primary-foreground/70">
                CPF e data de nascimento para começar sua anamnese
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-primary">
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
                  className="concave-3d h-12 w-full rounded-lg px-4 font-mono text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: GOLD }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-primary">
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
                  className="concave-3d h-12 w-full rounded-lg px-4 font-mono text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: GOLD }}
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
              className="text-[11px] uppercase tracking-widest text-muted-foreground hover:text-accent disabled:opacity-40"
            >
              Entrar como demonstração (sem identificar)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
