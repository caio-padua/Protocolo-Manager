// VITRINE — 3 opcoes do simbolo lado a lado para o CEO comparar "em vitro".
// A) Vetor "Rx" que se escreve + brilho corre no tracado.
// B) Seu PNG 3D como final; a escrita em vetor toca como ABERTURA e assenta no PNG.
// C) Seu PNG com um brilho passando por cima (sem escrita de verdade).
// Recarregar a pagina reinicia as animacoes de abertura (A e B).

import SYMBOL_PNG from "../../../assets/paxter-symbol-cut.png";
import { TRACE_FLASH_STYLE, RxWriting } from "../_shared/traceFlash";

const LOCAL = `
  /* Opcao B — escrita vira PNG */
  @keyframes bPenOut { 0%,52%{opacity:1} 70%,100%{opacity:0} }
  @keyframes bPngIn  { 0%,52%{opacity:0; transform:scale(.94)} 76%,100%{opacity:1; transform:scale(1)} }
  .b-pen { animation: bPenOut 4.2s ease forwards; }
  .b-png { animation: bPngIn 4.2s ease forwards; }
  /* Opcao C — brilho varrendo a caixa */
  @keyframes cSweep { 0%{transform:translateX(-170%) skewX(-18deg)} 55%,100%{transform:translateX(260%) skewX(-18deg)} }
  .c-wrap { position:relative; overflow:hidden; }
  .c-wrap::before{ content:""; position:absolute; top:-20%; bottom:-20%; left:0; width:42%; pointer-events:none;
    background:linear-gradient(100deg, transparent, rgba(255,250,228,.85), transparent);
    mix-blend-mode:screen; animation:cSweep 3s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce){
    .b-pen{display:none} .b-png{animation:none;opacity:1;transform:none} .c-wrap::before{animation:none;opacity:0}
  }
`;

function Stage({ children }: { children: React.ReactNode }) {
  return <div className="relative flex items-center justify-center" style={{ width: 170, height: 170 }}>{children}</div>;
}

function Card({
  tag, titulo, veredito, vbom, children,
}: { tag: string; titulo: string; veredito: string; vbom: boolean; children: React.ReactNode }) {
  return (
    <section className="w-full max-w-sm rounded-2xl border border-[#c2a05a]/25 bg-gradient-to-b from-[#0e1b34] to-[#070f22] p-6 flex flex-col items-center gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-7 h-7 rounded-md bg-[#d8b765] text-[#1a1330] text-sm font-extrabold">{tag}</span>
        <span className="text-[12px] uppercase tracking-[0.18em] text-[#d8b765] font-bold">{titulo}</span>
      </div>
      <Stage>{children}</Stage>
      <span className="text-[10px] uppercase tracking-[0.28em] text-[#d8b765] font-bold">PAXTER</span>
      <span className={`text-[10px] text-center leading-relaxed ${vbom ? "text-emerald-300" : "text-slate-400"}`}>{veredito}</span>
    </section>
  );
}

export default function TresModelosSimbolo() {
  return (
    <div
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      className="min-h-screen w-full bg-[#070d1c] text-slate-100 flex flex-col items-center gap-7 py-10 px-5"
    >
      <style>{TRACE_FLASH_STYLE + LOCAL}</style>

      <div className="text-center">
        <h1 className="text-sm font-bold tracking-[0.26em] text-[#d8b765] uppercase">3 Modelos do Símbolo — Comparar</h1>
        <p className="text-[11px] text-slate-400 mt-2 max-w-xs">Recarregue para ver as aberturas (A e B) de novo. Escolha A, B ou C.</p>
      </div>

      {/* A — vetor que se escreve */}
      <Card tag="A" titulo="Vetor que se escreve" vbom veredito="Escrita perfeita e nítida em qualquer tamanho. Recomendado se a prioridade é o efeito.">
        <RxWriting size={150} />
      </Card>

      {/* B — escrita vira o PNG 3D */}
      <Card tag="B" titulo="Abertura escreve, vira seu 3D" vbom veredito="Junta a escrita com o relevo 3D do seu símbolo. Recomendado (Default).">
        <div className="b-png absolute inset-0 flex items-center justify-center">
          <img src={SYMBOL_PNG} alt="Paxter 3D" style={{ width: 150, height: 150, objectFit: "contain", mixBlendMode: "screen" }} />
        </div>
        <div className="b-pen absolute inset-0 flex items-center justify-center">
          <RxWriting size={150} flashMs={2200} />
        </div>
      </Card>

      {/* C — PNG com brilho varrendo */}
      <Card tag="C" titulo="PNG com brilho varrendo" vbom={false} veredito="Brilho passa pela CAIXA do símbolo (não escreve o traçado). Mais simples, menos especial.">
        <div className="c-wrap flex items-center justify-center" style={{ width: 160, height: 160 }}>
          <img src={SYMBOL_PNG} alt="Paxter 3D" style={{ width: 150, height: 150, objectFit: "contain", mixBlendMode: "screen" }} />
        </div>
      </Card>
    </div>
  );
}
