import "./M11FitaEItemDoMenu.css";
import { Tela, Comandos, Chips, Grade, LetrasVidro, Medalhao, Teto } from "./_Moldura";

export function M11FitaEItemDoMenu() {
  return (
    <div className="m11-shell">
      <Tela rente itemGiz>
        {/* A mesma risca de giz une o item ativo ao título, numa régua elevada e rente ao teto. */}
        <Teto h={20}><LetrasVidro texto="Agenda Diária" px={12} mini /></Teto>
        <Comandos />
        <Chips />
        <Grade />
      </Tela>
    </div>
  );
}
