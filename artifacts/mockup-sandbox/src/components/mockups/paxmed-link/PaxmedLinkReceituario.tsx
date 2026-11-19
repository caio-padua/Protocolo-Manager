import "./paxmed-link-receituario.css";

/* Variante "Receituário": papel marfim + lombada navy.
   Duas faixas horizontais: placa navy em relevo (símbolo + nome, sem moldura) sobre a folha marfim com o índice. */

const BASE = "/__mockup/images";
const SIM = `${BASE}/paxmed-link-simbolo.png`;
const NOME = `${BASE}/paxmed-link-nome.png`;

function Luz({ src }: { src: string }) {
  const m = `url(${src})`;
  return (
    <div className="plr-luz" aria-hidden style={{ WebkitMaskImage: m, maskImage: m }}>
      <i className="plr-raio" />
    </div>
  );
}

const ITENS = [
  { n: "01", t: "Prescrições", d: "suas receitas, sempre à mão" },
  { n: "02", t: "Protocolos", d: "o plano completo do tratamento" },
  { n: "03", t: "Agendamentos", d: "consultas e retornos no calendário" },
];

export function PaxmedLinkReceituario() {
  const estatico = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("static");
  return (
    <div className={`plr-root${estatico ? " plr-estatico" : ""}`} data-testid="paxmed-link-receituario">
      <header className="plr-bevel">
        <div className="plr-arte plr-sim">
          <img src={SIM} alt="Símbolo PaxMed" />
          <Luz src={SIM} />
        </div>
        <i className="plr-sep" aria-hidden />
        <div className="plr-arte plr-nome">
          <img src={NOME} alt="PAXMED" />
          <Luz src={NOME} />
        </div>
      </header>

      <main className="plr-folha">
        <div className="plr-rx" aria-hidden>℞</div>

        <h1 className="plr-titulo">
          Prescrições, protocolos e agenda <em>no seu celular.</em>
        </h1>

        <ul className="plr-lista">
          {ITENS.map((i) => (
            <li key={i.n}>
              <b>{i.n}</b>
              <span>{i.t}</span>
              <p>{i.d}</p>
            </li>
          ))}
        </ul>

        <div className="plr-rodape">
          <div className="plr-passos" aria-hidden>
            <span>1</span><i /><span>2</span><i /><span>3</span>
          </div>
          <p>O manual traz o passo a passo para instalar o APP PaxMed.</p>
          <div className="plr-confira">Confira</div>
        </div>
      </main>
    </div>
  );
}

export default PaxmedLinkReceituario;
