import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Loader2,
  Send,
  Copy,
  Check,
  Power,
  RotateCcw,
  Clock,
  Pill,
  Users,
  Eye,
  AlarmClock,
  CircleSlash,
  Plus,
  X,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { BASE, ConsoleShell, BlockTitle } from "./_shared";

// ===========================================================================
// CENTRAL DE LEMBRETES — painel único de gestão do lembrete de prescrição por
// cliente (motor por período, Mensageria PAXMED). Aqui o CEO vê TODOS os clientes
// com lembrete, o próximo disparo do dia, o último envio, liga/desliga à mão
// (Opção B), EDITA horários e campos ricos por fórmula (Opção A) e pré-visualiza
// a mensagem REAL. Design 3D Paxter, marca PAXTER, sem envio real (só prévia +
// copiar + WhatsApp). Escritas abertas (admin single-tenant, igual à Carta).
// ===========================================================================

type UltimoEnvio = { janela: string; status: string; enviadoEm: string | null } | null;
interface LembreteResumo {
  clienteId: number;
  lembreteId: number;
  nome: string;
  telefone: string | null;
  ativo: boolean;
  ativoManual: boolean | null;
  qtdePeriodos: number;
  qtdeFormulas: number;
  horariosEnvio: string[];
  ultimoEnvio: UltimoEnvio;
  proximaJanelaHoje: string | null;
}

interface FormulaJson {
  nome: string;
  ativoPrincipal?: string;
  dose?: string;
  horario?: string;
  observacaoRefeicao?: string;
  posologia?: string;
}
interface PeriodoJson {
  sigla?: string;
  nome: string;
  tipo: "tomar" | "nao_tomar";
  formulas: FormulaJson[];
}
interface DetalheLembrete {
  lembreteId: number;
  clienteId: number;
  ativo: boolean;
  ativoManual: boolean | null;
  periodos: PeriodoJson[];
  horariosEnvio: string[];
  observacao: string | null;
  nome: string;
  telefone: string | null;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Traduz o estado de disparo em rótulo + cor da luz de vela.
function estadoLuz(l: LembreteResumo): { cls: string; label: string; color: string } {
  if (!l.ativo) {
    return {
      cls: "paxter-led-amber",
      label: l.ativoManual === false ? "Desligado à mão" : "Sem fórmulas",
      color: "text-amber-700 dark:text-amber-400",
    };
  }
  return { cls: "paxter-led-green", label: "Ativo", color: "text-emerald-700 dark:text-emerald-400" };
}

// Selo do último envio (C2): ENVIADO / FALHOU / PENDENTE / — com cor por estado.
function seloEnvio(u: UltimoEnvio): { label: string; cls: string } {
  if (!u) return { label: "—", cls: "text-muted-foreground" };
  const s = (u.status || "").toUpperCase();
  if (s === "ENVIADO") return { label: "ENVIADO", cls: "text-emerald-700 dark:text-emerald-400" };
  if (s === "FALHOU") return { label: "FALHOU", cls: "text-rose-700 dark:text-rose-400" };
  if (s === "SEM_TWILIO") return { label: "SEM TWILIO", cls: "text-amber-700 dark:text-amber-400" };
  return { label: s || "PENDENTE", cls: "text-amber-700 dark:text-amber-400" };
}

// Só dígitos do telefone para o link wa.me (formato internacional Brasil 55).
function telParaWa(tel: string | null): string | null {
  if (!tel) return null;
  const d = tel.replace(/\D/g, "");
  if (!d) return null;
  return d.startsWith("55") ? d : `55${d}`;
}

export default function CentralLembretes() {
  const [lista, setLista] = useState<LembreteResumo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [selId, setSelId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState<number | null>(null);

  const [previa, setPrevia] = useState<string>("");
  const [previaLoading, setPreviaLoading] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Editor (Opção A) — detalhe rico do cliente selecionado.
  const [detalhe, setDetalhe] = useState<DetalheLembrete | null>(null);
  const [editHorarios, setEditHorarios] = useState<string[]>([]);
  const [novoHorario, setNovoHorario] = useState("");
  const [editPeriodos, setEditPeriodos] = useState<PeriodoJson[]>([]);
  const [salvandoHorarios, setSalvandoHorarios] = useState(false);
  const [salvandoPeriodos, setSalvandoPeriodos] = useState(false);
  const [msgEditor, setMsgEditor] = useState<string>("");

  const carregar = useCallback(() => {
    setLoading(true);
    return fetch(`${BASE}/api/lembretes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("lista"))))
      .then((d: { lembretes: LembreteResumo[] }) => {
        setLista(d.lembretes);
        setErro(false);
        setSelId((atual) => atual ?? d.lembretes[0]?.clienteId ?? null);
      })
      .catch(() => setErro(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const selecionado = useMemo(
    () => lista?.find((l) => l.clienteId === selId) ?? null,
    [lista, selId],
  );

  // Carrega a prévia REAL + o detalhe editável do cliente selecionado.
  useEffect(() => {
    if (selId == null) {
      setPrevia("");
      setDetalhe(null);
      setEditHorarios([]);
      setEditPeriodos([]);
      return;
    }
    let alive = true;
    setMsgEditor("");
    setPreviaLoading(true);
    fetch(`${BASE}/api/lembretes/${selId}/preview`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("preview"))))
      .then((d: { mensagem: string }) => {
        if (alive) setPrevia(d.mensagem);
      })
      .catch(() => {
        if (alive) setPrevia("");
      })
      .finally(() => {
        if (alive) setPreviaLoading(false);
      });

    fetch(`${BASE}/api/lembretes/${selId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("detalhe"))))
      .then((d: { lembrete: DetalheLembrete }) => {
        if (!alive) return;
        setDetalhe(d.lembrete);
        setEditHorarios([...d.lembrete.horariosEnvio]);
        setEditPeriodos(JSON.parse(JSON.stringify(d.lembrete.periodos)) as PeriodoJson[]);
      })
      .catch(() => {
        if (alive) {
          setDetalhe(null);
          setEditHorarios([]);
          setEditPeriodos([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [selId]);

  // Recarrega a prévia após salvar edição (mantém a mensagem em dia).
  const recarregarPrevia = useCallback((clienteId: number) => {
    setPreviaLoading(true);
    fetch(`${BASE}/api/lembretes/${clienteId}/preview`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("preview"))))
      .then((d: { mensagem: string }) => setPrevia(d.mensagem))
      .catch(() => setPrevia(""))
      .finally(() => setPreviaLoading(false));
  }, []);

  // Aplica o detalhe retornado pelo PATCH na lista + no editor.
  function aplicarDetalhe(d: DetalheLembrete) {
    setDetalhe(d);
    setEditHorarios([...d.horariosEnvio]);
    setEditPeriodos(JSON.parse(JSON.stringify(d.periodos)) as PeriodoJson[]);
    setLista((prev) =>
      prev
        ? prev.map((l) =>
            l.clienteId === d.clienteId
              ? {
                  ...l,
                  ativo: d.ativo,
                  ativoManual: d.ativoManual,
                  horariosEnvio: d.horariosEnvio,
                  qtdePeriodos: d.periodos.length,
                  qtdeFormulas: d.periodos.reduce((a, p) => a + p.formulas.length, 0),
                }
              : l,
          )
        : prev,
    );
  }

  // PATCH do override manual (Opção B): true (forçar ligado), false (desligar),
  // null (voltar ao automático — segue as fórmulas).
  async function definirManual(clienteId: number, valor: boolean | null) {
    setSalvando(clienteId);
    try {
      const r = await fetch(`${BASE}/api/lembretes/${clienteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativoManual: valor }),
      });
      if (r.ok) {
        const d = (await r.json()) as { lembrete: DetalheLembrete };
        aplicarDetalhe(d.lembrete);
      }
    } finally {
      setSalvando(null);
    }
  }

  // Salva a lista de horários de envio (HH:MM validados) → PATCH horariosEnvio.
  async function salvarHorarios() {
    if (selId == null) return;
    const invalido = editHorarios.find((h) => !HHMM.test(h.trim()));
    if (invalido !== undefined) {
      setMsgEditor("Horário inválido — use o formato HH:MM (ex.: 07:30).");
      return;
    }
    setSalvandoHorarios(true);
    setMsgEditor("");
    try {
      const r = await fetch(`${BASE}/api/lembretes/${selId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horariosEnvio: editHorarios }),
      });
      if (r.ok) {
        const d = (await r.json()) as { lembrete: DetalheLembrete };
        aplicarDetalhe(d.lembrete);
        recarregarPrevia(selId);
        setMsgEditor("Horários salvos.");
      } else {
        setMsgEditor("Não foi possível salvar os horários.");
      }
    } catch {
      setMsgEditor("Não foi possível salvar os horários.");
    } finally {
      setSalvandoHorarios(false);
    }
  }

  function adicionarHorario() {
    const h = novoHorario.trim();
    if (!HHMM.test(h)) {
      setMsgEditor("Horário inválido — use o formato HH:MM (ex.: 07:30).");
      return;
    }
    if (editHorarios.includes(h)) {
      setNovoHorario("");
      return;
    }
    setEditHorarios((prev) => [...prev, h].sort());
    setNovoHorario("");
    setMsgEditor("");
  }

  function removerHorario(h: string) {
    setEditHorarios((prev) => prev.filter((x) => x !== h));
  }

  // Edita um campo rico de uma fórmula no rascunho local.
  function setCampoFormula(
    pi: number,
    fi: number,
    campo: keyof FormulaJson,
    valor: string,
  ) {
    setEditPeriodos((prev) => {
      const clone = prev.map((p) => ({ ...p, formulas: p.formulas.map((f) => ({ ...f })) }));
      clone[pi].formulas[fi][campo] = valor;
      return clone;
    });
  }

  // Salva os campos ricos por fórmula → PATCH periodos (limpa strings vazias).
  async function salvarPeriodos() {
    if (selId == null) return;
    setSalvandoPeriodos(true);
    setMsgEditor("");
    const limpo = editPeriodos.map((p) => ({
      sigla: p.sigla,
      nome: p.nome,
      tipo: p.tipo,
      formulas: p.formulas.map((f) => {
        const t = (v?: string) => (v && v.trim() ? v.trim() : undefined);
        return {
          nome: f.nome,
          ativoPrincipal: t(f.ativoPrincipal),
          dose: t(f.dose),
          horario: t(f.horario),
          observacaoRefeicao: t(f.observacaoRefeicao),
          posologia: t(f.posologia),
        };
      }),
    }));
    try {
      const r = await fetch(`${BASE}/api/lembretes/${selId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodos: limpo }),
      });
      if (r.ok) {
        const d = (await r.json()) as { lembrete: DetalheLembrete };
        aplicarDetalhe(d.lembrete);
        recarregarPrevia(selId);
        setMsgEditor("Prescrição salva.");
      } else {
        setMsgEditor("Não foi possível salvar a prescrição.");
      }
    } catch {
      setMsgEditor("Não foi possível salvar a prescrição.");
    } finally {
      setSalvandoPeriodos(false);
    }
  }

  function copiar() {
    if (!previa) return;
    navigator.clipboard.writeText(previa).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  function abrirWhatsapp() {
    if (!previa) return;
    const wa = telParaWa(selecionado?.telefone ?? null);
    const url = wa
      ? `https://wa.me/${wa}?text=${encodeURIComponent(previa)}`
      : `https://wa.me/?text=${encodeURIComponent(previa)}`;
    window.open(url, "_blank", "noopener");
  }

  if (loading) {
    return (
      <ConsoleShell icon={BellRing} title="Central de Lembretes" subtitle="Motor de prescrição por período — gestão por cliente">
        <div className="panel-3d flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ConsoleShell>
    );
  }

  if (erro || !lista) {
    return (
      <ConsoleShell icon={BellRing} title="Central de Lembretes" subtitle="Motor de prescrição por período — gestão por cliente">
        <div className="panel-3d p-6 text-sm text-rose-700 dark:text-rose-400">
          Não foi possível carregar os lembretes. Tente recarregar a página.
        </div>
      </ConsoleShell>
    );
  }

  const totalAtivos = lista.filter((l) => l.ativo).length;
  const totalManualOff = lista.filter((l) => l.ativoManual === false).length;
  const ligadoDetalhe = detalhe ? detalhe.ativoManual !== false && detalhe.periodos.length > 0 : false;

  return (
    <ConsoleShell
      icon={BellRing}
      title="Central de Lembretes"
      subtitle="Motor de prescrição por período — a mesma composição da Carta de Encantamento"
    >
      {/* Painel de contagem (KPI) — 3 selos gravados. */}
      <section className="panel-3d p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
            <Users className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Clientes</p>
              <p className="text-lg font-bold leading-none">{lista.length}</p>
            </div>
          </div>
          <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
            <BellRing className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Ativos</p>
              <p className="text-lg font-bold leading-none">{totalAtivos}</p>
            </div>
          </div>
          <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
            <CircleSlash className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Desligados à mão</p>
              <p className="text-lg font-bold leading-none">{totalManualOff}</p>
            </div>
          </div>
        </div>
      </section>

      {lista.length === 0 ? (
        <section className="panel-3d p-8 text-center">
          <BellRing className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum lembrete de prescrição ainda. Eles nascem quando um protocolo com fórmulas por
            período é lançado no Cockpit do cliente.
          </p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_460px]">
          {/* ── COLUNA ESQUERDA: lista de clientes com lembrete ── */}
          <div className="space-y-3">
            {lista.map((l) => {
              const luz = estadoLuz(l);
              const selo = seloEnvio(l.ultimoEnvio);
              const ativo = selId === l.clienteId;
              return (
                <div
                  key={l.clienteId}
                  role="button"
                  tabIndex={0}
                  aria-pressed={ativo}
                  onClick={() => setSelId(l.clienteId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelId(l.clienteId);
                    }
                  }}
                  className={`panel-3d-sub w-full cursor-pointer p-4 text-left transition-[box-shadow] ${
                    ativo ? "ring-1 ring-primary/60" : ""
                  }`}
                >
                  {/* ZONA cabeçalho: ID + luz | nome | estado */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="concave-3d shrink-0 px-2 py-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                        #{l.clienteId}
                      </span>
                      <span className={`paxter-led paxter-led-breathe ${luz.cls} shrink-0`} />
                      <h3 className="truncate text-sm font-semibold uppercase tracking-[0.06em]">{l.nome}</h3>
                    </div>
                    <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${luz.color}`}>
                      {luz.label}
                    </span>
                  </div>

                  {/* ZONA meta: fórmulas · períodos · próximo horário · último envio */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="concave-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-foreground/80">
                      <Pill className="h-3.5 w-3.5 text-primary" /> {l.qtdeFormulas} fórmula{l.qtdeFormulas === 1 ? "" : "s"}
                    </span>
                    <span className="concave-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-foreground/80">
                      <Clock className="h-3.5 w-3.5 text-primary" /> {l.qtdePeriodos} período{l.qtdePeriodos === 1 ? "" : "s"}
                    </span>
                    <span className="concave-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-foreground/80">
                      <AlarmClock className="h-3.5 w-3.5 text-primary" />
                      {l.proximaJanelaHoje ? `Próximo hoje ${l.proximaJanelaHoje}` : "Nada hoje"}
                    </span>
                    <span className="concave-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold">
                      <Send className="h-3.5 w-3.5 text-primary" />
                      <span className={selo.cls}>{selo.label}</span>
                    </span>
                  </div>

                  {/* ZONA ação: override manual (Opção B) */}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        definirManual(l.clienteId, l.ativo ? false : true);
                      }}
                      disabled={salvando === l.clienteId}
                      className="btn-3d-soft inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-50"
                    >
                      {salvando === l.clienteId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                      {l.ativo ? "Desligar" : "Ligar"}
                    </button>
                    {l.ativoManual !== null ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          definirManual(l.clienteId, null);
                        }}
                        disabled={salvando === l.clienteId}
                        className="btn-3d-soft inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-50"
                        title="Voltar ao automático (segue as fórmulas)"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Automático
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Automático
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── COLUNA DIREITA: editor + prévia REAL do cliente selecionado ── */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {/* Editor de disparo + horários + prescrição (Opção A) */}
            {detalhe ? (
              <section className="panel-3d p-4">
                <BlockTitle icon={SlidersHorizontal}>
                  Configuração · {detalhe.nome.split(/\s+/)[0]}
                </BlockTitle>

                {/* Toggle liga/desliga à mão (Opção B, no detalhe) */}
                <div className="concave-3d flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-foreground/80">
                      Lembrete ligado
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      O comando manual vence o automático. Sem fórmulas, nunca dispara.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => definirManual(detalhe.clienteId, ligadoDetalhe ? false : true)}
                    disabled={salvando === detalhe.clienteId}
                    aria-pressed={ligadoDetalhe}
                    className={`btn-3d inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-50 ${
                      ligadoDetalhe ? "" : "opacity-80"
                    }`}
                  >
                    {salvando === detalhe.clienteId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="h-3.5 w-3.5" />
                    )}
                    {ligadoDetalhe ? "Ligado" : "Desligado"}
                  </button>
                </div>

                {/* Editor de horários de envio */}
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Horários de envio
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {editHorarios.length === 0 ? (
                      <span className="text-[12px] text-muted-foreground">Nenhum horário definido.</span>
                    ) : (
                      editHorarios.map((h) => (
                        <span
                          key={h}
                          className="concave-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold text-foreground/90"
                        >
                          <Clock className="h-3.5 w-3.5 text-primary" /> {h}
                          <button
                            type="button"
                            onClick={() => removerHorario(h)}
                            className="ml-0.5 text-muted-foreground hover:text-rose-600"
                            title="Remover horário"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="time"
                      value={novoHorario}
                      onChange={(e) => setNovoHorario(e.target.value)}
                      className="field-engraved h-8 w-28 bg-transparent px-2 text-[13px] text-foreground outline-none"
                    />
                    <button
                      type="button"
                      onClick={adicionarHorario}
                      className="btn-3d-soft inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </button>
                    <button
                      type="button"
                      onClick={salvarHorarios}
                      disabled={salvandoHorarios}
                      className="btn-3d ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-50"
                    >
                      {salvandoHorarios ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Salvar horários
                    </button>
                  </div>
                </div>

                {/* Editor por fórmula (campos ricos — Opção A) */}
                <div className="mt-4">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Prescrição por fórmula
                  </p>
                  {editPeriodos.length === 0 ? (
                    <div className="concave-3d px-3 py-4 text-center text-[12px] text-muted-foreground">
                      Sem fórmulas neste lembrete.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {editPeriodos.map((p, pi) => (
                        <div key={`${p.sigla ?? ""}-${pi}`} className="concave-3d p-3">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-primary">
                            {p.nome}
                          </p>
                          <div className="space-y-3">
                            {p.formulas.map((f, fi) => (
                              <div key={`${f.nome}-${fi}`} className="panel-3d-sub p-2.5">
                                <p className="mb-2 truncate text-[12px] font-semibold text-foreground/90">
                                  {f.nome}
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                  <CampoRico
                                    label="Dose"
                                    value={f.dose ?? ""}
                                    onChange={(v) => setCampoFormula(pi, fi, "dose", v)}
                                  />
                                  <CampoRico
                                    label="Horário"
                                    value={f.horario ?? ""}
                                    onChange={(v) => setCampoFormula(pi, fi, "horario", v)}
                                  />
                                  <CampoRico
                                    label="Ativo principal"
                                    value={f.ativoPrincipal ?? ""}
                                    onChange={(v) => setCampoFormula(pi, fi, "ativoPrincipal", v)}
                                  />
                                  <CampoRico
                                    label="Refeição"
                                    value={f.observacaoRefeicao ?? ""}
                                    onChange={(v) => setCampoFormula(pi, fi, "observacaoRefeicao", v)}
                                  />
                                  <div className="col-span-2">
                                    <CampoRico
                                      label="Posologia"
                                      value={f.posologia ?? ""}
                                      onChange={(v) => setCampoFormula(pi, fi, "posologia", v)}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={salvarPeriodos}
                        disabled={salvandoPeriodos}
                        className="btn-3d inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide disabled:opacity-50"
                      >
                        {salvandoPeriodos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar prescrição
                      </button>
                    </div>
                  )}
                </div>

                {msgEditor ? (
                  <p className="mt-3 text-center text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {msgEditor}
                  </p>
                ) : null}
              </section>
            ) : null}

            {/* Prévia REAL */}
            <section className="panel-3d p-4">
              <BlockTitle icon={Eye}>
                Prévia real{selecionado ? ` · ${selecionado.nome.split(/\s+/)[0]}` : ""}
              </BlockTitle>
              {previaLoading ? (
                <div className="concave-3d flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : previa ? (
                <div
                  className="concave-3d whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-foreground/90"
                  style={{ maxHeight: "50vh", overflowY: "auto", fontFamily: "PaxmedNum, 'Georgia', serif" }}
                >
                  {previa}
                </div>
              ) : (
                <div className="concave-3d px-4 py-10 text-center text-[13px] text-muted-foreground">
                  Selecione um cliente à esquerda para ver a mensagem real que o motor enviaria.
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={copiar}
                  disabled={!previa}
                  className="btn-3d-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide disabled:opacity-50"
                >
                  {copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copiado ? "Copiado" : "Copiar"}
                </button>
                <button
                  type="button"
                  onClick={abrirWhatsapp}
                  disabled={!previa}
                  className="btn-3d inline-flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> WhatsApp
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                Prévia e envio manual — o motor automático dispara nos horários programados.
              </p>
            </section>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}

// Campo rico gravado (rótulo em cima, input engravado). Controlado pelo pai.
function CampoRico({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-engraved h-8 w-full bg-transparent px-2 text-[12px] text-foreground outline-none"
      />
    </label>
  );
}
