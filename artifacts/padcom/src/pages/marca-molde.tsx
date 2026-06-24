import paxterSymbol from "@/assets/paxter-symbol.png";
import headlinePng from "@/assets/brand/paxter-headline.png";
import precisionPng from "@/assets/brand/paxter-precision.png";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";

/*
  MOLDE VISUAL DA MARCA PAXTER (decisao do CEO 24/06/2026).
  Folha-catalogo das 4 pecas oficiais, numeradas, com legenda e referencia de codigo.
  Esta pagina existe so para ser CAPTURADA em PNG e guardada na Skill
  (.agents/skills/skill-layout-paxter/references/marca/). Nao entra no menu.
*/

const CODE_DOC = ".agents/skills/skill-layout-paxter/references/marca/marca.md";

type Cell = {
  n: string;
  titulo: string;
  uso: string;
  code: string;
  bg: string;
  border: string;
  legendaDark: boolean;
  render: React.ReactNode;
};

const flatLogo = (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
    <img src={paxterSymbol} alt="PAXTER" style={{ height: 132, objectFit: "contain" }} draggable={false} />
    <img src={headlinePng} alt="PAXTER — Clinical Intelligence System" style={{ height: 70, objectFit: "contain" }} draggable={false} />
  </div>
);

const glassLogo = (tone: "dark" | "light") => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
    <PaxterSymbolGlass size={120} tone={tone} />
    <img src={headlinePng} alt="PAXTER — Clinical Intelligence System" style={{ height: 60, objectFit: "contain" }} draggable={false} />
    <img src={precisionPng} alt="Precision in integrative care" style={{ height: 22, objectFit: "contain" }} draggable={false} />
  </div>
);

const cells: Cell[] = [
  {
    n: "01",
    titulo: "Logo SEM vidro · fundo PRETO",
    uso: "Referencia / aplicacao sobre fundo escuro chapado",
    code: "branding/PaxterLogo.tsx (hero) + assets/paxter-symbol.png + brand/paxter-headline.png",
    bg: "#000000",
    border: "#2a2a2a",
    legendaDark: false,
    render: flatLogo,
  },
  {
    n: "02",
    titulo: "Logo SEM vidro · fundo BRANCO",
    uso: "Referencia / aplicacao sobre fundo claro chapado",
    code: "branding/PaxterLogo.tsx (hero) + assets/paxter-symbol.png + brand/paxter-headline.png",
    bg: "#ffffff",
    border: "#d8d2c4",
    legendaDark: true,
    render: flatLogo,
  },
  {
    n: "03",
    titulo: "Loginho COM vidro · fundo do SISTEMA",
    uso: "Cabecalho do app / telas escuras (sol + faisca)",
    code: "layout/paxter-fx/PaxterSymbolGlass.tsx (tone='dark') + branding/PaxterLogo.tsx (appHeader)",
    bg: "linear-gradient(160deg,#0d1b2a 0%,#0a1622 60%,#0e2230 100%)",
    border: "#1d3a4f",
    legendaDark: false,
    render: glassLogo("dark"),
  },
  {
    n: "04",
    titulo: "Loginho COM vidro · fundo BEGE (anamnese clara)",
    uso: "Pagina da anamnese clara — medalhao champanhe",
    code: "layout/paxter-fx/PaxterSymbolGlass.tsx (tone='light') + branding/PaxterLogo.tsx (appHeader, tone='light')",
    bg: "linear-gradient(160deg,#efe6d2 0%,#e7dac3 55%,#ddcdae 100%)",
    border: "#cbb88f",
    legendaDark: true,
    render: glassLogo("light"),
  },
];

export default function MarcaMolde() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#16181c",
        color: "#e9e4d8",
        fontFamily: "'Inter','Segoe UI',sans-serif",
        padding: "40px 48px 56px",
      }}
    >
      <header style={{ marginBottom: 28, borderBottom: "1px solid #2c2f36", paddingBottom: 18 }}>
        <div style={{ fontSize: 13, letterSpacing: 6, color: "#c9a14a", fontWeight: 600 }}>
          MOLDE VISUAL DA MARCA
        </div>
        <h1 style={{ fontSize: 30, margin: "6px 0 4px", letterSpacing: 2, fontWeight: 700 }}>
          PAXTER — Catalogo de Logos
        </h1>
        <div style={{ fontSize: 13, color: "#9aa0a8" }}>
          4 pecas oficiais · numeradas · com legenda e referencia de codigo · 24/06/2026
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 28,
        }}
      >
        {cells.map((c) => (
          <div
            key={c.n}
            style={{
              border: "1px solid #2c2f36",
              borderRadius: 10,
              overflow: "hidden",
              background: "#1c1f24",
              boxShadow: "0 8px 28px rgba(0,0,0,.35)",
            }}
          >
            <div
              style={{
                position: "relative",
                height: 320,
                background: c.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderBottom: `1px solid ${c.border}`,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 14,
                  left: 14,
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: "rgba(201,161,74,.92)",
                  color: "#1a1407",
                  fontWeight: 800,
                  fontSize: 17,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,.4)",
                }}
              >
                {c.n}
              </span>
              {c.render}
            </div>

            <div style={{ padding: "16px 18px 18px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f2ead9", marginBottom: 4 }}>
                {c.n} · {c.titulo}
              </div>
              <div style={{ fontSize: 13, color: "#a7adb6", marginBottom: 10 }}>{c.uso}</div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono','Courier New',monospace",
                  color: "#c9a14a",
                  background: "#121419",
                  border: "1px solid #2c2f36",
                  borderRadius: 6,
                  padding: "8px 10px",
                  wordBreak: "break-word",
                }}
              >
                {c.code}
              </div>
            </div>
          </div>
        ))}
      </div>

      <footer
        style={{
          marginTop: 30,
          paddingTop: 16,
          borderTop: "1px solid #2c2f36",
          fontSize: 13,
          color: "#9aa0a8",
        }}
      >
        Codigos e detalhes de cada peca em:{" "}
        <span style={{ color: "#c9a14a", fontFamily: "'JetBrains Mono',monospace" }}>{CODE_DOC}</span>
      </footer>
    </div>
  );
}
