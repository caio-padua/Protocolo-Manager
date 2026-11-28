/** Propostas internas pendentes de revisão clínica. Somente leitura: não são orientação e nunca são enviadas. */
import { useEffect, useState } from "react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { ShieldAlert } from "lucide-react";
import { BASE, BlockTitle } from "./_shared";

type Proposta = { id: string; titulo: string; descricao: string; riscos: string; fontes: string };

export function PropostasInternas() {
  const [lista, setLista] = useState<Proposta[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch(`${BASE}/api/duvidas-orientacoes/propostas-internas`, { headers: new Headers(collabAuthHeaders()) })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Falha (${r.status}).`); return r.json(); })
      .then((d) => setLista(d.propostas))
      .catch((e: Error) => setErro(e.message));
  }, []);
  if (erro) return <p className="text-[12px] text-red-700" role="alert">Propostas internas: {erro}</p>;
  if (!lista || lista.length === 0) return null;
  return (
    <section data-testid="propostas-internas" className="mt-6">
      <BlockTitle icon={ShieldAlert}>Propostas internas pendentes de revisão</BlockTitle>
      <p className="mb-2 text-[12px] text-muted-foreground">Só para a equipe clínica. Não são orientação de rotina, não são usadas pela assistente e não podem ser enviadas ao cliente.</p>
      <ul className="space-y-2">
        {lista.map((p) => (
          <li key={p.id} className="rounded-md border border-amber-400/60 p-3 text-[13px]">
            <p className="font-semibold">{p.titulo} <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-900">pendente de revisão</span></p>
            <p className="mt-1 whitespace-pre-wrap">{p.descricao}</p>
            {p.riscos && <p className="mt-1 whitespace-pre-wrap"><b>Riscos a avaliar:</b> {p.riscos}</p>}
            {p.fontes && <p className="mt-1 whitespace-pre-wrap"><b>Fontes:</b> {p.fontes}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
