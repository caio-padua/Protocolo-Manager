import { MapPin, Phone, CalendarCheck, Users, Pencil, Trash2, Building2, Video, HelpCircle, MessageSquareText } from "lucide-react";
import { MODO_META, PAPEIS_AGENDA, modoDoLocal, type LocalAtendimento } from "./locais-modo";

function displayPhone(raw: string | null): string {
  if (!raw) return "—";
  const clean = raw.replace(/^\+55/, "").replace(/\D/g, "");
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return raw;
}
function calLabel(id: string | null): string {
  if (!id) return "—";
  if (id.includes("@group.calendar.google.com")) return id.split("@")[0].slice(0, 14) + "…";
  return id.length > 26 ? id.slice(0, 24) + "…" : id;
}

export function ModoBadge({ local, compacto = false }: { local: Pick<LocalAtendimento, "modalidade" | "mesmoEnderecoEmpresa">; compacto?: boolean }) {
  const modo = modoDoLocal(local);
  const m = MODO_META[modo];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 text-[9px] font-black uppercase tracking-widest shrink-0"
      style={{ backgroundColor: m.fundo, color: m.texto, borderColor: m.borda }}
      title={m.explicacao}
    >
      <m.Icon className="w-3 h-3" aria-hidden />
      {compacto ? null : m.rotulo}
      {compacto ? <span className="sr-only">{m.rotulo}</span> : null}
    </span>
  );
}

// Card do local: 5 zonas fixas (Grade Imaginaria). Campo vazio mostra "—".
export function LocalCard({ c, onEdit, onDelete }: { c: LocalAtendimento; onEdit: () => void; onDelete: () => void }) {
  const modo = modoDoLocal(c);
  const l1 = [c.logradouro, c.numero, c.complemento].filter(Boolean).join(", ");
  const l2 = [c.bairro, c.cidade ? `${c.cidade}${c.estado ? " - " + c.estado : ""}` : c.estado].filter(Boolean).join(" · ");
  const equipe = c.professionals?.length ?? 0;

  return (
    <div data-testid={`local-card-${c.id}`} className={`panel-3d relative overflow-hidden flex flex-col ${c.active ? "" : "opacity-60"}`}>
      <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-[6px]" style={{ backgroundColor: c.color || "#16284a" }} />
      <div className="pl-4 pr-3 pt-3 pb-3 flex flex-col gap-2.5 flex-1">
        {/* Zona 1 — barra superior fixa */}
        <div className="flex items-center gap-2 h-6">
          <span className={`paxter-led ${c.active ? "paxter-led-breathe paxter-led-green" : "paxter-led-amber"}`} aria-label={c.active ? "Ativo" : "Inativo"} />
          <ModoBadge local={c} />
          <span className="ml-auto text-[9px] text-muted-foreground/60 font-mono shrink-0">#{c.id}</span>
        </div>

        {/* Zona 2 — título (duas linhas reservadas) */}
        <h3 className="font-black text-[14px] uppercase tracking-tight leading-tight line-clamp-2 min-h-[2.4em]" title={c.name}>
          {c.name}
        </h3>

        {/* Zona 5 — conteúdo em sulco côncavo, linhas fixas */}
        <div className="concave-3d p-2.5 space-y-1.5 flex-1 text-[11px]">
          <div className="flex items-start gap-2 min-h-[2.6em]">
            {modo === "online" ? <Video className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/60" /> :
              modo === "sede" ? <Building2 className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/60" /> :
              modo === "definir" && !l1 ? <HelpCircle className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/60" /> :
              <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/60" />}
            <div className="min-w-0">
              {modo === "online" && <p className="text-foreground/80">Atendimento online{l1 ? " · endereço de referência" : ""}</p>}
              {l1 ? (
                <>
                  <p className="text-foreground/80 truncate">{l1}</p>
                  <p className="text-muted-foreground truncate">{l2 || "—"}</p>
                </>
              ) : modo !== "online" ? (
                <p className="text-muted-foreground">{modo === "definir" ? "Defina a modalidade e o endereço" : (c.address || "—")}</p>
              ) : null}
              {modo === "sede" && <p className="text-[9px] font-black uppercase tracking-widest text-primary/70">= endereço da empresa</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-3 h-3 shrink-0 text-muted-foreground/60" />
            <span className={c.phone ? "text-foreground/80" : "text-muted-foreground"}>{displayPhone(c.phone)}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-3 h-3 shrink-0 text-muted-foreground/60" />
            <span className="text-muted-foreground font-mono truncate" title={c.googleCalendarId ?? undefined}>
              {c.agendaPapel ? `${PAPEIS_AGENDA.find((p) => p.valor === c.agendaPapel)?.rotulo ?? c.agendaPapel} · ` : ""}{calLabel(c.googleCalendarId)}
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquareText className="w-3 h-3 shrink-0 text-muted-foreground/60" />
            <span className={`truncate ${c.observacaoLocal || c.nomeEspaco ? "text-foreground/80" : "text-muted-foreground"}`}
              title={[c.nomeEspaco, c.observacaoLocal].filter(Boolean).join(" — ") || undefined}>
              {[c.nomeEspaco, c.observacaoLocal].filter(Boolean).join(" — ") || "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-3 h-3 shrink-0 text-muted-foreground/60" />
            <span className={equipe ? "text-foreground/80" : "text-muted-foreground"}>
              {equipe ? `${equipe} profissional${equipe > 1 ? "is" : ""}` : "—"}
            </span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-0.5">
          <button type="button" onClick={onEdit} data-testid={`local-editar-${c.id}`}
            className="bevel-3d flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-primary/10 transition-colors">
            <Pencil className="w-3 h-3" /> Editar
          </button>
          <button type="button" onClick={onDelete} aria-label={`Apagar ${c.name}`}
            className="bevel-3d px-3 py-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
