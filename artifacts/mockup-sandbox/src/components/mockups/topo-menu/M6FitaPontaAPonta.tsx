import { Tela, Comandos, Chips, Grade, LetrasVidro, Medalhao, Teto } from "./_Moldura";

export function M6FitaPontaAPonta() {
  return (
    <Tela rente>
      {/* faixa de ponta a ponta colada no teto, 20px; só o nome da tela, sem símbolo */}
      <Teto h={20}><LetrasVidro texto="Agenda Diária" px={11} mini /></Teto>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
