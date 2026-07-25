import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { ShieldCheck, ShieldX, ExternalLink, QrCode, Loader2, FileText } from "lucide-react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";

interface ConsultaData {
  paciente: string;
  medico: string;
  crm: string;
  clinica: string;
  dataEmissao: string;
  arquivo: string;
  driveUrl: string | null;
}

const campos: { label: string; key: keyof ConsultaData; mono?: boolean }[] = [
  { label: "PACIENTE",       key: "paciente" },
  { label: "MÉDICO",         key: "medico" },
  { label: "CRM",            key: "crm", mono: true },
  { label: "CLÍNICA",        key: "clinica" },
  { label: "DATA DE EMISSÃO", key: "dataEmissao" },
  { label: "ARQUIVO",        key: "arquivo", mono: true },
];

export default function ConsultaReceituario() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";

  const [data, setData]       = useState<ConsultaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token não informado. Utilize o QR code impresso na prescrição.");
      setLoading(false);
      return;
    }
    fetch(`/api/receituario/consulta?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() as Promise<ConsultaData> : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => {
        setError("Documento não encontrado ou token inválido. Verifique o QR code da prescrição.");
        setLoading(false);
      });
  }, [token]);

  const dataFormatada = data?.dataEmissao
    ? new Date(data.dataEmissao + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit", month: "long", year: "numeric",
      })
    : "—";

  const dadosFormatados: Record<keyof ConsultaData, string> = data
    ? { ...data, dataEmissao: dataFormatada }
    : {} as Record<keyof ConsultaData, string>;

  return (
    <div className="dark min-h-screen flex flex-col" style={{ background: "linear-gradient(180deg,#0d1a2d 0%,#07101f 100%)" }}>

      {/* ── CABEÇALHO PAXTER ─────────────────────────────────────── */}
      <header className="w-full flex flex-col items-center py-7 px-4"
        style={{ borderBottom: "1px solid rgba(201,162,78,0.18)" }}>
        <div className="flex items-center gap-3 mb-1">
          <PaxterSymbolGlass size={44} tone="dark" />
          <div>
            <div
              className="text-[22px] font-black tracking-[0.35em] uppercase"
              style={{
                fontFamily: "'Cinzel','Playfair Display',serif",
                background: "linear-gradient(135deg,#6f5421 0%,#f6e6a8 22%,#c9a24e 55%,#f1dd9a 78%,#927235 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              PAXTER
            </div>
            <div className="text-[10px] tracking-[0.22em] uppercase mt-0.5"
              style={{ color: "rgba(201,162,78,0.65)" }}>
              Motor Clínico · Receituário Digital
            </div>
          </div>
        </div>
      </header>

      {/* ── ÁREA DE CONTEÚDO ─────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 py-8">
        <div className="w-full max-w-[480px] flex flex-col gap-4">

          {/* CARREGANDO */}
          {loading && (
            <div className="panel-3d p-10 flex flex-col items-center gap-4">
              <Loader2 size={36} className="animate-spin" style={{ color: "#c9a24e" }} />
              <p className="text-sm tracking-wide" style={{ color: "rgba(201,162,78,0.70)" }}>
                Verificando documento...
              </p>
            </div>
          )}

          {/* ERRO */}
          {error && !loading && (
            <>
              {/* Selo de status — inválido */}
              <div className="panel-3d p-5 flex flex-col items-center gap-3">
                <div className="flex items-center gap-3">
                  <span className="paxter-led paxter-led-red paxter-led-on" />
                  <ShieldX size={28} style={{ color: "#f87171" }} />
                  <span className="text-base font-black tracking-[0.18em] uppercase"
                    style={{ color: "#f87171", fontFamily: "'Cinzel',serif" }}>
                    Documento Inválido
                  </span>
                </div>
                <p className="text-xs text-center leading-relaxed mt-1"
                  style={{ color: "rgba(248,113,113,0.80)" }}>
                  {error}
                </p>
              </div>

              {/* Instrução de uso */}
              <div className="concave-3d p-4 flex items-start gap-3">
                <QrCode size={22} className="shrink-0 mt-0.5" style={{ color: "rgba(201,162,78,0.60)" }} />
                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
                  Escaneie o QR code impresso no rodapé da prescrição ou acesse
                  o link completo fornecido pelo médico prescritor.
                </p>
              </div>
            </>
          )}

          {/* SUCESSO */}
          {data && !loading && (
            <>
              {/* ── SELO: DOCUMENTO VERIFICADO ─────────────────────── */}
              <div className="bevel-3d-ok p-5 flex flex-col items-center gap-2">
                <div className="flex items-center gap-3">
                  <span className="paxter-led paxter-led-green paxter-led-on" />
                  <ShieldCheck size={26} style={{ color: "#4ade80" }} />
                  <span className="text-base font-black tracking-[0.20em] uppercase"
                    style={{ color: "#4ade80", fontFamily: "'Cinzel',serif" }}>
                    Documento Verificado
                  </span>
                </div>
                <div className="mt-1 px-3 py-1 rounded" style={{ background: "rgba(0,0,0,0.30)" }}>
                  <span className="text-[10px] tracking-widest uppercase"
                    style={{ color: "rgba(255,255,255,0.40)" }}>token</span>
                  {" "}
                  <span className="font-mono text-sm font-bold"
                    style={{ color: "#f6e6a8", letterSpacing: "0.15em" }}>
                    {token.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* ── DADOS DA PRESCRIÇÃO ─────────────────────────────── */}
              <div className="panel-3d overflow-hidden">
                {/* Header do painel */}
                <div className="px-5 py-3 flex items-center gap-2"
                  style={{ borderBottom: "1px solid rgba(201,162,78,0.18)" }}>
                  <FileText size={14} style={{ color: "rgba(201,162,78,0.70)" }} />
                  <span className="text-[10px] font-bold tracking-[0.22em] uppercase"
                    style={{ color: "rgba(201,162,78,0.70)", fontFamily: "'Cinzel',serif" }}>
                    Dados da Prescrição
                  </span>
                </div>

                {/* Linhas de dados */}
                <div className="px-5 py-4 flex flex-col gap-3">
                  {campos.map(({ label, key, mono }) => {
                    const valor = key === "dataEmissao"
                      ? dataFormatada
                      : String(dadosFormatados[key] ?? "—");
                    return (
                      <div key={key} className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold tracking-[0.25em] uppercase"
                          style={{ color: "rgba(201,162,78,0.55)" }}>
                          {label}
                        </span>
                        <span
                          className={mono ? "font-mono text-[12px]" : "text-[14px]"}
                          style={{
                            color: key === "paciente"
                              ? "#f6e6a8"
                              : "rgba(255,255,255,0.88)",
                            fontWeight: key === "paciente" ? 700 : 400,
                            fontFamily: key === "paciente"
                              ? "'Cormorant Garamond','Georgia',serif"
                              : undefined,
                            fontSize: key === "paciente" ? "15px" : undefined,
                          }}
                        >
                          {valor}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── SELO ICP-BRASIL ─────────────────────────────────── */}
              <div className="concave-3d px-5 py-4 flex items-start gap-3">
                <span className="paxter-led paxter-led-green paxter-led-on shrink-0 mt-1" />
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold leading-snug"
                    style={{ color: "#4ade80" }}>
                    Assinado digitalmente via ICP-Brasil / PAdES
                  </span>
                  <span className="text-[11px] leading-relaxed"
                    style={{ color: "rgba(255,255,255,0.50)" }}>
                    Autenticidade verificável em{" "}
                    <a
                      href="https://validar.iti.gov.br"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:opacity-80 transition-opacity"
                      style={{ color: "#4ade80" }}
                    >
                      validar.iti.gov.br
                    </a>
                  </span>
                </div>
              </div>

              {/* ── BOTÃO GOOGLE DRIVE ─────────────────────────────── */}
              {data.driveUrl ? (
                <a
                  href={data.driveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-3d w-full flex items-center justify-center gap-2 py-4 px-6 text-sm font-bold tracking-[0.14em] uppercase no-underline"
                  style={{ fontFamily: "'Cinzel',serif" }}
                >
                  <ExternalLink size={16} />
                  Abrir Receituário no Google Drive
                </a>
              ) : (
                <div className="concave-3d px-5 py-4 text-center text-[12px]"
                  style={{ color: "rgba(255,255,255,0.45)" }}>
                  O PDF foi enviado por e-mail ao médico prescritor.
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── RODAPÉ ───────────────────────────────────────────────── */}
      <footer className="w-full flex flex-col items-center py-5"
        style={{ borderTop: "1px solid rgba(201,162,78,0.12)" }}>
        <p className="text-[9px] tracking-[0.30em] uppercase text-center"
          style={{ color: "rgba(201,162,78,0.35)" }}>
          PAXTER Clinical Intelligence System · Receituário Assinado ICP-Brasil
        </p>
      </footer>
    </div>
  );
}
