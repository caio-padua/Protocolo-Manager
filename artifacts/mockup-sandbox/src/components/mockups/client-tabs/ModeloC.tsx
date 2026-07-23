// MODELO C — Lateral Sticky: mini-nav vertical à esquerda, conteúdo scrollável à direita

export function ModeloC() {
  const tabs = [
    { key: "ficha",        icon: "👤", label: "Ficha" },
    { key: "protocolos",   icon: "📋", label: "Protocolos" },
    { key: "agenda",       icon: "📅", label: "Agenda" },
    { key: "exames",       icon: "🔬", label: "Exames" },
    { key: "financeiro",   icon: "💰", label: "Financeiro" },
    { key: "prescricoes",  icon: "📝", label: "Prescrições" },
  ];
  const active = "exames";

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#f0f2f5", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header topo full-width */}
      <div style={{ background: "#1a2744", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, borderBottom: "2px solid #45B8CC" }}>
        <div style={{ width: 44, height: 44, borderRadius: 6, background: "#2a3a5c", border: "2px solid #45B8CC", display: "flex", alignItems: "center", justifyContent: "center", color: "#45B8CC", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
          H
        </div>
        <div>
          <div style={{ color: "white", fontWeight: 700, fontSize: 16 }}>Hassan Ali Awada</div>
          <div style={{ color: "#8899bb", fontSize: 11 }}>CPF 023.456.789-00  ·  42 anos  ·  Clínica Tatuapé</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {[
            { l: "Protocolos", v: "3", c: "#45B8CC" },
            { l: "Sessões", v: "18", c: "#34D399" },
            { l: "Pendente", v: "R$ 480", c: "#FBBF24" },
          ].map(k => (
            <div key={k.l} style={{ textAlign: "center", padding: "5px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 6 }}>
              <div style={{ color: k.c, fontWeight: 700, fontSize: 16 }}>{k.v}</div>
              <div style={{ color: "#8899bb", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8 }}>{k.l}</div>
            </div>
          ))}
          <button style={{ background: "#45B8CC", color: "white", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            + Protocolo
          </button>
        </div>
      </div>

      {/* Layout principal: sidebar esquerda + conteúdo direita */}
      <div style={{ flex: 1, display: "flex" }}>

        {/* Sidebar de navegação vertical */}
        <div style={{ width: 140, background: "white", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", paddingTop: 12 }}>
          {tabs.map(t => (
            <button key={t.key} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "12px 8px",
              background: t.key === active ? "#eff9fc" : "transparent",
              borderLeft: t.key === active ? "3px solid #45B8CC" : "3px solid transparent",
              border: "none",
              cursor: "pointer",
              color: t.key === active ? "#1a2744" : "#9ca3af",
              gap: 4,
            }}>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span style={{ fontSize: 11, fontWeight: t.key === active ? 600 : 400 }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Conteúdo principal */}
        <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2744", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>
            🔬 Exames do Cliente
          </div>

          {/* Grid de conteúdo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* Laudos */}
            <div style={{ background: "white", borderRadius: 6, border: "1px solid #e5e7eb", padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2744", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12 }}>
                Laudos — 2
              </div>
              {[
                { nome: "EXAME SANGUE HASSAN ALI AWADA", lab: "Lavoisier", data: "26/07/2023", status: "conferido" },
                { nome: "EXAME USG ABDOME", lab: "Fleury", data: "15/03/2023", status: "recebido" },
              ].map((e, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: i === 0 ? "1px solid #f3f4f6" : "none", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#111827" }}>{e.nome}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>{e.lab}  ·  {e.data}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: e.status === "conferido" ? "#d1fae5" : "#eff6ff", color: e.status === "conferido" ? "#065f46" : "#1d4ed8", textTransform: "uppercase", whiteSpace: "nowrap", marginLeft: 8 }}>
                    {e.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Planilha comparativa */}
            <div style={{ background: "white", borderRadius: 6, border: "1px solid #e5e7eb", padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2744", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12 }}>
                Comparativo
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#1a2744", color: "white" }}>
                    <th style={{ textAlign: "left", padding: "5px 6px", fontSize: 10 }}>Analito</th>
                    <th style={{ textAlign: "center", padding: "5px 6px", fontSize: 10 }}>Mar</th>
                    <th style={{ textAlign: "center", padding: "5px 6px", fontSize: 10 }}>Jul</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { nome: "Glicose", mar: "98", jul: "102", sM: "normal", sJ: "normal" },
                    { nome: "Hemoglobina", mar: "13,2", jul: "14,1", sM: "abaixo", sJ: "normal" },
                    { nome: "TSH", mar: "3,8", jul: "4,2", sM: "normal", sJ: "acima" },
                    { nome: "Vitamina D", mar: "18", jul: "32", sM: "abaixo", sJ: "normal" },
                    { nome: "Colesterol", mar: "210", jul: "195", sM: "acima", sJ: "normal" },
                  ].map((r, i) => (
                    <tr key={r.nome} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                      <td style={{ padding: "4px 6px", color: "#374151", fontSize: 10 }}>{r.nome}</td>
                      {[{ v: r.mar, s: r.sM }, { v: r.jul, s: r.sJ }].map((cell, j) => (
                        <td key={j} style={{ textAlign: "center", padding: "4px 6px" }}>
                          <span style={{
                            display: "inline-block", padding: "1px 5px", borderRadius: 3, fontSize: 10, fontWeight: 700,
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

          {/* Barra de upload */}
          <div style={{ marginTop: 14, background: "white", borderRadius: 6, border: "2px dashed #d1d5db", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#9ca3af", fontSize: 12 }}>
            <span>📎</span> Arraste laudos aqui ou <span style={{ color: "#45B8CC", fontWeight: 600, cursor: "pointer" }}>clique para enviar</span>
          </div>
        </div>
      </div>

      <div style={{ background: "#1a2744", padding: "8px 24px", fontSize: 11, color: "#45B8CC", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
        Modelo C — Lateral Sticky (nav vertical esquerda + conteúdo à direita)
      </div>
    </div>
  );
}
