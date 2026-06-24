// REFINAMENTO 4 — Cadencia variavel: a luz nao repete no mesmo intervalo. Tres
// camadas com duracoes co-primas (11s / 15s / 9s) se sobrepoem, entao o momento em
// que o sol passa nunca cai no mesmo ponto — a marca parece viva e organica, sem o
// "tique-taque" de relogio de uma passada perfeitamente regular.
const PNG = "/__mockup/images/paxter-paxter.png";
const WEBP = "/__mockup/images/paxter-paxter.webp";
const CLEAN = "/__mockup/images/paxter-paxter-clean.png";
const W = 420;

export function CadenciaVariavel() {
  const css = `
    .cv-sweep, .cv-spark, .cv-spark2 {
      position:absolute; inset:0; pointer-events:none; overflow:hidden; mix-blend-mode:screen;
      -webkit-mask-image:url(${CLEAN}); mask-image:url(${CLEAN});
      -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
      -webkit-mask-size:contain; mask-size:contain;
      -webkit-mask-position:center; mask-position:center;
    }
    .cv-sweep::before {
      content:""; position:absolute; top:-30%; bottom:-30%; left:0; width:54%;
      background:linear-gradient(100deg, transparent 0%, rgba(255,231,150,0.32) 38%,
        rgba(255,247,214,0.92) 50%, rgba(255,231,150,0.32) 62%, transparent 100%);
      transform:translateX(-180%) skewX(-14deg); opacity:0;
      animation:cvSweep 15000ms cubic-bezier(.45,0,.55,1) 600ms infinite backwards;
    }
    @keyframes cvSweep {
      0%{transform:translateX(-180%) skewX(-14deg);opacity:0;}
      20%{transform:translateX(-180%) skewX(-14deg);opacity:0;}
      24%{opacity:1;}
      37%{transform:translateX(320%) skewX(-14deg);opacity:1;}
      40%{transform:translateX(320%) skewX(-14deg);opacity:0;}
      100%{transform:translateX(320%) skewX(-14deg);opacity:0;}
    }
    .cv-spark::before {
      content:""; position:absolute; top:-30%; bottom:-30%; left:0; width:12%;
      background:linear-gradient(100deg, transparent 0%, rgba(255,253,235,0.95) 50%, transparent 100%);
      transform:translateX(-220%) skewX(-14deg); opacity:0;
      animation:cvSpark 11000ms linear 300ms infinite backwards;
    }
    @keyframes cvSpark {
      0%{transform:translateX(-220%) skewX(-14deg);opacity:0;}
      4%{transform:translateX(-220%) skewX(-14deg);opacity:0;}
      8%{opacity:1;}
      22%{transform:translateX(360%) skewX(-14deg);opacity:1;}
      25%{transform:translateX(360%) skewX(-14deg);opacity:0;}
      100%{transform:translateX(360%) skewX(-14deg);opacity:0;}
    }
    .cv-spark2::before {
      content:""; position:absolute; top:-30%; bottom:-30%; left:0; width:8%;
      background:linear-gradient(100deg, transparent 0%, rgba(255,250,225,0.9) 50%, transparent 100%);
      transform:translateX(-260%) skewX(-14deg); opacity:0;
      animation:cvSpark2 9000ms linear 1200ms infinite backwards;
    }
    @keyframes cvSpark2 {
      0%{transform:translateX(-260%) skewX(-14deg);opacity:0;}
      48%{transform:translateX(-260%) skewX(-14deg);opacity:0;}
      52%{opacity:1;}
      66%{transform:translateX(380%) skewX(-14deg);opacity:1;}
      69%{transform:translateX(380%) skewX(-14deg);opacity:0;}
      100%{transform:translateX(380%) skewX(-14deg);opacity:0;}
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
        <div className="cv-spark" aria-hidden="true" />
        <div className="cv-spark2" aria-hidden="true" />
        <div className="cv-sweep" aria-hidden="true" />
      </div>
    </div>
  );
}
