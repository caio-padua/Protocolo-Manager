import "./M11FitaEItemDoMenu.css";
import { Tela, Comandos, Chips, Grade, Teto } from "./_Moldura";

export function M11FitaEItemDoMenu() {
  return (
    <div className="m11-shell">
      <Tela rente itemGiz>
        {/* Painel de título discreto, encaixado à esquerda e suspenso acima da área de trabalho. */}
        <div className="m11-topo">
          <div className="m11-painel">
            <span className="m11-title">Agenda Diária</span>
          </div>
          <Teto h={1} className="m11-linha" />
        </div>
        <Comandos />
        <Chips />
        <Grade />
      </Tela>
    </div>
  );
}
