// REFINAMENTO 2 — Cintilar de diamante: em vez de UMA faixa larga, o evento de luz
// vem como DOIS lampejos finos rapidos em sequencia (glint duplo) mais um ponto de
// brilho — como a cintilacao de uma faceta de diamante pegando luz. Curto e brilhante.
const PNG = "/__mockup/images/paxter-paxter.png";
const WEBP = "/__mockup/images/paxter-paxter.webp";
const CLEAN = "/__mockup/images/paxter-paxter-clean.png";
const W = 420;
const CYCLE = 12000;

export function CintilarDiamante() {
  const css = `
    .cd-g1, .cd-g2, .cd-dot {
      position:absolute; inset:0; pointer-events:none; overflow:hidden; mix-blend-mode:screen;
      -webkit-mask-image:url(${CLEAN}); mask-image:url(${CLEAN});
      -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
      -webkit-mask-size:contain; mask-size:contain;
      -webkit-mask-position:center; mask-position:center;
    }
    .cd-g1::before, .cd-g2::before {
      content:""; position:absolute; top:-30%; bottom:-30%; left:0; width:9%;
      background:linear-gradient(100deg, transparent 0%, rgba(255,255,250,0.98) 50%, transparent 100%);
      transform:translateX(-240%) skewX(-16deg); opacity:0;
    }
    .cd-g1::before { animation:cdGlint ${CYCLE}ms linear 700ms infinite backwards; }
    .cd-g2::before { animation:cdGlint ${CYCLE}ms linear 1180ms infinite backwards; }
    @keyframes cdGlint {
      0%{transform:translateX(-240%) skewX(-16deg);opacity:0;}
      24%{transform:translateX(-240%) skewX(-16deg);opacity:0;}
      27%{opacity:1;}
      40%{transform:translateX(380%) skewX(-16deg);opacity:1;}
      43%{transform:translateX(380%) skewX(-16deg);opacity:0;}
      100%{transform:translateX(380%) skewX(-16deg);opacity:0;}
    }
    .cd-dot::before {
      content:""; position:absolute; top:34%; left:46%; width:18%; height:32%;
      background:radial-gradient(closest-side, rgba(255,255,245,0.95), transparent 70%);
      opacity:0; transform:scale(0.4);
      animation:cdDot ${CYCLE}ms ease-out 1060ms infinite backwards;
    }
    @keyframes cdDot {
      0%,30%{opacity:0;transform:scale(0.4);}
      33%{opacity:1;transform:scale(1);}
      40%{opacity:0;transform:scale(1.3);}
      100%{opacity:0;}
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
        <div className="cd-g1" aria-hidden="true" />
        <div className="cd-g2" aria-hidden="true" />
        <div className="cd-dot" aria-hidden="true" />
      </div>
    </div>
  );
}
