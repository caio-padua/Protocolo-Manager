import { Tela, Comandos, Chips, Grade, LetrasVidro, IconeMenu } from "./_Moldura";

export function M3EtiquetaNoCanto() {
  return (
    <Tela>
      {/* fio de terno fino no topo da tela; a etiqueta com o nome pendura no canto direito e não ocupa linha */}
      <div style={{ position: "relative", marginTop: -8, height: 4 }}>
        <div className="tm-moldura" style={{ padding: 2 }}><div className="tm-miolo tm-giz" style={{ height: 6 }} /></div>
        <div className="tm-moldura" style={{ position: "absolute", right: 14, top: -2, padding: 2 }}>
          <div className="tm-miolo tm-giz" style={{ padding: "3px 12px 4px" }}><LetrasVidro texto="Agenda Diária" px={13} /></div>
        </div>
      </div>
      <div style={{ height: 20 }} />
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
