// MODELO D — Pills 3D Paxter Skeuomórfico: relevo alto, navy escuro, ciano brilhante

export function ModeloD() {
  const tabs = [
    { key: "ficha",       label: "FICHA",       icon: "👤" },
    { key: "protocolos",  label: "PROTOCOLOS",  icon: "📋" },
    { key: "agenda",      label: "AGENDA",      icon: "📅" },
    { key: "exames",      label: "EXAMES",      icon: "🔬" },
    { key: "financeiro",  label: "FINANCEIRO",  icon: "💰" },
    { key: "prescricoes", label: "PRESCRIÇÕES", icon: "📝" },
  ];
  const active = "exames";

  return (
    <div style={{
      fontFamily: "Inter, sans-serif",
      background: "#0d1526",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* Header navy profundo */}
      <div style={{
        background: "linear-gradient(180deg, #0a1020 0%, #111d35 100%)",
        padding: "20px 24px 0 24px",
        borderBottom: "1px solid rgba(69,184,204,0.2)",
      }}>
        {/* Identidade */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          {/* Foto concave */}
          <div style={{
            width: 60, height: 60, borderRadius: 6,
            background: "linear-gradient(135deg, #0a1020, #1a2744)",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.8), inset 0 1px 2px rgba(0,0,0,0.5)",
            border: "1px solid rgba(69,184,204,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#45B8CC", fontWeight: 700, fontSize: 22, flexShrink: 0,
          }}>H</div>

          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontWeight: 700, fontSize: 18, letterSpacing: 0.3 }}>Hassan Ali Awada</div>
            <div style={{ color: "#5577aa", fontSize: 11, marginTop: 3, letterSpacing: 0.5 }}>
              CPF 023.456.789-00  ·  42 anos  ·  TATUAPÉ
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5,
                background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.4)",
                color: "#34D399", borderRadius: 3, padding: "2px 7px",
              }}>● Ativo</span>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5,
                background: "rgba(69,184,204,0.1)", border: "1px solid rgba(69,184,204,0.3)",
                color: "#45B8CC", borderRadius: 3, padding: "2px 7px",
              }}>IV</span>
            </div>
          </div>

          {/* KPIs salientes */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "PROTOCOLOS", val: "3", color: "#45B8CC" },
              { label: "SESSÕES", val: "18", color: "#34D399" },
              { label: "PENDENTE", val: "R$ 480", color: "#FBBF24" },
            ].map(k => (
              <div key={k.label} style={{
                background: "linear-gradient(180deg, #1e2d4a 0%, #141f38 100%)",
                boxShadow: "0 2px 0 rgba(0,0,0,0.5), 0 -1px 0 rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "10px 14px", textAlign: "center", minWidth: 70,
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ color: k.color, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{k.val}</div>
                <div style={{ color: "#4a6080", fontSize: 8, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 4 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs PILL 3D */}
        <div style={{ display: "flex", gap: 6 }}>
          {tabs.map(t => {
            const isActive = t.key === active;
            return (
              <button key={t.key} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 14px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: isActive ? 1 : 0.5,
                background: isActive
                  ? "linear-gradient(180deg, #2a4a7a 0%, #1e3560 100%)"
                  : "linear-gradient(180deg, #141f38 0%, #0e1830 100%)",
                boxShadow: isActive
                  ? "0 -1px 0 rgba(69,184,204,0.6), inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px rgba(69,184,204,0.15)"
                  : "0 -1px 0 rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05)",
                color: isActive ? "#45B8CC" : "#4a6080",
                borderTop: isActive ? "2px solid #45B8CC" : "2px solid transparent",
              }}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da aba — tema escuro */}
      <div style={{ flex: 1, padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* Laudos */}
        <div style={{
          background: "linear-gradient(180deg, #1a2744 0%, #141f38 100%)",
          borderRadius: 8,
          border: "1px solid rgba(69,184,204,0.15)",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.3)",
          padding: 18,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#45B8CC", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
            Laudos Recebidos — 2
          </div>
          {[
            { nome: "EXAME SANGUE HASSAN ALI AWADA", lab: "Lavoisier", data: "26/07/2023", ok: true },
            { nome: "EXAME USG ABDOME", lab: "Fleury", data: "15/03/2023", ok: false },
          ].map((e, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: i === 0 ? "1px solid rgba(255,255,255,0.06)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#ccd6f6" }}>{e.nome}</div>
                <div style={{ fontSize: 10, color: "#4a6080", marginTop: 2 }}>{e.lab}  ·  {e.data}</div>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3,
                background: e.ok ? "rgba(52,211,153,0.15)" : "rgba(96,165,250,0.15)",
                color: e.ok ? "#34D399" : "#60A5FA",
                border: `1px solid ${e.ok ? "rgba(52,211,153,0.3)" : "rgba(96,165,250,0.3)"}`,
                textTransform: "uppercase",
              }}>
                {e.ok ? "Conf." : "Recebido"}
              </span>
            </div>
          ))}
        </div>

        {/* Planilha comparativa — dark */}
        <div style={{
          background: "linear-gradient(180deg, #1a2744 0%, #141f38 100%)",
          borderRadius: 8,
          border: "1px solid rgba(69,184,204,0.15)",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.3)",
          padding: 18,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#45B8CC", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
            Planilha Comparativa
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "rgba(69,184,204,0.1)", color: "#45B8CC" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, fontSize: 10 }}>Analito</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600, fontSize: 10 }}>Mar/23</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600, fontSize: 10 }}>Jul/23</th>
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
                <tr key={r.nome} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "5px 8px", color: "#8899bb", fontSize: 10 }}>{r.nome}</td>
                  {[{ v: r.mar, s: r.sM }, { v: r.jul, s: r.sJ }].map((cell, j) => (
                    <td key={j} style={{ textAlign: "center", padding: "5px 8px" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 7px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                        background: cell.s === "normal" ? "rgba(52,211,153,0.15)" : cell.s === "acima" ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.15)",
                        color: cell.s === "normal" ? "#34D399" : cell.s === "acima" ? "#f87171" : "#fbbf24",
                        border: `1px solid ${cell.s === "normal" ? "rgba(52,211,153,0.3)" : cell.s === "acima" ? "rgba(248,113,113,0.3)" : "rgba(251,191,36,0.3)"}`,
                      }}>{cell.v}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      <div style={{ background: "#060e1c", padding: "8px 24px", fontSize: 11, color: "#45B8CC", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", borderTop: "1px solid rgba(69,184,204,0.2)" }}>
        Modelo D — Pills 3D Paxter Skeuomórfico (tema escuro)
      </div>
    </div>
  );
}
