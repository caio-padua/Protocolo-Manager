// ENTREGA 13 — Engine de VARIACOES PAXTER.
// 4 eixos numerados para o CEO bater o martelo por numero:
//   S = Simbolo (quadradinho)   1..5
//   F = Frase em ingles (tagline) 1..5
//   B = Botao 3D (neon/hover)   1..5
//   L = Layout da telinha        1..5
// O simbolo S2..S5 e RECRIADO em SVG (monograma "Rx" — o classico simbolo de
// receita medica, ouro polido com relevo ALTO), sem depender do PNG. S1 mantem
// o PNG atual para comparacao fiel.

import { useEffect, useId, useState, type ReactNode } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  AlertTriangle,
  HelpCircle,
  HeartPulse,
  Check,
  Star,
  User,
  Syringe,
  Sparkles,
  MapPin,
  Stethoscope,
} from "lucide-react";
import SYMBOL_PNG from "../../../assets/paxter-symbol-cut.png";
import { PAXTER_STYLE } from "./paxter3d";

/* ------------------------------------------------------------------ */
/* CSS extra das variacoes (botoes B1..B5, frases, layouts, estados)   */
/* ------------------------------------------------------------------ */
export const VARIANT_STYLE = `
  /* ---------- BOTOES 3D (eixo B) ---------- */
  .pbtn { transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .25s ease; }
  /* B1 — Premium preto + Glass Lift no hover */
  .pbtn-1 { background:linear-gradient(180deg,#1a1a1a,#000); border:1px solid rgba(194,160,90,.8);
    box-shadow: inset 0 2px 1px rgba(244,226,168,.3), inset 0 -4px 8px rgba(0,0,0,.8), 0 12px 24px rgba(0,0,0,.6); }
  .pbtn-1:hover { transform:translateY(-2px); box-shadow: inset 0 2px 1px rgba(244,226,168,.4), 0 16px 30px rgba(0,0,0,.6), 0 0 22px rgba(194,160,90,.28); }
  .pbtn-1:active { transform:translateY(1px); }
  /* B2 — Boton ouro macico polido */
  .pbtn-2 { background:linear-gradient(180deg,#fbeec2 0%,#d9b768 45%,#a9863c 100%); border:1px solid #8a6d2f;
    box-shadow: inset 0 2px 0 rgba(255,252,235,.75), inset 0 -3px 6px rgba(120,90,30,.5), 0 10px 22px rgba(0,0,0,.45); }
  .pbtn-2:hover { transform:translateY(-2px); box-shadow: inset 0 2px 0 rgba(255,252,235,.85), 0 14px 26px rgba(0,0,0,.5), 0 0 22px rgba(244,226,168,.55); }
  .pbtn-2:active { transform:translateY(1px); }
  /* B3 — Neon ciano (Luxury Glow) */
  .pbtn-3 { background:linear-gradient(180deg,#0f2740,#0a1b30); border:1px solid rgba(69,184,204,.7);
    box-shadow: inset 0 1px 0 rgba(120,220,240,.25), 0 0 18px rgba(69,184,204,.22); }
  .pbtn-3:hover { transform:translateY(-2px); border-color:#45B8CC; box-shadow: 0 0 28px rgba(69,184,204,.55), inset 0 0 12px rgba(69,184,204,.25); }
  .pbtn-3:active { transform:translateY(1px); }
  /* B4 — Concavo (well) discreto premium */
  .pbtn-4 { background: rgba(0,0,0,.32); border:1px solid rgba(255,255,255,.05); border-bottom:1px solid rgba(255,255,255,.08);
    box-shadow: inset 0 2px 12px rgba(0,0,0,.6); }
  .pbtn-4:hover { box-shadow: inset 0 2px 12px rgba(0,0,0,.6), 0 0 16px rgba(194,160,90,.2); }
  .pbtn-4:active { transform:translateY(1px); }
  /* B5 — Estado vivo (Urgent Pulse, ambar) */
  .pbtn-5 { background:linear-gradient(180deg,#3a2a12,#241708); border:1px solid rgba(245,196,81,.6);
    box-shadow: inset 0 1px 0 rgba(255,225,150,.25), 0 0 18px rgba(245,196,81,.22); animation: urgentPulse 2.4s ease-in-out infinite; }
  .pbtn-5:hover { transform:translateY(-2px); }
  .pbtn-5:active { transform:translateY(1px); }

  /* ---------- LINGUAGEM DE ESTADO (Dr. Claude) ---------- */
  @media (hover:hover) and (pointer:fine) {
    .sl-hover { transition: transform .25s ease, box-shadow .25s ease; }
    .sl-hover:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(0,0,0,.55), 0 0 22px rgba(194,160,90,.20); }
  }
  .sl-attention { border-color: rgba(194,160,90,.7) !important;
    box-shadow: 0 0 0 1px rgba(194,160,90,.35), 0 10px 26px rgba(0,0,0,.5), 0 0 20px rgba(194,160,90,.18) !important; }
  .sl-beacon { position: relative; }
  .sl-beacon::before { content:""; position:absolute; left:0; top:10px; bottom:10px; width:4px; border-radius:4px;
    background:linear-gradient(180deg,#f5c451,#b5791f); box-shadow:0 0 10px rgba(245,196,81,.6); }
  .sl-beacon-red::before { background:linear-gradient(180deg,#f87171,#991b1b); box-shadow:0 0 10px rgba(248,113,113,.6); }
  @keyframes urgentPulse { 0%,100%{ box-shadow:0 0 0 0 rgba(248,113,113,0);} 50%{ box-shadow:0 0 18px 2px rgba(248,113,113,.45);} }
  .sl-urgent { animation: urgentPulse 1.8s ease-in-out infinite; border-color: rgba(248,113,113,.5) !important; }

  /* ---------- FRASE (eixo F) ---------- */
  /* F2 — placa ouro chanfrada com brilho a cada 15s por ~1,5s */
  .fplate { position:relative; display:inline-flex; align-items:center; justify-content:center; padding:5px 12px;
    background:linear-gradient(180deg,#1b2a45,#0b1729); border:1px solid rgba(194,160,90,.55);
    box-shadow: inset 0 1px 0 rgba(244,226,168,.28), inset 0 -3px 6px rgba(0,0,0,.6), 0 6px 14px rgba(0,0,0,.5);
    clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px);
    overflow:hidden; }
  .fplate-word { font-weight:700; letter-spacing:.2em; font-size:9px; line-height:1;
    background:linear-gradient(180deg,#f8ecbf 0%,#d8b765 40%,#a07d34 70%,#f1dd9a 100%);
    -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
    filter: drop-shadow(0 1px 0 rgba(0,0,0,.55)); text-transform:uppercase; }
  .fglint-long { position:absolute; inset:0; pointer-events:none; }
  .fglint-long::before { content:""; position:absolute; top:-20%; bottom:-20%; left:0; width:45%;
    background:linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,252,235,.0) 30%, rgba(255,252,235,.85) 50%, rgba(255,250,228,.0) 70%, rgba(255,255,255,0) 100%);
    transform: translateX(-220%) skewX(-18deg); animation: paxterGlintLong 15s ease-in-out infinite; mix-blend-mode: screen; }
  /* travessia de ~1,5s (10% de 15s) e repouso ate o proximo ciclo */
  @keyframes paxterGlintLong { 0%{transform:translateX(-220%) skewX(-18deg);} 10%{transform:translateX(320%) skewX(-18deg);} 100%{transform:translateX(320%) skewX(-18deg);} }
  .frule { display:inline-flex; align-items:center; gap:8px; }
  .frule::before, .frule::after { content:""; width:18px; height:1px; background:linear-gradient(90deg, transparent, #c2a05a, transparent); }

  /* ---------- SIMBOLO (eixo S) ---------- */
  .sym-plate { position:relative; display:flex; align-items:center; justify-content:center;
    background:linear-gradient(135deg,#6f5421 0%,#f6e6a8 16%,#c9a24e 38%,#8a6d2f 56%,#f1dd9a 76%,#927235 100%);
    padding:3px; box-shadow:0 14px 30px rgba(0,0,0,.6), 0 0 24px rgba(194,160,90,.30); }
  .sym-plate-inner { background:linear-gradient(180deg,#0e1b34,#070f22); display:flex; align-items:center; justify-content:center; }
  .sym-seal { border-radius:9999px; }
  .sym-neon { box-shadow: 0 0 0 2px rgba(69,184,204,.55), 0 0 22px rgba(69,184,204,.45); border-radius:16px; }
  .sym-well { background: rgba(0,0,0,.45); box-shadow: inset 0 3px 14px rgba(0,0,0,.75); border:1px solid rgba(255,255,255,.05); border-radius:16px; }

  /* ---------- LAYOUT (eixo L) ---------- */
  .lay-band { background: linear-gradient(180deg,#16294a 0%,#0c1c38 100%); border-bottom:1px solid rgba(194,160,90,.25);
    box-shadow: 0 10px 26px rgba(0,0,0,.45); }
  .lay-sheet { background: linear-gradient(180deg,#0f1c36 0%,#0b1730 100%); border-top-left-radius:22px; border-top-right-radius:22px;
    box-shadow: 0 -8px 26px rgba(0,0,0,.4); }
  .hairline { border-bottom:1px solid rgba(255,255,255,.08); }

  /* ---------- acessibilidade: respeitar quem prefere menos movimento ---------- */
  @media (prefers-reduced-motion: reduce) {
    .aura-pulse, .paxter-glint::before, .fglint-long::before, .pbtn-5, .sl-urgent, .tagline-anim, .anim-enter { animation: none !important; }
    .anim-enter, .tagline-anim { opacity: 1 !important; transform: none !important; }
  }
`;

/* ------------------------------------------------------------------ */
/* SIMBOLO recriado por vetor — monograma "Rx" em ouro, relevo ALTO    */
/* ------------------------------------------------------------------ */
function RxMark({ size = 60 }: { size?: number }) {
  // ID unico por instancia (evita colisao de gradiente entre varios RxMark).
  const gid = `pxGold${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff3cf" />
          <stop offset="42%" stopColor="#dcbb6a" />
          <stop offset="72%" stopColor="#9c7a32" />
          <stop offset="100%" stopColor="#f2dea0" />
        </linearGradient>
      </defs>
      {/* relevo: sombra projetada para baixo (altura do alto-relevo) */}
      <text x="62" y="88" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight={700} fontSize={94} fill="rgba(0,0,0,0.6)">Rx</text>
      <text x="61" y="86" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight={700} fontSize={94} fill="rgba(0,0,0,0.4)">Rx</text>
      {/* face dourada */}
      <text x="60" y="84" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight={700} fontSize={94} fill={`url(#${gid})`}>Rx</text>
      {/* brilho de topo (chanfro de luz) */}
      <text x="60" y="83" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight={700} fontSize={94} fill="rgba(255,250,228,0.28)">Rx</text>
    </svg>
  );
}

function Aura({ size = 56 }: { size?: number }) {
  return (
    <div
      className="aura-pulse absolute inset-0"
      style={{ background: "radial-gradient(circle, rgba(244,226,168,0.40) 0%, transparent 65%)", filter: "blur(7px)" }}
      aria-hidden="true"
    />
  );
}

/** Simbolo por eixo S (1..5). */
export function PaxterSymbol({ n, size = 56 }: { n: number; size?: number }) {
  if (n === 1) {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <Aura />
        <img src={SYMBOL_PNG} alt="Paxter" className="relative w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]" />
      </div>
    );
  }
  if (n === 2) {
    // Placa quadrada chanfrada, relevo alto
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <Aura />
        <div className="sym-plate relative" style={{ width: size, height: size, borderRadius: 14 }}>
          <div className="sym-plate-inner" style={{ width: "100%", height: "100%", borderRadius: 11 }}>
            <RxMark size={size * 0.74} />
          </div>
        </div>
      </div>
    );
  }
  if (n === 3) {
    // Selo (sceau) redondo de ouro escovado
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <Aura />
        <div className="sym-plate sym-seal relative" style={{ width: size, height: size }}>
          <div className="sym-plate-inner sym-seal" style={{ width: "100%", height: "100%" }}>
            <RxMark size={size * 0.7} />
          </div>
        </div>
      </div>
    );
  }
  if (n === 4) {
    // Anel neon ciano + ouro
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <div className="sym-neon relative flex items-center justify-center" style={{ width: size, height: size, background: "linear-gradient(180deg,#0e1b34,#070f22)" }}>
          <RxMark size={size * 0.74} />
        </div>
      </div>
    );
  }
  // n === 5 — gravado em poco concavo (intaglio)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="sym-well relative flex items-center justify-center" style={{ width: size, height: size }}>
        <RxMark size={size * 0.72} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FRASE (tagline em ingles) por eixo F (1..5)                         */
/* ------------------------------------------------------------------ */
export function PaxterTagline({ n }: { n: number }) {
  const TXT = "Clinical Intelligence System";
  if (n === 1) {
    return <p className="text-[10px] uppercase tracking-[0.2em] text-[#45B8CC] font-medium tagline-anim">{TXT}</p>;
  }
  if (n === 2) {
    return (
      <div className="fplate tagline-anim mt-0.5">
        <span className="fplate-word">{TXT}</span>
        <span className="fglint-long" aria-hidden="true" />
      </div>
    );
  }
  if (n === 3) {
    return <p className="font-serif italic text-[12px] text-gold tracking-wide tagline-anim">{TXT}</p>;
  }
  if (n === 4) {
    return (
      <span className="frule tagline-anim">
        <span className="text-[9px] uppercase tracking-[0.26em] text-gold font-semibold">{TXT}</span>
      </span>
    );
  }
  // n === 5 — gravado (engraved)
  return (
    <p
      className="text-[10px] uppercase tracking-[0.24em] font-semibold tagline-anim"
      style={{ color: "#9fb4cc", textShadow: "0 1px 0 rgba(255,255,255,0.06), 0 -1px 1px rgba(0,0,0,0.7)" }}
    >
      {TXT}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* BOTAO (eixo B) — classe + cor do texto                              */
/* ------------------------------------------------------------------ */
export function btnClass(b: number): string {
  return ["", "pbtn pbtn-1", "pbtn pbtn-2", "pbtn pbtn-3", "pbtn pbtn-4", "pbtn pbtn-5"][b] ?? "pbtn pbtn-1";
}
export function btnText(b: number): string {
  // cor do rotulo do botao primario conforme o tipo
  return ["", "text-gold", "text-[#1a1330]", "text-[#9fe9f6]", "text-gold", "text-[#f8d68a]"][b] ?? "text-gold";
}

/* ------------------------------------------------------------------ */
/* SELO da variacao (badge numerado no topo)                          */
/* ------------------------------------------------------------------ */
function VariantBadge({ titulo, s, f, b, l }: { titulo: string; s: number; f: number; b: number; l: number }) {
  return (
    <div className="relative z-30 flex items-center justify-between px-4 py-2 bg-black/40 border-b border-[#c2a05a]/30 backdrop-blur-sm">
      <span className="text-[11px] font-bold tracking-wider text-gold uppercase">{titulo}</span>
      <span className="text-[10px] font-semibold tracking-wider text-slate-300">
        S{s} · F{f} · B{b} · L{l}
      </span>
    </div>
  );
}

type Axes = { s: number; f: number; b: number; l: number };

function LayoutCfg(l: number) {
  return {
    headerAlign: l === 2 ? "left" : "center",
    band: l === 5,
    editorial: l === 3,
    single: l === 4,
    gap: l === 2 ? "gap-3" : l === 3 ? "gap-6" : "gap-5",
    headerPad: l === 2 ? "pt-5 pb-3" : "pt-8 pb-4",
  };
}

/* Bloco que se adapta ao layout (painel 3D | hairline editorial | segmento) */
function Block({ l, children, className = "" }: { l: number; children: ReactNode; className?: string }) {
  const cfg = LayoutCfg(l);
  if (cfg.editorial) return <div className={`py-4 hairline ${className}`}>{children}</div>;
  if (cfg.single) return <div className={`px-1 py-4 hairline last:border-b-0 ${className}`}>{children}</div>;
  return <div className={`panel-3d p-5 ${className}`}>{children}</div>;
}

function Header({ s, f, l }: { s: number; f: number; l: number }) {
  const cfg = LayoutCfg(l);
  const symSize = l === 2 ? 44 : 58;
  if (cfg.headerAlign === "left") {
    return (
      <header className={`relative z-10 ${cfg.headerPad} px-6 flex items-center gap-3 ${cfg.band ? "lay-band" : ""}`}>
        <PaxterSymbol n={s} size={symSize} />
        <div className="flex flex-col">
          <h1 className="text-base font-bold tracking-[0.22em] text-gold leading-none">PAXTER</h1>
          <div className="mt-1">
            <PaxterTagline n={f} />
          </div>
        </div>
      </header>
    );
  }
  return (
    <header className={`relative z-10 ${cfg.headerPad} px-6 flex flex-col items-center ${cfg.band ? "lay-band" : ""}`}>
      <div className="mb-2">
        <PaxterSymbol n={s} size={symSize} />
      </div>
      <h1 className="text-lg font-bold tracking-[0.25em] text-gold mb-1">PAXTER</h1>
      <PaxterTagline n={f} />
    </header>
  );
}

function Footer() {
  return (
    <footer className="px-6 pb-6 pt-2">
      <div className="flex items-end justify-between border-t border-white/5 pt-4">
        <div className="flex flex-col">
          <span className="font-serif text-[14px] text-slate-200 tracking-wide">Instituto Pádua</span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-slate-500 mt-0.5">Atendimento clínico</span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-[8px] uppercase tracking-[0.22em] text-slate-500">Powered by</span>
          <div className="paxter-plate">
            <span className="paxter-word">PAXTER</span>
            <span className="paxter-glint" aria-hidden="true" />
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ================================================================== */
/* SHELL — ANAMNESE                                                     */
/* ================================================================== */
const TOTAL = 8;
const ATUAL = 3;

export function AnamneseShell({ s, f, b, l }: Axes) {
  const [mounted, setMounted] = useState(false);
  const [aberto, setAberto] = useState(true);
  const [sono, setSono] = useState("");
  const [estresse, setEstresse] = useState(6);
  const [atividade, setAtividade] = useState("");
  useEffect(() => setMounted(true), []);
  const cfg = LayoutCfg(l);

  const corpo = (
    <main className={`relative z-10 flex flex-col ${cfg.gap} px-6 pt-5 ${cfg.band ? "lay-sheet pb-4 -mt-1" : ""}`}>
      <div className="flex items-center gap-3 anim-enter">
        <div className="w-10 h-10 rounded-xl concave-3d flex items-center justify-center shrink-0">
          <HeartPulse className="w-5 h-5 text-[#45B8CC]" />
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-wide text-slate-100 uppercase">Sistema Cardiovascular</h2>
          <p className="text-xs text-slate-400">Bloco 3 de 8</p>
        </div>
      </div>

      <div className={cfg.single ? "panel-3d p-4 flex flex-col" : "contents"}>
        <Block l={l} className="anim-enter anim-delay-1 flex flex-col gap-4">
          <p className="text-[15px] text-slate-200 leading-snug">Você tem alguma queixa relacionada a este sistema?</p>
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Tem queixa neste sistema?">
            <button onClick={() => setAberto(false)} data-active={!aberto} aria-pressed={!aberto} className="chip-3d py-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-300 data-[active=true]:text-gold">
              <Minus className="w-4 h-4" /> Não, nenhuma
            </button>
            <button onClick={() => setAberto(true)} data-active={aberto} aria-pressed={aberto} className="chip-3d py-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-300 data-[active=true]:text-gold">
              <Plus className="w-4 h-4" /> Sim, tenho
            </button>
          </div>
        </Block>

        {aberto && (
          <>
            <Block l={l} className="anim-enter flex flex-col gap-3">
              <p className="text-[15px] text-slate-200 leading-snug">Pratica atividade física regularmente?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Frequência de atividade física">
                {["Não", "1–2x semana", "3–4x semana", "5x ou mais"].map((op) => (
                  <button key={op} onClick={() => setAtividade(op)} data-active={atividade === op} aria-pressed={atividade === op} className="chip-3d px-4 py-2 text-sm font-medium text-slate-300 data-[active=true]:text-gold flex items-center gap-1.5">
                    {atividade === op && <Check className="w-3.5 h-3.5" />} {op}
                  </button>
                ))}
              </div>
              <button className="self-start inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#45B8CC] mt-1">
                <HelpCircle className="w-3.5 h-3.5" /> Ver explicação
              </button>
            </Block>

            <Block l={l} className="anim-enter flex flex-col gap-3">
              <p className="text-[15px] text-slate-200 leading-snug">Como está a qualidade do seu sono?</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Qualidade do sono">
                {["Ótima", "Boa", "Regular", "Ruim"].map((op) => (
                  <button key={op} onClick={() => setSono(op)} data-active={sono === op} aria-pressed={sono === op} className="chip-3d py-2.5 text-sm font-medium text-slate-300 data-[active=true]:text-gold text-center">
                    {op}
                  </button>
                ))}
              </div>
            </Block>

            <Block l={l} className="anim-enter flex flex-col gap-3">
              <p className="text-[15px] text-slate-200 leading-snug">Qual seu nível de estresse ultimamente?</p>
              <div className="concave-3d p-3">
                <div className="flex gap-1.5">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <button key={i} onClick={() => setEstresse(i)} aria-label={`Nível ${i}`} className={`h-8 flex-1 rounded ${i <= estresse ? "bar-on" : "bar-off"}`} />
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-[10px] uppercase tracking-wider text-slate-500">
                  <span>Ausente</span>
                  <span className="text-gold font-bold">{estresse}</span>
                  <span>Grave</span>
                </div>
              </div>
            </Block>
          </>
        )}

        <Block l={l} className="anim-enter flex flex-col gap-3 border border-red-500/30 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="alarm-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-red-200">
              <AlertTriangle className="w-3.5 h-3.5" /> Sinal de Alarme
            </span>
          </div>
          <p className="text-[15px] text-slate-100 leading-snug">Possui histórico de doenças cardiovasculares (infarto, arritmia, pressão alta)?</p>
          <div className="grid grid-cols-2 gap-3">
            <button className="chip-3d py-3 text-sm font-semibold text-slate-300 text-center">Não</button>
            <button className="chip-3d py-3 text-sm font-semibold text-red-200 text-center border border-red-500/40">Sim</button>
          </div>
        </Block>
      </div>

      <Footer />
    </main>
  );

  return (
    <div className="relative min-h-[100dvh] w-full max-w-[430px] mx-auto bg-[#0d1830] text-slate-200 overflow-x-hidden flex flex-col font-sans selection:bg-[#c2a05a]/30 pb-28">
      <style>{PAXTER_STYLE}{VARIANT_STYLE}</style>
      <div className="paxter-bg absolute inset-0 z-0 pointer-events-none" />
      <VariantBadge titulo="Anamnese" s={s} f={f} b={b} l={l} />
      <Header s={s} f={f} l={l} />

      <div className="sticky top-0 z-20 px-6 py-3 bg-[#0b1426]/90 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Etapa {ATUAL} de {TOTAL}</span>
          <span className="text-[11px] text-gold font-semibold">{Math.round((ATUAL / TOTAL) * 100)}%</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < ATUAL ? "bar-on" : "bar-off"}`} />
          ))}
        </div>
      </div>

      {corpo}

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-30 px-6 py-4 bg-[#0b1426]/95 backdrop-blur-md border-t border-white/10 flex items-center gap-3">
        <button aria-label="Voltar" className="chip-3d w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
          <ChevronLeft className="w-5 h-5 text-slate-300" />
        </button>
        <button className={`${btnClass(b)} flex-1 py-3.5 rounded-xl flex items-center justify-center gap-2`}>
          <span className={`text-sm font-bold tracking-widest uppercase ${btnText(b)}`}>Continuar</span>
          <ChevronRight className={`w-4 h-4 ${btnText(b)}`} />
        </button>
      </div>

      {!mounted && <span className="sr-only">Carregando…</span>}
    </div>
  );
}

/* ================================================================== */
/* SHELL — AGENDAR                                                      */
/* ================================================================== */
type Door = { id: string; label: string; subtitle: string; badge: string; Icon: typeof User; state?: "attention" | "beacon" | "urgent" };
const DOORS: Door[] = [
  { id: "corpo", label: "Corpo Clínico", subtitle: "Profissionais e especialidades da casa.", badge: "Corpo Clínico", Icon: Stethoscope },
  { id: "injetavel", label: "Protocolos Injetáveis", subtitle: "Ficha de anamnese guiada e protocolo personalizado.", badge: "Injetáveis", Icon: Syringe, state: "attention" },
  { id: "estetico", label: "Protocolos Estéticos", subtitle: "Toxina, preenchimento e bioestimuladores.", badge: "Estética", Icon: Sparkles, state: "beacon" },
];

export function AgendarShell({ s, f, b, l }: Axes) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<string>("");
  useEffect(() => setMounted(true), []);
  const cfg = LayoutCfg(l);

  const stateClass = (st?: Door["state"]) => (st === "attention" ? "sl-attention" : st === "beacon" ? "sl-beacon" : st === "urgent" ? "sl-urgent" : "");

  return (
    <div className="relative min-h-[100dvh] w-full max-w-[430px] mx-auto bg-[#0d1830] text-slate-200 overflow-x-hidden flex flex-col font-sans selection:bg-[#c2a05a]/30 pb-10">
      <style>{PAXTER_STYLE}{VARIANT_STYLE}</style>
      <div className="paxter-bg absolute inset-0 z-0 pointer-events-none" />
      <VariantBadge titulo="Agendar" s={s} f={f} b={b} l={l} />
      <Header s={s} f={f} l={l} />

      <main className={`relative z-10 flex flex-col ${cfg.gap === "gap-3" ? "gap-5" : "gap-6"} ${cfg.band ? "lay-sheet pt-5" : "pt-2"}`}>
        <div className="px-6 anim-enter">
          <p className="font-serif italic text-lg text-gold tracking-wide text-center">Como deseja ser atendido?</p>
          <div className="mx-auto mt-2 w-16 h-px bg-gradient-to-r from-transparent via-[#c2a05a] to-transparent" />
        </div>

        <div className="px-6 anim-enter anim-delay-1">
          <div className="gold-rim">
            <button onClick={() => setActive("drcaio")} className="sl-hover w-full rounded-[16px] bg-[#0b1426] text-left p-5 flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/60 active:scale-[0.99] transition-transform">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#f4e2a8] fill-[#f4e2a8]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">Atendimento Exclusivo</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-black border-2 border-[#c2a05a] flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(194,160,90,0.35)]">
                  <User className="w-7 h-7 text-[#f4e2a8]" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-bold text-slate-100 leading-tight">Dr. Caio Henrique<br />Fernandes Pádua</div>
                  <div className="text-xs text-slate-400 mt-1">Consulta premium e protocolos avançados.</div>
                </div>
                <span className="w-8 h-8 rounded-full bg-gold/10 border border-[#c2a05a]/40 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-5 h-5 text-[#f4e2a8]" />
                </span>
              </div>
            </button>
          </div>
        </div>

        {(() => {
          // eixo L: editorial (L3) = linhas com filete, sem cartao; single (L4) = todas
          // as portas dentro de UM painel; demais = cartoes 3D individuais.
          const doorBtn = (d: Door) => {
            const base = `sl-hover ${stateClass(d.state)} p-4 flex items-center gap-4 text-left w-full outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/50`;
            if (cfg.editorial) return `${base} hairline`;
            if (cfg.single) return `${base} hairline last:border-b-0`;
            return `panel-3d ${base} active:scale-[0.99] transition-transform rounded-2xl`;
          };
          const items = DOORS.map((d) => (
            <button
              key={d.id}
              onClick={() => setActive(d.id)}
              data-active={active === d.id}
              aria-pressed={active === d.id}
              className={doorBtn(d)}
            >
              <div className="w-12 h-12 rounded-xl concave-3d flex items-center justify-center shrink-0">
                <d.Icon className="w-6 h-6 text-[#45B8CC]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold border border-[#c2a05a]/40 rounded px-1.5 py-0.5">{d.badge}</span>
                  {d.state === "attention" && <span className="text-[9px] font-semibold uppercase tracking-wider text-[#f5c451]">Atenção</span>}
                </div>
                <div className="text-[15px] font-semibold text-slate-100 mt-1.5 leading-tight">{d.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{d.subtitle}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
            </button>
          ));
          return (
            <div
              className={`px-6 anim-enter anim-delay-2 ${cfg.single ? "" : cfg.editorial ? "" : "flex flex-col gap-4"}`}
              role="group"
              aria-label="Tipos de atendimento"
            >
              {cfg.single ? (
                <div className="panel-3d px-2">{items}</div>
              ) : cfg.editorial ? (
                <div className="flex flex-col">{items}</div>
              ) : (
                items
              )}
            </div>
          );
        })()}

        <div className="px-6 anim-enter anim-delay-3">
          <div className="panel-3d p-4 flex items-start gap-4 rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-black/30 border border-slate-600 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#45B8CC]" />
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold text-slate-200">Instituto Pádua</h4>
              <p className="text-xs text-slate-400 leading-relaxed">Rua Guaxupé, 327 — Vila Formosa<br />São Paulo, SP</p>
            </div>
          </div>
        </div>

        {/* Botao primario que carrega o tipo de botao escolhido (eixo B) */}
        <div className="px-6 anim-enter anim-delay-4">
          <button className={`${btnClass(b)} w-full py-3.5 rounded-xl flex items-center justify-center gap-2`}>
            <span className={`text-sm font-bold tracking-widest uppercase ${btnText(b)}`}>Continuar</span>
            <ChevronRight className={`w-4 h-4 ${btnText(b)}`} />
          </button>
        </div>

        <Footer />
      </main>

      {!mounted && <span className="sr-only">Carregando…</span>}
    </div>
  );
}
