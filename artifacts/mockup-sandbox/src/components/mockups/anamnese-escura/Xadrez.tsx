import { AnamneseLeva } from "../_shared/levaAnamnese";

// VERSAO LINHO C — "XADREZ": quadriculado Principe de Gales (glen check) discreto,
// grade dupla (fina + media) cor de giz sobre o navy, com um sobre-check dourado
// raro por cima — referencia direta a tecido de alfaiataria.
export default function Xadrez() {
  return (
    <AnamneseLeva
      theme="dark"
      texture={
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: [
              // grade vertical agrupada (fina 0-1px, gap, media 4-5px)
              "repeating-linear-gradient(90deg, rgba(176,208,245,0.12) 0px, rgba(176,208,245,0.12) 1px, transparent 1px, transparent 4px, rgba(176,208,245,0.12) 4px, rgba(176,208,245,0.12) 5px, transparent 5px, transparent 22px)",
              // grade horizontal agrupada (espelha a vertical -> quadricula)
              "repeating-linear-gradient(0deg, rgba(176,208,245,0.12) 0px, rgba(176,208,245,0.12) 1px, transparent 1px, transparent 4px, rgba(176,208,245,0.12) 4px, rgba(176,208,245,0.12) 5px, transparent 5px, transparent 22px)",
              // sobre-check dourado raro (Principe de Gales)
              "repeating-linear-gradient(90deg, rgba(214,182,112,0.12) 0px, rgba(214,182,112,0.12) 1px, transparent 1px, transparent 44px)",
              "repeating-linear-gradient(0deg, rgba(214,182,112,0.12) 0px, rgba(214,182,112,0.12) 1px, transparent 1px, transparent 44px)",
            ].join(","),
            opacity: 0.92,
          }}
        />
      }
    />
  );
}
