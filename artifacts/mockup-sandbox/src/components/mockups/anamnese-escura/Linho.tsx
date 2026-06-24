import { AnamneseLeva } from "../_shared/levaAnamnese";

// MODELO 1 — "LINHO MARINHO": trama de tecido (fios cruzados) visível sobre o navy.
// Fios verticais (luz) + horizontais (sombra) em periodo de 3px -> leitura de pano.
export default function Linho() {
  return (
    <AnamneseLeva
      theme="dark"
      texture={
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: [
              "repeating-linear-gradient(90deg, rgba(176,208,245,0.16) 0px, rgba(176,208,245,0.16) 1px, transparent 1px, transparent 4px)",
              "repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 4px)",
              "repeating-linear-gradient(0deg, rgba(176,208,245,0.13) 0px, rgba(176,208,245,0.13) 1px, transparent 1px, transparent 4px)",
              "repeating-linear-gradient(0deg, rgba(0,0,0,0.24) 1px, transparent 1px, transparent 4px)",
            ].join(","),
            opacity: 0.9,
          }}
        />
      }
    />
  );
}
