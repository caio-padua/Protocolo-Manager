import { Tela, Comandos, Chips, Grade, LetrasVidro, IconeMenu } from "./_Moldura";

export function M1PlacaSoNoTitulo() {
  return (
    <Tela marcaItem={<span className="tm-giz" style={{ width: 10, height: 10, borderRadius: 2, boxShadow: "0 0 0 1px #c9a24a" }} />}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* a placa de terno cobre SÓ o nome da tela; os botões ficam livres, sobre o creme */}
        <div className="tm-moldura" style={{ alignSelf: "flex-start" }}>
          <div className="tm-miolo tm-giz" style={{ padding: "5px 16px 6px", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="tm-giz" style={{ width: 9, height: 9, borderRadius: 2, boxShadow: "0 0 0 1px #c9a24a" }} />
            <LetrasVidro texto="Agenda Diária" px={17} />
          </div>
        </div>
      </div>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
