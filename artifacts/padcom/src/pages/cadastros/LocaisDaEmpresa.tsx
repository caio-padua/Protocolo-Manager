import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useListAgendaResources } from "@workspace/api-client-react";
import { PlacaTitulo } from "@/components/ui/placa-titulo";
import { CartaoAgenda } from "@/components/CartaoAgenda";
import { collabAuthHeaders, getCollabProfessional } from "@/lib/collab-auth";
import { agendaResourcesFrescas } from "@/lib/agenda-propagacao";

const apiBase = import.meta.env.VITE_API_URL || "/api";
const appBase = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LocalVinculado {
  locationId: number;
  empresaId: number;
  name: string;
  active: boolean;
}

interface EmpresaVisivel {
  id: number;
}

export function LocaisDaEmpresa({ empresaId }: { empresaId: number }) {
  const professionalId = getCollabProfessional()?.id ?? null;
  const agendasQ = useListAgendaResources(agendaResourcesFrescas);
  const consulta = useQuery({
    queryKey: ["empresas-locais-confirmados", professionalId],
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const headers = collabAuthHeaders();
      const [empresas, locais] = await Promise.all([
        fetch(`${apiBase}/semantic-codes/companies`, { headers }),
        fetch(`${apiBase}/semantic-codes/locations`, { headers }),
      ]);
      if (!empresas.ok || !locais.ok) throw new Error("Não foi possível consultar os vínculos.");
      const empresasData: unknown = await empresas.json();
      const locaisData: unknown = await locais.json();
      if (!Array.isArray(empresasData) || !Array.isArray(locaisData)) throw new Error("Resposta de vínculos inválida.");
      return { empresas: empresasData as EmpresaVisivel[], locais: locaisData as LocalVinculado[] };
    },
  });

  if (consulta.isLoading || agendasQ.isLoading) return <p role="status" className="text-xs flex gap-2 items-center"><Loader2 className="w-4 h-4 animate-spin" /> Consultando agendas...</p>;
  if (consulta.isError || !consulta.data) return (
    <div role="alert" className="text-xs space-y-2">
      <p>Não foi possível consultar as agendas desta empresa.</p>
      <button type="button" className="btn-3d-soft px-3 py-1.5" onClick={() => void consulta.refetch()}>Tentar novamente</button>
    </div>
  );
  if (!consulta.data.empresas.some((empresa) => empresa.id === empresaId)) {
    return <p className="text-xs text-muted-foreground">Vínculos indisponíveis para esta empresa ou para sua sessão.</p>;
  }
  const locais = consulta.data.locais.filter((local) => local.empresaId === empresaId);
  const idsLocais = new Set(locais.map((l) => l.locationId));
  // Agendas de atendimento da empresa: o mesmo cartao da Agenda Configuracao. O local ligado a elas
  // nao reaparece na lista de locais abaixo (um registro, uma apresentacao).
  const agendas = (agendasQ.data ?? []).filter((r) => r.empresaId === empresaId || (r.locationId != null && idsLocais.has(r.locationId)));
  const idsLigados = new Set(agendas.map((r) => r.locationId).filter((v): v is number => v != null));
  const locaisSemAgenda = locais.filter((l) => !idsLigados.has(l.locationId));
  if (locais.length === 0 && agendas.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma agenda encontrada.</p>;

  return (
    <div className="space-y-5">
      {agendas.length > 0 && (
        <div className="space-y-2" data-testid="empresa-agendas">
          <PlacaTitulo titulo="Agendas de atendimento" />
          <ul className="space-y-2">
            {agendas.map((r) => (
              <li key={r.id}>
                <CartaoAgenda categoria={r.categoryName} forma={r.modality} titulo={r.name} cor={r.color} inativa={!r.active}
                  acao={
                    <a href={`${appBase}/agenda/motor?agenda=${r.id}`} className="bevel-3d shrink-0 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest" aria-label={`Editar agenda ${r.name}`}>
                      Editar
                    </a>
                  } />
              </li>
            ))}
          </ul>
        </div>
      )}
      {locaisSemAgenda.length > 0 && (
        <div className="space-y-2">
          {agendas.length > 0 && <PlacaTitulo titulo="Outros registros da empresa" />}
          <ul className="space-y-2">
            {locaisSemAgenda.map((local) => (
              <li key={local.locationId} className="concave-3d px-3 py-2 flex items-center gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase break-words">{local.name}</p>
                  <p className="text-[10px] text-muted-foreground">{local.active ? "Ativo" : "Inativo"}</p>
                </div>
                <a href={`${appBase}/cadastros/clinicas?local=${local.locationId}`} className="bevel-3d shrink-0 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest" aria-label={`Editar ${local.name}`}>
                  Editar
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
