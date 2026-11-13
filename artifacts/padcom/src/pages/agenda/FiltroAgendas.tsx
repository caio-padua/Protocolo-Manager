import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, Lock, Minus, Plus, UserRound } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useGetAgendaOcupacao, useListAgendaResources } from "@workspace/api-client-react";
import { agendaResourcesFrescas } from "@/lib/agenda-propagacao";
import { rotuloDaForma } from "@/lib/agenda-forma";
import { useGoogleCompromissos } from "./useGoogleCompromissos";
import { Percentual } from "@/components/numeral/Numeral";
import { corSegura } from "./timeline-logica";
import {
  agendamentosPorExtenso, alternarAgenda, alternarGrupo, mostrarTodas, montarGrupos, ocultarTodas, nomeCurtoDaAgenda, quantasOcultas, rotuloDaEquipe, soEstaAgenda, todasAsChaves,
  type AgendaDoFiltro,
} from "./filtro-agendas";

/**
 * Filtro de agendas da Agenda Diária: UMA barra contínua de agendas (clique liga/desliga, dois cliques = só esta) com + e − na
 * ponta que abrem/fecham o painel completo, agrupado por categoria, com "só esta", grupos recolhíveis e a mesma escolha
 * valendo para Dia, Semana, Mês e Lista, para as sessões do sistema e para os compromissos do Google.
 * As agendas vêm da Agenda Configuração (mesma fonte das outras telas): criar, renomear ou desligar lá muda aqui.
 */
export function FiltroAgendas({ de, ate, sessoes, ocultas, onChange }: {
  de: string; ate: string;
  sessoes: { resourceId?: number | null; agendaNome?: string | null; agendaCor?: string | null }[];
  ocultas: ReadonlySet<string>;
  onChange: (proximas: ReadonlySet<string>) => void;
}) {
  const recursos = useListAgendaResources(agendaResourcesFrescas);
  const google = useGoogleCompromissos(de, ate);
  const ocupacao = useGetAgendaOcupacao({ de, ate });
  const refazerOcupacao = ocupacao.refetch;
  // Marcar, remarcar ou cancelar muda a lista de atendimentos do período: a barrinha acompanha.
  useEffect(() => { void refazerOcupacao(); }, [sessoes.length, refazerOcupacao]);
  const ocupacaoPorChave = useMemo(() => new Map((ocupacao.data ?? []).map((o) => [`r${o.resourceId}`, o])), [ocupacao.data]);
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  const [painelAberto, setPainelAberto] = useState(false); // nasce como barra estreita (tela e celular); o + abre o painel por grupo

  const grupos = useMemo(() => montarGrupos({
    agendas: (recursos.data ?? []).map((r) => ({
      id: r.id, name: r.name, color: r.color, modality: r.modality, categoryName: r.categoryName, professionalName: r.professionalName, active: r.active,
    })),
    sessoes,
    calendarios: google.data?.agendas ?? [],
    compromissos: google.data?.eventos ?? [],
  }), [recursos.data, sessoes, google.data]);
  const todas = useMemo(() => todasAsChaves(grupos), [grupos]);
  const nOcultas = quantasOcultas(ocultas, todas);

  const alternarRecolhido = (categoria: string) => setRecolhidos((s) => {
    const n = new Set(s);
    if (n.has(categoria)) n.delete(categoria); else n.add(categoria);
    return n;
  });

  return (
    <section className="space-y-1.5" data-testid="filtro-agendas" aria-label="Filtro de agendas"
      onKeyDown={(e) => { if (e.key === "Escape" && painelAberto) setPainelAberto(false); }}>
      <div className="ag-faixa">
        {painelAberto ? (
          <p className="concave-3d flex min-h-9 min-w-0 flex-1 items-center px-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Agendas exibidas · escolha abaixo
          </p>
        ) : (
          <div className="ag-trilho concave-3d" role="group" aria-label="Agendas exibidas" data-testid="agendas-faixa">
            {grupos.map((g) => (
              <div key={g.categoria} className="ag-grupo-faixa" role="presentation">
                {g.agendas.map((a) => {
                  const marcada = !ocultas.has(a.chave);
                  const soEsta = marcada && todas.filter((c) => c !== a.chave).every((c) => ocultas.has(c));
                  const detalhe = [a.forma ? rotuloDaForma(a.forma) : null, `${a.sessoes} atend.`, a.google > 0 ? `${a.google} Google` : a.somenteGoogle ? "Google" : null]
                    .filter(Boolean).join(" · ");
                  const o = ocupacaoPorChave.get(a.chave);
                  return (
                    <div key={a.chave} className="ag-cel" style={{ ["--ev" as string]: corSegura(a.cor) }}>
                      <HoverCard openDelay={70} closeDelay={30}>
                        <HoverCardTrigger asChild>
                          <button type="button" role="checkbox" aria-checked={marcada} data-testid={`chip-agenda-${a.chave}`}
                            onClick={() => onChange(alternarAgenda(ocultas, a.chave))}
                            onDoubleClick={() => onChange(soEsta ? mostrarTodas() : soEstaAgenda(ocultas, a.chave, todas))}
                            className={`${marcada ? "bevel-3d" : "concave-3d"} ag-chip`}>
                            <span className="ag-chip-equipe">{rotuloDaEquipe(g.categoria)}</span>
                            <span className="ag-chip-nome">
                              {a.somenteGoogle && <Lock className="ag-chip-cad" aria-label="Somente leitura (Google)" />}
                              <span className="ag-chip-nome-txt">{nomeCurtoDaAgenda(a.nome, g.categoria)}</span>
                            </span>
                            <OcupacaoDaAgenda o={a.somenteGoogle ? undefined : o} carregando={ocupacao.isLoading} falhou={ocupacao.isError} somenteGoogle={a.somenteGoogle} chave={a.chave} />
                            <span className="ag-vidro" aria-hidden />
                          </button>
                        </HoverCardTrigger>
                        {/* Nuvenzinha ao lado, opaca e sem capturar o mouse: nunca cobre nem atrapalha a grade da agenda. */}
                        <HoverCardContent side="right" align="start" alignOffset={-22} sideOffset={6} collisionPadding={12} avoidCollisions
                          className="ag-dica panel-3d" style={{ ["--ev" as string]: corSegura(a.cor) }} data-testid={`dica-agenda-${a.chave}`}>
                          <p className="ag-dica-nome">{a.nome}</p>
                          <p className="ag-dica-qtd" data-testid={`dica-qtd-${a.chave}`}>
                            {a.somenteGoogle ? agendamentosPorExtenso(a.google, ["compromisso do Google", "compromissos do Google"]) : agendamentosPorExtenso(a.sessoes)}
                          </p>
                          {!a.somenteGoogle && a.google > 0 && (
                            <p className="ag-dica-extra">{agendamentosPorExtenso(a.google, ["compromisso do Google", "compromissos do Google"])}</p>
                          )}
                          <p className="ag-dica-prof">
                            <UserRound className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                            <span>{a.somenteGoogle ? "Calendário somente leitura" : a.profissional ?? "Agenda compartilhada"}</span>
                          </p>
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                  );
                })}
              </div>
            ))}
            {grupos.length === 0 && <span className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nenhuma agenda encontrada</span>}
          </div>
        )}
        <div className="ag-ponta">
          {/* Espaço FIXO: aparecer ou sumir o aviso nunca desloca as agendas (o clique seguinte cai no mesmo lugar). */}
          {nOcultas > 0 ? (
            <span role="status" className="ag-ocultas text-amber-700" data-testid="filtro-agendas-ocultas">
              <EyeOff className="h-3.5 w-3.5" aria-hidden />{nOcultas} <span className="sr-only">{nOcultas === 1 ? "agenda oculta" : "agendas ocultas"}</span>
              <button type="button" onClick={() => onChange(mostrarTodas())} className="btn-3d-soft ag-ocultas-btn" aria-label="Mostrar todas as agendas" title="Mostrar todas as agendas">
                <Eye className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ) : <span className="ag-ocultas" aria-hidden />}
          <span className="ag-resumo" data-testid="filtro-agendas-resumo">{todas.length - nOcultas} de {todas.length}</span>
          <button type="button" aria-expanded={painelAberto} onClick={() => setPainelAberto((v) => !v)} data-testid="filtro-agendas-recolher"
            aria-label={painelAberto ? "Minimizar agendas" : "Maximizar agendas"} title={painelAberto ? "Minimizar: voltar para a barra" : "Maximizar: ver agendas por grupo, com “Só esta”"}
            className="ag-maxmin bevel-3d">
            {painelAberto ? <Minus className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        {painelAberto && (
          <div className="ag-gaveta panel-3d-sub space-y-2 p-3" data-testid="filtro-agendas-gaveta">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="mr-auto text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dica: na barra, dois cliques numa agenda mostram só ela.</p>
              <button type="button" onClick={() => onChange(mostrarTodas())} disabled={nOcultas === 0}
                className="btn-3d-soft flex min-h-9 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50" data-testid="filtro-mostrar-todas">
                <Eye className="h-3.5 w-3.5" aria-hidden />Mostrar todas
              </button>
              <button type="button" onClick={() => onChange(ocultarTodas(todas))} disabled={todas.length === 0 || nOcultas === todas.length}
                className="btn-3d-soft flex min-h-9 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50" data-testid="filtro-limpar">
                <EyeOff className="h-3.5 w-3.5" aria-hidden />Limpar seleção
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {grupos.map((g) => {
                const chaves = g.agendas.map((a) => a.chave);
                const visiveis = chaves.filter((c) => !ocultas.has(c)).length;
                const estado: boolean | "mixed" = visiveis === chaves.length ? true : visiveis === 0 ? false : "mixed";
                const recolhido = recolhidos.has(g.categoria);
                return (
                  <div key={g.categoria} className="concave-3d space-y-1 p-2" role="group" aria-label={`Agendas de ${g.categoria}`} data-testid={`grupo-${g.categoria}`}>
                    <div className="flex items-center gap-1.5">
                      <button type="button" role="checkbox" aria-checked={estado} onClick={() => onChange(alternarGrupo(ocultas, chaves))}
                        aria-label={`Marcar ou desmarcar todas as agendas de ${g.categoria}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center" data-testid={`grupo-marcar-${g.categoria}`}>
                        <Caixa estado={estado} cor="#64748b" />
                      </button>
                      <button type="button" aria-expanded={!recolhido} onClick={() => alternarRecolhido(g.categoria)}
                        className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left text-[10px] font-black uppercase tracking-widest" data-testid={`grupo-recolher-${g.categoria}`}>
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${recolhido ? "-rotate-90" : ""}`} aria-hidden />
                        <span className="truncate">{g.categoria}</span>
                        <span className="ml-auto tabular-nums text-muted-foreground">{visiveis}/{chaves.length}</span>
                      </button>
                    </div>
                    {!recolhido && (
                      <ul className="space-y-1">
                        {g.agendas.map((a) => (
                          <LinhaAgenda key={a.chave} a={a} marcada={!ocultas.has(a.chave)}
                            soEsta={!ocultas.has(a.chave) && todas.filter((c) => c !== a.chave).every((c) => ocultas.has(c))}
                            onAlternar={() => onChange(alternarAgenda(ocultas, a.chave))}
                            onSoEsta={() => onChange(soEstaAgenda(ocultas, a.chave, todas))} />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {recursos.isError && (
        <p role="alert" className="concave-3d px-3 py-1.5 text-[11px] font-bold text-amber-700">
          Não foi possível consultar as agendas cadastradas agora: só aparecem as que têm atendimento ou compromisso no período.
        </p>
      )}
      {google.isError && (
        <p role="alert" className="concave-3d px-3 py-1.5 text-[11px] font-bold text-amber-700">Google indisponível agora: os números do Google não estão atualizados.</p>
      )}
      {nOcultas === todas.length && todas.length > 0 && (
        <p role="status" className="concave-3d px-3 py-1.5 text-[11px] font-bold text-muted-foreground" data-testid="filtro-nenhuma">
          Nenhuma agenda selecionada: a grade fica vazia. Marque uma agenda ou use “Mostrar todas”.
        </p>
      )}
    </section>
  );
}

/** Canto direito do botão da agenda: porcentagem de ocupação (vagas ocupadas / vagas previstas no período) e a sigla "OCUP" embaixo. */
function OcupacaoDaAgenda({ o, carregando, falhou, somenteGoogle, chave }: {
  o?: { capacidade: number; ocupadas: number }; carregando: boolean; falhou: boolean; somenteGoogle: boolean; chave: string;
}) {
  const sem = !o || o.capacidade === 0;
  const pct = o && o.capacidade > 0 ? Math.round((o.ocupadas / o.capacidade) * 100) : null;
  const estado = somenteGoogle ? "somente-leitura" : carregando ? "carregando" : falhou ? "indisponivel" : sem ? "sem-vagas" : pct! >= 100 ? "cheia" : "ok";
  const dica = {
    "somente-leitura": "Somente leitura (Google): sem vagas do sistema",
    carregando: "Calculando a ocupação…",
    indisponivel: "Ocupação indisponível agora",
    "sem-vagas": "Sem vagas previstas no período exibido",
    cheia: `${o?.ocupadas} de ${o?.capacidade} vagas ocupadas no período exibido`,
    ok: `${o?.ocupadas} de ${o?.capacidade} vagas ocupadas no período exibido`,
  }[estado];
  return (
    <span className="ag-ocup" data-testid={`ocupacao-${chave}`} data-estado={estado} data-cheia={estado === "cheia" ? "sim" : "nao"} aria-label={dica}>
      {estado === "ok" || estado === "cheia" ? <Percentual valor={pct} casas={0} peso={700} className="ag-ocup-pct" /> : <span className="ag-ocup-pct" aria-label={dica}>{estado === "carregando" ? "…" : "—"}</span>}
      <span className="ag-ocup-sigla" aria-hidden>Ocup</span>
    </span>
  );
}

function Caixa({ estado, cor }: { estado: boolean | "mixed"; cor: string }) {
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-[3px] ring-1 ring-black/20" style={{ backgroundColor: estado ? cor : "transparent" }} aria-hidden>
      {estado === true && <Check className="h-3 w-3 text-white mix-blend-difference" strokeWidth={4} />}
      {estado === "mixed" && <Minus className="h-3 w-3 text-foreground" strokeWidth={4} />}
    </span>
  );
}

function LinhaAgenda({ a, marcada, soEsta, onAlternar, onSoEsta }: {
  a: AgendaDoFiltro; marcada: boolean; soEsta: boolean; onAlternar: () => void; onSoEsta: () => void;
}) {
  const cor = corSegura(a.cor);
  return (
    <li className={`${marcada ? "panel-3d-sub" : "opacity-60"} flex items-center gap-1`} data-testid={`filtro-agenda-${a.chave}`}>
      <button type="button" role="checkbox" aria-checked={marcada} onClick={onAlternar}
        title={a.somenteGoogle ? `${a.nome} (Google, somente leitura)` : a.nome}
        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2 text-left">
        <Caixa estado={marcada} cor={cor} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-bold uppercase tracking-tight">{a.nome}</span>
          <span className="block truncate text-[9px] font-semibold text-muted-foreground">
            {a.forma ? `${rotuloDaForma(a.forma)} · ` : ""}{a.sessoes} atend.
            {a.google > 0 && <> · <Lock className="inline h-2.5 w-2.5" aria-hidden /> {a.google} Google</>}
            {a.somenteGoogle && a.google === 0 && " · Google"}
          </span>
        </span>
      </button>
      <button type="button" aria-pressed={soEsta} onClick={onSoEsta}
        title={soEsta ? "Voltar a mostrar todas as agendas" : "Mostrar só esta agenda"}
        className={`${soEsta ? "bevel-3d text-primary" : "btn-3d-soft text-muted-foreground"} mr-1 min-h-9 shrink-0 px-2 text-[9px] font-black uppercase tracking-widest`}
        data-testid={`so-esta-${a.chave}`}>
        Só esta
      </button>
    </li>
  );
}
