import { Tela, Comandos, Chips, Grade, LetrasVidro, IconeMenu } from "./_Moldura";

export function M2ReguaDeTerno() {
  return (
    <Tela>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <LetrasVidro texto="Agenda Diária" px={21} claro />
        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".18em", opacity: .5, textTransform: "uppercase" }}>Agenda &amp; Recepção</span>
      </div>
      {/* uma faixinha de terno embaixo do nome, moldurada em relevo, atravessando a tela; os botões ficam abaixo, livres */}
      <div className="tm-moldura" style={{ marginTop: -2 }}><div className="tm-miolo tm-giz" style={{ height: 7 }} /></div>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
