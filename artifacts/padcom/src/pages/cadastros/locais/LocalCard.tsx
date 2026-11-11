import { ChaveOuro } from "@/components/ui/chave-ouro";
import { JanelaDado } from "@/components/ui/janela-dado";
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

export function ModoBadge({ local }: { local: Pick<LocalAtendimento, "modalidade" | "mesmoEnderecoEmpresa"> }) {
  const modo = modoDoLocal(local);
  const m = MODO_META[modo];
  return (
    <span
      className="inline-flex h-6 items-center rounded-[3px] border px-2 text-[9px] font-black uppercase tracking-widest shrink-0"
      style={{ backgroundColor: m.fundo, color: m.texto, borderColor: m.borda }}
      title={m.explicacao}
    >
      {m.rotulo}
    </span>
  );
}

// Card do local (Padrão 40): nome em janela Côncava, cada dado na sua janela com rótulo escrito (mesma linha vertical),
// só aparece o que existe. Sem símbolos, sem número de identificação.
export function LocalCard({ c, onEdit, onToggleAtivo }: { c: LocalAtendimento; onEdit: () => void; onToggleAtivo: (ativo: boolean) => void }) {
  const modo = modoDoLocal(c);
  const l1 = [c.logradouro, c.numero, c.complemento].filter(Boolean).join(", ");
  const l2 = [c.bairro, c.cidade ? `${c.cidade}${c.estado ? " - " + c.estado : ""}` : c.estado].filter(Boolean).join(" · ");
  const endereco = [l1, l2].filter(Boolean).join(" · ") || (modo === "definir" ? "A definir" : c.address || "");
  const agenda = `${c.agendaPapel ? `${PAPEIS_AGENDA.find((p) => p.valor === c.agendaPapel)?.rotulo ?? c.agendaPapel} · ` : ""}${c.googleCalendarId ? calLabel(c.googleCalendarId) : ""}`.replace(/ · $/, "");
  const observacao = [c.nomeEspaco, c.observacaoLocal].filter(Boolean).join(" — ");
  const equipe = c.professionals?.length ?? 0;

  return (
    <div data-testid={`local-card-${c.id}`} className={`panel-3d relative overflow-hidden flex flex-col ${c.active ? "" : "opacity-60"}`}>
      <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-[6px]" style={{ backgroundColor: c.color || "#16284a" }} />
      <div className="pl-4 pr-3 pt-3 pb-3 flex flex-col gap-2.5 flex-1">
        <div className="concave-3d flex min-h-[3.5rem] min-w-0 items-center justify-between gap-2 px-3 py-2">
          <h3 className="min-w-0 font-black text-[14px] uppercase tracking-tight leading-tight line-clamp-2" title={c.name}>{c.name}</h3>
          <ModoBadge local={c} />
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          {modo === "online" && <JanelaDado rotulo="Atendimento">Online{endereco ? " · endereço de referência" : ""}</JanelaDado>}
          {endereco && <JanelaDado rotulo="Endereço" titulo={endereco}>{endereco}</JanelaDado>}
          {modo === "sede" && <JanelaDado rotulo="Local">Mesmo endereço da empresa</JanelaDado>}
          {c.phone && <JanelaDado rotulo="Telefone">{displayPhone(c.phone)}</JanelaDado>}
          {agenda && <JanelaDado rotulo="Agenda" mono titulo={c.googleCalendarId ?? undefined}>{agenda}</JanelaDado>}
          {observacao && <JanelaDado rotulo="Observação" titulo={observacao}>{observacao}</JanelaDado>}
          {equipe > 0 && <JanelaDado rotulo="Equipe">{`${equipe} profissional${equipe > 1 ? "is" : ""}`}</JanelaDado>}
        </div>

        <div className="flex gap-2 pt-0.5">
          <button type="button" onClick={onEdit} data-testid={`local-editar-${c.id}`}
            className="bevel-3d flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors">
            Editar
          </button>
          <label className="bevel-3d px-3 py-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest cursor-pointer">
            {c.active ? "Ativo" : "Inativo"}
            <ChaveOuro checked={!!c.active} onCheckedChange={onToggleAtivo} data-testid={`local-ativo-${c.id}`}
              aria-label={`${c.active ? "Desativar" : "Ativar"} ${c.name}`} />
          </label>
        </div>
      </div>
    </div>
  );
}
