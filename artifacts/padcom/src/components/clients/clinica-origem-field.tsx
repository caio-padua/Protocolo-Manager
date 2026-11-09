import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { collabAuthHeaders, getCollabProfessional } from "@/lib/collab-auth";

type Clinic = { id: number; nome: string; nick: string | null; razaoSocial: string | null };
type Result = { empresaAtualId: number; clinicas: Clinic[] };

export function ClinicaOrigemField({ value, onChange, defaultToCurrent = false }: {
  value: string;
  onChange: (value: string) => void;
  defaultToCurrent?: boolean;
}) {
  const professionalId = getCollabProfessional()?.id ?? null;
  const { data, isLoading, isError, refetch } = useQuery<Result>({
    queryKey: ["clinicas-origem-cliente", professionalId],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/clients/clinicas-origem`, { headers: collabAuthHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar as clínicas.");
      return response.json();
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (defaultToCurrent && !value && data?.clinicas.some(c => c.id === data.empresaAtualId)) {
      onChange(String(data.empresaAtualId));
    }
  }, [defaultToCurrent, value, data, onChange]);

  const currentMissing = value && data && !data.clinicas.some(c => String(c.id) === value);
  return (
    <div className="md:col-span-2 space-y-1.5">
      <label htmlFor="clinica-origem" className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground flex items-center gap-1.5">
        <Building2 className="h-3 w-3 text-primary" /> Clínica de Origem
      </label>
      <div className="concave-3d p-1">
        <Select value={value || ""} onValueChange={(next) => { if (next) onChange(next); }} disabled={isLoading || isError}>
          <SelectTrigger id="clinica-origem" className="h-auto min-h-9 whitespace-normal text-left border-none bg-transparent shadow-none focus:ring-0 [&>span]:line-clamp-none [&>span]:min-w-0 [&>span]:break-words">
            <SelectValue placeholder={isLoading ? "Carregando clínicas..." : "Selecione a clínica..."} />
          </SelectTrigger>
          <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
            {currentMissing && <SelectItem value={value} disabled>Clínica anteriormente selecionada indisponível</SelectItem>}
            {data?.clinicas.map(c => (
              <SelectItem key={c.id} value={String(c.id)} className="whitespace-normal break-words [overflow-wrap:anywhere] [&>span:last-child]:min-w-0">
                {c.nome || c.nick || "Nome não informado"} ({c.razaoSocial || "Razão social não informada"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isError && <p role="alert" className="text-destructive text-xs">Não foi possível carregar as clínicas. <button type="button" className="underline" onClick={() => refetch()}>Tentar novamente</button></p>}
      <p className="text-xs text-muted-foreground">A clínica de origem não altera a empresa responsável nem o local da agenda.</p>
    </div>
  );
}
