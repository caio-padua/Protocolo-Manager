import { useId, useRef, useState, useEffect } from "react";

/**
 * ParxisLogo — monograma RX isolado sobre fundo transparente.
 *
 * Usa parxis-symbol.png (background removido por IA) em vez do
 * parxis-logo.png original com fundo de couro. O clip box ainda
 * é necessário para ocultar o wordmark "PARXIS" na metade inferior
 * do PNG original.
 *
 * Animação: flutuação 3D 7,2 s | rotateX 3° | rotateY -5° |
 *           translateY -8 px | scale 1,018 | pausa no topo (57%) |
 *           reflexo ocasional a cada 16 s.
 */

type Props = {
  width?: number;
  className?: string;
  mode?: "breath" | "static";
};

/* Porcentagem do PNG que corresponde ao símbolo RX (topo). */
const SYMBOL_RATIO = 0.60;

export function ParxisLogo({ width = 260, className, mode = "breath" }: Props) {
  const uid    = useId().replace(/:/g, "x");
  const imgRef = useRef<HTMLImageElement>(null);

  /* Altura calculada dinamicamente após onLoad */
  const [clipH, setClipH] = useState<number>(width * 0.58);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const measure = () => {
      if (img.naturalWidth > 0) {
        const dispH = width * (img.naturalHeight / img.naturalWidth);
        setClipH(Math.round(dispH * SYMBOL_RATIO));
      }
    };
    if (img.complete) measure();
    else img.addEventListener("load", measure);
    return () => img.removeEventListener("load", measure);
  }, [width]);

  const animK = `pxF${uid}`;
  const swpK  = `pxS${uid}`;
  const aurK  = `pxA${uid}`;

  const css = `
    @keyframes ${animK} {
      0%, 100% {
        transform: perspective(1000px) rotateX(3deg) rotateY(-5deg) translateY(0px) scale(1.000);
        filter: drop-shadow(0 22px 40px rgba(0,0,0,0.80)) drop-shadow(0 0 12px rgba(242,184,23,0.08));
      }
      28% {
        transform: perspective(1000px) rotateX(2.4deg) rotateY(-4.4deg) translateY(-4px) scale(1.008);
        filter: drop-shadow(0 26px 46px rgba(0,0,0,0.65)) drop-shadow(0 0 16px rgba(242,184,23,0.14));
      }
      50% {
        transform: perspective(1000px) rotateX(2deg) rotateY(-4deg) translateY(-8px) scale(1.018);
        filter: drop-shadow(0 32px 54px rgba(0,0,0,0.52)) drop-shadow(0 0 30px rgba(242,184,23,0.22));
      }
      57% {
        transform: perspective(1000px) rotateX(2deg) rotateY(-4deg) translateY(-8px) scale(1.018);
        filter: drop-shadow(0 32px 54px rgba(0,0,0,0.52)) drop-shadow(0 0 30px rgba(242,184,23,0.22));
      }
      82% {
        transform: perspective(1000px) rotateX(2.8deg) rotateY(-4.8deg) translateY(-2px) scale(1.005);
        filter: drop-shadow(0 24px 42px rgba(0,0,0,0.72)) drop-shadow(0 0 14px rgba(242,184,23,0.10));
      }
    }

    /* Reflexo de luz ocasional (sweep) */
    @keyframes ${swpK} {
      0%,87%{ transform:translateX(-200%) skewX(-18deg); opacity:0; }
      88%   { opacity:0; }
      90%   { opacity:1; transform:translateX(-30%) skewX(-18deg); }
      93%   { opacity:1; transform:translateX(200%) skewX(-18deg); }
      94%   { opacity:0; }
      100%  { opacity:0; }
    }

    /* Aura dourada pulsante */
    @keyframes ${aurK} {
      0%,100%{ opacity:.45; transform:translate(-50%,-50%) scale(1.00); }
      50%    { opacity:.90; transform:translate(-50%,-50%) scale(1.24); }
    }

    .pxFloat${uid} {
      display:inline-flex;
      animation: ${animK} 7.2s ease-in-out infinite;
      transform-origin: center center;
      will-change: transform, filter;
      position: relative;
    }

    /* Reflexo: faixa diagonal que percorre o símbolo */
    .pxFloat${uid}::after {
      content:"";
      position:absolute; top:-20%; bottom:-20%; left:0; width:28%;
      background:linear-gradient(98deg,
        transparent 0%,
        rgba(255,220,130,0.14) 30%,
        rgba(255,248,200,0.55) 50%,
        rgba(255,220,130,0.14) 70%,
        transparent 100%
      );
      mix-blend-mode:screen;
      pointer-events:none;
      animation: ${swpK} 16s linear infinite;
    }

    .pxAura${uid} {
      position:absolute;
      border-radius:50%;
      background:radial-gradient(circle,
        rgba(242,184,23,0.12) 0%,
        rgba(154,87,0,0.06) 45%,
        transparent 70%
      );
      top:50%;left:50%;
      transform:translate(-50%,-50%);
      pointer-events:none;
      z-index:0;
      animation: ${aurK} 7.2s ease-in-out infinite;
    }

    @media(prefers-reduced-motion:reduce){
      .pxFloat${uid},.pxFloat${uid}::after,.pxAura${uid}{ animation:none !important; }
    }
  `;

  const imgSrc = "/parxis/brand/parxis-symbol.png";

  /* ── Versão estática (rodapé, etc.) ── */
  if (mode === "static") {
    return (
      <div
        className={className}
        style={{
          width,
          height: clipH,
          overflow: "hidden",
          display: "inline-flex",
          flexShrink: 0,
        }}
      >
        <img
          ref={imgRef}
          src={imgSrc}
          alt="PARXIS symbol"
          style={{ width, height: "auto", display: "block", flexShrink: 0 }}
          draggable={false}
        />
      </div>
    );
  }

  /* ── Versão animada (hero / CTA) ── */
  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{css}</style>

      {/* Aura dourada pulsante ao redor do símbolo */}
      <div
        className={`pxAura${uid}`}
        style={{ width: width * 1.7, height: width * 1.7 }}
        aria-hidden
      />

      {/* Símbolo 3D flutuante */}
      <div className={`pxFloat${uid}`} style={{ zIndex: 1 }}>
        {/*
          Clip box: height = SYMBOL_RATIO × altura natural do PNG.
          overflow:hidden esconde o wordmark "PARXIS" na parte inferior
          do PNG, mesmo após a remoção de fundo.
        */}
        <div
          style={{
            width,
            height: clipH,
            overflow: "hidden",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <img
            ref={imgRef}
            src={imgSrc}
            alt="PARXIS — Clinical Intelligence System"
            style={{
              width,
              height: "auto",
              display: "block",
              position: "absolute",
              top: 0,
              left: 0,
            }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

export default ParxisLogo;
