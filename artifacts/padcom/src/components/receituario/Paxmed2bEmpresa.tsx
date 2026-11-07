import { useEffect, useRef, useState } from "react";
import { Eye, ImageIcon, Save, Upload } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PreviaIdentidadeEmpresa, prepararSimboloLocal } from "./PreviaIdentidadeEmpresa";

type Identity = {
  nomeCabecalho: string;
  rodapeLinha1: string;
  rodapeLinha2: string;
  rodapeLinha3: string;
  simboloExemplo?: boolean;
  dadosExemplo?: boolean;
  versao: number;
};
const empty: Identity = { nomeCabecalho: "", rodapeLinha1: "", rodapeLinha2: "", rodapeLinha3: "", versao: 0 };
const base = import.meta.env.VITE_API_URL || "/api";

async function errorMessage(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.error === "string" ? payload.error : "Não foi possível concluir a operação.";
}

export function Paxmed2bEmpresa({ empresaId, onDirtyChange }: { empresaId: number; onDirtyChange?: (dirty: boolean) => void }) {
  const [identity, setIdentity] = useState<Identity>(empty);
  const [etapa, setEtapa] = useState<"simbolo" | "rodape" | "previa">("simbolo");
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [refresh, setRefresh] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRequest = useRef(0);
  const savedIdentity = useRef<Identity>(empty);
  const endpoint = `${base}/paxmed-2b/empresas/${empresaId}`;
  const headers = () => collabAuthHeaders({ "x-empresa-id": String(empresaId) });

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setIdentity(empty);
    setImage(null);
    setFile(null);
    setLocalImage(null);
    setPreparing(false);
    imageRequest.current++;
    setLoading(true);
    setLoadFailed(false);
    setError("");
    async function load() {
      try {
        const response = await fetch(endpoint, { headers: headers() });
        if (!response.ok) throw new Error(await errorMessage(response));
        const payload = await response.json() as { identidade: Identity | null };
        if (!active) return;
        savedIdentity.current = payload.identidade ?? empty;
        setIdentity(payload.identidade ?? empty);
        if (payload.identidade) {
          const logo = await fetch(`${endpoint}/simbolo`, { headers: headers() });
          if (!logo.ok) throw new Error(await errorMessage(logo));
          const blob = await logo.blob();
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setImage(objectUrl);
        }
      } catch (err) {
        if (active) {
          setLoadFailed(true);
          setError(err instanceof Error ? err.message : "Não foi possível carregar a identidade.");
        }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [empresaId, refresh]);

  const dirty = Boolean(file) || ["nomeCabecalho", "rodapeLinha1", "rodapeLinha2", "rodapeLinha3"].some(
    (key) => identity[key as keyof Identity] !== savedIdentity.current[key as keyof Identity]
  );
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  async function save() {
    if (saving || loading || loadFailed || preparing) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      let uploadId: string | undefined;
      if (file) {
        const response = await fetch(`${endpoint}/simbolo/upload`, { method: "POST", headers: headers() });
        if (!response.ok) throw new Error(await errorMessage(response));
        const data = await response.json() as { uploadId: string; uploadUrl: string };
        const upload = await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: file });
        if (!upload.ok) throw new Error("Não foi possível enviar o símbolo.");
        uploadId = data.uploadId;
      }
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: collabAuthHeaders({ "Content-Type": "application/json", "x-empresa-id": String(empresaId) }),
        body: JSON.stringify({
          nomeCabecalho: identity.nomeCabecalho, rodapeLinha1: identity.rodapeLinha1,
          rodapeLinha2: identity.rodapeLinha2, rodapeLinha3: identity.rodapeLinha3,
          versao: identity.versao, ...(uploadId ? { uploadId } : {}),
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json() as { identidade: Identity };
      savedIdentity.current = result.identidade;
      setIdentity(result.identidade);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setStatus("Identidade salva. A emissão clínica ainda não usa este modelo de teste.");
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a identidade.");
    } finally { setSaving(false); }
  }

  async function openPreview() {
    const tab = window.open("", "_blank");
    if (!tab) { setError("Permita a abertura de uma nova aba para visualizar a prova."); return; }
    try {
      const response = await fetch(`${endpoint}/pre-visualizacao`, { headers: headers() });
      if (!response.ok) throw new Error(await errorMessage(response));
      const url = URL.createObjectURL(await response.blob());
      tab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (err) {
      tab.close();
      setError(err instanceof Error ? err.message : "Não foi possível abrir a prova.");
    }
  }

  const fields: Array<["nomeCabecalho" | "rodapeLinha1" | "rodapeLinha2" | "rodapeLinha3", string]> = [
    ["nomeCabecalho", "Nome no cabeçalho"],
    ["rodapeLinha1", "Rodapé — primeira linha"],
    ["rodapeLinha2", "Rodapé — segunda linha"],
    ["rodapeLinha3", "Rodapé — terceira linha"],
  ];

  return (
    <section className="panel-3d-sub p-3 sm:p-4 space-y-3" aria-labelledby="identidade-empresa-title"
      onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
      <div>
        <h2 id="identidade-empresa-title" className="font-bold text-sm">Identidade nos documentos — Modelo 2B</h2>
        <p className="text-xs text-muted-foreground mt-1">Uma identidade compartilhada pelos locais desta empresa.</p>
      </div>
      <p className="concave-3d p-2 text-xs text-muted-foreground">
        Configuração em teste. Ainda não altera os documentos clínicos reais. Apenas o proprietário autorizado pode configurá-la nesta fase.
      </p>
      {loading && <p role="status" className="text-xs">Carregando identidade...</p>}
      {status && <p role="status" className="text-xs text-green-700">{status}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {identity.simboloExemplo && !file && (
        <p role="note" className="concave-3d p-3 text-xs text-amber-800">Símbolo demonstrativo, não oficial. Substitua pela marca da empresa.</p>
      )}
      {identity.dadosExemplo && <p role="note" className="concave-3d p-3 text-xs text-amber-800">Há informações fictícias nesta identidade. Confira antes de utilizar.</p>}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Etapas da identidade">
        {([["simbolo", "Símbolo e nome"], ["rodape", "Linhas do rodapé"], ["previa", "Prévia"]] as const).map(([value, label]) => (
          <button type="button" key={value} onClick={() => setEtapa(value)} aria-pressed={etapa === value}
            className="bevel-3d empresa-aba px-2 py-2 text-xs font-semibold">{label}</button>
        ))}
      </div>
      <div hidden={etapa !== "simbolo"} className="space-y-3">
      <div className="concave-3d p-3 flex gap-3 items-center">
        <div className="h-20 w-20 shrink-0 bg-[#0a1a30] rounded-sm flex items-center justify-center">
          {localImage ? <div role="img" aria-label="Prévia dourada do símbolo escolhido" className="w-16 h-16"
            style={{ background: "linear-gradient(#976017,#f1d690,#c8831b,#f0be53,#976017)", maskImage: `url(${localImage})`, maskSize: "contain", maskPosition: "center", maskRepeat: "no-repeat" }} /> :
            image ? <img src={image} alt="Símbolo da empresa em dourado" className="max-w-full max-h-full object-contain" /> :
            <ImageIcon className="w-7 h-7 text-white/40" aria-hidden="true" />}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold">Símbolo da empresa</p>
          <p className="text-xs text-muted-foreground">Imagem PNG (formato de imagem) com fundo transparente, até 2 megabytes. A cor será convertida para dourado.</p>
          <input ref={fileRef} type="file" accept="image/png" className="sr-only" aria-label="Escolher símbolo da empresa"
            disabled={saving || loading || loadFailed} onChange={async (event) => {
              const selected = event.target.files?.[0] ?? null;
              const input = event.currentTarget;
              const request = ++imageRequest.current;
              setLocalImage(null);
              setPreparing(false);
              if (selected && (selected.type !== "image/png" || selected.size > 2 * 1024 * 1024)) {
                setError("Envie uma imagem PNG com até 2 megabytes.");
                input.value = "";
                setFile(null);
                return;
              }
              setError("");
              setFile(null);
              if (!selected) return;
              setPreparing(true);
              try {
                const preview = await prepararSimboloLocal(selected);
                if (request !== imageRequest.current) return;
                setLocalImage(preview);
                setFile(selected);
              } catch (err) {
                if (request !== imageRequest.current) return;
                input.value = "";
                setError(err instanceof Error ? err.message : "Não foi possível ler o símbolo.");
              } finally {
                if (request === imageRequest.current) setPreparing(false);
              }
            }} />
          <Button type="button" size="sm" className="btn-3d-soft" disabled={saving || loading || loadFailed}
            onClick={() => fileRef.current?.click()}><Upload className="w-3 h-3 mr-2" />Escolher símbolo</Button>
          <p className="text-xs break-words">{file ? `Selecionado: ${file.name}` : "O símbolo escolhido aparece antes de salvar."}</p>
          {preparing && <p role="status" className="text-xs">Preparando símbolo...</p>}
        </div>
      </div>
      {fields.slice(0, 1).map(([key, label]) => (
        <label key={key} className="block space-y-1 text-xs font-semibold">
          <span>{label}</span>
          <Input value={identity[key]} maxLength={80} disabled={loading || loadFailed || saving}
            onChange={(event) => setIdentity((previous) => ({ ...previous, [key]: event.target.value }))} />
          <span className="block text-[10px] text-muted-foreground">{Array.from(identity[key]).length}/80 caracteres; a largura também é conferida ao salvar.</span>
        </label>
      ))}
      </div>
      <div hidden={etapa !== "rodape"} className="space-y-3">
      {fields.slice(1).map(([key, label]) => (
        <label key={key} className="block space-y-1 text-xs font-semibold">
          <span>{label}</span>
          <Input value={identity[key]} maxLength={80} disabled={loading || loadFailed || saving}
            onChange={(event) => setIdentity((previous) => ({ ...previous, [key]: event.target.value }))} />
          <span className="block text-[10px] text-muted-foreground">{Array.from(identity[key]).length}/80 caracteres; a largura também é conferida ao salvar.</span>
        </label>
      ))}
      </div>
      <div hidden={etapa !== "previa"}>
      <PreviaIdentidadeEmpresa {...identity} simbolo={localImage ?? image} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="btn-3d" onClick={() => void save()} disabled={loading || loadFailed || saving || preparing ||
          fields.some(([key]) => !identity[key].trim()) || (!identity.versao && !file)}>
          <Save className="w-4 h-4 mr-2" />{saving ? "Salvando..." : "Salvar identidade"}
        </Button>
        <Button type="button" className="btn-3d-soft" disabled={saving} onClick={() => {
          if (dirty && !window.confirm("Recarregar descartará as alterações não salvas da identidade. Continuar?")) return;
          setStatus(""); setRefresh((value) => value + 1);
        }}>
          Recarregar identidade
        </Button>
        <Button type="button" className="btn-3d-soft" disabled={!identity.versao || loading || loadFailed || saving} onClick={() => void openPreview()}>
          <Eye className="w-4 h-4 mr-2" />Abrir prévia salva
        </Button>
      </div>
    </section>
  );
}
