import { useState, type CSSProperties } from "react";

type Agenda = {
  id: string;
  equipe: string;
  nome: string;
  detalhe: string;
  ocupadas: number;
  total: number;
  proximo: string;
  cor: string;
  iniciais: string;
};

const agendas: Agenda[] = [
  { id: "medico-sede", equipe: "Agenda médico", nome: "Sede · Consultório 02", detalhe: "Dra. Helena Duarte", ocupadas: 4, total: 6, proximo: "10:30", cor: "#537d9f", iniciais: "MD" },
  { id: "enfermagem-proc", equipe: "Agenda enfermagem", nome: "Sala de procedimentos", detalhe: "Enf. Paula Nunes", ocupadas: 5, total: 8, proximo: "11:00", cor: "#b87578", iniciais: "EN" },
  { id: "biomedico-lab", equipe: "Agenda biomédico", nome: "Coleta · Laboratório", detalhe: "Biom. Rafael Costa", ocupadas: 2, total: 5, proximo: "11:20", cor: "#638c7f", iniciais: "BM" },
  { id: "medico-online", equipe: "Agenda médico", nome: "Teleconsulta", detalhe: "Dr. Caio Pádua", ocupadas: 3, total: 6, proximo: "13:40", cor: "#a88c56", iniciais: "MD" },
];

const pct = (agenda: Agenda) => Math.round(agenda.ocupadas / agenda.total * 100);

export function AgendaOcupacao() {
  const [selecionada, setSelecionada] = useState(agendas[0].id);
  const atual = agendas.find((agenda) => agenda.id === selecionada) ?? agendas[0];

  return (
    <main style={s.page}>
      <style>{`
        * { box-sizing: border-box; }
        button { font: inherit; }
        .ao-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .ao-card:hover { transform: translateY(-2px); }
        .ao-card:focus-visible { outline: 2px solid #c8ae70; outline-offset: 3px; }
        .ao-track { overflow: hidden; }
        @media (max-width: 780px) {
          .ao-header-right { font-size: 7px !important; }
          .ao-shell { padding: 22px 18px 24px !important; }
          .ao-top { align-items: flex-start !important; flex-direction: column; gap: 14px !important; }
          .ao-summary { width: 100%; }
          .ao-grid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; gap: 13px !important; }
        }
        @media (max-width: 480px) {
          .ao-header { padding: 0 18px !important; }
          .ao-header-right span:nth-of-type(n+3) { display: none; }
          .ao-grid { grid-template-columns: 1fr !important; }
          .ao-card { min-height: 150px !important; }
        }
      `}</style>

      <header className="ao-header" style={s.header}>
        <div style={s.brand}>
          <div style={s.brandMark}>P</div>
          <div><strong style={s.brandName}>PAXTER</strong><span style={s.brandSub}>INSTITUTO PÁDUA · OPERAÇÃO</span></div>
        </div>
        <div className="ao-header-right" style={s.headerRight}><span style={s.liveDot} /> <span>QUINTA-FEIRA · 12 NOV 2026</span><span style={s.headerDivider} /><span>HORÁRIO DE BRASÍLIA</span></div>
      </header>

      <section className="ao-shell" style={s.shell}>
        <div className="ao-top" style={s.top}>
          <div>
            <div style={s.eyebrow}>AGENDA OPERACIONAL <span style={{ color: "#bba56e" }}>/</span> EQUIPE</div>
            <h1 style={s.title}>Escolha uma agenda<span style={{ color: "#b69d5e" }}>.</span></h1>
            <p style={s.subtitle}>Carga do dia em primeiro plano. Selecione uma agenda para abrir os horários.</p>
          </div>
          <div className="ao-summary" style={s.summary}>
            <span style={s.summaryKicker}>OCUPAÇÃO GERAL</span>
            <strong style={s.summaryNumber}>14<span> / 25</span></strong>
            <div style={s.summaryFoot}><span style={s.summaryDot} /> 56% das vagas ocupadas</div>
          </div>
        </div>

        <div style={s.sectionHead}>
          <div><span style={s.sectionLabel}>PROFISSIONAIS E SALAS</span><span style={s.sectionTitle}>  ·  4 agendas ativas</span></div>
          <span style={s.helper}><span style={s.helperKey}>1</span> toque para abrir</span>
        </div>

        <div className="ao-grid" style={s.grid}>
          {agendas.map((agenda) => {
            const active = atual.id === agenda.id;
            const ocupacao = pct(agenda);
            const livres = agenda.total - agenda.ocupadas;
            return (
              <article key={agenda.id} style={s.cardWrap}>
                <div style={s.loadRail} aria-label={`${agenda.ocupadas} de ${agenda.total} horários ocupados`}>
                  <div style={s.loadTop}>
                    <span style={s.loadLabel}><span style={{ ...s.loadLed, background: agenda.cor }} /> OCUPADO</span>
                    <strong style={s.loadCount}>{agenda.ocupadas}<i>/{agenda.total}</i></strong>
                  </div>
                  <div className="ao-track" style={s.track}>
                    <span style={{ ...s.trackFill, width: `${ocupacao}%`, background: agenda.cor }} />
                    <span style={{ ...s.trackHighlight, width: `${ocupacao}%` }} />
                  </div>
                </div>

                <button type="button" aria-pressed={active} onClick={() => setSelecionada(agenda.id)} className="ao-card"
                  style={{ ...s.card, ...(active ? s.cardActive : {}), ["--agenda-color" as string]: agenda.cor } as CSSProperties}>
                  <div style={s.cardTop}>
                    <span style={{ ...s.avatar, background: `${agenda.cor}20`, color: agenda.cor, borderColor: `${agenda.cor}55` }}>{agenda.iniciais}</span>
                    <span style={{ ...s.open, ...(active ? s.openActive : {}) }}>{active ? "SELECIONADA" : "ABRIR AGENDA"}<span aria-hidden> ↗</span></span>
                  </div>
                  <span style={s.teamName}>{agenda.equipe}</span>
                  <span style={s.agendaName}>{agenda.nome}</span>
                  <span style={s.professional}>{agenda.detalhe}</span>
                  <span style={s.cardBottom}><span style={{ ...s.freeDot, background: livres > 0 ? "#56866e" : "#ae6c67" }} />{livres} {livres === 1 ? "horário livre" : "horários livres"}<span style={s.nextTime}>PRÓXIMO {agenda.proximo}</span></span>
                </button>
              </article>
            );
          })}
        </div>

        <div style={s.selection}>
          <div style={{ ...s.selectionMark, background: atual.cor }}>✓</div>
          <div style={s.selectionText}>
            <span style={s.selectionKicker}>AGENDA SELECIONADA</span>
            <strong>{atual.equipe} <span style={{ color: "#bca569" }}>·</span> {atual.nome}</strong>
          </div>
          <button type="button" style={s.continue} onClick={() => window.alert(`Prévia: abrir ${atual.nome}`)}>Ver horários <span aria-hidden>→</span></button>
        </div>
        <footer style={s.footer}><span>PADCOM <i>·</i> AGENDA</span><span>VISUALIZAÇÃO DEMONSTRATIVA · OCUPAÇÃO FICTÍCIA</span></footer>
      </section>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#e7e9e8", color: "#24384d", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", paddingBottom: 26 },
  header: { height: 64, padding: "0 34px", background: "#162d43", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#d8e0e5", boxShadow: "0 3px 12px #0e24352c" },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandMark: { width: 31, height: 31, display: "grid", placeItems: "center", border: "1px solid #b9a66f", color: "#e0d2ae", fontFamily: "Georgia,serif", fontSize: 18, boxShadow: "inset 1px 1px #ffffff22, 1px 2px 4px #0b1e30" },
  brandName: { display: "block", fontFamily: "Georgia,serif", color: "#efe3c4", fontSize: 12, letterSpacing: ".2em" },
  brandSub: { display: "block", marginTop: 2, color: "#94a3ae", fontSize: 7, letterSpacing: ".15em" },
  headerRight: { display: "flex", alignItems: "center", gap: 9, color: "#a8b5be", fontSize: 8, letterSpacing: ".12em", fontWeight: 700 },
  liveDot: { width: 6, height: 6, borderRadius: "50%", background: "#78ad91", boxShadow: "0 0 0 3px #78ad9120" },
  headerDivider: { height: 15, width: 1, background: "#526577", margin: "0 4px" },
  shell: { maxWidth: 1280, margin: "0 auto", padding: "34px 42px 22px" },
  top: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 28, marginBottom: 36 },
  eyebrow: { color: "#788894", fontSize: 9, fontWeight: 800, letterSpacing: ".17em" },
  title: { margin: "8px 0 0", color: "#1d344a", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, fontWeight: 500, letterSpacing: "-.02em" },
  subtitle: { margin: "8px 0 0", color: "#788792", fontSize: 12 },
  summary: { minWidth: 224, padding: "13px 17px 12px", background: "linear-gradient(145deg,#f0f1ee,#dce0e0)", border: "1px solid #c5ccce", borderRadius: 6, boxShadow: "inset 2px 2px 4px #ffffff, inset -2px -2px 4px #b9c1c3, 0 2px 4px #24394a12" },
  summaryKicker: { display: "block", color: "#88949c", fontSize: 8, fontWeight: 800, letterSpacing: ".16em" },
  summaryNumber: { display: "block", marginTop: 3, color: "#263d52", fontFamily: "Georgia,serif", fontSize: 25, lineHeight: 1.1 },
  summaryFoot: { display: "flex", alignItems: "center", gap: 6, marginTop: 5, color: "#7a898f", fontSize: 9 },
  summaryDot: { width: 5, height: 5, borderRadius: "50%", background: "#739683" },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13, padding: "0 1px" },
  sectionLabel: { color: "#687b89", fontSize: 9, fontWeight: 900, letterSpacing: ".16em" },
  sectionTitle: { color: "#9aa4a8", fontSize: 10 },
  helper: { color: "#87949d", display: "flex", alignItems: "center", gap: 6, fontSize: 9 },
  helperKey: { display: "grid", placeItems: "center", width: 17, height: 17, color: "#657888", border: "1px solid #c5cccf", borderRadius: 4, fontSize: 8, boxShadow: "inset 1px 1px white, 0 1px 2px #20384b12" },
  grid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16, alignItems: "start" },
  cardWrap: { minWidth: 0 },
  loadRail: { minHeight: 43, padding: "7px 10px 8px", marginBottom: 7, background: "linear-gradient(145deg,#e1e4e4,#edf0ed)", border: "1px solid #c3cbce", borderRadius: 5, boxShadow: "inset 2px 2px 4px #bbc4c7, inset -1px -1px 3px #ffffff, 0 1px 2px #1d354810" },
  loadTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5, lineHeight: 1 },
  loadLabel: { display: "flex", alignItems: "center", gap: 5, color: "#75858e", fontSize: 7, fontWeight: 900, letterSpacing: ".14em" },
  loadLed: { width: 5, height: 5, borderRadius: "50%" },
  loadCount: { color: "#40576a", fontFamily: "Georgia,serif", fontSize: 11, fontWeight: 700 },
  track: { height: 5, position: "relative", background: "#cbd1d1", borderRadius: 5, boxShadow: "inset 1px 1px 2px #aeb8bc, inset -1px -1px 1px #f8f9f6" },
  trackFill: { position: "absolute", inset: "0 auto 0 0", borderRadius: 5, opacity: .9, boxShadow: "inset 0 1px #ffffff88" },
  trackHighlight: { position: "absolute", inset: "0 auto 0 0", borderRadius: 5, background: "linear-gradient(180deg,#ffffff55,transparent 70%)" },
  card: { width: "100%", minHeight: 188, padding: "13px 14px 11px", textAlign: "left", display: "flex", flexDirection: "column", alignItems: "stretch", border: "1px solid #c3cbcd", borderTopColor: "#fff", borderRadius: 6, background: "linear-gradient(148deg,#f6f6f2 0%,#e9ecea 54%,#dfe4e3 100%)", color: "#273d51", boxShadow: "inset 1px 1px 2px #ffffff, inset -2px -2px 4px #c5ccce, 0 3px 6px #1a344817, 0 1px 1px #fff", cursor: "pointer" },
  cardActive: { borderColor: "#b8a36d", boxShadow: "inset 1px 1px 2px #fff, inset -2px -2px 4px #c5ccce, 0 0 0 2px #b8a36d30, 0 4px 10px #1a344822" },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  avatar: { display: "grid", placeItems: "center", width: 29, height: 29, border: "1px solid", borderRadius: 5, fontFamily: "Georgia,serif", fontSize: 9, fontWeight: 700, boxShadow: "inset 1px 1px #ffffffaa, 0 1px 2px #1e354612" },
  open: { color: "#91a0a6", fontSize: 7, fontWeight: 900, letterSpacing: ".12em" },
  openActive: { color: "#9b844d" },
  teamName: { color: "#6e8290", fontSize: 10, fontWeight: 800, letterSpacing: ".035em", textTransform: "uppercase" },
  agendaName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3, color: "#263b50", fontFamily: "Georgia,serif", fontSize: 16, fontWeight: 700, letterSpacing: "-.01em" },
  professional: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 4, color: "#87949c", fontSize: 9 },
  cardBottom: { display: "flex", alignItems: "center", gap: 5, marginTop: "auto", paddingTop: 13, color: "#71828d", fontSize: 8, fontWeight: 700 },
  freeDot: { width: 5, height: 5, borderRadius: "50%" },
  nextTime: { marginLeft: "auto", color: "#8a969b", fontSize: 7, letterSpacing: ".08em", fontWeight: 800 },
  selection: { display: "flex", alignItems: "center", gap: 11, marginTop: 27, padding: "12px 14px", border: "1px solid #c4ccce", borderRadius: 6, background: "linear-gradient(145deg,#e1e5e5,#edf0ed)", boxShadow: "inset 1px 1px 3px #c0c8ca, inset -1px -1px 3px white" },
  selectionMark: { width: 22, height: 22, display: "grid", placeItems: "center", borderRadius: 4, color: "white", fontSize: 12, boxShadow: "inset 0 1px #ffffff66, 0 1px 2px #22384a30" },
  selectionText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  selectionKicker: { color: "#929da2", fontSize: 7, fontWeight: 900, letterSpacing: ".15em" },
  continue: { display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", border: "1px solid #192f43", borderRadius: 4, background: "linear-gradient(145deg,#314b61,#1c354d)", color: "#eadfbf", fontSize: 9, fontWeight: 800, letterSpacing: ".04em", boxShadow: "inset 0 1px #7c8c9955, 0 2px 4px #1b304333", cursor: "pointer" },
  footer: { display: "flex", justifyContent: "space-between", marginTop: 18, color: "#99a3a6", fontSize: 7, fontWeight: 800, letterSpacing: ".13em" },
};
