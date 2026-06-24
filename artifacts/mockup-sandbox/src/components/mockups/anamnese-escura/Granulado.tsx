import { AnamneseLeva } from "../_shared/levaAnamnese";

// MODELO 2 — "GRANULADO": grão de tecido (ruído fractal) + sarja diagonal sutil.
// Tile de ruído escalado (180px) p/ sobreviver ao downscale no celular.
const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

export default function Granulado() {
  return (
    <AnamneseLeva
      theme="dark"
      texture={
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: [
              `url("${NOISE}")`,
              "repeating-linear-gradient(45deg, rgba(176,208,245,0.07) 0px, rgba(176,208,245,0.07) 1px, transparent 1px, transparent 6px)",
            ].join(","),
            backgroundSize: "150px 150px, auto",
            mixBlendMode: "overlay",
            opacity: 0.4,
          }}
        />
      }
    />
  );
}
