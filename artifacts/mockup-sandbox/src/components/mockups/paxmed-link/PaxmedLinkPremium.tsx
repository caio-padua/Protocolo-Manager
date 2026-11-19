import "./paxmed-link-premium.css";

/* ============================================================
   PaxMed · Prévia do link (WhatsApp / Telegram) — 1200 x 630
   Direção: "ouro escovado sobre placa bevel" (relevo Paxter).
   - Símbolo e nome: arte oficial em OURO ESCOVADO com alfa real
     (pacote Modelo 2B), na proporção original, sem esticar.
   - Cada peça fica numa placa SALIENTE (bevel): topo reto iluminado,
     laterais chanfradas, aro dourado e sombra de base.
   - Luz: faixa fina que corre SÓ dentro do corpo do metal (mask-image
     com a própria arte). Ciclo de 12 s. ?static=1 congela o raio
     dentro das letras (usado para gerar o JPG; prévia de link é imagem).
   ============================================================ */

const BASE = "/__mockup/images";
const SIM = `${BASE}/paxmed-link-simbolo.png`;
const NOME = `${BASE}/paxmed-link-nome.png`;

function Luz({ src, className }: { src: string; className: string }) {
  const m = `url(${src})`;
  return (
    <div className={`pxp-luz ${className}`} aria-hidden style={{ WebkitMaskImage: m, maskImage: m }}>
      <i className="pxp-raio" />
    </div>
  );
}

export function PaxmedLinkPremium() {
  const estatico = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("static");
  return (
    <div className={`pxp-root${estatico ? " pxp-estatico" : ""}`} data-testid="paxmed-link-premium">
      <div className="pxp-tecido" aria-hidden />

      <div className="pxp-placa pxp-placa-sim">
        <div className="pxp-arte pxp-sim">
          <img src={SIM} alt="Símbolo PaxMed" />
          <Luz src={SIM} className="pxp-luz-sim" />
        </div>
      </div>

      <div className="pxp-coluna">
        <div className="pxp-placa pxp-placa-nome">
          <div className="pxp-arte pxp-nome">
            <img src={NOME} alt="PAXMED" />
            <Luz src={NOME} className="pxp-luz-nome" />
          </div>
        </div>

        <div className="pxp-texto">
          <p className="pxp-p1">
            Você tem acesso às suas prescrições, protocolos, agendamentos e muitas outras funcionalidades.
          </p>
          <p className="pxp-p2">
            O manual contém o passo a passo para instalar a ferramenta <em>PaxMed</em>.
          </p>
          <p className="pxp-confira"><i aria-hidden />Confira.<i aria-hidden /></p>
        </div>
      </div>
    </div>
  );
}

export default PaxmedLinkPremium;
