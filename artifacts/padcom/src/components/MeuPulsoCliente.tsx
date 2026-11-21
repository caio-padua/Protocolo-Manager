import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle, Loader2, Moon, Sun, Sunrise } from "lucide-react";
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

/** Linha do tempo simples (sem biblioteca): pontos por dia, com a faixa "normal" sombreada. */
function Linha({ titulo, unidade, series, faixa }: {
  titulo: string; unidade: string; series: Array<{ nome: string; cor: string; pontos: Array<number | null> }>; faixa?: [number, number];
}) {
  const todos = series.flatMap((s) => s.pontos).filter((n): n is number => n != null);
  if (todos.length < 2) return (
    <div className="concave-3d rounded-lg px-4 py-4 text-center text-xs text-muted-foreground">{titulo}: ainda não há registros suficientes para o gráfico.</div>
  );
  const lo = Math.min(...todos, faixa?.[0] ?? Infinity) - 5, hi = Math.max(...todos, faixa?.[1] ?? -Infinity) + 5;
  const W = 300, H = 90, n = series[0]!.pontos.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 10) + 5);
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo)) * (H - 12);
  return (
    <figure className="panel-3d-sub px-3 py-2.5">
      <figcaption className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-black uppercase tracking-[.14em] text-primary">{titulo}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{unidade}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Gráfico de ${titulo}`}>
        {faixa && <rect x="0" y={y(faixa[1])} width={W} height={Math.max(0, y(faixa[0]) - y(faixa[1]))} fill="var(--n-n)" opacity=".13" />}
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
      <p className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        {series.map((s) => <span key={s.nome} className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: s.cor }} />{s.nome}</span>)}
        {faixa && <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm opacity-40" style={{ background: "var(--n-n)" }} />faixa normal</span>}
      </p>
    </figure>
  );
}

const CAMPOS_NOTA = [["energia", "Energia"], ["disposicao", "Disposição"], ["sono", "Sono"]] as const;

export default function MeuPulsoCliente({ token }: { token: string }) {
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
    <div className="pn-escopo space-y-4" data-testid="meu-pulso">
      <header className="panel-3d overflow-hidden rounded-xl px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="concave-3d flex h-11 w-11 shrink-0 items-center justify-center text-primary"><Activity className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-black uppercase leading-tight tracking-wide">Meu pulso</h2>
            <p className="text-xs text-muted-foreground">Seu dia a dia em números. Registre como você está e veja em que nível cada medida se encontra.</p>
          </div>
        </div>
      </header>

      {/* Painel congelado: acompanha a rolagem logo abaixo da faixa superior */}
      <section className="panel-3d-sub sticky z-20 px-3 py-2.5" style={{ top: "var(--paxter-topbar-h, 0px)" }} aria-label={`Médias dos últimos ${dias} dias`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-black uppercase tracking-[.16em] text-primary">Média dos últimos {dias} dias</h3>
          <div role="radiogroup" aria-label="Período da média" className="flex gap-1.5">
            {JANELAS.map((j) => (
              <button key={j} type="button" role="radio" aria-checked={dias === j} onClick={() => setDias(j)}
                className={`${dias === j ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/70"} h-7 px-2.5 text-[10px] font-black uppercase tracking-widest`}>{j} dias</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {cartoes.map(([rot, un, val, nivel]) => (
            <div key={rot} className="text-center">
              <p className="text-[9px] font-extrabold uppercase tracking-[.08em] text-foreground/80">{rot}</p>
              <p className="mb-0.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">{un}</p>
              <p className="concave-3d py-1 text-base font-bold">{val == null ? "—" : <Numeral peso={700}>{val}</Numeral>}</p>
              <p className="mt-1 h-4">{nivel ? <span className="pn-chip" data-nivel={nivel}>{NOME_NIVEL[nivel]}</span> : null}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-3d-sub px-4 py-3" aria-label="Registrar agora">
        <h3 className="mb-2 text-[11px] font-black uppercase tracking-[.16em] text-primary">Registrar agora</h3>
        <div role="radiogroup" aria-label="Período do dia" className="mb-3 flex gap-2">
          {PERIODOS.map(({ id, nome, Icone }) => (
            <button key={id} type="button" role="radio" aria-checked={periodo === id} onClick={() => setPeriodo(id)}
              className={`${periodo === id ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/70"} inline-flex h-9 flex-1 items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest`}>
              <Icone className="h-3.5 w-3.5" aria-hidden="true" />{nome}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {([["sis", "Pressão máxima", "ex.: 120"], ["dia", "Pressão mínima", "ex.: 80"], ["fc", "Freq. cardíaca (bpm)", "ex.: 70"], ["gli", "Glicemia (mg/dL)", "ex.: 92"]] as const).map(([k, rot, ph]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-foreground/80">{rot}</span>
              <input inputMode="numeric" pattern="[0-9]*" maxLength={3} value={f[k]} placeholder={ph}
                onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value.replace(/\D/g, "") }))}
                className="concave-3d h-10 w-full bg-transparent px-3 text-center text-base font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/60" />
            </label>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {CAMPOS_NOTA.map(([k, rot]) => (
            <div key={k}>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-foreground/80">{rot} <span className="font-semibold normal-case tracking-normal text-muted-foreground">(0 = muito mal, 10 = excelente)</span></p>
              <div role="radiogroup" aria-label={rot} className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, i) => (
                  <button key={i} type="button" role="radio" aria-checked={notas[k] === i} onClick={() => setNotas((p) => ({ ...p, [k]: p[k] === i ? null : i }))}
                    className={`${notas[k] === i ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/80"} h-8 text-xs font-black`}>{i}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => void enviar()} disabled={enviando || !periodo}
          className="btn-3d mt-4 flex h-11 w-full items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-60">
          {enviando ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando</> : "Salvar meu registro"}
        </button>
        {resultado && (
          <p role={resultado.ok ? "status" : "alert"} className={`mt-2 flex items-center gap-1.5 text-xs ${resultado.ok ? "text-emerald-600" : "text-destructive"}`}>
            {resultado.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}{resultado.texto}
          </p>
        )}
        <p className="mt-2 text-[10.5px] text-muted-foreground">Preencha só o que você mediu. Ao salvar de novo no mesmo período, o que já estava registrado é mantido.</p>
      </section>

      <ReguasNiveis mediaPA={m.pa} mediaGlicemia={inteiro(m.g)} nivelPA={m.nPA} nivelGlicemia={m.nG} janelaTexto={`${dias} dias`} />

      <div className="grid gap-3">
        <Linha titulo="Pressão por dia" unidade="mmHg" faixa={[LIMITES.pressao.baixa.d, LIMITES.pressao.alta.s - 1]}
          series={[{ nome: "Máxima", cor: "#1e40af", pontos: porDia.map((d) => d.sis) }, { nome: "Mínima", cor: "#0891b2", pontos: porDia.map((d) => d.dias) }]} />
        <Linha titulo="Glicemia por dia" unidade="mg/dL" faixa={[LIMITES.glicemia.baixa, LIMITES.glicemia.alta - 1]}
          series={[{ nome: "Glicemia", cor: "#d97706", pontos: porDia.map((d) => d.gli) }]} />
      </div>

      <section className="panel-3d-sub px-3 py-3" aria-label="Meus registros">
        <h3 className="mb-2 px-1 text-[11px] font-black uppercase tracking-[.16em] text-primary">Meus registros</h3>
        {historico.length === 0 ? (
          <p className="concave-3d rounded-lg px-4 py-4 text-center text-xs text-muted-foreground">Nenhum registro neste período. Use "Registrar agora" acima.</p>
        ) : (
          <ul className="space-y-2.5">
            {historico.map(({ dia, reg }) => (
              <li key={dia} className="flex gap-2.5">
                <div className="bevel-3d flex w-14 shrink-0 flex-col items-center justify-center rounded-md py-1.5 text-primary">
                  <span className="text-[9px] font-black uppercase tracking-widest">{diaSemana(dia)}</span>
                  <span className="text-lg font-black leading-none"><Numeral peso={800}>{dataCurta(dia)}</Numeral></span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {PERIODOS.map(({ id, nome, Icone }) => {
                    const r = reg.find((x) => x.periodo === id);
                    if (!r) return null;
                    return (
                      <div key={id} className="concave-3d flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2.5 py-1.5 text-xs">
                        <span className="inline-flex w-16 items-center gap-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><Icone className="h-3 w-3" aria-hidden="true" />{nome}</span>
                        <span className="inline-flex items-center gap-1"><small className="text-[9px] uppercase text-muted-foreground">PA</small>
                          <Medida v={r.pressaoSistolica != null && r.pressaoDiastolica != null ? `${r.pressaoSistolica}/${r.pressaoDiastolica}` : null} nivel={nivelPressao(r.pressaoSistolica, r.pressaoDiastolica)} /></span>
                        <span className="inline-flex items-center gap-1"><small className="text-[9px] uppercase text-muted-foreground">Gli</small>
                          <Medida v={r.glicemia == null ? null : String(r.glicemia)} nivel={nivelGlicemia(r.glicemia)} /></span>
                        <span className="inline-flex items-center gap-1"><small className="text-[9px] uppercase text-muted-foreground">FC</small>
                          <Medida v={r.frequenciaCardiaca == null ? null : String(r.frequenciaCardiaca)} nivel={null} /></span>
                        <span className="inline-flex items-center gap-1"><small className="text-[9px] uppercase text-muted-foreground">Ene/Dis/Sono</small>
                          <Medida v={[r.energia, r.disposicao, r.sono].every((x) => x == null) ? null : [r.energia, r.disposicao, r.sono].map((x) => (x == null ? "–" : x)).join(" · ")} nivel={null} /></span>
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
