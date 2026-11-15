import { useMemo } from "react";
import { dz } from "./tipos";

// Volante por toque: cada dezena e um botao (aria-pressed), alvo minimo de 44 px, foco visivel, operavel por teclado.
// Sem rolagem horizontal: a grade se adapta a largura (auto-fill). O volante so marca; quem valida e precifica e o servidor.
export default function Volante({ min, max, marcadas, maximo, onAlternar, nome }: {
  min: number; max: number; marcadas: number[]; maximo: number; onAlternar: (n: number) => void; nome: string;
}) {
  const numeros = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  const set = useMemo(() => new Set(marcadas), [marcadas]);
  const cheio = marcadas.length >= maximo;
  return (
    <div
      role="group" aria-label={`Volante da ${nome}: ${marcadas.length} de até ${maximo} dezenas marcadas`}
      className="concave-3d rounded-xl p-3 grid gap-2" data-testid="mj-volante"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", justifyItems: "center" }}
    >
      {numeros.map((n) => {
        const on = set.has(n);
        return (
          <button
            key={n} type="button" className="mj-bola" aria-pressed={on} aria-label={`Dezena ${dz(n)}`}
            disabled={!on && cheio} data-testid={`mj-bola-${n}`} onClick={() => onAlternar(n)}
          >
            {dz(n)}
          </button>
        );
      })}
    </div>
  );
}
