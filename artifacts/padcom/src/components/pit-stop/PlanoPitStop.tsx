import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getCollabProfessional } from "@/lib/collab-auth";
import {
  PitStopErro, ROTULO_ESTADO, ROTULO_NIVEL, ROTULO_SYNC, motivoLegivel, useAcoesPlano, usePlano,
  type AjusteOcorrencia, type ItemPlano, type Participante, type Plano, type ResultadoOcorrencia,
} from "@/lib/pit-stop-api";

/**
 * Plano de agendamento compartilhado (Pit Stop). A mesma tela serve o médico logo após lançar e a recepção/enfermagem
 * na fila: o estado vem sempre do servidor e toda ação devolve o plano atualizado. Nada aqui reserva horário sozinho;
 * a reserva só nasce no botão "Confirmar e reservar".
 */
const MODALIDADES: { value: Participante["modalidade"]; label: string }[] = [
  { value: "local", label: "Sede" }, { value: "online", label: "Online" }, { value: "externo", label: "Outro local" }, { value: "home_care", label: "Home Care" },
];

type EquipeRascunho = { categoryId: number; modalidade: Participante["modalidade"]; agendaId: number | null; professionalId: number | null };
const ID_DO_PARTICIPANTE = (e: Participante): EquipeRascunho => ({
  categoryId: e.categoryId, modalidade: e.modalidade, agendaId: e.agendaId, professionalId: e.professionalIds[0] ?? null,
});

function Selo({ children, tom }: { children: React.ReactNode; tom: "ok" | "aviso" | "erro" | "neutro" }) {
  const cor = { ok: "#1f6b3a", aviso: "#7a5a12", erro: "#8a1c1c", neutro: "#2c3e63" }[tom];
  return <span className="bevel-3d inline-block px-2 py-1 text-[10px] font-black uppercase tracking-widest" style={{ color: cor }}>{children}</span>;
}

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

function BlocoOcorrencias({ item, enderecoPaciente, travado, resultados, onSalvar, salvando }: {
  item: ItemPlano; enderecoPaciente: string | null; travado: boolean; resultados: ResultadoOcorrencia[]; salvando: boolean;
  onSalvar: (ajustes: AjusteOcorrencia[]) => void;
}) {
  const original = useMemo(() => Object.fromEntries(item.ocorrencias.map((o) => [o.id, { data: o.data ?? "", hora: o.hora ?? "", endereco: o.enderecoVisita ?? "", doPaciente: false }])), [item.ocorrencias]);
  const [valores, setValores] = useState(original);
  useEffect(() => setValores(original), [original]);
  const mudou = (o: ItemPlano["ocorrencias"][number]) => {
    const v = valores[o.id], x = original[o.id];
    return v?.data !== x?.data || v?.hora !== x?.hora || (item.homeCare && (v?.endereco !== x?.endereco || v?.doPaciente));
  };
  const alteradas = item.ocorrencias.filter(mudou);
  const montar = (o: ItemPlano["ocorrencias"][number]): AjusteOcorrencia => {
    const v = valores[o.id]!;
    const base: AjusteOcorrencia = { id: o.id, data: v.data || null, hora: v.hora || null };
    if (!item.homeCare) return base;
    if (v.doPaciente) return { ...base, usarEnderecoPaciente: true };
    if (v.endereco.trim() && v.endereco !== original[o.id]?.endereco) return { ...base, enderecoVisita: v.endereco.trim() };
    return base;
  };
  return (
    <div className="space-y-2">
      {item.ocorrencias.map((o) => {
        const res = resultados.find((r) => r.itemId === item.id && r.numero === o.numero);
        const v = valores[o.id];
        return (
          <div key={o.id} className="concave-3d flex flex-wrap items-end gap-3 p-3" data-testid={`ocorrencia-${o.id}`}>
            <span className="text-xs font-black">{o.numero}/{item.totalSessoes}</span>
            <label className="text-[11px] font-bold">Data
              <input type="date" className="field-engraved mt-1 block min-h-10 px-2" disabled={travado || o.reservada} value={v?.data ?? ""}
                onChange={(e) => setValores((all) => ({ ...all, [o.id]: { ...all[o.id]!, data: e.target.value } }))} />
            </label>
            <label className="text-[11px] font-bold">Hora
              <input type="time" step={900} className="field-engraved mt-1 block min-h-10 px-2" disabled={travado || o.reservada} value={v?.hora ?? ""}
                onChange={(e) => setValores((all) => ({ ...all, [o.id]: { ...all[o.id]!, hora: e.target.value } }))} />
            </label>
            {o.reservada && <Selo tom="ok">Reservada</Selo>}
            {!o.reservada && !o.data && <Selo tom="aviso">{motivoLegivel(o.motivo, "Sem data")}</Selo>}
            {res && !res.ok && <span role="alert" className="text-xs font-bold text-red-800">{motivoLegivel(res.code, res.message)}</span>}
            {res?.ok && <span className="text-xs font-bold text-green-800">Horário livre para a equipe inteira.</span>}
            {item.homeCare && (
              <div className="w-full space-y-1" data-testid={`endereco-visita-${o.id}`}>
                <label className="block text-[11px] font-bold">Endereço da visita (Home Care)
                  <input type="text" maxLength={300} className="field-engraved mt-1 block min-h-10 w-full px-2" placeholder="Rua, número, complemento, bairro, cidade"
                    disabled={travado || o.reservada} value={v?.doPaciente ? enderecoPaciente ?? "" : v?.endereco ?? ""}
                    onChange={(e) => setValores((all) => ({ ...all, [o.id]: { ...all[o.id]!, endereco: e.target.value, doPaciente: false } }))} />
                </label>
                {!travado && !o.reservada && (
                  <button type="button" className="text-[11px] font-bold underline disabled:opacity-50" disabled={!enderecoPaciente}
                    onClick={() => setValores((all) => ({ ...all, [o.id]: { ...all[o.id]!, doPaciente: true } }))}>
                    {enderecoPaciente ? "Usar o endereço cadastrado do paciente" : "Paciente sem endereço cadastrado: informe o endereço da visita"}
                  </button>
                )}
                {o.enderecoVisita
                  ? <p className="text-[10px] text-muted-foreground">Gravado: {o.enderecoVisita} ({o.enderecoVisitaOrigem === "paciente" ? "copiado do cadastro do paciente" : "informado pela recepção"}).</p>
                  : <Selo tom="aviso">Endereço pendente: sem ele a visita Home Care não é reservada</Selo>}
              </div>
            )}
            {o.visitas.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {o.visitas.map((x) => `${x.agenda ?? "agenda"}: ${x.pendente ? "pendência no Google" : x.googleEventId ? "no Google" : "ainda não enviada"}`).join(" · ")}
              </span>
            )}
          </div>
        );
      })}
      {!travado && alteradas.length > 0 && (
        <Button type="button" size="sm" disabled={salvando} onClick={() => onSalvar(alteradas.map(montar))}>
          Salvar datas{item.homeCare ? " e endereços" : ""}
        </Button>
      )}
    </div>
  );
}

export function PlanoPitStop({ planoId, onFechar }: { planoId: number; onFechar?: () => void }) {
  const { toast } = useToast();
  const { data: plano, isLoading, error, refetch } = usePlano(planoId);
  const acoes = useAcoesPlano(planoId);
  const [resultados, setResultados] = useState<ResultadoOcorrencia[]>([]);
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
          <BlocoOcorrencias item={item} enderecoPaciente={plano.enderecoPaciente} travado={!editavel} resultados={resultados} salvando={acoes.ocorrencias.isPending}
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
    </div>
  );
}
