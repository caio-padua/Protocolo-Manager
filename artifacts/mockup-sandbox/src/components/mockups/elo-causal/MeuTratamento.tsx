import "./_group.css";
import { MARCADORES, julgar, pct, parNum, dataBR } from "./_dados";
import { Sparkline } from "./_shared/Sparkline";

/* ============================================================
   MEU TRATAMENTO — aba nova da Área do Cliente (/area).
   O paciente reporta fórmula por fórmula DENTRO de cada período.
   DÚVIDAS continua sendo aba separada (ordem do CEO).
   ============================================================ */

const PERIODOS = [
  {
    sigla: "IM", nome: "Em jejum / ao acordar", hora: "07:00", estado: "feito" as const,
    itens: [
      { nome: "MAGNÉSIO DIMALATO", dose: "300 mg", ok: true },
      { nome: "VITAMINA D3 + K2", dose: "10.000 UI", ok: true },
    ],
  },
  {
    sigla: "AL", nome: "Antes do almoço", hora: "11:00", estado: "agora" as const,
    itens: [
      { nome: "BERBERINA HCL", dose: "500 mg", ok: null },
      { nome: "ÔMEGA 3 TG", dose: "1.000 mg", ok: null },
    ],
  },
  {
    sigla: "NO", nome: "À noite", hora: "18:00", estado: "futuro" as const,
    itens: [
      { nome: "L-TEANINA", dose: "200 mg", ok: null },
      { nome: "GLICINATO DE ZINCO", dose: "30 mg", ok: null },
    ],
  },
];

function Cabecalho() {
  return (
    <div className="panel-3d-hero px-4 pt-4 pb-3">
      <div className="flex items-center gap-2.5">
        <div className="bevel-3d-gold w-8 h-8 rounded grid place-items-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9 12a3 3 0 0 1 3-3h1a3 3 0 0 1 0 6h-1" stroke="#f0dcae" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M15 12a3 3 0 0 1-3 3h-1a3 3 0 0 1 0-6h1" stroke="#f0dcae" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div className="elo-serif leading-none" style={{ fontSize: 21, fontWeight: 700, letterSpacing: ".08em", color: "#f2e6c9" }}>
            MEU TRATAMENTO
          </div>
          <div className="text-[8.5px] tracking-[0.22em] ink-faint font-semibold mt-1">QUINTA-FEIRA, 14 DE AGOSTO DE 2026</div>
        </div>
      </div>
      <div className="faixa-gold mt-3" />
      <div className="concave-3d mt-3 px-3 py-1.5">
        <div className="text-[9px] tracking-[0.14em] ink-faint font-semibold">CAIO HENRIQUE FERNANDES PADUA</div>
      </div>
    </div>
  );
}

function Pulso() {
  return (
    <div className="panel-3d p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="paxter-led paxter-led-green paxter-led-breathe" />
        <span className="text-[9px] tracking-[0.2em] ink-dim font-semibold">O SEU PULSO</span>
        <span className="ml-auto text-[9px] ink-faint tabnum">ÚLTIMOS 30 DIAS</span>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-4 items-center">
        <div className="screen-3d w-[104px] h-[104px] grid place-items-center relative">
          <svg width="104" height="104" className="absolute inset-0">
            <circle cx="52" cy="52" r="43" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="7" />
            <circle cx="52" cy="52" r="43" fill="none" stroke="#5fc79a" strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 43 * 0.92} ${2 * Math.PI * 43}`}
                    transform="rotate(-90 52 52)" />
          </svg>
          <div className="text-center relative">
            <div className="elo-serif tabnum leading-none" style={{ fontSize: 38, fontWeight: 700, color: "#eafff4" }}>
              92<span style={{ fontSize: 17 }}>%</span>
            </div>
            <div className="text-[8px] tracking-[0.14em] ink-faint font-semibold mt-0.5">CONSTÂNCIA</div>
          </div>
        </div>
        <div className="space-y-1.5">
          {[
            { r: "Doses no horário", v: "215 de 234", cor: "#5fc79a" },
            { r: "Dias seguidos", v: "18 dias", cor: "#d9b978" },
            { r: "Frentes ativas", v: "4 de 4", cor: "#6fb1e8" },
          ].map((k) => (
            <div key={k.r} className="concave-3d px-2.5 py-1.5 flex items-center justify-between">
              <span className="text-[10px] ink-dim">{k.r}</span>
              <span className="elo-serif tabnum text-[13px] font-semibold" style={{ color: k.cor }}>{k.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BlocoPeriodo({ p }: { p: (typeof PERIODOS)[number] }) {
  const corReal = p.estado === "feito" ? "#5fc79a" : p.estado === "agora" ? "#f0c76a" : "#5a7796";
  const led = p.estado === "feito" ? "paxter-led-green" : p.estado === "agora" ? "paxter-led-amber paxter-led-on" : "paxter-led-off";

  return (
    <div className={`panel-3d-sub overflow-hidden ${p.estado === "agora" ? "paxter-neon-breathe" : ""}`}>
      <div className="flex">
        <div className="w-1 shrink-0" style={{ background: corReal }} />
        <div className="flex-1 p-3">
          {/* ZONA 1 — top bar */}
          <div className="flex items-center gap-2">
            <span className={`paxter-led ${led}`} />
            <span className="elo-serif tabnum" style={{ fontSize: 15, fontWeight: 700, color: "#f2e6c9" }}>{p.hora}</span>
            <span className="concave-3d px-1.5 py-0.5 text-[9px] tracking-[0.1em] font-bold gold-dim">{p.sigla}</span>
            <span className="ml-auto text-[9px] tracking-[0.1em] font-bold" style={{ color: corReal }}>
              {p.estado === "feito" ? "CUMPRIDO" : p.estado === "agora" ? "AGORA" : "MAIS TARDE"}
            </span>
          </div>
          {/* ZONA 2 — nome do período */}
          <div className="text-[10px] ink-dim mt-1 mb-2.5">{p.nome}</div>

          {/* ZONA 3 — uma linha POR FÓRMULA */}
          <div className="space-y-1.5">
            {p.itens.map((it) => (
              <div key={it.nome} className="concave-3d px-2.5 py-2 grid grid-cols-[1fr_auto] gap-2 items-center">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#e9eef6] truncate">{it.nome}</div>
                  <div className="text-[9.5px] gold-dim tabnum mt-0.5">{it.dose}</div>
                </div>
                {it.ok === true ? (
                  <div className="btn-3d-ok px-2.5 py-1.5 flex items-center gap-1.5 shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <path d="M4 12.5 9.5 18 20 6.5" stroke="#eafff4" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[9.5px] font-bold tracking-[0.06em]">TOMEI</span>
                  </div>
                ) : (
                  <div className="flex gap-1.5 shrink-0">
                    <button className="btn-3d-soft px-2.5 py-1.5 text-[9.5px] font-bold tracking-[0.06em]">TOMEI</button>
                    <button className="btn-3d-soft px-2 py-1.5 text-[9.5px] ink-dim">NÃO</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Frente({ cor, rotulo, titulo, linha1, linha2, acao }: {
  cor: string; rotulo: string; titulo: string; linha1: string; linha2: string; acao: string;
}) {
  return (
    <div className="panel-3d-sub overflow-hidden">
      <div className="flex">
        <div className="w-1 shrink-0" style={{ background: cor }} />
        <div className="flex-1 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[8.5px] tracking-[0.18em] font-bold" style={{ color: cor }}>{rotulo}</span>
            <span className="ml-auto text-[9px] gold-dim">{acao}</span>
          </div>
          <div className="elo-serif mt-1" style={{ fontSize: 16, fontWeight: 600, color: "#e9eef6" }}>{titulo}</div>
          <div className="concave-3d mt-2 px-2.5 py-1.5">
            <div className="text-[10px] ink-dim">{linha1}</div>
            <div className="text-[10px] gold-dim tabnum mt-0.5">{linha2}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MeuElo() {
  const m = MARCADORES[0]; // Ácido Úrico — dado real
  const n = m.serie.length;
  const de = m.serie[n - 2], para = m.serie[n - 1];
  const v = julgar(m.direcao, de.valor, para.valor, m.refLow, m.refHigh);
  const p = pct(de.valor, para.valor);
  const cor = v === "favoravel" ? "#5fc79a" : v === "desfavoravel" ? "#e8837f" : "#8ea6c6";

  return (
    <div className="panel-3d-hero p-4 paxter-neon-breathe">
      <div className="flex items-center gap-2">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M9 12a3 3 0 0 1 3-3h1a3 3 0 0 1 0 6h-1" stroke="#d9b978" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M15 12a3 3 0 0 1-3 3h-1a3 3 0 0 1 0-6h1" stroke="#d9b978" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <span className="text-[9px] tracking-[0.2em] gold font-bold">O SEU CORPO RESPONDEU</span>
      </div>

      <p className="elo-serif mt-2.5 leading-snug" style={{ fontSize: 16.5, color: "#eef4fc" }}>
        O senhor manteve <b className="gold">92%</b> de constância desde março.
        No mesmo período, seu <b>ácido úrico</b> caiu de <b className="tabnum">{parNum(de.valor, para.valor)[0]}</b> para{" "}
        <b className="tabnum" style={{ color: cor }}>{parNum(de.valor, para.valor)[1]} mg/dL</b>.
        <span style={{ color: cor }}> Os dois caminharam juntos.</span>
      </p>
      <p className="text-[10.5px] ink-dim mt-1.5 leading-snug">
        O Dr. Caio já recebeu esta leitura e vai comentá-la com o senhor na consulta.
      </p>

      <div className="screen-3d mt-3 p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] ink-dim">{m.nome}</span>
          <span className="elo-serif tabnum text-[15px] font-bold" style={{ color: cor }}>
            {p > 0 ? "+" : "−"}{Math.abs(p).toFixed(1).replace(".", ",")}%
          </span>
        </div>
        <Sparkline m={m} w={310} h={54} stroke={cor} />
        <div className="flex justify-between text-[8.5px] ink-faint tabnum mt-0.5">
          <span>{dataBR(m.serie[0].data)}</span>
          <span>{dataBR(para.data)}</span>
        </div>
      </div>

      <button className="btn-3d w-full mt-3 py-2.5 flex items-center justify-center gap-2">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="#f0dcae" strokeWidth="2" strokeLinejoin="round" />
          <path d="M16 9a4 4 0 0 1 0 6" stroke="#f0dcae" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-[10.5px] font-bold tracking-[0.1em] gold">OUVIR DO DR. CAIO</span>
      </button>
    </div>
  );
}

export function MeuTratamento() {
  return (
    <div className="elo-root pb-8">
      <Cabecalho />
      <div className="px-4 pt-4 space-y-4">
        <Pulso />

        <div>
          <div className="text-[9px] tracking-[0.2em] gold-dim font-bold mb-2 px-0.5">HOJE, PERÍODO A PERÍODO</div>
          <div className="space-y-2.5">
            {PERIODOS.map((p) => <BlocoPeriodo key={p.sigla} p={p} />)}
          </div>
        </div>

        <div>
          <div className="text-[9px] tracking-[0.2em] gold-dim font-bold mb-2 px-0.5">AS SUAS QUATRO FRENTES</div>
          <div className="space-y-2.5">
            <Frente cor="#d9b978" rotulo="FÓRMULAS MAGISTRAIS" titulo="6 fórmulas, 3 períodos"
                    linha1="Próxima janela às 11:00" linha2="Berberina HCL · Ômega 3 TG" acao="reportar" />
            <Frente cor="#6fb1e8" rotulo="PROTOCOLO INJETÁVEL" titulo="Sessão 4 de 8"
                    linha1="Próxima aplicação em 21/08/2026" linha2="Intramuscular · a cada 7 dias" acao="confirmar" />
            <Frente cor="#5fc79a" rotulo="PLANO NUTRICIONAL" titulo="Plano de 14 de julho"
                    linha1="5 refeições planejadas por dia" linha2="Lista de compras enviada" acao="reportar" />
            <Frente cor="#c99be8" rotulo="PRÓXIMA CONSULTA" titulo="Retorno trimestral"
                    linha1="18/09/2026, quinta-feira, 14:30" linha2="Clínica Pádua · Belo Horizonte" acao="ver" />
          </div>
        </div>

        <MeuElo />

        <div className="panel-3d-sub p-3.5">
          <div className="flex items-center gap-2">
            <span className="paxter-led paxter-led-amber paxter-led-breathe" />
            <span className="text-[9px] tracking-[0.18em] ink-dim font-bold">PRECISA FALAR COMIGO?</span>
          </div>
          <p className="text-[11px] ink-dim mt-2 leading-relaxed">
            A aba <b className="gold">DÚVIDAS</b> continua sendo o seu canal direto. Se quiser, marque a dúvida
            como referente a uma destas frentes — chega até mim já com o contexto.
          </p>
          <button className="btn-3d-soft w-full mt-2.5 py-2 text-[10px] font-bold tracking-[0.1em] gold">
            ABRIR MINHAS DÚVIDAS
          </button>
        </div>
      </div>
    </div>
  );
}
