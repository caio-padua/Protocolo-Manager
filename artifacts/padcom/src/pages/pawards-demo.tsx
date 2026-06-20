import { type ReactNode } from "react";
import "./pawards-demo.css";

const menuItems = [
  { label: "Dashboard", icon: "▦" },
  { label: "Clientes", icon: "♙" },
  { label: "Protocolos", icon: "⚗" },
  { label: "Orçamentos", icon: "▣" },
  { label: "Agenda", icon: "▤" },
  { label: "RAS", icon: "▥" },
  { label: "Estoque", icon: "⬡" },
  { label: "Financeiro", icon: "◈" },
  { label: "Profissionais", icon: "♧" },
  { label: "Substâncias", icon: "⚱" },
  { label: "Catálogos", icon: "▧" },
  { label: "Cadastros", icon: "⊞" },
  { label: "Exames & Blocos", icon: "⚕" },
];

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "gold" | "success" | "danger";
}) {
  return (
    <article className={`pw-metric pw-metric--${tone}`}>
      <span>{label}</span>
      <strong className="pw-number">{value}</strong>
    </article>
  );
}

function ExecutiveCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="pw-exec-card pw-bezel">
      <header className="pw-exec-card__header">
        <h3>{title}</h3>
        <button type="button">•••</button>
      </header>
      <div className="pw-exec-card__body">{children}</div>
    </article>
  );
}

export default function PawardsDemo() {
  return (
    <main className="pw-shell">
      <aside className="pw-sidebar">
        <section className="pw-brand">
          <div className="pw-brand__crest">P</div>
          <div className="pw-brand__text">
            <strong>PAWARDS</strong>
            <span>CLINICAL INTELLIGENCE</span>
          </div>
        </section>

        <section className="pw-sidebar__descriptor">
          <span>EXECUTIVE MEDICAL OS</span>
          <p>Medicina Integrativa Premium</p>
        </section>

        <nav className="pw-nav" aria-label="Menu principal">
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`pw-nav__item ${item.label === "Agenda" ? "pw-nav__item--active" : ""}`}
            >
              <span className="pw-nav__icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="pw-plan-card">
          <span className="pw-plan-card__diamond">◆</span>
          <small>Plano Executivo</small>
          <strong>Concierge Plus</strong>
        </section>
      </aside>

      <section className="pw-content">
        <div className="pw-demo-ribbon">
          Tela de demonstração — identidade PAWARDS (Dr. Chat) · o app atual segue intacto
        </div>

        <header className="pw-page-header">
          <div>
            <h1>Portal Executivo</h1>
            <p>Sua jornada de saúde com excelência, ciência e cuidado integrado.</p>
          </div>

          <div className="pw-header-actions">
            <button className="pw-button-light pw-hover-glow" type="button">15 Jun — 21 Jun 2026</button>
            <button className="pw-button-light pw-hover-glow" type="button">Hoje</button>
            <button className="pw-button-navy pw-hover-glow" type="button">Sync</button>
          </div>
        </header>

        <section className="pw-metric-grid">
          <MetricCard label="Atendimentos" value="8" tone="gold" />
          <MetricCard label="Clientes ativos" value="528" />
          <MetricCard label="Pagamentos pendentes" value="3" tone="gold" />
          <MetricCard label="Alertas recentes" value="1" tone="danger" />
        </section>

        <section className="pw-dashboard-grid">
          <ExecutiveCard title="Próximo compromisso">
            <div className="pw-appointment">
              <div className="pw-date-box">
                <span>Segunda</span>
                <strong>15</strong>
                <small>Jun 2026</small>
              </div>
              <div>
                <strong className="pw-appointment__time">09:00</strong>
                <p>Consulta de Acompanhamento</p>
                <small>Clínica Tatuapé · Semana 1</small>
              </div>
            </div>
            <button className="pw-card-action" type="button">Ver agenda completa →</button>
          </ExecutiveCard>

          <ExecutiveCard title="Protocolo ativo">
            <div className="pw-protocol-banner">
              <strong>Emagrecimento &amp; Longevidade</strong>
              <span>Em andamento</span>
            </div>
            <dl className="pw-info-list">
              <div>
                <dt>Protocolo</dt>
                <dd>Emagrecimento</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>Enf. Fernanda Lima</dd>
              </div>
              <div>
                <dt>Duração prevista</dt>
                <dd>12 semanas</dd>
              </div>
            </dl>
          </ExecutiveCard>

          <ExecutiveCard title="Resumo financeiro">
            <div className="pw-finance-highlight">
              <span>Orçamentos aprovados</span>
              <strong className="pw-number">R$ 8.950,00</strong>
              <small>Total deste mês</small>
            </div>
            <div className="pw-finance-row">
              <span>Concluídos<br /><strong className="pw-number">R$ 5.650,00</strong></span>
              <span>Pendentes<br /><strong className="pw-number">R$ 2.300,00</strong></span>
              <span>Em análise<br /><strong className="pw-number">R$ 1.000,00</strong></span>
            </div>
          </ExecutiveCard>

          <ExecutiveCard title="Concierge premium">
            <div className="pw-concierge">
              <strong>Atendimento exclusivo</strong>
              <p>Sua saúde é nossa prioridade.</p>
              <button className="pw-button-navy pw-hover-glow" type="button">Chamar agora</button>
              <button className="pw-button-light pw-hover-glow" type="button">Enviar e-mail</button>
            </div>
          </ExecutiveCard>
        </section>
      </section>
    </main>
  );
}
