import React from "react";
import { WordmarkModelo1, WordmarkModelo2, WordmarkModelo3, WordmarkModelo4, WordmarkModelo5 } from "../_shared/paxterWordmarks";
import { PAXTER_STYLE } from "../_shared/paxter3d";
import { LEVA_STYLE } from "../_shared/levaAnamnese";

export default function CincoModelosEscuro() {
  const theme = "dark";
  const headInk = "text-slate-100";
  const muted = "text-slate-400";
  const TXT = "Clinical Intelligence System";

  return (
    <div className="leva-dark relative min-h-[100dvh] w-full max-w-[430px] mx-auto overflow-x-hidden flex flex-col font-sans pb-28 text-slate-200">
      <style>{PAXTER_STYLE}{LEVA_STYLE}</style>
      <div className="leva-bg absolute inset-0 z-0 pointer-events-none" />

      {/* HEADER SIMILAR AO LEVA */}
      <header className="relative z-10 pt-9 pb-5 px-6 flex flex-col items-center">
        <h1 className="text-xl font-bold tracking-[0.2em] text-gold mb-1.5 uppercase">Estudo de Marca</h1>
        <span className="font-serif italic text-[13px] tracking-wide text-gold opacity-80">
          Paxter Wordmark (Tema Escuro)
        </span>
      </header>

      {/* MODELOS EMPILHADOS */}
      <main className="relative z-10 flex flex-col gap-6 px-6 pt-2">
        
        {/* MODELO 1 */}
        <div className="leva-card p-6 flex flex-col items-center justify-center gap-4">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted} self-start`}>Modelo 1 • Geométrico Engenheirado</span>
          <div className="w-full flex justify-center py-4">
            <WordmarkModelo1 theme={theme} size={280} />
          </div>
          <span className={`font-serif italic text-[13px] tracking-wide text-gold opacity-80 mt-2`}>{TXT}</span>
        </div>

        {/* MODELO 2 */}
        <div className="leva-card p-6 flex flex-col items-center justify-center gap-4">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted} self-start`}>Modelo 2 • Serifa Didone</span>
          <div className="w-full flex justify-center py-4">
            <WordmarkModelo2 theme={theme} size={280} />
          </div>
          <span className={`font-serif italic text-[13px] tracking-wide text-gold opacity-80 mt-2`}>{TXT}</span>
        </div>

        {/* MODELO 3 */}
        <div className="leva-card p-6 flex flex-col items-center justify-center gap-4">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted} self-start`}>Modelo 3 • Stencil Técnico</span>
          <div className="w-full flex justify-center py-4">
            <WordmarkModelo3 theme={theme} size={280} />
          </div>
          <span className={`font-serif italic text-[13px] tracking-wide text-gold opacity-80 mt-2`}>{TXT}</span>
        </div>

        {/* MODELO 4 */}
        <div className="leva-card p-6 flex flex-col items-center justify-center gap-4">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted} self-start`}>Modelo 4 • Gravado Inline</span>
          <div className="w-full flex justify-center py-4">
            <WordmarkModelo4 theme={theme} size={280} />
          </div>
          <span className={`font-serif italic text-[13px] tracking-wide text-gold opacity-80 mt-2`}>{TXT}</span>
        </div>

        {/* MODELO 5 */}
        <div className="leva-card p-6 flex flex-col items-center justify-center gap-4">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted} self-start`}>Modelo 5 • Monolito Escultural</span>
          <div className="w-full flex justify-center py-4">
            <WordmarkModelo5 theme={theme} size={280} />
          </div>
          <span className={`font-serif italic text-[13px] tracking-wide text-gold opacity-80 mt-2`}>{TXT}</span>
        </div>

      </main>
    </div>
  );
}
