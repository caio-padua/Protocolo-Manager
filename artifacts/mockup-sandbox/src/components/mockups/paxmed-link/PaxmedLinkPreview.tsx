import "./paxmed-link.css";

/* ============================================================
   PaxMed · Prévia do link (WhatsApp / Telegram) — 1200 x 630
   Direção: "metal sobre vidro" no terno risca de giz Paxter.
   - Logo e nome: ARTE OFICIAL recortada (nunca redesenhada).
   - Luz: duas camadas (pólvora fina + sol largo), recortadas pela
     própria silhueta da arte via mask-image + screen. A luz só
     existe dentro do corpo das letras. Ciclo de 12 s, igual ao
     do símbolo e do nome no sistema (sincronia, sem piscar).
   - ?static=1 congela o raio dentro das letras (usado para gerar
     o JPG que o WhatsApp mostra; a prévia de link é sempre imagem).
   ============================================================ */

const BASE = "/__mockup/images";
const MASCARA = `url(${BASE}/paxmed-og-sym.png), url(${BASE}/paxmed-og-word.png)`;

export function PaxmedLinkPreview() {
  const estatico = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("static");

  return (
    <div className={`pxl-root${estatico ? " pxl-estatico" : ""}`} data-testid="paxmed-link-preview">
      <div className="pxl-tecido" aria-hidden />

      <div className="pxl-vidro" aria-hidden>
        <i className="pxl-canto c1" /><i className="pxl-canto c2" /><i className="pxl-canto c3" /><i className="pxl-canto c4" />
      </div>

      <div className="pxl-halo" aria-hidden />

      <div className="pxl-lockup">
        <img className="pxl-sym" src={`${BASE}/paxmed-og-sym.png`} alt="Símbolo PaxMed" />
        <img className="pxl-word" src={`${BASE}/paxmed-og-word.png`} alt="PAXMED" />
        <div className="pxl-luz" aria-hidden style={{ WebkitMaskImage: MASCARA, maskImage: MASCARA }}>
          <div className="pxl-polvora" />
          <div className="pxl-sol" />
        </div>
      </div>

      <div className="pxl-divisor" aria-hidden><i /><b /><i /></div>

      <div className="pxl-texto">
        <p className="pxl-p1">
          Você tem acesso às suas prescrições, protocolos, agendamentos e muitas outras funcionalidades.
        </p>
        <p className="pxl-p2">
          O manual contém o passo a passo para instalar a ferramenta <em>PaxMed</em>.
        </p>
        <p className="pxl-confira"><i aria-hidden />Confira.<i aria-hidden /></p>
      </div>
    </div>
  );
}

export default PaxmedLinkPreview;
