/**
 * Consulta avulsa (sem protocolo) marcada pela Agenda Diária.
 * Dois canais, escolhidos SÓ pelo servidor (GET /agenda/encaixe/politica, pela identidade da sessão e pela Governança):
 *  - encaixe rápido interno (equipe autorizada): /agenda/encaixe, antecedência curta em minutos, sem cadeia, trecho inteiro conferido;
 *  - agendamento padrão: /agenda/book-avulsa, 24 horas e cadeia (como o paciente).
 * A tela nunca envia canal nem antecedência. O servidor decide empresa, conflito e Google; esta tela só junta os campos,
 * mostra cada cadastro em campo próprio (cliente, agenda, profissional, modalidade, local, duração) e conta a verdade
 * sobre o resultado (salvo, salvo sem o Google, recusado ou incerto). Nunca pede nem cria protocolo e nunca envia convite.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  bookAgendaEncaixe, bookAvulsaSession, listSessions, useGetAgendaEncaixeDisponibilidade, useGetAgendaEncaixePolitica,
  useGetAgendaSettings, useGetAgendaSlots, useListAgendaResources, useListClients,
} from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { useToast } from "@/hooks/use-toast";
import { hojeBrt } from "@/lib/pit-stop-formato";
import { minutosDoHorario, rotuloHora } from "./timeline-logica";
import {
  agendaReservavel, agruparBloqueios, DURACAO_MAX, DURACAO_MIN, duracaoValida, estadoSincronizacao, explicarDia, explicarPeriodo, jaMarcada,
  lerDuracao, lerFalha, lerRespostaDeSucesso, periodoDoInicio, primeiroPeriodoIndisponivel, proximoLivre, rotuloLocal, rotuloModalidade,
  rotuloProfissional, rotuloSituacao, somarDiasIso, textoCanal, textoDuracao, textoIntervalo,
  type AgendaOpcao, type RegrasAgenda, type ResultadoMarcacao,
} from "./selecao-logica";

/** O que a grade (ou o botão) já sabe: dia e, se houver, início e fim em minutos. */
export type PreencherConsulta = { data: string; ini: number | null; fim: number | null };

const ESPERA_MAXIMA_MS = 45_000;
const DURACOES_RAPIDAS = [20, 30, 40, 60];
const ROTULO_TIPO: Record<string, string> = { medico: "Médico", enfermagem: "Enfermagem" };

const rotuloCampo = "text-[10px] font-black uppercase tracking-widest text-muted-foreground";
const campo = "field-engraved h-10 w-full rounded-[6px] border px-3 text-sm font-semibold text-foreground";
const valorFixo = "concave-3d min-h-10 px-3 py-2 text-sm font-semibold";

export function ConsultaAvulsaDialog({ aberto, preencher, onFechar, onMarcada }: {
  aberto: boolean;
  preencher: PreencherConsulta | null;
  onFechar: () => void;
  /** Chamado quando a consulta ficou gravada (mesmo sem o Google): a agenda recarrega. */
  onMarcada: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: clientesBrutos } = useListClients();
  const clientes = useMemo(() => {
    const lista = Array.isArray(clientesBrutos) ? clientesBrutos : ((clientesBrutos as { clients?: unknown[] } | undefined)?.clients ?? []);
    return (lista as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as number, name: (c.name as string) ?? "", cpf: (c.cpf as string | null) ?? null,
      phone: (c.phone as string | null) ?? null, photoUrl: (c.photoUrl as string | null) ?? null,
    }));
  }, [clientesBrutos]);

  const { data: recursos } = useListAgendaResources({ query: { enabled: aberto } as never });
  const agendas = useMemo(
    () => ((recursos ?? []) as unknown as AgendaOpcao[]).filter(agendaReservavel),
    [recursos]);

  const [clienteId, setClienteId] = useState<number | null>(null);
  const [agendaId, setAgendaId] = useState<number | null>(null);
  const [data, setData] = useState("");
  const [inicioPedido, setInicioPedido] = useState<number | null>(null);
  const [horario, setHorario] = useState("");
  const [duracaoTxt, setDuracaoTxt] = useState("");
  const [duracaoTocada, setDuracaoTocada] = useState(false);
  const [resultado, setResultado] = useState<ResultadoMarcacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const enviandoRef = useRef(false);

  // Cada abertura recomeça do que a grade informou; nada fica de uma marcação anterior.
  useEffect(() => {
    if (!aberto || !preencher) return;
    setClienteId(null);
    setAgendaId(null);
    setData(preencher.data);
    setInicioPedido(preencher.ini);
    setHorario(preencher.ini !== null ? rotuloHora(preencher.ini) : "");
    const dur = preencher.ini !== null && preencher.fim !== null ? preencher.fim - preencher.ini : null;
    setDuracaoTxt(dur !== null && duracaoValida(dur) ? String(dur) : "");
    setDuracaoTocada(dur !== null);
    setResultado(null);
    setAviso(null);
    setEnviando(false);
    enviandoRef.current = false;
  }, [aberto, preencher]);

  // Agenda única disponível já vem escolhida; com várias, a escolha é sempre explícita.
  useEffect(() => {
    if (aberto && agendaId === null && agendas.length === 1) setAgendaId(agendas[0]!.id);
  }, [aberto, agendaId, agendas]);

  const agenda = agendas.find((a) => a.id === agendaId) ?? null;

  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(data);
  const duracao = lerDuracao(duracaoTxt);

  // Canal: perguntado ao servidor. Falha ou 401 = agendamento padrão (nunca presume o canal interno).
  const { data: politica } = useGetAgendaEncaixePolitica({ query: { enabled: aberto, staleTime: 30_000, retry: false } as never });
  const interno = politica?.autorizado === true;

  const { data: slotsPadrao, isFetching: carregandoPadrao } = useGetAgendaSlots(
    { resourceId: agendaId ?? 0, date: data },
    { query: { enabled: aberto && !interno && agendaId !== null && dataOk, staleTime: 0, gcTime: 0 } as never },
  );
  const { data: dispo, isFetching: carregandoDispo, isError: erroDispo } = useGetAgendaEncaixeDisponibilidade(
    { resourceId: agendaId ?? 0, date: data, durationMinutes: duracao ?? 0, ...(clienteId !== null ? { clientId: clienteId } : {}) },
    { query: { enabled: aberto && interno && agendaId !== null && dataOk && duracao !== null, staleTime: 0, gcTime: 0, retry: false } as never },
  );
  const slotsResp = interno ? undefined : slotsPadrao;
  const carregandoSlots = interno ? carregandoDispo : carregandoPadrao;
  const slots = useMemo(
    () => ((interno ? dispo?.slots : slotsPadrao?.slots) ?? []) as { time: string; state: string; reason?: string | null; message?: string | null; subBlockIndex?: number }[],
    [interno, dispo, slotsPadrao]);

  // Regras da agenda (antecedência mínima e percentual da cadeia): só leitura, para explicar cada bloqueio padrão.
  const { data: ajustes } = useGetAgendaSettings({ query: { enabled: aberto } as never });
  const regras: RegrasAgenda = ajustes ? { minLeadHours: ajustes.minLeadHours, triggerPercent: ajustes.triggerPercent } : null;
  const gruposBloqueio = useMemo(
    () => (interno ? [] : agruparBloqueios(slots, slotsResp?.subBlocks ?? [], regras)),
    [interno, slots, slotsResp, regras?.minLeadHours, regras?.triggerPercent], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const textoDia = explicarDia(interno ? dispo?.motivoDia : slotsResp?.reason);
  const respostaCarregada = interno ? dispo !== undefined : slotsResp !== undefined;
  const sincronizacao = interno ? estadoSincronizacao(dispo?.integracao) : null;

  // Início pedido pela grade vira o período da agenda que o contém; sem pedido, o primeiro período aberto.
  useEffect(() => {
    if (!aberto || agendaId === null || slots.length === 0) return;
    if (inicioPedido !== null) {
      const p = periodoDoInicio(inicioPedido, slots);
      if (p) {
        setHorario(p.time);
        setAviso(p.ajustado ? `O início foi ajustado para ${p.time}, o período da agenda que contém o horário escolhido.` : null);
      }
    } else if (!horario || !slots.some((s) => s.time === horario)) {
      const primeiro = slots.find((s) => s.state === "aberto") ?? slots[0]!;
      setHorario(primeiro.time);
    }
  }, [aberto, agendaId, slots, inicioPedido]); // eslint-disable-line react-hooks/exhaustive-deps

  // Duração padrão = um período da agenda, enquanto a pessoa não escolheu outra.
  useEffect(() => {
    if (agenda && !duracaoTocada) setDuracaoTxt(String(agenda.slotMinutes));
  }, [agenda, duracaoTocada]);

  const inicioMin = minutosDoHorario(horario);
  const slotEscolhido = slots.find((s) => s.time === horario) ?? null;
  const trechoProblema = !interno && agenda && duracao !== null && horario && slots.length > 0
    ? primeiroPeriodoIndisponivel(horario, duracao, agenda.slotMinutes, slots)
    : null;

  const faltando: string[] = [];
  if (clienteId === null) faltando.push("cliente");
  if (agendaId === null) faltando.push("agenda");
  if (!dataOk) faltando.push("data");
  if (!horario) faltando.push("horário");
  if (duracao === null) faltando.push("duração (de 5 a 480 minutos)");

  const travado = enviando || conferindo || resultado?.tipo === "google-aviso" || resultado?.tipo === "incerto";
  const podeConfirmar = faltando.length === 0 && !travado;

  function fechar() {
    if (enviandoRef.current) return;
    onFechar();
  }

  async function confirmar() {
    if (!podeConfirmar || clienteId === null || agendaId === null || duracao === null || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setResultado(null);
    const controle = new AbortController();
    const relogio = window.setTimeout(() => controle.abort(), ESPERA_MAXIMA_MS);
    try {
      const corpo = { resourceId: agendaId, clientId: clienteId, date: data, time: horario, durationMinutes: duracao, syncGoogle: true };
      const resp = interno
        ? await bookAgendaEncaixe(corpo, { signal: controle.signal })
        : await bookAvulsaSession(corpo, { signal: controle.signal });
      const duplicada = interno && (resp as { duplicada?: boolean }).duplicada === true;
      const r = lerRespostaDeSucesso(resp, !duplicada);
      onMarcada();
      void qc.invalidateQueries({
        predicate: (q) => /^\/api\/(sessions|agenda\/slots|agenda\/encaixe)/.test(String(q.queryKey[0])),
      });
      if (r.tipo === "ok" || duplicada) {
        toast({
          title: duplicada ? "Esta consulta já estava marcada" : (interno ? "Encaixe marcado" : "Consulta avulsa marcada"),
          description: duplicada
            ? "O pedido repetido não criou outra consulta; a marcação existente foi mantida."
            : "Salva no sistema e criada no Google Agenda da agenda, sem enviar convite.",
        });
        onFechar();
      } else {
        setResultado(r);
      }
    } catch (erro) {
      setResultado(lerFalha(erro));
      // Recusa do servidor: a disponibilidade mudou; relê para a lista refletir o que o servidor viu.
      void qc.invalidateQueries({ predicate: (q) => /^\/api\/agenda\/(encaixe|slots)/.test(String(q.queryKey[0])) });
    } finally {
      window.clearTimeout(relogio);
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  async function conferirNaAgenda() {
    if (clienteId === null || agendaId === null) return;
    setConferindo(true);
    try {
      const sessoes = await listSessions({ dateFrom: data, dateTo: data });
      const achou = jaMarcada(sessoes as never, { clientId: clienteId, resourceId: agendaId, date: data, time: horario });
      if (achou) {
        onMarcada();
        setResultado({
          tipo: "google-aviso",
          aviso: "A consulta consta na agenda, então foi gravada. Não foi possível confirmar o evento no Google; use Sincronizar no cartão da consulta.",
        });
      } else {
        setResultado({ tipo: "recusada", status: 0, mensagem: "A consulta não consta na agenda. Nada foi gravado; você pode confirmar de novo." });
      }
    } catch {
      setResultado(lerFalha(null));
    } finally {
      setConferindo(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl" data-testid="consulta-avulsa-dialogo">
        <DialogHeader>
          <DialogTitle className="text-lg font-black uppercase tracking-tight">Novo agendamento</DialogTitle>
          <DialogDescription>
            Consulta avulsa: sem protocolo. A empresa é a do seu acesso; só aparecem clientes e agendas dela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Canal em uso: dito pelo servidor, nunca escolhido aqui */}
          {politica && (
            <p role="status" data-testid={interno ? "avulsa-canal-interno" : "avulsa-canal-padrao"}
              className={`flex items-start gap-2 rounded-[6px] border p-2.5 text-xs font-semibold ${interno ? "border-amber-400 bg-amber-50 text-amber-950" : "border-border text-muted-foreground"}`}>
              {interno && <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
              <span>{textoCanal(interno, dispo?.antecedenciaMinutos ?? politica.antecedenciaMinutos, ajustes?.minLeadHours ?? null)}</span>
            </p>
          )}

          {/* Cliente */}
          <div className="space-y-1.5">
            <label className={rotuloCampo}>Cliente</label>
            <div data-testid="avulsa-cliente">
              <PaxterClientSelector clientes={clientes} value={clienteId} onChange={setClienteId} disabled={travado} />
            </div>
          </div>

          {/* Agenda */}
          <div className="space-y-1.5">
            <label className={rotuloCampo} htmlFor="avulsa-agenda">Agenda</label>
            <select id="avulsa-agenda" data-testid="avulsa-agenda" className={campo} disabled={travado}
              value={agendaId ?? ""}
              onChange={(e) => { setAgendaId(e.target.value ? Number(e.target.value) : null); setHorario(""); setAviso(null); }}>
              <option value="">Selecionar agenda…</option>
              {agendas.map((a) => <option key={a.id} value={a.id}>{a.name} ({ROTULO_TIPO[a.kind] ?? a.kind})</option>)}
            </select>
            {agendas.length === 0 && (
              <p className="text-xs text-muted-foreground" data-testid="avulsa-sem-agenda">Nenhuma agenda de atendimento cadastrada para esta empresa.</p>
            )}
          </div>

          {/* Cadastro da agenda escolhida, em campos separados */}
          <div className="grid gap-3 sm:grid-cols-3" data-testid="avulsa-cadastro">
            <div className="space-y-1.5">
              <span className={rotuloCampo}>Profissional</span>
              <div className={valorFixo} data-testid="avulsa-profissional">{agenda ? rotuloProfissional(agenda) : "—"}</div>
            </div>
            <div className="space-y-1.5">
              <span className={rotuloCampo}>Modalidade</span>
              <div className={valorFixo} data-testid="avulsa-modalidade">{agenda ? rotuloModalidade(agenda.modality) : "—"}</div>
            </div>
            <div className="space-y-1.5">
              <span className={rotuloCampo}>Local</span>
              <div className={valorFixo} data-testid="avulsa-local">{agenda ? rotuloLocal(agenda) : "—"}</div>
            </div>
          </div>

          {/* Data, horário e duração */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className={rotuloCampo} htmlFor="avulsa-data">Data</label>
              <input id="avulsa-data" data-testid="avulsa-data" type="date" className={campo} value={data} disabled={travado}
                onChange={(e) => { setData(e.target.value); setHorario(""); setAviso(null); }} />
            </div>
            <div className="space-y-1.5">
              <label className={rotuloCampo} htmlFor="avulsa-horario">Horário de início</label>
              <select id="avulsa-horario" data-testid="avulsa-horario" className={campo} value={horario}
                disabled={travado || agendaId === null || slots.length === 0}
                aria-describedby="avulsa-situacao-horario"
                onChange={(e) => { setHorario(e.target.value); setInicioPedido(minutosDoHorario(e.target.value)); setAviso(null); }}>
                {!slots.some((s) => s.time === horario) && (
                  <option value={horario}>{horario || (agendaId === null ? "Escolha a agenda" : carregandoSlots ? "Carregando…" : "Sem períodos")}</option>
                )}
                {slots.map((s) => (
                  <option key={s.time} value={s.time} disabled={s.state === "ocupado"}>
                    {s.time}{interno && s.state !== "aberto" ? (s.state === "ocupado" ? " — ocupado" : ` — indisponível (${s.reason ?? "bloqueado"})`) : rotuloSituacao(s.state, s.reason)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={rotuloCampo} htmlFor="avulsa-duracao">Duração (minutos)</label>
              <input id="avulsa-duracao" data-testid="avulsa-duracao" inputMode="numeric" className={campo} value={duracaoTxt} disabled={travado}
                aria-invalid={duracao === null && duracaoTxt !== ""} placeholder={`${DURACAO_MIN} a ${DURACAO_MAX}`}
                onChange={(e) => { setDuracaoTxt(e.target.value.replace(/[^\d]/g, "").slice(0, 3)); setDuracaoTocada(true); }} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Opções rápidas de data e horário">
            <button type="button" data-testid="avulsa-hoje" disabled={travado}
              onClick={() => { setData(hojeBrt()); setHorario(""); setInicioPedido(null); setAviso(null); }}
              className="btn-3d-soft rounded-[4px] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">Hoje</button>
            <button type="button" data-testid="avulsa-amanha" disabled={travado}
              onClick={() => { setData(somarDiasIso(hojeBrt(), 1)); setHorario(""); setInicioPedido(null); setAviso(null); }}
              className="btn-3d-soft rounded-[4px] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">Amanhã</button>
            {interno && (
              <button type="button" data-testid="avulsa-proximo-livre" disabled={travado || proximoLivre(slots) === null}
                onClick={() => { const t = proximoLivre(slots); if (t) { setHorario(t); setInicioPedido(minutosDoHorario(t)); setAviso(null); } }}
                className="bevel-3d rounded-[4px] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-primary">Próximo livre</button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Durações rápidas">
            {DURACOES_RAPIDAS.map((m) => (
              <button key={m} type="button" data-testid={`avulsa-duracao-${m}`} disabled={travado}
                onClick={() => { setDuracaoTxt(String(m)); setDuracaoTocada(true); }}
                className={`${duracao === m ? "bevel-3d text-primary" : "btn-3d-soft text-muted-foreground"} rounded-[4px] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest`}>
                {m} min
              </button>
            ))}
          </div>

          {duracao !== null && inicioMin !== null && (
            <div className="concave-3d space-y-1 p-3 text-sm" data-testid="avulsa-resumo-bloco" aria-live="polite">
              <p className="font-semibold" data-testid="avulsa-resumo">
                {textoIntervalo(inicioMin, duracao)} · {textoDuracao(duracao)}
              </p>
              <p className="text-xs text-muted-foreground" data-testid="avulsa-resumo-detalhe">
                {data.split("-").reverse().join("/")} · {agenda ? `Agenda ${agenda.name}` : "agenda não escolhida"}
                {agenda ? ` · Profissional ${rotuloProfissional(agenda)} · ${rotuloModalidade(agenda.modality)} · Local ${rotuloLocal(agenda)}` : ""}
                {clienteId !== null ? ` · ${clientes.find((c) => c.id === clienteId)?.name ?? "cliente escolhido"}` : " · cliente não escolhido"}
              </p>
            </div>
          )}
          <p id="avulsa-situacao-horario" className="text-xs font-semibold" data-testid="avulsa-situacao-horario">
            {interno && slotEscolhido
              ? (slotEscolhido.state === "aberto" ? "Horário livre para o trecho inteiro." : (slotEscolhido.message ?? "Horário indisponível."))
              : ""}
          </p>
          {interno && clienteId === null && dispo && (
            <p className="text-xs text-muted-foreground" data-testid="avulsa-cliente-nao-verificado">
              Escolha o cliente para o sistema conferir também se ele já tem outra marcação nesse horário.
            </p>
          )}
          {sincronizacao && (
            <p role="status" data-testid={`avulsa-sync-${sincronizacao.tipo}`}
              className={`flex items-start gap-2 text-xs font-semibold ${sincronizacao.tipo === "em-dia" ? "text-green-800" : "text-amber-800"}`}>
              {sincronizacao.tipo === "em-dia" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
              {sincronizacao.texto}
            </p>
          )}
          {interno && erroDispo && (
            <p role="alert" className="text-xs font-semibold text-red-800" data-testid="avulsa-dispo-erro">
              Não foi possível consultar a disponibilidade agora. Nada foi prometido; tente de novo.
            </p>
          )}
          {aviso && <p className="text-xs text-muted-foreground" data-testid="avulsa-ajuste">{aviso}</p>}
          {respostaCarregada && agendaId !== null && textoDia && (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700" data-testid={slots.length === 0 ? "avulsa-agenda-fechada" : "avulsa-dia-motivo"}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {textoDia}{slots.length === 0 ? " Escolha outra data ou outra agenda." : ""}
            </p>
          )}
          {respostaCarregada && agendaId !== null && slots.length === 0 && !textoDia && (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700" data-testid="avulsa-agenda-fechada">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Esta agenda não tem períodos neste dia. Escolha outra data ou outra agenda.
            </p>
          )}
          {interno && respostaCarregada && slots.length > 0 && !slots.some((s) => s.state === "aberto") && (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700" data-testid="avulsa-nenhum-livre">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Nenhum horário livre para {duracao !== null ? textoDuracao(duracao) : "esta duração"} neste dia. Escolha cada horário na lista para ver o motivo
              {dispo?.alternativas.proximoDia ? `; o próximo dia com horário é ${dispo.alternativas.proximoDia.date.split("-").reverse().join("/")} às ${dispo.alternativas.proximoDia.time}.` : "."}
            </p>
          )}
          {gruposBloqueio.length > 0 && !slots.some((s) => s.state === "aberto") && (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700" data-testid="avulsa-nenhum-livre">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Nenhum horário livre nesta agenda neste dia. Veja abaixo o motivo de cada um.
            </p>
          )}
          {gruposBloqueio.length > 0 && (
            <details className="concave-3d p-3 text-xs" data-testid="avulsa-motivos" open={!slots.some((s) => s.state === "aberto")}>
              <summary className="cursor-pointer text-[11px] font-black uppercase tracking-widest">Por que alguns horários não estão livres</summary>
              <div className="mt-2 space-y-2">
                {gruposBloqueio.map((g) => (
                  <div key={g.chave} data-testid={`avulsa-motivo-${g.chave}`}>
                    <p className="font-bold">{g.titulo} ({g.horarios.length}): <span className="font-semibold tabular-nums">{g.horarios.join(", ")}</span></p>
                    {g.explicacoes.map((e) => <p key={e} className="text-muted-foreground">{e}</p>)}
                  </div>
                ))}
              </div>
            </details>
          )}
          {trechoProblema && (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700" data-testid="avulsa-provavel-conflito">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Provável conflito: {explicarPeriodo(trechoProblema, regras)} O sistema confere de novo ao salvar e recusa se houver conflito.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Ao confirmar, a consulta é gravada no sistema e criada no Google Agenda desta agenda. Nenhum convite é enviado a ninguém.
            {interno ? " A disponibilidade mostrada é conferida de novo no servidor no momento de confirmar." : ""}
          </p>

          {/* Resultado */}
          {resultado?.tipo === "recusada" && (
            <div role="alert" data-testid="avulsa-recusada" className="flex items-start gap-2 rounded-[6px] border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p>{resultado.mensagem}</p>
                {resultado.status === 409 && <p className="mt-1 text-xs font-medium">Escolha outro horário ou outra agenda. Nada foi gravado.</p>}
                {resultado.alternativas && (resultado.alternativas.mesmoDia.length > 0 || resultado.alternativas.proximoDia) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="avulsa-alternativas" role="group" aria-label="Horários alternativos">
                    <span className="text-xs font-medium">Alternativas (o sistema confere de novo ao confirmar):</span>
                    {resultado.alternativas.mesmoDia.map((t) => (
                      <button key={t} type="button" data-testid={`avulsa-alt-${t}`}
                        onClick={() => { setHorario(t); setInicioPedido(minutosDoHorario(t)); setResultado(null); }}
                        className="btn-3d-soft rounded-[4px] px-3 py-1 text-[11px] font-black tabular-nums text-foreground">{t}</button>
                    ))}
                    {resultado.alternativas.proximoDia && (
                      <button type="button" data-testid="avulsa-alt-proximo-dia"
                        onClick={() => { const a = resultado.alternativas!.proximoDia!; setData(a.date); setHorario(a.time); setInicioPedido(minutosDoHorario(a.time)); setResultado(null); }}
                        className="btn-3d-soft rounded-[4px] px-3 py-1 text-[11px] font-black text-foreground">
                        {resultado.alternativas.proximoDia.date.split("-").reverse().join("/")} às {resultado.alternativas.proximoDia.time}
                      </button>
                    )}
                  </div>
                )}
                {resultado.status === 404 && <p className="mt-1 text-xs font-medium">Confira se cliente e agenda são da empresa do seu acesso. Nada foi gravado.</p>}
              </div>
            </div>
          )}
          {resultado?.tipo === "google-aviso" && (
            <div role="alert" data-testid="avulsa-google-aviso" className="flex items-start gap-2 rounded-[6px] border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden /> Consulta salva no sistema.</p>
                <p className="mt-1">Google Agenda: {resultado.aviso}</p>
              </div>
            </div>
          )}
          {resultado?.tipo === "incerto" && (
            <div role="alert" data-testid="avulsa-incerto" className="space-y-2 rounded-[6px] border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Resultado incerto. {resultado.mensagem}</p>
              <Button type="button" variant="outline" size="sm" data-testid="avulsa-conferir" disabled={conferindo} onClick={conferirNaAgenda}
                className="btn-3d gap-2 text-[11px] font-black uppercase tracking-widest">
                {conferindo && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Conferir na agenda
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {faltando.length > 0 && !travado && (
              <span className="mr-auto text-xs text-muted-foreground" data-testid="avulsa-faltando">Falta: {faltando.join(", ")}.</span>
            )}
            <Button type="button" variant="outline" data-testid="avulsa-cancelar" disabled={enviando}
              onClick={fechar} className="btn-3d-soft text-[11px] font-black uppercase tracking-widest">
              {resultado?.tipo === "google-aviso" ? "Entendi" : "Cancelar"}
            </Button>
            {resultado?.tipo !== "google-aviso" && (
              <Button type="button" data-testid="avulsa-confirmar" disabled={!podeConfirmar} onClick={confirmar}
                className="btn-3d gap-2 text-[11px] font-black uppercase tracking-widest">
                {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {enviando ? "Salvando…" : "Confirmar agendamento"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
