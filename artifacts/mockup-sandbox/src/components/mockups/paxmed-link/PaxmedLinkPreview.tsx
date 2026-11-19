import "./paxmed-link.css";

/* ============================================================
   PaxMed · Prévia do link (WhatsApp / Telegram)
   Cartão 1200x630: logo e nome renderizados em metal dourado, com
   um raio de luz que percorre o corpo das letras (máscara do próprio
   recorte), copy com respiro entre linhas e fechamento "Confira.".
   O arquivo estático equivalente: /__mockup/images/paxmed-og-preview.jpg
   ============================================================ */

export function PaxmedLinkPreview() {
  const base = "/__mockup/images";
  return (
    <div className="pxl-root" data-testid="paxmed-link-preview">
      <div className="pxl-vidro" />

      <div className="pxl-logo">
        <img className="pxl-sym" src={`${base}/paxmed-og-sym.png`} alt="Símbolo PaxMed" />
        <img className="pxl-word" src={`${base}/paxmed-og-word.png`} alt="PAXMED" />
      </div>

      <div className="pxl-logo" aria-hidden>
        <div
          className="pxl-raio-mascara"
          style={{
            WebkitMaskImage: `url(${base}/paxmed-og-sym.png), url(${base}/paxmed-og-word.png)`,
            maskImage: `url(${base}/paxmed-og-sym.png), url(${base}/paxmed-og-word.png)`,
          }}
        >
          <div className="pxl-faixa principal" />
          <div className="pxl-faixa eco" />
        </div>
      </div>

      <div className="pxl-divisor" aria-hidden>
        <i /><b /><i />
      </div>

      <div className="pxl-texto">
        <p className="pxl-p1">
          Você tem acesso às suas prescrições, protocolos, agendamentos e muitas outras funcionalidades.
        </p>
        <p className="pxl-p2">O manual contém o passo a passo para instalar a ferramenta PaxMed.</p>
        <p className="pxl-confira">Confira.</p>
      </div>
    </div>
  );
}

export default PaxmedLinkPreview;
