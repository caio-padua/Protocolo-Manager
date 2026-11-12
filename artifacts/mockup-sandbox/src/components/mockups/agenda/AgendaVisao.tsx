import { useState } from "react";

type Modo = "Semana" | "Dia" | "Mês";

const agendaInicial = [
  { nome: "Medicina · Sede", cor: "#6c92ba" },
  { nome: "Enfermagem · Sede", cor: "#d28c89" },
  { nome: "Medicina · Online", cor: "#66aaa5" },
  { nome: "Home care", cor: "#c9a75c" },
  { nome: "Google · Geral", cor: "#8995a0" },
];

const eventos = [
  { dia: 1, hora: 9, nome: "Paciente 1", agenda: "Medicina · Sede", profissional: "Dra. Helena Duarte", cor: "#6c92ba", titulo: "Consulta de acompanhamento", aplicacao: "Vitamina B12 · Aplicada" },
  { dia: 1, hora: 11, nome: "Paciente 2", agenda: "Enfermagem · Sede", profissional: "Enf. Paula Nunes", cor: "#d28c89", titulo: "Aplicação programada", aplicacao: "Ferro · Aguardando" },
  { dia: 2, hora: 10, nome: "Paciente 3", agenda: "Medicina · Online", profissional: "Dr. Caio", cor: "#66aaa5", titulo: "Retorno", aplicacao: "Sem aplicação nesta visita" },
  { dia: 3, hora: 13, nome: "Paciente 4", agenda: "Home care", profissional: "Enf. Camila Reis", cor: "#c9a75c", titulo: "Atendimento domiciliar", aplicacao: "Vitamina D · Confirmada" },
  { dia: 4, hora: 9, nome: "Paciente 5", agenda: "Medicina · Sede", profissional: "Dra. Helena Duarte", cor: "#6c92ba", titulo: "Consulta de acompanhamento", aplicacao: "Sem aplicação nesta visita" },
  { dia: 5, hora: 15, nome: "Paciente 6", agenda: "Enfermagem · Sede", profissional: "Enf. Paula Nunes", cor: "#d28c89", titulo: "Aplicação programada", aplicacao: "Complexo B · Agendada" },
];

const dias = [
  ["SEG", "09"],
  ["TER", "10"],
  ["QUA", "11"],
  ["QUI", "12"],
  ["SEX", "13"],
];

export function AgendaVisao() {
  const [modo, setModo] = useState<Modo>("Semana");
  const [ativas, setAtivas] = useState(() => agendaInicial.map((a) => a.nome));
  const [gaveta, setGaveta] = useState(false);
  const [hovered, setHovered] = useState<(typeof eventos)[number] | null>(null);
  const [semana, setSemana] = useState(0);
  const [hoje, setHoje] = useState(true);

  function alternarAgenda(nome: string) {
    setAtivas((atuais) => atuais.includes(nome) ? atuais.filter((n) => n !== nome) : [...atuais, nome]);
  }

  const botoesModo: Modo[] = ["Dia", "Semana", "Mês"];
  const displayedEvents = eventos.filter((evento) => ativas.includes(evento.agenda));

  return (
    <main style={s.page}>
      <style>{`
        * { box-sizing: border-box; }
        button { font: inherit; cursor: pointer; }
        button:focus-visible { outline: 2px solid #d5b66b; outline-offset: 2px; }
        .agenda-scroll { scrollbar-width: thin; scrollbar-color: #8291a0 transparent; }
        .appointment:hover { filter: brightness(1.04); transform: translateY(-1px); }
        .agenda-chip:hover { background: rgba(255,255,255,.11) !important; }
        @media (max-width: 700px) {
          .agenda-main { grid-template-columns: 1fr !important; }
          .agenda-sidebar { display: none !important; }
          .agenda-actions-title { display: none; }
          .agenda-title { font-size: 22px !important; }
          .agenda-toolbar { flex-wrap: wrap; }
          .agenda-toolbar-right { margin-left: 0 !important; }
          .agenda-grid { min-width: 650px; }
        }
      `}</style>
      <header style={s.topbar}>
        <div style={s.brand}>
          <div style={s.brandMark}>P</div>
          <div><strong style={s.brandName}>PAXTER</strong><span style={s.brandCaption}>INSTITUTO PÁDUA</span></div>
        </div>
        <nav style={s.menu}>
          <span style={s.menuItem}>Visão geral</span>
          <span style={{ ...s.menuItem, ...s.menuActive }}>Agenda</span>
          <span style={s.menuItem}>Pacientes</span>
          <span style={s.menuItem}>Protocolos</span>
        </nav>
        <div style={s.user}>
          <span style={s.userInitials}>CD</span><span style={s.userName}>Dr. Caio</span><span style={s.chevron}>⌄</span>
        </div>
      </header>

      <section style={s.body}>
        <aside className="agenda-sidebar" style={s.sidebar}>
          <p style={s.sideLabel}>OPERAÇÃO</p>
          {["Painel de controle", "Agenda", "Pacientes", "Protocolos", "Equipe"].map((item) => (
            <div key={item} style={{ ...s.sideItem, ...(item === "Agenda" ? s.sideItemActive : {}) }}>
              <span style={s.sideGlyph}>{item === "Agenda" ? "▦" : "◦"}</span>{item}
            </div>
          ))}
          <div style={s.sidebarBottom}><div style={s.onlineDot} /> Sistema operacional</div>
        </aside>

        <section style={s.content}>
          <div className="agenda-toolbar" style={s.toolbar}>
            <div>
              <div style={s.eyebrow}>OPERAÇÃO CLÍNICA <span style={{ color: "#c0a45c" }}>/</span> AGENDA</div>
              <h1 className="agenda-title" style={s.title}>Agenda <span style={s.titleDot}>.</span></h1>
            </div>
            <div style={s.periodNav}>
              <button type="button" aria-label="Período anterior" onClick={() => { setSemana((n) => n - 1); setHoje(false); }} style={s.arrowButton}>‹</button>
              <div style={s.periodText}>
                <strong>{semana === 0 ? "09 — 13 NOV 2026" : semana < 0 ? "02 — 06 NOV 2026" : "16 — 20 NOV 2026"}</strong>
                <span>{semana === 0 ? "SEMANA 46 · BRASÍLIA" : "SEMANA DA AGENDA"}</span>
              </div>
              <button type="button" aria-label="Próximo período" onClick={() => { setSemana((n) => n + 1); setHoje(false); }} style={s.arrowButton}>›</button>
              <button type="button" onClick={() => { setSemana(0); setHoje(true); }} style={{ ...s.todayButton, ...(hoje ? s.todayCurrent : {}) }}>Hoje</button>
            </div>
            <div className="agenda-toolbar-right" style={s.toolbarRight}>
              <div style={s.modeSwitch}>
                {botoesModo.map((label) => (
                  <button type="button" key={label} aria-pressed={modo === label} onClick={() => setModo(label)} style={{ ...s.modeButton, ...(modo === label ? s.modeSelected : {}) }}>{label}</button>
                ))}
              </div>
              <button type="button" title="Linha do tempo" aria-label="Linha do tempo" style={s.iconButton}>◷</button>
              <button type="button" title="Lista" aria-label="Lista" style={s.iconButton}>☷</button>
              <button type="button" title="Baixar período em arquivo ICS" aria-label="Baixar ICS" style={s.iconButton}>↓</button>
              <button type="button" title="Atualizar do Google" aria-label="Atualizar do Google" style={s.iconButton}>↻</button>
              <button type="button" style={s.newButton}><span style={{ fontSize: 18 }}>＋</span><span className="agenda-actions-title">Novo agendamento</span></button>
            </div>
          </div>

          <div style={s.agendaBar}>
            <div style={s.chips}>
              {agendaInicial.map((agenda) => {
                const active = ativas.includes(agenda.nome);
                return <button key={agenda.nome} type="button" aria-pressed={active} onClick={() => alternarAgenda(agenda.nome)} className="agenda-chip" style={{ ...s.chip, borderLeft: `3px solid ${agenda.cor}`, opacity: active ? 1 : 0.48 }}>
                  <span style={{ ...s.chipDot, background: agenda.cor }} />{agenda.nome}<span style={s.chipCount}>{eventos.filter((e) => e.agenda === agenda.nome).length}</span>
                </button>;
              })}
            </div>
            <div style={s.filterEnd}>
              <span style={s.agendaCount}>{ativas.length} / {agendaInicial.length}</span>
              <button type="button" onClick={() => setGaveta((value) => !value)} aria-label={gaveta ? "Minimizar agendas" : "Maximizar agendas"} aria-expanded={gaveta} style={s.expandButton}>{gaveta ? "−" : "+"}</button>
            </div>
            {gaveta && <div style={s.drawer}>
              <div style={s.drawerHead}><div><span style={s.drawerKicker}>FILTRO</span><h3 style={s.drawerTitle}>Agendas e profissionais</h3></div><button onClick={() => setGaveta(false)} style={s.drawerClose} aria-label="Fechar painel">×</button></div>
              <p style={s.drawerHint}>Escolha quais agendas aparecem na grade. Dois cliques numa agenda, na faixa, deixam só ela visível.</p>
              <div style={s.drawerGrid}>{agendaInicial.map((agenda) => <button key={agenda.nome} type="button" onClick={() => alternarAgenda(agenda.nome)} style={s.drawerRow}>
                <span style={{ ...s.checkbox, background: ativas.includes(agenda.nome) ? agenda.cor : "transparent" }}>{ativas.includes(agenda.nome) ? "✓" : ""}</span><span style={{ ...s.drawerColor, background: agenda.cor }} /><span style={s.drawerName}>{agenda.nome}</span><span style={s.drawerNumber}>{eventos.filter((e) => e.agenda === agenda.nome).length} atend.</span>
              </button>)}</div>
              <button type="button" onClick={() => setAtivas(agendaInicial.map((a) => a.nome))} style={s.showAll}>Mostrar todas</button>
            </div>}
          </div>

          <div className="agenda-main" style={s.mainGrid}>
            <div style={s.calendarPanel}>
              <div style={s.panelTop}>
                <div><span style={s.panelEyebrow}>VISÃO SEMANAL</span><h2 style={s.panelTitle}>Atendimentos <span style={s.eventCount}>{displayedEvents.length} nesta semana</span></h2></div>
                <div style={s.panelTools}><span style={s.timezone}>HORÁRIO DE BRASÍLIA</span><span style={s.smallControl}>⋯</span></div>
              </div>
              <div className="agenda-scroll" style={s.gridScroll}>
                <div className="agenda-grid" style={s.calendarGrid}>
                  <div style={s.cornerCell}>GMT−3</div>
                  {dias.map(([dia, data], i) => <div key={dia} style={{ ...s.dayHead, ...(i === 3 ? s.currentDay : {}) }}><span>{dia}</span><strong>{data}</strong>{i === 3 && <i style={s.todayPip} />}</div>)}
                  {Array.from({ length: 9 }, (_, index) => {
                    const hour = index + 8;
                    return <div key={hour} style={{ display: "contents" }}>
                      <div style={s.hourCell}>{String(hour).padStart(2, "0")}:00</div>
                      {dias.map(([_, __], indexDay) => {
                        const matching = displayedEvents.filter((event) => event.dia === indexDay && event.hora === hour);
                        return <div key={`${hour}-${indexDay}`} style={s.slot}>
                          {matching.map((event) => <button key={event.nome} type="button" className="appointment" onMouseEnter={() => setHovered(event)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(event)} onBlur={() => setHovered(null)} style={{ ...s.appointment, background: `${event.cor}1f`, borderLeft: `3px solid ${event.cor}`, color: "#23364a" }}>
                            <strong style={s.appointmentName}>{event.nome}</strong><span style={s.appointmentTime}>{String(event.hora).padStart(2, "0")}:00 — {String(event.hora + 1).padStart(2, "0")}:00</span><span style={s.appointmentType}>{event.titulo}</span>
                          </button>)}
                        </div>;
                      })}
                    </div>;
                  })}
                </div>
              </div>
              <div style={s.gridFooter}><span><i style={{ ...s.todayPip, display: "inline-block", marginRight: 7 }} />Hoje, 12 de novembro</span><span>Passe o mouse sobre um atendimento para ver o resumo.</span></div>
              {hovered && <div role="status" style={{ ...s.hoverCard, borderLeft: `4px solid ${hovered.cor}` }}>
                <div style={{ ...s.hoverCardTop, background: `${hovered.cor}1f` }}><strong>{hovered.nome}</strong><span>{String(hovered.hora).padStart(2, "0")}:00 — {String(hovered.hora + 1).padStart(2, "0")}:00 · Confirmado</span></div>
                <div style={s.hoverBody}><span style={s.hoverLine}>◉ <b>{hovered.agenda}</b></span><span style={s.hoverLine}>♙ {hovered.profissional}</span><span style={s.hoverLine}>⌖ Sede · Instituto Pádua</span><span style={s.hoverTitle}>APLICAÇÃO</span><span style={s.hoverLine}>{hovered.aplicacao}</span></div>
                <div style={s.hoverFoot}>Clique para abrir os detalhes</div>
              </div>}
            </div>
            <aside style={s.rightPanel}>
              <div style={s.rightPanelHeader}><span style={s.panelEyebrow}>QUINTA-FEIRA</span><span style={s.dateBadge}>12 NOV</span></div>
              <h2 style={s.dayTitle}>Hoje <span>· 6</span></h2>
              <div style={s.summaryRow}><span>Atendimentos</span><strong>06</strong></div>
              <div style={s.summaryRow}><span>Aplicações</span><strong>03</strong></div>
              <div style={s.summaryRow}><span>Próximo horário</span><strong>14:30</strong></div>
              <div style={s.nextAppointment}><span style={s.nextKicker}>A SEGUIR · 10:30</span><strong>Paciente 7</strong><span>Medicina · Sede</span><i style={{ ...s.nextAccent, background: "#6c92ba" }} /></div>
              <div style={s.notesTitle}>LEMBRETES</div>
              <p style={s.note}>1 atendimento aguardando confirmação</p>
              <p style={{ ...s.note, borderLeftColor: "#c9a75c" }}>Agenda Google atualizada há 8 min</p>
              <button type="button" style={s.dayButton}>Abrir dia completo <span>→</span></button>
            </aside>
          </div>
          <footer style={s.footer}><span>PADCOM <i>·</i> AGENDA OPERACIONAL</span><span>VISUALIZAÇÃO DEMONSTRATIVA · DADOS FICTÍCIOS</span></footer>
        </section>
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", fontFamily: "Inter, 'Segoe UI', sans-serif", color: "#283a4d", background: "#e6e9eb", overflow: "hidden" },
  topbar: { height: 68, background: "#12263d", color: "#f3f0e8", display: "flex", alignItems: "center", padding: "0 28px", gap: 42, boxShadow: "0 3px 12px #10223830" },
  brand: { display: "flex", alignItems: "center", gap: 10, minWidth: 196 },
  brandMark: { height: 34, width: 34, display: "grid", placeItems: "center", border: "1px solid #bba364", color: "#d4bd7b", fontFamily: "Georgia, serif", fontSize: 21 },
  brandName: { display: "block", letterSpacing: ".2em", fontFamily: "Georgia, serif", fontSize: 15, color: "#e8dcba" },
  brandCaption: { display: "block", fontSize: 8, letterSpacing: ".18em", color: "#9eabb5", marginTop: 2 },
  menu: { display: "flex", alignItems: "stretch", gap: 28, height: "100%", flex: 1 },
  menuItem: { display: "grid", alignItems: "center", color: "#aeb9c3", fontSize: 12, letterSpacing: ".02em" },
  menuActive: { color: "#e5d19c", borderBottom: "2px solid #bda76b" },
  user: { display: "flex", alignItems: "center", gap: 9, fontSize: 11, color: "#d4dce2" },
  userInitials: { width: 31, height: 31, display: "grid", placeItems: "center", borderRadius: "50%", background: "#334a60", border: "1px solid #66798a", color: "#e1d3a9", fontSize: 10 },
  userName: { whiteSpace: "nowrap" }, chevron: { fontSize: 14, color: "#9caab6" },
  body: { display: "grid", gridTemplateColumns: "194px minmax(0,1fr)", minHeight: "calc(100vh - 68px)" },
  sidebar: { background: "#182d43", color: "#d2d9df", padding: "27px 13px", position: "relative" },
  sideLabel: { fontSize: 9, letterSpacing: ".2em", color: "#8f9ca8", padding: "0 11px", margin: "0 0 13px" },
  sideItem: { display: "flex", alignItems: "center", gap: 11, padding: "11px", fontSize: 11, color: "#b8c3cc", marginBottom: 3 },
  sideItemActive: { background: "#243d55", borderLeft: "2px solid #c3a958", color: "#e5d5a8" },
  sideGlyph: { fontSize: 14, width: 17, textAlign: "center", color: "#bda76b" },
  sidebarBottom: { position: "absolute", bottom: 24, left: 24, display: "flex", gap: 8, alignItems: "center", fontSize: 9, color: "#90a0ab" },
  onlineDot: { width: 7, height: 7, background: "#78a894", borderRadius: "50%" },
  content: { minWidth: 0, padding: "25px 30px 16px", background: "#e8ebed" },
  toolbar: { display: "flex", alignItems: "center", gap: 22, marginBottom: 17 },
  eyebrow: { color: "#8a969f", letterSpacing: ".16em", fontSize: 9, fontWeight: 700 },
  title: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 31, lineHeight: 1, fontWeight: 500, margin: "5px 0 0", color: "#1c3148" },
  titleDot: { color: "#b99d5b" },
  periodNav: { display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" },
  arrowButton: { height: 33, width: 32, background: "linear-gradient(140deg,#f4f5f4,#dfe3e5)", border: "1px solid #c7cdd1", color: "#506477", boxShadow: "0 2px 3px #192b3b16", fontSize: 20, borderRadius: 4, lineHeight: 1 },
  periodText: { display: "flex", flexDirection: "column", gap: 2, textAlign: "center", minWidth: 146 },
  periodTextStrong: {},
  todayButton: { height: 33, padding: "0 13px", background: "#e5e8e9", border: "1px solid #c8ced1", borderRadius: 4, color: "#5a6b79", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" },
  todayCurrent: { background: "linear-gradient(145deg,#e8d8a8,#c9b36f)", borderColor: "#b69d5c", color: "#233348", boxShadow: "inset 0 1px #fff7, 0 2px 3px #10223824" },
  toolbarRight: { display: "flex", alignItems: "center", gap: 5, marginLeft: 14 },
  modeSwitch: { display: "flex", padding: 3, borderRadius: 5, background: "#d9dddf", boxShadow: "inset 2px 2px 4px #aeb6bb, inset -1px -1px 2px #f9fbfb", marginRight: 5 },
  modeButton: { padding: "7px 10px", border: 0, borderRadius: 3, background: "transparent", fontSize: 9, color: "#697784", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em" },
  modeSelected: { background: "linear-gradient(140deg,#f8f7f2,#e4e2d8)", color: "#20344a", boxShadow: "0 1px 3px #13283a36, inset 0 1px #fff" },
  iconButton: { width: 32, height: 33, borderRadius: 4, background: "linear-gradient(145deg,#f4f5f3,#dce1e3)", color: "#586d7e", border: "1px solid #c6cdd0", fontSize: 16, boxShadow: "0 2px 3px #12283a12" },
  newButton: { height: 34, display: "flex", alignItems: "center", gap: 5, padding: "0 11px", background: "linear-gradient(135deg,#344c63,#20374e)", color: "#f0e5c9", border: "1px solid #182e44", borderRadius: 4, boxShadow: "0 2px 4px #13283a40, inset 0 1px #70819370", fontSize: 10, fontWeight: 700, letterSpacing: ".035em", whiteSpace: "nowrap" },
  agendaBar: { position: "relative", zIndex: 3, display: "flex", alignItems: "stretch", gap: 8, minHeight: 42, padding: 5, background: "linear-gradient(145deg,#d9ddde,#e9ebea)", border: "1px solid #c4cbce", borderRadius: 5, boxShadow: "inset 2px 2px 4px #bec5c7, inset -2px -2px 4px #f5f7f6, 0 1px 2px #fff", marginBottom: 16 },
  chips: { display: "flex", alignItems: "center", flex: 1, gap: 3, overflow: "hidden", minWidth: 0 },
  chip: { display: "flex", alignItems: "center", gap: 7, height: 30, background: "#f1f2ef", borderTop: "1px solid #fff", borderRight: "1px solid #d0d5d5", borderBottom: "1px solid #d0d5d5", color: "#394c5e", padding: "0 9px", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap", transition: "opacity .15s ease", borderRadius: 3 },
  chipDot: { width: 6, height: 6, borderRadius: "50%" },
  chipCount: { fontSize: 8, color: "#88949b", fontVariantNumeric: "tabular-nums" },
  filterEnd: { display: "flex", alignItems: "center", gap: 7, marginLeft: "auto" },
  agendaCount: { color: "#76848f", fontSize: 8, fontWeight: 700, letterSpacing: ".08em", whiteSpace: "nowrap" },
  expandButton: { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 4, color: "#223950", background: "linear-gradient(145deg,#f9f8f2,#dfdfd7)", border: "1px solid #c6c7be", boxShadow: "0 1px 3px #13283a30", fontSize: 18, lineHeight: 1 },
  drawer: { position: "absolute", top: "calc(100% + 7px)", left: 0, right: 0, padding: 17, background: "#eef0ed", border: "1px solid #bac3c8", borderRadius: 6, boxShadow: "0 16px 38px #13283a3a", zIndex: 10 },
  drawerHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  drawerKicker: { fontSize: 8, letterSpacing: ".18em", color: "#a18c4f", fontWeight: 800 },
  drawerTitle: { margin: "3px 0 0", fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 500, color: "#20364b" },
  drawerClose: { border: "1px solid #c4cace", background: "#f5f6f2", borderRadius: 3, width: 29, height: 29, color: "#566a78", fontSize: 18 },
  drawerHint: { margin: "8px 0 12px", color: "#75828c", fontSize: 10 },
  drawerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 7 },
  drawerRow: { display: "flex", alignItems: "center", gap: 9, minHeight: 40, padding: "0 10px", textAlign: "left", border: "1px solid #d0d5d5", borderRadius: 4, background: "#f6f7f3", color: "#33495b" },
  checkbox: { display: "grid", placeItems: "center", width: 14, height: 14, border: "1px solid #aeb8bc", borderRadius: 2, color: "white", fontSize: 10 },
  drawerColor: { width: 8, height: 8, borderRadius: "50%" },
  drawerName: { flex: 1, fontSize: 10, fontWeight: 700 },
  drawerNumber: { fontSize: 9, color: "#8a969d" },
  showAll: { marginTop: 12, padding: "7px 12px", color: "#354b5d", border: "1px solid #bdc5c8", background: "#e6e9e6", borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" },
  mainGrid: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 235px", gap: 15, alignItems: "start" },
  calendarPanel: { position: "relative", background: "#f1f2ef", border: "1px solid #c7cdcf", borderRadius: 5, minWidth: 0, overflow: "visible", boxShadow: "0 2px 4px #25394a10, inset 0 1px #fff" },
  panelTop: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 17px 12px", borderBottom: "1px solid #d9dedd" },
  panelEyebrow: { fontSize: 8, fontWeight: 800, color: "#a18b50", letterSpacing: ".17em" },
  panelTitle: { margin: "4px 0 0", color: "#263b50", fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 500, display: "flex", gap: 10, alignItems: "center" },
  eventCount: { fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 600, color: "#83909a", letterSpacing: ".02em" },
  panelTools: { display: "flex", alignItems: "center", gap: 12 },
  timezone: { fontSize: 8, letterSpacing: ".12em", color: "#8b969b", fontWeight: 700 },
  smallControl: { width: 25, height: 25, display: "grid", placeItems: "center", border: "1px solid #d1d6d5", borderRadius: 3, color: "#657681" },
  gridScroll: { width: "100%", overflowX: "auto" },
  calendarGrid: { display: "grid", gridTemplateColumns: "51px repeat(5,minmax(105px,1fr))", minWidth: 635 },
  cornerCell: { display: "flex", alignItems: "center", justifyContent: "center", height: 43, color: "#8c989f", fontSize: 8, borderBottom: "1px solid #d9dedd", borderRight: "1px solid #e0e4e2" },
  dayHead: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 43, position: "relative", color: "#839099", fontSize: 8, fontWeight: 800, letterSpacing: ".12em", borderBottom: "1px solid #d9dedd", borderRight: "1px solid #e0e4e2" },
  currentDay: { background: "#e8e5d9", color: "#33495c" },
  todayPip: { width: 5, height: 5, borderRadius: "50%", background: "#b59b55" },
  hourCell: { height: 54, display: "flex", justifyContent: "center", paddingTop: 5, color: "#91a0a7", fontSize: 8, fontVariantNumeric: "tabular-nums", borderBottom: "1px solid #e0e4e2", borderRight: "1px solid #e0e4e2" },
  slot: { height: 54, position: "relative", padding: 3, borderBottom: "1px solid #e0e4e2", borderRight: "1px solid #e0e4e2", backgroundImage: "linear-gradient(to bottom,transparent 27px,#e6e9e7 28px,transparent 29px)" },
  appointment: { position: "relative", zIndex: 1, width: "100%", minHeight: 47, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "5px 6px", borderRadius: "2px 4px 4px 2px", textAlign: "left", transition: "transform .15s ease, filter .15s ease", boxShadow: "inset 0 1px #ffffffb0, 0 1px 2px #1e324019" },
  appointmentName: { fontSize: 9, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" },
  appointmentTime: { fontSize: 7, color: "#657887", fontVariantNumeric: "tabular-nums" },
  appointmentType: { fontSize: 7, color: "#75838d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" },
  gridFooter: { display: "flex", justifyContent: "space-between", padding: "10px 15px", color: "#839098", fontSize: 8, borderTop: "1px solid #dce1df" },
  hoverCard: { position: "absolute", top: 144, left: "36%", width: 225, background: "#f8f8f4", border: "1px solid #c4ccce", borderRadius: 4, boxShadow: "0 9px 24px #162b3c35", zIndex: 7, overflow: "hidden" },
  hoverCardTop: { padding: "10px 12px 8px", display: "flex", flexDirection: "column", gap: 4 },
  hoverBody: { display: "flex", flexDirection: "column", gap: 7, padding: "9px 12px", fontSize: 9, color: "#506474" },
  hoverLine: { display: "flex", gap: 7, alignItems: "center" },
  hoverTitle: { color: "#9b8750", letterSpacing: ".16em", fontWeight: 800, fontSize: 7, marginTop: 2 },
  hoverFoot: { padding: "6px 12px", borderTop: "1px solid #e0e3e0", color: "#89949a", fontSize: 8 },
  rightPanel: { background: "#f1f2ef", border: "1px solid #c7cdcf", borderRadius: 5, padding: 15, boxShadow: "0 2px 4px #25394a10, inset 0 1px #fff" },
  rightPanelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  dateBadge: { padding: "5px 7px", background: "#e7e4d8", color: "#72643d", borderRadius: 3, fontSize: 8, fontWeight: 800, letterSpacing: ".08em" },
  dayTitle: { margin: "8px 0 13px", fontFamily: "Georgia, serif", color: "#263b50", fontSize: 22, fontWeight: 500 },
  summaryRow: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #dce1df", color: "#75838d", fontSize: 9 },
  nextAppointment: { position: "relative", display: "flex", flexDirection: "column", gap: 4, overflow: "hidden", padding: "11px 12px", marginTop: 11, background: "#e5e9e7", border: "1px solid #d1d7d5", borderRadius: 4 },
  nextKicker: { fontSize: 7, color: "#9a8550", letterSpacing: ".15em", fontWeight: 800 },
  nextAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  notesTitle: { marginTop: 18, marginBottom: 8, color: "#9b8852", fontSize: 8, fontWeight: 800, letterSpacing: ".15em" },
  note: { padding: "8px 8px", margin: "0 0 6px", background: "#e9ece9", borderLeft: "2px solid #b9a361", color: "#687985", fontSize: 8, lineHeight: 1.4 },
  dayButton: { width: "100%", display: "flex", justifyContent: "space-between", marginTop: 12, padding: "9px 10px", background: "linear-gradient(140deg,#314960,#1f374e)", color: "#ecdfbd", border: "1px solid #1d3349", borderRadius: 4, fontSize: 9, fontWeight: 700 },
  footer: { display: "flex", justifyContent: "space-between", marginTop: 14, color: "#99a3a7", fontSize: 7, fontWeight: 700, letterSpacing: ".13em" },
};
