import { useId } from "react";

/**
 * Cor da agenda como um vidro translúcido, sempre na COR JÁ CADASTRADA da agenda (nada de paleta
 * nova). Tampo plano com bordas e quinas levemente arredondadas, relevo fino (chanfro no topo e
 * assentamento na base) e luz que só existe DENTRO do vidro: ao passar o mouse, uma fenda de luz
 * (mistura "overlay", ou seja, pega a cor do vidro e não vira faixa branca) varre o quadradinho.
 * Em repouso não há nenhum brilho aplicado. Estilos em index.css (.vidro-cor).
 */
export function VidroCor({ cor, tamanho = 32 }: { cor: string; tamanho?: number }) {
  return (
    <span
      className="vidro-cor"
      aria-hidden="true"
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: Math.max(5, Math.round(tamanho * 0.2)),
        background: [
          "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.16) 100%)",
          `color-mix(in srgb, ${cor} 90%, transparent)`,
        ].join(", "),
        borderColor: `color-mix(in srgb, ${cor} 55%, #b8924d)`,
        boxShadow: [
          "inset 0 1px 1px rgba(255,255,255,0.35)",
          "inset 0 -1px 2px rgba(0,0,0,0.38)",
          `inset 0 0 8px color-mix(in srgb, ${cor} 55%, transparent)`,
          "0 3px 6px -2px rgba(7,22,43,0.45)",
        ].join(", "),
      }}
    />
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
