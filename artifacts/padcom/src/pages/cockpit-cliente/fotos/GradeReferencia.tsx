// Grade de referencia sobre a foto. Com a altura informada, cada quadrado mede 10 cm (calibrada pelas
// linhas de cabeca e pes); sem altura, grade uniforme sem medida. So vale com o mesmo enquadramento.
export type ConfigGrade = { ligada: boolean; alturaCm: number | null; topoPct: number; pesPct: number };

const L = 300, A = 400;

export function GradeReferencia({ cfg }: { cfg: ConfigGrade }) {
  if (!cfg.ligada) return null;
  const topo = (cfg.topoPct / 100) * A, pes = (cfg.pesPct / 100) * A;
  const calibrada = cfg.alturaCm != null && cfg.alturaCm > 0 && pes > topo;
  const linhasH: { y: number; rot?: string }[] = [];
  const linhasV: number[] = [];
  if (calibrada) {
    const q = ((pes - topo) / cfg.alturaCm!) * 10;
    for (let k = 0; pes - k * q >= 0; k++) linhasH.push({ y: pes - k * q, rot: k % 5 === 0 ? `${k * 10} cm` : undefined });
    for (let k = 1; pes + k * q <= A; k++) linhasH.push({ y: pes + k * q });
    for (let k = 0; 150 + k * q <= L; k++) { linhasV.push(150 + k * q); if (k) linhasV.push(150 - k * q); }
  } else {
    for (let i = 0; i <= 16; i++) linhasH.push({ y: (A / 16) * i });
    for (let i = 0; i <= 12; i++) linhasV.push((L / 12) * i);
  }
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <g stroke="#d4af37" strokeOpacity="0.55" strokeWidth="0.8" vectorEffect="non-scaling-stroke">
        {linhasH.map((l, i) => <line key={`h${i}`} x1="0" x2={L} y1={l.y} y2={l.y} vectorEffect="non-scaling-stroke" />)}
        {linhasV.map((x, i) => <line key={`v${i}`} y1="0" y2={A} x1={x} x2={x} vectorEffect="non-scaling-stroke" />)}
      </g>
      {calibrada && linhasH.filter((l) => l.rot).map((l, i) => (
        <text key={i} x="3" y={l.y - 2} fontSize="8" fill="#d4af37" stroke="#000" strokeWidth="0.4" paintOrder="stroke">{l.rot}</text>
      ))}
      {calibrada && (
        <g stroke="#22d3ee" strokeWidth="1.4" vectorEffect="non-scaling-stroke">
          <line x1="0" x2={L} y1={topo} y2={topo} vectorEffect="non-scaling-stroke" />
          <line x1="0" x2={L} y1={pes} y2={pes} vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </svg>
  );
}
