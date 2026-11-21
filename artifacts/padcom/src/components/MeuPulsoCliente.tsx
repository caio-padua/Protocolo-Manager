import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle, HelpCircle, Loader2, Moon, Sun, Sunrise } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PainelPulso } from "@/pages/cockpit-cliente/PainelPulso";
import { Numeral } from "@/components/numeral/Numeral";
import { ReguasNiveis } from "@/pages/cockpit-cliente/ReguasNiveis";
import { LIMITES, NIVEIS, nivelGlicemia, nivelPressao, type Nivel } from "@/pages/cockpit-cliente/pulso-faixas";
import "@/pages/cockpit-cliente/pulso-niveis.css";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Reg = {
  data: string; periodo: "manha" | "tarde" | "noite"; energia: number | null; disposicao: number | null; sono: number | null;
  pressaoSistolica: number | null; pressaoDiastolica: number | null; frequenciaCardiaca: number | null; glicemia: number | null; origem: string;
};
type Dados = { hoje: string; periodoAgora: Reg["periodo"]; registros: Reg[] };

const PERIODOS = [
  { id: "manha", nome: "Manhã", Icone: Sunrise }, { id: "tarde", nome: "Tarde", Icone: Sun }, { id: "noite", nome: "Noite", Icone: Moon },
] as const;
const JANELAS = [7, 15, 30, 60] as const;
const NOME_NIVEL = Object.fromEntries(NIVEIS.map((n) => [n.id, n.nome])) as Record<Nivel, string>;

const media = (v: Array<number | null>): number | null => {
  const x = v.filter((n): n is number => n != null);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};
const inteiro = (n: number | null) => (n == null ? null : String(Math.round(n)));
const um = (n: number | null) => (n == null ? null : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const somaDias = (iso: string, d: number) => { const [a, m, dia] = iso.split("-").map(Number); return new Date(Date.UTC(a!, m! - 1, dia! + d)).toISOString().slice(0, 10); };
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (iso: string) => { const [a, m, d] = iso.split("-").map(Number); return SEMANA[new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay()]; };

function Medida({ v, nivel }: { v: string | null; nivel: Nivel | null }) {
  if (v == null) return <span className="text-muted-foreground/60" aria-label="sem registro">—</span>;
  return <span className="pn-medida" data-nivel={nivel && nivel !== "normal" ? nivel : undefined} title={nivel ? NOME_NIVEL[nivel] : undefined}><Numeral peso={700}>{v}</Numeral></span>;
}

/** Linha do tempo simples (sem biblioteca): pontos por dia, datas embaixo e a faixa "normal" sombreada. */
function Linha({ titulo, unidade, datas, series, faixa }: {
  titulo: string; unidade: string; datas: string[]; series: Array<{ nome: string; cor: string; pontos: Array<number | null> }>; faixa?: [number, number];
}) {
  const todos = series.flatMap((s) => s.pontos).filter((n): n is number => n != null);
  const cab = <>{titulo} <span style={{ color: "var(--pn-mudo)", letterSpacing: ".08em" }}>· {unidade}</span></>;
  if (todos.length < 2) return (
    <PainelPulso titulo={cab}><p className="py-3 text-center text-xs" style={{ color: "var(--pn-mudo)" }}>Ainda não há registros suficientes para o gráfico.</p></PainelPulso>
  );
  const lo = Math.min(...todos, faixa?.[0] ?? Infinity) - 5, hi = Math.max(...todos, faixa?.[1] ?? -Infinity) + 5;
  const W = 320, H = 118, TOPO = 8, BASE = 24, ESQ = 30, DIR = 8, n = datas.length;
  const x = (i: number) => (n === 1 ? (ESQ + W - DIR) / 2 : ESQ + (i / (n - 1)) * (W - ESQ - DIR));
  const y = (v: number) => H - BASE - ((v - lo) / (hi - lo)) * (H - BASE - TOPO);
  const passo = Math.max(1, Math.ceil(n / 6));
  const ticks = datas.map((_, i) => i).filter((i) => (n - 1 - i) % passo === 0);
  const niveisY = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].map((v) => Math.round(v));
  return (
    <PainelPulso titulo={cab} rotulo={`Gráfico de ${titulo}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Gráfico de ${titulo} por dia`} style={{ color: "var(--pn-tinta)" }}>
        {faixa && <rect x={ESQ} y={y(faixa[1])} width={W - ESQ - DIR} height={Math.max(0, y(faixa[0]) - y(faixa[1]))} fill="var(--n-n)" opacity=".16" />}
        {niveisY.map((v) => (
          <g key={v}>
            <line x1={ESQ} x2={W - DIR} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".12" strokeDasharray="2 3" />
            <text x={ESQ - 4} y={y(v) + 3} textAnchor="end" fontSize="8.5" fill="currentColor" opacity=".7">{v}</text>
          </g>
        ))}
        <line x1={ESQ} x2={W - DIR} y1={H - BASE} y2={H - BASE} stroke="currentColor" opacity=".35" />
        {ticks.map((i) => (
          <g key={datas[i]}>
            <line x1={x(i)} x2={x(i)} y1={H - BASE} y2={H - BASE + 3} stroke="currentColor" opacity=".5" />
            <text x={x(i)} y={H - 8} textAnchor={i === n - 1 && n > 1 ? "end" : "middle"} fontSize="9" fill="currentColor" opacity=".85">{dataCurta(datas[i]!)}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.pontos.map((v, i) => (v == null ? null : [x(i), y(v)] as const));
          let ativo = false;
          const d = pts.map((p) => { if (!p) { ativo = false; return ""; } const t = `${ativo ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`; ativo = true; return t; }).join("");
          return (
            <g key={s.nome}>
              <path d={d} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (p ? <circle key={i} cx={p[0]} cy={p[1]} r="2.6" fill={s.cor} /> : null))}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px]" style={{ color: "var(--pn-mudo)" }}>
        {series.map((s) => <span key={s.nome} className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: s.cor }} />{s.nome}</span>)}
        {faixa && <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--n-n)", opacity: 0.5 }} />faixa normal</span>}
      </p>
    </PainelPulso>
  );
}

const ESCALA = [
  { de: 0, ate: 2, nome: "Muito mal", cor: "muitoalto" }, { de: 3, ate: 4, nome: "Ruim", cor: "alto" }, { de: 5, ate: 6, nome: "Regular", cor: "baixo" },
  { de: 7, ate: 8, nome: "Bom", cor: "normal" }, { de: 9, ate: 10, nome: "Ótimo", cor: "normal" },
] as const;
const SIGNIFICADO: Record<string, { nome: string; texto: string; zero: string; dez: string }> = {
  energia: { nome: "Energia", texto: "Quanta força você sente para fazer as coisas do dia.", zero: "Sem força nenhuma, sem conseguir fazer o básico.", dez: "Cheio de força, fazendo tudo sem cansar." },
  disposicao: { nome: "Disposição", texto: "Ânimo e vontade para começar e manter suas atividades.", zero: "Sem vontade de nada, tudo é um esforço.", dez: "Animado e com vontade de fazer as coisas." },
  sono: { nome: "Sono", texto: "Como foi a sua noite de sono.", zero: "Quase não dormi, acordei muito cansado.", dez: "Dormi a noite toda e acordei descansado." },
};

function EscalaDialog({ foco, escuro, onClose }: { foco: string | null; escuro: boolean; onClose: () => void }) {
  if (!foco) return null;
  const m = SIGNIFICADO[foco]!;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${escuro ? "dark " : ""}pn-escopo !top-[8vh] !translate-y-0 max-h-[84vh] w-[min(94vw,480px)] max-w-none overflow-y-auto border border-border bg-background p-5`} style={{ color: "var(--pn-tinta)" }}>
        <DialogTitle className="pr-8 text-base font-black uppercase tracking-wide">{m.nome}: como dar a nota</DialogTitle>
        <DialogDescription className="text-xs" style={{ color: "var(--pn-mudo)" }}>{m.texto} Use a nota que melhor descreve como você se sentiu.</DialogDescription>
        <ul className="mt-3 space-y-2">
          {ESCALA.map((e) => (
            <li key={e.nome} className="grid grid-cols-[84px_1fr] items-center gap-3">
              <span className="bevel-3d pn-chip text-center" data-nivel={e.cor}>{e.nome}</span>
              <span className="text-sm font-bold"><Numeral peso={700}>{`${e.de} a ${e.ate}`}</Numeral></span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 text-[12.5px] leading-relaxed">
          <div><dt className="inline font-bold">Nota 0: </dt><dd className="inline">{m.zero}</dd></div>
          <div><dt className="inline font-bold">Nota 10: </dt><dd className="inline">{m.dez}</dd></div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

const CAMPOS_NOTA = [["energia", "Energia"], ["disposicao", "Disposição"], ["sono", "Sono"]] as const;

export default function MeuPulsoCliente({ token, escuro = false }: { token: string; escuro?: boolean }) {
  const [escala, setEscala] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [dias, setDias] = useState<(typeof JANELAS)[number]>(7);
  const [periodo, setPeriodo] = useState<Reg["periodo"] | null>(null);
  const [f, setF] = useState({ sis: "", dia: "", fc: "", gli: "" });
  const [notas, setNotas] = useState<{ energia: number | null; disposicao: number | null; sono: number | null }>({ energia: null, disposicao: null, sono: null });
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/pulso-diario?dias=60`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(r.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar o seu pulso.");
      const d = (await r.json()) as Dados;
      setDados(d); setErro("");
      setPeriodo((p) => p ?? d.periodoAgora);
    } catch (e) { setErro((e as Error).message); }
  }, [token]);
  useEffect(() => { void carregar(); }, [carregar]);

  const janela = useMemo(() => {
    if (!dados) return [] as Reg[];
    const ini = somaDias(dados.hoje, -(dias - 1));
    return dados.registros.filter((r) => r.data >= ini);
  }, [dados, dias]);
  const m = useMemo(() => {
    const s = media(janela.map((r) => r.pressaoSistolica)), d = media(janela.map((r) => r.pressaoDiastolica)), g = media(janela.map((r) => r.glicemia));
    return {
      energia: media(janela.map((r) => r.energia)), disposicao: media(janela.map((r) => r.disposicao)), sono: media(janela.map((r) => r.sono)),
      fc: media(janela.map((r) => r.frequenciaCardiaca)), s, d, g,
      pa: s != null && d != null ? `${Math.round(s)}/${Math.round(d)}` : null,
      nPA: nivelPressao(s == null ? null : Math.round(s), d == null ? null : Math.round(d)), nG: nivelGlicemia(g == null ? null : Math.round(g)),
    };
  }, [janela]);

  const porDia = useMemo(() => {
    if (!dados) return [];
    const dd: string[] = [];
    for (let i = dias - 1; i >= 0; i--) dd.push(somaDias(dados.hoje, -i));
    return dd.map((dia) => {
      const l = janela.filter((r) => r.data === dia);
      return { dia, sis: media(l.map((r) => r.pressaoSistolica)), dias: media(l.map((r) => r.pressaoDiastolica)), gli: media(l.map((r) => r.glicemia)), reg: l };
    });
  }, [dados, dias, janela]);
  const historico = useMemo(() => [...porDia].reverse().filter((d) => d.reg.length > 0).slice(0, 30), [porDia]);

  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const enviar = async () => {
    setResultado(null);
    const body = {
      periodo, pressaoSistolica: num(f.sis), pressaoDiastolica: num(f.dia), frequenciaCardiaca: num(f.fc), glicemia: num(f.gli), ...notas,
    };
    if (Object.values(body).some((v) => typeof v === "number" && !Number.isInteger(v))) { setResultado({ ok: false, texto: "Use apenas números inteiros." }); return; }
    setEnviando(true);
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/pulso-diario`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(r.status === 401 ? "Só o próprio cliente pode registrar. Entre com seus dados." : j.error ?? "Não foi possível salvar.");
      setResultado({ ok: true, texto: "Registro salvo. Seus números já estão atualizados abaixo." });
      setF({ sis: "", dia: "", fc: "", gli: "" }); setNotas({ energia: null, disposicao: null, sono: null });
      await carregar();
    } catch (e) { setResultado({ ok: false, texto: (e as Error).message }); }
    finally { setEnviando(false); }
  };

  if (erro && !dados) return (
    <div className="concave-3d flex items-center gap-2 rounded-lg px-4 py-4 text-sm text-destructive" role="alert"><AlertCircle className="h-4 w-4 shrink-0" />{erro}</div>
  );
  if (!dados) return <div className="flex justify-center py-12 text-muted-foreground" role="status"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const cartoes: Array<[string, string, string | null, Nivel | null]> = [
    ["Energia", "0 a 10", um(m.energia), null], ["Disposição", "0 a 10", um(m.disposicao), null], ["Sono", "0 a 10", um(m.sono), null],
    ["Pressão", "mmHg", m.pa, m.nPA], ["Freq. cardíaca", "bpm", inteiro(m.fc), null], ["Glicemia", "mg/dL", inteiro(m.g), m.nG],
  ];

  return (
    <div className={`pn-escopo pn-pagina space-y-7${escuro ? " dark" : ""}`} data-testid="meu-pulso">
      <header className="panel-3d-sub pn-painel flex items-center gap-3">
        <span className="btn-3d-soft pn-mini !h-11 !w-11 shrink-0"><Activity className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-black uppercase leading-tight tracking-wide">Meu pulso</h2>
          <p className="text-xs" style={{ color: "var(--pn-mudo)" }}>Seu dia a dia em números. Registre como você está e veja em que nível cada medida se encontra.</p>
        </div>
      </header>

      {/* Painel congelado: acompanha a rolagem logo abaixo da faixa superior */}
      <PainelPulso className="sticky z-20" style={{ top: "calc(var(--paxter-topbar-h, 0px) + 8px)" }}
        titulo={`Média dos últimos ${dias} dias`} rotulo={`Médias dos últimos ${dias} dias`}>
        <div role="radiogroup" aria-label="Período da média" className="mb-3 flex gap-1.5">
          {JANELAS.map((j) => (
            <button key={j} type="button" role="radio" aria-checked={dias === j} onClick={() => setDias(j)}
              className={`${dias === j ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/70"} h-7 flex-1 text-[10px] font-black uppercase tracking-widest`}>{j} dias</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6">
          {cartoes.map(([rot, un, val, nivel]) => (
            <div key={rot} className="text-center">
              <p className="text-[9px] font-extrabold uppercase tracking-[.08em]">{rot}</p>
              <p className="mb-1 text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--pn-mudo)" }}>{un}</p>
              <p className="pn-medida !block w-full py-1 text-base font-bold">{val == null ? "—" : <Numeral peso={700}>{val}</Numeral>}</p>
              <p className="mt-1.5 h-4">{nivel ? <span className="bevel-3d pn-chip" data-nivel={nivel}>{NOME_NIVEL[nivel]}</span> : null}</p>
            </div>
          ))}
        </div>
      </PainelPulso>

      <PainelPulso titulo="Registrar agora" rotulo="Registrar agora">
        <div role="radiogroup" aria-label="Período do dia" className="mb-3 flex gap-2">
          {PERIODOS.map(({ id, nome, Icone }) => (
            <button key={id} type="button" role="radio" aria-checked={periodo === id} onClick={() => setPeriodo(id)}
              className={`${periodo === id ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/70"} inline-flex h-9 flex-1 items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest`}>
              <Icone className="h-3.5 w-3.5" aria-hidden="true" />{nome}
            </button>
          ))}
        </div>

        <div className="pn-linha">
          <div className="pn-linha-rotulo"><b>Pressão arterial</b><small>Os dois números do aparelho: o de cima (máxima) e o de baixo (mínima).</small></div>
          <div className="pn-campos dois">
            <input className="pn-campo" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="120" aria-label="Pressão máxima" value={f.sis}
              onChange={(e) => setF((p) => ({ ...p, sis: e.target.value.replace(/\D/g, "") }))} />
            <span className="barra" aria-hidden="true">/</span>
            <input className="pn-campo" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="80" aria-label="Pressão mínima" value={f.dia}
              onChange={(e) => setF((p) => ({ ...p, dia: e.target.value.replace(/\D/g, "") }))} />
          </div>
        </div>
        <div className="pn-linha">
          <div className="pn-linha-rotulo"><b>Frequência cardíaca</b><small>Batimentos por minuto (bpm).</small></div>
          <div className="pn-campos um">
            <input className="pn-campo" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="70" aria-label="Frequência cardíaca" value={f.fc}
              onChange={(e) => setF((p) => ({ ...p, fc: e.target.value.replace(/\D/g, "") }))} />
          </div>
        </div>
        <div className="pn-linha">
          <div className="pn-linha-rotulo"><b>Glicemia</b><small>Em mg/dL, de preferência em jejum.</small></div>
          <div className="pn-campos um">
            <input className="pn-campo" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="92" aria-label="Glicemia" value={f.gli}
              onChange={(e) => setF((p) => ({ ...p, gli: e.target.value.replace(/\D/g, "") }))} />
          </div>
        </div>

        {CAMPOS_NOTA.map(([k, rot]) => (
          <div key={k} className="pn-grupo-notas">
            <div className="pn-notas-cab">
              <b>{rot}</b>
              <button type="button" className="btn-3d-soft pn-mini" onClick={() => setEscala(k)} aria-label={`O que significa a nota de ${rot}`} title="O que significa cada nota">
                <HelpCircle size={14} aria-hidden="true" />
              </button>
              <span className="ml-auto text-[11px]" style={{ color: "var(--pn-mudo)" }}>{notas[k] == null ? "toque na nota" : <>nota <Numeral peso={700}>{String(notas[k])}</Numeral></>}</span>
            </div>
            <div role="radiogroup" aria-label={rot} className="pn-nota">
              {Array.from({ length: 11 }, (_, i) => (
                <button key={i} type="button" role="radio" aria-checked={notas[k] === i} onClick={() => setNotas((p) => ({ ...p, [k]: p[k] === i ? null : i }))}>{i}</button>
              ))}
            </div>
          </div>
        ))}

        <button type="button" onClick={() => void enviar()} disabled={enviando || !periodo}
          className="btn-3d mt-6 flex h-11 w-full items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-60">
          {enviando ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando</> : "Salvar meu registro"}
        </button>
        {resultado && (
          <p role={resultado.ok ? "status" : "alert"} className={`mt-3 flex items-center gap-1.5 text-xs ${resultado.ok ? "text-emerald-500" : "text-red-500"}`}>
            {resultado.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}{resultado.texto}
          </p>
        )}
        <p className="mt-3 text-[11px]" style={{ color: "var(--pn-mudo)" }}>Preencha só o que você mediu. Ao salvar de novo no mesmo período, o que já estava registrado é mantido.</p>
      </PainelPulso>

      <ReguasNiveis mediaPA={m.pa} mediaGlicemia={inteiro(m.g)} nivelPA={m.nPA} nivelGlicemia={m.nG} janelaTexto={`${dias} dias`} escuro={escuro} />

      <Linha titulo="Pressão por dia" unidade="mmHg" datas={porDia.map((d) => d.dia)} faixa={[LIMITES.pressao.baixa.d, LIMITES.pressao.alta.s - 1]}
        series={[{ nome: "Máxima", cor: "#3b6fd8", pontos: porDia.map((d) => d.sis) }, { nome: "Mínima", cor: "#0aa5c8", pontos: porDia.map((d) => d.dias) }]} />
      <Linha titulo="Glicemia por dia" unidade="mg/dL" datas={porDia.map((d) => d.dia)} faixa={[LIMITES.glicemia.baixa, LIMITES.glicemia.alta - 1]}
        series={[{ nome: "Glicemia", cor: "#e08a12", pontos: porDia.map((d) => d.gli) }]} />

      <PainelPulso titulo="Meus registros" rotulo="Meus registros">
        {historico.length === 0 ? (
          <p className="py-3 text-center text-xs" style={{ color: "var(--pn-mudo)" }}>Nenhum registro neste período. Use "Registrar agora" acima.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="pn-tab">
              <colgroup><col style={{ width: "17%" }} /><col style={{ width: "8%" }} /><col style={{ width: "19%" }} /><col style={{ width: "13%" }} /><col style={{ width: "10%" }} /><col style={{ width: "11%" }} /><col style={{ width: "11%" }} /><col style={{ width: "11%" }} /></colgroup>
              <thead>
                <tr><th>Dia</th><th aria-label="Período" /><th>Pressão</th><th>Glic.</th><th>FC</th><th>Ener.</th><th>Disp.</th><th>Sono</th></tr>
              </thead>
              <tbody>
                {historico.map(({ dia, reg }) => PERIODOS.map(({ id, nome, Icone }, idx) => {
                  const r = reg.find((x) => x.periodo === id);
                  const nota = (v: number | null | undefined) => (v == null ? <span className="vazio">—</span> : <Medida v={String(v)} nivel={null} />);
                  return (
                    <tr key={`${dia}-${id}`} className={idx === 2 ? "fim" : undefined}>
                      {idx === 0 && (
                        <td className="dia" rowSpan={3}>
                          <div className="pn-cal" data-hoje={dia === dados.hoje}>
                            <span className="pn-cal-faixa">{diaSemana(dia)}</span>
                            <b><Numeral peso={800}>{dia.slice(8)}</Numeral></b>
                            <i>{dia.slice(5, 7)}/{dia.slice(2, 4)}</i>
                          </div>
                        </td>
                      )}
                      <td className="per" title={nome}><Icone size={13} aria-label={nome} /></td>
                      <td>{r && r.pressaoSistolica != null && r.pressaoDiastolica != null
                        ? <Medida v={`${r.pressaoSistolica}/${r.pressaoDiastolica}`} nivel={nivelPressao(r.pressaoSistolica, r.pressaoDiastolica)} /> : <span className="vazio">—</span>}</td>
                      <td>{r && r.glicemia != null ? <Medida v={String(r.glicemia)} nivel={nivelGlicemia(r.glicemia)} /> : <span className="vazio">—</span>}</td>
                      <td>{nota(r?.frequenciaCardiaca)}</td>
                      <td>{nota(r?.energia)}</td>
                      <td>{nota(r?.disposicao)}</td>
                      <td>{nota(r?.sono)}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        )}
      </PainelPulso>
      <EscalaDialog foco={escala} escuro={escuro} onClose={() => setEscala(null)} />
    </div>
  );
}
