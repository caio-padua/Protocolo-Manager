import { Tela, Comandos, Chips, Grade, LetrasVidro, Medalhao, Teto } from "./_Moldura";

export function M7FitaComMedalhao() {
  return (
    <Tela rente>
      {/* igual ao 6, com o medalhãozinho do menu minimizado antes do nome */}
      <Teto h={20}><Medalhao px={14} /><LetrasVidro texto="Agenda Diária" px={11} mini /></Teto>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
