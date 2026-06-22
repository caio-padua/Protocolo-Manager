import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  AlertTriangle,
  HelpCircle,
  HeartPulse,
  Check,
} from "lucide-react";
import SYMBOL_GOLD from "../../../assets/paxter-symbol-gold.png";
import { PAXTER_STYLE } from "../_shared/paxter3d";

const TOTAL_ETAPAS = 8;
const ETAPA_ATUAL = 3;

export default function AnamnesePaxter() {
  const [mounted, setMounted] = useState(false);
  const [aberto, setAberto] = useState(true);
  const [sono, setSono] = useState("");
  const [estresse, setEstresse] = useState(6);
  const [atividade, setAtividade] = useState("");

  useEffect(() => setMounted(true), []);

  return (
    <div className="relative min-h-[100dvh] w-full max-w-[430px] mx-auto bg-[#0d1830] text-slate-200 overflow-x-hidden flex flex-col font-sans selection:bg-[#c2a05a]/30 pb-28">
      <style>{PAXTER_STYLE}</style>
      <div className="paxter-bg absolute inset-0 z-0 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 pt-10 pb-4 px-6 flex flex-col items-center">
        <div className="relative w-12 h-12 mb-2">
          <div
            className="aura-pulse absolute inset-0"
            style={{
              background:
                "radial-gradient(circle, rgba(244,226,168,0.45) 0%, transparent 65%)",
              filter: "blur(6px)",
            }}
            aria-hidden="true"
          />
          <img
            src={SYMBOL_GOLD}
            alt="Paxter"
            className="absolute inset-0 w-full h-full object-contain filter brightness-75"
          />
          <img
            src={SYMBOL_GOLD}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain ray-sweep filter brightness-150 drop-shadow-[0_0_8px_rgba(244,226,168,0.8)]"
          />
        </div>
        <h1 className="text-base font-bold tracking-[0.22em] text-gold">
          FICHA DE ANAMNESE
        </h1>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#45B8CC] font-medium tagline-anim">
          Clinical Intelligence System
        </p>
      </header>

      {/* Barra de progresso (sticky) */}
      <div className="sticky top-0 z-20 px-6 py-3 bg-[#0b1426]/90 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Etapa {ETAPA_ATUAL} de {TOTAL_ETAPAS}
          </span>
          <span className="text-[11px] text-gold font-semibold">
            {Math.round((ETAPA_ATUAL / TOTAL_ETAPAS) * 100)}%
          </span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_ETAPAS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < ETAPA_ATUAL ? "bar-on" : "bar-off"
              }`}
            />
          ))}
        </div>
      </div>

      <main className="relative z-10 flex flex-col gap-5 px-6 pt-5">
        {/* Titulo do sistema corporal */}
        <div className="flex items-center gap-3 anim-enter">
          <div className="w-10 h-10 rounded-xl concave-3d flex items-center justify-center shrink-0">
            <HeartPulse className="w-5 h-5 text-[#45B8CC]" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wide text-slate-100 uppercase">
              Sistema Cardiovascular
            </h2>
            <p className="text-xs text-slate-400">Bloco 3 de 8</p>
          </div>
        </div>

        {/* Porteira (gateway) do sistema */}
        <div className="panel-3d p-5 flex flex-col gap-4 anim-enter anim-delay-1">
          <p className="text-[15px] text-slate-200 leading-snug">
            Você tem alguma queixa relacionada a este sistema?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setAberto(false)}
              data-active={!aberto}
              className="chip-3d py-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-300 data-[active=true]:text-gold"
            >
              <Minus className="w-4 h-4" />
              Não, nenhuma
            </button>
            <button
              onClick={() => setAberto(true)}
              data-active={aberto}
              className="chip-3d py-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-300 data-[active=true]:text-gold"
            >
              <Plus className="w-4 h-4" />
              Sim, tenho
            </button>
          </div>
        </div>

        {/* Grupo expandido (so aparece quando "Sim") */}
        {aberto && (
          <div className="flex flex-col gap-5">
            {/* Pergunta multi-escolha (pills) */}
            <div className="panel-3d p-5 flex flex-col gap-3 anim-enter">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] text-slate-200 leading-snug">
                  Pratica atividade física regularmente?
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["Não", "1–2x semana", "3–4x semana", "5x ou mais"].map(
                  (op) => (
                    <button
                      key={op}
                      onClick={() => setAtividade(op)}
                      data-active={atividade === op}
                      className="chip-3d px-4 py-2 text-sm font-medium text-slate-300 data-[active=true]:text-gold flex items-center gap-1.5"
                    >
                      {atividade === op && <Check className="w-3.5 h-3.5" />}
                      {op}
                    </button>
                  ),
                )}
              </div>
              <button className="self-start inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#45B8CC] mt-1">
                <HelpCircle className="w-3.5 h-3.5" />
                Ver explicação
              </button>
            </div>

            {/* Pergunta escala (radio em pills) */}
            <div className="panel-3d p-5 flex flex-col gap-3 anim-enter">
              <p className="text-[15px] text-slate-200 leading-snug">
                Como está a qualidade do seu sono?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["Ótima", "Boa", "Regular", "Ruim"].map((op) => (
                  <button
                    key={op}
                    onClick={() => setSono(op)}
                    data-active={sono === op}
                    className="chip-3d py-2.5 text-sm font-medium text-slate-300 data-[active=true]:text-gold text-center"
                  >
                    {op}
                  </button>
                ))}
              </div>
            </div>

            {/* Barra de intensidade (0-10) */}
            <div className="panel-3d p-5 flex flex-col gap-3 anim-enter">
              <p className="text-[15px] text-slate-200 leading-snug">
                Qual seu nível de estresse ultimamente?
              </p>
              <div className="concave-3d p-3">
                <div className="flex gap-1.5">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setEstresse(i)}
                      aria-label={`Nível ${i}`}
                      className={`h-8 flex-1 rounded ${
                        i <= estresse ? "bar-on" : "bar-off"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-[10px] uppercase tracking-wider text-slate-500">
                  <span>Ausente</span>
                  <span className="text-gold font-bold">{estresse}</span>
                  <span>Grave</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pergunta de ALARME (linha vermelha) — SEMPRE visivel, ignora a porteira */}
        <div className="panel-3d p-5 flex flex-col gap-3 anim-enter border border-red-500/30">
          <div className="flex items-center gap-2">
            <span className="alarm-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-red-200">
              <AlertTriangle className="w-3.5 h-3.5" />
              Sinal de Alarme
            </span>
          </div>
          <p className="text-[15px] text-slate-100 leading-snug">
            Possui histórico de doenças cardiovasculares (infarto, arritmia,
            pressão alta)?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button className="chip-3d py-3 text-sm font-semibold text-slate-300 text-center">
              Não
            </button>
            <button className="chip-3d py-3 text-sm font-semibold text-red-200 text-center border border-red-500/40">
              Sim
            </button>
          </div>
        </div>
      </main>

      {/* Navegacao fixa no rodape */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-30 px-6 py-4 bg-[#0b1426]/95 backdrop-blur-md border-t border-white/10 flex items-center gap-3">
        <button
          aria-label="Voltar"
          className="chip-3d w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-slate-300" />
        </button>
        <button className="btn-premium flex-1 py-3.5 rounded-xl flex items-center justify-center gap-2">
          <span className="text-sm font-bold tracking-widest text-gold uppercase">
            Continuar
          </span>
          <ChevronRight className="w-4 h-4 text-[#f4e2a8]" />
        </button>
      </div>

      {!mounted && <span className="sr-only">Carregando…</span>}
    </div>
  );
}
