import React, { useId } from "react";

export type WordmarkProps = {
  theme?: "dark" | "light";
  size?: number; // width in pixels
  className?: string;
};

// ============================================================================
// HELPERS PARA CORES (Reutilizando gradientes de paxter3d.ts indiretamente via SVG)
// ============================================================================
const GOLD_GRADIENTS = {
  dark: { top: "#f4e2a8", mid: "#c2a05a", deep: "#8a6d2f" },
  light: { top: "#d8b765", mid: "#a07d34", deep: "#6f5421" }, // Ouro mais profundo para contraste no light
};

function useGoldGradient(theme: "dark" | "light") {
  const uid = useId().replace(/:/g, "");
  const gid = `gold-${uid}`;
  const filterId = `shadow-${uid}`;
  const colors = GOLD_GRADIENTS[theme];
  return { gid, filterId, colors };
}

function Defs({ theme, gid, filterId, colors }: any) {
  return (
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={colors.top} />
        <stop offset="45%" stopColor={colors.mid} />
        <stop offset="100%" stopColor={colors.deep} />
      </linearGradient>
      {/* Sombra sutil para relevo */}
      <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.4)" />
        {/* Brilho interno (bevel) */}
        <feComponentTransfer>
          <feFuncA type="linear" slope="1" />
        </feComponentTransfer>
      </filter>
    </defs>
  );
}

// viewBox padrão para todas
const VB = "0 0 500 100";

// ============================================================================
// MODELO 1: GEOMÉTRICO ENGENHEIRADO (Hastes precisas, P vazado)
// ============================================================================
// Letras com cortes retos e ângulos agudos. O "P" não fecha a contraforma.
export function WordmarkModelo1({ theme = "dark", size = 200, className = "" }: WordmarkProps) {
  const { gid, filterId, colors } = useGoldGradient(theme);
  
  // P
  const pathP = "M20 20 L50 20 C75 20 85 35 85 50 C85 65 75 75 50 75 L40 75 L40 85 L20 85 Z M40 35 L40 60 L50 60 C60 60 65 55 65 50 C65 45 60 40 50 40 L45 40 Z";
  // A (shifted left by 25)
  const pathA = "M95 85 L120 20 L140 20 L165 85 L145 85 L138 65 L122 65 L115 85 Z M130 40 L125 53 L135 53 Z";
  // X (shifted left by 30)
  const pathX = "M180 20 L200 20 L215 45 L230 20 L250 20 L225 55 L255 85 L235 85 L215 65 L195 85 L175 85 L205 55 Z";
  // T (shifted left by 35)
  const pathT = "M265 20 L315 20 L315 35 L300 35 L300 85 L280 85 L280 35 L265 35 Z";
  // E (shifted left by 40)
  const pathE = "M330 20 L380 20 L380 35 L350 35 L350 45 L375 45 L375 60 L350 60 L350 70 L385 70 L385 85 L330 85 Z";
  // R (shifted left by 45)
  const pathR = "M400 20 L435 20 C455 20 465 30 465 45 C465 55 455 60 445 60 L470 85 L445 85 L425 65 L420 65 L420 85 L400 85 Z M420 35 L420 50 L435 50 C443 50 445 48 445 45 C445 42 443 35 435 35 Z";

  return (
    <svg viewBox={VB} width={size} className={className} filter={`url(#${filterId})`}>
      <Defs theme={theme} gid={gid} filterId={filterId} colors={colors} />
      <path d={`${pathP} ${pathA} ${pathX} ${pathT} ${pathE} ${pathR}`} fill={`url(#${gid})`} />
    </svg>
  );
}

// ============================================================================
// MODELO 2: SERIFA DIDONE (Alto contraste, alta-costura)
// ============================================================================
// Hastes verticais bem grossas, horizontais e serifas bem finas.
export function WordmarkModelo2({ theme = "dark", size = 200, className = "" }: WordmarkProps) {
  const { gid, filterId, colors } = useGoldGradient(theme);
  
  const pathP = "M20 20 L55 20 C80 20 90 35 90 48 C90 65 75 72 55 72 L42 72 L42 82 L55 82 L55 85 L15 85 L15 82 L28 82 L28 23 L15 23 Z M42 23 L42 69 L53 69 C67 69 74 61 74 48 C74 35 65 23 53 23 Z";
  const pathA = "M100 85 L100 82 L110 82 L125 20 L143 20 L163 82 L173 82 L173 85 L140 85 L140 82 L147 82 L143 68 L117 68 L113 82 L120 82 L120 85 Z M130 28 L120 65 L140 65 Z";
  const pathX = "M180 20 L180 23 L190 23 L208 52 L190 82 L175 82 L175 85 L210 85 L210 82 L202 82 L216 58 L232 82 L225 82 L225 85 L260 85 L260 82 L248 82 L224 48 L245 23 L255 23 L255 20 L220 20 L220 23 L228 23 L212 43 L198 23 L205 23 L205 20 Z";
  const pathT = "M265 20 L335 20 L335 30 L332 30 L330 23 L308 23 L308 82 L320 82 L320 85 L280 85 L280 82 L292 82 L292 23 L270 23 L268 30 L265 30 Z";
  const pathE = "M340 20 L395 20 L395 28 L392 28 L390 23 L358 23 L358 48 L380 48 L382 42 L385 42 L385 58 L382 58 L380 52 L358 52 L358 82 L390 82 L392 75 L395 75 L395 85 L340 85 Z";
  const pathR = "M405 20 L440 20 C465 20 475 32 475 45 C475 56 465 65 447 68 L465 82 L477 82 L477 85 L445 85 L427 68 L423 68 L423 82 L435 82 L435 85 L395 85 L395 82 L407 82 L407 23 L395 23 Z M423 23 L423 65 L437 65 C453 65 459 57 459 45 C459 32 453 23 437 23 Z";

  return (
    <svg viewBox={VB} width={size} className={className} filter={`url(#${filterId})`}>
      <Defs theme={theme} gid={gid} filterId={filterId} colors={colors} />
      <path d={`${pathP} ${pathA} ${pathX} ${pathT} ${pathE} ${pathR}`} fill={`url(#${gid})`} />
    </svg>
  );
}

// ============================================================================
// MODELO 3: STENCIL (Recorte técnico, ar de instrumento)
// ============================================================================
// Letras com "pontes" (gaps) que remetem a moldes industriais ou precisão militar.
export function WordmarkModelo3({ theme = "dark", size = 200, className = "" }: WordmarkProps) {
  const { gid, filterId, colors } = useGoldGradient(theme);

  const stencilP = "M20 20 L50 20 C70 20 80 30 80 45 C80 58 70 65 50 65 L40 65 L40 85 L20 85 L20 70 L20 50 L20 20 Z M40 35 L40 50 L50 50 C58 50 60 48 60 45 C60 42 58 35 50 35 Z M18 55 L38 55 L38 65 L18 65 Z"; 
  const stencilA = "M120 20 L140 20 L160 70 L140 70 L130 45 L110 45 L100 70 L80 70 Z M130 40 L115 40 L122 25 Z M75 75 L165 75 L165 85 L75 85 Z";
  const stencilX = "M180 20 L200 20 L215 40 L230 20 L250 20 L225 50 L255 85 L235 85 L210 58 L185 85 L165 85 L200 45 Z M190 52 L240 52 L240 58 L190 58 Z";
  const stencilT = "M265 20 L315 20 L315 35 L300 35 L300 60 L280 60 L280 35 L265 35 Z M280 65 L300 65 L300 85 L280 85 Z";
  const stencilE = "M330 20 L380 20 L380 35 L350 35 L350 45 L375 45 L375 60 L350 60 L350 70 L385 70 L385 85 L330 85 Z M325 48 L345 48 L345 55 L325 55 Z";
  const stencilR = "M400 20 L430 20 C450 20 460 30 460 45 C460 55 450 62 435 65 L460 85 L435 85 L415 68 L420 68 L420 85 L400 85 Z M420 35 L420 52 L430 52 C440 52 440 48 440 45 C440 40 437 35 430 35 Z M395 60 L415 60 L415 68 L395 68 Z";

  return (
    <svg viewBox={VB} width={size} className={className} filter={`url(#${filterId})`}>
      <Defs theme={theme} gid={gid} filterId={filterId} colors={colors} />
      <path fillRule="evenodd" clipRule="evenodd" d={`${stencilP} ${stencilA} ${stencilX} ${stencilT} ${stencilE} ${stencilR}`} fill={`url(#${gid})`} />
    </svg>
  );
}

// ============================================================================
// MODELO 4: GRAVADO INLINE (Medalha cunhada com linha dupla)
// ============================================================================
// Letras largas com um "sulco" vazado no meio.
export function WordmarkModelo4({ theme = "dark", size = 200, className = "" }: WordmarkProps) {
  const { gid, filterId, colors } = useGoldGradient(theme);

  const inlineP = "M20 20 L55 20 C80 20 90 35 90 50 C90 65 80 80 55 80 L45 80 L45 85 L20 85 Z M45 40 L45 60 L55 60 C65 60 65 55 65 50 C65 45 65 40 55 40 Z  M25 25 L25 80 L40 80 L40 75 L55 75 C75 75 85 62 85 50 C85 38 75 25 55 25 Z M55 45 C62 45 62 48 62 50 C62 52 62 55 55 55 L40 55 L40 45 Z";
  const inlineA = "M120 20 L140 20 L170 85 L145 85 L138 65 L112 65 L105 85 L80 85 Z M130 35 L120 55 L140 55 Z M115 25 L135 25 L135 50 L115 50 Z";
  const inlineX = "M180 20 L200 20 L215 45 L230 20 L250 20 L225 55 L255 85 L235 85 L215 65 L195 85 L175 85 L205 55 Z M190 25 L202 42 L190 58 L205 58 L215 48 L225 58 L240 58 L228 42 L240 25 L225 25 L215 38 L205 25 Z";
  const inlineT = "M265 20 L325 20 L325 35 L305 35 L305 85 L285 85 L285 35 L265 35 Z M270 25 L320 25 L320 30 L300 30 L300 80 L290 80 L290 30 L270 30 Z";
  const inlineE = "M340 20 L395 20 L395 35 L365 35 L365 45 L390 45 L390 60 L365 60 L365 70 L400 70 L400 85 L340 85 Z M345 25 L390 25 L390 30 L360 30 L360 50 L385 50 L385 55 L360 55 L360 75 L395 75 L395 80 L345 80 Z";
  const inlineR = "M410 20 L445 20 C470 20 480 30 480 45 C480 55 470 60 460 62 L485 85 L460 85 L440 65 L430 65 L430 85 L410 85 Z M430 35 L430 50 L445 50 C455 50 455 48 455 45 C455 42 455 35 445 35 Z M415 25 L440 25 C460 25 475 32 475 45 C475 52 470 57 460 58 L475 80 L450 80 L430 60 L415 60 L415 80 L410 80 Z M425 30 L425 55 L445 55 C460 55 460 50 460 45 C460 40 460 30 445 30 Z";

  return (
    <svg viewBox={VB} width={size} className={className} filter={`url(#${filterId})`}>
      <Defs theme={theme} gid={gid} filterId={filterId} colors={colors} />
      <path fillRule="evenodd" clipRule="evenodd" d={`${inlineP} ${inlineA} ${inlineX} ${inlineT} ${inlineE} ${inlineR}`} fill={`url(#${gid})`} />
    </svg>
  );
}

// ============================================================================
// MODELO 5: MONOLITO ESCULTURAL (Encorpado, cantos chanfrados / bevel)
// ============================================================================
// Formas super robustas, sem pontas finas, como blocos de metal maciço.
export function WordmarkModelo5({ theme = "dark", size = 200, className = "" }: WordmarkProps) {
  const { gid, filterId, colors } = useGoldGradient(theme);

  const monoP = "M20 20 L50 20 L60 25 L80 35 L85 45 L85 55 L80 65 L60 75 L45 75 L40 75 L40 85 L20 85 Z M40 35 L40 60 L50 60 L60 55 L60 45 L50 35 Z";
  const monoA = "M120 20 L140 20 L170 85 L145 85 L138 65 L112 65 L105 85 L80 85 Z M130 40 L120 55 L140 55 Z";
  const monoX = "M180 20 L200 20 L220 45 L240 20 L260 20 L230 55 L260 85 L240 85 L220 65 L200 85 L180 85 L210 55 Z";
  const monoT = "M270 20 L330 20 L330 40 L310 40 L310 85 L290 85 L290 40 L270 40 Z";
  const monoE = "M340 20 L395 20 L395 35 L365 35 L365 45 L390 45 L390 60 L365 60 L365 70 L400 70 L400 85 L340 85 Z";
  const monoR = "M410 20 L440 20 L460 25 L475 35 L480 45 L480 55 L470 60 L485 85 L460 85 L445 65 L430 65 L430 85 L410 85 Z M430 35 L430 50 L445 50 L455 45 L445 35 Z";

  return (
    <svg viewBox={VB} width={size} className={className} filter={`url(#${filterId})`}>
      <Defs theme={theme} gid={gid} filterId={filterId} colors={colors} />
      <path fillRule="evenodd" clipRule="evenodd" d={`${monoP} ${monoA} ${monoX} ${monoT} ${monoE} ${monoR}`} fill={`url(#${gid})`} />
    </svg>
  );
}
