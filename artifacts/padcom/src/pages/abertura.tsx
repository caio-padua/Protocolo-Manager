import { useState } from "react";
import { Link } from "wouter";
import {
  Menu, X, ChevronRight, ArrowRight,
  Activity, HeartPulse, Moon, ShieldPlus, Dna, Sparkles,
  UserRound, ClipboardList, CalendarCheck, Upload,
  Phone, Mail, MapPin,
} from "lucide-react";
import paxterSymbol from "@/assets/paxter-symbol.png";
import { PAXTER_SITE_URL } from "@/lib/brand";
import { PaxterLogo as BrandLockup } from "@/components/branding/PaxterLogo";

// Site de abertura (porta de entrada publica). Modelo de layout inspirado na
// estrutura de uma clinica (heroi/proposito -> condicoes -> jornada 3 fases),
// porem com as cores da marca (navy + dourado Paxter + verde-petroleo/ciano) e
// MENU LATERAL ESQUERDO. A logo e o simbolo recortado (transparente) inserido
// SOBRE o fundo navy do menu — nunca um quadrado colado por cima.

const SECOES = [
  { id: "inicio", label: "Início" },
  { id: "tratamentos", label: "Tratamentos" },
  { id: "como-funciona", label: "Como Funciona" },
  { id: "clinica", label: "A Clínica" },
  { id: "contato", label: "Contato" },
];

const ACESSOS = [
  { href: "/area", label: "Área do Cliente", Icone: UserRound, destaque: true },
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

export default function Abertura() {
  const [menuAberto, setMenuAberto] = useState(false);

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
        {/* Brilho dourado atras da logo */}
        <div className="relative border-b border-white/10 px-6 py-7">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(220px 140px at 30% 30%, rgba(194,160,90,0.20), transparent 70%)",
            }}
          />
          <a
            href={PAXTER_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex items-center gap-3"
            aria-label="Abrir site do Paxter"
          >
            <img
              src={paxterSymbol}
              alt="Paxter"
              className="h-14 w-14 object-contain drop-shadow-[0_4px_16px_rgba(194,160,90,0.45)]"
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
          {ACESSOS.map(({ href, label, Icone, destaque }) => (
            <Link
              key={label}
              href={href}
              onClick={() => setMenuAberto(false)}
              className={`mb-1.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                destaque
                  ? "border border-[#c2a05a]/45 bg-gradient-to-r from-[#c2a05a]/20 to-[#c2a05a]/5 font-semibold text-[#f1dca6] hover:from-[#c2a05a]/30"
                  : "text-white/75 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icone className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-4 text-[10px] uppercase tracking-[0.18em] text-white/35">
          Instituto Pádua · Paxter
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
        <section id="inicio" className="relative overflow-hidden px-6 py-20 sm:px-12 lg:py-28">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(900px 460px at 80% -10%, rgba(194,160,90,0.16), transparent 60%), radial-gradient(700px 420px at 0% 110%, rgba(34,72,128,0.5), transparent 60%)",
            }}
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <h1 className="sr-only">
              PAXTER — Clinical Intelligence System · Precisão em cuidado integrativo
            </h1>
            <BrandLockup variant="hero" className="mx-auto" />
            <p className="mx-auto mt-8 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
              Protocolos injetáveis, longevidade e performance guiados por inteligência
              clínica — com avaliação individualizada, registro assinado e acompanhamento
              contínuo da nossa equipe.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/area"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#d9bd7e] to-[#b8924d] px-6 py-3 text-sm font-semibold text-[#1a1206] shadow-lg transition-transform hover:-translate-y-0.5"
              >
                <UserRound className="h-4 w-4" /> Área do Cliente
              </Link>
              <Link
                href="/agendar"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[#c2a05a]/60 hover:text-[#f1dca6]"
              >
                Agendar Consulta <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* TRATAMENTOS */}
        <section id="tratamentos" className="border-t border-white/10 bg-white/[0.02] px-6 py-16 sm:px-12">
          <div className="mb-10 max-w-xl">
            <h2 className="font-serif text-3xl text-white">O que tratamos</h2>
            <p className="mt-3 text-sm text-white/60">
              Áreas de atuação com protocolos personalizados para cada cliente.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRATAMENTOS.map(({ Icone, titulo, texto }) => (
              <div
                key={titulo}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-all hover:-translate-y-0.5 hover:border-[#c2a05a]/40"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[#c2a05a]/30 bg-[#c2a05a]/10 text-[#e8cf95]">
                  <Icone className="h-5 w-5" />
                </div>
                <div className="text-base font-semibold text-white">{titulo}</div>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* COMO FUNCIONA — jornada em 3 fases (blueprint com setas) */}
        <section id="como-funciona" className="border-t border-white/10 px-6 py-16 sm:px-12">
          <div className="mb-10 max-w-xl">
            <h2 className="font-serif text-3xl text-white">Como funciona</h2>
            <p className="mt-3 text-sm text-white/60">
              Sua jornada do primeiro contato ao acompanhamento, em três fases.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center">
            {FASES.map((f, i) => (
              <div key={f.n} className="flex flex-1 items-center gap-4 lg:flex-col lg:items-stretch">
                <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <div className="mb-2 inline-block rounded-md border border-[#c2a05a]/40 bg-[#c2a05a]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e8cf95]">
                    {f.n}
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
        <section id="clinica" className="border-t border-white/10 bg-white/[0.02] px-6 py-16 sm:px-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <h2 className="font-serif text-3xl text-white">A Clínica</h2>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                Mais do que uma clínica, somos um time dedicado a unir ciência, tecnologia
                e cuidado humano. Cada protocolo é montado de forma individualizada, com
                rastreabilidade completa — da avaliação à última aplicação.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
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
                <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">{k}</div>
                  <div className="mt-1 text-lg font-semibold text-[#f1dca6]">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CONTATO / RODAPE */}
        <section id="contato" className="border-t border-white/10 px-6 py-14 sm:px-12">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="flex items-center gap-3 text-sm text-white/70">
              <Phone className="h-5 w-5 text-[#e8cf95]" /> Atendimento por WhatsApp
            </div>
            <div className="flex items-center gap-3 text-sm text-white/70">
              <Mail className="h-5 w-5 text-[#e8cf95]" /> contato@clinicapadua.com.br
            </div>
            <div className="flex items-center gap-3 text-sm text-white/70">
              <MapPin className="h-5 w-5 text-[#e8cf95]" /> Tatuapé · Mooca · Domiciliar
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 px-6 py-8 text-center text-[11px] uppercase tracking-[0.2em] text-white/35 sm:px-12">
          Instituto Pádua · Paxter — desenvolvido pela Padcon
        </footer>
      </main>
    </div>
  );
}
