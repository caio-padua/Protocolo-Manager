import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Menu, X, ChevronRight, ArrowRight,
  Activity, HeartPulse, Moon, ShieldPlus, Dna, Sparkles,
  UserRound, Stethoscope, ClipboardList, CalendarCheck, Upload,
  Phone, Mail, MapPin,
} from "lucide-react";
import paxterSymbol from "@/assets/paxter-symbol.png";
import { PAXTER_SITE_URL } from "@/lib/brand";
import { PaxterLogo as BrandLockup } from "@/components/branding/PaxterLogo";
import { PadconLogo } from "@/components/branding/PadconLogo";

// Site de abertura (porta de entrada publica do PRODUTO Paxter). Navy + dourado
// Paxter, acabamento premium. No SITE o simbolo e CHAPADO (mesmo plano do wordmark,
// estilo PAWARDS) e o BRILHO e CONTIDO — nunca lava o painel navy ao redor.
// O site e do sistema (vendido a varias clinicas); nao cita Instituto Padua.
// O rodape leva a empresa que desenvolve: PADCON (link clicavel).

const SECOES = [
  { id: "inicio", label: "Início" },
  { id: "acessos", label: "Acessos" },
  { id: "tratamentos", label: "Tratamentos" },
  { id: "como-funciona", label: "Como Funciona" },
  { id: "clinica", label: "A Clínica" },
  { id: "contato", label: "Contato" },
];

// Portais principais (cartoes grandes em destaque) e acoes rapidas.
const PORTAIS = [
  {
    href: "/area",
    Icone: UserRound,
    titulo: "Área do Cliente",
    texto: "Acompanhe seu protocolo, sessões, exames e pagamentos.",
  },
  {
    href: "/entrada",
    Icone: Stethoscope,
    titulo: "Área do Colaborador",
    texto: "Acesso da equipe clínica e administrativa ao sistema.",
  },
];

const ACOES = [
  { href: "/anamnese/v2", label: "Ficha de Saúde", Icone: ClipboardList },
  { href: "/agendar", label: "Agendar Consulta", Icone: CalendarCheck },
  { href: "/portal", label: "Enviar Exames", Icone: Upload },
];

const TRATAMENTOS = [
  { Icone: Dna, titulo: "Longevidade & Performance", texto: "Protocolos para energia, vitalidade e desempenho físico e mental." },
  { Icone: HeartPulse, titulo: "Reposição Hormonal", texto: "Equilíbrio hormonal individualizado com acompanhamento clínico." },
  { Icone: ShieldPlus, titulo: "Imunidade", texto: "Suporte imunológico com nutrientes e protocolos endovenosos." },
  { Icone: Moon, titulo: "Sono & Bem-estar", texto: "Melhora do sono, do humor e da qualidade de vida." },
  { Icone: Activity, titulo: "Metabolismo", texto: "Manejo de peso, composição corporal e saúde metabólica." },
  { Icone: Sparkles, titulo: "Estética Injetável", texto: "Procedimentos injetáveis com segurança e registro completo." },
];

const FASES = [
  { n: "Fase I", titulo: "Cadastro & Anamnese", texto: "Você preenche sua ficha de saúde online antes da consulta." },
  { n: "Fase II", titulo: "Avaliação & Protocolo", texto: "Avaliação clínica, exames e montagem do protocolo individualizado." },
  { n: "Fase III", titulo: "Aplicação & Acompanhamento", texto: "Aplicações agendadas, registro assinado e acompanhamento contínuo." },
];

const DIFERENCIAIS = [
  "Registro assinado digitalmente",
  "Equipe multidisciplinar",
  "Acompanhamento contínuo",
];

// Pequeno rotulo dourado com regua fina (premium "eyebrow")
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-9 bg-gradient-to-r from-[#c2a05a] to-transparent" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#c2a05a]">
        {children}
      </span>
    </div>
  );
}

export default function Abertura() {
  const [menuAberto, setMenuAberto] = useState(false);
  const ano = new Date().getFullYear();

  function irPara(id: string) {
    setMenuAberto(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-[#0d1830] text-white lg:flex">
      {/* Barra superior (somente mobile) */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0b1426] px-4 py-3 lg:hidden">
        <a
          href={PAXTER_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2"
          aria-label="Abrir site do Paxter"
        >
          <img src={paxterSymbol} alt="Paxter" className="h-9 w-9 object-contain" />
          <span className="font-serif text-lg tracking-[0.16em] text-[#e8cf95]">PAXTER</span>
        </a>
        <button
          type="button"
          aria-label="Abrir menu"
          onClick={() => setMenuAberto((v) => !v)}
          className="rounded-md border border-white/15 p-2 text-white/80"
        >
          {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* MENU LATERAL ESQUERDO — logo integrada sobre o fundo navy        */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[#c2a05a]/15
          transition-transform duration-300 lg:static lg:translate-x-0
          ${menuAberto ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{
          background:
            "linear-gradient(180deg, #0b1426 0%, #0d1830 55%, #11203c 100%)",
        }}
      >
        {/* Logo — brilho CONTIDO (sem wash dourado no painel) */}
        <div className="border-b border-white/10 px-6 py-7">
          <a
            href={PAXTER_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3"
            aria-label="Abrir site do Paxter"
          >
            <img
              src={paxterSymbol}
              alt="Paxter"
              className="h-14 w-14 object-contain drop-shadow-[0_2px_7px_rgba(194,160,90,0.30)]"
            />
            <div className="leading-tight">
              <div className="font-serif text-2xl tracking-[0.16em] text-[#e8cf95]">PAXTER</div>
              <div className="text-[9px] uppercase tracking-[0.22em] text-white/55">
                Clinical Intelligence System
              </div>
            </div>
          </a>
        </div>

        {/* Navegacao de secoes */}
        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
            Navegação
          </div>
          {SECOES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => irPara(s.id)}
              className="group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {s.label}
              <ChevronRight className="h-4 w-4 text-white/20 transition-colors group-hover:text-[#e8cf95]" />
            </button>
          ))}

          <div className="mt-6 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
            Acesso
          </div>
          {PORTAIS.map(({ href, titulo, Icone }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuAberto(false)}
              className="mb-1.5 flex items-center gap-3 rounded-lg border border-[#c2a05a]/45 bg-gradient-to-r from-[#c2a05a]/20 to-[#c2a05a]/5 px-3 py-2.5 text-sm font-semibold text-[#f1dca6] transition-all hover:from-[#c2a05a]/30"
            >
              <Icone className="h-4 w-4 flex-shrink-0" />
              {titulo}
            </Link>
          ))}
          {ACOES.map(({ href, label, Icone }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuAberto(false)}
              className="mb-1.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/75 transition-all hover:bg-white/[0.06] hover:text-white"
            >
              <Icone className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-4 text-[10px] uppercase tracking-[0.18em] text-white/35">
          PAXTER · Clinical Intelligence System
        </div>
      </aside>

      {/* Fundo escuro ao abrir o menu no mobile */}
      {menuAberto && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMenuAberto(false)}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* CONTEUDO PRINCIPAL                                               */}
      {/* ---------------------------------------------------------------- */}
      <main className="relative min-w-0 flex-1 overflow-x-hidden">
        {/* HERO */}
        <section id="inicio" className="relative overflow-hidden px-6 py-24 sm:px-12 lg:py-32">
          {/* Profundidade navy sutil — brilho dourado CONTIDO (nao lava o painel) */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(520px 300px at 80% -10%, rgba(194,160,90,0.07), transparent 60%), radial-gradient(680px 420px at 0% 112%, rgba(34,72,128,0.40), transparent 60%)",
            }}
          />
          {/* Trama sutil de luxo */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <h1 className="sr-only">
              PAXTER — Clinical Intelligence System · Precisão em cuidado integrativo
            </h1>
            <BrandLockup variant="hero" className="mx-auto" />

            {/* Regua fina dourada */}
            <div className="mx-auto mt-9 h-px w-28 bg-gradient-to-r from-transparent via-[#c2a05a]/70 to-transparent" />

            <p className="mx-auto mt-7 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Protocolos injetáveis, longevidade e performance guiados por inteligência
              clínica — com avaliação individualizada, registro assinado e acompanhamento
              contínuo da nossa equipe.
            </p>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href="/area"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#f1dca6] via-[#d9bd7e] to-[#b8924d] px-7 py-3.5 text-sm font-semibold text-[#1a1206] shadow-[0_14px_34px_-16px_rgba(194,160,90,0.7)] transition-transform hover:-translate-y-0.5"
              >
                <UserRound className="h-4 w-4" /> Área do Cliente
              </Link>
              <Link
                href="/entrada"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.03] px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-[#c2a05a]/60 hover:text-[#f1dca6]"
              >
                <Stethoscope className="h-4 w-4" /> Área do Colaborador
              </Link>
            </div>

            {/* Faixa de diferenciais com pontos dourados */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
              {DIFERENCIAIS.map((d, i) => (
                <span key={d} className="flex items-center gap-5">
                  {i > 0 && <span className="h-1 w-1 rounded-full bg-[#c2a05a]/70" />}
                  {d}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ACESSOS — portais principais (Cliente + Colaborador) + acoes rapidas */}
        <section
          id="acessos"
          className="border-t border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-20 sm:px-12"
        >
          <div className="mb-12 max-w-xl">
            <Eyebrow>Entrar no sistema</Eyebrow>
            <h2 className="mt-4 font-serif text-3xl text-white sm:text-4xl">Acessos</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Escolha sua porta de entrada no Paxter.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {PORTAIS.map(({ href, Icone, titulo, texto }) => (
              <Link
                key={href}
                href={href}
                className="group relative flex items-center gap-5 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.01] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#c2a05a]/45 hover:shadow-[0_28px_64px_-28px_rgba(0,0,0,0.85)]"
              >
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c2a05a]/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-[#c2a05a]/35 bg-gradient-to-b from-[#c2a05a]/20 to-[#c2a05a]/[0.04] text-[#e8cf95]">
                  <Icone className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-white">{titulo}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-white/55">{texto}</span>
                </span>
                <ArrowRight className="h-5 w-5 flex-shrink-0 text-[#c2a05a]/60 transition-all group-hover:translate-x-1 group-hover:text-[#e8cf95]" />
              </Link>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {ACOES.map(({ href, label, Icone }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm font-medium text-white/80 transition-all hover:border-[#c2a05a]/40 hover:text-white"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[#c2a05a]/30 bg-[#c2a05a]/10 text-[#e8cf95]">
                  <Icone className="h-4 w-4" />
                </span>
                {label}
                <ChevronRight className="ml-auto h-4 w-4 text-white/20 transition-colors group-hover:text-[#e8cf95]" />
              </Link>
            ))}
          </div>
        </section>

        {/* TRATAMENTOS */}
        <section
          id="tratamentos"
          className="border-t border-white/10 px-6 py-20 sm:px-12"
        >
          <div className="mb-12 max-w-xl">
            <Eyebrow>Áreas de atuação</Eyebrow>
            <h2 className="mt-4 font-serif text-3xl text-white sm:text-4xl">O que tratamos</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Protocolos personalizados para cada cliente, da avaliação à última aplicação.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRATAMENTOS.map(({ Icone, titulo, texto }) => (
              <div
                key={titulo}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#c2a05a]/40 hover:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]"
              >
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c2a05a]/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[#c2a05a]/30 bg-gradient-to-b from-[#c2a05a]/20 to-[#c2a05a]/[0.04] text-[#e8cf95] shadow-inner">
                  <Icone className="h-5 w-5" />
                </div>
                <div className="text-base font-semibold text-white">{titulo}</div>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* COMO FUNCIONA — jornada em 3 fases (blueprint com setas) */}
        <section
          id="como-funciona"
          className="border-t border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-20 sm:px-12"
        >
          <div className="mb-12 max-w-xl">
            <Eyebrow>Sua jornada</Eyebrow>
            <h2 className="mt-4 font-serif text-3xl text-white sm:text-4xl">Como funciona</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Do primeiro contato ao acompanhamento, em três fases.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center">
            {FASES.map((f, i) => (
              <div key={f.n} className="flex flex-1 items-center gap-4 lg:flex-col lg:items-stretch">
                <div className="group relative flex-1 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-6 transition-all duration-300 hover:border-[#c2a05a]/40">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="font-serif text-3xl text-[#c2a05a]/40">{String(i + 1).padStart(2, "0")}</span>
                    <span className="inline-block rounded-md border border-[#c2a05a]/40 bg-[#c2a05a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e8cf95]">
                      {f.n}
                    </span>
                  </div>
                  <div className="text-base font-semibold text-white">{f.titulo}</div>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">{f.texto}</p>
                </div>
                {i < FASES.length - 1 && (
                  <ArrowRight className="h-6 w-6 flex-shrink-0 rotate-90 text-[#c2a05a]/60 lg:rotate-0" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* A CLINICA */}
        <section
          id="clinica"
          className="border-t border-white/10 px-6 py-20 sm:px-12"
        >
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <div>
              <Eyebrow>Quem cuida de você</Eyebrow>
              <h2 className="mt-4 font-serif text-3xl text-white sm:text-4xl">A Clínica</h2>
              <p className="mt-5 text-sm leading-relaxed text-white/70">
                Mais do que uma clínica, somos um time dedicado a unir ciência, tecnologia
                e cuidado humano. Cada protocolo é montado de forma individualizada, com
                rastreabilidade completa — da avaliação à última aplicação.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Equipe multidisciplinar, registros assinados digitalmente e acompanhamento
                próximo em cada etapa do seu tratamento.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { k: "Protocolos", v: "Individualizados" },
                { k: "Registro", v: "Assinado digital" },
                { k: "Equipe", v: "Multidisciplinar" },
                { k: "Acompanhamento", v: "Contínuo" },
              ].map(({ k, v }) => (
                <div
                  key={k}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-5 transition-all duration-300 hover:border-[#c2a05a]/40"
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c2a05a]/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">{k}</div>
                  <div className="mt-1.5 font-serif text-xl text-[#f1dca6]">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CONTATO */}
        <section id="contato" className="border-t border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-16 sm:px-12">
          <div className="mb-10 max-w-xl">
            <Eyebrow>Fale conosco</Eyebrow>
            <h2 className="mt-4 font-serif text-3xl text-white sm:text-4xl">Contato</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { Icone: Phone, texto: "Atendimento por WhatsApp" },
              { Icone: Mail, texto: "contato@clinicapadua.com.br" },
              { Icone: MapPin, texto: "Tatuapé · Mooca · Domiciliar" },
            ].map(({ Icone, texto }) => (
              <div
                key={texto}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.01] px-5 py-4 text-sm text-white/75"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[#c2a05a]/30 bg-[#c2a05a]/10 text-[#e8cf95]">
                  <Icone className="h-4 w-4" />
                </span>
                {texto}
              </div>
            ))}
          </div>
        </section>

        {/* RODAPE — empresa que desenvolve o Paxter: PADCON (clicavel) */}
        <footer className="border-t border-white/10 px-6 py-12 sm:px-12">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">
              Desenvolvido por
            </div>
            <PadconLogo />
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
              PAXTER · Clinical Intelligence System &nbsp;·&nbsp; © {ano} PADCON
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
