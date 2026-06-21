import { Link } from "wouter";
import { ChevronRight, UserRound, ClipboardList, ShieldCheck, LayoutDashboard } from "lucide-react";
import paxterSymbol from "@/assets/paxter-symbol.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Site de abertura (porta de entrada da plataforma). Marca Paxter — monograma
// dourado no canto superior esquerdo, fundo navy 3D, dourado de destaque.
type Entrada = {
  href: string;
  titulo: string;
  descricao: string;
  Icone: typeof UserRound;
  externo?: boolean;
};

const ENTRADAS: Entrada[] = [
  {
    href: `${BASE}/area`,
    titulo: "Área do Paciente",
    descricao: "Acompanhe seu protocolo, agenda e exames.",
    Icone: UserRound,
  },
  {
    href: `${BASE}/anamnese/v2`,
    titulo: "Ficha de Saúde",
    descricao: "Preencha sua anamnese antes da consulta.",
    Icone: ClipboardList,
  },
  {
    href: `${BASE}/cadastros/clinicas`,
    titulo: "Portão da Equipe",
    descricao: "Acesso restrito aos colaboradores.",
    Icone: ShieldCheck,
  },
  {
    href: "/",
    titulo: "Painel Clínico",
    descricao: "Dashboard de gestão da clínica.",
    Icone: LayoutDashboard,
    externo: true,
  },
];

export default function Abertura() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d1830] text-white">
      {/* Brilho ambiente dourado/navy */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 18% 12%, rgba(194,160,90,0.18), transparent 60%), radial-gradient(900px 500px at 85% 100%, rgba(34,72,128,0.45), transparent 60%)",
        }}
      />

      {/* Logo no canto superior esquerdo */}
      <header className="relative z-10 flex items-center gap-3 px-6 py-5 sm:px-10">
        <img
          src={paxterSymbol}
          alt="Paxter"
          className="h-12 w-12 object-contain drop-shadow-[0_4px_14px_rgba(194,160,90,0.45)] sm:h-14 sm:w-14"
        />
        <div className="leading-tight">
          <div className="font-serif text-xl tracking-[0.18em] text-[#e8cf95] sm:text-2xl">
            PAXTER
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/55">
            Clinical Intelligence System
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-16 pt-10 text-center sm:pt-16">
        <span className="mb-5 inline-block rounded-full border border-[#c2a05a]/40 bg-[#c2a05a]/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e8cf95]">
          Padcon Conect — Motor Clínico
        </span>

        <h1 className="max-w-3xl font-serif text-4xl leading-tight text-white sm:text-6xl">
          Precisão em{" "}
          <span className="bg-gradient-to-b from-[#f1dca6] to-[#b8924d] bg-clip-text text-transparent">
            cuidado integrativo
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
          Prescrições, exames e protocolos injetáveis guiados por inteligência
          clínica. Escolha por onde deseja entrar.
        </p>

        {/* Cartões de entrada */}
        <div className="mt-12 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {ENTRADAS.map(({ href, titulo, descricao, Icone, externo }) => {
            const conteudo = (
              <div className="group flex h-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#c2a05a]/50 hover:bg-white/[0.07]">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-[#c2a05a]/30 bg-[#c2a05a]/10 text-[#e8cf95]">
                  <Icone className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-white">{titulo}</div>
                  <div className="text-xs text-white/55">{descricao}</div>
                </div>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-white/30 transition-colors group-hover:text-[#e8cf95]" />
              </div>
            );
            return externo ? (
              <a key={titulo} href={href}>
                {conteudo}
              </a>
            ) : (
              <Link key={titulo} href={href}>
                {conteudo}
              </Link>
            );
          })}
        </div>
      </main>

      {/* Rodapé */}
      <footer className="relative z-10 px-6 pb-8 text-center text-[11px] uppercase tracking-[0.2em] text-white/35">
        Clínica Padua · Padcon Conect · Powered by Paxter
      </footer>
    </div>
  );
}
