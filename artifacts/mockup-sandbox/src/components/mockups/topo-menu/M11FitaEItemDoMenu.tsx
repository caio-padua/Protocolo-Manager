import { Tela, Comandos, Chips, Grade, LetrasVidro, Medalhao, Teto } from "./_Moldura";

export function M11FitaEItemDoMenu() {
  return (
    <Tela rente itemGiz>
      {/* o item ativo do menu lateral vira o mesmo tecido de terno, e a faixa do teto repete o nome: menu e tela são o mesmo "tecido" */}
      <Teto h={20}><LetrasVidro texto="Agenda Diária" px={11} mini /></Teto>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
