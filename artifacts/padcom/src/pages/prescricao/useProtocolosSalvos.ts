import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { BASE } from "../comunicacao/_shared";
import type { Protocolo } from "./data";

// Protocolos de prescricao salvos pelo medico logado (banco, por medico).
// Fonte unica para a tela Prescricao do menu e para a do Cockpit.
const KEY = ["prescription-protocols"] as const;

async function readError(r: Response): Promise<string> {
  try {
    const j = await r.json();
    if (j && typeof j.error === "string") return j.error;
  } catch { /* corpo vazio */ }
  return `Falha ao salvar (código ${r.status}).`;
}

export function useProtocolosSalvos() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data } = useQuery<Protocolo[]>({
    queryKey: KEY,
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/prescription-protocols`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(await readError(r));
      return r.json();
    },
  });

  /** Pede o nome, salva e devolve true se gravou. */
  const salvar = async (formulaIds: string[]): Promise<boolean> => {
    if (formulaIds.length === 0) return false;
    const nome = window.prompt("Nome do protocolo:")?.trim();
    if (!nome) return false;
    const r = await fetch(`${BASE}/api/prescription-protocols`, {
      method: "POST",
      headers: collabAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ nome, formulaIds }),
    });
    if (!r.ok) {
      toast({ title: "Protocolo não salvo", description: await readError(r), variant: "destructive" });
      return false;
    }
    await qc.invalidateQueries({ queryKey: KEY });
    toast({ title: "Protocolo salvo", description: `"${nome}" está na aba Protocolos.` });
    return true;
  };

  const remover = async (id: string): Promise<void> => {
    if (!window.confirm("Remover este protocolo da sua lista?")) return;
    const r = await fetch(`${BASE}/api/prescription-protocols/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: collabAuthHeaders(),
    });
    if (!r.ok) {
      toast({ title: "Protocolo não removido", description: await readError(r), variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey: KEY });
  };

  return { salvos: data ?? [], salvar, remover };
}
