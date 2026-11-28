import { useEffect, useRef, useState } from "react";
import { Building2, ImageIcon, Save, Upload } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Clinic = { id: number; nome: string };
type Identity = { nome: string; enderecoLinha1: string; enderecoLinha2: string; versao: number };
const empty: Identity = { nome: "", enderecoLinha1: "", enderecoLinha2: "", versao: 0 };

async function responseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === "string") return payload.error;
  } catch { /* resposta indisponível */ }
  return "Não foi possível concluir a operação.";
}

export function Paxmed2bIdentidade() {
  const [clinicas, setClinicas] = useState<Clinic[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [identity, setIdentity] = useState<Identity>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingIdentity, setLoadingIdentity] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const requestNumber = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`${BASE}/api/paxmed-2b/clinicas`, { headers: collabAuthHeaders() });
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as { clinicas: Clinic[] };
        if (active) setClinicas(payload.clinicas);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar as clínicas.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const request = ++requestNumber.current;
    setIdentity(empty);
    setFile(null);
    setImage(null);
    setError("");
    setStatus("");
    if (!clinicId) return;
    let objectUrl: string | null = null;
    const isCurrent = () => requestNumber.current === request;
    async function load() {
      setLoadingIdentity(true);
      try {
        const response = await fetch(`${BASE}/api/paxmed-2b/clinicas/${clinicId}`, { headers: collabAuthHeaders() });
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as { identidade: Identity | null };
        if (!isCurrent()) return;
        setIdentity(payload.identidade ?? empty);
        if (payload.identidade) {
          const symbol = await fetch(`${BASE}/api/paxmed-2b/clinicas/${clinicId}/simbolo`, { headers: collabAuthHeaders() });
          if (!symbol.ok) throw new Error(await responseError(symbol));
          const blob = await symbol.blob();
          if (!isCurrent()) return;
          objectUrl = URL.createObjectURL(blob);
          setImage(objectUrl);
        }
      } catch (err) {
        if (isCurrent()) setError(err instanceof Error ? err.message : "Não foi possível carregar a identidade.");
      } finally { if (isCurrent()) setLoadingIdentity(false); }
    }
    void load();
    return () => {
      ++requestNumber.current;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [clinicId]);

  async function save() {
    if (!clinicId || loadingIdentity || saving) return;
    setSaving(true);
    setError("");
    setStatus("");
    const initialClinic = clinicId;
    try {
      let uploadId: string | undefined;
      if (file) {
        const response = await fetch(`${BASE}/api/paxmed-2b/clinicas/${initialClinic}/simbolo/upload`, {
          method: "POST", headers: collabAuthHeaders(),
        });
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as { uploadId: string; uploadUrl: string };
        const upload = await fetch(payload.uploadUrl, {
          method: "PUT", headers: { "Content-Type": "image/png" }, body: file,
        });
        if (!upload.ok) throw new Error("O símbolo não pôde ser enviado ao armazenamento.");
        uploadId = payload.uploadId;
      }
      const response = await fetch(`${BASE}/api/paxmed-2b/clinicas/${initialClinic}`, {
        method: "PUT",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...identity, ...(uploadId ? { uploadId } : {}) }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json() as { identidade: Identity };
      setIdentity(payload.identidade);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      const symbol = await fetch(`${BASE}/api/paxmed-2b/clinicas/${initialClinic}/simbolo`, { headers: collabAuthHeaders() });
      if (!symbol.ok) throw new Error("Identidade salva, mas não foi possível exibir o símbolo dourado.");
      const nextImage = URL.createObjectURL(await symbol.blob());
      if (image) URL.revokeObjectURL(image);
      setImage(nextImage);
      setStatus("Identidade salva para esta clínica. O documento ainda está em homologação.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a identidade.");
    } finally { setSaving(false); }
  }

  return (
    <section className="panel-3d-sub p-4 space-y-4" aria-labelledby="paxmed-2b-title">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-amber-700" aria-hidden="true" />
        <h2 id="paxmed-2b-title" className="font-bold text-sm">Identidade da clínica — Modelo 2B</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Em homologação. Esta configuração ainda não altera a emissão de documentos.
      </p>
      <label className="block space-y-1 text-xs font-semibold">
        Clínica
        <select
          className="field-engraved w-full h-10 px-3"
          value={clinicId}
          disabled={loading || saving}
          onChange={(event) => setClinicId(event.target.value)}
        >
          <option value="">{loading ? "Carregando clínicas..." : "Selecionar clínica…"}</option>
          {clinicas.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.nome}</option>)}
        </select>
      </label>
      {!loading && !error && clinicas.length === 0 && <p className="text-xs">Nenhuma clínica autorizada para este acesso.</p>}
      {clinicId && (
        <div className="space-y-3">
          <div className="concave-3d p-3 flex items-center gap-3">
            <div className="h-20 w-20 shrink-0 bg-[#0a1a30] rounded-sm flex items-center justify-center">
              {image ? <img src={image} alt="Símbolo da clínica em dourado" className="max-w-full max-h-full object-contain" /> :
                <ImageIcon className="w-7 h-7 text-white/40" aria-hidden="true" />}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="text-xs font-semibold">Símbolo em dourado</div>
              <div className="text-xs text-muted-foreground">Use imagem PNG com fundo transparente, até 2 megabytes.</div>
              <input ref={fileRef} type="file" accept="image/png" className="sr-only" aria-label="Escolher símbolo da clínica"
                disabled={saving || loadingIdentity}
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null;
                  if (chosen && (chosen.type !== "image/png" || chosen.size > 2 * 1024 * 1024)) {
                    setError("Envie uma imagem PNG de até 2 megabytes.");
                    event.target.value = "";
                    setFile(null);
                    return;
                  }
                  setError("");
                  setFile(chosen);
                }} />
              <Button type="button" size="sm" className="btn-3d-soft" disabled={saving || loadingIdentity}
                onClick={() => fileRef.current?.click()}>
                <Upload className="w-3 h-3 mr-2" /> Escolher símbolo
              </Button>
              <div className="text-xs break-words">{file ? `Novo arquivo: ${file.name}` : "Nenhum arquivo novo selecionado."}</div>
            </div>
          </div>
          <label className="block space-y-1 text-xs font-semibold">
            Nome da clínica
            <Input value={identity.nome} maxLength={80} disabled={saving || loadingIdentity}
              onChange={(event) => setIdentity((prev) => ({ ...prev, nome: event.target.value }))} />
          </label>
          <label className="block space-y-1 text-xs font-semibold">
            Endereço — primeira linha
            <Input value={identity.enderecoLinha1} maxLength={80} disabled={saving || loadingIdentity}
              onChange={(event) => setIdentity((prev) => ({ ...prev, enderecoLinha1: event.target.value }))} />
          </label>
          <label className="block space-y-1 text-xs font-semibold">
            Endereço — segunda linha
            <Input value={identity.enderecoLinha2} maxLength={80} disabled={saving || loadingIdentity}
              onChange={(event) => setIdentity((prev) => ({ ...prev, enderecoLinha2: event.target.value }))} />
          </label>
          <Button type="button" className="btn-3d" onClick={() => void save()}
            disabled={saving || loadingIdentity || !identity.nome.trim() || !identity.enderecoLinha1.trim() ||
              !identity.enderecoLinha2.trim() || (!identity.versao && !file)}>
            <Save className="w-4 h-4 mr-2" /> {saving ? "Salvando..." : "Salvar identidade do Modelo 2B"}
          </Button>
        </div>
      )}
      {status && <p role="status" className="text-xs text-green-700">{status}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </section>
  );
}
