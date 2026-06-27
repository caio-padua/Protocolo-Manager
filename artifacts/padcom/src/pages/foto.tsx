import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, CheckCircle, Loader2, AlertCircle, Upload, Image as ImageIcon, X } from "lucide-react";
import { PaxterLockup } from "@/components/layout/paxter-fx/PaxterLockup";
import { PAXTER_SITE_URL } from "@/lib/brand";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Mensagem curta de fallback quando a câmera ao vivo não abre (navegador in-app, permissão
// negada ou sem getUserMedia): orienta abrir no Safari/Chrome e usar a galeria.
const CAMERA_FALLBACK_MSG =
  "Não foi possível abrir a câmera neste navegador. No iPhone, abra o link no Safari; no Android, no Chrome. Você ainda pode enviar pela galeria abaixo.";

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

  // Câmera ao vivo (getUserMedia → canvas → File). Fallback automático para o seletor de
  // arquivos quando o navegador não permite (in-app browser, permissão negada, Safari antigo).
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const [cameraNote, setCameraNote] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const ok = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    setCameraSupported(ok);
    if (!ok) setCameraNote(CAMERA_FALLBACK_MSG);
  }, []);

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

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      setCameraNote(CAMERA_FALLBACK_MSG);
      fileInputRef.current?.click();
      return;
    }
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraNote("");
      setCameraActive(true);
      // O <video> só existe no DOM depois de cameraActive virar true.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      // Permissão negada ou navegador in-app: cai para o seletor de arquivos (que no
      // celular também abre a câmera pelo accept="image/*").
      setCameraSupported(false);
      setCameraNote(CAMERA_FALLBACK_MSG);
      fileInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Não foi possível capturar a foto. Tente novamente.");
          return;
        }
        const file = new File([blob], "foto.jpg", { type: "image/jpeg" });
        setSelectedFile(file);
        setPreview(URL.createObjectURL(file));
        stopCamera();
      },
      "image/jpeg",
      0.92,
    );
  }, [stopCamera]);

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
    <div className="dark min-h-screen bg-[#0d1830] flex flex-col">
      <header className="bg-[#0b1426] border-b border-[rgba(184,146,77,0.22)] px-4 py-5 flex flex-col items-center justify-center gap-1">
        <PaxterLockup tone="dark" orientation="vertical" showTagline href={PAXTER_SITE_URL} symbolPx={48} wordWidth={180} />
        <p className="text-[#7e93b8] text-[11px] uppercase tracking-[0.28em] mt-1">Foto do Cliente</p>
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
            <div className="panel-3d p-6 text-center">
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
            <div className="panel-3d p-6 text-center">
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
            <div className="panel-3d overflow-hidden">
              <div className="bg-[#0b1426] px-5 py-4 border-b border-[rgba(184,146,77,0.22)]">
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
                {/* Preview SEMPRE enquadrado (radius 6px) — nunca círculo. */}
                <div className="flex justify-center">
                  <div className="concave-3d w-44 h-44 rounded-[6px] overflow-hidden flex items-center justify-center relative">
                    {cameraActive ? (
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="w-full h-full object-cover"
                      />
                    ) : preview ? (
                      <img src={preview} alt="Pré-visualização" className="w-full h-full object-cover" />
                    ) : currentPhoto ? (
                      <img src={currentPhoto} alt="Foto atual" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-12 h-12 text-[#5a6f96]" />
                    )}
                  </div>
                </div>
                <canvas ref={canvasRef} className="hidden" />

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickFile}
                />

                {cameraActive ? (
                  <div className="flex gap-2">
                    <button
                      onClick={capturePhoto}
                      className="btn-3d flex-1 h-12 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      TIRAR FOTO
                    </button>
                    <button
                      onClick={stopCamera}
                      aria-label="Cancelar câmera"
                      className="bevel-3d h-12 px-4 flex items-center justify-center text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {cameraSupported && (
                      <button
                        onClick={startCamera}
                        disabled={cameraStarting}
                        className="bevel-3d w-full h-12 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 text-white disabled:opacity-50"
                      >
                        {cameraStarting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4 text-[#c2a05a]" />
                        )}
                        ABRIR CÂMERA
                      </button>
                    )}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bevel-3d w-full h-12 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 text-white"
                    >
                      <ImageIcon className="w-4 h-4 text-[#c2a05a]" />
                      {selectedFile ? "ESCOLHER OUTRA FOTO" : "ESCOLHER DA GALERIA"}
                    </button>
                  </div>
                )}

                {cameraNote && (
                  <p className="text-[#9fb1d0] text-[11px] text-center leading-relaxed px-1">
                    {cameraNote}
                  </p>
                )}

                {error && (
                  <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-red-300 text-sm">{error}</p>
                  </div>
                )}

                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="btn-3d w-full h-12 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
