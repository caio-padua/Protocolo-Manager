import { Fragment, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Download, RefreshCw, Plus, Sun, CalendarRange, LayoutGrid, Rows3 } from "lucide-react";
import "./_group.css";

/** Peças comuns dos 5 modelos: só muda o TOPO (nome da tela + faixa). Botões e agendas são os mesmos da Agenda Diária. */
export function Tela({ children, marcaItem, rente = false, itemGiz = false }: { children: ReactNode; marcaItem?: ReactNode; rente?: boolean; itemGiz?: boolean }) {
  const item = (t: string, on = false, extra?: ReactNode) => (
    <div className={`tm-side-item ${on ? "on" : ""} ${on && itemGiz ? "giz tm-giz" : ""}`}>{on ? extra : null}<span>{t}</span></div>
  );
  return (
    <div className="tm-root">
      <aside className="tm-side">
        {item("Dashboard")}
        <div className="tm-side-sec">Agenda &amp; Recepção</div>
        {item("Marcação de Consulta")}
        {item("Marcação (Modelo Antigo)")}
        {item("Pit Stop")}
        {item("Agenda Diária", true, marcaItem)}
        {item("Agenda Configuração")}
        {item("Clientes")}
        <div className="tm-side-sec">O ato médico</div>
        {item("Radar Clínico")}
        {item("Cockpit da Consulta")}
      </aside>
      <main className={`tm-main ${rente ? "rente" : ""}`}>{children}</main>
    </div>
  );
}

export function Comandos({ parte, titulo }: { parte?: "nav" | "ferramentas"; titulo?: ReactNode }) {
  return (
    <div className="tm-comandos">
      {titulo}
      {parte !== "ferramentas" && (<>
      <button className="tm-btn sq"><ChevronLeft size={14} /></button>
      <div className="tm-periodo"><b>9 — 15 NOV 2026</b><i>ESTA SEMANA</i></div>
      <button className="tm-btn sq"><ChevronRight size={14} /></button>
      <button className="tm-btn">Hoje</button>
      <div className="tm-grupo">
        <button className="tm-btn off"><Sun size={12} />Dia</button>
        <button className="tm-btn"><CalendarRange size={12} />Semana</button>
        <button className="tm-btn off"><LayoutGrid size={12} />Mês</button>
      </div>
      </>)}
      <span className="grow" />
      {parte !== "nav" && (<>
      <div className="tm-grupo"><button className="tm-btn sq"><Clock size={13} /></button><button className="tm-btn sq off"><Rows3 size={13} /></button></div>
      <button className="tm-btn sq"><Download size={13} /></button>
      <button className="tm-btn sq navy"><RefreshCw size={13} /></button>
      <button className="tm-btn navy"><Plus size={13} />Novo agendamento</button>
      </>)}
    </div>
  );
}

export function Chips() {
  const c = (n: string, s: string, cor: string, p: string) => (
    <div className="tm-chip" style={{ ["--c" as string]: cor }}><b>{n}</b><span>{s} · {p}</span><u /></div>
  );
  return <div className="tm-chips">{c("Enfermeira", "Home care", "#e6b422", "0%")}{c("Enfermeira", "Sede", "#e67c73", "0%")}{c("Médico", "Home care", "#7cb342", "0%")}{c("Médico", "On line", "#039be5", "100%")}</div>;
}

export function Grade() {
  const dias: [string, string, string][] = [["SEG", "9", "segunda"], ["TER", "10", "terça"], ["QUA", "11", "quarta"], ["QUI", "12", "quinta"], ["SEX", "13", "sexta"]];
  return (
    <div className="tm-grade">
      <span />
      {dias.map(([m, n, s]) => (
        <div key={n} className={`tm-leaf ${n === "12" ? "tm-hoje" : ""}`}><i>NOVEMBRO</i><b>{n}</b><small>{s}-feira</small></div>
      ))}
      {[8, 9, 10].map((h) => (<Fragment key={h}><span className="tm-hora">{h}h</span><div className="tm-linha" /></Fragment>))}
    </div>
  );
}

/** Nome da tela em letras soltas de vidro. claro=true para fundo creme. */
export function LetrasVidro({ texto, px, claro = false, mini = false }: { texto: string; px: number; claro?: boolean; mini?: boolean }) {
  return (
    <span className={`tm-vidro ${claro ? "claro" : ""} ${mini ? "mini" : ""}`} style={{ fontSize: px }} role="heading" aria-level={1} aria-label={texto}>
      {texto.toUpperCase().split(" ").map((p, i) => (
        <span key={i} className="p" aria-hidden>{[...p].map((l, k) => <span key={k} className="l" data-l={l}>{l}</span>)}</span>
      ))}
    </span>
  );
}

export const IconeMenu = CalendarDays;

/** Medalhãozinho: o mesmo símbolo que aparece quando o menu é minimizado (moldura dourada + vidro + miolo azul-marinho + símbolo em ouro). */
export function Medalhao({ px = 16 }: { px?: number }) {
  return (
    <span className="tm-medalhao" style={{ width: px, height: px, borderRadius: Math.max(3, px * 0.28) }} aria-hidden>
      <span className="tm-medalhao-miolo" style={{ borderRadius: Math.max(2, px * 0.22) }}>
        <img src="/__mockup/images/paxter-symbol-cut.png" alt="" draggable={false} />
      </span>
    </span>
  );
}

/** Faixa de terno de ponta a ponta, encostada no teto (sai do padding da tela). */
export function Teto({ h = 20, children, justify = "flex-start", className = "" }: { h?: number; children?: ReactNode; justify?: string; className?: string }) {
  return (
    <div className={`tm-teto tm-faixa ${className}`} style={{ height: h, justifyContent: justify }}>{children}</div>
  );
}
