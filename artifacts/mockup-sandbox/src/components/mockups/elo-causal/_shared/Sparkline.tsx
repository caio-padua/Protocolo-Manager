import type { Marcador } from "../_dados";

/** Sparkline honesto: eixo X proporcional ao TEMPO real (mostra os vazios). */
export function Sparkline({
  m,
  w = 240,
  h = 62,
  stroke = "#d9b978",
}: {
  m: Marcador;
  w?: number;
  h?: number;
  stroke?: string;
}) {
  const pad = 6;
  if (m.serie.length === 0) {
    return (
      <svg width={w} height={h}>
        <text x={w / 2} y={h / 2} textAnchor="middle" fontSize="10" fill="#64809f">
          sem coleta registrada
        </text>
      </svg>
    );
  }
  const vals = m.serie.map((p) => p.valor);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (m.refLow !== null) lo = Math.min(lo, m.refLow);
  if (m.refHigh !== null) hi = Math.max(hi, m.refHigh);
  const span = hi - lo || 1;
  lo -= span * 0.12;
  hi += span * 0.12;

  const ts = m.serie.map((p) => new Date(p.data + "T00:00:00").getTime());
  const t0 = ts[0];
  const t1 = ts[ts.length - 1];
  const tSpan = t1 - t0 || 1;

  const X = (t: number) => pad + ((t - t0) / tSpan) * (w - pad * 2);
  const Y = (v: number) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);

  const d = m.serie.map((p, i) => `${i === 0 ? "M" : "L"}${X(ts[i]).toFixed(1)},${Y(p.valor).toFixed(1)}`).join(" ");

  // faixa de referencia
  const bandTop = m.refHigh !== null ? Y(m.refHigh) : pad;
  const bandBot = m.refLow !== null ? Y(m.refLow) : h - pad;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <rect
        x={pad}
        y={Math.min(bandTop, bandBot)}
        width={w - pad * 2}
        height={Math.abs(bandBot - bandTop)}
        fill="rgba(95,199,154,0.10)"
        stroke="rgba(95,199,154,0.24)"
        strokeDasharray="3 3"
      />
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="elo-draw" />
      {m.serie.map((p, i) => {
        const last = i === m.serie.length - 1;
        return (
          <circle
            key={p.data}
            cx={X(ts[i])}
            cy={Y(p.valor)}
            r={last ? 4 : 2.6}
            fill={last ? stroke : "#0f2340"}
            stroke={stroke}
            strokeWidth={1.6}
          />
        );
      })}
    </svg>
  );
}
