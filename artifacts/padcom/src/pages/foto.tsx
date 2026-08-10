import { useState, useEffect, useCallback, useRef } from "react";
import {
  Camera,
  CheckCircle,
  Loader2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  X,
  ZoomIn,
} from "lucide-react";
import { PaxterLockup } from "@/components/layout/paxter-fx/PaxterLockup";
import { PAXTER_SITE_URL } from "@/lib/brand";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CAMERA_FALLBACK_MSG =
  "Não foi possível abrir a câmera neste navegador. No iPhone, abra o link no Safari; no Android, no Chrome. Você ainda pode enviar pela galeria abaixo.";

function getToken(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

// ── Editor de Recorte Quadrado (1:1) ─────────────────────────────────────────
// Abre sobre a tela inteira após captura ou seleção da galeria.
// O usuário arrasta a imagem e usa pinça/slider para enquadrar o rosto.
// Ao confirmar, extrai um canvas 600×600 JPEG (qualidade 0,92).
// ─────────────────────────────────────────────────────────────────────────────
interface CropEditorProps {
  imageSrc: string;
  onConfirm: (file: File) => void;
  onRetry: () => void;
}

function CropEditor({ imageSrc, onConfirm, onRetry }: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [initialScale, setInitialScale] = useState(1);
  const [imgError, setImgError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;

  // Drag state (pointer/touch)
  const dragRef = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);
  const pinchRef = useRef<{ dist: number; startZoom: number } | null>(null);

  const computeMaxOffset = useCallback(
    (z: number) => {
      const img = imgRef.current;
      const container = containerRef.current;
      if (!img || !container) return { maxX: 0, maxY: 0 };
      const sz = container.offsetWidth;
      const ts = initialScale * z;
      return {
        maxX: Math.max(0, (img.naturalWidth * ts - sz) / 2),
        maxY: Math.max(0, (img.naturalHeight * ts - sz) / 2),
      };
    },
    [initialScale],
  );

  const clampOffset = useCallback(
    (ox: number, oy: number, z: number) => {
      const { maxX, maxY } = computeMaxOffset(z);
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      };
    },
    [computeMaxOffset],
  );

  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const sz = container.offsetWidth || 300;
    const minSide = Math.min(img.naturalWidth, img.naturalHeight);
    if (minSide < 200) {
      setImgError("Imagem muito pequena. Use uma foto de maior resolução.");
      return;
    }
    setInitialScale(sz / minSide);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // ── Pointer events (desktop pan) ──────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: { ...offset } };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offset],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setOffset(clampOffset(dragRef.current.startOffset.x + dx, dragRef.current.startOffset.y + dy, zoom));
    },
    [zoom, clampOffset],
  );

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  // ── Touch events (mobile pan + pinch) ────────────────────────────────────
  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { dist: Math.hypot(dx, dy), startZoom: zoom };
        dragRef.current = null;
      } else {
        dragRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startOffset: { ...offset },
        };
        pinchRef.current = null;
      }
    },
    [zoom, offset],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.touches.length === 2 && pinchRef.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchRef.current.startZoom * (dist / pinchRef.current.dist)));
        setZoom(z);
        setOffset((prev) => clampOffset(prev.x, prev.y, z));
      } else if (e.touches.length === 1 && dragRef.current) {
        const dx = e.touches[0].clientX - dragRef.current.startX;
        const dy = e.touches[0].clientY - dragRef.current.startY;
        setOffset(clampOffset(dragRef.current.startOffset.x + dx, dragRef.current.startOffset.y + dy, zoom));
      }
    },
    [zoom, clampOffset],
  );

  const onTouchEnd = useCallback(() => {
    dragRef.current = null;
    pinchRef.current = null;
  }, []);

  // ── Confirmar recorte ─────────────────────────────────────────────────────
  // Suporta zoom < 1 (imagem menor que o container): preenche o fundo navy e
  // centraliza a imagem no canvas de 600×600 — garante saída sempre quadrada.
  const handleConfirm = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || imgError) return;
    setConfirming(true);
    const sz = container.offsetWidth || 300;
    const ts = initialScale * zoom;
    const srcX = img.naturalWidth / 2 - (sz / 2 + offset.x) / ts;
    const srcY = img.naturalHeight / 2 - (sz / 2 + offset.y) / ts;
    const srcSize = sz / ts;

    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setConfirming(false); return; }

    // Fundo navy (visível quando zoom < 1 e imagem não cobre o container)
    ctx.fillStyle = "#0d1830";
    ctx.fillRect(0, 0, 600, 600);

    // Recorte clamped para bounds válidos da imagem; dstX/Y compensa as margens
    const csx = Math.max(0, srcX);
    const csy = Math.max(0, srcY);
    const dstX = srcX < 0 ? Math.round((-srcX / srcSize) * 600) : 0;
    const dstY = srcY < 0 ? Math.round((-srcY / srcSize) * 600) : 0;
    const vsw = Math.min(srcSize - Math.max(0, -srcX), img.naturalWidth - csx);
    const vsh = Math.min(srcSize - Math.max(0, -srcY), img.naturalHeight - csy);
    if (vsw > 0 && vsh > 0) {
      ctx.drawImage(
        img,
        csx, csy, vsw, vsh,
        dstX, dstY,
        Math.round((vsw / srcSize) * 600),
        Math.round((vsh / srcSize) * 600),
      );
    }

    canvas.toBlob(
      (blob) => {
        setConfirming(false);
        if (!blob) return;
        onConfirm(new File([blob], "foto.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }, [initialScale, zoom, offset, imgError, onConfirm]);

  const totalScale = initialScale * zoom;

  return (
    <div className="fixed inset-0 z-50 bg-[#080f1e]/97 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
      <div className="w-full max-w-[360px] space-y-4">
        {/* Título */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">
            Enquadrar Foto
          </h2>
          <button onClick={onRetry} className="text-[#7e93b8] hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Área de recorte */}
        <div className="flex justify-center">
          <div
            ref={containerRef}
            className="relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
            style={{
              width: 300,
              height: 300,
              border: "2px solid #C9A227",
              borderRadius: "6px",
              boxShadow: "0 0 0 2px rgba(201,162,39,0.25), 0 8px 32px rgba(0,0,0,0.7)",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Cantos dourados decorativos */}
            {(["top-0 left-0","top-0 right-0","bottom-0 left-0","bottom-0 right-0"] as const).map((pos, i) => (
              <div
                key={i}
                className={`absolute ${pos} w-5 h-5 border-[#C9A227] pointer-events-none z-10`}
                style={{
                  borderTopWidth: i < 2 ? 2 : 0,
                  borderBottomWidth: i >= 2 ? 2 : 0,
                  borderLeftWidth: i % 2 === 0 ? 2 : 0,
                  borderRightWidth: i % 2 === 1 ? 2 : 0,
                }}
              />
            ))}
            <img
              ref={imgRef}
              src={imageSrc}
              onLoad={onImageLoad}
              draggable={false}
              alt="Enquadrar"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transformOrigin: "center center",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${totalScale})`,
                maxWidth: "none",
                userSelect: "none",
                pointerEvents: "none",
                touchAction: "none",
              }}
            />
          </div>
        </div>

        <p className="text-[#7e93b8] text-[11px] text-center leading-relaxed">
          Arraste para enquadrar · Pinçe ou use o controle para aproximar
        </p>

        {/* Slider de zoom */}
        {!imgError && (
          <div className="flex items-center gap-3 px-1">
            <ZoomIn className="w-4 h-4 text-[#C9A227] shrink-0" />
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.02}
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoom(z);
                setOffset((prev) => clampOffset(prev.x, prev.y, z));
              }}
              className="flex-1 accent-[#C9A227] h-1"
            />
          </div>
        )}

        {/* Erro de imagem pequena */}
        {imgError && (
          <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{imgError}</p>
          </div>
        )}

        {/* Botões */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleConfirm}
            disabled={!!imgError || confirming}
            className="btn-3d-soft w-full h-12 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {confirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            CONFIRMAR RECORTE
          </button>
          <button
            onClick={onRetry}
            className="bevel-3d w-full h-12 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 text-white"
          >
            REFAZER
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tela Principal ────────────────────────────────────────────────────────────
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

  // Editor de recorte
  const [cropMode, setCropMode] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);

  // Câmera ao vivo
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
    if (!token) { setInvalid(true); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/client-photo/info?token=${encodeURIComponent(token)}`);
        if (!res.ok) { setInvalid(true); return; }
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraNote("");
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraSupported(false);
      setCameraNote(CAMERA_FALLBACK_MSG);
      fileInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  }, []);

  // Captura frame da câmera → entra no editor de recorte
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
        if (!blob) { setError("Não foi possível capturar a foto. Tente novamente."); return; }
        const src = URL.createObjectURL(blob);
        setRawImageSrc(src);
        setCropMode(true);
        stopCamera();
      },
      "image/jpeg",
      0.95,
    );
  }, [stopCamera]);

  // Seleção da galeria → entra no editor de recorte
  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Selecione uma imagem (foto)."); return; }
    setError("");
    const src = URL.createObjectURL(file);
    setRawImageSrc(src);
    setCropMode(true);
    // Limpa o input para permitir re-seleção do mesmo arquivo
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Confirmação do recorte
  const onCropConfirm = useCallback(
    (croppedFile: File) => {
      setSelectedFile(croppedFile);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(croppedFile));
      setCropMode(false);
      if (rawImageSrc) { URL.revokeObjectURL(rawImageSrc); setRawImageSrc(null); }
    },
    [preview, rawImageSrc],
  );

  // Retry do recorte (volta para câmera/galeria sem arquivo selecionado)
  const onCropRetry = useCallback(() => {
    setCropMode(false);
    if (rawImageSrc) { URL.revokeObjectURL(rawImageSrc); setRawImageSrc(null); }
  }, [rawImageSrc]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("token", token);
      const res = await fetch(`${API_BASE}/api/client-photo/upload`, { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Não foi possível enviar a foto.");
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
      {/* Editor de recorte sobrepõe tudo quando ativo */}
      {cropMode && rawImageSrc && (
        <CropEditor imageSrc={rawImageSrc} onConfirm={onCropConfirm} onRetry={onCropRetry} />
      )}

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
                Obrigado{clientName ? `, ${clientName.split(" ")[0]}` : ""}. Sua foto foi recebida pela clínica.
              </p>
            </div>
          )}

          {!loading && !invalid && !done && (
            <div className="panel-3d overflow-hidden">
              <div className="bg-[#0b1426] px-5 py-4 border-b border-[rgba(184,146,77,0.22)]">
                <div className="flex items-center gap-3">
                  <Camera className="w-5 h-5 text-[#c2a05a]" />
                  <h2 className="text-white font-semibold text-sm uppercase tracking-wide">ENVIAR SUA FOTO</h2>
                </div>
                {clientName && (
                  <p className="text-[#7e93b8] text-xs mt-1">
                    Olá, <span className="text-white font-semibold">{clientName}</span>
                  </p>
                )}
              </div>

              <div className="p-5 space-y-4">
                {/* Preview quadrado com guia de câmera */}
                <div className="flex justify-center">
                  <div className="concave-3d rounded-[6px] overflow-hidden flex items-center justify-center relative"
                    style={{ width: 176, height: 176 }}>
                    {cameraActive ? (
                      <>
                        <video
                          ref={videoRef}
                          playsInline
                          muted
                          autoPlay
                          className="w-full h-full object-cover"
                        />
                        {/* Guia de enquadramento quadrado sobre o vídeo */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div
                            style={{
                              width: "80%",
                              aspectRatio: "1",
                              border: "2px solid #C9A227",
                              borderRadius: "4px",
                              boxShadow: "0 0 0 200px rgba(0,0,0,0.45)",
                              position: "relative",
                              zIndex: 1,
                            }}
                          />
                        </div>
                        <p className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-[#C9A227] bg-black/60 py-0.5 z-10">
                          Posicione o rosto no quadrado
                        </p>
                      </>
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
                  <p className="text-[#9fb1d0] text-[11px] text-center leading-relaxed px-1">{cameraNote}</p>
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
