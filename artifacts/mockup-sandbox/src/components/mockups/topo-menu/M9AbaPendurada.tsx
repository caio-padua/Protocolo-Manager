import { Tela, Comandos, Chips, Grade, LetrasVidro, Medalhao, Teto } from "./_Moldura";

export function M9AbaPendurada() {
  return (
    <Tela rente>
      {/* aba de pasta pendurada no teto (só no tamanho do nome) e fio de terno de ponta a ponta continuando à direita */}
      <div style={{ position: "relative", margin: "0 -18px", padding: "0 18px", flex: "none", height: 24 }}>
        <Teto h={4} className="" />
        <div className="tm-aba" style={{ position: "absolute", left: 18, top: 0 }}>
          <Medalhao px={13} />
          <LetrasVidro texto="Agenda Diária" px={11} mini />
        </div>
      </div>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
