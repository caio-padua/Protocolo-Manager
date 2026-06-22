// VITRINE — 4 VARIACOES do efeito de ouro sobre o simbolo Paxter 3D.
// Pedido do CEO (Dr. Caio):
//   - a FAIXA de luz (varrimento especular) ficou otima -> aumentar ~20%.
//   - a linha que CORRE pelo tracado estava forte demais -> afinar ~20%.
//   - 4 variacoes para comparar.
//   - simbolo em ouro polido 3D bem forte e em alto relevo (sobressalente).
// Todas usam o MESMO motor (PaxterGlintPremium); muda so a intensidade.
// Recarregue para reiniciar as animacoes.

import SYMBOL_PNG from "../../../assets/paxter-symbol-cut.png";
import { TRACE_FLASH_STYLE, PaxterGlintPremium } from "../_shared/traceFlash";
import { PAXTER_SYMBOL_PATH, PAXTER_SYMBOL_VIEWBOX } from "../_shared/paxterSymbolPath";

const VB = `0 0 ${PAXTER_SYMBOL_VIEWBOX.w} ${PAXTER_SYMBOL_VIEWBOX.h}`;

type Variante = {
  n: number;
  nome: string;
  desc: string;
  sweepWidth: number;
  sweepBright: number;
  sweepMs: number;
  glintWidth: number;
  flashMs: number;
};

const VARIANTES: Variante[] = [
  {
    n: 1,
    nome: "Equilíbrio",
    desc: "Faixa larga +20% e linha fina −20%. O ponto de partida do que você pediu.",
    sweepWidth: 180, sweepBright: 1.0, sweepMs: 3200, glintWidth: 7, flashMs: 3000,
  },
  {
    n: 2,
    nome: "Faixa Larga (luxo)",
    desc: "Faixa bem larga e lenta, como luz de estúdio passando devagar no ouro. Linha bem fina.",
    sweepWidth: 240, sweepBright: 0.95, sweepMs: 4200, glintWidth: 6, flashMs: 3400,
  },
  {
    n: 3,
    nome: "Reflexo Vivo",
    desc: "Faixa mais brilhante e rápida, mais vivacidade. Linha fina.",
    sweepWidth: 175, sweepBright: 1.2, sweepMs: 2600, glintWidth: 7, flashMs: 2600,
  },
  {
    n: 4,
    nome: "Lâmina de Luz",
    desc: "Faixa estreita e intensa, como uma lâmina de luz. Linha a mais fina de todas.",
    sweepWidth: 130, sweepBright: 1.25, sweepMs: 3000, glintWidth: 5, flashMs: 3000,
  },
];

function Card({ v }: { v: Variante }) {
  return (
    <section className="w-full max-w-sm rounded-2xl border-2 border-emerald-400/55 bg-gradient-to-b from-[#10233f] to-[#070f22] p-6 flex flex-col items-center gap-3 shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-7 h-7 rounded-md bg-emerald-400 text-[#072018] text-sm font-extrabold">{v.n}</span>
        <span className="text-[12px] uppercase tracking-[0.16em] text-emerald-300 font-bold">{v.nome}</span>
      </div>

      <div className="relative flex items-center justify-center" style={{ width: 176, height: 176 }}>
        {/* halo dourado — da o "alto relevo" (sobressalente) sobre o fundo escuro */}
        <div
          className="absolute"
          style={{
            width: 176, height: 176,
            background: "radial-gradient(circle, rgba(255,201,112,0.30), rgba(255,201,112,0.10) 45%, transparent 68%)",
            filter: "blur(3px)",
            mixBlendMode: "screen",
          }}
        />
        {/* simbolo 3D em ouro polido, reforcado (contraste/saturacao/brilho) */}
        <img
          src={SYMBOL_PNG}
          alt="Paxter 3D"
          className="absolute"
          style={{
            width: 152, height: 152, objectFit: "contain",
            mixBlendMode: "screen",
            filter: "contrast(1.12) saturate(1.18) brightness(1.06)",
          }}
        />
        {/* efeito de ouro: faixa especular + linha correndo pelo tracado exato */}
        <PaxterGlintPremium
          d={PAXTER_SYMBOL_PATH}
          viewBox={VB}
          size={152}
          sweepWidth={v.sweepWidth}
          sweepBright={v.sweepBright}
          sweepMs={v.sweepMs}
          glintWidth={v.glintWidth}
          flashMs={v.flashMs}
          className="absolute"
        />
      </div>

      <span className="text-[10px] uppercase tracking-[0.28em] text-[#d8b765] font-bold">PAXTER</span>
      <span className="text-[10px] text-center leading-relaxed text-slate-300">{v.desc}</span>
    </section>
  );
}

export default function QuatroVariacoes() {
  return (
    <div
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      className="min-h-screen w-full bg-[#070d1c] text-slate-100 flex flex-col items-center gap-7 py-10 px-5"
    >
      <style>{TRACE_FLASH_STYLE}</style>

      <div className="text-center">
        <h1 className="text-sm font-bold tracking-[0.26em] text-[#d8b765] uppercase">4 Variações do Brilho de Ouro</h1>
        <p className="text-[11px] text-slate-400 mt-2 max-w-xs">
          Faixa de luz +20%, linha que corre −20%, símbolo 3D em ouro mais forte. Recarregue para rever as animações. Escolha 1, 2, 3 ou 4.
        </p>
      </div>

      {VARIANTES.map((v) => (
        <Card key={v.n} v={v} />
      ))}
    </div>
  );
}
