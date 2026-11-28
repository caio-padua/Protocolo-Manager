import { useLayoutEffect, useRef, useState } from "react";
import "./M21CabecalhoPadrao.css";

const R = 12, C = 10;

function Aba({ nome }: { nome: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [d, setD] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const m = () => setD({ w: el.offsetWidth, h: el.offsetHeight });
    m(); const ro = new ResizeObserver(m); ro.observe(el);
    document.fonts?.ready.then(m);
    return () => ro.disconnect();
  }, [nome]);
  const { w, h } = d;
  return (
    <div className="m21-aba">
      {w > 0 && (
        <svg width={w + R} height={h} viewBox={`0 0 ${w + R} ${h}`} aria-hidden>
          <path d={`M0,-1 L${w + R},-1 L${w + R},0 A${R},${R} 0 0 0 ${w},${R} L${w},${h - C} A${C},${C} 0 0 1 ${w - C},${h} L0,${h} Z`} fill="#16284a" />
        </svg>
      )}
      <div ref={ref} className="m21-nome">{nome}</div>
    </div>
  );
}

export function M21CabecalhoPadrao() {
  return (
    <div className="m21">
      <aside className="m21-side">
        <div className="m21-logo">PAXTER</div>
        <div className="m21-it">Painel</div>
        <div className="m21-it on">Agenda Diária</div>
        <div className="m21-it">Agenda Semanal</div>
        <div className="m21-it">Clientes</div>
        <div className="m21-it">Cockpit da Consulta</div>
      </aside>
      <main className="m21-main">
        <div className="m21-teto" />
        <div className="m21-cab">
          <Aba nome="Agenda Diária" />
          <div className="m21-faixa">
            <span className="m21-desc"><b>Quinta, 14 de agosto</b> · 9 consultas, 2 encaixes, 1 retorno em atraso</span>
            <span className="m21-acoes">
              <button className="m21-b">Imprimir dia</button>
              <button className="m21-b">Filtrar</button>
              <button className="m21-b p">Nova consulta</button>
            </span>
          </div>
        </div>
        <div className="m21-corpo">
          <div className="m21-kpis">
            <div className="m21-k"><small>Marcadas</small><strong>9</strong></div>
            <div className="m21-k"><small>Confirmadas</small><strong>7</strong></div>
            <div className="m21-k"><small>Encaixes</small><strong>2</strong></div>
            <div className="m21-k"><small>Faturado previsto</small><strong>R$ 6.480,00</strong></div>
          </div>
          <div className="m21-lista">
            {[["08:30","Marina Teixeira Lopes","Retorno, Tirzepatida","Confirmada"],["09:15","Rogério Albuquerque","Primeira consulta","Confirmada"],["10:00","Helena Vasconcelos","Implante hormonal","Aguardando"],["11:30","Paulo Sampaio Neto","Aplicação, EV","Confirmada"]].map(l => (
              <div className="m21-l" key={l[0]}><em>{l[0]}</em><span>{l[1]}</span><span>{l[2]}</span><span>{l[3]}</span></div>
            ))}
          </div>
        </div>
        <div className="m21-nota">
          <div><b>1. Nome do menu</b>Na aba, ouro fosco chapado, sem degradê.</div>
          <div><b>2. Descritivo</b>Na faixa ao lado: dado vivo da tela, não repete o menu.</div>
          <div><b>3. Botões</b>Todos na faixa, à direita. Principal em navy.</div>
          <div><b>4. Corpo</b>Começa direto no conteúdo. Sem título repetido.</div>
        </div>
      </main>
    </div>
  );
}
