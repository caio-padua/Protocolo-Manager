import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Flag } from "lucide-react";
import { PlanoPitStop } from "@/components/pit-stop/PlanoPitStop";
import { ROTULO_ESTADO, ROTULO_SYNC, useFilaPitStop, type LinhaFila } from "@/lib/pit-stop-api";

const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" }, { valor: "pendente", rotulo: "Pendentes" }, { valor: "em_revisao", rotulo: "Em revisão" }, { valor: "confirmado", rotulo: "Confirmados" },
];

function Linha({ l, ativa, onAbrir }: { l: LinhaFila; ativa: boolean; onAbrir: () => void }) {
  const alerta = l.estado === "confirmado" && l.syncEstado !== "sincronizado";
  return (
    <button type="button" onClick={onAbrir} aria-pressed={ativa} data-testid={`pit-stop-linha-${l.id}`}
      className={`${ativa ? "panel-3d-active" : "panel-3d-sub"} w-full space-y-1 p-3 text-left`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wider">{l.cliente}</span>
        <span className="text-[10px] font-bold uppercase">{ROTULO_ESTADO[l.estado]}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {l.itens} procedimento(s) · {l.ocorrencias} visita(s){l.semData > 0 ? ` · ${l.semData} sem data` : ""}
        {l.prescritor ? ` · prescritor ${l.prescritor}` : ""}
      </p>
      {l.estado === "em_revisao" && l.revisor && <p className="text-[11px] font-bold text-amber-900">Em revisão por {l.revisor}{l.revisaoExpirada ? " (vencida)" : ""}</p>}
      {alerta && <p className="text-[11px] font-bold text-red-800">{ROTULO_SYNC[l.syncEstado]}</p>}
    </button>
  );
}

export default function PitStopPage() {
  const [, navegar] = useLocation();
  const [, params] = useRoute<{ id: string }>("/pit-stop/:id");
  const selecionado = params?.id ? Number(params.id) : null;
  const [estado, setEstado] = useState("");
  const [busca, setBusca] = useState("");
  const fila = useFilaPitStop(estado || undefined, busca || undefined);
  return (
    <div className="space-y-4 p-4">
      <header className="panel-3d space-y-1 p-4">
        <h1 className="flex items-center gap-2 text-base font-black uppercase tracking-widest"><Flag className="h-5 w-5" />Pit Stop</h1>
        <p className="text-sm text-muted-foreground">
          Planos de agendamento lançados pelo médico, à espera da recepção ou da enfermagem. O plano é um só: quem confirma reserva a agenda interna e envia ao Google Agenda.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <aside className="space-y-3" aria-label="Fila do Pit Stop">
          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <button key={f.valor} type="button" aria-pressed={estado === f.valor} onClick={() => setEstado(f.valor)}
                className={`${estado === f.valor ? "bevel-3d" : "btn-3d-soft"} px-3 py-1.5 text-[11px] font-black uppercase tracking-widest`}>{f.rotulo}</button>
            ))}
          </div>
          <input className="field-engraved min-h-10 w-full px-3" placeholder="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
          {fila.isLoading && <p role="status">Carregando a fila…</p>}
          {fila.isError && <p role="alert" className="text-red-800">{fila.error instanceof Error ? fila.error.message : "Falha ao carregar a fila."}</p>}
          {fila.data && fila.data.planos.length === 0 && <p className="concave-3d p-3 text-sm">Nenhum plano na fila.</p>}
          {fila.data?.planos.map((l) => <Linha key={l.id} l={l} ativa={l.id === selecionado} onAbrir={() => navegar(`/pit-stop/${l.id}`)} />)}
        </aside>
        <main>
          {selecionado ? <PlanoPitStop key={selecionado} planoId={selecionado} /> : <p className="concave-3d p-4 text-sm">Escolha um plano da fila para ver a equipe, as agendas e os horários.</p>}
        </main>
      </div>
    </div>
  );
}
