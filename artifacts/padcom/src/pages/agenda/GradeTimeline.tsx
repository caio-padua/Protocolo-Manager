import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BellRing, CalendarClock, Check, Clock, Lock, Repeat, Volume2, VolumeX, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatStatus } from "@/lib/status";
import type { GoogleAgendaCommitment } from "@workspace/api-client-react";
import { useGoogleCompromissos } from "./useGoogleCompromissos";
import { chaveDaSessao, chaveDoCompromisso } from "./filtro-agendas";
import { InformacoesCompromisso } from "./InformacoesCompromisso";
import { avisoSonoroLigado, gravarAvisoSonoro, tocarSino } from "./aviso-sonoro";
import {
  ESTADO_APLICACAO, JANELA_AVISO_SONORO_MIN, agoraEmBrasilia, colunarSobrepostos, corSegura, estadoDaAplicacao,
  faixaDeHoras, faixaDoGoogle, fimDesenhado, minutosDoHorario, proximidade, rotuloAtendimento, rotuloHora, textoFaltam,
  type Posicionado, type Proximidade, type EstadoAplicacao,
} from "./timeline-logica";
import "./agenda-timeline.css";

/**
 * Linha do tempo da Agenda (Dia e Semana), no estilo do Google Agenda: eixo de horas, uma coluna por dia,
 * linha vermelha de agora e cor por agenda. Sessões do PAXTER abrem os detalhes; compromissos do Google
 * aparecem com cadeado, tracejado e somente leitura (nada aqui grava ou move evento externo).
 */
type Aplicacao = {
  id: number; substanceName: string; substanceColor?: string; sessionNumber: number; totalSessions: number;
  availability: string; displayState?: string; procedureType?: string;
};
export type SessaoLinha = {
  id: number; clientName: string; scheduledDate: string; scheduledTime: string; status: string;
  resourceId?: number | null; agendaNome?: string | null; agendaCor?: string | null; durationMinutes?: number | null;
  professionalName?: string | null; nurseName?: string | null; unit?: string | null; serviceType?: string;
  weekNumber?: number; protocolTitle?: string | null; substanceApplications: Aplicacao[];
};

type Item = {
  chave: string; tipo: "sessao" | "google"; dia: string; ini: number; fim: number; fimD: number; cor: string;
  agendaChave: string; sessao?: SessaoLinha; evento?: GoogleAgendaCommitment;
};

const SEM_AGENDA_ROTULO = "Sem agenda ligada";
const DIA_SEMANA = (d: Date) => format(d, "EEE", { locale: ptBR }).replace(".", "");
const dataLonga = (iso: string) => {
  const t = format(new Date(`${iso}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const usaMovimentoReduzido = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function GradeTimeline({ modo, dias, sessoes, ocultas, renderCartao, onReagendar, onAbrirDia }: {
  modo: "dia" | "semana";
  dias: Date[];
  sessoes: SessaoLinha[];
  /** Agendas desmarcadas no filtro único da Agenda Diária (vale para sessões e compromissos do Google). */
  ocultas: ReadonlySet<string>;
  /** Cartão completo da sessão (com as ações já existentes), exibido dentro dos detalhes sob demanda. */
  renderCartao: (sessao: SessaoLinha) => ReactNode;
  onReagendar: (sessao: SessaoLinha) => void;
  onAbrirDia: (dia: Date) => void;
}) {
  const diasIso = useMemo(() => dias.map((d) => format(d, "yyyy-MM-dd")), [dias]);
  const de = diasIso[0]!;
  const ate = diasIso[diasIso.length - 1]!;
  const horaPx = modo === "dia" ? 76 : 64;

  const google = useGoogleCompromissos(de, ate);
  const [agora, setAgora] = useState(() => agoraEmBrasilia(new Date()));
  useEffect(() => {
    const t = window.setInterval(() => setAgora(agoraEmBrasilia(new Date())), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const visivel = (k: string) => !ocultas.has(k);

  // ── Itens da linha do tempo ───────────────────────────────────────────────
  const todos = useMemo(() => {
    const lista: Item[] = [];
    for (const s of sessoes) {
      if (!diasIso.includes(s.scheduledDate)) continue;
      const ini = minutosDoHorario(s.scheduledTime);
      if (ini === null) continue;
      const dur = s.durationMinutes && s.durationMinutes > 0 ? s.durationMinutes : 30;
      const fim = Math.min(ini + dur, 24 * 60);
      lista.push({ chave: `s${s.id}`, tipo: "sessao", dia: s.scheduledDate, ini, fim, fimD: fimDesenhado(ini, fim),
        cor: corSegura(s.agendaCor), agendaChave: chaveDaSessao(s), sessao: s });
    }
    for (const e of google.data?.eventos ?? []) {
      if (!diasIso.includes(e.data)) continue;
      const faixa = faixaDoGoogle(e);
      if (!faixa) continue;
      lista.push({ chave: `g${e.id}`, tipo: "google", dia: e.data, ini: faixa.ini, fim: faixa.fim, fimD: fimDesenhado(faixa.ini, faixa.fim),
        cor: corSegura(e.cor), agendaChave: chaveDoCompromisso(e), evento: e });
    }
    return lista;
  }, [sessoes, google.data, diasIso]);

  const diaInteiro = useMemo(() => (google.data?.eventos ?? []).filter((e) => e.diaInteiro && diasIso.includes(e.data) && visivel(chaveDoCompromisso(e))),
    [google.data, diasIso, ocultas]); // eslint-disable-line react-hooks/exhaustive-deps

  const visiveis = useMemo(() => todos.filter((i) => !ocultas.has(i.agendaChave)), [todos, ocultas]);
  const { inicio: horaIni, fim: horaFim } = useMemo(() => faixaDeHoras(visiveis.map((i) => ({ ini: i.ini, fim: i.fimD }))), [visiveis]);
  const alturaTotal = (horaFim - horaIni) * horaPx;
  const topo = (min: number) => ((min - horaIni * 60) / 60) * horaPx;

  // Sobreposição calculada pela duração DESENHADA (compromisso curto também ocupa espaço legível).
  const colunasPorDia = useMemo(() => {
    const m: Record<string, Posicionado<{ ini: number; fim: number; item: Item }>[]> = {};
    for (const iso of diasIso) {
      m[iso] = colunarSobrepostos(visiveis.filter((i) => i.dia === iso).map((i) => ({ ini: i.ini, fim: i.fimD, item: i })));
    }
    return m;
  }, [visiveis, diasIso]);

  // ── Agora, próximo atendimento e aviso sonoro ─────────────────────────────
  const hojeNaGrade = diasIso.includes(agora.data);
  const estadoDe = useCallback((i: Item): Proximidade => i.tipo === "sessao" && i.sessao
    ? proximidade({ ehHoje: i.dia === agora.data, ini: i.ini, fim: i.fim, agora: agora.minutos, status: i.sessao.status })
    : i.dia === agora.data && agora.minutos >= i.fim ? "passada" : "futura", [agora]);

  const proximo = useMemo(() => {
    if (!hojeNaGrade) return null;
    return visiveis
      .filter((i) => i.tipo === "sessao" && i.dia === agora.data && i.ini >= agora.minutos && estadoDe(i) !== "encerrada")
      .sort((a, b) => a.ini - b.ini)[0] ?? null;
  }, [visiveis, hojeNaGrade, agora, estadoDe]);

  const [somLigado, setSomLigado] = useState(avisoSonoroLigado);
  const avisados = useRef(new Set<number>());
  const marcarJaAvisados = useCallback(() => {
    for (const i of todos) if (i.tipo === "sessao" && i.sessao && i.dia === agora.data && i.ini - agora.minutos <= JANELA_AVISO_SONORO_MIN) avisados.current.add(i.sessao.id);
  }, [todos, agora]);
  const alternarSom = () => {
    const novo = !somLigado;
    setSomLigado(novo);
    gravarAvisoSonoro(novo);
    if (novo) { marcarJaAvisados(); tocarSino(); }
  };
  useEffect(() => {
    if (!somLigado) return;
    const alvo = visiveis.find((i) => i.tipo === "sessao" && i.sessao && !avisados.current.has(i.sessao.id)
      && i.ini - agora.minutos >= 0 && i.ini - agora.minutos <= JANELA_AVISO_SONORO_MIN && estadoDe(i) === "proxima");
    if (!alvo?.sessao) return;
    avisados.current.add(alvo.sessao.id);
    tocarSino();
  }, [agora, visiveis, somLigado, estadoDe]);

  // ── Rolagem: ao abrir ou trocar de período, leva o olho para agora (ou para o primeiro compromisso) ──
  const rolagem = useRef<HTMLDivElement>(null);
  const irParaAgora = useCallback((suave: boolean) => {
    const el = rolagem.current;
    if (!el) return;
    const primeiro = visiveis.length ? Math.min(...visiveis.map((i) => i.ini)) : null;
    const alvo = hojeNaGrade && agora.minutos >= horaIni * 60 && agora.minutos <= horaFim * 60 ? agora.minutos : primeiro ?? 8 * 60;
    el.scrollTo({ top: Math.max(0, topo(alvo) - 90), behavior: suave && !usaMovimentoReduzido() ? "smooth" : "auto" });
  }, [visiveis, hojeNaGrade, agora, horaIni, horaFim, horaPx]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodoVisto = useRef("");
  useEffect(() => {
    const chave = `${modo}|${de}|${ate}`;
    if (periodoVisto.current === chave) return;
    if (google.isLoading && todos.length === 0) return;
    periodoVisto.current = chave;
    irParaAgora(false);
  }, [modo, de, ate, google.isLoading, todos.length, irParaAgora]);

  // ── Detalhes ──────────────────────────────────────────────────────────────
  const [aberta, setAberta] = useState<SessaoLinha | null>(null);
  const [cartaoCompleto, setCartaoCompleto] = useState(false);
  const [eventoAberto, setEventoAberto] = useState<GoogleAgendaCommitment | null>(null);
  const sessaoAtual = aberta ? sessoes.find((s) => s.id === aberta.id) ?? aberta : null;
  const abrirSessao = (s: SessaoLinha) => { setCartaoCompleto(false); setAberta(s); };

  const colunasGrid = `3.25rem repeat(${dias.length}, minmax(${modo === "dia" ? "0" : "7.5rem"}, 1fr))`;
  const semNada = todos.length === 0 && diaInteiro.length === 0;

  return (
    <section className="tl-raiz panel-3d-sub space-y-3 p-3" data-testid="linha-do-tempo" data-modo={modo} aria-label={modo === "dia" ? "Linha do tempo do dia" : "Linha do tempo da semana"}>
      {/* Barra superior: legenda de agendas à esquerda; próximo atendimento, agora e som à direita */}
      <div className="flex flex-wrap items-start justify-end gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {proximo?.sessao && (
            <button type="button" data-testid="proximo-atendimento" onClick={() => abrirSessao(proximo.sessao!)}
              className="concave-3d flex min-h-9 items-center gap-2 px-3 text-[11px] font-bold">
              <CalendarClock className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span className="tabular-nums">{rotuloHora(proximo.ini)}</span>
              <span className="max-w-[10rem] truncate">{proximo.sessao.clientName}</span>
              <span className="font-black text-accent">{textoFaltam(proximo.ini - agora.minutos)}</span>
            </button>
          )}
          <button type="button" onClick={() => irParaAgora(true)} data-testid="ir-para-agora" className="btn-3d-soft flex min-h-9 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest">
            <Clock className="h-3.5 w-3.5" aria-hidden />Agora
          </button>
          <button type="button" role="switch" aria-checked={somLigado} onClick={alternarSom} data-testid="aviso-sonoro"
            title={somLigado ? "Aviso sonoro ligado: um sino suave 10 minutos antes de cada atendimento" : "Aviso sonoro desligado"}
            className={`${somLigado ? "bevel-3d text-primary" : "btn-3d-soft text-muted-foreground"} flex min-h-9 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest`}>
            {somLigado ? <Volume2 className="h-3.5 w-3.5" aria-hidden /> : <VolumeX className="h-3.5 w-3.5" aria-hidden />}
            Aviso sonoro {somLigado ? "ligado" : "desligado"}
          </button>
        </div>
      </div>

      {google.isError && (
        <p role="alert" className="concave-3d px-3 py-2 text-[11px] font-bold text-amber-700">
          Google indisponível agora: as sessões do PAXTER continuam abaixo, sem os compromissos do Google.
        </p>
      )}

      {/* A grade */}
      <div ref={rolagem} className="relative max-h-[72vh] overflow-auto rounded-[6px]" data-testid="tl-rolagem">
        <div className="grid" style={{ gridTemplateColumns: colunasGrid, minWidth: modo === "dia" ? undefined : `${3.25 + dias.length * 7.5}rem`, ["--tl-hora" as string]: `${horaPx}px` }}>
          {/* Cabeçalho fixo: dia e compromissos de dia inteiro */}
          <div className="sticky top-0 z-20 border-b border-muted/30 bg-background" />
          {dias.map((d, idx) => {
            const iso = diasIso[idx]!;
            const ehHoje = iso === agora.data;
            const diaTodo = diaInteiro.filter((e) => e.data === iso);
            const conteudo = (
              <>
                <span className={`text-[10px] font-black uppercase tracking-widest ${ehHoje ? "text-accent" : "text-muted-foreground"}`}>{DIA_SEMANA(d)}</span>
                <span className={`mt-0.5 flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-lg font-black tabular-nums ${ehHoje ? "bg-primary text-primary-foreground" : ""}`}>{format(d, "d")}</span>
              </>
            );
            return (
              <div key={iso} data-testid={`tl-cabecalho-${iso}`} className="sticky top-0 z-20 border-b border-l border-muted/30 bg-background px-1 pb-1 pt-1 text-center">
                {modo === "semana" ? (
                  <button type="button" onClick={() => onAbrirDia(d)} aria-label={`Abrir o dia ${format(d, "d 'de' MMMM", { locale: ptBR })}`}
                    className="mx-auto flex flex-col items-center rounded-[6px] px-2 hover:bg-muted/40">{conteudo}</button>
                ) : <div className="flex flex-col items-center">{conteudo}</div>}
                {diaTodo.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-left" aria-label="Compromissos de dia inteiro">
                    {diaTodo.map((e) => (
                      <li key={e.id}>
                        <button type="button" data-origem="google" onClick={() => setEventoAberto(e)} style={{ ["--ev" as string]: corSegura(e.cor) }}
                          className="tl-evento tl-evento--google relative flex w-full items-center gap-1 text-[10px] font-bold" title={`${e.titulo} (${e.agenda}, somente leitura)`}>
                          <Lock className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden /><span className="truncate">{e.titulo}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Eixo das horas */}
          <div className="relative" style={{ height: alturaTotal }} aria-hidden>
            {Array.from({ length: horaFim - horaIni + 1 }, (_, k) => horaIni + k).map((h) => (
              <span key={h} className="absolute right-2 text-[10px] font-bold tabular-nums text-muted-foreground"
                style={{ top: topo(h * 60), transform: h === horaIni ? "translateY(2px)" : "translateY(-50%)" }}>{h}h</span>
            ))}
            {hojeNaGrade && agora.minutos >= horaIni * 60 && agora.minutos <= horaFim * 60 && (
              <span className="tl-agora-rotulo" style={{ top: topo(agora.minutos) }} data-testid="tl-agora-rotulo">{rotuloHora(agora.minutos)}</span>
            )}
          </div>

          {/* Colunas dos dias */}
          {diasIso.map((iso) => {
            const ehHoje = iso === agora.data;
            return (
              <div key={iso} data-testid={`tl-coluna-${iso}`} className={`tl-corpo-coluna ${ehHoje ? "tl-corpo-coluna--hoje" : ""}`} style={{ height: alturaTotal }}>
                {ehHoje && agora.minutos >= horaIni * 60 && agora.minutos <= horaFim * 60 && (
                  <div className="tl-agora" style={{ top: topo(agora.minutos) }} data-testid="tl-agora" aria-hidden />
                )}
                {(colunasPorDia[iso] ?? []).map(({ item: i, col, cols }) => {
                  const estado = estadoDe(i);
                  const alto = (i.fimD - i.ini) / 60 * horaPx;
                  const hora = rotuloHora(i.ini);
                  const nome = i.tipo === "sessao" ? i.sessao!.clientName : i.evento!.titulo;
                  const agendaTxt = i.tipo === "sessao" ? i.sessao!.agendaNome ?? SEM_AGENDA_ROTULO : i.evento!.agenda;
                  return (
                    <button key={i.chave} type="button" data-testid={`evento-${i.chave}`} data-origem={i.tipo === "google" ? "google" : "paxter"}
                      data-proximidade={estado}
                      aria-label={`${hora} ${nome}, ${agendaTxt}${i.tipo === "google" ? ", compromisso do Google, somente leitura" : `, ${formatStatus(i.sessao!.status)}`}${estado === "proxima" ? ", começa em breve" : ""}`}
                      onClick={() => (i.tipo === "sessao" ? abrirSessao(i.sessao!) : setEventoAberto(i.evento!))}
                      className={`tl-evento ${i.tipo === "google" ? "tl-evento--google" : ""} tl-evento--${estado}`}
                      style={{
                        ["--ev" as string]: i.cor, top: topo(i.ini) + 1, height: alto - 2,
                        left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`,
                      }}>
                      {!(alto >= 40 || (cols > 1 && alto >= 30)) ? (
                        <span className="flex items-center gap-1 text-[11px] leading-tight">
                          <span className="font-black tabular-nums">{hora}</span>
                          <span className="truncate font-semibold">{nome}</span>
                          {i.tipo === "google" && <Lock className="ml-auto h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />}
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1 text-[11px] leading-tight">
                            <span className="font-black tabular-nums">{hora}</span>
                            {i.tipo === "google" && <Lock className="ml-auto h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />}
                            {i.tipo === "google" && i.evento!.recorrente && <Repeat className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />}
                          </span>
                          <span className={`block truncate font-bold leading-tight ${alto >= 40 ? "text-xs" : "text-[11px]"}`}>{nome}</span>
                          {alto >= 58 && <span className="block truncate text-[10px] leading-tight text-muted-foreground">{agendaTxt}</span>}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {semNada && !google.isLoading && (
          <p className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm font-bold text-muted-foreground" data-testid="tl-vazio">
            Nenhum compromisso neste período.
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Clique num atendimento para ver os detalhes. Compromissos com cadeado são do Google e só podem ser lidos aqui.
      </p>

      {/* Detalhes da sessão do PAXTER */}
      <Dialog open={!!sessaoAtual} onOpenChange={(o) => { if (!o) { setAberta(null); setCartaoCompleto(false); } }}>
        <DialogContent className="panel-3d max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="tl-detalhe-sessao">
          {sessaoAtual && (
            <DetalheSessao sessao={sessaoAtual} completo={cartaoCompleto} onAlternarCompleto={() => setCartaoCompleto((v) => !v)}
              onReagendar={() => { const s = sessaoAtual; setAberta(null); onReagendar(s); }} cartao={cartaoCompleto ? renderCartao(sessaoAtual) : null} />
          )}
        </DialogContent>
      </Dialog>

      {/* Detalhes de um compromisso do Google (somente leitura) */}
      <Dialog open={!!eventoAberto} onOpenChange={(o) => { if (!o) setEventoAberto(null); }}>
        <DialogContent className="panel-3d max-h-[90vh] max-w-xl overflow-y-auto" data-testid="tl-detalhe-google">
          {eventoAberto && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4" aria-hidden />{eventoAberto.titulo}</DialogTitle>
                <DialogDescription>{dataLonga(eventoAberto.data)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-[3px] ring-1 ring-black/15" style={{ backgroundColor: corSegura(eventoAberto.cor) }} aria-hidden />
                  <span className="font-bold">{eventoAberto.agenda}</span>
                </p>
                <p className="tabular-nums">{eventoAberto.diaInteiro ? "Dia inteiro" : eventoAberto.horario}{eventoAberto.recorrente ? " · repete" : ""}</p>
                <p className="concave-3d px-3 py-2 text-[11px] text-muted-foreground">
                  Compromisso do Google, somente leitura. O PAXTER não altera nem move este compromisso.
                </p>
                <InformacoesCompromisso evento={eventoAberto} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function QuadradoAplicacao({ app }: { app: Aplicacao }) {
  const estado = estadoDaAplicacao(app.displayState);
  const info = ESTADO_APLICACAO[estado];
  const cor = corSegura(app.substanceColor, "#94a3b8");
  const estilo: Record<EstadoAplicacao, string> = {
    applied: "ring-2 ring-green-600", disp: "ring-2 ring-amber-500", prox: "border border-dashed border-slate-600 opacity-50",
    notPerformed: "ring-2 ring-red-700", unavailable: "opacity-30 ring-1 ring-slate-400", review: "ring-2 ring-red-700",
  };
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]" aria-hidden>
      <span className={`absolute inset-0 rounded-[4px] ${estilo[estado]}`} style={{ backgroundColor: cor }} />
      {estado === "applied" && <Check className="relative h-3 w-3 text-white drop-shadow" strokeWidth={4} />}
      {(estado === "notPerformed") && <X className="relative h-3 w-3 text-white drop-shadow" strokeWidth={4} />}
      {estado === "review" && <span className="relative text-[11px] font-black text-white drop-shadow">?</span>}
      <span className="sr-only">{info.rotulo}</span>
    </span>
  );
}

function DetalheSessao({ sessao, completo, onAlternarCompleto, onReagendar, cartao }: {
  sessao: SessaoLinha; completo: boolean; onAlternarCompleto: () => void; onReagendar: () => void; cartao: ReactNode;
}) {
  const ini = minutosDoHorario(sessao.scheduledTime) ?? 0;
  const dur = sessao.durationMinutes && sessao.durationMinutes > 0 ? sessao.durationMinutes : 30;
  const apps = sessao.substanceApplications ?? [];
  const aberta = sessao.status === "scheduled" || sessao.status === "confirmed";
  const local = sessao.serviceType === "homecare" ? "Atendimento domiciliar" : sessao.unit ?? null;
  const campos: { rotulo: string; valor: string | null }[] = [
    { rotulo: "Atendimento", valor: rotuloAtendimento(sessao) },
    { rotulo: "Semana do protocolo", valor: sessao.weekNumber ? `Semana ${sessao.weekNumber}` : null },
    { rotulo: "Local", valor: local },
    { rotulo: "Profissional", valor: sessao.professionalName ?? null },
    { rotulo: "Enfermagem", valor: sessao.nurseName ?? null },
    { rotulo: "Situação", valor: formatStatus(sessao.status) },
  ];
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {aberta && <BellRing className="h-4 w-4 text-accent" aria-hidden />}{sessao.clientName}
        </DialogTitle>
        <DialogDescription className="tabular-nums">
          {dataLonga(sessao.scheduledDate)} · {rotuloHora(ini)} às {rotuloHora(Math.min(ini + dur, 24 * 60))}
        </DialogDescription>
      </DialogHeader>

      <p className="flex items-center gap-2 text-sm">
        <span className="h-3 w-3 rounded-[3px] ring-1 ring-black/15" style={{ backgroundColor: corSegura(sessao.agendaCor) }} aria-hidden />
        <span className="font-bold">{sessao.agendaNome ?? SEM_AGENDA_ROTULO}</span>
        {sessao.protocolTitle && <span className="truncate text-muted-foreground">· {sessao.protocolTitle}</span>}
      </p>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {campos.map((c) => (
          <div key={c.rotulo} className="concave-3d min-w-0 px-2.5 py-1.5">
            <dt className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">{c.rotulo}</dt>
            <dd className={`truncate text-[12px] font-bold ${c.valor ? "" : "text-muted-foreground/40"}`}>{c.valor ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <section aria-label="Aplicações desta visita" data-testid="tl-aplicacoes" className="space-y-1.5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aplicações desta visita</h3>
        {apps.length === 0 ? (
          <p className="concave-3d px-3 py-2 text-[11px] text-muted-foreground">Nenhuma aplicação registrada para esta visita.</p>
        ) : (
          <ul className="space-y-1">
            {apps.map((a) => {
              const estado = estadoDaAplicacao(a.displayState);
              return (
                <li key={a.id} data-testid={`tl-aplicacao-${a.id}`} data-estado={estado}
                  className="bevel-3d grid grid-cols-[1.25rem_minmax(0,1fr)_auto_5.5rem] items-center gap-x-2 px-2.5 py-1.5">
                  <QuadradoAplicacao app={a} />
                  <span className="truncate text-xs font-bold uppercase tracking-tight">{a.substanceName}</span>
                  <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{a.sessionNumber > 0 ? `${a.sessionNumber}/${a.totalSessions}` : "—"}</span>
                  <span className="text-right text-[9px] font-black uppercase tracking-wider" style={{ color: ESTADO_APLICACAO[estado].cor }}>{ESTADO_APLICACAO[estado].rotulo}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAlternarCompleto} aria-expanded={completo} data-testid="tl-cartao-completo"
          className="btn-3d-soft min-h-9 px-3 text-[10px] font-black uppercase tracking-widest">
          {completo ? "Ocultar cartão completo" : "Cartão completo com ações"}
        </button>
        {aberta && (
          <button type="button" onClick={onReagendar} className="btn-3d-soft min-h-9 px-3 text-[10px] font-black uppercase tracking-widest">Reagendar sessão</button>
        )}
      </div>
      {cartao}
    </>
  );
}
