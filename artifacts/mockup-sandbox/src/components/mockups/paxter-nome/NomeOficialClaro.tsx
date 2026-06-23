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

export default function NomeOficialClaro() {
  const cardStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, #ffffff 0%, #f3ede0 100%)",
    border: "1px solid #e2d6bd",
    boxShadow: "0 12px 30px rgba(120,95,40,0.12), inset 0 1px 0 rgba(255,255,255,0.8)",
    borderRadius: 16,
  };
  return (
    <div
      className="relative min-h-[100dvh] w-full max-w-[460px] mx-auto overflow-x-hidden flex flex-col font-sans pb-20"
      style={{ background: "linear-gradient(180deg, #faf6ee 0%, #efe7d6 100%)", color: "#5a4a2c" }}
    >
      <style>{PAXTER_STYLE}{LEVA_STYLE}{LOCKUP_STYLE}</style>

      <header className="relative z-10 pt-9 pb-4 px-6 text-center">
        <h1 className="text-[11px] font-bold tracking-[0.3em] uppercase" style={{ color: "#8a6d2f" }}>
          Identidade Oficial — Ouro 3D Saliente
        </h1>
      </header>

      <main className="relative z-10 flex flex-col gap-6 px-6 pt-2">
        <section style={cardStyle} className="px-6 py-10 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest self-start mb-6" style={{ color: "#a08a5c" }}>
            Lockup completo
          </span>
          <PaxterLockup theme="light" wordSize={62} />
        </section>

        <section style={cardStyle} className="px-6 py-10 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest self-start mb-6" style={{ color: "#a08a5c" }}>
            Nome PAXTER (isolado)
          </span>
          <PaxterWord theme="light" fontSize={72} />
        </section>

        <section style={cardStyle} className="px-6 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest self-start mb-5" style={{ color: "#a08a5c" }}>
            Frase 1 — em relevo 3D
          </span>
          <PaxterCIS theme="light" fontSize={30} />
        </section>

        <section style={cardStyle} className="px-6 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest self-start mb-5" style={{ color: "#a08a5c" }}>
            Frase 2 — em relevo 3D
          </span>
          <PaxterPrecision theme="light" fontSize={16} />
        </section>
      </main>
    </div>
  );
}
