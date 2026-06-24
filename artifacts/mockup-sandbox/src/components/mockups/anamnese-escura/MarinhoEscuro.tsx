import { AnamneseLeva } from "../_shared/levaAnamnese";

// VERSAO LINHO B — "MARINHO ESCURO": mesma trama de linho do modelo aprovado,
// porem com um veu escuro por cima (navy mais fechado, sobrio) + sutil vinheta
// nas bordas, dando peso e requinte de tecido grosso.
export default function MarinhoEscuro() {
  return (
    <AnamneseLeva
      theme="dark"
      texture={
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: [
              // veu escuro chapado (fecha o navy)
              "linear-gradient(0deg, rgba(2,8,20,0.42), rgba(2,8,20,0.42))",
              // vinheta sutil nas bordas
              "radial-gradient(120% 90% at 50% 38%, transparent 55%, rgba(0,0,0,0.40) 100%)",
              // trama de linho (fios cruzados) um pouco mais fechada (3px)
              "repeating-linear-gradient(90deg, rgba(176,208,245,0.14) 0px, rgba(176,208,245,0.14) 1px, transparent 1px, transparent 3px)",
              "repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px)",
              "repeating-linear-gradient(0deg, rgba(176,208,245,0.11) 0px, rgba(176,208,245,0.11) 1px, transparent 1px, transparent 3px)",
              "repeating-linear-gradient(0deg, rgba(0,0,0,0.30) 1px, transparent 1px, transparent 3px)",
            ].join(","),
            opacity: 0.95,
          }}
        />
      }
    />
  );
}
