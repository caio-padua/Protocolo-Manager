import React from "react";

// ============================================================================
// LOCKUP OFICIAL PAXTER — fiel a logo aprovada (anexo do CEO).
// Serifa engravada (Cinzel) com FACE de ouro polido em bandas + EXTRUSAO para
// baixo (relevo "saliente"/sobressalente). Reproduz o nome PAXTER e as 2 frases
// ("Clinical Intelligence System" e "PRECISION IN INTEGRATIVE CARE") em ouro 3D.
// 100% CSS/vetorial -> escalavel e animavel (nao e PNG).
// ============================================================================

export const LOCKUP_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800;900&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap');

/* ---------- FACE de ouro polido (bandas de reflexo) ---------- */
.gold-face-dark {
  background: linear-gradient(180deg,
    #fff6d5 0%, #ecd185 9%, #bd933f 24%, #7c5f28 39%,
    #f3e3a0 51%, #c79a44 63%, #896a2f 79%, #dabf74 91%, #f8ecd0 100%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
.gold-face-light {
  background: linear-gradient(180deg,
    #f0d68f 0%, #c79a44 12%, #8a6a2f 30%, #5f4720 42%,
    #d4af52 53%, #a07d34 66%, #6f5421 82%, #b89343 93%, #d8b765 100%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ---------- EXTRUSAO 3D (relevo saliente para baixo) ---------- */
.relief-xl-dark {
  text-shadow:
    0 -1px 0 rgba(255,252,235,0.55),
    0 1px 0 #c9a24e, 0 2px 0 #a8842f, 0 3px 0 #8a6d2f,
    0 4px 0 #6f5421, 0 5px 0 #5a4419, 0 6px 0 #4a3714,
    0 8px 14px rgba(0,0,0,0.55), 0 2px 3px rgba(0,0,0,0.4);
}
.relief-xl-light {
  text-shadow:
    0 -1px 0 rgba(255,252,235,0.65),
    0 1px 0 #b8923f, 0 2px 0 #9c7a30, 0 3px 0 #806326,
    0 4px 0 #654d1c, 0 5px 0 #4f3c15,
    0 7px 12px rgba(60,42,12,0.40), 0 2px 3px rgba(60,42,12,0.30);
}
.relief-md-dark {
  text-shadow:
    0 -0.5px 0 rgba(255,252,235,0.5),
    0 1px 0 #a8842f, 0 2px 0 #8a6d2f, 0 3px 0 #6f5421,
    0 5px 9px rgba(0,0,0,0.5);
}
.relief-md-light {
  text-shadow:
    0 -0.5px 0 rgba(255,252,235,0.6),
    0 1px 0 #9c7a30, 0 2px 0 #806326, 0 3px 0 #654d1c,
    0 5px 8px rgba(60,42,12,0.35);
}
.relief-sm-dark {
  text-shadow: 0 1px 0 #8a6d2f, 0 2px 0 #6f5421, 0 3px 6px rgba(0,0,0,0.45);
}
.relief-sm-light {
  text-shadow: 0 1px 0 #806326, 0 2px 0 #654d1c, 0 3px 5px rgba(60,42,12,0.3);
}

/* ---------- Tipos ---------- */
.font-cinzel { font-family: 'Cinzel', serif; }
.font-cormorant { font-family: 'Cormorant Garamond', serif; }

.pax-word {
  font-family: 'Cinzel', serif;
  font-weight: 800;
  letter-spacing: 0.14em;
  line-height: 1;
  display: inline-block;
}
.pax-cis {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.1;
  display: inline-block;
}
.pax-precision {
  font-family: 'Cinzel', serif;
  font-weight: 600;
  letter-spacing: 0.34em;
  line-height: 1;
  display: inline-block;
}
.pax-fine {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* divisor com losango central */
.pax-rule { height: 1px; flex: 1; }
.pax-rule-dark { background: linear-gradient(90deg, rgba(194,160,90,0) 0%, rgba(194,160,90,0.7) 50%, rgba(194,160,90,0) 100%); }
.pax-rule-light { background: linear-gradient(90deg, rgba(138,106,47,0) 0%, rgba(138,106,47,0.6) 50%, rgba(138,106,47,0) 100%); }
`;

type Theme = "dark" | "light";

function suffix(theme: Theme) {
  return theme === "dark" ? "dark" : "light";
}

/* Nome PAXTER isolado (escalavel via fontSize) */
export function PaxterWord({ theme = "dark", fontSize = 64 }: { theme?: Theme; fontSize?: number }) {
  const s = suffix(theme);
  return (
    <span
      className={`pax-word gold-face-${s} relief-xl-${s}`}
      style={{ fontSize }}
    >
      PAXTER
    </span>
  );
}

/* Frase 1 */
export function PaxterCIS({ theme = "dark", fontSize = 26 }: { theme?: Theme; fontSize?: number }) {
  const s = suffix(theme);
  return (
    <span className={`pax-cis gold-face-${s} relief-md-${s}`} style={{ fontSize }}>
      Clinical Intelligence System
    </span>
  );
}

/* Frase 2 */
export function PaxterPrecision({ theme = "dark", fontSize = 15 }: { theme?: Theme; fontSize?: number }) {
  const s = suffix(theme);
  return (
    <span className={`pax-precision gold-face-${s} relief-sm-${s}`} style={{ fontSize }}>
      PRECISION IN INTEGRATIVE CARE
    </span>
  );
}

/* Linha fina descritiva */
export function PaxterFineLine({ theme = "dark", fontSize = 15 }: { theme?: Theme; fontSize?: number }) {
  const s = suffix(theme);
  return (
    <span className={`pax-fine gold-face-${s}`} style={{ fontSize }}>
      AI-guided prescriptions, exams and injectable protocols.
    </span>
  );
}

/* Lockup completo (nome + 2 frases + divisor + linha fina) */
export function PaxterLockup({
  theme = "dark",
  wordSize = 70,
}: {
  theme?: Theme;
  wordSize?: number;
}) {
  const s = suffix(theme);
  return (
    <div className="flex flex-col items-center text-center w-full">
      <PaxterWord theme={theme} fontSize={wordSize} />
      <div className="mt-3">
        <PaxterCIS theme={theme} fontSize={wordSize * 0.38} />
      </div>
      <div className="flex items-center gap-3 w-full max-w-[320px] mt-4 mb-3">
        <span className={`pax-rule pax-rule-${s}`} />
        <span className={`gold-face-${s} relief-sm-${s}`} style={{ fontSize: 12 }}>◆</span>
        <span className={`pax-rule pax-rule-${s}`} />
      </div>
      <PaxterPrecision theme={theme} fontSize={wordSize * 0.21} />
      <div className="mt-3">
        <PaxterFineLine theme={theme} fontSize={wordSize * 0.21} />
      </div>
    </div>
  );
}
