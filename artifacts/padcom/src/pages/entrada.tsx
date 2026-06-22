import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  UserRound, Stethoscope, ShieldCheck, Lock, FileSignature,
  CloudCog, ArrowRight, Globe, Upload,
} from "lucide-react";
import paxterSymbol from "@/assets/paxter-symbol.png";

// ---------------------------------------------------------------------------
// PORTA DA FRENTE (/entrada). Fluxo: tocar no icone/abrir -> SPLASH (logo grande
// + selos de seguranca com luzinhas, estilo escudo do IHE porem PAXTER, frases
// em ingles) -> ESCOLHA de acesso (Paciente -> /area | Colaborador ->
// /cadastros/equipe). Tambem e o start_url do PWA (app instalado abre aqui).
// ---------------------------------------------------------------------------

// Selos de seguranca VERDADEIROS deste sistema (cada um com luzinha pulsante).
const SELOS = [
  { Icone: ShieldCheck,   sigla: "LGPD",       en: "Privacy Compliant" },
  { Icone: FileSignature, sigla: "ICP-BRASIL", en: "Digitally Signed" },
  { Icone: Lock,          sigla: "SSL / TLS",  en: "Encrypted" },
  { Icone: CloudCog,      sigla: "CLOUD",      en: "Secure Hosting" },
];

// Pequeno selo (escudo) com luzinha pulsante dourada — inspirado nos Shields do
// IHE (gradiente dourado->navy + pontos de luz), com a marca PAXTER.
function Selo({ Icone, sigla, en, delay }: { Icone: typeof Lock; sigla: string; en: string; delay: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="selo-escudo relative">
        {/* luzinhas pulsantes */}
        <span className="selo-luz" style={{ top: 4, left: 6, animationDelay: `${delay}ms` }} />
        <span className="selo-luz" style={{ top: 6, right: 6, animationDelay: `${delay + 500}ms` }} />
        <span className="selo-luz" style={{ bottom: 10, left: 10, animationDelay: `${delay + 900}ms` }} />
        <Icone className="h-5 w-5 text-[#e8cf95]" strokeWidth={1.8} />
      </div>
      <div className="text-center leading-tight">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#e8cf95]">{sigla}</div>
        <div className="text-[8px] uppercase tracking-wider text-[#7e93b8]">{en}</div>
      </div>
    </div>
  );
}

function SelosRow({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-start justify-center ${compact ? "gap-4" : "gap-5 sm:gap-7"}`}>
      {SELOS.map((s, i) => (
        <Selo key={s.sigla} Icone={s.Icone} sigla={s.sigla} en={s.en} delay={i * 300} />
      ))}
    </div>
  );
}

export default function Entrada() {
  const [, setLocation] = useLocation();
  const [fase, setFase] = useState<"splash" | "escolha">("splash");

  // Auto-avanca para a escolha apos a abertura. Tocar na tela pula na hora.
  useEffect(() => {
    if (fase !== "splash") return;
    const t = setTimeout(() => setFase("escolha"), 2800);
    return () => clearTimeout(t);
  }, [fase]);

  return (
    <div className="entrada-bg min-h-[100dvh] w-full text-white flex flex-col items-center justify-center px-5 py-10 overflow-hidden">
      <style>{`
        .entrada-bg{
          background:
            radial-gradient(1200px 600px at 50% -10%, rgba(194,160,90,0.12), transparent 60%),
            radial-gradient(900px 700px at 50% 120%, rgba(69,184,204,0.08), transparent 60%),
            linear-gradient(180deg,#0d1830 0%,#0b1426 60%,#091020 100%);
        }
        .entrada-fade{animation:entradaFade .6s ease both}
        @keyframes entradaFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .logo-glow{filter:drop-shadow(0 0 38px rgba(194,160,90,.45)) drop-shadow(0 0 80px rgba(194,160,90,.20))}
        .logo-pulse{animation:logoPulse 3.2s ease-in-out infinite}
        @keyframes logoPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        .selo-escudo{
          width:54px;height:60px;display:flex;align-items:center;justify-content:center;
          background:linear-gradient(180deg, rgba(232,207,149,.16), rgba(13,24,48,.6));
          border:1px solid rgba(194,160,90,.45);
          clip-path:polygon(50% 0,100% 18%,100% 64%,50% 100%,0 64%,0 18%);
          box-shadow:inset 0 0 14px rgba(194,160,90,.18), 0 6px 18px rgba(0,0,0,.45);
        }
        .selo-luz{
          position:absolute;width:4px;height:4px;border-radius:9999px;background:#f1dca6;
          box-shadow:0 0 8px 2px rgba(241,220,166,.85);animation:seloLuz 1.8s ease-in-out infinite;
        }
        @keyframes seloLuz{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}}
        .scan-line{
          height:2px;width:170px;border-radius:9999px;overflow:hidden;
          background:rgba(255,255,255,.08);position:relative;
        }
        .scan-line::after{
          content:"";position:absolute;inset:0;width:45%;border-radius:9999px;
          background:linear-gradient(90deg,transparent,#c2a05a,transparent);
          animation:scan 1.4s ease-in-out infinite;
        }
        @keyframes scan{0%{transform:translateX(-120%)}100%{transform:translateX(260%)}}
        .acesso-card{transition:transform .15s ease, border-color .15s ease, box-shadow .15s ease}
        .acesso-card:hover{transform:translateY(-3px);border-color:rgba(194,160,90,.6);box-shadow:0 14px 36px rgba(0,0,0,.5)}
      `}</style>

      {fase === "splash" ? (
        <button
          type="button"
          onClick={() => setFase("escolha")}
          aria-label="Entrar"
          className="entrada-fade flex flex-col items-center gap-7 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1426]"
        >
          <div className="relative logo-pulse">
            <img src={paxterSymbol} alt="PAXTER" style={{ mixBlendMode: "screen" }} className="h-32 w-32 sm:h-40 sm:w-40 object-contain logo-glow" />
          </div>

          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-bold tracking-[0.35em] text-[#f1dca6] pl-[0.35em]">
              PAXTER
            </div>
            <div className="mt-2 text-[11px] sm:text-xs uppercase tracking-[0.45em] text-[#8aa0c4] pl-[0.45em]">
              Clinical Intelligence System
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-[#6f86ad]">
              Motor Clínico · Protocolos Injetáveis
            </div>
          </div>

          <SelosRow />

          <div className="flex flex-col items-center gap-2 mt-1">
            <div className="scan-line" />
            <div className="text-[9px] uppercase tracking-[0.3em] text-[#6f86ad]">
              Initializing secure system…
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-[#c2a05a]/80">
              Toque para entrar
            </div>
          </div>
        </button>
      ) : (
        <div className="entrada-fade w-full max-w-2xl flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <img src={paxterSymbol} alt="PAXTER" style={{ mixBlendMode: "screen" }} className="h-14 w-14 object-contain logo-glow" />
            <div className="text-xl font-bold tracking-[0.3em] text-[#f1dca6] pl-[0.3em]">PAXTER</div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-[#8aa0c4] pl-[0.4em]">
              Welcome · Selecione seu acesso
            </div>
          </div>

          <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-4">
            {/* PACIENTE */}
            <button
              type="button"
              onClick={() => setLocation("/area")}
              className="acesso-card group text-left rounded-2xl border border-[#c2a05a]/30 bg-white/[0.04] p-6 backdrop-blur"
              data-testid="acesso-paciente"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-b from-[#d9bd7e] to-[#b8924d] text-[#1a1206]">
                <UserRound className="h-6 w-6" />
              </div>
              <div className="mt-4 text-base font-bold uppercase tracking-widest text-white">
                Área do Paciente
              </div>
              <div className="mt-1 text-sm text-[#9fb2d2] leading-relaxed">
                Acompanhe seu protocolo, agenda, documentos e envie exames.
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[#f1dca6]">
                Entrar <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>

            {/* COLABORADOR */}
            <button
              type="button"
              onClick={() => setLocation("/cadastros/equipe")}
              className="acesso-card group text-left rounded-2xl border border-white/15 bg-white/[0.04] p-6 backdrop-blur"
              data-testid="acesso-colaborador"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-xl border border-[#45B8CC]/50 bg-[#45B8CC]/10 text-[#7fdcec]">
                <Stethoscope className="h-6 w-6" />
              </div>
              <div className="mt-4 text-base font-bold uppercase tracking-widest text-white">
                Área do Colaborador
              </div>
              <div className="mt-1 text-sm text-[#9fb2d2] leading-relaxed">
                Equipe clínica e administrativa — central de cadastro e gestão.
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[#7fdcec]">
                Entrar <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          </div>

          <div className="flex items-center gap-5 text-[11px] uppercase tracking-widest text-[#8aa0c4]">
            <button onClick={() => setLocation("/abertura")} className="inline-flex items-center gap-1.5 hover:text-[#f1dca6]">
              <Globe className="h-3.5 w-3.5" /> Site
            </button>
            <button onClick={() => setLocation("/portal")} className="inline-flex items-center gap-1.5 hover:text-[#f1dca6]">
              <Upload className="h-3.5 w-3.5" /> Enviar Exames
            </button>
          </div>

          <SelosRow compact />
        </div>
      )}
    </div>
  );
}
