import { useState, useRef } from "react";
import { ShieldCheck, Eye, RefreshCw, QrCode, ExternalLink, ClipboardPaste, Monitor, Smartphone } from "lucide-react";

const DEMO_TOKEN = "2D61B478";

export default function PreviewValidacao() {
  const [token,      setToken]      = useState(DEMO_TOKEN);
  const [inputVal,   setInputVal]   = useState(DEMO_TOKEN);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view,       setView]       = useState<"ambos" | "desktop" | "mobile">("ambos");

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

  function recarregar() {
    setRefreshKey(k => k + 1);
  }

  const previewUrl = `/consulta-receituario?token=${encodeURIComponent(token)}`;
  const iframeKey  = `${token}-${refreshKey}`;

  return (
    <div className="flex flex-col gap-0 h-full min-h-screen"
      style={{ background: "var(--bg-base, #f4f0ea)" }}>

      {/* ── CABEÇALHO ─────────────────────────────────────────── */}
      <div className="panel-3d mx-4 mt-4 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="concave-3d p-2 rounded-[6px]">
            <ShieldCheck size={20} style={{ color: "rgba(201,162,78,0.80)" }} />
          </div>
          <div>
            <h1 className="text-[13px] font-black tracking-[0.18em] uppercase"
              style={{ fontFamily: "'Cinzel',serif", color: "rgba(201,162,78,0.90)" }}>
              Ferramenta de Validação de Receituário
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(0,0,0,0.45)" }}>
              Simule a visão do farmacêutico ao escanear o QR code da prescrição
            </p>
          </div>
        </div>

        {/* Toggle de vista */}
        <div className="flex items-center gap-1 concave-3d p-1 rounded-[8px]">
          {(["ambos", "desktop", "mobile"] as const).map(v => {
            const active = view === v;
            const Icon   = v === "mobile" ? Smartphone : v === "desktop" ? Monitor : null;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[10px] font-bold tracking-[0.12em] uppercase transition-all ${active ? "btn-3d" : ""}`}
                style={{ color: active ? undefined : "rgba(0,0,0,0.45)" }}
              >
                {Icon && <Icon size={11} />}
                {v === "ambos" ? "Ambas" : v === "desktop" ? "Desktop" : "Celular"}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CORPO ─────────────────────────────────────────────── */}
      <div className="flex gap-4 p-4 items-start flex-wrap lg:flex-nowrap">

        {/* PAINEL ESQUERDO — controles */}
        <div className="w-full lg:w-[300px] flex flex-col gap-3 shrink-0">

          <div className="panel-3d p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <QrCode size={14} style={{ color: "rgba(201,162,78,0.75)" }} />
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase"
                style={{ fontFamily: "'Cinzel',serif", color: "rgba(201,162,78,0.75)" }}>
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
              <button
                onClick={aplicar}
                className="btn-3d flex-1 flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-bold tracking-[0.14em] uppercase"
                style={{ fontFamily: "'Cinzel',serif" }}
              >
                <Eye size={13} />
                Visualizar
              </button>
              <button
                onClick={recarregar}
                title="Recarregar"
                className="concave-3d flex items-center justify-center p-2 rounded-[6px]"
                style={{ color: "rgba(201,162,78,0.80)" }}
              >
                <RefreshCw size={13} />
              </button>
            </div>

            <button
              onClick={demo}
              className="bevel-3d w-full flex items-center justify-center gap-2 py-2 px-3 rounded-[6px] text-[11px] font-semibold tracking-[0.10em]"
              style={{ color: "rgba(0,0,0,0.60)" }}
            >
              <ClipboardPaste size={13} />
              Token de Demonstração
            </button>
          </div>

          {/* Token ativo */}
          {token && (
            <div className="panel-3d p-4 flex flex-col gap-2">
              <span className="text-[9px] font-bold tracking-[0.22em] uppercase"
                style={{ color: "rgba(201,162,78,0.60)" }}>Token ativo</span>
              <span className="font-mono text-[14px] font-bold tracking-[0.20em]"
                style={{ color: "rgba(0,0,0,0.75)" }}>{token}</span>
              <a href={previewUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[10px] underline underline-offset-2 w-fit"
                style={{ color: "rgba(201,162,78,0.75)" }}>
                <ExternalLink size={11} />
                Abrir em nova aba
              </a>
            </div>
          )}

          {/* Instruções */}
          <div className="concave-3d p-4 flex flex-col gap-2">
            <span className="text-[9px] font-bold tracking-[0.22em] uppercase"
              style={{ color: "rgba(0,0,0,0.40)" }}>Como usar</span>
            <ol className="flex flex-col gap-1.5 text-[11px] leading-relaxed list-decimal pl-4"
              style={{ color: "rgba(0,0,0,0.55)" }}>
              <li>Emita uma prescrição pelo sistema</li>
              <li>Copie o token do QR code gerado no PDF</li>
              <li>Cole acima e clique Visualizar</li>
              <li>Veja como o farmacêutico vai ver em celular e computador</li>
            </ol>
          </div>

          <div className="panel-3d p-4">
            <span className="text-[9px] font-bold tracking-[0.22em] uppercase block mb-2"
              style={{ color: "rgba(0,0,0,0.40)" }}>Rota pública (QR aponta para)</span>
            <code className="text-[10px] break-all leading-relaxed"
              style={{ color: "rgba(201,162,78,0.80)", fontFamily: "monospace" }}>
              /consulta-receituario?token=TOKEN
            </code>
          </div>
        </div>

        {/* PAINÉIS DE PREVIEW ─────────────────────────────────── */}
        <div className={`flex-1 flex gap-6 items-start flex-wrap ${view === "ambos" ? "lg:flex-nowrap" : ""}`}>

          {/* ── DESKTOP ──────────────────────────────────────── */}
          {(view === "ambos" || view === "desktop") && (
            <div className={`flex flex-col items-center gap-2 ${view === "ambos" ? "flex-1 min-w-0" : "w-full"}`}>
              {/* Label */}
              <div className="flex items-center gap-2">
                <Monitor size={13} style={{ color: "rgba(0,0,0,0.40)" }} />
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase"
                  style={{ color: "rgba(0,0,0,0.40)" }}>
                  Vista Desktop — Computador
                </span>
              </div>

              {/* Moldura de monitor */}
              <div className="flex flex-col items-center">
                {/* Tela */}
                <div
                  className="rounded-[8px] overflow-hidden"
                  style={{
                    width:     view === "ambos" ? "min(560px, 100%)" : "min(860px, 100%)",
                    height:    580,
                    border:    "3px solid #2a3a4a",
                    boxShadow: "0 0 0 1px rgba(201,162,78,0.20), 0 24px 48px rgba(0,0,0,0.30)",
                    background: "#0d1a2d",
                  }}
                >
                  <iframe
                    key={iframeKey}
                    src={previewUrl}
                    className="w-full h-full border-0"
                    title="Prévia Desktop"
                    style={{ background: "#0d1a2d" }}
                  />
                </div>
                {/* Pescoço + base */}
                <div style={{ width: 60, height: 14, background: "#2a3a4a", borderRadius: "0 0 4px 4px" }} />
                <div style={{ width: 130, height: 8, background: "#2a3a4a", borderRadius: 4 }} />
              </div>

              <p className="text-[10px] text-center max-w-[400px] leading-relaxed px-2"
                style={{ color: "rgba(0,0,0,0.35)" }}>
                Visão quando o farmacêutico acessa pelo computador da farmácia
              </p>
            </div>
          )}

          {/* ── CELULAR ──────────────────────────────────────── */}
          {(view === "ambos" || view === "mobile") && (
            <div className="flex flex-col items-center gap-2 shrink-0">
              {/* Label */}
              <div className="flex items-center gap-2">
                <Smartphone size={13} style={{ color: "rgba(0,0,0,0.40)" }} />
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase"
                  style={{ color: "rgba(0,0,0,0.40)" }}>
                  Vista Celular — QR Code
                </span>
              </div>

              {/* Moldura de celular */}
              <div
                className="relative rounded-[28px] overflow-hidden"
                style={{
                  width:     360,
                  height:    700,
                  background: "#0d1a2d",
                  border:    "7px solid #1a2a3a",
                  boxShadow: "0 0 0 1px rgba(201,162,78,0.20), 2px 4px 0 rgba(0,0,0,0.30), -1px 2px 0 rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.40)",
                }}
              >
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10"
                  style={{ width: 90, height: 18, background: "#1a2a3a", borderRadius: "0 0 12px 12px" }} />

                {/* Câmera */}
                <div className="absolute z-20"
                  style={{ top: 5, left: "50%", transform: "translateX(20px)", width: 8, height: 8, borderRadius: "50%", background: "#2a3a4a" }} />

                <iframe
                  key={iframeKey + "-m"}
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="Prévia Celular"
                  style={{ background: "#0d1a2d" }}
                />

                {/* Barra inferior (indicador home) */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full"
                  style={{ width: 90, height: 4, background: "rgba(255,255,255,0.20)" }} />
              </div>

              <p className="text-[10px] text-center max-w-[280px] leading-relaxed px-2"
                style={{ color: "rgba(0,0,0,0.35)" }}>
                Visão ao escanear o QR code impresso na receita
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
