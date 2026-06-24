// ============================================================================
// LEVA PAXTER — Anamnese (combo travado S1 · F3 · B2 · cartões soltos).
// Um shell, dois temas: "dark" (navy + ouro) e "light" (papel creme + ouro).
//   S1 = símbolo PNG real, sobre medalhão navy, com flash percorrendo o traçado.
//   F3 = tagline serif itálico dourado, com efeito de "escrita" (revela L->R).
//   B2 = botão dourado polido, 2D nítido, bevel-up forte, neon + hover.
//   L  = cartões soltos lendo como painéis bevel salientes, sombra delimitada.
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  AlertTriangle,
  Video,
  HeartPulse,
  Check,
} from "lucide-react";
import { PAXTER_STYLE } from "./paxter3d";
import { PaxterLogo } from "./PaxterLogo";

export const LEVA_STYLE = `
  /* ===== FUNDOS — "solo" UNIFORME e CHAPADO (mesmo p/ todos), p/ os painéis saltarem ===== */
  .leva-dark .leva-bg {
    background:
      radial-gradient(120% 80% at 50% -10%, rgba(70,184,204,0.07) 0%, rgba(70,184,204,0) 42%),
      linear-gradient(180deg, #0b1d38 0%, #091831 52%, #07142a 100%);
  }
  .leva-light .leva-bg {
    background:
      radial-gradient(120% 80% at 50% -10%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 46%),
      linear-gradient(180deg, #ece1c8 0%, #e6d9bd 54%, #ded0b0 100%);
  }

  /* ===== CARTÃO (Layout L): painel CLARAMENTE destacado do solo (mais contraste) ===== */
  .leva-card { border-radius: 16px; position: relative; }
  .leva-dark .leva-card {
    background: linear-gradient(180deg, #2a466f 0%, #1d3458 55%, #16294a 100%);
    border: 1px solid rgba(0,0,0,0.35); border-top-color: rgba(255,255,255,0.26);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.16),
      inset 0 -3px 10px rgba(0,0,0,0.4),
      0 9px 0 -3px rgba(0,0,0,0.5),
      0 18px 26px -10px rgba(0,0,0,0.72);
  }
  .leva-light .leva-card {
    background: linear-gradient(180deg, #ffffff 0%, #fffdf8 100%);
    border: 1px solid rgba(138,109,47,0.18); border-top-color: #ffffff;
    box-shadow:
      inset 0 1px 0 #ffffff,
      inset 0 -3px 8px rgba(138,109,47,0.08),
      0 9px 0 -3px rgba(15,28,53,0.08),
      0 18px 26px -10px rgba(15,28,53,0.30);
  }

  /* ===== POÇO CÔNCAVO ===== */
  .leva-dark .leva-well { background: rgba(0,0,0,0.32); box-shadow: inset 0 2px 12px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.04); border-radius:12px; }
  .leva-light .leva-well { background: rgba(15,28,53,0.05); box-shadow: inset 0 2px 10px rgba(15,28,53,0.18); border:1px solid rgba(15,28,53,0.06); border-radius:12px; }

  /* ===== CHIP selecionável — botão MECÂNICO nítido (pedidos 4 e 5):
     mesmo TOM da base do cartão; o relevo vem só de luz/sombra (sem salto de cor);
     ao SELECIONAR, o botão AFUNDA no painel (surpresa tátil). ===== */
  .leva-chip { border-radius: 11px; transition: transform .14s cubic-bezier(.16,1,.3,1), box-shadow .18s ease; font-weight:600; }
  .leva-chip:active { transform: translateY(2px); }
  .leva-dark .leva-chip {
    background: linear-gradient(180deg,#31507e 0%,#244067 100%);
    border:1px solid rgba(0,0,0,0.45); border-top-color: rgba(255,255,255,0.26);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -2px 4px rgba(0,0,0,0.38), 0 4px 0 -1px #112444, 0 7px 11px -5px rgba(0,0,0,0.55);
    color:#e3ebf6;
  }
  .leva-dark .leva-chip[data-active="true"] {
    background: linear-gradient(180deg,#1a3055 0%,#234063 100%);
    border-color:#c2a05a; transform: translateY(2px);
    box-shadow: inset 0 3px 7px rgba(0,0,0,0.5), inset 0 1px 1px rgba(0,0,0,0.4), 0 0 16px rgba(194,160,90,0.30);
  }
  .leva-light .leva-chip {
    background: linear-gradient(180deg,#ffffff 0%,#f3ead7 100%);
    border:1px solid rgba(138,109,47,0.30); border-top-color:#ffffff;
    box-shadow: inset 0 1px 0 #ffffff, inset 0 -2px 4px rgba(138,109,47,0.12), 0 4px 0 -1px rgba(15,28,53,0.14), 0 7px 11px -5px rgba(15,28,53,0.22);
    color:#3b4860;
  }
  .leva-light .leva-chip[data-active="true"] {
    background: linear-gradient(180deg,#efe6d2 0%,#f7f0e1 100%);
    border-color:#b9923f; transform: translateY(2px);
    box-shadow: inset 0 3px 6px rgba(138,109,47,0.30), inset 0 1px 1px rgba(138,109,47,0.18), 0 0 14px rgba(185,146,63,0.30);
  }
  .leva-dark .leva-chip[data-active="true"] .leva-chip-txt { color:#f4e2a8; }
  .leva-light .leva-chip[data-active="true"] .leva-chip-txt { color:#8a6d2f; }

  /* ===== ALARME e VÍDEO: NÃO salientes — selos EMBUTIDOS (pedido 1) ===== */
  .leva-dark .alarm-badge { background: linear-gradient(180deg,#5b1212 0%,#7f1d1d 100%); border:1px solid rgba(248,113,113,0.40); box-shadow: inset 0 2px 5px rgba(0,0,0,0.55), inset 0 -1px 0 rgba(255,255,255,0.05); }
  .leva-light .alarm-badge { background: linear-gradient(180deg,#fdecec 0%,#f7dada 100%); border:1px solid rgba(185,28,28,0.30); box-shadow: inset 0 2px 5px rgba(120,20,20,0.18); color:#9b1c1c; }
  .leva-video-link { border-radius: 9px; transition: filter .18s ease; }
  .leva-dark .leva-video-link { color:#5cc4d6; background: rgba(0,0,0,0.22); border:1px solid rgba(255,255,255,0.05); box-shadow: inset 0 1px 3px rgba(0,0,0,0.5); }
  .leva-light .leva-video-link { color:#0e7d92; background: rgba(15,28,53,0.05); border:1px solid rgba(15,28,53,0.07); box-shadow: inset 0 1px 3px rgba(15,28,53,0.14); }

  /* foco visível por teclado (anel de alto contraste, não interfere no relevo) */
  .leva-chip:focus-visible, .leva-video-link:focus-visible { outline: 2px solid #45B8CC; outline-offset: 2px; }
  .leva-light .leva-chip:focus-visible, .leva-light .leva-video-link:focus-visible { outline-color: #0e7d92; }

  /* ===== BOTÃO B2 (dourado polido, 2D nítido, bevel-up forte, neon + hover) ===== */
  .leva-btn {
    background: linear-gradient(180deg,#fbeec2 0%,#e7ca7c 36%,#cda553 66%,#a9863c 100%);
    border: 1px solid #846728; border-radius: 13px;
    box-shadow:
      inset 0 2px 0 rgba(255,253,240,0.95),
      inset 0 -3px 5px rgba(110,82,26,0.55),
      0 6px 0 -1px #7a5f29,
      0 11px 18px -7px rgba(0,0,0,0.5);
    transition: transform .16s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, filter .2s ease;
  }
  .leva-btn:hover {
    transform: translateY(-2px); filter: brightness(1.04);
    box-shadow:
      inset 0 2px 0 rgba(255,255,250,1),
      inset 0 -3px 5px rgba(110,82,26,0.5),
      0 8px 0 -1px #7a5f29,
      0 16px 26px -7px rgba(0,0,0,0.55),
      0 0 24px rgba(244,226,168,0.6);
  }
  .leva-btn:active { transform: translateY(2px); box-shadow: inset 0 3px 8px rgba(110,82,26,0.6), 0 3px 0 -1px #7a5f29; }

  /* botão secundário (voltar) */
  .leva-dark .leva-ghost { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:13px; }
  .leva-light .leva-ghost { background: rgba(15,28,53,0.04); border:1px solid rgba(15,28,53,0.12); border-radius:13px; }

  /* ===== MEDALHÃO do símbolo (navy sempre, p/ o PNG ter fundo) ===== */
  .leva-medallion { position: relative; border-radius: 18px; padding: 2px;
    background: linear-gradient(135deg,#6f5421 0%,#f6e6a8 16%,#c9a24e 38%,#8a6d2f 56%,#f1dd9a 76%,#927235 100%);
    box-shadow: 0 14px 30px rgba(0,0,0,0.45), 0 0 22px rgba(194,160,90,0.30); }
  /* cúpula de vidro perolizado que ENVOLVE a borda dourada (pedido 3).
     Brilho restrito ao ARO superior: centro e base transparentes p/ NÃO lavar o símbolo. */
  .leva-medallion::after { content:""; position:absolute; inset:0; border-radius:18px; pointer-events:none; z-index:3;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.18) 10%, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0) 32%),
      radial-gradient(80% 30% at 50% 2%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 70%);
    mix-blend-mode: screen; }
  .leva-medallion-inner { border-radius: 16px; background: linear-gradient(180deg,#102140,#070f22);
    display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; z-index:1; }

  /* ===== TAGLINE F3 com efeito de "escrita" (revela L->R) + glint ===== */
  .leva-tag { position: relative; display:inline-block; }
  @keyframes levaInk { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  .leva-tag-ink { animation: levaInk 1.7s cubic-bezier(.65,0,.35,1) .5s both; }
  .leva-tag-glint { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
  .leva-tag-glint::before { content:""; position:absolute; top:-30%; bottom:-30%; left:0; width:40%;
    background: linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,250,228,0) 35%, rgba(255,252,235,0.9) 50%, rgba(255,250,228,0) 65%, rgba(255,255,255,0) 100%);
    transform: translateX(-220%) skewX(-16deg); animation: paxterGlint 9s ease-in-out 2.4s infinite; mix-blend-mode: screen; }

  /* barra de intensidade (light) */
  .leva-light .bar-off { background: rgba(15,28,53,0.10); box-shadow: inset 0 2px 5px rgba(15,28,53,0.22); }

  @media (prefers-reduced-motion: reduce) {
    .leva-tag-ink { animation: none; clip-path: none; }
    .leva-tag-glint::before { animation: none; opacity: 0; }
    .anim-enter { animation: none; opacity: 1; }
    .leva-btn, .leva-chip { transition: none; }
    .leva-btn:hover { transform: none; }
    .paxter-glint::before { animation: none; opacity: 0; }
  }
`;

type Theme = "dark" | "light";
const TOTAL = 8;
const ATUAL = 3;

function c(theme: Theme, dark: string, light: string) {
  return theme === "dark" ? dark : light;
}

function Card({ children, alarm = false }: { children: ReactNode; alarm?: boolean }) {
  return (
    <div className={`leva-card p-5 anim-enter flex flex-col gap-4 ${alarm ? "ring-1 ring-red-500/40" : ""}`}>
      {children}
    </div>
  );
}

export function AnamneseLeva({ theme, texture }: { theme: Theme; texture?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [aberto, setAberto] = useState(true);
  const [sono, setSono] = useState("");
  const [estresse, setEstresse] = useState(6);
  const [atividade, setAtividade] = useState("");
  const [cardio, setCardio] = useState("");
  useEffect(() => setMounted(true), []);

  const headInk = c(theme, "text-slate-100", "text-[#16233b]");
  const bodyInk = c(theme, "text-slate-200", "text-[#2b3850]");
  const muted = c(theme, "text-slate-400", "text-[#576075]");
  const faint = c(theme, "text-slate-500", "text-[#5b6478]");
  const stickyBg = c(theme, "bg-[#0b1426]/85", "bg-[#fcf8ee]/85");
  const barBg = c(theme, "bg-[#0b1426]/95 border-white/10", "bg-[#f6efdf]/95 border-[#8a6d2f]/20");
  const hair = c(theme, "border-white/8", "border-[#8a6d2f]/15");

  return (
    <div
      className={`leva-${theme} relative min-h-[100dvh] w-full max-w-[430px] mx-auto overflow-x-hidden flex flex-col font-sans pb-28 ${c(theme, "text-slate-200", "text-[#2b3850]")}`}
    >
      <style>{PAXTER_STYLE}{LEVA_STYLE}</style>
      <div className="leva-bg absolute inset-0 z-0 pointer-events-none" />
      {texture}

      {/* ===== HEADER: logo PAXTER APROVADA (Opcao A — imagem ouro 3D, brilho percorre) =====
           Simbolo premium DENTRO do medalhao de vidro + PAXTER/Clinical do anexo.
           CLARO: medalhao CHAMPANHE (um tom acima do painel), SEM placa azul —
           ouro pousa direto no creme (blend normal). ESCURO: medalhao navy. */}
      <header className="relative z-10 pt-9 pb-5 px-6 flex flex-col items-center">
        <PaxterLogo variant="appHeader" tone={theme === "dark" ? "dark" : "light"} />
      </header>

      {/* ===== PROGRESSO ===== */}
      <div className={`sticky top-0 z-20 px-6 py-3 backdrop-blur-md border-b ${hair} ${stickyBg}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[11px] uppercase tracking-wider font-medium ${muted}`}>Etapa {ATUAL} de {TOTAL}</span>
          <span className="text-[11px] text-gold font-semibold">{Math.round((ATUAL / TOTAL) * 100)}%</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < ATUAL ? "bar-on" : "bar-off"}`} />
          ))}
        </div>
      </div>

      {/* ===== CORPO ===== */}
      <main className="relative z-10 flex flex-col gap-5 px-6 pt-5">
        <div className="flex items-center gap-3 anim-enter">
          <div className="w-10 h-10 rounded-xl leva-well flex items-center justify-center shrink-0">
            <HeartPulse className="w-5 h-5 text-[#45B8CC]" />
          </div>
          <div>
            <h2 className={`text-sm font-bold tracking-wide uppercase ${headInk}`}>Sistema Cardiovascular</h2>
            <p className={`text-xs ${muted}`}>Bloco 3 de 8</p>
          </div>
        </div>

        <Card>
          <p className={`text-[15px] leading-snug ${bodyInk}`}>Você tem alguma queixa relacionada a este sistema?</p>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Tem queixa neste sistema?">
            <button role="radio" onClick={() => setAberto(false)} data-active={!aberto} aria-checked={!aberto} className="leva-chip py-3 flex items-center justify-center gap-2 text-sm">
              <Minus className="w-4 h-4" /> <span className="leva-chip-txt">Não, nenhuma</span>
            </button>
            <button role="radio" onClick={() => setAberto(true)} data-active={aberto} aria-checked={aberto} className="leva-chip py-3 flex items-center justify-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> <span className="leva-chip-txt">Sim, tenho</span>
            </button>
          </div>
        </Card>

        {aberto && (
          <>
            <Card>
              <p className={`text-[15px] leading-snug ${bodyInk}`}>Pratica atividade física regularmente?</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Frequência de atividade física">
                {["Não", "1–2x semana", "3–4x semana", "5x ou mais"].map((op) => (
                  <button key={op} role="radio" onClick={() => setAtividade(op)} data-active={atividade === op} aria-checked={atividade === op} className="leva-chip px-4 py-2 text-sm flex items-center gap-1.5">
                    {atividade === op && <Check className="w-3.5 h-3.5" />} <span className="leva-chip-txt">{op}</span>
                  </button>
                ))}
              </div>
              <button className="leva-video-link self-start inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mt-1 px-3 py-1.5">
                <Video className="w-3.5 h-3.5" /> Vídeo Explicativo
              </button>
            </Card>

            <Card>
              <p className={`text-[15px] leading-snug ${bodyInk}`}>Como está a qualidade do seu sono?</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Qualidade do sono">
                {["Ótima", "Boa", "Regular", "Ruim"].map((op) => (
                  <button key={op} role="radio" onClick={() => setSono(op)} data-active={sono === op} aria-checked={sono === op} className="leva-chip py-2.5 text-sm text-center">
                    <span className="leva-chip-txt">{op}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <p className={`text-[15px] leading-snug ${bodyInk}`}>Qual seu nível de estresse ultimamente?</p>
              <div className="leva-well p-3">
                <div className="flex gap-1.5">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <button key={i} onClick={() => setEstresse(i)} aria-label={`Nível ${i}`} className={`h-8 flex-1 rounded ${i <= estresse ? "bar-on" : "bar-off"}`} />
                  ))}
                </div>
                <div className={`flex justify-between mt-2 text-[10px] uppercase tracking-wider ${faint}`}>
                  <span>Ausente</span>
                  <span className="text-gold font-bold">{estresse}</span>
                  <span>Grave</span>
                </div>
              </div>
            </Card>
          </>
        )}

        <Card alarm>
          <span className="alarm-badge self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-red-200">
            <AlertTriangle className="w-3.5 h-3.5" /> Sinal de Alarme
          </span>
          <p className={`text-[15px] leading-snug ${headInk}`}>Possui histórico de doenças cardiovasculares (infarto, arritmia, pressão alta)?</p>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Histórico cardiovascular">
            <button role="radio" onClick={() => setCardio("nao")} data-active={cardio === "nao"} aria-checked={cardio === "nao"} className="leva-chip py-3 text-sm text-center"><span className="leva-chip-txt">Não</span></button>
            <button role="radio" onClick={() => setCardio("sim")} data-active={cardio === "sim"} aria-checked={cardio === "sim"} className={`leva-chip py-3 text-sm text-center font-semibold ${c(theme, "text-red-300", "text-red-700")}`}>Sim</button>
          </div>
        </Card>

        {/* rodapé */}
        <footer className="px-1 pb-4 pt-2">
          <div className={`flex items-end justify-between border-t pt-4 ${hair}`}>
            <div className="flex flex-col">
              <span className={`font-serif text-[14px] tracking-wide ${c(theme, "text-slate-200", "text-[#2b3850]")}`}>Instituto Pádua</span>
              <span className={`text-[9px] uppercase tracking-[0.18em] mt-0.5 ${faint}`}>Atendimento clínico</span>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className={`text-[8px] uppercase tracking-[0.22em] ${faint}`}>Powered by</span>
              <span
                style={{
                  display: "inline-flex",
                  background: "linear-gradient(180deg,#0d1830 0%,#0a1326 100%)",
                  borderRadius: 8,
                  padding: "5px 9px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <PaxterLogo variant="wordmark" className="w-[82px]" />
              </span>
            </div>
          </div>
        </footer>
      </main>

      {/* ===== BARRA FIXA: Voltar + CONTINUAR (B2) ===== */}
      <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-30 px-6 py-4 backdrop-blur-md border-t flex items-center gap-3 ${barBg}`}>
        <button aria-label="Voltar" className="leva-ghost w-12 h-12 flex items-center justify-center shrink-0">
          <ChevronLeft className={`w-5 h-5 ${bodyInk}`} />
        </button>
        <button className="leva-btn flex-1 h-12 flex items-center justify-center gap-2 font-bold tracking-wide text-[#1a1330]">
          Continuar <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {!mounted && <span className="sr-only">carregando</span>}
    </div>
  );
}
