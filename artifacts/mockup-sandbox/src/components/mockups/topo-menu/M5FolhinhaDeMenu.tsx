import { Tela, Comandos, Chips, Grade, LetrasVidro, IconeMenu } from "./_Moldura";

export function M5FolhinhaDeMenu() {
  return (
    <Tela>
      <div style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
        {/* mesma família da folhinha do dia: faixa azul com a seção do menu, corpo creme com o nome da tela */}
        <div className="tm-leaf" style={{ textAlign: "left", minWidth: 190, alignSelf: "flex-start", boxShadow: "0 0 0 1px #fffaf0, 0 0 0 2px #c9a24a" }}>
          <i style={{ padding: "3px 10px", fontSize: 8 }}>AGENDA &amp; RECEPÇÃO</i>
          <b style={{ padding: "3px 10px 5px", fontSize: 21, letterSpacing: ".01em" }}>Agenda Diária</b>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start" }}><div style={{ width: "100%" }}><Comandos parte="ferramentas" /></div></div>
      </div>
      <Comandos parte="nav" />
      <Chips />
      <Grade />
    </Tela>
  );
}
