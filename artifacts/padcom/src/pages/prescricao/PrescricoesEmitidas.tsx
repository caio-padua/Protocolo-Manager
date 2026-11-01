import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import { BASE } from "../comunicacao/_shared";
import ClinicalHistoryToggle from "@/components/ClinicalHistoryToggle";
import ClinicalDocumentResendForm from "@/components/ClinicalDocumentResendForm";
import { getCollabToken } from "@/lib/collab-auth";

type Prescricao = { id: number; clientId: number | null; clientName: string; status: string; createdAt: string };
type RecipeFile = { id: number; title: string; recipeType: string };

function authHeaders() {
  const token = getCollabToken();
  if (!token) throw new Error("Faça login de colaborador.");
  return { Authorization: `Bearer ${token}` };
}
async function request(path: string, body?: unknown) {
  const response = await fetch(`${BASE}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Falha na solicitação (HTTP ${response.status}).`);
  if (!data) throw new Error("O servidor não confirmou o resultado.");
  return data;
}

function PrescriptionHistoryRow({ p, clientId }: { p: Prescricao; clientId: number | null }) {
  const [open, setOpen] = useState(false);
  const files = useQuery<{ recipes: RecipeFile[] }>({
    queryKey: ["prescription-issued-files", p.id],
    queryFn: () => request(`/prescriptions/${p.id}`),
    enabled: open,
    retry: false,
  });
  return <div className="panel-3d-sub p-3 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-sm font-medium">{p.clientName} — Prescrição #{p.id}</p>
        <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString("pt-BR")}</p>
      </div>
      <button type="button" className="btn-3d-soft px-3 py-2 text-xs" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Fechar documentos" : "Abrir documentos"}
      </button>
    </div>
    {open && <>
      <div className="concave-3d space-y-2 p-3">
        <h3 className="font-medium">PDFs emitidos — abrir, baixar ou reenviar individualmente</h3>
        {files.isPending && <p role="status">Carregando arquivos…</p>}
        {files.error && <p role="alert" className="text-sm text-destructive">{files.error.message}</p>}
        {files.data?.recipes.map(recipe => <div key={recipe.id} className="space-y-3 border-t border-current/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">{recipe.title}</span>
            <span className="flex gap-2">
              <PrescriptionPdfLink href={`${BASE}/api/clinical-documents/prescricao/${recipe.id}/pdf`} className="btn-3d-soft inline-flex items-center gap-1 px-3 py-2 text-xs">
                <Eye className="h-3.5 w-3.5" /> Abrir
              </PrescriptionPdfLink>
              <PrescriptionPdfLink href={`${BASE}/api/clinical-documents/prescricao/${recipe.id}/pdf?download=1`} download fileName={`prescricao-${recipe.id}.pdf`}
                className="btn-3d-soft inline-flex items-center gap-1 px-3 py-2 text-xs">
                <Download className="h-3.5 w-3.5" /> Baixar
              </PrescriptionPdfLink>
            </span>
          </div>
          {clientId && <ClinicalDocumentResendForm clientId={clientId} documentType="prescricao" documentId={recipe.id} />}
        </div>)}
        {!files.isPending && !files.error && !files.data?.recipes.length && <p className="text-sm">Nenhum PDF encontrado nesta prescrição.</p>}
      </div>
    </>}
  </div>;
}

export function PrescricoesEmitidas({ clientId, emissionId }: { clientId: number | null; emissionId?: number }) {
  const [open, setOpen] = useState(false);
  const { data, isPending, error, refetch } = useQuery<Prescricao[]>({
    queryKey: ["prescricoes-emitidas", clientId, emissionId], queryFn: () => request("/prescriptions"),
    enabled: open, staleTime: 0, refetchInterval: open ? 30000 : false,
  });
  const rows = data?.filter(p => p.status === "emitted" && (clientId == null || p.clientId === clientId)) ?? [];
  return <section className="no-print panel-3d p-4 space-y-3" aria-label="Prescrições emitidas">
    <ClinicalHistoryToggle label="Histórico de prescrições emitidas" open={open} onOpenChange={setOpen} />
    {open && <>
    <p className="text-sm text-muted-foreground">Emitir não envia mensagens. Abra cada registro para visualizar ou baixar os PDFs, e confirme o destinatário antes de reenviar.</p>
    {isPending && <p role="status">Carregando prescrições…</p>}
    {error && <div role="alert" className="text-sm text-destructive">
      Não foi possível carregar o histórico: {error.message}
      <button type="button" className="btn-3d-soft ml-2 px-3 py-1" onClick={() => refetch()}>Tentar novamente</button>
    </div>}
    {!isPending && !error && !rows.length && <p className="text-sm text-muted-foreground">Nenhuma prescrição emitida encontrada.</p>}
    <div className="space-y-2 max-h-[32rem] overflow-y-auto">
      {rows.map(p => <PrescriptionHistoryRow key={`${clientId}:${p.id}`} p={p} clientId={clientId} />)}
    </div>
    </>}
  </section>;
}

/** Bearer-protected PDFs cannot be opened through an unauthenticated anchor. */
export function PrescriptionPdfLink({ href, className, children, download = false, fileName = "prescricao.pdf" }: {
  href: string; className?: string; children: ReactNode; download?: boolean; fileName?: string;
}) {
  const [error, setError] = useState("");
  async function open() {
    const tab = download ? null : window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setError("");
    try {
      const response = await fetch(href, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível abrir o PDF autorizado.");
      const url = URL.createObjectURL(await response.blob());
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else if (tab) tab.location.href = url;
      else { URL.revokeObjectURL(url); throw new Error("Permita abrir uma nova aba para visualizar a receita."); }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      tab?.close(); setError((err as Error).message);
    }
  }
  return <><button type="button" className={className} onClick={open}>{children}</button>
    {error && <span role="alert" className="text-sm text-destructive">{error}</span>}</>;
}
