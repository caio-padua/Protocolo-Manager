import "../components/paxter/paxter3d.css";
import { useState, type ReactNode } from "react";
import { Building2, IdCard, Lock, Phone, ShieldCheck } from "lucide-react";
import { PaxterSymbolPremium } from "./paxter/PaxterSymbolPremium";
import { LOCKUP_STYLE, PaxterWord } from "./paxter/paxterLockup";
import { VITRINE_STYLE } from "../pages/VitrineDemo";

/* ----------------------------------------------------------------------------
   PORTA DE ACESSO DA VITRINE — o "login" É a captação de lead.
   Paciente: nome + CPF + telefone.
   Clínica:  nome + CNPJ + CPF do responsável + telefone.
   (Data de nascimento removida em 27/07/2026 — minimização de dados, LGPD.)
   Ao validar no servidor (POST /api/vitrine-leads), libera a tela e guarda
   a liberação no aparelho (localStorage). Sem senha real — é demonstração
   pública com captação comercial.
---------------------------------------------------------------------------- */

type Tipo = "paciente" | "clinica";

const CHAVE = (tipo: Tipo) => `paxter.vitrine.acesso.${tipo}`;

export function acessoLiberado(tipo: Tipo): boolean {
  try {
    return localStorage.getItem(CHAVE(tipo)) === "ok";
  } catch {
    return false;
  }
}

function mascaraCpf(v: string): string {
  const d = v.replace(/\D+/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

function mascaraCnpj(v: string): string {
  const d = v.replace(/\D+/g, "").slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function mascaraTelefone(v: string): string {
  const d = v.replace(/\D+/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function Campo({
  rotulo,
  icone,
  children,
}: {
  rotulo: string;
  icone: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#cbb778]">
        {icone} {rotulo}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLS =
  "w-full rounded-[6px] px-3 py-2.5 text-[15px] font-medium text-[#16294a] outline-none " +
  "focus:ring-2 focus:ring-[#e7cd8f]";
const INPUT_STYLE = {
  background: "hsl(40 33% 96%)",
  boxShadow: "inset 0 2px 4px rgba(7,22,43,0.25), inset 0 0 0 1px rgba(7,22,43,0.15)",
} as const;

export function AcessoGate({ tipo, onLiberar }: { tipo: Tipo; onLiberar: () => void }) {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [tel, setTel] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const titulo = tipo === "paciente" ? "Acesse a demonstração" : "Acesso para clínicas";
  const subtitulo =
    tipo === "paciente"
      ? "Identifique-se para ver o aplicativo por dentro. Leva menos de um minuto."
      : "Identifique a sua clínica para ver a apresentação completa.";

  async function enviar() {
    setErro(null);
    if (nome.trim().length < 3) {
      setErro("Preencha o seu nome completo.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/vitrine-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          nome: nome.trim(),
          cpf,
          cnpj: tipo === "clinica" ? cnpj : undefined,
          telefone: tel,
          rotaOrigem: window.location.pathname,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setErro(j.error || "Não foi possível liberar o acesso. Tente de novo.");
        return;
      }
      try {
        localStorage.setItem(CHAVE(tipo), "ok");
      } catch {
        /* modo anônimo: segue sem persistir */
      }
      onLiberar();
    } catch {
      setErro("Falha de conexão. Verifique a internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="area-root suit-navy-bg flex min-h-screen w-full items-center justify-center font-sans">
      <style>{LOCKUP_STYLE + VITRINE_STYLE}</style>
      <div className="w-full max-w-[400px] px-5 py-10">
        <div className="mb-6 flex items-center justify-center gap-2">
          <PaxterSymbolPremium size={34} tone="dark" />
          <PaxterWord theme="dark" fontSize={22} />
        </div>

        <div className="gold-hair px-5 pb-6 pt-5" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="mb-1 flex items-center gap-2">
            {tipo === "clinica" ? (
              <Building2 className="h-5 w-5 text-[#e7cd8f]" />
            ) : (
              <Lock className="h-5 w-5 text-[#e7cd8f]" />
            )}
            <span className="font-serif text-[20px] font-bold text-white">{titulo}</span>
          </div>
          <div className="mb-5 text-[12px] leading-snug text-slate-300">{subtitulo}</div>

          <div className="flex flex-col gap-3.5">
            <Campo rotulo="Nome completo" icone={<ShieldCheck className="h-3.5 w-3.5" />}>
              <input
                className={INPUT_CLS}
                style={INPUT_STYLE}
                autoComplete="name"
                placeholder="O seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Campo>
            {tipo === "clinica" && (
              <Campo rotulo="CNPJ da clínica" icone={<Building2 className="h-3.5 w-3.5" />}>
                <input
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={(e) => setCnpj(mascaraCnpj(e.target.value))}
                />
              </Campo>
            )}
            <Campo
              rotulo={tipo === "clinica" ? "CPF do responsável" : "CPF"}
              icone={<IdCard className="h-3.5 w-3.5" />}
            >
              <input
                className={INPUT_CLS}
                style={INPUT_STYLE}
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(mascaraCpf(e.target.value))}
              />
            </Campo>
            <Campo rotulo="Telefone com DDD" icone={<Phone className="h-3.5 w-3.5" />}>
              <input
                className={INPUT_CLS}
                style={INPUT_STYLE}
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 90000-0000"
                value={tel}
                onChange={(e) => setTel(mascaraTelefone(e.target.value))}
              />
            </Campo>
          </div>

          {erro && (
            <div className="mt-3 px-3 py-2 text-[12px] font-medium text-[#ffd9d9]" style={{ background: "rgba(180,40,40,0.25)" }}>
              {erro}
            </div>
          )}

          <button
            onClick={enviar}
            disabled={enviando}
            className="btn-3d cta-glow mt-5 flex w-full items-center justify-center gap-2 px-4 py-3 text-[14px] font-bold uppercase tracking-[0.08em] text-[#3a2c08] disabled:opacity-60"
          >
            {enviando ? "Verificando..." : "Entrar na demonstração"}
          </button>

          <div className="mt-3 text-center text-[10px] leading-snug text-slate-400">
            Os seus dados servem apenas para liberar a demonstração e para o nosso
            contato. Não há cobrança e não há compromisso.
          </div>
        </div>
      </div>
    </div>
  );
}
