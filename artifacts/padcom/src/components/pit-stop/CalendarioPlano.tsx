import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { toCivilDate } from "@/lib/civil-date";
import type { Plano } from "@/lib/pit-stop-api";

/**
 * Mini calendário do plano: mostra onde cada visita cai e deixa ARRASTAR uma visita para outro dia (mouse e toque).
 * Soltar não grava nada: abre a tela de prévia, e o servidor decide. O botão "Alterar data/hora" de cada cartão é o
 * caminho acessível por teclado e leitor de tela. Visitas já reservadas e planos que você não está revisando não arrastam.
 */
const CORES = ["#1d4f8f", "#7a5a12", "#1f6b3a", "#6b2c7a", "#8a1c1c"];
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export type VisitaCal = { ocId: number; itemId: number; itemNome: string; numero: number; total: number; data: string; hora: string; reservada: boolean; manual: boolean; encaixe: boolean; cor: string; nominal: string | null };

export function visitasDoPlano(plano: Plano): VisitaCal[] {
  const out: VisitaCal[] = [];
  plano.itens.forEach((it, idx) => {
    for (const o of it.ocorrencias) {
      if (!o.data || !o.hora) continue;
      out.push({ ocId: o.id, itemId: it.id, itemNome: it.nome, numero: o.numero, total: it.totalSessoes, data: o.data, hora: o.hora,
        reservada: o.reservada, manual: o.origem === "manual", encaixe: o.encaixe === true, cor: CORES[idx % CORES.length]!, nominal: o.avaliacao?.dataNominal ?? null });
    }
  });
  return out.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
}

const rotuloVisita = (v: VisitaCal) =>
  `Sessão ${v.numero} de ${v.total}, ${v.itemNome}, ${v.data.split("-").reverse().join("/")} ${v.hora}${v.reservada ? ", reservada" : ""}`;
const classeChip = (livre: boolean) =>
  `bevel-3d flex w-full min-w-0 items-center gap-1 border-l-4 px-1 py-0.5 text-left text-[10px] font-bold leading-tight ${livre ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`;
const conteudoChip = (v: VisitaCal, livre: boolean) => (
  <>
    {livre && <GripVertical className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
    <span className="truncate">{v.numero}/{v.total} {v.hora}{v.encaixe ? " encaixe" : ""}</span>
  </>
);

function Chip({ v, travado, onAbrir }: { v: VisitaCal; travado: boolean; onAbrir: (ocId: number) => void }) {
  const livre = !travado && !v.reservada;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `oc:${v.ocId}`, disabled: !livre });
  // Visita reservada (ou plano só para leitura) não é controle: vira texto, sem foco falso nem "desabilitado" confuso.
  if (!livre) {
    return (
      <div role="note" aria-label={rotuloVisita(v)} data-testid={`chip-${v.ocId}`} data-reservada={v.reservada ? "sim" : "nao"}
        style={{ borderLeftColor: v.cor }} className={classeChip(false)}>
        {conteudoChip(v, false)}
      </div>
    );
  }
  return (
    <button ref={setNodeRef} type="button" {...listeners} {...attributes}
      aria-label={`${rotuloVisita(v)}. Arraste para outro dia ou pressione Enter para alterar data e hora`}
      data-testid={`chip-${v.ocId}`} data-reservada="nao" data-arrastando={isDragging ? "sim" : "nao"}
      onClick={() => onAbrir(v.ocId)}
      style={{ borderLeftColor: v.cor, touchAction: "none", opacity: isDragging ? 0.35 : 1 }}
      className={classeChip(true)}>
      {conteudoChip(v, true)}
    </button>
  );
}

/** Cópia visual que acompanha o dedo/mouse (não registra um segundo arrastável com o mesmo id). */
function ChipFlutuante({ v }: { v: VisitaCal }) {
  return <div aria-hidden style={{ borderLeftColor: v.cor }} className={`${classeChip(true)} shadow-lg`}>{conteudoChip(v, true)}</div>;
}

function Celula({ dia, mesAtual, hoje, visitas, travado, janela, onAbrir }: {
  dia: Date; mesAtual: Date; hoje: string; visitas: VisitaCal[]; travado: boolean; janela: boolean; onAbrir: (ocId: number) => void;
}) {
  const iso = format(dia, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({ id: `dia:${iso}`, disabled: iso < hoje });
  const fora = dia.getMonth() !== mesAtual.getMonth();
  return (
    <div ref={setNodeRef} data-testid={`cal-dia-${iso}`} data-janela={janela ? "sim" : "nao"} data-sobre={isOver ? "sim" : "nao"}
      className={`concave-3d min-h-[64px] space-y-0.5 p-1 ${fora ? "opacity-50" : ""} ${isOver ? "ring-2 ring-amber-500" : janela ? "ring-1 ring-emerald-600/60" : ""}`}>
      <span className={`block text-right text-[10px] font-black ${iso === hoje ? "text-amber-700" : ""}`} aria-label={format(dia, "d 'de' MMMM", { locale: ptBR })}>{format(dia, "d")}</span>
      {visitas.map((v) => <Chip key={v.ocId} v={v} travado={travado} onAbrir={onAbrir} />)}
    </div>
  );
}

export function CalendarioPlano({ plano, hoje, travado, onSoltar, onAbrir }: {
  plano: Plano; hoje: string; travado: boolean; onSoltar: (ocId: number, data: string) => void; onAbrir: (ocId: number) => void;
}) {
  const visitas = useMemo(() => visitasDoPlano(plano), [plano]);
  const [, navegar] = useLocation();
  const inicial = visitas[0]?.data ?? hoje;
  const [mes, setMes] = useState(() => startOfMonth(toCivilDate(inicial)));
  const [ativa, setAtiva] = useState<VisitaCal | null>(null);
  // Mouse com distância mínima (não rouba o clique) e toque com pressão curta (não rouba a rolagem da página).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const dias = eachDayOfInterval({ start: startOfWeek(startOfMonth(mes), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }) });
  const porDia = useMemo(() => { const m: Record<string, VisitaCal[]> = {}; for (const v of visitas) (m[v.data] ??= []).push(v); return m; }, [visitas]);
  const dentroDaJanela = (iso: string) => {
    if (!ativa?.nominal) return false;
    const n = toCivilDate(ativa.nominal);
    return iso >= format(subDays(n, 4), "yyyy-MM-dd") && iso <= format(addDays(n, 4), "yyyy-MM-dd");
  };
  const aoSoltar = (e: DragEndEvent) => {
    const v = ativa; setAtiva(null);
    const alvo = e.over?.id ? String(e.over.id) : "";
    if (!v || !alvo.startsWith("dia:")) return;
    const data = alvo.slice(4);
    if (data !== v.data) onSoltar(v.ocId, data);
  };
  const aoComecar = (e: DragStartEvent) => setAtiva(visitas.find((v) => `oc:${v.ocId}` === String(e.active.id)) ?? null);
  const abrirMaior = (modo: "dia" | "semana" | "mes") => navegar(`/agenda?${new URLSearchParams({ data: visitas[0]?.data ?? hoje, modo })}`);

  return (
    <section className="panel-3d-sub space-y-2 p-3" aria-label="Calendário do plano" data-testid="calendario-plano">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><CalendarDays className="h-4 w-4" />Calendário do plano</h3>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Mês anterior" className="bevel-3d min-h-9 min-w-9" onClick={() => setMes((m) => addMonths(m, -1))}><ChevronLeft className="mx-auto h-4 w-4" /></button>
          <span className="min-w-[8.5rem] text-center text-xs font-bold capitalize" aria-live="polite">{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</span>
          <button type="button" aria-label="Próximo mês" className="bevel-3d min-h-9 min-w-9" onClick={() => setMes((m) => addMonths(m, 1))}><ChevronRight className="mx-auto h-4 w-4" /></button>
        </div>
      </div>
      <DndContext sensors={sensors} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setAtiva(null)}>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Dias do mês">
          {DIAS.map((d) => <span key={d} className="text-center text-[10px] font-black uppercase text-muted-foreground">{d}</span>)}
          {dias.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            return <Celula key={iso} dia={d} mesAtual={mes} hoje={hoje} visitas={porDia[iso] ?? []} travado={travado} janela={dentroDaJanela(iso)} onAbrir={onAbrir} />;
          })}
        </div>
        <DragOverlay>{ativa ? <ChipFlutuante v={ativa} /> : null}</DragOverlay>
      </DndContext>
      <p className="text-[10px] text-muted-foreground">
        {travado ? "Assuma a revisão para mover visitas." : "Arraste uma visita para outro dia (no celular, segure um instante e arraste) ou use o botão “Alterar data/hora” do cartão. Nada é gravado sem a prévia."}
        {ativa ? " Contorno verde: dentro da janela de 4 dias." : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-bold">Abrir calendário maior:</span>
        <button type="button" className="bevel-3d min-h-9 px-3 font-bold" onClick={() => abrirMaior("dia")}>Dia</button>
        <button type="button" className="bevel-3d min-h-9 px-3 font-bold" onClick={() => abrirMaior("semana")}>Semana</button>
        <button type="button" className="bevel-3d min-h-9 px-3 font-bold" onClick={() => abrirMaior("mes")}>Mês</button>
      </div>
    </section>
  );
}
