import "./_group.css";
import { useId } from "react";
import { MARCADORES, JANELAS, julgar, pct, parNum, dataBR, mesBR, type Veredito } from "./_dados";
import { Sparkline } from "./_shared/Sparkline";

/* ============================================================
   O ELO — Motor de Causalidade Clínica (visão do médico)
   Cruza ADERÊNCIA (o que o paciente fez) com MARCADOR (o que o
   corpo respondeu) e emite um veredito por janela entre exames.
   Dados reais: cliente 44, exam_results, leitura de 14/08/2026.
   ============================================================ */

const CORV: Record<Veredito, { txt: string; hex: string; led: string; chip: string }> = {
  favoravel:    { txt: "A FAVOR",       hex: "#5fc79a", led: "paxter-led-green", chip: "bevel-3d-ok" },
  desfavoravel: { txt: "CONTRA",        hex: "#e8837f", led: "paxter-led-red",   chip: "bevel-3d" },
  estavel:      { txt: "SEM MUDANÇA",   hex: "#8ea6c6", led: "paxter-led-off",   chip: "bevel-3d" },
  sem_veredito: { txt: "SEM FAIXA",     hex: "#c9a86a", led: "paxter-led-amber", chip: "bevel-3d" },
};

function diasEntre(a: string, b: string) {
  return Math.round((+new Date(b + "T00:00:00") - +new Date(a + "T00:00:00")) / 86400000);
}

function Elo({ idx }: { idx: number }) {
  const gid = useId(); // gradiente SVG unico por instancia (evita colisao de url(#...))
  const m = MARCADORES[idx];
  const n = m.serie.length;
  const de = m.serie[n - 2];
  const para = m.serie[n - 1];
  const v = julgar(m.direcao, de.valor, para.valor, m.refLow, m.refHigh);
  const c = CORV[v];
  const p = pct(de.valor, para.valor);
  const jan = JANELAS[JANELAS.length - 1];
  const dias = diasEntre(de.data, para.data);

  return (
    <div className="panel-3d-sub p-4">
      {/* ZONA 1 — top bar */}
      <div className="flex items-center gap-2 pb-3">
        <span className={`paxter-led ${c.led} ${v !== "estavel" ? "paxter-led-breathe" : ""}`} />
        <span className="text-[10px] tracking-[0.18em] ink-dim font-semibold">ELO Nº {idx + 1}</span>
        <span className="ml-auto text-[10px] tracking-[0.14em] font-bold px-2 py-1 rounded"
              style={{ color: c.hex, background: "rgba(0,0,0,.28)", border: `1px solid ${c.hex}55` }}>
          {c.txt}
        </span>
      </div>

      {/* ZONA 2 — a cadeia causal */}
      <div className="grid grid-cols-[1fr_auto_1.35fr] items-stretch gap-0">
        {/* elo A — o que o paciente FEZ */}
        <div className="concave-3d p-3 flex flex-col justify-center">
          <div className="text-[9px] tracking-[0.16em] ink-faint font-semibold">O QUE FOI FEITO</div>
          <div className="elo-serif tabnum leading-none gold mt-1" style={{ fontSize: 40, fontWeight: 700 }}>
            {jan.aderencia}<span style={{ fontSize: 20 }}>%</span>
          </div>
          <div className="text-[10px] ink-dim tabnum mt-1">
            {jan.dosesTomadas} de {jan.dosesPrevistas} doses
          </div>
        </div>

        {/* o ELO propriamente dito */}
        <div className="flex items-center px-1" aria-hidden>
          <svg width="62" height="70">
            <defs>
              <linearGradient id={gid} x1="0" x2="1">
                <stop offset="0%" stopColor="#b8924d" />
                <stop offset="100%" stopColor={c.hex} />
              </linearGradient>
            </defs>
            <path d="M2,35 H60" stroke={`url(#${gid})`} strokeWidth="2" fill="none" className="elo-flow" />
            <circle cx="31" cy="35" r="11" fill="#0e2038" stroke={`url(#${gid})`} strokeWidth="1.6" />
            <path d="M26,35 a5,5 0 0,1 5,-5 h0 a5,5 0 0,1 0,10 h0"
                  fill="none" stroke={c.hex} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M36,35 a5,5 0 0,0 -5,5 h0 a5,5 0 0,0 0,-10 h0"
                  fill="none" stroke="#d9b978" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M55,31 l5,4 l-5,4" fill="none" stroke={c.hex} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* elo B — o que o CORPO respondeu */}
        <div className="screen-3d p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[9px] tracking-[0.16em] ink-faint font-semibold">O QUE O CORPO RESPONDEU</div>
              <div className="text-[12px] font-semibold text-[#e9eef6] truncate mt-0.5">{m.nome}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="elo-serif tabnum leading-none" style={{ fontSize: 26, fontWeight: 700, color: c.hex }}>
                {p > 0 ? "+" : "−"}{Math.abs(p).toFixed(1).replace(".", ",")}%
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-1.5 tabnum">
            <span className="elo-serif" style={{ fontSize: 19, color: "#8ea6c6" }}>
              {parNum(de.valor, para.valor)[0]}
            </span>
            <span className="ink-faint text-xs">→</span>
            <span className="elo-serif" style={{ fontSize: 24, fontWeight: 700, color: "#e9eef6" }}>
              {parNum(de.valor, para.valor)[1]}
            </span>
            <span className="text-[10px] ink-dim">{m.unidade}</span>
          </div>
          <div className="mt-1">
            <Sparkline m={m} w={250} h={50} stroke={c.hex} />
          </div>
          <div className="flex justify-between text-[9px] ink-faint tabnum mt-0.5">
            <span>{mesBR(m.serie[0].data)}</span>
            <span>{mesBR(para.data)}</span>
          </div>
        </div>
      </div>

      {/* ZONA 3 — a janela e a frase */}
      <div className="mt-3 concave-3d px-3 py-2">
        <div className="flex items-center gap-3 text-[10px] ink-faint tabnum">
          <span>JANELA</span>
          <span className="gold-dim">{dataBR(de.data)} → {dataBR(para.data)}</span>
          <span className="ml-auto">{dias} dias</span>
        </div>
        <p className="elo-serif mt-1.5 leading-snug" style={{ fontSize: 15, color: "#dbe6f5" }}>
          {v === "favoravel"
            ? <>Na mesma janela em que houve <b className="gold">{jan.aderencia}%</b> de constância, <b>{m.nome}</b> moveu-se <b style={{ color: c.hex }}>a favor</b>. Associação temporal — a leitura clínica é sua.</>
            : v === "desfavoravel"
            ? <><b>{m.nome}</b> moveu-se <b style={{ color: c.hex }}>contra</b> numa janela de <b className="gold">{jan.aderencia}%</b> de constância. Vale investigar.</>
            : v === "sem_veredito"
            ? <><b>{m.nome}</b> não tem faixa de referência completa no catálogo. O motor <b style={{ color: c.hex }}>não emite veredito</b> — prefere calar a fingir.</>
            : <><b>{m.nome}</b> ficou <b style={{ color: c.hex }}>sem mudança</b> mensurável na janela.</>}
        </p>
      </div>
    </div>
  );
}

export function PainelElo() {
  const vereditos = MARCADORES.map((m) => {
    const n = m.serie.length;
    return julgar(m.direcao, m.serie[n - 2].valor, m.serie[n - 1].valor, m.refLow, m.refHigh);
  });
  const favs = vereditos.filter((v) => v === "favoravel").length;

  return (
    <div className="elo-root p-7">
      {/* ---------- CABEÇALHO ---------- */}
      <div className="panel-3d-hero px-6 py-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="bevel-3d-gold w-12 h-12 rounded-md grid place-items-center shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12a3 3 0 0 1 3-3h1a3 3 0 0 1 0 6h-1" stroke="#f0dcae" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M15 12a3 3 0 0 1-3 3h-1a3 3 0 0 1 0-6h1" stroke="#f0dcae" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="elo-serif leading-none" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "0.02em", color: "#f2e6c9" }}>
              O ELO
            </h1>
            <div className="text-[11px] tracking-[0.26em] ink-dim font-semibold mt-1">
              MOTOR DE CAUSALIDADE CLÍNICA
            </div>
          </div>
          <div className="ml-auto flex gap-3">
            {[
              { r: "PACIENTE", v: "CAIO H. F. PADUA" },
              { r: "ELOS ATIVOS", v: `${MARCADORES.length}` },
              { r: "A FAVOR", v: `${favs} de ${MARCADORES.length}` },
            ].map((k) => (
              <div key={k.r} className="concave-3d px-3 py-2 text-center min-w-[112px]">
                <div className="text-[9px] tracking-[0.14em] ink-faint font-semibold">{k.r}</div>
                <div className="elo-serif tabnum mt-0.5" style={{ fontSize: 16, fontWeight: 600, color: "#e9eef6" }}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="faixa-gold mt-4" />
        <p className="text-[12px] ink-dim mt-3 leading-relaxed max-w-4xl">
          O sistema já guarda <b className="gold">o que foi prescrito</b> e já guarda <b className="gold">o que o corpo fez</b>.
          O ELO acrescenta a peça que faltava — <b className="gold">o que o paciente realmente cumpriu</b> — e põe as três
          coisas na mesma linha do tempo. A cada laudo novo que o robô do Drive importa, cada elo é recalculado sozinho.
        </p>
        <div className="concave-3d mt-3 px-3 py-2 flex items-start gap-2">
          <span className="paxter-led paxter-led-amber paxter-led-breathe mt-0.5 shrink-0" />
          <p className="text-[11px] ink-dim leading-snug">
            <b className="gold">O ELO mede coincidência no tempo, não prova causa.</b> Duas coletas não estabelecem
            relação causal. O motor entrega a medida alinhada; quem interpreta é o médico.
          </p>
        </div>
      </div>

      {/* ---------- OS ELOS ---------- */}
      <div className="grid grid-cols-2 gap-5">
        {MARCADORES.map((_, i) => <Elo key={i} idx={i} />)}
      </div>

      {/* ---------- RODAPÉ: de onde vem cada peça ---------- */}
      <div className="panel-3d px-6 py-4 mt-5">
        <div className="text-[10px] tracking-[0.2em] gold-dim font-semibold mb-3">PEÇAS REAPROVEITADAS — NADA FOI RECRIADO</div>
        <div className="grid grid-cols-5 gap-3">
          {[
            { t: "Motor de lembrete", d: "cron por período, 9 janelas", pronto: true },
            { t: "Exames longitudinais", d: "23.245 resultados, 593 datas", pronto: true },
            { t: "Direção do marcador", d: "sabe se subir é bom ou ruim", pronto: true },
            { t: "Avatar de voz", d: "narra o elo na voz do médico", pronto: true },
            { t: "Aderência por dose", d: "a única peça a construir", pronto: false },
          ].map((x) => (
            <div key={x.t} className={`${x.pronto ? "concave-3d" : "bevel-3d-gold paxter-neon-breathe"} px-3 py-2.5`}>
              <div className="flex items-center gap-1.5">
                <span className={`paxter-led ${x.pronto ? "paxter-led-green" : "paxter-led-amber paxter-led-on"}`} />
                <span className="text-[11px] font-semibold text-[#e9eef6]">{x.t}</span>
              </div>
              <div className="text-[10px] ink-faint mt-1 leading-tight">{x.d}</div>
              <div className="text-[9px] tracking-[0.12em] font-bold mt-1.5"
                   style={{ color: x.pronto ? "#5fc79a" : "#f0dcae" }}>
                {x.pronto ? "JÁ EXISTE" : "A CONSTRUIR"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
