import "./paxmed-link-receituario.css";

/* PADRAO "PREVIA DE LINK PAXTER" (aprovado pelo Dr. Caio) — modelo para qualquer link compartilhado (WhatsApp/Telegram).
   Imagem 1200x630, centralizada, tecido risca de giz bem visivel nos 4 lados. Pilha de 800 px:
   1) PLACA em relevo alto (up bevel), azul-marinho escuro #14264a>#091428, 208 px, topo iluminado, base grossa em degraus:
      simbolo oficial PX 148 px a esquerda + nome PAXMED 380 px a direita (gap 44, SEM fio vertical, SEM moldura escura),
      tagline "Clinical Intelligence System" (Jost caixa-alta, espacada) logo abaixo do nome. Arte oficial, nunca redesenhar.
   2) GAVETA por baixo da placa, azul-marinho 1 tom mais claro #16294f>#1a3160 (harmonico, sem contraste forte), mesmo relevo alto:
      titulo EB Garamond 38 px (trecho final em italico dourado #e3b659), subtitulo Jost 17 px com losangos dourados,
      frase de apoio 24 px, botao dourado. Espacos amplos entre linhas (26/28/38 px) para nao parecer amontoado.
   Raio de luz: so dentro do ouro (mask), ciclo 7 s; ?static=1 congela para exportar o JPG.
   Exportar JPG, gravar com nome novo og-<marca>-vN.jpg e subir o ?v=N do link (WhatsApp guarda cache por endereco). */

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

const ITENS = ["Receitas", "Exames", "Protocolos", "Agendas"];

export function PaxmedLinkReceituario() {
  const estatico = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("static");
  return (
    <div className={`plr-root${estatico ? " plr-estatico" : ""}`} data-testid="paxmed-link-receituario">
      <div className="plr-pilha">
        <main className="plr-gaveta">
          <p className="plr-titulo">
            Todo o seu cuidado, <em>na palma da mão</em>
          </p>
          <ul className="plr-lista">
            {ITENS.map((t, i) => (
              <li key={t}>
                {i > 0 && <i aria-hidden />}
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="plr-manual">Veja como instalar o aplicativo PaxMed em segundos</p>
          <div className="plr-confira">Acessar guia de instalação</div>
        </main>

        <header className="plr-bevel">
          <div className="plr-arte plr-sim">
            <img src={SIM} alt="Símbolo PaxMed" />
            <Luz src={SIM} />
          </div>
          <div className="plr-marca">
            <div className="plr-arte plr-nome">
              <img src={NOME} alt="PAXMED" />
              <Luz src={NOME} />
            </div>
            <p className="plr-tagline">Clinical Intelligence System</p>
          </div>
        </header>
      </div>
    </div>
  );
}

export default PaxmedLinkReceituario;
