import { useState } from "react";
import { ParxisWordmark } from "@/components/brand/ParxisWordmark";
import { ParxisLogo } from "@/components/brand/ParxisLogo";

// ── Conteúdo bilíngue ────────────────────────────────────────────────────────
const C = {
  pt: {
    nav: {
      cta: "Falar com Especialista",
      lang: "EN",
    },
    hero: {
      descriptor: "Clinical Intelligence System",
      signature:  "Precision in Integrative Care",
      tagline:    "AI-guided prescriptions, exams and injectable protocols.",
      sub: "O sistema de gestão clínica definitivo para protocolos injetáveis de alta complexidade. Do protocolo ao arquivo — totalmente integrado, juridicamente seguro, clinicamente preciso.",
      cta1: "Agendar Demonstração",
      cta2: "Ver Funcionalidades",
    },
    pain: {
      title: "A gestão amadora custa caro.",
      sub:   "O crescimento da sua clínica de injetáveis está sendo travado por processos que geram risco legal, perda de receita e exposição regulatória.",
      items: [
        { title: "Controle em Papel",        desc: "Protocolos em cadernos e planilhas desconexas, sem rastreabilidade de substâncias ou lotes." },
        { title: "Risco Jurídico Sem RAS",   desc: "Administração de injetáveis sem Registro de Assistência Sistêmica com validade legal e carimbo de tempo." },
        { title: "Prontuário Fragmentado",   desc: "Histórico do cliente espalhado entre WhatsApp, pastas físicas e sistemas clínicos genéricos." },
        { title: "Comunicação Quebrada",     desc: "Clientes esquecem sessões, não recebem código de validação, nem orientações pré e pós-aplicação." },
        { title: "Exames Perdidos",          desc: "Laudos enterrados no WhatsApp, sem comparação de evolução clínica nem organização por data." },
        { title: "Agenda Sem Orquestração",  desc: "Boxes de aplicação ociosos por falta de gestão do ciclo completo do protocolo e da equipe." },
      ],
    },
    features: {
      title: "14 Módulos. Uma Plataforma.",
      sub:   "Cada funcionalidade foi projetada para o fluxo real de uma clínica de protocolos injetáveis — sem adaptações forçadas de sistemas genéricos.",
      items: [
        {
          num: "01", icon: "⬡", name: "Protocolo Digital (Lançador)",
          desc: "Monte protocolos com até 10 substâncias em uma única tela guiada. Data de início, frequência, dose, via de administração e precificação por item. Templates de longevidade, performance e estética.",
          tags: ["Lançador guiado", "Até 10 substâncias", "Templates"],
        },
        {
          num: "02", icon: "⬡", name: "Agenda Semanal Inteligente",
          desc: "Visão semanal com cards codificados por cor: verde=concluído, âmbar=parcial, azul=hoje, vermelho=perdido, cinza=cancelado. Gestão de boxes de infusão IV/IM/Implante com tempo estimado automático.",
          tags: ["Google Calendar", "ICS download", "Gestão de boxes"],
        },
        {
          num: "03", icon: "⬡", name: "RAS com Assinatura ICP-Brasil",
          desc: "Registro de Assistência Sistêmica gerado automaticamente com assinatura digital qualificada A1 ICP-Brasil (PKCS#7). Cada administração documentada, carimbada e juridicamente blindada. Conformidade CFM e Anvisa.",
          tags: ["Assinatura A1", "Carimbo de tempo", "CFM/Anvisa"],
        },
        {
          num: "04", icon: "⬡", name: "RAS FAP — Formulário de Auditoria",
          desc: "Versão física em paisagem para controle da enfermagem. Grade consolidada por semana ISO, 5 colunas fixas de substância por folha, células de confirmação individual, assinatura com carimbo CRM/COREN.",
          tags: ["PDF paisagem", "Grade semanal", "Auditoria em papel"],
        },
        {
          num: "05", icon: "⬡", name: "Protocolo Completo PDF",
          desc: "Documento de 8 a 10 páginas: capa com branding, matriz de benefícios com rating por estrelas, fichas técnicas de substância, TCLE por via (IV/IM/Implante), cláusula LGPD, cronograma de sessões, resumo financeiro.",
          tags: ["8-10 páginas", "TCLE por via", "LGPD"],
        },
        {
          num: "06", icon: "⬡", name: "Google Drive — Arquivo Automático",
          desc: "O sistema cria e organiza automaticamente a pasta do cliente (15 subpastas: PROTOCOLOS, EXAMES, LAUDOS, FINANCEIRO, CONTRATOS, etc.). PDFs do RAS e protocolo são enviados automaticamente ao Drive correto com nomenclatura padronizada.",
          tags: ["15 subpastas", "Nomenclatura auto", "Upload automático"],
        },
        {
          num: "07", icon: "⬡", name: "WhatsApp + Email Automatizados",
          desc: "Lembretes de sessão, código de validação, lista de substâncias, orientações pré/pós-infusão e RAS assinado em PDF como anexo. Templates de primeira sessão com benefícios detalhados de cada substância.",
          tags: ["Twilio WhatsApp", "Gmail API", "Código de validação"],
        },
        {
          num: "08", icon: "⬡", name: "Área do Cliente + Portal de Upload",
          desc: "Portal exclusivo do cliente para acompanhar o protocolo, sessões agendadas e histórico. Upload de exames laboratoriais classificado automaticamente por tipo (EXAME/IMAGEM/LAUDO) e roteado para a subpasta correta no Drive.",
          tags: ["Portal privado", "Upload classificado", "Rastreamento do protocolo"],
        },
        {
          num: "09", icon: "⬡", name: "Estoque com Alertas Críticos",
          desc: "Gestão de substâncias, soluções e insumos com alertas automáticos de estoque crítico e baixo. Rastreamento de lote, validade e consumo por protocolo.",
          tags: ["Alerta crítico", "Rastreio de lote", "Validade"],
        },
        {
          num: "10", icon: "⬡", name: "Financeiro — Pagamentos e Saldo",
          desc: "Registro de pagamentos por PIX, cartão (crédito/débito), boleto e dinheiro. Parcelamento no crédito com identificação por cartão. Saldo corrente com total pago, pendente e histórico de movimentações.",
          tags: ["PIX / Crédito / Boleto", "Parcelamento", "Saldo corrente"],
        },
        {
          num: "11", icon: "⬡", name: "Catálogo de Substâncias Clínicas",
          desc: "Biblioteca expandível com fichas clínicas detalhadas: função principal, efeitos percebidos, sistemas corporais impactados (barras de impacto), longevidade, sono, energia, libido, clareza mental. Rating de eficácia 1-5 estrelas.",
          tags: ["Ficha técnica", "Rating 1-5 ★", "Efeitos por sistema"],
        },
        {
          num: "12", icon: "⬡", name: "Anamnese Digital",
          desc: "Questionário clínico estruturado com skip-logic dinâmico por sistema (cardiovascular, hepático, neurológico, etc.). Alarme vermelho em 3 camadas de proteção. Integração com o motor de prescrição.",
          tags: ["Skip-logic", "Alarme 3 camadas", "Motor de prescrição"],
        },
        {
          num: "13", icon: "⬡", name: "Profissionais e Corpo Clínico",
          desc: "Gestão de médicos, enfermeiras e equipe administrativa com perfis por especialização, vínculo por localização (clínica) e agenda individual. Papéis: médico 01/02, enfermeira 01/02, adm, financeiro.",
          tags: ["Multi-localização", "Papéis por função", "Agenda individual"],
        },
        {
          num: "14", icon: "⬡", name: "Google Calendar — Sincronização",
          desc: "Sincronização por sessão ou por semana nas agendas GERAL, MÉDICO e ENFERMAGEM. Duração automática por via (IV=30min, IM=15min, Implante=60min). Endereço da clínica incluído automaticamente.",
          tags: ["3 calendários", "Duração automática", "Multi-clínica"],
        },
      ],
    },
    flow: {
      title: "Mecânica Operacional",
      sub: "Um fluxo perfeitamente orquestrado, sem atritos.",
      steps: [
        { n: "01", title: "Onboarding",    desc: "Clínica contratada. Sistema configurado em 24h com substâncias, equipe e localização." },
        { n: "02", title: "Prescrição",    desc: "Médico lança protocolo com até 10 substâncias, precificação e cronograma automático." },
        { n: "03", title: "Agendamento",   desc: "Sessões criadas automaticamente. Cliente recebe código por WhatsApp e email." },
        { n: "04", title: "Aplicação",     desc: "Enfermagem confirma substância a substância. RAS gerado e assinado digitalmente." },
        { n: "05", title: "Arquivo",       desc: "Drive organizado automaticamente. Histórico completo com assinatura ICP-Brasil." },
      ],
    },
    audience: {
      title: "Para quem é o PARXIS?",
      yes: {
        label: "Ideal para",
        items: [
          "Clínicas de Medicina Estética Avançada",
          "Centros de Longevidade e Anti-aging",
          "Clínicas de Medicina do Esporte e Performance",
          "Médicos que prescrevem reposição hormonal IV/IM",
          "Clínicas com volume alto de terapias intravenosas",
          "Operações multi-clínica com equipe de enfermagem própria",
        ],
      },
      no: {
        label: "Não recomendado para",
        items: [
          "Consultórios sem procedimentos injetáveis in-house",
          "Clínicas gerais sem foco em protocolos seriados",
          "Operações 100% analógicas resistentes ao digital",
        ],
      },
    },
    cta: {
      title: "Eleve o padrão da sua operação.",
      sub: "Agende uma demonstração executiva e descubra como o PARXIS transforma a complexidade clínica em precisão sistêmica.",
      btn: "Agendar Demonstração",
    },
    footer: {
      by: "PARXIS by PADCOM",
      tagline: "Precision in Integrative Care",
    },
  },

  en: {
    nav: {
      cta: "Talk to a Specialist",
      lang: "PT",
    },
    hero: {
      descriptor: "Clinical Intelligence System",
      signature:  "Precision in Integrative Care",
      tagline:    "AI-guided prescriptions, exams and injectable protocols.",
      sub: "The definitive clinical management system for high-complexity injectable protocols. From prescription to archive — fully integrated, legally compliant, clinically precise.",
      cta1: "Schedule a Demo",
      cta2: "View Features",
    },
    pain: {
      title: "Amateurish management costs dearly.",
      sub:   "Your injectable clinic's growth is being throttled by processes that generate legal risk, revenue loss, and regulatory exposure.",
      items: [
        { title: "Paper-Based Control",      desc: "Protocols in notebooks and disconnected spreadsheets, with no substance or batch traceability." },
        { title: "Legal Risk Without RAS",   desc: "Injectable administration without a legally valid Systemic Assistance Record with a certified timestamp." },
        { title: "Fragmented Records",       desc: "Client history scattered across WhatsApp, physical folders, and generic clinical systems." },
        { title: "Broken Communication",     desc: "Clients miss sessions, don't receive validation codes, or pre/post-infusion instructions." },
        { title: "Lost Lab Reports",         desc: "Results buried in WhatsApp with no clinical evolution comparison or date-based organization." },
        { title: "Unorchestrated Schedule",  desc: "Idle infusion chairs due to lack of full protocol cycle and nursing team management." },
      ],
    },
    features: {
      title: "14 Modules. One Platform.",
      sub:   "Each feature was designed for the real workflow of an injectable protocol clinic — not a forced adaptation of a generic system.",
      items: [
        {
          num: "01", icon: "⬡", name: "Digital Protocol (Launcher)",
          desc: "Build protocols with up to 10 substances in a single guided screen. Start date, frequency, dose, route of administration, and per-item pricing. Longevity, performance, and aesthetic templates.",
          tags: ["Guided launcher", "Up to 10 substances", "Templates"],
        },
        {
          num: "02", icon: "⬡", name: "Smart Weekly Schedule",
          desc: "Weekly view with color-coded cards: green=done, amber=partial, blue=today, red=missed, gray=cancelled. Infusion chair management for IV/IM/Implant with automatic estimated time.",
          tags: ["Google Calendar", "ICS download", "Chair management"],
        },
        {
          num: "03", icon: "⬡", name: "RAS with ICP-Brasil Digital Signature",
          desc: "Systemic Assistance Record automatically generated with A1 ICP-Brasil qualified digital signature (PKCS#7). Every administration documented, timestamped, and legally shielded. CFM and Anvisa compliant.",
          tags: ["A1 signature", "Certified timestamp", "CFM/Anvisa"],
        },
        {
          num: "04", icon: "⬡", name: "FAP — Procedure Audit Form",
          desc: "Physical landscape-format printout for nursing control. ISO-week consolidated grid, 5 fixed substance columns per sheet, individual confirmation cells, CRM/COREN stamp signature.",
          tags: ["Landscape PDF", "Weekly grid", "Paper audit"],
        },
        {
          num: "05", icon: "⬡", name: "Complete Protocol PDF",
          desc: "8–10 page document: branded cover, benefits matrix with star ratings, substance fact sheets, informed consent by route (IV/IM/Implant), LGPD clause, session timeline, financial summary.",
          tags: ["8-10 pages", "Consent by route", "LGPD"],
        },
        {
          num: "06", icon: "⬡", name: "Google Drive — Auto Archive",
          desc: "The system automatically creates and organizes the client's folder (15 subfolders: PROTOCOLS, EXAMS, REPORTS, FINANCIAL, CONTRACTS, etc.). RAS and protocol PDFs are automatically sent to the correct Drive folder with standardized naming.",
          tags: ["15 subfolders", "Auto naming", "Auto upload"],
        },
        {
          num: "07", icon: "⬡", name: "WhatsApp + Email Automation",
          desc: "Session reminders, validation code, substance list, pre/post-infusion instructions, and signed RAS PDF as attachment. First-session templates with detailed substance benefit breakdowns.",
          tags: ["Twilio WhatsApp", "Gmail API", "Validation code"],
        },
        {
          num: "08", icon: "⬡", name: "Client Area + Upload Portal",
          desc: "Exclusive client portal to track the protocol, scheduled sessions, and history. Lab report upload automatically classified by type (EXAM/IMAGING/REPORT) and routed to the correct Drive subfolder.",
          tags: ["Private portal", "Auto-classified upload", "Protocol tracking"],
        },
        {
          num: "09", icon: "⬡", name: "Inventory with Critical Alerts",
          desc: "Substance, solution, and supply management with automatic critical and low stock alerts. Batch tracking, expiration dates, and per-protocol consumption tracking.",
          tags: ["Critical alerts", "Batch tracking", "Expiration"],
        },
        {
          num: "10", icon: "⬡", name: "Financial — Payments & Balance",
          desc: "Payment recording for PIX, card (credit/debit), boleto, and cash. Credit card installments with per-card identification. Running balance with total paid, pending, and transaction history.",
          tags: ["PIX / Credit / Boleto", "Installments", "Running balance"],
        },
        {
          num: "11", icon: "⬡", name: "Clinical Substance Catalog",
          desc: "Expandable library with detailed clinical profiles: main function, perceived effects, body system impact bars (cardiovascular, hepatic, neurological, etc.), longevity, sleep, energy, libido, mental clarity. 1–5 star efficacy rating.",
          tags: ["Clinical profile", "Rating 1-5 ★", "System impact"],
        },
        {
          num: "12", icon: "⬡", name: "Digital Anamnesis",
          desc: "Structured clinical questionnaire with dynamic skip-logic by system (cardiovascular, hepatic, neurological, etc.). Red alert with 3 protection layers. Integration with the prescription engine.",
          tags: ["Skip-logic", "3-layer alert", "Prescription engine"],
        },
        {
          num: "13", icon: "⬡", name: "Professionals & Clinical Staff",
          desc: "Management of physicians, nurses, and administrative staff with profiles by specialization, location binding, and individual schedule. Roles: physician 01/02, nurse 01/02, admin, finance.",
          tags: ["Multi-location", "Role-based", "Individual schedule"],
        },
        {
          num: "14", icon: "⬡", name: "Google Calendar — Sync",
          desc: "Per-session or per-week sync to GENERAL, PHYSICIAN, and NURSING calendars. Auto duration by route (IV=30min, IM=15min, Implant=60min). Clinic address included automatically.",
          tags: ["3 calendars", "Auto duration", "Multi-clinic"],
        },
      ],
    },
    flow: {
      title: "Operational Mechanics",
      sub: "A perfectly orchestrated workflow, frictionless.",
      steps: [
        { n: "01", title: "Onboarding",     desc: "Clinic onboarded. System configured within 24h with substances, team, and location." },
        { n: "02", title: "Prescription",   desc: "Physician launches protocol with up to 10 substances, pricing, and auto-generated schedule." },
        { n: "03", title: "Scheduling",     desc: "Sessions created automatically. Client receives validation code via WhatsApp and email." },
        { n: "04", title: "Application",    desc: "Nursing confirms substance by substance. RAS generated and digitally signed." },
        { n: "05", title: "Archiving",      desc: "Drive organized automatically. Full history with ICP-Brasil digital signature." },
      ],
    },
    audience: {
      title: "Who is PARXIS for?",
      yes: {
        label: "Ideal for",
        items: [
          "Advanced Medical Aesthetics Clinics",
          "Longevity and Anti-aging Centers",
          "Sports Medicine and Performance Clinics",
          "Physicians prescribing hormonal replacement IV/IM",
          "High-volume intravenous therapy clinics",
          "Multi-clinic operations with in-house nursing teams",
        ],
      },
      no: {
        label: "Not recommended for",
        items: [
          "Practices without in-house injectable procedures",
          "General clinics without serial protocol focus",
          "100% analog operations resistant to digital adoption",
        ],
      },
    },
    cta: {
      title: "Elevate the standard of your operation.",
      sub: "Schedule an executive demonstration and discover how PARXIS transforms clinical complexity into systemic precision.",
      btn: "Schedule a Demo",
    },
    footer: {
      by: "PARXIS by PADCOM",
      tagline: "Precision in Integrative Care",
    },
  },
} as const;

type Lang = keyof typeof C;

// ── Componente principal ────────────────────────────────────────────────────
export default function Home() {
  const [lang, setLang] = useState<Lang>("pt");
  const t = C[lang];

  const WHATSAPP_URL = "https://wa.me/5511999999999?text=Quero%20conhecer%20o%20PARXIS";

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: "var(--parxis-black-950)", color: "var(--parxis-text-main)" }}
    >
      {/* ── NAVIGATION ─────────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 w-full z-50"
        style={{
          background: "rgba(3,3,3,0.92)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(242,184,23,0.08)",
        }}
      >
        <div className="container mx-auto px-6 h-[72px] flex items-center justify-between">
          <ParxisWordmark fontSize={22} />

          <div className="flex items-center gap-4">
            {/* Toggle PT/EN */}
            <button
              onClick={() => setLang(l => l === "pt" ? "en" : "pt")}
              style={{
                fontFamily: "var(--app-font-display)",
                fontSize: 12,
                letterSpacing: "0.14em",
                color: "var(--parxis-gold-medium)",
                border: "1px solid rgba(242,184,23,0.20)",
                padding: "4px 12px",
                background: "transparent",
                cursor: "pointer",
                transition: "all 200ms",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(242,184,23,0.08)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; }}
            >
              {t.nav.lang}
            </button>

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-2 btn-gold px-5 py-2.5 text-sm"
              style={{ fontFamily: "var(--app-font-display)", fontSize: 12, letterSpacing: "0.10em" }}
            >
              {t.nav.cta}
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section
        className="relative pt-[72px] min-h-screen flex items-center"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, #2C0D10 0%, #120505 35%, #050505 70%)",
        }}
      >
        {/* Aura dourada suave */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 45%, rgba(242,184,23,0.05) 0%, transparent 65%)",
          }}
        />

        <div className="container mx-auto px-6 py-20 relative z-10">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">

            {/* Logo PNG oficial */}
            <div className="animate-fade-up mb-8">
              <ParxisLogo width={320} animate />
            </div>

            {/* Descriptor */}
            <p
              className="animate-fade-up animate-fade-up-delay-1 gold-gradient-text-soft mb-2"
              style={{
                fontFamily: "'Michroma', 'Orbitron', monospace",
                fontSize: 12,
                letterSpacing: "0.28em",
              }}
            >
              {t.hero.descriptor.toUpperCase()}
            </p>

            {/* Linha divisória */}
            <div className="divider-gold w-48 my-5 animate-fade-up animate-fade-up-delay-1" />

            {/* Assinatura institucional */}
            <p
              className="animate-fade-up animate-fade-up-delay-2 mb-2"
              style={{
                fontFamily: "var(--app-font-serif)",
                fontSize: 15,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--parxis-gold-light)",
              }}
            >
              {t.hero.signature}
            </p>

            {/* Texto complementar */}
            <p
              className="animate-fade-up animate-fade-up-delay-2 mb-10"
              style={{
                fontFamily: "var(--app-font-serif)",
                fontStyle: "italic",
                fontSize: 14,
                color: "var(--parxis-text-secondary)",
                letterSpacing: "0.04em",
              }}
            >
              {t.hero.tagline}
            </p>

            {/* Sub headline */}
            <p
              className="animate-fade-up animate-fade-up-delay-3 text-lg max-w-2xl leading-relaxed mb-12"
              style={{ color: "var(--parxis-text-secondary)" }}
            >
              {t.hero.sub}
            </p>

            {/* CTAs */}
            <div className="animate-fade-up animate-fade-up-delay-3 flex flex-col sm:flex-row gap-4">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold inline-flex items-center justify-center gap-2 px-8 py-4 text-sm"
                style={{ fontFamily: "var(--app-font-display)", letterSpacing: "0.10em" }}
              >
                {t.hero.cta1}
                <span style={{ fontSize: 16 }}>›</span>
              </a>
              <a
                href="#features"
                className="btn-gold-outline inline-flex items-center justify-center gap-2 px-8 py-4 text-sm"
                style={{ fontFamily: "var(--app-font-display)", letterSpacing: "0.10em" }}
              >
                {t.hero.cta2}
              </a>
            </div>
          </div>
        </div>

        {/* Borda inferior suave */}
        <div
          className="absolute bottom-0 left-0 w-full h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(242,184,23,0.15), transparent)" }}
        />
      </section>

      {/* ── PAIN POINTS ────────────────────────────────────────────────── */}
      <section
        className="py-28"
        style={{ background: "var(--parxis-black-900)" }}
      >
        <div className="container mx-auto px-6">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2
              style={{
                fontFamily: "var(--app-font-serif)",
                fontSize: "clamp(28px, 4vw, 42px)",
                fontWeight: 700,
                marginBottom: 16,
                color: "var(--parxis-text-main)",
              }}
            >
              {t.pain.title}
            </h2>
            <p style={{ color: "var(--parxis-text-secondary)", lineHeight: 1.7 }}>
              {t.pain.sub}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {t.pain.items.map((item, i) => (
              <div
                key={i}
                className="p-7 rounded-sm"
                style={{
                  background: "linear-gradient(145deg, #0E0505, #080304)",
                  border: "1px solid rgba(180,30,30,0.12)",
                  borderLeft: "3px solid rgba(200,40,40,0.40)",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "rgba(200,60,60,0.70)",
                    marginBottom: 16,
                  }}
                />
                <h3
                  style={{
                    fontFamily: "var(--app-font-display)",
                    fontSize: 13,
                    letterSpacing: "0.12em",
                    color: "var(--parxis-text-main)",
                    marginBottom: 10,
                    textTransform: "uppercase",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ color: "var(--parxis-text-muted)", lineHeight: 1.7, fontSize: 14 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────── */}
      <section id="features" className="py-32">
        <div className="container mx-auto px-6">

          {/* Header */}
          <div className="text-center mb-20 max-w-3xl mx-auto">
            <p
              className="gold-gradient-text mb-4"
              style={{
                fontFamily: "var(--app-font-display)",
                fontSize: 11,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
              }}
            >
              {lang === "pt" ? "Módulos do Sistema" : "System Modules"}
            </p>
            <h2
              style={{
                fontFamily: "var(--app-font-serif)",
                fontSize: "clamp(32px, 4.5vw, 52px)",
                fontWeight: 700,
                marginBottom: 16,
                color: "var(--parxis-text-main)",
              }}
            >
              {t.features.title}
            </h2>
            <div className="divider-gold w-48 mx-auto my-6" />
            <p style={{ color: "var(--parxis-text-secondary)", lineHeight: 1.7 }}>
              {t.features.sub}
            </p>
          </div>

          {/* Grid de features */}
          <div className="grid md:grid-cols-2 gap-5">
            {t.features.items.map((feat, i) => (
              <div key={i} className="feature-card p-7 rounded-sm">
                <div className="flex items-start gap-4">
                  {/* Número */}
                  <span
                    style={{
                      fontFamily: "var(--app-font-display)",
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      color: "var(--parxis-gold-deep)",
                      minWidth: 24,
                      paddingTop: 2,
                    }}
                  >
                    {feat.num}
                  </span>

                  <div className="flex-1">
                    <h3
                      style={{
                        fontFamily: "var(--app-font-display)",
                        fontSize: 13,
                        letterSpacing: "0.10em",
                        color: "var(--parxis-gold-light)",
                        textTransform: "uppercase",
                        marginBottom: 10,
                      }}
                    >
                      {feat.name}
                    </h3>
                    <p
                      style={{
                        color: "var(--parxis-text-secondary)",
                        lineHeight: 1.75,
                        fontSize: 14,
                        marginBottom: 14,
                      }}
                    >
                      {feat.desc}
                    </p>
                    {/* Tags */}
                    <div className="flex flex-wrap gap-2">
                      {feat.tags.map((tag, j) => (
                        <span
                          key={j}
                          style={{
                            fontFamily: "var(--app-font-display)",
                            fontSize: 10,
                            letterSpacing: "0.12em",
                            color: "var(--parxis-gold-medium)",
                            border: "1px solid rgba(217,144,0,0.20)",
                            padding: "2px 8px",
                            textTransform: "uppercase",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FLOW ───────────────────────────────────────────────────────── */}
      <section
        className="py-28"
        style={{ background: "var(--parxis-black-900)", borderTop: "1px solid rgba(242,184,23,0.06)", borderBottom: "1px solid rgba(242,184,23,0.06)" }}
      >
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2
              style={{
                fontFamily: "var(--app-font-serif)",
                fontSize: "clamp(26px, 3.5vw, 40px)",
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {t.flow.title}
            </h2>
            <p style={{ color: "var(--parxis-text-muted)" }}>{t.flow.sub}</p>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start gap-8 relative">
            {/* Linha conectora */}
            <div
              className="hidden md:block absolute top-10 left-0 right-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(242,184,23,0.12), transparent)" }}
            />

            {t.flow.steps.map((s, i) => (
              <div
                key={i}
                className="flex flex-col items-center text-center flex-1 relative z-10 px-4"
              >
                {/* Círculo */}
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    border: "1px solid rgba(242,184,23,0.22)",
                    background: "radial-gradient(circle at 50% 30%, #1A0D05, #0A0504)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                    fontFamily: "var(--app-font-display)",
                    fontSize: 13,
                    letterSpacing: "0.12em",
                    color: "var(--parxis-gold-medium)",
                  }}
                >
                  {s.n}
                </div>
                <h4
                  style={{
                    fontFamily: "var(--app-font-display)",
                    fontSize: 12,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--parxis-gold-light)",
                    marginBottom: 8,
                  }}
                >
                  {s.title}
                </h4>
                <p style={{ fontSize: 13, color: "var(--parxis-text-muted)", lineHeight: 1.7 }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AUDIENCE ───────────────────────────────────────────────────── */}
      <section className="py-28">
        <div className="container mx-auto px-6">
          <h2
            className="text-center mb-16"
            style={{
              fontFamily: "var(--app-font-serif)",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 700,
            }}
          >
            {t.audience.title}
          </h2>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Ideal para */}
            <div
              className="p-9 rounded-sm"
              style={{
                background: "linear-gradient(145deg, #0D0904, #080604)",
                borderTop: "3px solid var(--parxis-gold-medium)",
                border: "1px solid rgba(242,184,23,0.12)",
                borderTopWidth: 3,
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--app-font-display)",
                  fontSize: 11,
                  letterSpacing: "0.20em",
                  textTransform: "uppercase",
                  color: "var(--parxis-gold-main)",
                  marginBottom: 20,
                }}
              >
                {t.audience.yes.label}
              </h3>
              <ul className="space-y-4">
                {t.audience.yes.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3"
                    style={{ color: "var(--parxis-text-secondary)", fontSize: 14, lineHeight: 1.6 }}
                  >
                    <span style={{ color: "var(--parxis-gold-medium)", marginTop: 2, flexShrink: 0 }}>◆</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Não para */}
            <div
              className="p-9 rounded-sm"
              style={{
                background: "linear-gradient(145deg, #080808, #050505)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderTop: "3px solid rgba(255,255,255,0.08)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--app-font-display)",
                  fontSize: 11,
                  letterSpacing: "0.20em",
                  textTransform: "uppercase",
                  color: "var(--parxis-text-muted)",
                  marginBottom: 20,
                }}
              >
                {t.audience.no.label}
              </h3>
              <ul className="space-y-4">
                {t.audience.no.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3"
                    style={{ color: "var(--parxis-text-muted)", fontSize: 14, lineHeight: 1.6 }}
                  >
                    <span style={{ color: "rgba(255,255,255,0.20)", marginTop: 2, flexShrink: 0 }}>—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────── */}
      <section
        className="py-32 relative overflow-hidden"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, #2C0D10 0%, #0A0505 45%, #050505 100%)",
        }}
      >
        {/* Aura dourada central */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(242,184,23,0.06) 0%, transparent 65%)",
          }}
        />

        <div className="container mx-auto px-6 relative z-10 flex flex-col items-center text-center">
          {/* Logo menor */}
          <ParxisLogo width={180} className="mb-12 opacity-90" />

          <div className="divider-gold w-40 mb-10" />

          <h2
            style={{
              fontFamily: "var(--app-font-serif)",
              fontSize: "clamp(28px, 4vw, 52px)",
              fontWeight: 700,
              marginBottom: 20,
              color: "var(--parxis-text-main)",
              maxWidth: 700,
            }}
          >
            {t.cta.title}
          </h2>
          <p
            style={{
              color: "var(--parxis-text-secondary)",
              fontSize: 16,
              lineHeight: 1.7,
              maxWidth: 560,
              marginBottom: 40,
            }}
          >
            {t.cta.sub}
          </p>

          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gold inline-flex items-center gap-3 px-10 py-5 text-base"
            style={{ fontFamily: "var(--app-font-display)", letterSpacing: "0.12em" }}
          >
            {t.cta.btn}
            <span style={{ fontSize: 20 }}>›</span>
          </a>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer
        className="py-12"
        style={{ borderTop: "1px solid rgba(242,184,23,0.08)", background: "#030303" }}
      >
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <ParxisWordmark fontSize={18} style={{ opacity: 0.70 }} />

            <div
              style={{
                fontFamily: "var(--app-font-serif)",
                fontStyle: "italic",
                fontSize: 13,
                color: "var(--parxis-text-muted)",
                letterSpacing: "0.10em",
                textAlign: "center",
              }}
            >
              {t.footer.tagline}
            </div>

            <div
              style={{
                fontFamily: "var(--app-font-display)",
                fontSize: 11,
                letterSpacing: "0.16em",
                color: "var(--parxis-text-muted)",
                textTransform: "uppercase",
              }}
            >
              {t.footer.by}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
