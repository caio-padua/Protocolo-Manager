import React from "react";
import { PaxterLogoVector } from "../_shared/PaxterLogoVector";

export default function NomeVetorClaro() {
  const card: React.CSSProperties = {
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
      <header className="relative z-10 pt-9 pb-4 px-6 text-center">
        <h1 className="text-[11px] font-bold tracking-[0.3em] uppercase" style={{ color: "#8a6d2f" }}>
          Vetor traçado da imagem — ouro 3D
        </h1>
      </header>

      <main className="relative z-10 flex flex-col gap-6 px-6 pt-2">
        <section style={card} className="px-5 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest self-start mb-5" style={{ color: "#a08a5c" }}>
            Logo completa (vetor)
          </span>
          <div style={{ background: "#0d0f13", borderRadius: 12, padding: "20px 14px", width: "100%" }}>
            <PaxterLogoVector variant="hero" width="100%" />
          </div>
          <span className="text-[9px] mt-3" style={{ color: "#a08a5c" }}>
            Ouro precisa de fundo escuro para brilhar — cartão escuro dentro do tema claro
          </span>
        </section>

        <section style={card} className="px-5 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest self-start mb-5" style={{ color: "#a08a5c" }}>
            Palavra PAXTER (vetor, sem fonte)
          </span>
          <PaxterLogoVector variant="wordmark" width="100%" />
        </section>

        <section style={card} className="px-5 py-9 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest self-start mb-5" style={{ color: "#a08a5c" }}>
            Símbolo Rx (vetor)
          </span>
          <PaxterLogoVector variant="symbol" width="60%" />
        </section>
      </main>
    </div>
  );
}
