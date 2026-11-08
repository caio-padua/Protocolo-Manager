import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Loader2 } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GoogleAgendaCommitments } from "@workspace/api-client-react";

export function GoogleCommitments({ de, ate }: { de: string; ate: string }) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["google-compromissos", de, ate],
    queryFn: async ({ signal }) => {
      const base = import.meta.env.VITE_API_URL || "/api";
      const params = new URLSearchParams({ de, ate });
      const response = await fetch(`${base}/agenda/google-compromissos?${params}`, {
        headers: collabAuthHeaders(), signal,
      });
      if (!response.ok) throw new Error("Não foi possível carregar a agenda importada.");
      return response.json() as Promise<GoogleAgendaCommitments>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const events = useMemo(() => {
    const term = search.toLocaleLowerCase("pt-BR");
    return (query.data?.eventos ?? []).filter((event) =>
      `${event.titulo} ${event.agenda}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [query.data, search]);
  return (
    <section className="panel-3d p-4 space-y-4" aria-label="Compromissos importados do Google">
      <h2 className="bevel-3d inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest">
        <Calendar className="h-4 w-4" /> Compromissos do Google
      </h2>
      <p className="text-xs text-muted-foreground">
        Importação desde 01/09/2026 · período conforme a navegação acima · sem alterar o Google.
      </p>
      <Input aria-label="Buscar nos compromissos do Google" placeholder="Buscar compromisso ou agenda…"
        className="field-engraved" value={search} onChange={(event) => setSearch(event.target.value)} />
      {query.isPending ? <p role="status" className="flex gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando compromissos…</p>
        : query.isError ? <div role="alert" className="concave-3d p-3 text-sm">
          Não foi possível consultar a agenda.
          <Button type="button" className="btn-3d-soft ml-2" onClick={() => void query.refetch()}>Tentar novamente</Button>
        </div> : events.length === 0 ? <p className="concave-3d p-3 text-sm">
          Nenhum compromisso do Google neste período ou nesta busca.
        </p> : <div className="concave-3d overflow-auto max-h-[520px] rounded-[6px]">
          <table className="w-full min-w-[620px] text-left text-xs">
            <caption className="sr-only">Compromissos do Google no período selecionado</caption>
            <thead className="sticky top-0 bg-[#f6ecd2] text-[#16284a]">
              <tr><th className="p-3">Data</th><th className="p-3">Horário</th><th className="p-3">Compromisso</th><th className="p-3">Agenda</th></tr>
            </thead>
            <tbody>{events.map((event) => <tr key={event.id} className="border-t border-border/40">
              <td className="p-3 whitespace-nowrap">{event.data.split("-").reverse().join("/")}</td>
              <td className="p-3 whitespace-nowrap">{event.horario}</td>
              <td className="p-3 min-w-[200px]">{event.titulo}</td>
              <td className="p-3"><span className="inline-block h-3 w-3 rounded-[3px] mr-2 align-middle border border-black/20"
                style={{ backgroundColor: event.cor }} aria-hidden />{event.agenda}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  );
}
