import { vitrineAsset } from "@paxcare/assets";
import { Link } from "@paxcare/Link";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Heart,
  HeartHandshake,
  Menu,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { Button } from "@paxcare/components/ui/button";
import { Brand, BrandArtwork, SharePaxmedInviteButton, ShareSiteButton } from "@paxcare/components/pax-care";
import { ExamsPreview, MriPreview, ProtocolPreview, RoutinePreview, SharingPreview } from "@paxcare/components/pax-previews";
const symbolComposite = { url: vitrineAsset("paxcare-composite-isolated.png") };

/** Metadados da página (título e previsão de link), iguais aos do projeto de origem. */
export const META = [
      { title: "PAXCARE | A sua história de saúde, finalmente inteira" },
      { name: "description", content: "Uma experiência pessoal e integrada para reunir exames, laudos, rotina, protocolos e relações de cuidado em uma única história." },
      { property: "og:title", content: "PAXCARE | Sua saúde, em perfeita continuidade" },
      { property: "og:description", content: "Uma nova forma de viver a sua história de saúde: mais clara para você, mais inteira para quem cuida de você." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ];

// Portal do paciente: mesma origem, caminho /area (domínio paxcare.com.br; sem prefixo de subdomínio).
const PATIENT_AREA_URL = "/area";
const PAXMED_SITE_URL = "https://paxmed.com.br";

type NavLink = { label: string; href: string; externalHref?: string; internalTo?: "/medicos" };

const NAV_LINKS: NavLink[] = [
  { label: "Visão", href: "#visao" },
  { label: "Experiência", href: "#experiencia" },
  { label: "Rotina", href: "#rotina" },
  { label: "Área do Médico", href: "/medicos", internalTo: "/medicos" },
  { label: "PAXMED", href: "#paxmed", externalHref: PAXMED_SITE_URL },
  { label: "Planos", href: "#planos" },
];

export function Index() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    document.documentElement.classList.add("reveal-enabled");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("reveal-enabled");
    };
  }, []);

  return (
    <div id="inicio" className="site-shell">
      <a href="#conteudo-principal" className="skip-link">Pular para o conteúdo principal</a>
      <header className="site-header">
        <div className="page-width header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Menu principal">
            {NAV_LINKS.map((item) =>
              item.internalTo ? (
                <Link key={item.href} to={item.internalTo}>{item.label}</Link>
              ) : item.externalHref ? (
                <a key={item.href} href={item.externalHref} target="_blank" rel="noopener noreferrer">{item.label}</a>
              ) : (
                <a key={item.href} href={item.href}>{item.label}</a>
              ),
            )}
          </nav>
          <div className="header-access">
            <Button asChild variant="champagne"><a href={PATIENT_AREA_URL}>Portal do paciente <ArrowUpRight size={15} /></a></Button>
          </div>
          <Button type="button" variant="ghost" size="icon" className="mobile-menu" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
        {menuOpen && (
          <nav className="mobile-nav" aria-label="Menu do celular">
            {NAV_LINKS.map((item) =>
              item.internalTo ? (
                <Link key={item.href} to={item.internalTo} onClick={() => setMenuOpen(false)}>{item.label}<ChevronRight size={16} /></Link>
              ) : item.externalHref ? (
                <a key={item.href} href={item.externalHref} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>{item.label}<ChevronRight size={16} /></a>
              ) : (
                <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ChevronRight size={16} /></a>
              ),
            )}
            <Button asChild variant="champagne"><a href={PATIENT_AREA_URL} onClick={() => setMenuOpen(false)}>Portal do paciente <ArrowUpRight size={15} /></a></Button>
          </nav>
        )}
      </header>

      <main id="conteudo-principal">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-light" aria-hidden="true" />
          <div className="hero-texture" aria-hidden="true" />
          <div className="page-width hero-inner">
            <div className="hero-copy">
              <span className="eyebrow hero-eyebrow"><span /> SUA SAÚDE, EM PERFEITA CONTINUIDADE</span>
              <h1 id="hero-title">A sua história de saúde,<br /><em>finalmente inteira.</em></h1>
              <p>Dos exames que atravessam os anos aos pequenos rituais de todos os dias, o PAXCARE reúne o que importa para você viver o cuidado com mais clareza, presença e tranquilidade.</p>
              <div className="hero-actions">
                <Button asChild variant="champagne"><a href={PATIENT_AREA_URL}>Descobrir essa experiência <ArrowDown size={16} /></a></Button>
                <Button asChild variant="quiet"><a href={PATIENT_AREA_URL}>Explorar o portal <ArrowRight size={16} /></a></Button>
              </div>
              <div className="hero-human-note"><Heart size={15} /><span>Mais do que organizar informações. Uma nova forma de cuidar da sua história.</span></div>
            </div>
            <figure className="hero-art">
              <div className="halo-orbit halo-orbit-one" aria-hidden="true" />
              <div className="halo-orbit halo-orbit-two" aria-hidden="true" />
              <div className="hero-symbol">
                <img src={symbolComposite.url} alt="Símbolo oficial PAXCARE dourado, com o nome PAXCARE" width={1024} height={1110} fetchPriority="high" />
              </div>
              <figcaption className="hero-art-caption"><span>Uma história.</span><span>Infinitas formas de cuidar.</span></figcaption>
              <div className="hero-health-card hero-exam-card">
                <span className="hero-health-icon"><FileText size={17} /></span>
                <span><small>EXAMES</small><strong>A evolução em contexto</strong></span>
              </div>
              <div className="hero-health-card hero-routine-card">
                <span className="hero-health-icon"><CalendarDays size={17} /></span>
                <span><small>ROTINA</small><strong>O cuidado no seu tempo</strong></span>
              </div>
            </figure>
          </div>
          <div className="page-width hero-footer-line">
            <span>EXAMES</span><i /><span>ROTINA</span><i /><span>PROTOCOLOS</span><i /><span>RELAÇÕES DE CUIDADO</span>
          </div>
        </section>

        <section id="visao" className="section vision-section" aria-labelledby="vision-title">
          <div className="page-width">
            <div className="editorial-heading" data-reveal>
              <div><span className="eyebrow">POR QUE O PAXCARE EXISTE</span><h2 id="vision-title">O cuidado é contínuo.<br /><em>A sua experiência também deveria ser.</em></h2></div>
              <p>A saúde não acontece em capítulos separados. Ela atravessa consultas, escolhas, fases e encontros. Quando cada pedaço fica em um lugar, você precisa recomeçar a mesma história muitas vezes.</p>
            </div>
            <div className="fragment-grid" data-reveal>
              <article><span className="fragment-number">01</span><FileText size={22} /><h3>Adeus pacotes, envelopes e sacolinhas</h3><p>Chega de carregar exames misturados, datas desorganizadas, resultados perdidos ou procurar laudos em pastas espalhadas pelo celular.</p></article>
              <article><span className="fragment-number">02</span><CalendarDays size={22} /><h3>Sem logins e senhas de vários laboratórios</h3><p>Você não precisa mais lembrar acessos diferentes em cada empresa de exames — nem perder de vista medicamentos, creatina e whey no dia a dia.</p></article>
              <article><span className="fragment-number">03</span><Stethoscope size={22} /><h3>O médico de outra clínica vê tudo junto</h3><p>Sem precisar entrar em portais de diferentes laboratórios para juntar exames e fechar o diagnóstico: você entrega o contexto inteiro em segundos.</p></article>
            </div>
            <div className="continuity-statement" data-reveal><HeartHandshake size={30} /><p>O PAXCARE aproxima esses fragmentos para que a sua história possa, enfim, <strong>caminhar junto com você.</strong></p></div>
            <div className="vision-doctor-callout" data-reveal>
              <div>
                <span className="eyebrow">ACESSO EM DOIS SENTIDOS · PACIENTE E MÉDICO</span>
                <p>Recebeu um convite de paciente ou faz parte do Círculo de Médicos Renomados? Acesse os exames liberados de diferentes laboratórios em uma única tela.</p>
              </div>
              <Button asChild variant="outline"><Link to="/medicos">Entrar na Área do Médico <ArrowRight size={15} /></Link></Button>
            </div>
          </div>
        </section>

        <section id="experiencia" className="section experience-section" aria-labelledby="experience-title">
          <div className="page-width">
            <div className="feature-layout" data-reveal>
              <div className="feature-copy">
                <span className="eyebrow">EXAMES, LAUDOS E EVOLUÇÃO</span>
                <h2 id="experience-title">Cada exame conta uma parte. <em>O PAXCARE revela a história.</em></h2>
                <p>Veja seus resultados organizados por categoria, compare diferentes momentos e transforme informações soltas em uma conversa muito mais clara com quem cuida de você.</p>
                <div className="feature-notes">
                  <span><Check size={15} /> Histórico e comparativo de exames</span>
                  <span><Check size={15} /> PDF de evolução para a consulta</span>
                  <span><Check size={15} /> Laudos e arquivos pessoais organizados</span>
                </div>
              </div>
              <ExamsPreview />
            </div>
          </div>
        </section>

        <section className="section mri-section" aria-labelledby="mri-title">
          <div className="page-width">
            <div className="mri-heading" data-reveal>
              <div><span className="eyebrow">RESSONÂNCIAS EM CONTEXTO</span><h2 id="mri-title">Duas leituras.<br /><em>Uma conversa mais esclarecida.</em></h2></div>
              <p>Aproxime laudos de ressonância de coluna de diferentes momentos e apresente a sequência ao seu médico com organização, contexto e tranquilidade.</p>
            </div>
            <div data-reveal><MriPreview /></div>
          </div>
        </section>


        <section id="rotina" className="section routine-section" aria-labelledby="routine-title">
          <div className="page-width">
            <div className="feature-layout routine-layout" data-reveal>
              <RoutinePreview />
              <div className="feature-copy">
                <span className="eyebrow">MEDICAMENTOS, SUPLEMENTOS E LEMBRETES</span>
                <h2 id="routine-title">O cuidado cabe na vida real. <em>E não o contrário.</em></h2>
                <p>Crie uma rotina que respeita o seu ritmo. Reúna medicamentos, creatina, whey e os pequenos lembretes que ajudam a transformar intenção em constância.</p>
                <blockquote>“A constância fica mais possível quando o cuidado encontra um lugar natural no seu dia.”</blockquote>
              </div>
            </div>
            <div className="protocols-block" data-reveal>
              <div className="editorial-heading compact">
                <div><span className="eyebrow">PROTOCOLOS INJETÁVEIS</span><h2>Da clínica integrada às outras clínicas, <em>nada precisa ficar de fora.</em></h2></div>
                <p>Acompanhe os protocolos realizados com a sua clínica, registre cuidados feitos em outros espaços e conserve cada etapa como parte da mesma história.</p>
              </div>
              <ProtocolPreview />
            </div>
          </div>
        </section>

        <section className="section sharing-section vault-section" aria-labelledby="sharing-title">
          <div className="page-width sharing-layout">
            <div className="feature-copy" data-reveal>
              <span className="eyebrow">O SEU COFRE DE SAÚDE</span>
              <h2 id="sharing-title">Tudo o que é seu, <em>guardado com intenção.</em></h2>
              <p>Exames, laudos, arquivos pessoais, protocolos e registros encontram o seu lugar em um cofre organizado por gavetas. Ao compartilhar, você escolhe as categorias, o momento e com quem cada parte da história faz sentido.</p>
              <div className="sharing-values"><span><Users size={17} /> Família por perto</span><span><Stethoscope size={17} /> Profissionais em contexto</span><span><HeartHandshake size={17} /> Escolhas nas suas mãos</span></div>
            </div>
            <div data-reveal><SharingPreview /></div>
          </div>
        </section>

        <section id="paxmed" className="section paxmed-section" aria-labelledby="paxmed-title">
          <div className="paxmed-watermark" aria-hidden="true">PAXMED</div>
          <div className="page-width paxmed-grid">
            <div className="paxmed-copy" data-reveal>
              <span className="eyebrow">UMA PONTE ENTRE VOCÊ E QUEM CUIDA DE VOCÊ</span>
              <h2 id="paxmed-title">PAXCARE para a sua vida.<br /><em>PAXMED para a prática médica.</em></h2>
              <p>Enquanto o PAXCARE acolhe a sua história pessoal, o PAXMED foi pensado para clínicas e médicos organizarem a experiência de cuidado.</p>
              <p>Apresente essa visão ao seu profissional e abra uma nova conversa sobre continuidade, contexto e uma relação mais próxima com a sua saúde.</p>
              <div className="paxmed-actions-stack">
                <SharePaxmedInviteButton />
                <Button asChild variant="quiet">
                  <Link to="/medicos"><Stethoscope size={16} /> Abrir Área do Médico e Círculo Renomado <ArrowRight size={15} /></Link>
                </Button>
              </div>
            </div>
            <div className="ecosystem-visual" data-reveal>
              <article className="ecosystem-card care-ecosystem"><span>PARA VOCÊ</span><BrandArtwork compact className="ecosystem-brand" /><p>A sua história pessoal, viva e inteira.</p><Heart size={22} /></article>
              <div className="ecosystem-connection"><i /><HeartHandshake size={25} /><i /></div>
              <article className="ecosystem-card med-ecosystem"><span>PARA CLÍNICAS E MÉDICOS</span><h3>PAXMED</h3><p>O cuidado profissional com uma visão mais completa.</p><Stethoscope size={22} /></article>
            </div>
          </div>
        </section>

        <section className="benefits-band" aria-label="Benefícios da experiência">
          <div className="page-width benefits-grid">
            <article data-reveal><span>01</span><h3>Menos repetição.<br />Mais presença.</h3><p>Sua história pronta para cada nova conversa.</p></article>
            <article data-reveal><span>02</span><h3>Menos ruído.<br />Mais clareza.</h3><p>O essencial visível no momento em que importa.</p></article>
            <article data-reveal><span>03</span><h3>Menos fragmentos.<br />Mais você.</h3><p>Uma experiência que acompanha a sua vida inteira.</p></article>
          </div>
        </section>

        <section id="planos" className="section plans-section" aria-labelledby="plans-title">
          <div className="page-width">
            <div className="section-intro" data-reveal><span className="eyebrow">UMA EXPERIÊNCIA PARA O SEU MOMENTO</span><h2 id="plans-title">Escolha como você quer<br /><em>viver a sua história.</em></h2><p>Duas formas de entrar no universo PAXCARE. A mesma essência: colocar você no centro do cuidado.</p></div>
            <div className="plans-grid" data-reveal>
              <article className="plan-card">
                <div className="plan-topline"><BrandArtwork compact /><span>01</span></div>
                <h3>Essencial</h3><p className="plan-description">Para organizar a sua história e trazer mais leveza ao cuidado de todos os dias.</p>
                <ul><li><Check size={15} /> Exames, evolução e arquivos</li><li><Check size={15} /> Medicamentos, suplementos e lembretes</li><li><Check size={15} /> Registros e compartilhamento</li></ul>
                <Button asChild variant="outline"><a href={PATIENT_AREA_URL}>Conhecer o Essencial <ArrowRight size={15} /></a></Button>
              </article>
              <article className="plan-card plan-featured">
                <div className="plan-topline"><BrandArtwork compact /><span>02</span></div>
                <h3>Integral</h3><p className="plan-description">Para viver toda a experiência, com cada detalhe da sua jornada em perfeita continuidade.</p>
                <ul><li><Check size={15} /> Toda a experiência Essencial</li><li><Check size={15} /> Comparativo de laudos e protocolos</li><li><Check size={15} /> Conexão com o universo PAXMED</li></ul>
                <Button asChild variant="champagne"><a href={PATIENT_AREA_URL}>Explorar o Integral <ArrowRight size={15} /></a></Button>
              </article>
            </div>
          </div>
        </section>

        <section id="acesso" className="section access-section" aria-labelledby="access-title">
          <div className="access-glow" aria-hidden="true" />
          <div className="page-width access-grid">
            <div className="access-copy" data-reveal>
              <span className="eyebrow">O SEU ESPAÇO. A SUA HISTÓRIA.</span>
              <h2 id="access-title">Um portal para<br /><em>chamar de seu.</em></h2>
              <p>Entre em uma experiência criada para acolher a sua rotina, aproximar quem importa e dar à sua saúde a continuidade que ela merece.</p>
              <ShareSiteButton variant="quiet" />
            </div>
            <div className="portal-frame" data-reveal>
              <div className="portal-frame-line"><BrandArtwork compact /><span>PORTAL DO PACIENTE</span></div>
              <div className="portal-symbol"><img src={symbolComposite.url} alt="PAXCARE" width={1024} height={1110} /></div>
              <div className="portal-welcome"><span>BEM-VINDO AO SEU ESPAÇO</span><h3>A sua história continua aqui.</h3><p>Uma experiência pessoal, inteira e feita para acompanhar você.</p></div>
              <Button asChild variant="champagne"><a href={PATIENT_AREA_URL}>Entrar na experiência <ArrowUpRight size={16} /></a></Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width footer-main">
          <div><Brand footer /><p>Sua saúde, com você.</p></div>
          <nav className="footer-links" aria-label="Links do rodapé">
            {NAV_LINKS.map((item) =>
              item.internalTo ? (
                <Link key={item.href} to={item.internalTo}>{item.label}</Link>
              ) : (
                <a key={item.href} href={item.href}>{item.label}</a>
              ),
            )}
          </nav>
          <div className="footer-cta"><span>Compartilhe essa visão</span><ShareSiteButton label="Enviar para um familiar" variant="quiet" /></div>
        </div>
        <div className="page-width footer-bottom"><span>© 2026 PAXCARE · Ecossistema PADCON.</span><span className="footer-ecosystem"><BrandArtwork compact /><span>× PAXMED</span></span></div>
      </footer>
    </div>
  );
}
