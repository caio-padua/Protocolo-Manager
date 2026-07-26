import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import {
  ShieldCheck, ShieldX, ExternalLink, QrCode, Loader2,
  FileText, BadgeCheck, Lock, Award
} from "lucide-react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { useScreenTheme } from "@/components/theme/useScreenTheme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/* ── Tipos ───────────────────────────────────────────────────────────── */
interface CertMeta {
  titular:   string;
  cpf:       string | null;
  serial:    string;
  validFrom: string;
  validTo:   string;
  issuer:    string;
  algoritmo: string;
  padrao:    string;
  tipo:      string;
  raiz:      string;
}
interface ConsultaData {
  paciente:    string;
  medico:      string;
  crm:         string;
  clinica:     string;
  dataEmissao: string;
  arquivo:     string;
  driveUrl:    string | null;
  certMeta:    CertMeta | null;
}

/* ── ICP-Brasil SVG oficial ──────────────────────────────────────────── */
function IcpBrasilSvg({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.12)} viewBox="0 0 80 90"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M40 4 L75 16 L75 47 Q75 70 40 86 Q5 70 5 47 L5 16 Z"
        fill="#003399" stroke="#001f6e" strokeWidth="1.2" />
      <path d="M5 54 Q5 70 40 86 Q75 70 75 54 Z" fill="#009c43" />
      <path d="M40 9 L71 20 L71 47 Q71 67 40 82 Q9 67 9 47 L9 20 Z"
        fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <circle cx="40" cy="38" r="16" fill="rgba(255,255,255,0.10)"
        stroke="rgba(255,255,255,0.30)" strokeWidth="0.8" />
      <text x="40" y="33" textAnchor="middle" fill="white"
        fontWeight="900" fontSize="11.5" fontFamily="Arial Black, Arial, sans-serif"
        letterSpacing="2">ICP</text>
      <rect x="25" y="36.5" width="30" height="1.2" fill="rgba(255,255,255,0.55)" rx="0.6" />
      <text x="40" y="49" textAnchor="middle" fill="white"
        fontWeight="700" fontSize="7.5" fontFamily="Arial, sans-serif" letterSpacing="2.5">
        BRASIL
      </text>
      <text x="40" y="67" textAnchor="middle" fill="rgba(255,255,255,0.75)"
        fontSize="8" fontFamily="Arial">★ ★ ★ ★ ★</text>
    </svg>
  );
}

/* ── Cabeçalho de painel (Padrão 3 da skill) — placa bevel saliente ─── */
function PanelHeader({ icon: Icon, label }: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="bevel-3d px-4 py-2.5 flex items-center gap-2.5 rounded-t-[6px]">
      <Icon size={13} style={{ color: "rgba(201,162,78,0.80)" }} />
      <span
        className="text-[10px] font-black tracking-[0.26em] uppercase"
        style={{ fontFamily: "'Cinzel',serif", color: "rgba(201,162,78,0.85)" }}
      >
        {label}
      </span>
    </div>
  );
}

/* ── Wordmark PADAXOR ────────────────────────────────────────────────── */
function PadaxorWordmark({ size = "text-[22px]" }: { size?: string }) {
  return (
    <span
      className={`${size} font-black tracking-[0.35em] uppercase`}
      style={{
        fontFamily: "'Cinzel','Playfair Display',serif",
        background:
          "linear-gradient(135deg,#6f5421 0%,#f6e6a8 22%,#c9a24e 55%,#f1dd9a 78%,#927235 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      PADAXOR
    </span>
  );
}

/* ── Componente principal ────────────────────────────────────────────── */
export default function ConsultaReceituario() {
  const search = useSearch();
  const token  = new URLSearchParams(search).get("token") ?? "";
  const { theme, toggle } = useScreenTheme();

  const [data,    setData]    = useState<ConsultaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token não informado. Utilize o QR code impresso na prescrição.");
      setLoading(false);
      return;
    }
    fetch(`/api/receituario/consulta?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() as Promise<ConsultaData> : Promise.reject(r.status))
      .then(d  => { setData(d); setLoading(false); })
      .catch(() => {
        setError("Documento não encontrado ou token inválido. Verifique o QR code da prescrição.");
        setLoading(false);
      });
  }, [token]);

  /* datas formatadas */
  const dataEmissao = data?.dataEmissao
    ? new Date(data.dataEmissao + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit", month: "long", year: "numeric",
      })
    : "—";

  function fmtDate(iso: string | undefined) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  }

  const fingerprint = token
    ? Array.from(token.toUpperCase())
        .map((c, i) => (i % 4 === 3 ? c + " " : c)).join("").trim()
    : "—";

  /* bg base por tema */
  const bgBase = theme === "dark"
    ? "linear-gradient(180deg,#0b1426 0%,#0e1c3a 55%,#16284e 100%)"
    : "linear-gradient(180deg,#f4f0ea 0%,#ece5d6 100%)";

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} min-h-screen flex flex-col relative`}
      style={{ background: bgBase }}
    >
      {/* ── Tecido terno de alfaiataria (absoluto, z=0) ──────────── */}
      <div className="leva-fabric" />

      {/* ── CONTEÚDO sobre o terno (z=10) ────────────────────────── */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── CABEÇALHO PADAXOR — SEMPRE NAVY, sticky ────────────────── */}
        <header
          className="sticky top-0 z-50 w-full flex items-center justify-between px-5 py-3 relative"
          style={{
            background: "linear-gradient(180deg,#0e1a34 0%,#16284a 100%)",
            borderBottom: "1px solid rgba(201,162,78,0.28)",
            boxShadow: "0 2px 20px rgba(0,0,0,0.40)",
          }}
        >
          {/* Esquerda: símbolo + wordmark oficial */}
          <div className="flex items-center gap-3">
            <PaxterSymbolGlass size={40} tone="dark" />

            {/* Coluna: wordmark PNG transparente + 2 linhas de subtítulo */}
            <div className="flex flex-col justify-center" style={{ gap: 3 }}>
              {/*
                REGRA (Dr. Claude 26/07/2026):
                - Nunca filtro, nunca mix-blend-mode, nunca altura fixa
                - width: 100%, height: auto, object-fit: contain
                - Proporção original SEMPRE preservada
              */}
              <img
                src="/brand/padaxor-wordmark-nobg.png"
                alt="PADAXOR"
                draggable={false}
                style={{
                  width: "100%",
                  maxWidth: "210px",
                  height: "auto",
                  display: "block",
                  objectFit: "contain",
                  userSelect: "none",
                  WebkitUserDrag: "none" as React.CSSProperties["WebkitUserDrag"],
                }}
              />
              {/* Subtítulo linha 1 — copiado de entrada.tsx l.121 */}
              <span
                className="uppercase leading-none"
                style={{ fontSize: "7.5px", letterSpacing: "0.40em", color: "#8aa0c4" }}
              >
                Clinical Intelligence System
              </span>
              {/* Subtítulo linha 2 — copiado de entrada.tsx l.124 */}
              <span
                className="uppercase leading-none"
                style={{ fontSize: "7px", letterSpacing: "0.22em", color: "#6f86ad" }}
              >
                Motor Clínico · Protocolos Injetáveis
              </span>
            </div>
          </div>

          {/* Direita: toggle claro/escuro */}
          <ThemeToggle theme={theme} onToggle={toggle} />
        </header>

        {/* ── CONTEÚDO ─────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col items-center justify-start px-4 py-10">
          <div className="w-full max-w-[480px] flex flex-col gap-4">

            {/* CARREGANDO */}
            {loading && (
              <div className="panel-3d p-10 flex flex-col items-center gap-4">
                <Loader2 size={36} className="animate-spin"
                  style={{ color: "#c9a24e" }} />
                <p className="text-sm tracking-wide"
                  style={{ color: "rgba(201,162,78,0.70)" }}>
                  Verificando documento...
                </p>
              </div>
            )}

            {/* ERRO */}
            {error && !loading && (
              <>
                <div className="panel-3d p-5 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="paxter-led paxter-led-red paxter-led-on" />
                    <ShieldX size={28} style={{ color: "#f87171" }} />
                    <span
                      className="text-base font-black tracking-[0.18em] uppercase"
                      style={{ color: "#f87171", fontFamily: "'Cinzel',serif" }}
                    >
                      Documento Inválido
                    </span>
                  </div>
                  <p className="text-xs text-center leading-relaxed mt-1"
                    style={{ color: "rgba(248,113,113,0.80)" }}>
                    {error}
                  </p>
                </div>
                <div className="concave-3d p-4 flex items-start gap-3">
                  <QrCode size={22} className="shrink-0 mt-0.5"
                    style={{ color: "rgba(201,162,78,0.60)" }} />
                  <p className="text-xs leading-relaxed"
                    style={{ color: "rgba(0,0,0,0.55)" }}>
                    Escaneie o QR code impresso no rodapé da prescrição ou acesse
                    o link completo fornecido pelo médico prescritor.
                  </p>
                </div>
              </>
            )}

            {/* SUCESSO */}
            {data && !loading && (
              <>
                {/* ── 1. DOCUMENTO VERIFICADO — levitando sobre o terno ── */}
                <div
                  className="bevel-3d bevel-3d-ok p-6 flex flex-col items-center gap-3 rounded-[8px]"
                  style={{
                    /* sombra amplificada = impressão de GRANDE ALTURA sobre o tecido */
                    boxShadow: [
                      "inset 0 4px 0 rgba(255,255,255,0.98)",
                      "inset 0 -8px 14px rgba(0,100,50,0.12)",
                      "0 2px 0 rgba(0,0,0,0.08)",
                      "0 6px 0 rgba(0,0,0,0.10)",
                      "0 12px 0 rgba(0,0,0,0.08)",
                      "0 24px 32px -4px rgba(0,0,0,0.42)",
                      "0 40px 64px -8px rgba(0,0,0,0.28)",
                      "0 64px 96px -12px rgba(74,222,128,0.18)",
                    ].join(","),
                    transform: "translateY(-4px)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="paxter-led paxter-led-green paxter-led-on" />
                    <ShieldCheck size={28}
                      style={{ color: theme === "dark" ? "#4ade80" : "#16a34a" }} />
                    <span
                      className="text-base font-black tracking-[0.20em] uppercase"
                      style={{
                        fontFamily: "'Cinzel',serif",
                        color: theme === "dark" ? "#4ade80" : "#15803d",
                      }}
                    >
                      Documento Verificado
                    </span>
                  </div>
                  <div
                    className="mt-1 px-4 py-1.5 rounded-[6px] concave-3d"
                  >
                    <span
                      className="text-[9px] tracking-widest uppercase mr-2"
                      style={{ color: "rgba(0,0,0,0.40)" }}
                    >token</span>
                    <span
                      className="font-mono text-sm font-bold"
                      style={{
                        color: theme === "dark" ? "#f6e6a8" : "#8a6d2f",
                        letterSpacing: "0.18em",
                      }}
                    >
                      {token.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* ── 2. DADOS DA PRESCRIÇÃO ──────────────────────────── */}
                <div className="panel-3d overflow-hidden">
                  <PanelHeader icon={FileText} label="Dados da Prescrição" />
                  <div className="px-5 py-4 flex flex-col gap-3">
                    {([
                      { label: "PACIENTE",               value: data.paciente,  gold: true,  mono: false },
                      { label: "MÉDICO PRESCRITOR",      value: data.medico,    gold: false, mono: false },
                      { label: "CRM",                    value: data.crm,       gold: false, mono: true  },
                      { label: "CLÍNICA",                value: data.clinica,   gold: false, mono: false },
                      { label: "DATA DE EMISSÃO",        value: dataEmissao,    gold: false, mono: false },
                      { label: "IDENTIFICADOR DO ARQUIVO", value: data.arquivo, gold: false, mono: true  },
                    ] as const).map(({ label, value, gold, mono }) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span
                          className="text-[9px] font-bold tracking-[0.25em] uppercase"
                          style={{ color: "rgba(201,162,78,0.65)" }}
                        >
                          {label}
                        </span>
                        <span style={{
                          color:      gold
                            ? (theme === "dark" ? "#f6e6a8" : "#8a6d2f")
                            : (theme === "dark" ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.80)"),
                          fontWeight: gold ? 700 : 400,
                          fontFamily: gold
                            ? "'Cormorant Garamond','Georgia',serif"
                            : mono ? "monospace" : undefined,
                          fontSize:   gold ? "15px" : mono ? "11px" : "13px",
                        }}>
                          {String(value ?? "—")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 3. CREDENCIAL DO ASSINANTE ─────────────────────── */}
                {data.certMeta && (
                  <div className="panel-3d overflow-hidden">
                    <PanelHeader icon={BadgeCheck} label="Credencial do Assinante" />
                    <div className="px-5 py-4 flex flex-col gap-2.5">
                      {([
                        { label: "TITULAR DO CERTIFICADO", value: data.certMeta.titular, bold: true,  highlight: false },
                        { label: "CPF DO TITULAR",          value: data.certMeta.cpf ?? "—",          bold: false, highlight: false },
                        { label: "TIPO DE CERTIFICADO",     value: data.certMeta.tipo,                bold: false, highlight: false },
                        { label: "AUTORIDADE CERTIFICADORA", value: data.certMeta.issuer,             bold: false, highlight: false },
                        { label: "CADEIA RAIZ",             value: data.certMeta.raiz,                bold: false, highlight: false },
                        {
                          label: "VÁLIDO ATÉ",
                          value: fmtDate(data.certMeta.validTo),
                          bold: false,
                          highlight: new Date(data.certMeta.validTo) > new Date(),
                        },
                      ] as const).map(({ label, value, bold, highlight }) => (
                        <div key={label} className="flex flex-col gap-0.5">
                          <span
                            className="text-[9px] font-bold tracking-[0.25em] uppercase"
                            style={{ color: "rgba(201,162,78,0.65)" }}
                          >
                            {label}
                          </span>
                          <span style={{
                            color:      highlight
                              ? "#4ade80"
                              : bold
                                ? (theme === "dark" ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.85)")
                                : (theme === "dark" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)"),
                            fontWeight: bold ? 600 : 400,
                            fontSize:   "12px",
                          }}>
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 4. LACRE DIGITAL ──────────────────────────────── */}
                {data.certMeta && (
                  <div className="panel-3d overflow-hidden">
                    <PanelHeader icon={Lock} label="Lacre Digital do Documento" />
                    <div className="px-5 py-4 flex flex-col gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="text-[9px] font-bold tracking-[0.25em] uppercase"
                          style={{ color: "rgba(201,162,78,0.65)" }}
                        >
                          NÚMERO DE SÉRIE DO CERTIFICADO
                        </span>
                        <span
                          className="font-mono text-[11px] break-all"
                          style={{
                            color: theme === "dark"
                              ? "rgba(255,255,255,0.70)"
                              : "rgba(0,0,0,0.60)",
                            letterSpacing: "0.08em",
                          }}
                        >
                          {data.certMeta.serial.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="text-[9px] font-bold tracking-[0.25em] uppercase"
                          style={{ color: "rgba(201,162,78,0.65)" }}
                        >
                          ALGORITMO DE ASSINATURA
                        </span>
                        <span className="text-[12px]"
                          style={{ color: theme === "dark" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)" }}>
                          {data.certMeta.algoritmo}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="text-[9px] font-bold tracking-[0.25em] uppercase"
                          style={{ color: "rgba(201,162,78,0.65)" }}
                        >
                          PADRÃO DE ASSINATURA
                        </span>
                        <span className="text-[12px]"
                          style={{ color: theme === "dark" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)" }}>
                          {data.certMeta.padrao}
                        </span>
                      </div>
                      {/* Token de autenticidade */}
                      <div className="concave-3d px-4 py-3 rounded-[6px]">
                        <span
                          className="text-[9px] font-bold tracking-[0.25em] uppercase block mb-1.5"
                          style={{ color: "rgba(201,162,78,0.65)" }}
                        >
                          TOKEN DE AUTENTICIDADE
                        </span>
                        <span
                          className="font-mono text-[14px] font-bold"
                          style={{
                            color: theme === "dark" ? "#f6e6a8" : "#8a6d2f",
                            letterSpacing: "0.22em",
                          }}
                        >
                          {fingerprint}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 5. SELO ICP-BRASIL ─────────────────────────────── */}
                <div className="panel-3d overflow-hidden">
                  <PanelHeader icon={Award} label="Infraestrutura de Chaves Públicas Brasileira" />
                  <div
                    className="flex flex-col items-center px-5 py-5 gap-4"
                    style={{
                      background: theme === "dark"
                        ? "linear-gradient(135deg,rgba(0,51,153,0.18) 0%,rgba(0,156,67,0.12) 100%)"
                        : "linear-gradient(135deg,rgba(0,51,153,0.06) 0%,rgba(0,156,67,0.05) 100%)",
                    }}
                  >
                    <div className="flex items-center gap-5">
                      <div
                        className="shrink-0 rounded-[10px] p-3 flex items-center justify-center"
                        style={{
                          background: "linear-gradient(145deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))",
                          boxShadow: "0 2px 12px rgba(0,51,153,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                          border: "1px solid rgba(255,255,255,0.15)",
                        }}
                      >
                        <IcpBrasilSvg size={64} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <div>
                          <p
                            className="text-[11px] font-bold leading-tight"
                            style={{ color: theme === "dark" ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.80)" }}
                          >
                            Assinado Digitalmente
                          </p>
                          <p
                            className="text-[10px] leading-snug mt-0.5"
                            style={{ color: theme === "dark" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)" }}
                          >
                            conforme MP 2.200-2/2001<br />e Lei 14.063/2020
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="paxter-led paxter-led-green paxter-led-on" />
                          <span className="text-[10px] font-semibold" style={{ color: "#4ade80" }}>
                            Validade jurídica garantida
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="w-full h-px"
                      style={{ background: "rgba(201,162,78,0.18)" }}
                    />

                    <div className="w-full concave-3d px-4 py-3 rounded-[6px] flex flex-col gap-1.5">
                      <p
                        className="text-[9px] font-bold tracking-[0.18em] uppercase"
                        style={{ color: "rgba(201,162,78,0.65)" }}
                      >
                        Verificação Independente
                      </p>
                      <p
                        className="text-[11px] leading-relaxed"
                        style={{ color: theme === "dark" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)" }}
                      >
                        Acesse o portal oficial do ITI (Instituto de Tecnologia da
                        Informação) e valide a assinatura deste documento:
                      </p>
                      <a
                        href="https://validar.iti.gov.br"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 w-fit text-[11px] font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity mt-0.5"
                        style={{ color: "#4ade80" }}
                      >
                        <ExternalLink size={12} />
                        validar.iti.gov.br
                      </a>
                      <a
                        href="https://www.iti.gov.br"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 w-fit text-[10px] underline underline-offset-2 hover:opacity-80 transition-opacity"
                        style={{ color: theme === "dark" ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)" }}
                      >
                        <ExternalLink size={10} />
                        www.iti.gov.br — Portal ITI
                      </a>
                    </div>
                  </div>
                </div>

                {/* ── 6. BOTÃO GOOGLE DRIVE ─────────────────────────── */}
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
                  <div
                    className="concave-3d px-5 py-4 text-center text-[12px]"
                    style={{ color: theme === "dark" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.40)" }}
                  >
                    O PDF foi enviado por e-mail ao médico prescritor.
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* ── RODAPÉ ELEGANTE ──────────────────────────────────────── */}
        <footer className="footer-brand-band w-full flex flex-col items-center gap-2 py-6 px-4">
          {/* Linha 1 — marca principal */}
          <div className="flex items-center gap-3">
            <div
              className="h-px flex-1 max-w-[48px]"
              style={{ background: "rgba(201,162,78,0.35)" }}
            />
            <PadaxorWordmark size="text-[13px]" />
            <div
              className="h-px flex-1 max-w-[48px]"
              style={{ background: "rgba(201,162,78,0.35)" }}
            />
          </div>

          {/* Linha 2 — subtítulo oficial do PADCON (Motor Clínico · Protocolos Injetáveis) */}
          <p
            className="text-[9px] tracking-[0.24em] uppercase text-center"
            style={{
              fontFamily: "'Cinzel',serif",
              color: theme === "dark" ? "rgba(201,162,78,0.55)" : "rgba(138,109,47,0.70)",
            }}
          >
            Motor Clínico · Protocolos Injetáveis
          </p>

          {/* Linha separadora */}
          <div
            className="h-px w-24 my-0.5"
            style={{ background: "rgba(201,162,78,0.22)" }}
          />

          {/* Linha 3 — infra */}
          <p
            className="text-[8px] tracking-[0.18em] uppercase text-center"
            style={{ color: theme === "dark" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.28)" }}
          >
            Desenvolvido pela PADCOM · Assinatura A1 ICP-Brasil
          </p>
        </footer>

      </div>{/* /z-10 */}
    </div>
  );
}
