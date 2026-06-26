import "../area-cliente/_group.css";
import {
  ArrowRight,
  BadgeCheck,
  Crown,
  FlaskConical,
  HeartPulse,
  Lock,
  ScrollText,
  Sparkles,
  Stethoscope,
  TestTube2,
} from "lucide-react";
import { PaxterSymbolPremium } from "../_shared/PaxterSymbolPremium";
import { LOCKUP_STYLE, PaxterWord } from "../_shared/paxterLockup";

/* ----------------------------------------------------------------------------
   VITRINE / DEMONSTRAÇÃO PÚBLICA (prospect) — decisão B do CEO (26/06/2026).
   Página pública, SÓ LEITURA, dados de EXEMPLO, sem login e sem PII real.
   Objetivo: mostrar ao futuro cliente como é a experiência PAXTER e despertar
   o desejo de virar cliente. CTA único e forte: "QUERO SER CLIENTE".
   NÃO é a Área do Cliente real (essa é porta única, com login).
---------------------------------------------------------------------------- */

const VITRINE_STYLE = `
.suit-navy{
  background-color:#16294a;
  background-image:
    repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 1.5px, transparent 1.5px 4px),
    repeating-linear-gradient(-45deg, rgba(0,0,0,0.14) 0 1.5px, transparent 1.5px 4px),
    linear-gradient(180deg,#1d3565 0%,#16294a 58%,#101f3a 100%);
  border:1px solid rgba(231,205,143,0.30);
}
.suit-light{
  background-color:hsl(40 33% 96%);
  background-image:
    repeating-linear-gradient(45deg, rgba(120,90,30,0.05) 0 1.5px, transparent 1.5px 4px),
    repeating-linear-gradient(-45deg, rgba(120,90,30,0.04) 0 1.5px, transparent 1.5px 4px);
}
@keyframes ctaGlow{0%,100%{box-shadow:0 6px 18px -6px rgba(7,22,43,0.5)}50%{box-shadow:0 6px 26px -4px rgba(231,205,143,0.7)}}
.cta-glow{animation:ctaGlow 3000ms ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.cta-glow{animation:none}}
`;

type Tier = { nome: string; essencia: string };
const TIERS: Tier[] = [
  { nome: "BRONZE", essencia: "O cuidado essencial do seu protocolo." },
  { nome: "OURO", essencia: "Acompanhamento ampliado e prioridade no atendimento." },
  { nome: "PLATINA", essencia: "Concierge dedicada e mais solicitações inclusas." },
  { nome: "NOIR", essencia: "Tudo incluso. O círculo mais reservado." },
];

const PILARES = [
  { Icon: HeartPulse, t: "Protocolos sob medida", s: "Injetáveis pensados para a sua longevidade" },
  { Icon: Stethoscope, t: "Equipe médica dedicada", s: "Médico e enfermagem acompanhando cada sessão" },
  { Icon: TestTube2, t: "Exames inteligentes", s: "Leitura guiada por inteligência clínica" },
  { Icon: ScrollText, t: "Documentos na palma", s: "Receitas, laudos e atestados quando precisar" },
];

function Segmentos({ feitas, total }: { feitas: number; total: number }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-[10px] flex-1"
          style={{
            background: i < feitas ? "linear-gradient(180deg,#e7cd8f,#c2a05a)" : "rgba(7,22,43,0.12)",
            boxShadow: i < feitas ? "inset 0 1px 0 rgba(255,255,255,0.4)" : "inset 0 1px 2px rgba(7,22,43,0.18)",
          }}
        />
      ))}
    </div>
  );
}

export function VitrineDemo() {
  return (
    <div className="area-root min-h-screen w-full font-sans" style={{ background: "#0d182b" }}>
      <style>{LOCKUP_STYLE + VITRINE_STYLE}</style>

      <div className="relative mx-auto w-full max-w-[430px] overflow-hidden suit-light" style={{ boxShadow: "0 24px 60px -20px rgba(0,0,0,0.7)" }}>
        {/* FITA — MODO DEMONSTRAÇÃO */}
        <div className="flex items-center justify-center gap-2 px-4 py-[6px]" style={{ background: "linear-gradient(90deg,#e7cd8f,#c2a05a)" }}>
          <Sparkles className="h-3.5 w-3.5 text-[#3a2c08]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#3a2c08]">Demonstração — exemplo</span>
        </div>

        {/* FAIXA — PAXTER (o sistema) */}
        <div className="suit-navy flex items-center justify-center gap-2 px-4 py-4">
          <PaxterSymbolPremium size={36} tone="dark" />
          <PaxterWord theme="dark" fontSize={24} />
        </div>

        {/* HERO */}
        <div className="suit-navy px-5 py-6 text-center" style={{ borderTop: "1px solid rgba(231,205,143,0.18)" }}>
          <div className="font-serif text-[26px] font-bold leading-tight text-white">
            Veja como é ser<br />um cliente PAXTER
          </div>
          <div className="mx-auto mt-3 max-w-[320px] text-[12px] leading-snug text-slate-300">
            Um acompanhamento clínico de longevidade, com a sua jornada inteira na palma da mão.
          </div>
        </div>

        <div className="px-4 pb-28 pt-5">
          {/* PRÉVIA — jornada de exemplo */}
          <div className="bevel-3d mb-3 inline-flex items-center gap-2 px-3 py-[6px]">
            <BadgeCheck className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">Sua jornada (exemplo)</span>
          </div>
          <div className="screen-3d px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-[#16294a]">Longevidade & Energia</span>
              <span className="text-[12px] font-bold text-[#9a7b32]">4/8</span>
            </div>
            <div className="mt-2">
              <Segmentos feitas={4} total={8} />
            </div>
          </div>

          {/* PILARES */}
          <div className="bevel-3d mb-3 mt-6 inline-flex items-center gap-2 px-3 py-[6px]">
            <HeartPulse className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">O que você recebe</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PILARES.map((p) => (
              <div key={p.t} className="screen-3d px-3 py-3">
                <div className="concave-3d mb-2 flex h-9 w-9 items-center justify-center">
                  <p.Icon className="h-5 w-5" style={{ color: "#9a7b32" }} />
                </div>
                <div className="text-[12px] font-bold leading-tight text-[#16294a]">{p.t}</div>
                <div className="mt-1 text-[10px] leading-snug text-[#5b6b80]">{p.s}</div>
              </div>
            ))}
          </div>

          {/* OS CÍRCULOS PAXTER (escada aspiracional, sem preço) */}
          <div className="bevel-3d mb-3 mt-6 inline-flex items-center gap-2 px-3 py-[6px]">
            <Crown className="h-4 w-4" style={{ color: "#9a7b32" }} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#16294a]">Os Círculos PAXTER</span>
          </div>
          <div className="flex flex-col gap-2">
            {TIERS.map((t, i) => (
              <div key={t.nome} className="suit-navy flex items-center gap-3 px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px]" style={{ background: "rgba(231,205,143,0.12)" }}>
                  {i >= 2 ? <Crown className="h-5 w-5" style={{ color: "#e7cd8f" }} /> : <Sparkles className="h-4 w-4" style={{ color: "#cbb778" }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold tracking-[0.06em] text-white">{t.nome}</div>
                  <div className="text-[11px] leading-snug text-slate-300">{t.essencia}</div>
                </div>
                {i >= 2 && <Lock className="h-4 w-4 shrink-0" style={{ color: "#c2a05a" }} />}
              </div>
            ))}
          </div>

          {/* prova de elegância */}
          <div className="concave-3d mt-6 flex items-center gap-3 px-4 py-3">
            <FlaskConical className="h-5 w-5 shrink-0 text-[#9a7b32]" />
            <span className="text-[11px] leading-snug text-[#5b6b80]">
              Cada protocolo é desenhado pela equipe médica — nada de fórmula de prateleira.
            </span>
          </div>
        </div>

        {/* CTA FIXO — QUERO SER CLIENTE */}
        <div className="sticky bottom-0 suit-light px-4 py-3" style={{ borderTop: "1px solid rgba(184,146,77,0.35)", boxShadow: "0 -8px 20px -12px rgba(7,22,43,0.4)" }}>
          <button className="btn-3d cta-glow flex w-full items-center justify-center gap-2 px-4 py-3 text-[14px] font-bold uppercase tracking-[0.08em] text-[#3a2c08]">
            Quero ser cliente <ArrowRight className="h-4 w-4" />
          </button>
          <button className="mt-2 w-full text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#9a7b32]">
            Já sou cliente — entrar
          </button>
        </div>
      </div>
    </div>
  );
}
