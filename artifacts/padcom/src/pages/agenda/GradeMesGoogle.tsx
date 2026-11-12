import { useMemo } from "react";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, Repeat } from "lucide-react";
import { useGoogleCompromissos } from "./useGoogleCompromissos";
import { chaveDoCompromisso } from "./filtro-agendas";
import type { GoogleAgendaCommitment } from "@workspace/api-client-react";

/**
 * Mês no estilo Google Agenda: lista "Minhas agendas" com bolinha colorida e caixa de seleção à esquerda,
 * e na grade os compromissos aparecem DENTRO de cada dia (hora + título), não só a contagem.
 * Sessões do PAXTER são editáveis nos cartões abaixo; compromissos do Google são somente leitura (cadeado).
 * Nada aqui grava no Google nem move evento externo.
 */
type SessaoGrade = { id: number; scheduledTime: string; clientName: string; status: string };
const MAX_CHIPS = 3;
const corSegura = (c: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#94a3b8");
const hora = (e: GoogleAgendaCommitment) => (e.diaInteiro ? "" : e.horario.slice(0, 5));

type Chip = { chave: string; ordem: string; texto: string; cor: string; google: boolean; recorrente?: boolean; titulo: string };

export function GradeMesGoogle({
  currentDate, today, sessionsByDate, selectedDay, onSelectDay, statusColor, ocultas, children,
}: {
  currentDate: Date; today: Date; sessionsByDate: Record<string, SessaoGrade[]>;
  selectedDay: Date | null; onSelectDay: (d: Date | null) => void; statusColor: Record<string, string>;
  /** Agendas desmarcadas no filtro único da Agenda Diária (as sessões já chegam filtradas). */
  ocultas: ReadonlySet<string>;
  /** Conteúdo exibido abaixo da grade (detalhe do dia). */
  children?: React.ReactNode;
}) {
  const monthStart = startOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const de = format(gridStart, "yyyy-MM-dd");
  const ate = format(gridEnd, "yyyy-MM-dd");
  const dias = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [de, ate]); // eslint-disable-line react-hooks/exhaustive-deps

  const google = useGoogleCompromissos(de, ate);

  const visivel = (k: string) => !ocultas.has(k);

  const eventosPorDia = useMemo(() => {
    const m: Record<string, GoogleAgendaCommitment[]> = {};
    for (const e of google.data?.eventos ?? []) (m[e.data] ??= []).push(e);
    return m;
  }, [google.data]);
  const chipsDoDia = (dia: string): Chip[] => {
    const lista: Chip[] = [];
    {
      for (const s of sessionsByDate[dia] ?? []) {
        lista.push({ chave: `s${s.id}`, ordem: s.scheduledTime, texto: `${s.scheduledTime.slice(0, 5)} ${s.clientName}`, titulo: `Sessão PAXTER: ${s.clientName} às ${s.scheduledTime.slice(0, 5)}`,
          cor: statusColor[s.status] ?? "#45B8CC", google: false });
      }
    }
    for (const e of eventosPorDia[dia] ?? []) {
      if (!visivel(chaveDoCompromisso(e))) continue;
      lista.push({ chave: e.id, ordem: e.diaInteiro ? "00:00" : e.horario.slice(0, 5), texto: `${hora(e)} ${e.titulo}`.trim(), titulo: `${e.titulo} (${e.agenda}, somente leitura)`,
        cor: corSegura(e.cor), google: true, recorrente: e.recorrente });
    }
    return lista.sort((a, b) => a.ordem.localeCompare(b.ordem) || a.texto.localeCompare(b.texto));
  };

  const ativo = selectedDay ?? (isSameMonth(today, currentDate) ? today : null);
  const nomesDias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <div className="grid grid-cols-1 gap-4" data-testid="grade-mes-google">
      <div className="min-w-0 space-y-4">
        {google.isError && <p role="alert" className="concave-3d px-3 py-2 text-[11px] font-bold text-red-800">Google indisponível: só as sessões do PAXTER aparecem.</p>}
        <div className="panel-3d overflow-hidden rounded-[6px]">
          <div className="grid grid-cols-7 border-b border-muted/20">
            {nomesDias.map((d) => <div key={d} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((dia) => {
              const k = format(dia, "yyyy-MM-dd");
              const chips = chipsDoDia(k);
              const doMes = isSameMonth(dia, currentDate);
              const hoje = isSameDay(dia, today);
              const sel = ativo ? isSameDay(dia, ativo) : false;
              return (
                <div key={k} role="button" tabIndex={0} data-dia={k} data-testid={`dia-${k}`}
                  aria-label={`${format(dia, "d 'de' MMMM", { locale: ptBR })}: ${chips.length} compromisso(s)`}
                  onClick={() => onSelectDay(sel ? null : dia)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectDay(sel ? null : dia); } }}
                  className={["flex min-h-[104px] cursor-pointer flex-col gap-0.5 border-b border-r border-muted/10 p-1 transition-all focus-visible:outline-2 focus-visible:outline-[#48b6cc]",
                    doMes ? "" : "opacity-40", sel ? "concave-3d" : "hover:bg-accent/5"].join(" ")}>
                  <span className={["mx-auto mb-0.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-black tabular-nums leading-none",
                    hoje ? "bg-primary text-primary-foreground" : doMes ? "text-foreground" : "text-muted-foreground"].join(" ")}>
                    {format(dia, "d")}
                  </span>
                  {chips.slice(0, MAX_CHIPS).map((c) => (
                    <span key={c.chave} title={c.titulo} data-origem={c.google ? "google" : "paxter"}
                      className="flex items-center gap-1 truncate rounded-[3px] px-1 py-px text-[10px] font-bold leading-tight text-white"
                      style={{ backgroundColor: c.cor, textShadow: "0 1px 1px rgba(0,0,0,.35)" }}>
                      {c.google && <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden />}
                      {c.recorrente && <Repeat className="h-2.5 w-2.5 shrink-0" aria-hidden />}
                      <span className="truncate">{c.texto}</span>
                    </span>
                  ))}
                  {chips.length > MAX_CHIPS && (
                    <span className="px-1 text-[10px] font-black text-muted-foreground">+{chips.length - MAX_CHIPS} mais</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {ativo && <CompromissosDoDia dia={ativo} eventos={(eventosPorDia[format(ativo, "yyyy-MM-dd")] ?? []).filter((e) => visivel(`g${e.agendaId}`))} />}
        {children}
      </div>
    </div>
  );
}


function CompromissosDoDia({ dia, eventos }: { dia: Date; eventos: GoogleAgendaCommitment[] }) {
  if (!eventos.length) return null;
  return (
    <section className="concave-3d space-y-1 rounded-[6px] p-3" aria-label={`Compromissos do Google em ${format(dia, "dd/MM/yyyy")}`}>
      <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden />Google em {format(dia, "dd/MM")} (somente leitura)
      </h3>
      <ul className="space-y-1">
        {eventos.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-xs">
            <span className="h-3 w-1 shrink-0 rounded-sm" style={{ backgroundColor: corSegura(e.cor) }} aria-hidden />
            <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{e.diaInteiro ? "Dia inteiro" : e.horario}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{e.titulo}</span>
            <span className="hidden shrink-0 truncate text-[10px] font-bold uppercase text-muted-foreground sm:block">{e.agenda}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
