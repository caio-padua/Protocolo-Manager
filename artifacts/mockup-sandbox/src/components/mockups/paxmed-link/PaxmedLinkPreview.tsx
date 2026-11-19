import "./paxmed-link.css";

/* ============================================================
   PaxMed · Prévia do link (WhatsApp / Telegram) — 1200 x 630
   v3 — terno risca de giz + painéis UP BEVEL (padrão "Médicos Assistentes").
   - Fundo: terno risca de giz navy (receita .dark .leva-fabric do sistema:
     linha principal 1.5px + companheira 0.5px, ciclo 22px). É o TECIDO.
   - Por cima: painéis SALIENTES (up bevel) que deslizam sobre o tecido:
     navy em degradê, topo iluminado, aro fino azulado, poço escuro (concavo)
     para a marca, igual ao print aprovado.
   - Símbolo e nome: arte oficial em ouro escovado, sem esticar. A luz corre
     SÓ dentro do corpo do metal (mask-image da própria arte), ciclo de 7 s.
   - ?static=1 congela o raio dentro das letras (gera o JPG; prévia de link é imagem).
   ============================================================ */

const BASE = "/__mockup/images";
const SIM = `${BASE}/paxmed-link-simbolo.png`;
const NOME = `${BASE}/paxmed-link-nome.png`;

function Luz({ src, className }: { src: string; className: string }) {
  const m = `url(${src})`;
  return (
    <div className={`pxl-luz ${className}`} aria-hidden style={{ WebkitMaskImage: m, maskImage: m }}>
      <i className="pxl-raio" />
    </div>
  );
}

export function PaxmedLinkPreview() {
  const estatico = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("static");
  return (
    <div className={`pxl-root${estatico ? " pxl-estatico" : ""}`} data-testid="paxmed-link-preview">
      <div className="pxl-tecido" aria-hidden />

      {/* PAINEL DO SÍMBOLO */}
      <section className="pxl-painel pxl-painel-sim">
        <div className="pxl-poco pxl-poco-sim">
          <div className="pxl-arte pxl-sim">
            <img src={SIM} alt="Símbolo PaxMed" />
            <Luz src={SIM} className="pxl-luz-sim" />
          </div>
        </div>
      </section>

      {/* PAINEL DO NOME + TEXTO */}
      <section className="pxl-painel pxl-painel-txt">
        <div className="pxl-poco pxl-poco-nome">
          <div className="pxl-arte pxl-nome">
            <img src={NOME} alt="PAXMED" />
            <Luz src={NOME} className="pxl-luz-nome" />
          </div>
        </div>

        <div className="pxl-texto">
          <p className="pxl-p1">
            Você tem acesso às suas prescrições, protocolos, agendamentos e muitas outras funcionalidades.
          </p>
          <p className="pxl-p2">O manual contém o passo a passo para instalar o APP PaxMed.</p>
          <p className="pxl-confira"><i aria-hidden />Confira.<i aria-hidden /></p>
        </div>
      </section>
    </div>
  );
}

export default PaxmedLinkPreview;
