import { useEffect, useState } from "react";
import { useSearch } from "wouter";

interface ConsultaData {
  paciente: string;
  medico: string;
  crm: string;
  clinica: string;
  dataEmissao: string;
  arquivo: string;
  driveUrl: string | null;
}

export default function ConsultaReceituario() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";

  const [data, setData] = useState<ConsultaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token não informado. Verifique o QR code da receita.");
      setLoading(false);
      return;
    }
    fetch(`/api/receituario/consulta?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() as Promise<ConsultaData> : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Documento não encontrado ou token inválido."); setLoading(false); });
  }, [token]);

  const dataFormatada = data?.dataEmissao
    ? new Date(data.dataEmissao + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "Arial, Helvetica, sans-serif" }}>

      {/* Cabeçalho PAXTER */}
      <div style={{ background: "#16284a", width: "100%", padding: "18px 24px", textAlign: "center", borderBottom: "2px solid #c9a24e" }}>
        <div style={{ color: "#c9a24e", fontSize: "22px", fontWeight: "700", letterSpacing: "4px" }}>PAXTER</div>
        <div style={{ color: "#45B8CC", fontSize: "12px", marginTop: "4px", letterSpacing: "1px" }}>Motor Clínico · Receituário Digital</div>
      </div>

      {/* Corpo */}
      <div style={{ maxWidth: "480px", width: "100%", padding: "28px 16px" }}>

        {loading && (
          <div style={{ textAlign: "center", color: "#64748b", padding: "40px 0", fontSize: "15px" }}>
            Carregando documento...
          </div>
        )}

        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "20px", color: "#dc2626", textAlign: "center", fontSize: "14px" }}>
            <div style={{ fontWeight: "700", marginBottom: "6px" }}>Documento não encontrado</div>
            {error}
          </div>
        )}

        {data && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>

            {/* Header do card */}
            <div style={{ background: "#16284a", padding: "14px 18px" }}>
              <div style={{ color: "#c9a24e", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>
                Receituário Digital Verificado
              </div>
              <div style={{ color: "#94a3b8", fontSize: "11px" }}>
                Token: <span style={{ color: "#45B8CC", fontWeight: "600", fontFamily: "monospace" }}>{token.toUpperCase()}</span>
              </div>
            </div>

            {/* Dados */}
            <div style={{ padding: "18px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <tbody>
                  {[
                    ["Paciente", data.paciente],
                    ["Médico", data.medico],
                    ["CRM", data.crm],
                    ["Clínica", data.clinica],
                    ["Data de emissão", dataFormatada],
                    ["Arquivo", data.arquivo],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 0 8px 0", color: "#64748b", width: "130px", fontSize: "12px", verticalAlign: "top" }}>{label}</td>
                      <td style={{ padding: "8px 0 8px 8px", fontWeight: label === "Paciente" ? "700" : "400", color: "#1e293b", fontSize: label === "Arquivo" ? "11px" : "14px" }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Selo ICP-Brasil */}
              <div style={{ marginTop: "16px", padding: "10px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ width: "10px", height: "10px", background: "#22c55e", borderRadius: "50%", flexShrink: 0, marginTop: "2px" }} />
                <div style={{ fontSize: "12px", color: "#15803d", lineHeight: "1.5" }}>
                  Documento assinado digitalmente via <strong>ICP-Brasil / PAdES</strong>.<br />
                  Autenticidade verificável em{" "}
                  <a href="https://validar.iti.gov.br" target="_blank" rel="noreferrer" style={{ color: "#15803d", fontWeight: "600" }}>
                    validar.iti.gov.br
                  </a>
                </div>
              </div>

              {/* Botão Drive */}
              {data.driveUrl ? (
                <a
                  href={data.driveUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block", marginTop: "18px",
                    background: "#16284a", color: "#c9a24e",
                    padding: "14px", borderRadius: "6px",
                    textAlign: "center", textDecoration: "none",
                    fontWeight: "700", fontSize: "14px",
                    letterSpacing: "0.5px", border: "1px solid #c9a24e",
                  }}
                >
                  Abrir Receituário no Google Drive
                </a>
              ) : (
                <div style={{ marginTop: "18px", padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", color: "#64748b", fontSize: "13px", textAlign: "center" }}>
                  O PDF foi enviado por e-mail ao médico prescritor.
                </div>
              )}
            </div>

            {/* Rodapé do card */}
            <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "10px 18px", textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#94a3b8", letterSpacing: "0.5px" }}>
                PAXTER Clinical Intelligence System · Receituário Assinado ICP-Brasil
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
