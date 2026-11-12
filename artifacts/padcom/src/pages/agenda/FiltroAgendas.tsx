import { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, Lock, Minus } from "lucide-react";
import { useListAgendaResources } from "@workspace/api-client-react";
import { agendaResourcesFrescas } from "@/lib/agenda-propagacao";
import { rotuloDaForma } from "@/lib/agenda-forma";
import { useGoogleCompromissos } from "./useGoogleCompromissos";
import { corSegura } from "./timeline-logica";
import {
  alternarAgenda, alternarGrupo, mostrarTodas, montarGrupos, ocultarTodas, quantasOcultas, soEstaAgenda, todasAsChaves,
  type AgendaDoFiltro,
} from "./filtro-agendas";

/**
 * Filtro de agendas da Agenda Diária: agrupado por categoria, com "só esta", grupos recolhíveis e a mesma escolha
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
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  const [painelAberto, setPainelAberto] = useState(() => typeof window === "undefined" || window.innerWidth >= 768); // no celular nasce recolhido: a grade vem primeiro

  const grupos = useMemo(() => montarGrupos({
    agendas: (recursos.data ?? []).map((r) => ({
      id: r.id, name: r.name, color: r.color, modality: r.modality, categoryName: r.categoryName, active: r.active,
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
    <section className="panel-3d-sub space-y-2 p-3" data-testid="filtro-agendas" aria-label="Filtro de agendas">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={painelAberto} onClick={() => setPainelAberto((v) => !v)}
          className="bevel-3d flex min-h-9 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest" data-testid="filtro-agendas-recolher">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${painelAberto ? "" : "-rotate-90"}`} aria-hidden />
          Agendas exibidas
        </button>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground tabular-nums" data-testid="filtro-agendas-resumo">
          {todas.length - nOcultas} de {todas.length}
        </span>
        {nOcultas > 0 && (
          <span role="status" className="concave-3d flex items-center gap-2 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700" data-testid="filtro-agendas-ocultas">
            <EyeOff className="h-3.5 w-3.5" aria-hidden />{nOcultas} {nOcultas === 1 ? "agenda oculta" : "agendas ocultas"}
            <button type="button" onClick={() => onChange(mostrarTodas())} className="btn-3d-soft min-h-7 px-2 text-[10px]">Mostrar todas</button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => onChange(mostrarTodas())} disabled={nOcultas === 0}
            className="btn-3d-soft flex min-h-9 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50" data-testid="filtro-mostrar-todas">
            <Eye className="h-3.5 w-3.5" aria-hidden />Mostrar todas
          </button>
          <button type="button" onClick={() => onChange(ocultarTodas(todas))} disabled={todas.length === 0 || nOcultas === todas.length}
            className="btn-3d-soft flex min-h-9 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50" data-testid="filtro-limpar">
            <EyeOff className="h-3.5 w-3.5" aria-hidden />Limpar seleção
          </button>
        </div>
      </div>

      {recursos.isError && (
        <p role="alert" className="concave-3d px-3 py-2 text-[11px] font-bold text-amber-700">
          Não foi possível consultar as agendas cadastradas agora: só aparecem as que têm atendimento ou compromisso no período.
        </p>
      )}
      {google.isError && (
        <p role="alert" className="concave-3d px-3 py-2 text-[11px] font-bold text-amber-700">Google indisponível agora: os números do Google não estão atualizados.</p>
      )}
      {nOcultas === todas.length && todas.length > 0 && (
        <p role="status" className="concave-3d px-3 py-2 text-[11px] font-bold text-muted-foreground" data-testid="filtro-nenhuma">
          Nenhuma agenda selecionada: a grade fica vazia. Marque uma agenda ou use “Mostrar todas”.
        </p>
      )}

      {painelAberto && (
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
      )}
    </section>
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
