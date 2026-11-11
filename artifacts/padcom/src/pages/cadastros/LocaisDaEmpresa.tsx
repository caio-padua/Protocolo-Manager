import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { collabAuthHeaders, getCollabProfessional } from "@/lib/collab-auth";

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
  const consulta = useQuery({
    queryKey: ["empresas-locais-confirmados", professionalId],
    retry: false,
    staleTime: 30_000,
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

  if (consulta.isLoading) return <p role="status" className="text-xs flex gap-2 items-center"><Loader2 className="w-4 h-4 animate-spin" /> Consultando locais...</p>;
  if (consulta.isError || !consulta.data) return (
    <div role="alert" className="text-xs space-y-2">
      <p>Não foi possível consultar os locais desta empresa.</p>
      <button type="button" className="btn-3d-soft px-3 py-1.5" onClick={() => void consulta.refetch()}>Tentar novamente</button>
    </div>
  );
  if (!consulta.data.empresas.some((empresa) => empresa.id === empresaId)) {
    return <p className="text-xs text-muted-foreground">Vínculos indisponíveis para esta empresa ou para sua sessão.</p>;
  }
  const locais = consulta.data.locais.filter((local) => local.empresaId === empresaId);
  if (locais.length === 0) return <p className="text-xs text-muted-foreground">Nenhum local vinculado encontrado.</p>;

  return (
    <ul className="space-y-2">
      {locais.map((local) => (
        <li key={local.locationId} className="concave-3d px-3 py-2 flex items-center gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase break-words">{local.name}</p>
            <p className="text-[10px] text-muted-foreground">{local.active ? "Local ativo" : "Local inativo"}</p>
          </div>
          <a href={`${appBase}/cadastros/clinicas?local=${local.locationId}`} className="bevel-3d shrink-0 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest" aria-label={`Editar local ${local.name}`}>
            Editar
          </a>
        </li>
      ))}
    </ul>
  );
}
