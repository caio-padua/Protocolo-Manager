import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";
import { BASE } from "../../comunicacao/_shared";
import { Checkbox } from "@/components/ui/checkbox";
import type { ClinicalDemonstrationInput } from "@workspace/api-client-react";

type DocumentItem = { id: string; kind: "prescricao" | "exames"; createdAt: string };

export default function ClinicalDemonstrationPanel({
  clientId, kind, payload, canCreate,
}: {
  clientId: number;
  kind: "prescricao" | "exames";
  payload: ClinicalDemonstrationInput;
  canCreate: boolean;
}) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modelo2b, setModelo2b] = useState(import.meta.env.DEV);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(`${clientId}:${kind}`);
  useEffect(() => {
    current.current = `${clientId}:${kind}`;
    return () => { current.current = ""; };
  }, [clientId, kind]);
  const headers = () => ({ Authorization: `Bearer ${getCollabToken() ?? ""}` });

  const loadDocuments = useCallback(async () => {
    const context = `${clientId}:${kind}`;
    setLoading(true);
    try {
      const response = await fetch(`${BASE}/api/clinical-demonstrations/${clientId}?kind=${kind}`, {
        headers: headers(), cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível consultar os documentos de teste.");
      const result = await response.json();
      if (current.current === context) setDocuments(Array.isArray(result) ? result : []);
    } catch (err) {
      if (current.current === context) setError((err as Error).message);
    } finally {
      if (current.current === context) setLoading(false);
    }
  }, [clientId, kind]);

  useEffect(() => {
    setDocuments([]);
    setError(null);
    setModelo2b(import.meta.env.DEV);
    void loadDocuments();
  }, [clientId, kind, loadDocuments]);

  async function generate() {
    if (!canCreate || creating) return;
    const context = `${clientId}:${kind}`;
    setCreating(true);
    setError(null);
    try {
      const query = modelo2b ? "?modelo=paxmed-2b" : "";
      const response = await fetch(`${BASE}/api/clinical-demonstrations/${clientId}${query}`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(typeof result.error === "string" ? result.error : "Não foi possível gerar o documento.");
      }
      if (current.current === context) await loadDocuments();
    } catch (err) {
      if (current.current === context) {
        setError(`${(err as Error).message} Confira a lista antes de tentar novamente.`);
        void loadDocuments();
      }
    } finally {
      if (current.current === context) setCreating(false);
    }
  }

  async function openDocument(id: string) {
    const context = `${clientId}:${kind}`;
    const tab = window.open("", "_blank");
    if (!tab) { setError("Permita a abertura de uma nova aba para visualizar o documento."); return; }
    try {
      const response = await fetch(`${BASE}/api/clinical-demonstrations/${clientId}/${encodeURIComponent(id)}`, {
        headers: headers(), cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível abrir o documento. Confira sua sessão e a permissão de acesso.");
      const blob = await response.blob();
      if (current.current !== context) { tab.close(); return; }
      const url = URL.createObjectURL(blob);
      tab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
    } catch (err) {
      tab.close();
      if (current.current === context) setError((err as Error).message);
    }
  }

  return (
    <section className="panel-3d-sub space-y-3 p-3" aria-label="Documentos de teste">
      <div>
        <h3 className="text-sm font-semibold">Documentos de teste</h3>
        <p className="text-xs text-muted-foreground">
          Sem validade clínica. Não envia mensagens, não altera lembretes e não integra o histórico clínico.
        </p>
        <p className="text-xs text-muted-foreground">A assinatura usa o certificado do médico autenticado.</p>
      </div>
      {import.meta.env.DEV && (
        <label className="concave-3d flex items-start gap-3 p-3 text-sm">
          <Checkbox checked={modelo2b} onCheckedChange={(checked) => setModelo2b(checked === true)} disabled={creating} />
          <span>
            <span className="block font-semibold">Usar Modelo 2B em teste</span>
            <span className="block text-xs text-muted-foreground">
              Exige a identidade da empresa cadastrada e validada. Não altera a emissão oficial.
            </span>
          </span>
        </label>
      )}
      <button type="button" onClick={() => void generate()} disabled={!canCreate || creating}
        className="btn-3d-soft inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold disabled:opacity-50">
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {creating ? "Gerando documento de teste…" : "Gerar documento de teste"}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading && <p className="text-xs text-muted-foreground">Consultando documentos de teste…</p>}
      {!loading && documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map(doc => (
            <li key={doc.id} className="concave-3d flex items-center justify-between gap-3 p-2 text-sm">
              <span>Teste · {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
              }).format(new Date(doc.createdAt))}</span>
              <button type="button" className="btn-3d-soft min-h-10 px-3" onClick={() => void openDocument(doc.id)}>
                Abrir teste
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
