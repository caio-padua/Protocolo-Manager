import { AnamneseLeva } from "../_shared/levaAnamnese";

// VERSAO LINHO A — "TERNO": risca de giz (pinstripe) + sarja diagonal (twill).
// Lê como tecido de terno fino: listras verticais discretas cor de giz quente
// sobre uma trama diagonal de la (45deg), mantendo o navy do linho aprovado.
export default function Terno() {
  return (
    <AnamneseLeva
      theme="dark"
      texture={
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: [
              // risca de giz vertical (chalk stripe) — discreta, quente
              "repeating-linear-gradient(90deg, rgba(214,198,162,0.12) 0px, rgba(214,198,162,0.12) 1px, transparent 1px, transparent 18px)",
              // sarja / twill diagonal (fios de la cruzados a 45deg)
              "repeating-linear-gradient(45deg, rgba(176,208,245,0.08) 0px, rgba(176,208,245,0.08) 1px, transparent 1px, transparent 4px)",
              "repeating-linear-gradient(45deg, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 4px)",
            ].join(","),
            opacity: 0.92,
          }}
        />
      }
    />
  );
}
