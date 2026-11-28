/**
 * Lista os documentos JÁ EMITIDOS de um cliente (por tipo) e põe o Painel de Encaminhamento em cada um.
 * É a forma de instalar o painel em uma ferramenta do cockpit que ainda não tinha lista própria.
 */
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";
import PainelEncaminhamento, { type TipoDocumento } from "./PainelEncaminhamento";

const API = import.meta.env.BASE_URL + "api";

type Emitido = { documentType: TipoDocumento; documentId: number; label: string; issuedAt: string; pasta: string };

const NOME_TIPO: Record<TipoDocumento, string> = {
  prescricao: "Receita", pedido_exames: "Pedido de exames", atestado: "Atestado", encaminhamento: "Encaminhamento",
  protocolo: "Protocolo", ras_fap: "RAS FAP", carta_tratamento: "Carta de tratamento", documento_assinado: "Documento assinado",
};

function dataBr(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

export default function EmitidosEncaminhar({ clientId, tipos, titulo }: { clientId: number; tipos: TipoDocumento[]; titulo: string }) {
  const [itens, setItens] = useState<Emitido[] | null>(null);
  const [erro, setErro] = useState("");
  const chave = tipos.join(",");

  useEffect(() => {
    const token = getCollabToken();
    if (!token) { setErro("Faça login de colaborador para listar os documentos."); setItens([]); return; }
    const ac = new AbortController();
    setItens(null); setErro("");
    fetch(`${API}/clinical-documents/issued/${clientId}?tipos=${chave}`, { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || "Não foi possível listar os documentos emitidos.");
        if (!ac.signal.aborted) setItens(Array.isArray(d?.documents) ? d.documents : []);
      })
      .catch((e: unknown) => { if (!ac.signal.aborted) { setErro(e instanceof Error ? e.message : "Falha ao listar os documentos."); setItens([]); } });
    return () => ac.abort();
  }, [clientId, chave]);

  return (
    <section className="panel-3d p-4 space-y-3" aria-label={titulo}>
      <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest">
        <FileText className="h-3.5 w-3.5" />{titulo}
      </div>
      {itens === null && <p role="status" className="text-sm">Consultando documentos emitidos…</p>}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {itens && !erro && !itens.length && <p className="text-sm text-muted-foreground">Nenhum documento emitido deste tipo para este cliente.</p>}
      {itens?.map((d) => (
        <article key={`${d.documentType}-${d.documentId}`} className="space-y-2 border-t border-current/10 pt-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{NOME_TIPO[d.documentType]} · emitido em {dataBr(d.issuedAt)}</div>
              <div className="text-sm font-bold break-words">{d.label}</div>
            </div>
            <span className="concave-3d px-2 py-1 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Pasta {d.pasta}</span>
          </div>
          <PainelEncaminhamento clientId={clientId} documentType={d.documentType} documentId={d.documentId} />
        </article>
      ))}
    </section>
  );
}
