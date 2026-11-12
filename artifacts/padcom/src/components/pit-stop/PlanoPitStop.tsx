import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getCollabProfessional } from "@/lib/collab-auth";
import { fmtDataHora, hojeBrt } from "@/lib/pit-stop-formato";
import {
  PitStopErro, ROTULO_ESTADO, ROTULO_NIVEL, ROTULO_SYNC, motivoLegivel, useAcoesPlano, usePlano,
  type ItemPlano, type Participante, type Plano, type ResultadoOcorrencia,
} from "@/lib/pit-stop-api";
import { BlocoOcorrencias } from "./BlocoOcorrencias";
import { CalendarioPlano } from "./CalendarioPlano";
import { EncaixePrimeira } from "./EncaixePrimeira";
import { MoverOcorrenciaDialog, type AlvoMover } from "./MoverOcorrenciaDialog";
import { Selo } from "./Selo";

/**
 * Plano de agendamento compartilhado (Pit Stop). A mesma tela serve o médico logo após lançar e a recepção/enfermagem
 * na fila: o estado vem sempre do servidor e toda ação devolve o plano atualizado. Nada aqui reserva horário sozinho;
 * a reserva só nasce no botão "Confirmar e reservar".
 */
const MODALIDADES: { value: Participante["modalidade"]; label: string }[] = [
  { value: "local", label: "Sede" }, { value: "online", label: "Online" }, { value: "externo", label: "Local externo" }, { value: "home_care", label: "Home Care" },
];

type EquipeRascunho = { categoryId: number; modalidade: Participante["modalidade"]; agendaId: number | null; professionalId: number | null };
const ID_DO_PARTICIPANTE = (e: Participante): EquipeRascunho => ({
  categoryId: e.categoryId, modalidade: e.modalidade, agendaId: e.agendaId, professionalId: e.professionalIds[0] ?? null,
});

function EditorEquipe({ item, plano, travado, onSalvar, salvando }: {
  item: ItemPlano; plano: Plano; travado: boolean; salvando: boolean; onSalvar: (equipe: EquipeRascunho[]) => void;
}) {
  const original = useMemo(() => item.equipe.map(ID_DO_PARTICIPANTE), [item.equipe]);
  const [rascunho, setRascunho] = useState<EquipeRascunho[]>(original);
  useEffect(() => setRascunho(original), [original]);
  const mudou = JSON.stringify(rascunho) !== JSON.stringify(original);
  const alterar = (i: number, parte: Partial<EquipeRascunho>) => setRascunho((r) => r.map((x, j) => (j === i ? { ...x, ...parte } : x)));
  // As opções de agenda vêm do servidor para a configuração JÁ salva; ao trocar categoria/modalidade, salvar atualiza as opções.
  return (
    <div className="space-y-2">
      {rascunho.map((e, i) => {
        const salvo = item.equipe[i];
        const opcoes = salvo && salvo.categoryId === e.categoryId && salvo.modalidade === e.modalidade ? salvo.opcoesAgenda : [];
        const pessoas = plano.profissionaisPorCategoria.filter((p) => p.categoryId === e.categoryId);
        return (
          <div key={i} className="concave-3d grid gap-2 p-3 sm:grid-cols-4" data-testid={`equipe-${item.id}-${i}`}>
            <label className="text-[11px] font-bold">Categoria
              <select className="field-engraved mt-1 min-h-10 w-full px-2" disabled={travado} value={e.categoryId}
                onChange={(ev) => alterar(i, { categoryId: Number(ev.target.value), agendaId: null, professionalId: null })}>
                {plano.categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold">Modalidade
              <select className="field-engraved mt-1 min-h-10 w-full px-2" disabled={travado} value={e.modalidade}
                onChange={(ev) => alterar(i, { modalidade: ev.target.value as Participante["modalidade"], agendaId: null })}>
                {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold">Agenda
              <select className="field-engraved mt-1 min-h-10 w-full px-2" disabled={travado || opcoes.length === 0} value={e.agendaId ?? ""}
                onChange={(ev) => alterar(i, { agendaId: ev.target.value ? Number(ev.target.value) : null })}>
                <option value="">{opcoes.length === 0 ? (mudou ? "Salve para ver as agendas" : "Nenhuma agenda elegível") : "Escolha pendente"}</option>
                {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
              {salvo?.agendaOrigem === "sugerida" && e.agendaId === salvo.agendaId && <span className="text-[10px] font-normal text-muted-foreground">Sugerida pelo padrão da clínica; você pode trocar.</span>}
            </label>
            <label className="text-[11px] font-bold">Profissional
              <select className="field-engraved mt-1 min-h-10 w-full px-2" disabled={travado} value={e.professionalId ?? ""}
                onChange={(ev) => alterar(i, { professionalId: ev.target.value ? Number(ev.target.value) : null })}>
                <option value="">Quem a agenda definir</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}{p.habilitacaoNivel ? ` — ${ROTULO_NIVEL[p.habilitacaoNivel] ?? p.habilitacaoNivel}` : ""}</option>)}
              </select>
              {salvo?.exigeNivel && <span className="block text-[10px] font-normal text-amber-900">Este procedimento exige {ROTULO_NIVEL[salvo.exigeNivel] ?? salvo.exigeNivel}; o servidor recusa outro nível.</span>}
              {salvo?.profissionalOrigem === "preferencia" && e.professionalId === (salvo.professionalIds[0] ?? null) && <span className="block text-[10px] font-normal text-muted-foreground">Sugerido pela preferência da agenda; você pode trocar.</span>}
            </label>
            {!travado && rascunho.length > 1 && (
              <button type="button" className="text-left text-[11px] font-bold text-red-800 underline sm:col-span-4"
                onClick={() => setRascunho((r) => r.filter((_, j) => j !== i))}>Remover esta pessoa da equipe</button>
            )}
          </div>
        );
      })}
      {!travado && (
        <div className="flex flex-wrap gap-2">
          {rascunho.length < 3 && (
            <Button type="button" variant="outline" size="sm"
              onClick={() => setRascunho((r) => [...r, { categoryId: plano.categorias[0]?.id ?? 1, modalidade: "local", agendaId: null, professionalId: null }])}>
              Adicionar à equipe (até 3)
            </Button>
          )}
          {mudou && (
            <Button type="button" size="sm" disabled={salvando} onClick={() => onSalvar(rascunho)}>Salvar equipe</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function PlanoPitStop({ planoId, onFechar }: { planoId: number; onFechar?: () => void }) {
  const { toast } = useToast();
  const { data: plano, isLoading, error, refetch } = usePlano(planoId);
  const acoes = useAcoesPlano(planoId);
  const [resultados, setResultados] = useState<ResultadoOcorrencia[]>([]);
  const [mover, setMover] = useState<{ ocId: number; destino: { data: string; hora: string } | null } | null>(null);
  const eu = getCollabProfessional()?.id ?? null;

  const falha = (titulo: string) => (e: unknown) => {
    if (e instanceof PitStopErro && Array.isArray(e.corpo.resultados)) setResultados(e.corpo.resultados as ResultadoOcorrencia[]);
    toast({ title: titulo, description: e instanceof Error ? e.message : undefined, variant: "destructive" });
  };
  const rodar = <V,>(m: { mutate: (v: V, o: { onError: (e: unknown) => void; onSuccess?: (r: unknown) => void }) => void }, v: V, titulo: string, ok?: string) =>
    m.mutate(v, { onError: falha(titulo), onSuccess: () => { if (ok) toast({ title: ok }); } });

  if (isLoading) return <p role="status">Carregando o plano…</p>;
  if (error || !plano) return <p role="alert" className="text-red-800">{error instanceof Error ? error.message : "Plano não encontrado."}</p>;

  const ocupado = plano.estado === "em_revisao" && plano.revisorId !== eu && !plano.revisaoExpirada;
  const minhaRevisao = plano.estado === "em_revisao" && plano.revisorId === eu;
  const editavel = minhaRevisao;
  const semProblema = plano.itens.every((i) => !i.problema && i.ocorrencias.every((o) => o.data && o.hora && (!i.homeCare || o.enderecoVisita)));
  const sync = plano.syncEstado;
  const detalheSync = plano.syncDetalhe?.visitas?.filter((v) => v.status !== "sincronizado" && v.status !== "ja_sincronizado") ?? [];

  // Alvo da tela de prévia: sempre derivado do plano atual (o servidor é a fonte da verdade).
  const alvoMover: AlvoMover | null = (() => {
    if (!mover) return null;
    for (const it of plano.itens) {
      const o = it.ocorrencias.find((x) => x.id === mover.ocId);
      if (o) return { planoId: plano.id, ocId: o.id, itemNome: it.nome, numero: o.numero, total: it.totalSessoes, data: o.data, hora: o.hora };
    }
    return null;
  })();
  const soltarNoDia = (ocId: number, data: string) => {
    const hora = plano.itens.flatMap((i) => i.ocorrencias).find((o) => o.id === ocId)?.hora ?? "09:00";
    setMover({ ocId, destino: { data, hora } });
  };
  const confirmarMover = (v: { ocId: number; data: string; hora: string; aceitarForaDaJanela: boolean }) =>
    acoes.mover.mutate({ versao: plano.versao, ...v }, {
      onError: falha("Nada foi movido"),
      onSuccess: () => { setMover(null); toast({ title: "Visita movida no plano", description: "É só a proposta: nada foi reservado nem enviado ao Google." }); },
    });
  const encaixar = async (itemId: number, v: { horaTermino?: string; aceitarForaDaJanela: boolean }) => {
    const r = await acoes.encaixar.mutateAsync({ versao: plano.versao, itemId, ...v });
    toast({ title: r.encaixe ? `1ª sessão encaixada hoje às ${r.encaixe.time}` : "Encaixe feito", description: "É só a proposta: reservar acontece em “Confirmar e reservar”." });
    return r.encaixe ?? null;
  };
  const soPresencial = (it: ItemPlano) => it.equipe.length > 0 && it.equipe.every((e) => e.modalidade === "local");

  return (
    <div className="space-y-4" data-testid="plano-pit-stop">
      <header className="panel-3d-sub space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-black uppercase tracking-widest">{plano.cliente}</h2>
          <Selo tom={plano.estado === "confirmado" ? "ok" : plano.estado === "cancelado" ? "erro" : "aviso"}>{ROTULO_ESTADO[plano.estado]}</Selo>
          {plano.estado === "confirmado" && <Selo tom={sync === "sincronizado" ? "ok" : sync === "nao_iniciada" ? "neutro" : "erro"}>{ROTULO_SYNC[sync]}</Selo>}
        </div>
        <p className="text-xs text-muted-foreground">
          Protocolo: {plano.protocolo} · Prescritor: {plano.prescritor ?? "não informado"}
          {plano.revisor && ` · Em revisão por ${plano.revisor}${plano.revisaoExpirada ? " (concessão vencida: pode ser assumida)" : ""}`}
          {plano.confirmador && ` · Confirmado por ${plano.confirmador}`}
        </p>
        {ocupado && <p role="status" className="flex items-center gap-2 text-xs font-bold text-amber-900"><Lock className="h-4 w-4" />Outra pessoa está revisando este plano. Você só pode ver.</p>}
        <p className="text-[11px] text-muted-foreground">Nenhum horário fica reservado até o botão “Confirmar e reservar”. Médico e recepção veem o mesmo plano.</p>
      </header>

      <CalendarioPlano plano={plano} hoje={hojeBrt()} travado={!editavel} onSoltar={soltarNoDia} onAbrir={(ocId) => setMover({ ocId, destino: null })} />

      {plano.itens.map((item) => (
        <section key={item.id} className="panel-3d-sub space-y-3 p-4" aria-label={item.nome}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary">{item.nome}</h3>
            <span className="text-[11px] text-muted-foreground">{item.totalSessoes} sessão(ões)
              {item.totalSessoes > 1 ? ` · a cada ${item.intervaloDias} dia(s)` : ""} · {Math.round(item.duracaoSegundos / 60)} min</span>
            {item.homeCare && <Selo tom="neutro">Home Care: no endereço do paciente</Selo>}
            {item.origemRequisito && <Selo tom="neutro">Equipe herdada: {item.origemRequisito === "substancia_participacao_medica" ? "substância (participação médica)" : item.origemRequisito.replace(/_/g, " ")}</Selo>}
          </div>
          {item.problema && (
            <p role="alert" className="flex items-start gap-2 text-xs font-bold text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{motivoLegivel(item.problema.code, item.problema.message)}
            </p>
          )}
          <EditorEquipe item={item} plano={plano} travado={!editavel} salvando={acoes.equipe.isPending}
            onSalvar={(equipe) => rodar(acoes.equipe, {
              versao: plano.versao, itemId: item.id,
              equipe: equipe.map((e) => ({ categoryId: e.categoryId, modalidade: e.modalidade, agendaId: e.agendaId, professionalIds: e.professionalId ? [e.professionalId] : [] })),
            }, "Não foi possível salvar a equipe", "Equipe salva")} />
          {editavel && soPresencial(item) && item.ocorrencias[0] && !item.ocorrencias[0].reservada && (
            <EncaixePrimeira itemNome={item.nome} ocupado={acoes.encaixar.isPending}
              onEncaixar={(v) => encaixar(item.id, v)} onEscolher={(data, hora) => setMover({ ocId: item.ocorrencias[0]!.id, destino: { data, hora } })} />
          )}
          <BlocoOcorrencias item={item} enderecoPaciente={plano.enderecoPaciente} travado={!editavel} resultados={resultados} salvando={acoes.ocorrencias.isPending}
            onAlterar={(ocId) => setMover({ ocId, destino: null })} expandirId={mover?.ocId ?? null}
            onSalvar={(ajustes) => rodar(acoes.ocorrencias, { versao: plano.versao, ajustes }, "Não foi possível salvar as datas", "Datas salvas")} />
        </section>
      ))}

      {plano.estado === "confirmado" && sync !== "sincronizado" && (
        <div role="alert" className="panel-3d-sub space-y-2 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-red-900"><XCircle className="h-4 w-4" />
            {sync === "nao_iniciada" ? "A reserva interna vale; o envio ao Google ainda não foi feito." : "A reserva interna vale, mas o Google NÃO confirmou todas as visitas."}
          </p>
          {plano.syncDetalhe?.motivo && <p className="text-xs">Motivo: {plano.syncDetalhe.motivo === "google_indisponivel" ? "não foi possível confirmar a conta Google autorizada." : plano.syncDetalhe.motivo}</p>}
          {detalheSync.map((v) => <p key={v.sessionId} className="text-xs">{v.date} {v.time} · {v.procedimento} ({v.agenda ?? "agenda"}): {v.error ?? v.status}</p>)}
          <Button type="button" size="sm" disabled={acoes.sincronizar.isPending}
            onClick={() => rodar(acoes.sincronizar, undefined as never, "O Google ainda não confirmou", "Envio ao Google refeito")}>
            <RefreshCw className="mr-1 h-4 w-4" />Reenviar ao Google (não duplica)
          </Button>
        </div>
      )}
      {plano.estado === "confirmado" && sync === "sincronizado" && (
        <p className="flex items-center gap-2 text-sm font-bold text-green-900"><CheckCircle2 className="h-4 w-4" />Reserva interna e Google confirmados.</p>
      )}

      {plano.estado !== "confirmado" && plano.estado !== "cancelado" && (
        <footer className="flex flex-wrap gap-2">
          {!minhaRevisao && !ocupado && (
            <Button type="button" disabled={acoes.abrir.isPending} onClick={() => rodar(acoes.abrir, undefined as never, "Não foi possível assumir o plano")}>
              <ShieldCheck className="mr-1 h-4 w-4" />Assumir revisão
            </Button>
          )}
          {minhaRevisao && (
            <>
              <Button type="button" variant="outline" disabled={acoes.revalidar.isPending}
                onClick={() => acoes.revalidar.mutate(undefined, {
                  onSuccess: (r) => { setResultados(r.resultados); toast({ title: r.ok ? "Tudo livre agora" : "Há conflitos", description: r.ok ? "Nada foi reservado." : "Veja os avisos nas ocorrências." }); },
                  onError: falha("Não foi possível revalidar"),
                })}>
                Revalidar horários
              </Button>
              <Button type="button" disabled={acoes.confirmar.isPending || !semProblema} title={semProblema ? undefined : "Resolva as pendências antes de confirmar"}
                onClick={() => rodar(acoes.confirmar, plano.versao, "Nada foi reservado", "Plano confirmado e reservado")}>
                Confirmar e reservar
              </Button>
              <Button type="button" variant="outline" disabled={acoes.liberar.isPending} onClick={() => rodar(acoes.liberar, undefined as never, "Não foi possível devolver à fila")}>
                Devolver à fila
              </Button>
            </>
          )}
          {(minhaRevisao || plano.estado === "pendente") && (
            <Button type="button" variant="outline" disabled={acoes.cancelar.isPending}
              onClick={() => { if (window.confirm("Cancelar este plano? Nenhuma reserva existe ainda.")) rodar(acoes.cancelar, undefined as never, "Não foi possível cancelar", "Plano cancelado"); }}>
              Cancelar plano
            </Button>
          )}
        </footer>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>Atualizar</Button>
        {onFechar && <Button type="button" variant="ghost" size="sm" onClick={onFechar}>Fechar</Button>}
      </div>
      <MoverOcorrenciaDialog alvo={alvoMover} destino={mover?.destino ?? null} salvando={acoes.mover.isPending} onFechar={() => setMover(null)} onMover={confirmarMover} />
    </div>
  );
}
