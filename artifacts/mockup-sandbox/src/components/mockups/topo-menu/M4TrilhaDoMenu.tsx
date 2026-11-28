import { Tela, Comandos, Chips, Grade, LetrasVidro, IconeMenu } from "./_Moldura";

export function M4TrilhaDoMenu() {
  return (
    <Tela marcaItem={<IconeMenu size={13} color="#e9d9a8" />}>
      {/* trilha: ícone e seção iguais aos do menu, nome da tela em vidro; só um fio dourado embaixo, sem faixa azul */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, paddingBottom: 6, borderBottom: "1px solid #d9c9a0", boxShadow: "0 1px 0 #fff" }}>
        <span className="tm-moldura" style={{ padding: 2 }}><span className="tm-miolo tm-giz" style={{ display: "flex", width: 24, height: 24, alignItems: "center", justifyContent: "center" }}><IconeMenu size={13} color="#e9d9a8" /></span></span>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", opacity: .5, textTransform: "uppercase" }}>Agenda &amp; Recepção</span>
        <span style={{ opacity: .35 }}>›</span>
        <LetrasVidro texto="Agenda Diária" px={19} claro />
      </div>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
