import { useId, type CSSProperties } from "react";

/**
 * Cor da agenda como uma PEDRA LAPIDADA vista de cima (lapidação princesa) engastada em ouro:
 * quatro facetas de tons diferentes em volta de uma mesa central translúcida. A luz vem do canto
 * superior esquerdo, então a faceta de cima e a da esquerda são mais claras e as outras, mais
 * escuras. Não há reflexo branco nem brilho aplicado: o efeito de vidro vem só da lapidação,
 * e nada passa do limite da pedra.
 */
export function VidroCor({ cor, tamanho = 32 }: { cor: string; tamanho?: number }) {
  const mix = (outra: string, pct: number) => `color-mix(in srgb, ${outra} ${pct}%, ${cor})`;
  const faceta = (clip: string, fundo: string): CSSProperties => ({
    position: "absolute", inset: 0, clipPath: clip, background: fundo,
  });
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden"
      aria-hidden="true"
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: Math.max(4, Math.round(tamanho * 0.14)),
        background: cor,
        boxShadow: [
          `0 0 0 1px color-mix(in srgb, ${cor} 55%, #3a2a0c)`,
          `0 0 0 2px rgba(184,146,77,0.6)`,
          `0 2px 3px rgba(7,22,43,0.35)`,
        ].join(", "),
      }}
    >
      {/* facetas: topo e esquerda recebem luz; direita e base ficam na sombra */}
      <span style={faceta("polygon(0 0, 100% 0, 75% 25%, 25% 25%)", mix("white", 38))} />
      <span style={faceta("polygon(0 0, 25% 25%, 25% 75%, 0 100%)", mix("white", 18))} />
      <span style={faceta("polygon(100% 0, 100% 100%, 75% 75%, 75% 25%)", mix("black", 22))} />
      <span style={faceta("polygon(0 100%, 25% 75%, 75% 75%, 100% 100%)", mix("black", 42))} />
      {/* mesa da pedra: translúcida, mais luminosa no canto da luz */}
      <span
        style={{
          position: "absolute", left: "25%", top: "25%", width: "50%", height: "50%",
          background: `linear-gradient(135deg, ${mix("white", 30)} 0%, ${cor} 55%, ${mix("black", 12)} 100%)`,
        }}
      />
      {/* arestas finas entre as facetas */}
      <svg viewBox="0 0 32 32" width="100%" height="100%" style={{ position: "absolute", inset: 0 }} fill="none" strokeWidth="0.7">
        <path d="M0 0 L8 8 M32 0 L24 8 M0 32 L8 24 M32 32 L24 24" stroke="rgba(0,0,0,0.28)" />
        <rect x="8" y="8" width="16" height="16" stroke="rgba(0,0,0,0.3)" />
      </svg>
    </span>
  );
}

/**
 * Seletor de cor no mesmo padrão: poço côncavo com o vidro e o código da cor.
 * O seletor nativo do navegador fica transparente por cima e abre ao clicar.
 */
export function SeletorCorVidro({ valor, onChange, rotulo }: { valor: string; onChange: (cor: string) => void; rotulo: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="concave-3d relative flex h-10 cursor-pointer items-center gap-2.5 px-2.5">
      <VidroCor cor={valor} tamanho={26} />
      <span className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">{valor}</span>
      <input
        id={id}
        type="color"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-label={rotulo}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}
