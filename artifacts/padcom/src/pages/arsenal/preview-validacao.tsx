import { useState, useRef } from "react";
import { ShieldCheck, Eye, RefreshCw, QrCode, ExternalLink, ClipboardPaste } from "lucide-react";

const DEMO_TOKEN = "2D61B478";

export default function PreviewValidacao() {
  const [token, setToken] = useState(DEMO_TOKEN);
  const [inputVal, setInputVal] = useState(DEMO_TOKEN);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  return (
    <div className="flex flex-col gap-0 h-full min-h-screen" style={{ background: "var(--bg-base, #f4f0ea)" }}>

      {/* ── CABEÇALHO DA FERRAMENTA ─────────────────────────────── */}
      <div className="panel-3d mx-4 mt-4 mb-0 px-5 py-4 flex items-center gap-3">
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

      {/* ── CORPO: CONTROLE + PREVIEW ─────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-4 p-4 flex-1 items-start">

        {/* PAINEL ESQUERDO — controles */}
        <div className="w-full lg:w-[340px] flex flex-col gap-3 shrink-0">

          {/* Token input */}
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
              style={{ color: "rgba(0,0,0,0.80)", letterSpacing: "0.18em" }}
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
                className="concave-3d flex items-center justify-center gap-1 py-2 px-3 rounded-[6px] text-[11px] font-semibold"
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
              Carregar Token de Demonstração
            </button>
          </div>

          {/* Token ativo */}
          {token && (
            <div className="panel-3d p-4 flex flex-col gap-2">
              <span className="text-[9px] font-bold tracking-[0.22em] uppercase"
                style={{ color: "rgba(201,162,78,0.60)" }}>
                Token ativo
              </span>
              <span className="font-mono text-[14px] font-bold tracking-[0.20em]"
                style={{ color: "rgba(0,0,0,0.75)" }}>
                {token}
              </span>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[10px] underline underline-offset-2 w-fit"
                style={{ color: "rgba(201,162,78,0.75)" }}
              >
                <ExternalLink size={11} />
                Abrir em nova aba
              </a>
            </div>
          )}

          {/* Instruções */}
          <div className="concave-3d p-4 flex flex-col gap-2">
            <span className="text-[9px] font-bold tracking-[0.22em] uppercase"
              style={{ color: "rgba(0,0,0,0.40)" }}>
              Como usar
            </span>
            <ol className="flex flex-col gap-1.5 text-[11px] leading-relaxed list-decimal pl-4"
              style={{ color: "rgba(0,0,0,0.55)" }}>
              <li>Emita uma prescrição pelo sistema</li>
              <li>Copie o token do QR code gerado no PDF</li>
              <li>Cole no campo acima e clique em Visualizar</li>
              <li>Esta é a tela que o farmacêutico vê ao escanear</li>
            </ol>
          </div>

          {/* Link direto */}
          <div className="panel-3d p-4">
            <span className="text-[9px] font-bold tracking-[0.22em] uppercase block mb-2"
              style={{ color: "rgba(0,0,0,0.40)" }}>
              Rota pública (QR aponta para)
            </span>
            <code className="text-[10px] break-all leading-relaxed"
              style={{ color: "rgba(201,162,78,0.80)", fontFamily: "monospace" }}>
              /consulta-receituario?token=TOKEN
            </code>
          </div>
        </div>

        {/* PAINEL DIREITO — iframe simulação de celular */}
        <div className="flex-1 flex flex-col items-center">
          <div className="flex flex-col items-center gap-2">
            {/* Label */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.20em] uppercase"
                style={{ color: "rgba(0,0,0,0.40)" }}>
                Simulação — visão do farmacêutico
              </span>
            </div>

            {/* Moldura de celular */}
            <div
              className="relative rounded-[28px] overflow-hidden shadow-2xl"
              style={{
                width: 390,
                height: 720,
                background: "#0d1a2d",
                border: "8px solid #1a2a3a",
                boxShadow: "0 0 0 2px rgba(201,162,78,0.25), 0 32px 64px rgba(0,0,0,0.40)",
              }}
            >
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10"
                style={{ width: 100, height: 22, background: "#1a2a3a", borderRadius: "0 0 14px 14px" }} />

              {/* iframe */}
              <iframe
                ref={iframeRef}
                key={`${token}-${refreshKey}`}
                src={previewUrl}
                className="w-full h-full border-0"
                title="Prévia da Validação"
                style={{ background: "#0d1a2d" }}
              />
            </div>

            {/* Legenda */}
            <p className="text-[10px] text-center max-w-[390px] leading-relaxed"
              style={{ color: "rgba(0,0,0,0.40)" }}>
              Esta é a tela exata que aparece quando o farmacêutico escaneia o QR code da receita impressa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
