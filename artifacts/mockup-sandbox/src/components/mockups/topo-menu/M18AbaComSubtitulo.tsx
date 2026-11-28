import "./M18AbaComSubtitulo.css";
import { Tela, Comandos, Chips, Grade } from "./_Moldura";

export function M18AbaComSubtitulo() {
  return (
    <Tela rente>
      {/* Modelo 14 + subtítulo curto: título em cima, resumo discreto embaixo (mesma aba, mesma cor do menu) */}
      <div style={{ position: "relative", margin: "0 -18px", height: 45, flex: "none" }}>
        <div style={{ position: "absolute", inset: "0 0 auto 0", height: 6, background: "#12294c", boxShadow: "0 1px 0 rgba(201,162,74,.5)" }} />
        <div className="m18-aba" role="heading" aria-level={1}>
          <span className="m18-t">Agenda Diária</span>
          <span className="m18-s">Sessões do dia, por agenda</span>
        </div>
      </div>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
