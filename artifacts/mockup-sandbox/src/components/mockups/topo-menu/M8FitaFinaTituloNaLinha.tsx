import { Tela, Comandos, Chips, Grade, LetrasVidro, Medalhao, Teto } from "./_Moldura";

export function M8FitaFinaTituloNaLinha() {
  return (
    <Tela rente>
      {/* fio de terno de 5px no teto; o nome da tela vai NA MESMA LINHA dos botões (não cria linha nova) */}
      <Teto h={5} />
      <div className="tm-compacto"><Comandos titulo={<span style={{ marginRight: 6 }}><LetrasVidro texto="Agenda Diária" px={13} claro /></span>} /></div>
      <Chips />
      <Grade />
    </Tela>
  );
}
