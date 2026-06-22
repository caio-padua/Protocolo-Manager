import { useEffect, useState } from "react";
import {
  ChevronRight,
  Star,
  User,
  Syringe,
  Sparkles,
  MapPin,
  Stethoscope,
} from "lucide-react";
import SYMBOL_GOLD from "../../../assets/paxter-symbol-cut.png";
import { PAXTER_STYLE } from "../_shared/paxter3d";

type Door = {
  id: string;
  label: string;
  subtitle: string;
  badge: string;
  Icon: typeof User;
};

const DOORS: Door[] = [
  {
    id: "corpo",
    label: "Corpo Clínico",
    subtitle: "Profissionais e especialidades da casa.",
    badge: "Corpo Clínico",
    Icon: Stethoscope,
  },
  {
    id: "injetavel",
    label: "Protocolos Injetáveis",
    subtitle: "Ficha de anamnese guiada e protocolo personalizado.",
    badge: "Injetáveis",
    Icon: Syringe,
  },
  {
    id: "estetico",
    label: "Protocolos Estéticos",
    subtitle: "Toxina, preenchimento e bioestimuladores.",
    badge: "Estética",
    Icon: Sparkles,
  },
];

export default function AgendarPaxter() {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<string>("");

  useEffect(() => setMounted(true), []);

  return (
    <div className="relative min-h-[100dvh] w-full max-w-[430px] mx-auto bg-[#0d1830] text-slate-200 overflow-x-hidden flex flex-col font-sans selection:bg-[#c2a05a]/30 pb-12">
      <style>{PAXTER_STYLE}</style>
      <div className="paxter-bg absolute inset-0 z-0 pointer-events-none" />

      {/* Header: simbolo + marca + tagline */}
      <header className="relative z-10 pt-12 pb-6 px-6 flex flex-col items-center">
        <div className="relative w-14 h-14 mb-3">
          <div
            className="aura-pulse absolute inset-0"
            style={{
              background:
                "radial-gradient(circle, rgba(244,226,168,0.40) 0%, transparent 65%)",
              filter: "blur(7px)",
            }}
            aria-hidden="true"
          />
          <img
            src={SYMBOL_GOLD}
            alt="Paxter"
            className="relative w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
          />
        </div>
        <h1 className="text-xl font-bold tracking-[0.25em] text-gold mb-1">
          PAXTER
        </h1>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#45B8CC] font-medium tagline-anim">
          Clinical Intelligence System
        </p>
      </header>

      <main className="relative z-10 flex flex-col gap-7">
        {/* Saudacao */}
        <div className="px-6 anim-enter">
          <p className="font-serif italic text-lg text-gold tracking-wide text-center">
            Como deseja ser atendido?
          </p>
          <div className="mx-auto mt-2 w-16 h-px bg-gradient-to-r from-transparent via-[#c2a05a] to-transparent" />
        </div>

        {/* Porta-heroi: Dr. Caio (atendimento exclusivo) */}
        <div className="px-6 anim-enter anim-delay-1">
          <div className="gold-rim">
            <button
              onClick={() => setActive("drcaio")}
              data-active={active === "drcaio"}
              className="w-full rounded-[16px] bg-[#0b1426] text-left p-5 flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/60 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#f4e2a8] fill-[#f4e2a8]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                  Atendimento Exclusivo
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-black border-2 border-[#c2a05a] flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(194,160,90,0.35)]">
                  <User className="w-7 h-7 text-[#f4e2a8]" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-bold text-slate-100 leading-tight">
                    Dr. Caio Henrique
                    <br />
                    Fernandes Pádua
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Consulta premium e protocolos avançados.
                  </div>
                </div>
                <span className="w-8 h-8 rounded-full bg-gold/10 border border-[#c2a05a]/40 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-5 h-5 text-[#f4e2a8]" />
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Demais portas (paineis 3D) */}
        <div className="px-6 flex flex-col gap-4 anim-enter anim-delay-2">
          {DOORS.map((d) => (
            <button
              key={d.id}
              onClick={() => setActive(d.id)}
              data-active={active === d.id}
              className="panel-3d p-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/50"
            >
              <div className="w-12 h-12 rounded-xl concave-3d flex items-center justify-center shrink-0">
                <d.Icon className="w-6 h-6 text-[#45B8CC]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold border border-[#c2a05a]/40 rounded px-1.5 py-0.5">
                    {d.badge}
                  </span>
                </div>
                <div className="text-[15px] font-semibold text-slate-100 mt-1.5 leading-tight">
                  {d.label}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{d.subtitle}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
            </button>
          ))}
        </div>

        {/* Endereco */}
        <div className="px-6 anim-enter anim-delay-3">
          <div className="panel-3d p-4 flex items-start gap-4 rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-black/30 border border-slate-600 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#45B8CC]" />
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold text-slate-200">
                Instituto Pádua
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rua Guaxupé, 327 — Vila Formosa
                <br />
                São Paulo, SP
              </p>
            </div>
          </div>
        </div>

        {/* Rodape: identidade da casa (esq) + marca do sistema Paxter (dir) */}
        <footer className="px-6 pb-7 pt-2 anim-enter anim-delay-4">
          <div className="flex items-end justify-between border-t border-white/5 pt-4">
            <div className="flex flex-col">
              <span className="font-serif text-[14px] text-slate-200 tracking-wide">
                Instituto Pádua
              </span>
              <span className="text-[9px] uppercase tracking-[0.18em] text-slate-500 mt-0.5">
                Atendimento clínico
              </span>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[8px] uppercase tracking-[0.22em] text-slate-500">
                Powered by
              </span>
              <div className="paxter-plate">
                <span className="paxter-word">PAXTER</span>
                <span className="paxter-glint" aria-hidden="true" />
              </div>
            </div>
          </div>
        </footer>
      </main>

      {!mounted && <span className="sr-only">Carregando…</span>}
    </div>
  );
}
