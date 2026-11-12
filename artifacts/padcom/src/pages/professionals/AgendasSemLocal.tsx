import { CheckCircle2, Circle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { rotuloDaForma } from "@/lib/agenda-forma";
import { ROTULO_ORIGEM, type AgendaDoProfissional } from "@/lib/agenda-vinculos-api";

/**
 * Agendas da clínica que NÃO têm local físico (Home Care, Outro local...). Elas não existem na lista de
 * clínicas/locais, então antes ficavam invisíveis no cadastro. O vínculo aqui é a preferência da agenda
 * (a mesma que o Pit Stop usa), sem criar local falso e sem dar acesso clínico por engano.
 */
export function agendasSemLocalDaEmpresa(agendas: readonly AgendaDoProfissional[], empresaId: number): AgendaDoProfissional[] {
  return agendas.filter((a) => a.locationId == null && a.empresaId === empresaId);
}

/** Nome da agenda que usa este local: a Agenda Configuração é a fonte do nome (renomear lá muda aqui). */
export function nomeDaAgendaDoLocal(agendas: readonly AgendaDoProfissional[], locationId: number): string | null {
  return agendas.find((a) => a.locationId === locationId)?.name ?? null;
}

export function AgendasSemLocal({ agendas, busyId, onToggle }: {
  agendas: AgendaDoProfissional[];
  busyId: number | null;
  onToggle: (agenda: AgendaDoProfissional) => void;
}) {
  if (agendas.length === 0) return null;
  return (
    <div className="bevel-3d border-l-2 border-primary/40 px-2 py-2 space-y-1.5" data-testid="agendas-sem-local">
      <p className="px-1 text-[11px] font-black uppercase tracking-widest text-foreground">
        Agendas sem local físico
        <span className="ml-2 text-[9px] font-semibold normal-case tracking-normal text-muted-foreground">
          Home Care, Outro local e demais agendas criadas em Agenda Configuração
        </span>
      </p>
      {agendas.map((a) => (
        <div key={a.id} data-testid={`agenda-sem-local-${a.id}`}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-none ${a.vinculado ? "bevel-3d" : "concave-3d"}`}>
          {a.vinculado ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-black uppercase leading-tight tracking-wide text-foreground">{a.name}</p>
            <p className="mt-0.5 truncate text-[9px] font-semibold text-muted-foreground/80">
              {a.categoriaNome ?? "Sem categoria"} · {rotuloDaForma(a.modality)}
              {a.origens.length > 0 && ` · ${a.origens.map((o) => ROTULO_ORIGEM[o]).join(" + ")}`}
            </p>
            {a.motivoBloqueio && (
              <p className="mt-0.5 text-[9px] font-semibold text-amber-600" data-testid={`motivo-agenda-${a.id}`}>{a.motivoBloqueio}</p>
            )}
          </div>
          <Switch
            checked={a.vinculado}
            disabled={busyId === a.id || !a.editavelNoCadastro}
            onCheckedChange={() => onToggle(a)}
            aria-label={`Vincular à ${a.name}`}
          />
        </div>
      ))}
    </div>
  );
}
