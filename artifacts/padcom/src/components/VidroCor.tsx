import { useId } from "react";

/**
 * Quadradinho de vidro translúcido que mostra a cor de uma agenda.
 * Cantos levemente arredondados, tampo quase plano com um leve abaulado, reflexo nítido (vidro
 * brilhante, não fosco). A luz fica TODA dentro do quadradinho: nada escapa para fora do limite.
 */
export function VidroCor({ cor, tamanho = 32 }: { cor: string; tamanho?: number }) {
  const raio = Math.max(5, Math.round(tamanho * 0.18));
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden"
      aria-hidden="true"
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: raio,
        background: `linear-gradient(180deg, color-mix(in srgb, ${cor} 68%, white) 0%, color-mix(in srgb, ${cor} 88%, transparent) 46%, color-mix(in srgb, ${cor} 92%, black) 100%)`,
        border: `1px solid color-mix(in srgb, ${cor} 45%, white)`,
        boxShadow: [
          `inset 0 0 0 1px rgba(255,255,255,0.45)`,
          `inset 0 -5px 7px color-mix(in srgb, ${cor} 70%, black)`,
          `inset 0 0 10px color-mix(in srgb, ${cor} 60%, white)`,
          `0 1px 2px rgba(7,22,43,0.35)`,
        ].join(", "),
      }}
    >
      {/* tampo levemente abaulado: faixa de reflexo nítida, quase plana */}
      <span
        className="absolute"
        style={{
          left: 2, right: 2, top: 2, height: "42%",
          borderRadius: `${Math.max(3, raio - 2)}px ${Math.max(3, raio - 2)}px ${Math.round(tamanho * 0.3)}px ${Math.round(tamanho * 0.3)}px / ${Math.max(3, raio - 2)}px ${Math.max(3, raio - 2)}px ${Math.round(tamanho * 0.14)}px ${Math.round(tamanho * 0.14)}px`,
          background: "linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.14) 100%)",
        }}
      />
      {/* fio de luz no fundo, dentro do vidro */}
      <span className="absolute" style={{ left: 3, right: 3, bottom: 2, height: 1.5, borderRadius: 2, background: "rgba(255,255,255,0.5)" }} />
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
