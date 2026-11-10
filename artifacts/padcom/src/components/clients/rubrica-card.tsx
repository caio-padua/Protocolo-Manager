import { useEffect, useRef, useState } from "react";
import { Loader2, PenLine, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCollabToken } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAX_BYTES = 2 * 1024 * 1024;

interface RubricaCardProps {
  /** Número do cliente. Sem número (cadastro novo), o cartão aparece desabilitado. */
  clientId?: number | null;
}

function authHeaders(): Record<string, string> {
  const token = getCollabToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Rubrica do cliente (imagem). A imagem fica em armazenamento privado: não existe endereço público,
 * por isso a pré-visualização é buscada com o login do profissional e mostrada a partir de um blob local.
 * Sem rubrica enviada, o RAS FAP mostra as iniciais do nome do cliente.
 */
export function ClientRubricaCard({ clientId }: RubricaCardProps) {
  const ready = Number.isInteger(clientId) && (clientId as number) > 0;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(ready);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  async function carregar(): Promise<string | null> {
    const res = await fetch(`${BASE}/api/clients/${clientId}/rubrica`, { headers: authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`rubrica ${res.status}`);
    return URL.createObjectURL(await res.blob());
  }

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let url: string | null = null;
    setLoading(true);
    setLoadError(false);
    carregar()
      .then((u) => {
        url = u;
        if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
        setPreview(u);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function enviar(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Use uma imagem PNG ou JPEG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Imagem acima de 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/clients/${clientId}/rubrica`, { method: "POST", headers: authHeaders(), body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Falha ao enviar a rubrica.");
        return;
      }
      const novo = await carregar();
      setPreview((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior);
        return novo;
      });
      setLoadError(false);
      toast.success("Rubrica do cliente salva.");
    } catch {
      toast.error("Erro ao enviar a rubrica.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="panel-3d-sub p-5 space-y-5 relative overflow-visible">
      <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
        <PenLine className="h-3 w-3 text-primary" /> Rubrica do Cliente
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
        <div className="concave-3d rounded-[10px] p-1.5 shrink-0">
          <div className="w-40 h-20 rounded-[6px] overflow-hidden bg-white flex items-center justify-center">
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" />
            ) : preview ? (
              <img src={preview} alt="Rubrica do cliente" className="max-h-full max-w-full object-contain" />
            ) : (
              <PenLine className="w-8 h-8 text-muted-foreground/40" />
            )}
          </div>
        </div>

        <div className="flex-1 w-full space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {!ready
              ? "Salve o cadastro para enviar a rubrica do cliente."
              : loadError
                ? "Não foi possível carregar a rubrica agora. Tente abrir o cadastro de novo."
                : preview
                  ? "Esta imagem aparece no RAS FAP quando o cliente confirma a aplicação."
                  : "Sem rubrica enviada, o RAS FAP mostra as iniciais do nome do cliente."}
            {" "}Tinta escura em fundo claro, PNG ou JPEG, até 2 MB.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }}
          />
          <Button
            type="button"
            className="btn-3d"
            disabled={!ready || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> ENVIANDO...</>
              : <><UploadCloud className="mr-2 h-4 w-4" /> {preview ? "TROCAR RUBRICA" : "ENVIAR RUBRICA"}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
