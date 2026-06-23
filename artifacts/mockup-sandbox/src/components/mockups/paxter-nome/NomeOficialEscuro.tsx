import React from "react";
import { PAXTER_STYLE } from "../_shared/paxter3d";
import { LEVA_STYLE } from "../_shared/levaAnamnese";
import {
  LOCKUP_STYLE,
  PaxterLockup,
  PaxterWord,
  PaxterCIS,
  PaxterPrecision,
} from "../_shared/paxterLockup";

export default function NomeOficialEscuro() {
  return (
    <div className="leva-dark relative min-h-[100dvh] w-full max-w-[460px] mx-auto overflow-x-hidden flex flex-col font-sans pb-20 text-slate-200">
      <style>{PAXTER_STYLE}{LEVA_STYLE}{LOCKUP_STYLE}</style>
      <div className="leva-bg absolute inset-0 z-0 pointer-events-none" />

      <header className="relative z-10 pt-9 pb-4 px-6 text-center">
        <h1 className="text-[11px] font-bold tracking-[0.3em] uppercase text-gold/80">
          Identidade Oficial — Ouro 3D Saliente
        </h1>
      </header>

      <main className="relative z-10 flex flex-col gap-6 px-6 pt-2">
        {/* LOCKUP COMPLETO */}
        <section className="panel-3d px-6 py-10 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 self-start mb-6">
            Lockup completo
          </span>
          <PaxterLockup theme="dark" wordSize={62} />
        </section>

        {/* NOME ISOLADO */}
        <section className="panel-3d px-6 py-10 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 self-start mb-6">
            Nome PAXTER (isolado)
          </span>
          <PaxterWord theme="dark" fontSize={72} />
        </section>

        {/* FRASE 1 ISOLADA */}
        <section className="panel-3d px-6 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 self-start mb-5">
            Frase 1 — em relevo 3D
          </span>
          <PaxterCIS theme="dark" fontSize={30} />
        </section>

        {/* FRASE 2 ISOLADA */}
        <section className="panel-3d px-6 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 self-start mb-5">
            Frase 2 — em relevo 3D
          </span>
          <PaxterPrecision theme="dark" fontSize={16} />
        </section>
      </main>
    </div>
  );
}
