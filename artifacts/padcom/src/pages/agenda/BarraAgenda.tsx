import type { ReactNode } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Clock, Download, LayoutGrid, Loader2, Plus, RefreshCw, Rows3, Sun } from "lucide-react";
import type { VisaoAgenda } from "./timeline-logica";
import "./agenda-barra.css";

export type ModoAgenda = "dia" | "semana" | "mes";

const MODOS: { id: ModoAgenda; rotulo: string; Icone: typeof Sun; unidade: string }[] = [
  { id: "dia", rotulo: "Dia", Icone: Sun, unidade: "dia" },
  { id: "semana", rotulo: "Semana", Icone: CalendarRange, unidade: "semana" },
  { id: "mes", rotulo: "Mês", Icone: LayoutGrid, unidade: "mês" },
];

const ANTERIOR: Record<ModoAgenda, string> = { dia: "Dia anterior", semana: "Semana anterior", mes: "Mês anterior" };
const PROXIMO: Record<ModoAgenda, string> = { dia: "Próximo dia", semana: "Próxima semana", mes: "Próximo mês" };

/**
 * Barra de comandos da Agenda, uma linha estreita que fica CONGELADA no topo (junto com a barra de agendas):
 * navegar (anterior · período · próximo · Hoje), escolher Dia/Semana/Mês, marcar e as ferramentas de apoio
 * (forma de exibir, ICS e Google) só com ícone e dica. Não calcula nada: recebe tudo pronto da tela.
 */
export function BarraAgenda({
  modo, aoMudarModo, visao, aoMudarVisao, periodo, legenda, noPeriodoAtual,
  aoAnterior, aoProximo, aoHoje, aoNovo, aoBaixarIcs, icsDesligado, aoAtualizarGoogle, googleAtualizando, filtro,
}: {
  modo: ModoAgenda; aoMudarModo: (m: ModoAgenda) => void;
  visao: VisaoAgenda; aoMudarVisao: (v: VisaoAgenda) => void;
  /** Texto principal do período ("9 — 15 nov 2026") e a linha pequena embaixo ("Esta semana"). */
  periodo: string; legenda: string; noPeriodoAtual: boolean;
  aoAnterior: () => void; aoProximo: () => void; aoHoje: () => void; aoNovo: () => void;
  aoBaixarIcs: () => void; icsDesligado: boolean;
  aoAtualizarGoogle: () => void; googleAtualizando: boolean;
  /** Barra de agendas, encaixada logo abaixo desta, no mesmo bloco congelado. */
  filtro: ReactNode;
}) {
  return (
    <div className="ag-congelada" data-testid="agenda-barra-congelada">
      <div className="ag-comandos">
        <h1 className="ag-titulo">Agenda</h1>

        <div className="ag-grupo ag-nav" role="group" aria-label="Navegar no período">
          <button type="button" onClick={aoAnterior} className="ag-seta btn-3d-soft" aria-label={ANTERIOR[modo]} title={ANTERIOR[modo]} data-testid="agenda-anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="ag-periodo bevel-3d" aria-live="polite" data-testid="agenda-periodo">
            <span className="ag-periodo-texto">{periodo}</span>
            <span className="ag-periodo-legenda">{legenda}</span>
          </div>
          <button type="button" onClick={aoProximo} className="ag-seta btn-3d-soft" aria-label={PROXIMO[modo]} title={PROXIMO[modo]} data-testid="agenda-proximo">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={aoHoje} aria-label="Voltar para hoje" title="Voltar para hoje" data-testid="agenda-hoje"
            className={`${noPeriodoAtual ? "btn-3d-soft text-muted-foreground" : "btn-3d text-primary-foreground"} ag-hoje`}>
            Hoje
          </button>
        </div>

        <div className="ag-grupo concave-3d ag-modos" role="group" aria-label="Escolher o período exibido">
          {MODOS.map(({ id, rotulo, Icone, unidade }) => (
            <button key={id} type="button" aria-pressed={modo === id} title={`Ver por ${unidade}`} onClick={() => aoMudarModo(id)}
              className={`${modo === id ? "bevel-3d text-primary" : "btn-3d-soft text-muted-foreground"} ag-modo`}>
              <Icone className="h-3.5 w-3.5" aria-hidden />{rotulo}
            </button>
          ))}
        </div>

        <div className="ag-direita">
          {modo !== "mes" && (
            <div className="ag-grupo concave-3d" role="group" aria-label="Forma de exibir">
              {([
                { id: "linha", rotulo: "Linha do tempo", Icone: Clock },
                { id: "lista", rotulo: "Lista", Icone: Rows3 },
              ] as { id: VisaoAgenda; rotulo: string; Icone: typeof Clock }[]).map(({ id, rotulo, Icone }) => (
                <button key={id} type="button" aria-pressed={visao === id} aria-label={rotulo} title={rotulo} onClick={() => aoMudarVisao(id)}
                  className={`${visao === id ? "bevel-3d text-primary" : "btn-3d-soft text-muted-foreground"} ag-icone`}>
                  <Icone className="h-3.5 w-3.5" aria-hidden />
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={aoBaixarIcs} disabled={icsDesligado} aria-label="Baixar ICS" title="Baixar o período em arquivo ICS (Google Agenda ou Apple Calendar)"
            className="btn-3d-soft ag-icone disabled:opacity-50">
            <Download className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" onClick={aoAtualizarGoogle} disabled={googleAtualizando} data-testid="button-refresh-google"
            aria-label={googleAtualizando ? "Atualizando do Google" : "Atualizar do Google"} title={googleAtualizando ? "Atualizando do Google…" : "Atualizar do Google"}
            className="btn-3d ag-icone">
            {googleAtualizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          </button>
          <button type="button" onClick={aoNovo} data-testid="novo-agendamento" title="Novo agendamento" className="btn-3d ag-novo">
            <Plus className="h-3.5 w-3.5" aria-hidden /><span className="max-sm:sr-only">Novo agendamento</span>
          </button>
        </div>
      </div>
      {filtro}
    </div>
  );
}
