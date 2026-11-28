import { Link } from "@paxcare/Link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  ChevronRight,
  Crown,
  HeartHandshake,
  Menu,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { Button } from "@paxcare/components/ui/button";
import { Brand, BrandArtwork, SharePaxmedInviteButton } from "@paxcare/components/pax-care";
import { CircleTiersGrid, DoctorAdhesionPreview, FOUNDER_CHAIRS } from "@paxcare/components/doctor-area";

/** Metadados da página (título e previsão de link), iguais aos do projeto de origem. */
export const META = [
      { title: "PAXCARE | Área do Médico e Círculo de Médicos Renomados" },
      { name: "description", content: "Acesse os exames de múltiplos laboratórios compartilhados pelo seu paciente em segundos e conheça o Círculo de Médicos Renomados conectado ao PAXMED." },
      { property: "og:title", content: "PAXCARE | Área do Médico" },
      { property: "og:description", content: "Receba o convite do seu paciente, visualize exames unificados de diferentes laboratórios e integre-se ao ecossistema PAXMED." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ];

// Portal do paciente: mesma origem, caminho /area (domínio paxcare.com.br; sem prefixo de subdomínio).
const PATIENT_AREA_URL = "/area";
const PAXMED_SITE_URL = "https://paxmed.com.br";

export function MedicosPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div id="inicio" className="site-shell">
      <a href="#conteudo-medico" className="skip-link">Pular para o conteúdo principal</a>
      <header className="site-header">
        <div className="page-width header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Menu principal">
            <Link to="/">PAXCARE</Link>
            <a href="#adesao">Aceitar convite</a>
            <a href="#circulo">Médicos Renomados</a>
            <a href="#hierarquia">Círculo de Convites</a>
            <a href={PAXMED_SITE_URL} target="_blank" rel="noopener noreferrer">PAXMED</a>
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
            <Link to="/" onClick={() => setMenuOpen(false)}>Voltar ao PAXCARE<ChevronRight size={16} /></Link>
            <a href="#adesao" onClick={() => setMenuOpen(false)}>Aceitar convite<ChevronRight size={16} /></a>
            <a href="#circulo" onClick={() => setMenuOpen(false)}>Médicos Renomados<ChevronRight size={16} /></a>
            <a href="#hierarquia" onClick={() => setMenuOpen(false)}>Círculo de Convites<ChevronRight size={16} /></a>
            <a href={PAXMED_SITE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>PAXMED<ChevronRight size={16} /></a>
            <Button asChild variant="champagne"><a href={PATIENT_AREA_URL} onClick={() => setMenuOpen(false)}>Portal do paciente <ArrowUpRight size={15} /></a></Button>
          </nav>
        )}
      </header>

      <main id="conteudo-medico">
        <section className="doctor-hero" aria-labelledby="doctor-hero-title">
          <div className="hero-light" aria-hidden="true" />
          <div className="page-width doctor-hero-inner">
            <Link to="/" className="doctor-back-link"><ArrowLeft size={15} /> Voltar à página PAXCARE</Link>
            <span className="eyebrow hero-eyebrow"><span /> ÁREA EXCLUSIVA DO MÉDICO · PAXCARE × PAXMED</span>
            <h1 id="doctor-hero-title">Os exames do seu paciente, de todos os laboratórios, <em>na palma da sua mão.</em></h1>
            <p className="doctor-hero-lead">
              Sem pacotes de papel, sem datas misturadas e sem precisar entrar em diferentes portais de laboratórios para fechar um diagnóstico.
              O acesso acontece em dois sentidos: você conhece o PAXCARE através do seu paciente e, com uma adesão simples, passa a enxergar tudo o que ele liberou para a sua consulta.
            </p>
            <div className="doctor-two-ways">
              <article>
                <span>01 · DESCOBERTA PELO PACIENTE</span>
                <h3>Um paciente preparado eleva o nível da consulta.</h3>
                <p>Quando o paciente chega com o PAXCARE, você percebe na hora: quem tem acesso a essa história organizada valoriza o seu tempo e o seu raciocínio clínico.</p>
              </article>
              <article>
                <span>02 · ADESÃO SIMPLES E ACESSO IMEDIATO</span>
                <h3>Nome, CRM e CPF. E a história inteira se abre.</h3>
                <p>Aceite o convite em segundos e veja exatamente os exames, laudos, rotina e protocolos que o paciente autorizou pelos toggles de liberação.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="adesao" className="section doctor-adhesion-section" aria-labelledby="adhesion-title">
          <div className="page-width">
            <div className="editorial-heading">
              <div>
                <span className="eyebrow">ADESÃO DO MÉDICO CONVIDADO</span>
                <h2 id="adhesion-title">Aceite o convite e veja os exames <em>liberados para você.</em></h2>
              </div>
              <p>Experimente abaixo o fluxo completo: confirme uma adesão ilustrativa com Nome, CRM e CPF e alterne os toggles de liberação do paciente para observar o que aparece na tela do médico.</p>
            </div>
            <DoctorAdhesionPreview />
          </div>
        </section>

        <section id="circulo" className="section doctor-circle-section" aria-labelledby="circle-title">
          <div className="page-width">
            <div className="editorial-heading">
              <div>
                <span className="eyebrow">CÍRCULO DE MÉDICOS RENOMADOS</span>
                <h2 id="circle-title">Quem tem acesso não precisa explicar. <em>O padrão aparece na consulta.</em></h2>
              </div>
              <p>Um grupo selecionado de médicos de referência que recebe acesso pioneiro ao PAXCARE e ao PAXMED, com cadeiras numeradas e poder de convidar colegas e pacientes para o ecossistema.</p>
            </div>
            <div className="founder-chairs-grid">
              {FOUNDER_CHAIRS.map((chair) => (
                <article key={chair.seat} className="founder-chair-card">
                  <div className="founder-chair-top"><span>{chair.seat}</span><Crown size={16} /></div>
                  <div className="founder-chair-avatar" aria-hidden="true"><Stethoscope size={28} /></div>
                  <h3>{chair.tier}</h3>
                  <p>{chair.specialty}</p>
                  <small>{chair.status}</small>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="hierarquia" className="section doctor-hierarchy-section" aria-labelledby="hierarchy-title">
          <div className="page-width">
            <div className="editorial-heading">
              <div>
                <span className="eyebrow">REDE EXCLUSIVA POR CONVITE · PAXCARE ↔ PAXMED</span>
                <h2 id="hierarchy-title">Acesso por indicação, <em>vantagens reais para quem chega primeiro.</em></h2>
              </div>
              <p>Médicos fundadores convidam colegas de confiança, formando uma árvore seleta de portadores do PAXCARE e do PAXMED — com acesso antecipado às ferramentas e condições preferenciais de desconto e créditos de uso no próprio sistema.</p>
            </div>
            <CircleTiersGrid />
            <div className="doctor-paxmed-bridge">
              <div>
                <span className="eyebrow">CONEXÃO DIRETA PAXCARE = PAXMED</span>
                <h3>PAXMED: a clínica inteligente que conversa diretamente com o PAXCARE.</h3>
                <p>Enquanto o paciente carrega sua história no PAXCARE, a sua clínica opera protocolos, anamnese e acompanhamento no PAXMED com continuidade total.</p>
              </div>
              <div className="doctor-bridge-actions">
                <Button asChild variant="champagne">
                  <a href={PAXMED_SITE_URL} target="_blank" rel="noopener noreferrer">Conhecer o site PAXMED <ArrowUpRight size={15} /></a>
                </Button>
                <div className="doctor-bridge-notes">
                  <span><Award size={15} /> Acesso antecipado para pioneiros</span>
                  <span><Users size={15} /> Convites exclusivos numerados</span>
                  <span><HeartHandshake size={15} /> Descontos e créditos de uso no sistema</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width footer-main">
          <div><Brand footer /><p>Sua saúde, com você.</p></div>
          <nav className="footer-links" aria-label="Links do rodapé">
            <Link to="/">PAXCARE</Link>
            <a href="#adesao">Aceitar convite</a>
            <a href="#circulo">Médicos Renomados</a>
            <a href="#hierarquia">Círculo de Convites</a>
            <a href={PAXMED_SITE_URL} target="_blank" rel="noopener noreferrer">PAXMED</a>
          </nav>
          <div className="footer-cta"><span>Conecte seu consultório</span><SharePaxmedInviteButton /></div>
        </div>
        <div className="page-width footer-bottom">
          <span>© 2026 PAXCARE · Ecossistema PADCON.</span>
          <span className="footer-ecosystem"><BrandArtwork compact /><span>× PAXMED</span></span>
        </div>
      </footer>
    </div>
  );
}