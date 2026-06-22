// VITRINE — 4 VARIACOES DA "ESCRITA" (a abertura que faz o simbolo surgir).
// Pedido do CEO (Dr. Caio): a escrita anterior (contorno tracado como arame)
// ficou ARTIFICIAL. Aqui estao 4 jeitos mais naturais/premium de o simbolo
// "se escrever", TODOS terminando no seu simbolo 3D em ouro real.
//   1) Pincel de Luz   — uma luz dourada diagonal pinta o metal aparecendo.
//   2) Cortina de Luz  — revelacao vertical, da esquerda para a direita.
//   3) Materializar    — o simbolo surge de um brilho/desfoque (sem tracado).
//   4) Contorno Assenta— desenha o contorno suave e funde no 3D real.
// Recarregue a pagina para rever as aberturas.

import { useId } from "react";
import SYMBOL_PNG from "../../../assets/paxter-symbol-cut.png";
import { TRACE_FLASH_STYLE, PaxterSymbolWriting } from "../_shared/traceFlash";
import { PAXTER_SYMBOL_VIEWBOX } from "../_shared/paxterSymbolPath";

const W = PAXTER_SYMBOL_VIEWBOX.w;
const H = PAXTER_SYMBOL_VIEWBOX.h;

const LOCAL = `
  /* halo dourado — alto relevo (sobressalente) sobre o fundo escuro */
  .ve-halo { mix-blend-mode: screen; filter: blur(3px);
    background: radial-gradient(circle, rgba(255,201,112,0.30), rgba(255,201,112,0.10) 45%, transparent 68%); }

  /* 1+2) revelacao por cortina (mascara que avanca) + borda de luz que lidera */
  @keyframes veWipe { from { transform: translateX(${-W - 24}px); } to { transform: translateX(0); } }
  @keyframes veEdgeFade { 0%,78% { opacity: 1; } 100% { opacity: 0; } }
  .ve-wipe { animation: veWipe var(--ve, 2000ms) cubic-bezier(.5,0,.18,1) forwards; }
  .ve-edge { animation: veWipe var(--ve, 2000ms) cubic-bezier(.5,0,.18,1) forwards,
                        veEdgeFade var(--ve, 2000ms) ease forwards; }

  /* 3) materializar — surge de brilho/desfoque */
  @keyframes veMat {
    0%   { opacity: 0; filter: blur(16px) brightness(1.7); transform: scale(.88); }
    55%  { opacity: 1; filter: blur(0) brightness(1.18); transform: scale(1.02); }
    100% { opacity: 1; filter: blur(0) brightness(1.06); transform: scale(1); }
  }
  .ve-mat { animation: veMat 2100ms cubic-bezier(.2,.7,.2,1) forwards; }
  @keyframes veBloom { 0% { opacity: 0; } 42% { opacity: .95; } 100% { opacity: .4; } }
  .ve-bloom { animation: veBloom 2100ms ease forwards; }

  /* 4) contorno suave assenta no 3D real */
  @keyframes vePenOut { 0%,58% { opacity: 1; } 82%,100% { opacity: 0; } }
  @keyframes vePngIn  { 0%,58% { opacity: 0; } 84%,100% { opacity: 1; } }
  .ve-pen { animation: vePenOut 2600ms ease forwards; }
  .ve-png { animation: vePngIn 2600ms ease forwards; }

  @media (prefers-reduced-motion: reduce) {
    .ve-wipe, .ve-edge, .ve-mat, .ve-bloom, .ve-png { animation: none; opacity: 1; transform: none; filter: none; }
    .ve-pen { display: none; }
  }
`;

// Revelacao por cortina (usada em 1 e 2). skew = angulo da cortina; ms = duracao.
function RevealWipe({ skew, ms }: { skew: number; ms: number }) {
  const uid = useId().replace(/:/g, "");
  const maskId = `vw-${uid}`;
  const glow = `vg-${uid}`;
  return (
    <svg
      width={150}
      height={150 * (H / W)}
      viewBox={`0 0 ${W} ${H}`}
      className="absolute"
      style={{ mixBlendMode: "screen" }}
      aria-hidden="true"
    >
      <defs>
        <mask id={maskId}>
          <g transform={`skewX(${skew})`}>
            <g className="ve-wipe" style={{ ["--ve" as string]: `${ms}ms` }}>
              <rect x={0} y={-60} width={W} height={H + 120} fill="#fff" />
            </g>
          </g>
        </mask>
        <linearGradient id={`eg-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffcf6e" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff3cf" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#ffcf6e" stopOpacity="0" />
        </linearGradient>
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* o metal 3D real, revelado pela cortina */}
      <image href={SYMBOL_PNG} x={0} y={0} width={W} height={H} mask={`url(#${maskId})`} preserveAspectRatio="xMidYMid meet" />

      {/* borda de luz dourada que lidera a revelacao (o "pincel") */}
      <g transform={`skewX(${skew})`}>
        <g className="ve-edge" style={{ ["--ve" as string]: `${ms}ms` }}>
          <rect x={W - 14} y={-60} width={26} height={H + 120} fill={`url(#eg-${uid})`} filter={`url(#${glow})`} />
        </g>
      </g>
    </svg>
  );
}

type Variante = { n: number; nome: string; desc: string; render: () => React.ReactNode };

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 176, height: 176 }}>
      <div className="ve-halo absolute" style={{ width: 176, height: 176 }} />
      {children}
    </div>
  );
}

const IMG_STYLE: React.CSSProperties = {
  width: 150, height: 150, objectFit: "contain",
  mixBlendMode: "screen", filter: "contrast(1.12) saturate(1.18) brightness(1.06)",
};

const VARIANTES: Variante[] = [
  {
    n: 1,
    nome: "Pincel de Luz",
    desc: "Uma luz dourada diagonal pinta o metal, que vai aparecendo atrás dela. Premium, sem arame.",
    render: () => <RevealWipe skew={-18} ms={2000} />,
  },
  {
    n: 2,
    nome: "Cortina de Luz",
    desc: "Revelação reta, da esquerda para a direita, com borda de luz liderando. Limpa e elegante.",
    render: () => <RevealWipe skew={0} ms={1900} />,
  },
  {
    n: 3,
    nome: "Materializar",
    desc: "O símbolo surge de um brilho desfocado e assenta nítido. Sem traçado nenhum.",
    render: () => (
      <>
        <div
          className="ve-bloom absolute"
          style={{
            width: 176, height: 176, mixBlendMode: "screen", filter: "blur(10px)",
            background: "radial-gradient(circle, rgba(255,221,150,0.85), rgba(255,201,112,0.25) 50%, transparent 72%)",
          }}
        />
        <img src={SYMBOL_PNG} alt="Paxter 3D" className="ve-mat absolute" style={IMG_STYLE} />
      </>
    ),
  },
  {
    n: 4,
    nome: "Contorno Assenta",
    desc: "Desenha o contorno suave e logo funde no 3D real. O traçado é breve e vira metal.",
    render: () => (
      <>
        <img src={SYMBOL_PNG} alt="Paxter 3D" className="ve-png absolute" style={IMG_STYLE} />
        <div className="ve-pen absolute inset-0 flex items-center justify-center">
          <PaxterSymbolWriting size={150} width={5} drawMs={2000} flashMs={9000} />
        </div>
      </>
    ),
  },
];

function Card({ v }: { v: Variante }) {
  return (
    <section className="w-full max-w-sm rounded-2xl border-2 border-emerald-400/55 bg-gradient-to-b from-[#10233f] to-[#070f22] p-6 flex flex-col items-center gap-3 shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-7 h-7 rounded-md bg-emerald-400 text-[#072018] text-sm font-extrabold">{v.n}</span>
        <span className="text-[12px] uppercase tracking-[0.16em] text-emerald-300 font-bold">{v.nome}</span>
      </div>
      <Stage>{v.render()}</Stage>
      <span className="text-[10px] uppercase tracking-[0.28em] text-[#d8b765] font-bold">PAXTER</span>
      <span className="text-[10px] text-center leading-relaxed text-slate-300">{v.desc}</span>
    </section>
  );
}

export default function VariacoesEscrita() {
  return (
    <div
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      className="min-h-screen w-full bg-[#070d1c] text-slate-100 flex flex-col items-center gap-7 py-10 px-5"
    >
      <style>{TRACE_FLASH_STYLE + LOCAL}</style>

      <div className="text-center">
        <h1 className="text-sm font-bold tracking-[0.26em] text-[#d8b765] uppercase">4 Variações da Escrita</h1>
        <p className="text-[11px] text-slate-400 mt-2 max-w-xs">
          Jeitos mais naturais de o símbolo surgir, sem aquele arame artificial. Todos terminam no seu 3D em ouro. Recarregue para rever. Escolha 1, 2, 3 ou 4.
        </p>
      </div>

      {VARIANTES.map((v) => (
        <Card key={v.n} v={v} />
      ))}
    </div>
  );
}
