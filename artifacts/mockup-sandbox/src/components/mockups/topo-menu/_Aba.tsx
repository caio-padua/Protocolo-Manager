import type { CSSProperties, ReactNode } from "react";
import "./_Aba.css";
import { Tela, Comandos, Chips, Grade, LetrasVidro } from "./_Moldura";

type P = {
  texto: string; caixa?: "titulo" | "alta"; fonte?: number; alturaFaixa?: number; alturaAba?: number; padX?: number;
  raio?: number; ombro?: number; espaco?: string; esq?: number; renteEsq?: boolean; vidro?: boolean; fantasmas?: string[]; ouro?: boolean;
};

export function AbaTela({ texto, caixa = "titulo", fonte = 13, alturaFaixa = 6, alturaAba = 26, padX = 16, raio = 9, ombro = 10, espaco = ".02em", esq = 18, renteEsq = false, vidro = false, fantasmas, ouro = false }: P) {
  const t = caixa === "alta" ? texto.toUpperCase() : texto;
  const st = { ["--r"]: `${raio}px`, ["--o"]: `${ombro}px`, height: alturaAba, padding: `0 ${padX}px`, fontSize: fonte, letterSpacing: espaco } as CSSProperties;
  const corpo: ReactNode = vidro ? <LetrasVidro texto={texto} px={fonte} mini /> : t;
  return (
    <Tela rente>
      <div className="ab-faixa" style={{ height: alturaFaixa + alturaAba, background: "transparent" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: alturaFaixa, background: "#12294c", boxShadow: "0 1px 0 rgba(201,162,74,.5)" }} />
        <div style={{ position: "absolute", left: renteEsq ? 0 : esq, top: alturaFaixa, display: "flex", alignItems: "flex-start", gap: 0 }}>
          {fantasmas && fantasmas.slice(0, 2).map((f) => <span key={f} className="ab-fantasma" style={{ marginTop: 0 }}>{f}</span>)}
          <div className={`ab-aba ${renteEsq ? "rente-esq" : ""}`} style={{ ...st, marginTop: -1 }}>
            {corpo}
            {ouro && <span className="ab-ouro" />}
          </div>
        </div>
      </div>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
