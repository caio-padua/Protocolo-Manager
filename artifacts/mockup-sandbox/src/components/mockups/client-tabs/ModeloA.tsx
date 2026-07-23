// MODELO A — Abas Horizontais Limpas (prontuário expandido dentro da ficha)
// Inspirado no Support Clinic: header compacto, tabs underline ciano, conteúdo branco

export function ModeloA() {
  const tabs = ["Ficha", "Protocolos", "Agenda", "Exames", "Financeiro", "Prescrições"];
  const active = "Exames";

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#f0f2f5", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header compacto */}
      <div style={{ background: "#1a2744", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 6, background: "#2a3a5c", display: "flex", alignItems: "center", justifyContent: "center", color: "#45B8CC", fontSize: 20, fontWeight: 700 }}>
          H
        </div>
        <div>
          <div style={{ color: "white", fontWeight: 700, fontSize: 16 }}>Hassan Ali Awada</div>
          <div style={{ color: "#8899bb", fontSize: 12, marginTop: 2 }}>CPF 023.456.789-00  ·  42 anos  ·  Tatuapé</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          {[
            { label: "Protocolos", val: "3", color: "#45B8CC" },
            { label: "Sessões", val: "18", color: "#34D399" },
            { label: "Pendente", val: "R$ 480", color: "#FBBF24" },
          ].map(k => (
            <div key={k.label} style={{ textAlign: "center", background: "rgba(255,255,255,0.07)", borderRadius: 6, padding: "6px 14px" }}>
              <div style={{ color: k.color, fontWeight: 700, fontSize: 18 }}>{k.val}</div>
              <div style={{ color: "#8899bb", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs underline */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "0 24px", display: "flex", gap: 0 }}>
        {tabs.map(t => (
          <button key={t} style={{
            padding: "12px 18px",
            fontSize: 13,
            fontWeight: t === active ? 600 : 400,
            color: t === active ? "#1a2744" : "#6b7280",
            borderBottom: t === active ? "2px solid #45B8CC" : "2px solid transparent",
            background: "none",
            border: "none",
            borderBottom: t === active ? "2px solid #45B8CC" : "2px solid transparent",
            cursor: "pointer",
            marginBottom: -1,
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Laudos recebidos */}
        <div style={{ background: "white", borderRadius: 6, border: "1px solid #e5e7eb", padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2744", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
            Laudos Recebidos — 2
          </div>
          {[
            { nome: "26.07.23 EXAME SANGUE HASSAN ALI AWADA.pdf", lab: "Lavoisier", data: "26/07/2023", status: "conferido" },
            { nome: "15.03.23 EXAME IMAGEM USG ABDOME.pdf", lab: "Fleury", data: "15/03/2023", status: "recebido" },
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i === 0 ? "1px solid #f3f4f6" : "none" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{e.nome}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{e.lab}  ·  {e.data}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: e.status === "conferido" ? "#d1fae5" : "#eff6ff", color: e.status === "conferido" ? "#065f46" : "#1d4ed8", textTransform: "uppercase" }}>
                {e.status === "conferido" ? "Conf." : "Recebido"}
              </span>
            </div>
          ))}
        </div>

        {/* Planilha comparativa (mini) */}
        <div style={{ background: "white", borderRadius: 6, border: "1px solid #e5e7eb", padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2744", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
            Planilha Comparativa
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1a2744", color: "white" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Analito</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>Mar/23</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>Jul/23</th>
              </tr>
            </thead>
            <tbody>
              {[
                { nome: "Glicose", mar: "98", jul: "102", statusMar: "normal", statusJul: "normal" },
                { nome: "Hemoglobina", mar: "13,2", jul: "14,1", statusMar: "abaixo", statusJul: "normal" },
                { nome: "TSH", mar: "3,8", jul: "4,2", statusMar: "normal", statusJul: "acima" },
                { nome: "Vitamina D", mar: "18", jul: "32", statusMar: "abaixo", statusJul: "normal" },
                { nome: "Colesterol Total", mar: "210", jul: "195", statusMar: "acima", statusJul: "normal" },
              ].map((r, i) => (
                <tr key={r.nome} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                  <td style={{ padding: "5px 8px", color: "#374151", fontWeight: 500 }}>{r.nome}</td>
                  {[{ v: r.mar, s: r.statusMar }, { v: r.jul, s: r.statusJul }].map((cell, j) => (
                    <td key={j} style={{ padding: "5px 8px", textAlign: "center" }}>
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

      {/* Label identificador */}
      <div style={{ background: "#1a2744", padding: "8px 24px", fontSize: 11, color: "#45B8CC", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
        Modelo A — Abas Horizontais Limpas (Underline Ciano)
      </div>
    </div>
  );
}
