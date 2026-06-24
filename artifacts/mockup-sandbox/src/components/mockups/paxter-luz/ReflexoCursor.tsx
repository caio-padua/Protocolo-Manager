// REFINAMENTO 3 — Reflexo no cursor (so desktop com mouse): um reflexo especular
// segue o cursor sobre o nome, como se a luz batesse no metal conforme voce passa a
// mao. Sem cursor (ou no toque/mobile), roda a passada base (polvora+sol) como
// repouso elegante — regra do CEO: nada de brilho pesado reagindo a toque no mobile.
import { useRef, useState } from "react";

const PNG = "/__mockup/images/paxter-paxter.png";
const WEBP = "/__mockup/images/paxter-paxter.webp";
const CLEAN = "/__mockup/images/paxter-paxter-clean.png";
const W = 420;
const CYCLE = 12000;

export function ReflexoCursor() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, active: false });

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    setPos({ x: Math.max(0, Math.min(100, x)), active: true });
  }

  const css = `
    .rc-base, .rc-reflex {
      position:absolute; inset:0; pointer-events:none; overflow:hidden; mix-blend-mode:screen;
      -webkit-mask-image:url(${CLEAN}); mask-image:url(${CLEAN});
      -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
      -webkit-mask-size:contain; mask-size:contain;
      -webkit-mask-position:center; mask-position:center;
    }
    .rc-reflex { transition:opacity .25s ease; }
    .rc-base::before {
      content:""; position:absolute; top:-30%; bottom:-30%; left:0; width:50%;
      background:linear-gradient(100deg, transparent 0%, rgba(255,231,150,0.30) 40%,
        rgba(255,247,214,0.88) 50%, rgba(255,231,150,0.30) 60%, transparent 100%);
      transform:translateX(-180%) skewX(-14deg); opacity:0;
      animation:rcSweep ${CYCLE}ms cubic-bezier(.45,0,.55,1) 900ms infinite backwards;
    }
    @keyframes rcSweep {
      0%{transform:translateX(-180%) skewX(-14deg);opacity:0;}
      28%{transform:translateX(-180%) skewX(-14deg);opacity:0;}
      32%{opacity:1;}
      46%{transform:translateX(320%) skewX(-14deg);opacity:1;}
      49%{transform:translateX(320%) skewX(-14deg);opacity:0;}
      100%{transform:translateX(320%) skewX(-14deg);opacity:0;}
    }
  `;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-6"
      style={{ background: "radial-gradient(125% 125% at 50% 38%, #18305a 0%, #0b1730 58%, #060d1c 100%)" }}>
      <style>{css}</style>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={() => setPos((p) => ({ ...p, active: false }))}
        style={{ position: "relative", width: W, lineHeight: 0, cursor: "crosshair" }}
      >
        <picture>
          <source srcSet={WEBP} type="image/webp" />
          <img src={PNG} alt="PAXTER" draggable={false}
            style={{ width: "100%", height: "auto", display: "block" }} />
        </picture>
        {/* repouso: passada base quando o mouse nao esta sobre o nome */}
        {!pos.active && <div className="rc-base" aria-hidden="true" />}
        {/* reflexo que segue o cursor */}
        <div
          className="rc-reflex"
          aria-hidden="true"
          style={{
            opacity: pos.active ? 1 : 0,
            background: `radial-gradient(38% 150% at ${pos.x}% 50%, rgba(255,247,220,0.92) 0%, rgba(255,231,150,0.35) 35%, transparent 62%)`,
          }}
        />
      </div>
      <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "rgba(180,200,230,0.55)", margin: 0 }}>
        passe o mouse sobre o nome
      </p>
    </div>
  );
}
