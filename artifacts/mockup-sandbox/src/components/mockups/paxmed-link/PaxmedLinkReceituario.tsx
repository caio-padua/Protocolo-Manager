import "./paxmed-link-receituario.css";

/* Variante "Receituário" v3: tudo centralizado, painéis compactos para mostrar o tecido risca de giz.
   Placa em relevo (símbolo grande + nome menor) sobre um painel escuro único que desliza por baixo dela. */

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

const ITENS = ["Prescrições", "Protocolos", "Agendamentos"];

export function PaxmedLinkReceituario() {
  const estatico = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("static");
  return (
    <div className={`plr-root${estatico ? " plr-estatico" : ""}`} data-testid="paxmed-link-receituario">
      <div className="plr-pilha">
        <main className="plr-gaveta">
          <p className="plr-titulo">
            Tudo do seu cuidado <em>no seu celular</em>
          </p>
          <ul className="plr-lista">
            {ITENS.map((t, i) => (
              <li key={t}>
                {i > 0 && <i aria-hidden />}
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="plr-manual">O manual traz o passo a passo para instalar o APP PaxMed.</p>
          <div className="plr-confira">Confira</div>
        </main>

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
      </div>
    </div>
  );
}

export default PaxmedLinkReceituario;
