// VITRINE — 4 VARIACOES DA "LINHA DE POLVORA" (pavio aceso correndo o contorno).
// Pedido do CEO (Dr. Caio): ele quer VER uma faisca correndo ao redor do contorno
// do simbolo, em loop continuo (como pavio/polvora acesa) — NAO uma revelacao que
// toca uma vez e congela. Aqui a faisca corre o contorno do simbolo 3D em ouro,
// para sempre. Cada variacao muda o jeito da brasa correr.
//   1) Pavio Classico   — faisca branca-quente + rastro dourado, ritmo medio.
//   2) Polvora Cintilante— faisca que pisca (cintila) + rastro, mais rapida.
//   3) Cometa Duplo     — duas faiscas correndo, defasadas, movimento rico.
//   4) Brasa Lenta      — brasa grossa e quente, lenta, halo maior.
// Recarregue a pagina se quiser, mas elas correm sozinhas em loop.

import { useId } from "react";
import SYMBOL_PNG from "../../../assets/paxter-symbol-cut.png";
import { PAXTER_SYMBOL_PATH, PAXTER_SYMBOL_VIEWBOX } from "../_shared/paxterSymbolPath";

const W = PAXTER_SYMBOL_VIEWBOX.w;
const H = PAXTER_SYMBOL_VIEWBOX.h;

const LOCAL = `
  /* halo dourado — alto relevo sobre o fundo escuro */
  .vp-halo { mix-blend-mode: screen; filter: blur(3px);
    background: radial-gradient(circle, rgba(255,201,112,0.30), rgba(255,201,112,0.10) 45%, transparent 68%); }

  /* a faisca corre o contorno: dashoffset crescente sobre caminho fechado = loop perfeito */
  @keyframes vpRun { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 100; } }
  .vp-run { animation: vpRun var(--vp, 3200ms) linear infinite; }

  /* cintilacao (pisca) da cabeca da faisca */
  @keyframes vpFlick { 0%,100% { opacity: 1; } 45% { opacity: .5; } 70% { opacity: .92; } }
  .vp-flick { animation: vpFlick 200ms steps(2,end) infinite; }

  @media (prefers-reduced-motion: reduce) {
    .vp-run { animation: none; opacity: 0; }
  }
`;

type CometProps = {
  ms: number;
  delayMs?: number;
  headColor: string;
  midColor: string;
  tailColor: string;
  hw: number;
  mw: number;
  tw: number;
  tailLen: number;
  sparkle?: boolean;
  glow: string;
  glowBig: string;
};

// Uma "faisca" = 3 camadas correndo juntas: rastro (longo/baco/borrado) atras,
// corpo dourado no meio, cabeca branca-quente na ponta.
function Comet({ ms, delayMs = 0, headColor, midColor, tailColor, hw, mw, tw, tailLen, sparkle, glow, glowBig }: CometProps) {
  const base = {
    d: PAXTER_SYMBOL_PATH,
    pathLength: 100,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "vp-run",
    style: { ["--vp" as string]: `${ms}ms`, animationDelay: `${delayMs}ms` },
  };
  return (
    <>
      <path {...base} stroke={tailColor} strokeWidth={tw} strokeDasharray={`${tailLen} 100`} opacity={0.42} filter={`url(#${glowBig})`} />
      <path {...base} stroke={midColor} strokeWidth={mw} strokeDasharray="7 100" opacity={0.9} filter={`url(#${glow})`} />
      {sparkle ? (
        <g className="vp-flick">
          <path {...base} stroke={headColor} strokeWidth={hw} strokeDasharray="2 100" filter={`url(#${glow})`} />
        </g>
      ) : (
        <path {...base} stroke={headColor} strokeWidth={hw} strokeDasharray="2 100" filter={`url(#${glow})`} />
      )}
    </>
  );
}

type Fuse = {
  n: number;
  nome: string;
  desc: string;
  ms: number;
  doubled?: boolean;
  sparkle?: boolean;
  headColor: string;
  midColor: string;
  tailColor: string;
  hw: number;
  mw: number;
  tw: number;
  tailLen: number;
};

const FUSES: Fuse[] = [
  { n: 1, nome: "Pavio Classico", desc: "Faisca branca-quente com rastro dourado correndo o contorno. Ritmo médio.", ms: 3200, headColor: "#fff6da", midColor: "#ffd479", tailColor: "#e0962f", hw: 4, mw: 5, tw: 7, tailLen: 16 },
  { n: 2, nome: "Polvora Cintilante", desc: "A cabeça pisca (cintila) como brasa viva, mais rápida. Sensação de pólvora.", ms: 2500, sparkle: true, headColor: "#fffaf0", midColor: "#ffcf6e", tailColor: "#d98a2b", hw: 4, mw: 5, tw: 8, tailLen: 18 },
  { n: 3, nome: "Cometa Duplo", desc: "Duas faíscas correndo defasadas: movimento mais rico ao redor do símbolo.", ms: 3400, doubled: true, headColor: "#fff6da", midColor: "#ffd479", tailColor: "#e0962f", hw: 3.5, mw: 4.5, tw: 6.5, tailLen: 14 },
  { n: 4, nome: "Brasa Lenta", desc: "Brasa grossa e quente, lenta, com halo maior. Mais dramática e nobre.", ms: 4600, headColor: "#fff1cf", midColor: "#ffc25c", tailColor: "#c87a22", hw: 5, mw: 6.5, tw: 10, tailLen: 22 },
];

function FuseStage({ f }: { f: Fuse }) {
  const uid = useId().replace(/:/g, "");
  const glow = `vpg-${uid}`;
  const glowBig = `vpb-${uid}`;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 176, height: 176 }}>
      <div className="vp-halo absolute" style={{ width: 176, height: 176 }} />
      {/* o metal 3D real, fixo embaixo */}
      <img
        src={SYMBOL_PNG}
        alt="Paxter 3D"
        style={{ width: 150, height: 150, objectFit: "contain", mixBlendMode: "screen", filter: "contrast(1.12) saturate(1.18) brightness(1.06)" }}
      />
      {/* a faisca correndo o contorno, por cima do metal (screen = so clareia) */}
      <svg
        width={150}
        height={150 * (H / W)}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute"
        style={{ mixBlendMode: "screen" }}
        aria-hidden="true"
      >
        <defs>
          <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={glowBig} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <Comet ms={f.ms} headColor={f.headColor} midColor={f.midColor} tailColor={f.tailColor} hw={f.hw} mw={f.mw} tw={f.tw} tailLen={f.tailLen} sparkle={f.sparkle} glow={glow} glowBig={glowBig} />
        {f.doubled && (
          <Comet ms={f.ms} delayMs={-Math.round(f.ms / 2)} headColor={f.headColor} midColor={f.midColor} tailColor={f.tailColor} hw={f.hw} mw={f.mw} tw={f.tw} tailLen={f.tailLen} sparkle={f.sparkle} glow={glow} glowBig={glowBig} />
        )}
      </svg>
    </div>
  );
}

function Card({ f }: { f: Fuse }) {
  return (
    <section className="w-full max-w-sm rounded-2xl border-2 border-emerald-400/55 bg-gradient-to-b from-[#10233f] to-[#070f22] p-6 flex flex-col items-center gap-3 shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-7 h-7 rounded-md bg-emerald-400 text-[#072018] text-sm font-extrabold">{f.n}</span>
        <span className="text-[12px] uppercase tracking-[0.16em] text-emerald-300 font-bold">{f.nome}</span>
      </div>
      <FuseStage f={f} />
      <span className="text-[10px] uppercase tracking-[0.28em] text-[#d8b765] font-bold">PAXTER</span>
      <span className="text-[10px] text-center leading-relaxed text-slate-300">{f.desc}</span>
    </section>
  );
}

export default function VariacoesPolvora() {
  return (
    <div
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      className="min-h-screen w-full bg-[#070d1c] text-slate-100 flex flex-col items-center gap-7 py-10 px-5"
    >
      <style>{LOCAL}</style>

      <div className="text-center">
        <h1 className="text-sm font-bold tracking-[0.26em] text-[#d8b765] uppercase">4 Variações da Pólvora</h1>
        <p className="text-[11px] text-slate-400 mt-2 max-w-xs">
          A faísca corre o contorno do símbolo em loop contínuo (pavio aceso). Elas se movem sozinhas. Escolha 1, 2, 3 ou 4.
        </p>
      </div>

      {FUSES.map((f) => (
        <Card key={f.n} f={f} />
      ))}
    </div>
  );
}
