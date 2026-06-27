import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, CheckCircle, Loader2, AlertCircle, Upload } from "lucide-react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { PAXTER_SITE_URL } from "@/lib/brand";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getToken(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

export default function Foto() {
  const [token] = useState(getToken);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState("");
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/client-photo/info?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          setInvalid(true);
          return;
        }
        const data = await res.json();
        setClientName(data.name || "");
        setCurrentPhoto(data.photoUrl || null);
      } catch {
        setInvalid(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem (foto).");
      return;
    }
    setError("");
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("token", token);
      const res = await fetch(`${API_BASE}/api/client-photo/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Não foi possível enviar a foto.");
        return;
      }
      setDone(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }, [selectedFile, token]);

  return (
    <div className="min-h-screen bg-[#0d1830] flex flex-col">
      <header className="bg-[#0b1426] border-b border-[#223358] px-4 py-4 flex items-center justify-center">
        <a
          href={PAXTER_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="PAXTER — site institucional"
          className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70 transition-opacity hover:opacity-90"
        >
          <PaxterSymbolGlass size={26} tone="dark" />
          <div>
            <h1 className="text-white font-bold text-lg tracking-[0.16em] uppercase">PAXTER</h1>
            <p className="text-[#7e93b8] text-xs uppercase tracking-widest">FOTO DO CLIENTE</p>
          </div>
        </a>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-md">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-[#7e93b8]">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Carregando...</p>
            </div>
          )}

          {!loading && invalid && (
            <div className="bg-[#11203c] border border-[#223358] rounded-md p-6 text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <h2 className="text-white font-semibold text-sm uppercase tracking-wide mb-1">
                LINK INVÁLIDO OU EXPIRADO
              </h2>
              <p className="text-[#7e93b8] text-xs">
                Solicite um novo link à clínica para enviar sua foto.
              </p>
            </div>
          )}

          {!loading && !invalid && done && (
            <div className="bg-[#11203c] border border-[#223358] rounded-md p-6 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-white font-semibold text-base uppercase tracking-wide mb-1">
                FOTO ENVIADA!
              </h2>
              <p className="text-[#7e93b8] text-sm">
                Obrigado{clientName ? `, ${clientName.split(" ")[0]}` : ""}. Sua foto foi
                recebida pela clínica.
              </p>
            </div>
          )}

          {!loading && !invalid && !done && (
            <div className="bg-[#11203c] border border-[#223358] rounded-md overflow-hidden">
              <div className="bg-[#0b1426] px-5 py-4 border-b border-[#223358]">
                <div className="flex items-center gap-3">
                  <Camera className="w-5 h-5 text-[#c2a05a]" />
                  <h2 className="text-white font-semibold text-sm uppercase tracking-wide">
                    ENVIAR SUA FOTO
                  </h2>
                </div>
                {clientName && (
                  <p className="text-[#7e93b8] text-xs mt-1">
                    Olá, <span className="text-white font-semibold">{clientName}</span>
                  </p>
                )}
              </div>

              <div className="p-5 space-y-4">
                <div className="flex justify-center">
                  <div className="w-36 h-36 rounded-full overflow-hidden bg-[#0b1426] border border-[#223358] flex items-center justify-center">
                    {preview ? (
                      <img src={preview} alt="Pré-visualização" className="w-full h-full object-cover" />
                    ) : currentPhoto ? (
                      <img src={currentPhoto} alt="Foto atual" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-12 h-12 text-[#5a6f96]" />
                    )}
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={onPickFile}
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-12 bg-[#0b1426] border border-[#223358] hover:border-[#c2a05a]/60 text-white font-semibold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 transition-colors"
                >
                  <Camera className="w-4 h-4 text-[#c2a05a]" />
                  {selectedFile ? "ESCOLHER OUTRA FOTO" : "TIRAR / ESCOLHER FOTO"}
                </button>

                {error && (
                  <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-red-300 text-sm">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="w-full h-12 bg-[#c2a05a] hover:bg-[#b8924d] text-[#0b1426] font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      ENVIAR FOTO
                    </>
                  )}
                </button>

                <p className="text-[#5a6f96] text-[11px] text-center">
                  Use uma foto do rosto, bem iluminada, sem óculos escuros.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
