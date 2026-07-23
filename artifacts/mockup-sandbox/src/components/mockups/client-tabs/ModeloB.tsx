// MODELO B — Hero Header com foto grande + KPIs em destaque, abas ancoradas abaixo

export function ModeloB() {
  const tabs = ["Ficha", "Protocolos", "Agenda", "Exames", "Financeiro", "Prescrições"];
  const active = "Exames";

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#f0f2f5", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Hero Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b33 0%, #1a2744 60%, #1e3560 100%)",
        padding: "24px 28px 0 28px",
      }}>
        {/* Linha principal */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Foto */}
          <div style={{
            width: 72, height: 72, borderRadius: 6,
            background: "linear-gradient(135deg, #2a3a5c, #1a2744)",
            border: "2px solid #45B8CC",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#45B8CC", fontSize: 28, fontWeight: 700, flexShrink: 0,
          }}>H</div>

          {/* Nome e dados */}
          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontWeight: 700, fontSize: 20, lineHeight: 1.2 }}>Hassan Ali Awada</div>
            <div style={{ color: "#8899bb", fontSize: 12, marginTop: 4 }}>CPF 023.456.789-00  ·  42 anos  ·  Clínica Tatuapé</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {["🟢 Ativo", "IV", "Protocolo Longevidade"].map(tag => (
                <span key={tag} style={{
                  background: "rgba(69,184,204,0.15)", border: "1px solid rgba(69,184,204,0.3)",
                  color: "#45B8CC", borderRadius: 4, padding: "2px 8px", fontSize: 11
                }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* Ações */}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ background: "#45B8CC", color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              + Protocolo
            </button>
            <button style={{ background: "rgba(255,255,255,0.08)", color: "#ccd6f6", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "8px 16px", fontSize: 12, cursor: "pointer" }}>
              Editar
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          {[
            { label: "Protocolos Ativos", val: "3", icon: "📋", color: "#45B8CC" },
            { label: "Sessões Realizadas", val: "18", icon: "💉", color: "#34D399" },
            { label: "Próxima Sessão", val: "28/07", icon: "📅", color: "#A78BFA" },
            { label: "Saldo Pendente", val: "R$ 480", icon: "💰", color: "#FBBF24" },
            { label: "Exames Recebidos", val: "2", icon: "🔬", color: "#60A5FA" },
          ].map(k => (
            <div key={k.label} style={{
              flex: 1, background: "rgba(255,255,255,0.06)",
              borderTop: `3px solid ${k.color}`, borderRadius: "6px 6px 0 0",
              padding: "10px 12px",
            }}>
              <div style={{ color: k.color, fontWeight: 700, fontSize: 20 }}>{k.val}</div>
              <div style={{ color: "#8899bb", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs ancoradas no hero */}
        <div style={{ display: "flex", gap: 0, marginTop: 16 }}>
          {tabs.map(t => (
            <button key={t} style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: t === active ? 600 : 400,
              color: t === active ? "white" : "#8899bb",
              background: t === active ? "rgba(69,184,204,0.15)" : "transparent",
              border: "none",
              borderBottom: t === active ? "2px solid #45B8CC" : "2px solid transparent",
              cursor: "pointer",
              borderRadius: "6px 6px 0 0",
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo da aba */}
      <div style={{ flex: 1, padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "white", borderRadius: 6, border: "1px solid #e5e7eb", padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2744", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
            Laudos Recebidos — 2
          </div>
          {[
            { nome: "26.07.23 EXAME SANGUE HASSAN ALI AWADA.pdf", lab: "Lavoisier", data: "26/07/2023" },
            { nome: "15.03.23 EXAME USG ABDOME.pdf", lab: "Fleury", data: "15/03/2023" },
          ].map((e, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: i === 0 ? "1px solid #f3f4f6" : "none" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{e.nome}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{e.lab}  ·  {e.data}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "white", borderRadius: 6, border: "1px solid #e5e7eb", padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2744", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
            Planilha Comparativa
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1a2744", color: "white" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Analito</th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>Mar/23</th>
                <th style={{ textAlign: "center", padding: "6px 8px" }}>Jul/23</th>
              </tr>
            </thead>
            <tbody>
              {[
                { nome: "Glicose", mar: "98", jul: "102", sM: "normal", sJ: "normal" },
                { nome: "Hemoglobina", mar: "13,2", jul: "14,1", sM: "abaixo", sJ: "normal" },
                { nome: "TSH", mar: "3,8", jul: "4,2", sM: "normal", sJ: "acima" },
                { nome: "Vitamina D", mar: "18", jul: "32", sM: "abaixo", sJ: "normal" },
              ].map((r, i) => (
                <tr key={r.nome} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                  <td style={{ padding: "5px 8px", color: "#374151" }}>{r.nome}</td>
                  {[{ v: r.mar, s: r.sM }, { v: r.jul, s: r.sJ }].map((cell, j) => (
                    <td key={j} style={{ textAlign: "center", padding: "5px 8px" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 6px", borderRadius: 3, fontSize: 11, fontWeight: 700,
                        background: cell.s === "normal" ? "#d1fae5" : cell.s === "acima" ? "#fee2e2" : "#fef9c3",
                        color: cell.s === "normal" ? "#065f46" : cell.s === "acima" ? "#991b1b" : "#92400e",
                      }}>{cell.v}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "#1a2744", padding: "8px 24px", fontSize: 11, color: "#45B8CC", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
        Modelo B — Hero Header + KPIs + Abas Ancoradas no Cabeçalho
      </div>
    </div>
  );
}
