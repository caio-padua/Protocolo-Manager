// REFINAMENTO 1 — Respiro especular: alem da polvora+sol da base, uma camada de
// "respiro" mantem as letras com um brilho dourado suave que PULSA devagar o ciclo
// todo (mesmo no descanso). Da a sensacao de metal vivo, respirando luz. Contencao:
// pico baixo (~0.16) para nunca virar pisca-pisca.
const PNG = "/__mockup/images/paxter-paxter.png";
const WEBP = "/__mockup/images/paxter-paxter.webp";
const CLEAN = "/__mockup/images/paxter-paxter-clean.png";
const W = 420;
const CYCLE = 12000;

export function RespiroEspecular() {
  const css = `
    .re-sweep, .re-spark, .re-breath {
      position:absolute; inset:0; pointer-events:none; overflow:hidden; mix-blend-mode:screen;
      -webkit-mask-image:url(${CLEAN}); mask-image:url(${CLEAN});
      -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
      -webkit-mask-size:contain; mask-size:contain;
      -webkit-mask-position:center; mask-position:center;
    }
    .re-breath::before {
      content:""; position:absolute; inset:0;
      background:radial-gradient(70% 130% at 50% 35%, rgba(255,240,200,0.55), transparent 72%);
      opacity:0; animation:reBreath 6200ms ease-in-out infinite;
    }
    @keyframes reBreath { 0%,100%{opacity:0.02;} 50%{opacity:0.17;} }
    .re-sweep::before {
      content:""; position:absolute; top:-30%; bottom:-30%; left:0; width:56%;
      background:linear-gradient(100deg, transparent 0%, rgba(255,231,150,0.32) 38%,
        rgba(255,247,214,0.92) 50%, rgba(255,231,150,0.32) 62%, transparent 100%);
      transform:translateX(-180%) skewX(-14deg); opacity:0;
      animation:reSweep ${CYCLE}ms cubic-bezier(.45,0,.55,1) 900ms infinite backwards;
    }
    @keyframes reSweep {
      0%{transform:translateX(-180%) skewX(-14deg);opacity:0;}
      26%{transform:translateX(-180%) skewX(-14deg);opacity:0;}
      30%{opacity:1;}
      45%{transform:translateX(320%) skewX(-14deg);opacity:1;}
      48%{transform:translateX(320%) skewX(-14deg);opacity:0;}
      100%{transform:translateX(320%) skewX(-14deg);opacity:0;}
    }
    .re-spark::before {
      content:""; position:absolute; top:-30%; bottom:-30%; left:0; width:13%;
      background:linear-gradient(100deg, transparent 0%, rgba(255,253,235,0.95) 50%, transparent 100%);
      transform:translateX(-220%) skewX(-14deg); opacity:0;
      animation:reSpark ${CYCLE}ms linear 900ms infinite backwards;
    }
    @keyframes reSpark {
      0%{transform:translateX(-220%) skewX(-14deg);opacity:0;}
      2%{transform:translateX(-220%) skewX(-14deg);opacity:0;}
      5%{opacity:1;}
      21%{transform:translateX(360%) skewX(-14deg);opacity:1;}
      24%{transform:translateX(360%) skewX(-14deg);opacity:0;}
      100%{transform:translateX(360%) skewX(-14deg);opacity:0;}
    }
  `;
  return (
    <div className="min-h-screen w-full flex items-center justify-center"
      style={{ background: "radial-gradient(125% 125% at 50% 38%, #18305a 0%, #0b1730 58%, #060d1c 100%)" }}>
      <style>{css}</style>
      <div style={{ position: "relative", width: W, lineHeight: 0 }}>
        <picture>
          <source srcSet={WEBP} type="image/webp" />
          <img src={PNG} alt="PAXTER" draggable={false}
            style={{ width: "100%", height: "auto", display: "block" }} />
        </picture>
        <div className="re-breath" aria-hidden="true" />
        <div className="re-spark" aria-hidden="true" />
        <div className="re-sweep" aria-hidden="true" />
      </div>
    </div>
  );
}
