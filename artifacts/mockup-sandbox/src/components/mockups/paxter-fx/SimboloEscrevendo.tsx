// PROVA do efeito de ESCRITA (trace-flash) pedido pelo CEO:
// o flash percorre o TRACADO do simbolo, como se ele estivesse sendo escrito.
// Mostro em fundo escuro e claro, e ao lado o PNG atual (S1) para comparar.

import SYMBOL_PNG from "../../../assets/paxter-symbol-cut.png";
import { TRACE_FLASH_STYLE, RxWriting } from "../_shared/traceFlash";

export default function SimboloEscrevendo() {
  return (
    <div
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      className="min-h-screen w-full bg-[#070d1c] text-slate-100 flex flex-col items-center gap-8 py-10 px-5"
    >
      <style>{TRACE_FLASH_STYLE}</style>

      <div className="text-center">
        <h1 className="text-sm font-bold tracking-[0.28em] text-[#d8b765] uppercase">
          Efeito "Escrita" do Símbolo
        </h1>
        <p className="text-[11px] text-slate-400 mt-2 max-w-xs">
          O flash percorre o traçado (não a caixa). Recarregue para ver escrever de novo.
        </p>
      </div>

      {/* Fundo escuro (navy) */}
      <section className="w-full max-w-sm rounded-2xl border border-[#c2a05a]/25 bg-gradient-to-b from-[#0e1b34] to-[#070f22] p-8 flex flex-col items-center gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        <span className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Fundo escuro</span>
        <RxWriting size={150} />
        <span className="text-[10px] uppercase tracking-[0.3em] text-[#d8b765] font-bold mt-1">PAXTER</span>
      </section>

      {/* Fundo claro */}
      <section className="w-full max-w-sm rounded-2xl border border-[#c2a05a]/40 bg-gradient-to-b from-[#f4f1e8] to-[#e7e0cf] p-8 flex flex-col items-center gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
        <span className="text-[9px] uppercase tracking-[0.22em] text-[#8a6d2f]">Fundo claro</span>
        <RxWriting size={150} goldDeep="#7a5e22" flashColor="#fff7d6" />
        <span className="text-[10px] uppercase tracking-[0.3em] text-[#8a6d2f] font-bold mt-1">PAXTER</span>
      </section>

      {/* PNG atual (S1) para comparacao */}
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/30 p-8 flex flex-col items-center gap-3">
        <span className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Seu PNG atual (S1) — imagem plana, sem traçado</span>
        <img src={SYMBOL_PNG} alt="Paxter PNG" style={{ width: 130, height: 130, objectFit: "contain", mixBlendMode: "screen" }} />
        <span className="text-[9px] text-slate-500 text-center">Uma imagem não tem &quot;caminhos&quot;; por isso a escrita usa um símbolo vetor.</span>
      </section>
    </div>
  );
}
