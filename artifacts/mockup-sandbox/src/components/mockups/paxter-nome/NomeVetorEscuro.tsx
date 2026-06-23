import React from "react";
import { PAXTER_STYLE } from "../_shared/paxter3d";
import { LEVA_STYLE } from "../_shared/levaAnamnese";
import { PaxterLogoVector } from "../_shared/PaxterLogoVector";

export default function NomeVetorEscuro() {
  return (
    <div className="leva-dark relative min-h-[100dvh] w-full max-w-[460px] mx-auto overflow-x-hidden flex flex-col font-sans pb-20 text-slate-200">
      <style>{PAXTER_STYLE}{LEVA_STYLE}</style>
      <div className="leva-bg absolute inset-0 z-0 pointer-events-none" />

      <header className="relative z-10 pt-9 pb-4 px-6 text-center">
        <h1 className="text-[11px] font-bold tracking-[0.3em] uppercase text-gold/80">
          Vetor traçado da imagem — ouro 3D
        </h1>
      </header>

      <main className="relative z-10 flex flex-col gap-6 px-6 pt-2">
        <section className="panel-3d px-5 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 self-start mb-5">
            Logo completa (vetor)
          </span>
          <PaxterLogoVector variant="hero" width="100%" />
        </section>

        <section className="panel-3d px-5 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 self-start mb-5">
            Palavra PAXTER (vetor, sem fonte)
          </span>
          <PaxterLogoVector variant="wordmark" width="100%" />
        </section>

        <section className="panel-3d px-5 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 self-start mb-5">
            Símbolo Rx (vetor)
          </span>
          <PaxterLogoVector variant="symbol" width="62%" />
        </section>
      </main>
    </div>
  );
}
