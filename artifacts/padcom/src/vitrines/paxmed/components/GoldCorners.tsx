/** Quatro cantos em L dourados com pulso suave, sobrepondo o painel. */
export function GoldCorners({
  inset = 12,
  size = 28,
  thickness = 2,
  className = "",
}: {
  inset?: number;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const positions = [
    { top: inset, left: inset, borderTop: true, borderLeft: true },
    { top: inset, right: inset, borderTop: true, borderRight: true },
    { bottom: inset, left: inset, borderBottom: true, borderLeft: true },
    { bottom: inset, right: inset, borderBottom: true, borderRight: true },
  ] as const;

  return (
    <div aria-hidden className={"pointer-events-none absolute inset-0 " + className}>
      {positions.map((p, i) => (
        <span
          key={i}
          className="absolute parxis-corner-pulse"
          style={{
            top: (p as any).top,
            left: (p as any).left,
            right: (p as any).right,
            bottom: (p as any).bottom,
            width: size,
            height: size,
            borderTop: (p as any).borderTop ? `${thickness}px solid var(--gold)` : undefined,
            borderBottom: (p as any).borderBottom ? `${thickness}px solid var(--gold)` : undefined,
            borderLeft: (p as any).borderLeft ? `${thickness}px solid var(--gold)` : undefined,
            borderRight: (p as any).borderRight ? `${thickness}px solid var(--gold)` : undefined,
          }}
        />
      ))}
    </div>
  );
}