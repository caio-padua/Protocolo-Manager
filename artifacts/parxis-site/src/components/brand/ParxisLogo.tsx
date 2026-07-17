import { useId } from "react";

/* Arquivos na pasta public/ — servidos como URL estática pelo Vite */
const symbolSrc   = "/parxis/brand/parxis-symbol-new.png";
const wordmarkSrc = "/parxis/brand/parxis-wordmark-new.png";

/**
 * ParxisLogo
 * ──────────
 * Símbolo RX levitando (animação de respiração suave) + wordmark PARXIS abaixo.
 * Usa os dois PNGs com fundo transparente removido por IA.
 *
 * Animação de respiração:
 *   – translateY  0px → -14px → 0px  (sobe e desce como pulmão)
 *   – scale       1.00 → 1.030 → 1.00
 *   – drop-shadow cresce quando sobe (maior altitude = sombra mais difusa)
 *   – glow dourado pulsa no topo da "inspiração"
 *   – período: 3.8 s (ritmo respiratório natural)
 *
 * Props:
 *   width  – largura do símbolo em px (wordmark escala proporcionalmente)
 *   className – classe extra no wrapper externo
 *   mode  – "breath" (padrão) | "static" (sem animação, ex.: rodapé)
 */

type Props = {
  width?: number;
  className?: string;
  /** @deprecated aceito por compatibilidade mas ignorado — use mode="static" */
  animate?: boolean;
  mode?: "breath" | "static";
};

export function ParxisLogo({ width = 220, className = "", mode = "breath" }: Props) {
  const uid = useId().replace(/:/g, "x");

  const breathK = `pxBreath${uid}`;
  const glowK   = `pxGlow${uid}`;
  const sweepK  = `pxSweep${uid}`;

  /* Wordmark tem proporção ~4.3:1 (largura:altura) */
  const wordmarkW = Math.round(width * 1.05);

  const css = `
    /* ── Respiração: sobe e desce como pulmão ── */
    @keyframes ${breathK} {
      0% {
        transform: translateY(0px) scale(1.000);
        filter:
          drop-shadow(0 18px 36px rgba(0,0,0,0.85))
          drop-shadow(0  4px 10px rgba(242,184,23,0.05));
      }
      40% {
        transform: translateY(-10px) scale(1.018);
        filter:
          drop-shadow(0 26px 48px rgba(0,0,0,0.70))
          drop-shadow(0  6px 18px rgba(242,184,23,0.15));
      }
      50% {
        transform: translateY(-14px) scale(1.030);
        filter:
          drop-shadow(0 32px 56px rgba(0,0,0,0.55))
          drop-shadow(0  8px 28px rgba(242,184,23,0.28))
          drop-shadow(0  0px 40px rgba(242,184,23,0.12));
      }
      60% {
        transform: translateY(-10px) scale(1.018);
        filter:
          drop-shadow(0 26px 48px rgba(0,0,0,0.70))
          drop-shadow(0  6px 18px rgba(242,184,23,0.15));
      }
      100% {
        transform: translateY(0px) scale(1.000);
        filter:
          drop-shadow(0 18px 36px rgba(0,0,0,0.85))
          drop-shadow(0  4px 10px rgba(242,184,23,0.05));
      }
    }

    /* ── Glow: pulsa em sincronia com a subida ── */
    @keyframes ${glowK} {
      0%,100% { opacity: 0.20; transform: translate(-50%,-50%) scale(1.00); }
      50%     { opacity: 0.65; transform: translate(-50%,-50%) scale(1.35); }
    }

    /* ── Reflexo de luz: varre o símbolo a cada 12 s ── */
    @keyframes ${sweepK} {
      0%,80%  { transform: translateX(-220%) skewX(-16deg); opacity: 0; }
      82%     { opacity: 0; }
      85%     { opacity: 1; transform: translateX(-40%) skewX(-16deg); }
      89%     { opacity: 1; transform: translateX(220%) skewX(-16deg); }
      90%,100%{ opacity: 0; }
    }

    .pxSymbol${uid} {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      animation: ${breathK} 3.8s ease-in-out infinite;
      will-change: transform, filter;
    }

    /* Reflexo diagonal sobre o símbolo */
    .pxSymbol${uid}::after {
      content: "";
      position: absolute;
      inset: -10% -5%;
      width: 30%;
      background: linear-gradient(
        100deg,
        transparent 0%,
        rgba(255,235,160,0.12) 30%,
        rgba(255,252,210,0.60) 50%,
        rgba(255,235,160,0.12) 70%,
        transparent 100%
      );
      mix-blend-mode: screen;
      pointer-events: none;
      animation: ${sweepK} 12s linear infinite;
    }

    /* Aura dourada pulsante atrás do símbolo */
    .pxAura${uid} {
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle,
        rgba(242,184,23,0.18) 0%,
        rgba(180,100,0,0.08) 40%,
        transparent 68%
      );
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 0;
      animation: ${glowK} 3.8s ease-in-out infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .pxSymbol${uid},
      .pxSymbol${uid}::after,
      .pxAura${uid} { animation: none !important; }
    }
  `;

  /* ── Modo estático (rodapé, etc.) ── */
  if (mode === "static") {
    return (
      <div
        className={className}
        style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10 }}
      >
        <img
          src={symbolSrc}
          alt="PARXIS symbol"
          width={width}
          style={{ display: "block" }}
          draggable={false}
        />
        <img
          src={wordmarkSrc}
          alt="PARXIS"
          width={wordmarkW}
          style={{ display: "block", opacity: 0.92 }}
          draggable={false}
        />
      </div>
    );
  }

  /* ── Modo animado (hero, splash) ── */
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: Math.round(width * 0.10),
        position: "relative",
      }}
    >
      <style>{css}</style>

      {/* Wrapper do símbolo com aura e respiração */}
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {/* Aura dourada pulsante */}
        <div
          className={`pxAura${uid}`}
          style={{ width: width * 1.8, height: width * 1.8 }}
          aria-hidden
        />

        {/* Símbolo RX respirando */}
        <div className={`pxSymbol${uid}`} style={{ zIndex: 1 }}>
          <img
            src={symbolSrc}
            alt="PARXIS — Clinical Intelligence System"
            width={width}
            style={{ display: "block" }}
            draggable={false}
          />
        </div>
      </div>

      {/* Wordmark PARXIS abaixo */}
      <img
        src={wordmarkSrc}
        alt="PARXIS"
        width={wordmarkW}
        style={{ display: "block", opacity: 0.95 }}
        draggable={false}
      />
    </div>
  );
}

export default ParxisLogo;
