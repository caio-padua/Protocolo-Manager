import { useState } from "react";
import {
  ShieldCheck, Eye, QrCode, ExternalLink, ClipboardPaste,
  Monitor, Smartphone, RefreshCw, ArrowUpRight
} from "lucide-react";

const DEMO_TOKEN = "2D61B478";

/** QR code via api pública do qrserver.com */
function QrImage({ url, size = 180 }: { url: string; size?: number }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=${size}x${size}&bgcolor=0d1a2d&color=c9a24e&margin=10`;
  return (
    <img
      src={src}
      alt="QR code da prescrição"
      width={size}
      height={size}
      className="rounded-[8px]"
      style={{ border: "2px solid rgba(201,162,78,0.30)" }}
    />
  );
}

export default function PreviewValidacao() {
  const [token,      setToken]      = useState(DEMO_TOKEN);
  const [inputVal,   setInputVal]   = useState(DEMO_TOKEN);
  const [refreshKey, setRefreshKey] = useState(0);

  /* URL relativa (dentro do app) */
  const previewPath = `/consulta-receituario?token=${encodeURIComponent(token)}`;

  /* URL absoluta para o QR code (celular precisa de domínio real) */
  const fullUrl = typeof window !== "undefined"
    ? window.location.origin + previewPath
    : previewPath;

  function aplicar() {
    const t = inputVal.trim().toUpperCase();
    if (!t) return;
    setToken(t);
    setRefreshKey(k => k + 1);
  }

  function demo() {
    setInputVal(DEMO_TOKEN);
    setToken(DEMO_TOKEN);
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="flex flex-col gap-0 h-full min-h-screen"
      style={{ background: "var(--bg-base, #f4f0ea)" }}>

      {/* ── CABEÇALHO ─────────────────────────────────────────── */}
      <div className="panel-3d mx-4 mt-4 px-5 py-4 flex items-center gap-3">
        <div className="concave-3d p-2 rounded-[6px]">
          <ShieldCheck size={20} style={{ color: "rgba(201,162,78,0.80)" }} />
        </div>
        <div>
          <h1 className="text-[13px] font-black tracking-[0.18em] uppercase"
            style={{ fontFamily: "PaxmedNum, 'Cinzel',serif", color: "rgba(201,162,78,0.90)" }}>
            Ferramenta de Validação de Receituário
          </h1>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(0,0,0,0.45)" }}>
            Abra no computador ou escaneie o QR code para ver a tela real no celular
          </p>
        </div>
      </div>

      {/* ── CORPO ─────────────────────────────────────────────── */}
      <div className="flex gap-4 p-4 items-start flex-wrap xl:flex-nowrap">

        {/* PAINEL ESQUERDO — controles */}
        <div className="w-full xl:w-[300px] flex flex-col gap-3 shrink-0">

          <div className="panel-3d p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <QrCode size={14} style={{ color: "rgba(201,162,78,0.75)" }} />
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase"
                style={{ fontFamily: "PaxmedNum, 'Cinzel',serif", color: "rgba(201,162,78,0.75)" }}>
                Token / QR Code
              </span>
            </div>

            <input
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && aplicar()}
              placeholder="Ex: 2D61B478"
              className="concave-3d w-full px-4 py-2.5 font-mono text-[13px] tracking-[0.18em] rounded-[6px] outline-none"
              style={{ color: "rgba(0,0,0,0.80)" }}
            />

            <div className="flex gap-2">
              <button onClick={aplicar}
                className="btn-3d flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold tracking-[0.14em] uppercase"
                style={{ fontFamily: "PaxmedNum, 'Cinzel',serif" }}>
                <Eye size={13} />
                Visualizar
              </button>
              <button onClick={() => setRefreshKey(k => k + 1)}
                title="Recarregar prévia"
                className="concave-3d flex items-center justify-center p-2 rounded-[6px]"
                style={{ color: "rgba(201,162,78,0.80)" }}>
                <RefreshCw size={13} />
              </button>
            </div>

            <button onClick={demo}
              className="bevel-3d w-full flex items-center justify-center gap-2 py-2 px-3 rounded-[6px] text-[11px] font-semibold"
              style={{ color: "rgba(0,0,0,0.60)" }}>
              <ClipboardPaste size={13} />
              Token de Demonstração
            </button>
          </div>

          {/* Token ativo */}
          {token && (
            <div className="panel-3d p-4 flex flex-col gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.22em] uppercase"
                style={{ color: "rgba(201,162,78,0.60)" }}>Token ativo</span>
              <span className="font-mono text-[15px] font-bold tracking-[0.22em]"
                style={{ color: "rgba(0,0,0,0.80)" }}>{token}</span>
            </div>
          )}

          {/* Instruções */}
          <div className="concave-3d p-4 flex flex-col gap-2">
            <span className="text-[9px] font-bold tracking-[0.22em] uppercase"
              style={{ color: "rgba(0,0,0,0.40)" }}>Como usar</span>
            <ol className="flex flex-col gap-1.5 text-[11px] leading-relaxed list-decimal pl-4"
              style={{ color: "rgba(0,0,0,0.55)" }}>
              <li>Cole o token do QR code da prescrição emitida</li>
              <li>Clique <strong>Visualizar</strong></li>
              <li>Para ver no computador: clique <strong>Abrir Desktop</strong></li>
              <li>Para ver no celular: escaneie o <strong>QR code</strong> ao lado</li>
            </ol>
          </div>

          <div className="panel-3d p-4">
            <span className="text-[9px] font-bold tracking-[0.22em] uppercase block mb-1.5"
              style={{ color: "rgba(0,0,0,0.40)" }}>Rota pública</span>
            <code className="text-[10px] break-all leading-relaxed"
              style={{ color: "rgba(201,162,78,0.80)", fontFamily: "monospace" }}>
              /consulta-receituario?token=TOKEN
            </code>
          </div>
        </div>

        {/* PAINÉIS DE VISUALIZAÇÃO ─────────────────────────── */}
        <div className="flex-1 flex gap-4 items-start flex-wrap lg:flex-nowrap">

          {/* ── DESKTOP ──────────────────────────────────────── */}
          <div className="flex-1 min-w-[300px] flex flex-col gap-3">
            {/* Título da seção */}
            <div className="flex items-center gap-2 px-1">
              <Monitor size={14} style={{ color: "rgba(0,0,0,0.45)" }} />
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase"
                style={{ color: "rgba(0,0,0,0.45)" }}>
                Vista Desktop — Computador
              </span>
            </div>

            {/* Card desktop */}
            <div className="panel-3d overflow-hidden">
              {/* Preview iframe fixo, sem scroll */}
              <div style={{ height: 480, overflow: "hidden", background: "#0d1a2d" }}>
                <iframe
                  key={`d-${token}-${refreshKey}`}
                  src={previewPath}
                  title="Prévia Desktop"
                  scrolling="no"
                  style={{
                    width:  "100%",
                    height: "100%",
                    border: "none",
                    display: "block",
                    background: "#0d1a2d",
                  }}
                />
              </div>

              {/* Botão de abertura real */}
              <div className="p-4 flex flex-col gap-2"
                style={{ borderTop: "1px solid rgba(201,162,78,0.15)" }}>
                <p className="text-[10px] leading-relaxed" style={{ color: "rgba(0,0,0,0.45)" }}>
                  A prévia acima é um recorte. Para ver a tela <strong>completa e real</strong>,
                  sem limitação de altura, clique abaixo:
                </p>
                <a
                  href={previewPath}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-3d flex items-center justify-center gap-2 py-3 px-4 text-[12px] font-bold tracking-[0.14em] uppercase no-underline"
                  style={{ fontFamily: "PaxmedNum, 'Cinzel',serif" }}
                >
                  <ArrowUpRight size={15} />
                  Abrir Tela Completa — Desktop
                </a>
              </div>
            </div>
          </div>

          {/* ── CELULAR ──────────────────────────────────────── */}
          <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-3">
            {/* Título da seção */}
            <div className="flex items-center gap-2 px-1">
              <Smartphone size={14} style={{ color: "rgba(0,0,0,0.45)" }} />
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase"
                style={{ color: "rgba(0,0,0,0.45)" }}>
                Vista Celular — QR Code Real
              </span>
            </div>

            {/* Card celular */}
            <div className="panel-3d overflow-hidden">
              <div className="flex flex-col items-center px-6 py-6 gap-4"
                style={{ background: "linear-gradient(160deg,#0d1a2d 0%,#07101f 100%)" }}>

                {/* QR code real */}
                <QrImage url={fullUrl} size={180} />

                {/* Instrução */}
                <div className="text-center">
                  <p className="text-[12px] font-semibold mb-1" style={{ color: "#f6e6a8" }}>
                    Escaneie com o celular
                  </p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
                    Aponte a câmera do seu celular para este QR code.
                    A tela de validação vai abrir exatamente como o farmacêutico vê.
                  </p>
                </div>

                {/* Linha separadora */}
                <div className="w-full h-px" style={{ background: "rgba(201,162,78,0.18)" }} />

                {/* Moldura mini celular com preview */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.30)" }}>
                    Prévia
                  </span>
                  {/* mini phone frame */}
                  <div
                    className="relative rounded-[16px] overflow-hidden"
                    style={{
                      width:      220,
                      height:     390,
                      border:     "5px solid #1a2a3a",
                      background: "#0d1a2d",
                      boxShadow:  "0 8px 32px rgba(0,0,0,0.50)",
                    }}
                  >
                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10"
                      style={{ width: 60, height: 12, background: "#1a2a3a", borderRadius: "0 0 8px 8px" }} />
                    <iframe
                      key={`m-${token}-${refreshKey}`}
                      src={previewPath}
                      title="Prévia Celular"
                      scrolling="no"
                      style={{
                        width:       "100%",
                        height:      "100%",
                        border:      "none",
                        display:     "block",
                        background:  "#0d1a2d",
                        transformOrigin: "top left",
                        transform:   "scale(0.56)",
                        width:       "178%",
                        height:      "178%",
                        pointerEvents: "none",
                      } as React.CSSProperties}
                    />
                    {/* Barra home */}
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full"
                      style={{ width: 60, height: 3, background: "rgba(255,255,255,0.25)" }} />
                  </div>
                  <span className="text-[9px] leading-snug text-center max-w-[200px]"
                    style={{ color: "rgba(255,255,255,0.30)" }}>
                    Escala reduzida — escaneie o QR code para ver em tamanho real
                  </span>
                </div>
              </div>

              {/* Botão link direto */}
              <div className="p-4" style={{ borderTop: "1px solid rgba(201,162,78,0.15)" }}>
                <a
                  href={previewPath}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-[6px] text-[11px] font-bold tracking-[0.12em] uppercase no-underline bevel-3d"
                  style={{ color: "rgba(0,0,0,0.65)" }}
                >
                  <ExternalLink size={13} />
                  Abrir Link Direto
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
