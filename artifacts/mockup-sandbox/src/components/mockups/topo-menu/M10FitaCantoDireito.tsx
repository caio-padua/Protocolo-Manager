import { Tela, Comandos, Chips, Grade, LetrasVidro, Medalhao, Teto } from "./_Moldura";

export function M10FitaCantoDireito() {
  return (
    <Tela rente>
      {/* faixa de ponta a ponta no teto; o nome fica no canto direito (discreto), a esquerda fica só o tecido */}
      <Teto h={18} justify="flex-end"><LetrasVidro texto="Agenda Diária" px={10.5} mini /><Medalhao px={13} /></Teto>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
