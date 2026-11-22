import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle, Loader2, Moon, Sun, Sunrise } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PainelPulso } from "@/pages/cockpit-cliente/PainelPulso";
import { Numeral } from "@/components/numeral/Numeral";
import { ReguasNiveis } from "@/pages/cockpit-cliente/ReguasNiveis";
import { BotaoAjuda, BotaoAjudaComJanela } from "@/pages/cockpit-cliente/BotaoAjuda";
import { EscalaDialog, SIGNIFICADO } from "@/pages/cockpit-cliente/NotaDialog";
import { AjudaPainelDialog } from "@/pages/cockpit-cliente/AjudaPainelDialog";
import { GraficoZonas, type PontoGrafico, type ZonaGrafico } from "@/pages/cockpit-cliente/GraficoZonas";
import { LIMITES, NIVEIS, nivelFrequencia, nivelGlicemia, nivelPressao, type Nivel } from "@/pages/cockpit-cliente/pulso-faixas";
import "@/pages/cockpit-cliente/pulso-niveis.css";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Reg = {
  data: string; periodo: "manha" | "tarde" | "noite"; energia: number | null; libido: number | null; sono: number | null;
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

const COR_NIVEL = { muitobaixo: "#1e40af", baixo: "#0891b2", normal: "#15803d", alto: "#d97706", muitoalto: "#dc2626" } as const;
/** Cinco faixas coloridas do fundo do gráfico, a partir dos limites oficiais (fonte única: pulso-faixas). */
const zonasDe = (cortes: [number, number, number, number]): ZonaGrafico[] => {
  const [a, b, c, d] = cortes;
  return [
    { key: "muitobaixo", name: "Muito baixo", color: COR_NIVEL.muitobaixo, low: null, high: a },
    { key: "baixo", name: "Baixo", color: COR_NIVEL.baixo, low: a, high: b },
    { key: "normal", name: "Normal", color: COR_NIVEL.normal, low: b, high: c },
    { key: "alto", name: "Alto", color: COR_NIVEL.alto, low: c, high: d },
    { key: "muitoalto", name: "Muito alto", color: COR_NIVEL.muitoalto, low: d, high: null },
  ];
};
const P = LIMITES.pressao, G = LIMITES.glicemia;
const ZONAS_SIS = zonasDe([P.muitoBaixa.s, P.baixa.s, P.alta.s, P.muitoAlta.s]);
const ZONAS_DIA = zonasDe([P.muitoBaixa.d, P.baixa.d, P.alta.d, P.muitoAlta.d]);
const F = LIMITES.frequencia;
const ZONAS_FC: ZonaGrafico[] = [
  { key: "baixo", name: "Baixa", color: COR_NIVEL.baixo, low: null, high: F.baixa },
  { key: "normal", name: "Normal", color: COR_NIVEL.normal, low: F.baixa, high: F.alta },
  { key: "alto", name: "Alta", color: COR_NIVEL.alto, low: F.alta, high: null },
];
const ZONAS_GLI = zonasDe([G.muitoBaixa, G.baixa, G.alta, G.muitoAlta]);
/** Notas de 0 a 10 (mesma escala da janela "como dar a nota"). */
const ZONAS_NOTA: ZonaGrafico[] = [
  { key: "n1", name: "Muito mal", color: "#dc2626", low: null, high: 3 }, { key: "n2", name: "Ruim", color: "#d97706", low: 3, high: 5 },
  { key: "n3", name: "Regular", color: "#ca8a04", low: 5, high: 7 }, { key: "n4", name: "Bom", color: "#65a30d", low: 7, high: 9 },
  { key: "n5", name: "Ótimo", color: "#15803d", low: 9, high: null },
];

const ZONAS_LIBIDO: ZonaGrafico[] = [
  { key: "l1", name: "Muito baixa", color: "#dc2626", low: null, high: 3 }, { key: "l2", name: "Baixa", color: "#d97706", low: 3, high: 5 },
  { key: "l3", name: "Moderada", color: "#ca8a04", low: 5, high: 7 }, { key: "l4", name: "Boa", color: "#65a30d", low: 7, high: 9 },
  { key: "l5", name: "Alta", color: "#15803d", low: 9, high: null },
];
const CAMPOS_NOTA = [["energia", "Energia"], ["libido", "Libido"], ["sono", "Sono"]] as const;

/** Data de hoje e período do dia no fuso de São Paulo (usado quando o consultório abre o pulso de um cliente). */
const agoraSP = (): { hoje: string; periodoAgora: Reg["periodo"] } => {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  return { hoje, periodoAgora: h < 12 ? "manha" : h < 18 ? "tarde" : "noite" };
};

/** Pulso do cliente. Na Área do Cliente usa o token do próprio cliente; no cockpit (clienteId) é a MESMA tela, só leitura e em grade ampla. */
export default function MeuPulsoCliente({ token = "", clienteId, escuro = false }: { token?: string; clienteId?: number; escuro?: boolean }) {
  const consultorio = clienteId != null;
  const [escala, setEscala] = useState<string | null>(null);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [dias, setDias] = useState<(typeof JANELAS)[number]>(7);
  const [periodo, setPeriodo] = useState<Reg["periodo"] | null>(null);
  const [f, setF] = useState({ sis: "", dia: "", fc: "", gli: "" });
  const [notas, setNotas] = useState<{ energia: number | null; libido: number | null; sono: number | null }>({ energia: null, libido: null, sono: null });
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = consultorio
        ? await fetch(`${API_BASE}/api/pulso-diario/${clienteId}?dias=60`)
        : await fetch(`${API_BASE}/api/area-paciente/pulso-diario?dias=60`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(r.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar o pulso.");
      const bruto = await r.json();
      const d = (consultorio ? { ...agoraSP(), registros: bruto as Reg[] } : bruto) as Dados;
      setDados(d); setErro("");
      setPeriodo((p) => p ?? d.periodoAgora);
    } catch (e) { setErro((e as Error).message); }
  }, [token, clienteId, consultorio]);
  useEffect(() => { void carregar(); }, [carregar]);

  const janela = useMemo(() => {
    if (!dados) return [] as Reg[];
    const ini = somaDias(dados.hoje, -(dias - 1));
    return dados.registros.filter((r) => r.data >= ini);
  }, [dados, dias]);
  const m = useMemo(() => {
    const s = media(janela.map((r) => r.pressaoSistolica)), d = media(janela.map((r) => r.pressaoDiastolica)), g = media(janela.map((r) => r.glicemia)), f = media(janela.map((r) => r.frequenciaCardiaca));
    return {
      energia: media(janela.map((r) => r.energia)), libido: media(janela.map((r) => r.libido)), sono: media(janela.map((r) => r.sono)),
      fc: media(janela.map((r) => r.frequenciaCardiaca)), s, d, g,
      pa: s != null && d != null ? `${Math.round(s)} / ${Math.round(d)}` : null,
      nPA: nivelPressao(s == null ? null : Math.round(s), d == null ? null : Math.round(d)), nG: nivelGlicemia(g == null ? null : Math.round(g)),
      nFC: nivelFrequencia(f == null ? null : Math.round(f)),
    };
  }, [janela]);

  const porDia = useMemo(() => {
    if (!dados) return [];
    const dd: string[] = [];
    for (let i = dias - 1; i >= 0; i--) dd.push(somaDias(dados.hoje, -i));
    return dd.map((dia) => {
      const l = janela.filter((r) => r.data === dia);
      return { dia, sis: media(l.map((r) => r.pressaoSistolica)), dias: media(l.map((r) => r.pressaoDiastolica)), gli: media(l.map((r) => r.glicemia)), fc: media(l.map((r) => r.frequenciaCardiaca)),
        en: media(l.map((r) => r.energia)), li: media(l.map((r) => r.libido)), so: media(l.map((r) => r.sono)), reg: l };
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
      setF({ sis: "", dia: "", fc: "", gli: "" }); setNotas({ energia: null, libido: null, sono: null });
      await carregar();
    } catch (e) { setResultado({ ok: false, texto: (e as Error).message }); }
    finally { setEnviando(false); }
  };

  if (erro && !dados) return (
    <div className="concave-3d flex items-center gap-2 rounded-lg px-4 py-4 text-sm text-destructive" role="alert"><AlertCircle className="h-4 w-4 shrink-0" />{erro}</div>
  );
  if (!dados) return <div className="flex justify-center py-12 text-muted-foreground" role="status"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const dataGrafico = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a!.slice(2)}`; };
  const serie = (f: (d: (typeof porDia)[number]) => number | null): PontoGrafico[] =>
    porDia.flatMap((d) => { const v = f(d); return v == null ? [] : [{ iso: d.dia, data: dataGrafico(d.dia), valor: Math.round(v * 10) / 10 }]; });

  const cartoes: Array<[string, string, string | null, Nivel | null]> = [
    ["Energia", "0 a 10", um(m.energia), null], ["Libido", "0 a 10", um(m.libido), null], ["Sono", "0 a 10", um(m.sono), null],
    ["Pressão", "mmHg", m.pa, m.nPA], ["Freq. card.", "bpm", inteiro(m.fc), m.nFC], ["Glicemia", "mg/dL", inteiro(m.g), m.nG],
  ];

  return (
    <div className={`pn-escopo pn-pagina space-y-7${escuro ? " dark" : ""}`} data-testid="meu-pulso">
      {!consultorio && <header className="panel-3d-sub pn-painel flex items-center gap-3">
        <span className="btn-3d-soft pn-mini !h-11 !w-11 shrink-0"><Activity className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-black uppercase leading-tight tracking-wide">Meu pulso</h2>
          <p className="text-xs" style={{ color: "var(--pn-mudo)" }}>Seu dia a dia em números. Registre como você está e veja em que nível cada medida se encontra.</p>
        </div>
      </header>}

      {/* Painel congelado: acompanha a rolagem logo abaixo da faixa superior */}
      <PainelPulso className={consultorio ? "" : "sticky z-20"} style={consultorio ? undefined : { top: "calc(var(--paxter-topbar-h, 0px) + 8px)" }}
        titulo={`Média dos últimos ${dias} dias`} rotulo={`Médias dos últimos ${dias} dias`}
        canto={<AjudaPainelDialog titulo="Média dos últimos dias" escuro={escuro}>
          <p>Cada quadro é a média de tudo o que foi registrado no período escolhido (7, 15, 30 ou 60 dias).</p>
          <p>A etiqueta colorida abaixo mostra em que nível a média está: muito baixo, baixo, normal, alto ou muito alto.</p>
          <p>Energia, Libido e Sono são notas de 0 a 10. Pressão, frequência e glicemia são medidas.</p>
        </AjudaPainelDialog>}>
        <div role="radiogroup" aria-label="Período da média" className="mb-3 flex gap-1.5">
          {JANELAS.map((j) => (
            <button key={j} type="button" role="radio" aria-checked={dias === j} onClick={() => setDias(j)}
              className={`pn-sel ${dias === j ? "concave-3d text-primary" : "bevel-3d text-muted-foreground/95"} h-[26px] flex-1 text-[10px] font-black uppercase tracking-widest`}>{j} dias</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6">
          {cartoes.map(([rot, un, val, nivel]) => (
            <div key={rot} className="text-center">
              <p className="whitespace-nowrap text-[9px] font-extrabold uppercase tracking-[.08em]">{rot}</p>
              <p className="mb-1 text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--pn-mudo)" }}>{un}</p>
              <p className="pn-medida !block w-full py-1 text-base font-bold">{val == null ? "—" : <Numeral peso={700}>{val}</Numeral>}</p>
              <p className="mt-1.5 min-h-[26px]">{nivel ? <span className="bevel-3d pn-chip" data-nivel={nivel}>{NOME_NIVEL[nivel]}</span> : null}</p>
            </div>
          ))}
        </div>
      </PainelPulso>

      {!consultorio && (
      <PainelPulso titulo="Registrar agora" rotulo="Registrar agora">
        <div role="radiogroup" aria-label="Período do dia" className="mb-3 flex gap-2">
          {PERIODOS.map(({ id, nome, Icone }) => (
            <button key={id} type="button" role="radio" aria-checked={periodo === id} onClick={() => setPeriodo(id)}
              className={`pn-sel ${periodo === id ? "concave-3d text-primary" : "bevel-3d text-muted-foreground/95"} inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest`}>
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
          <BotaoAjudaComJanela tipo="pressao" rotulo="Pressão arterial" escuro={escuro} />
        </div>
        <div className="pn-linha">
          <div className="pn-linha-rotulo"><b>Frequência cardíaca</b><small>Batimentos por minuto (bpm).</small></div>
          <div className="pn-campos um">
            <input className="pn-campo" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="70" aria-label="Frequência cardíaca" value={f.fc}
              onChange={(e) => setF((p) => ({ ...p, fc: e.target.value.replace(/\D/g, "") }))} />
          </div>
          <BotaoAjudaComJanela tipo="frequencia" rotulo="Frequência cardíaca" escuro={escuro} />
        </div>
        <div className="pn-linha">
          <div className="pn-linha-rotulo"><b>Glicemia</b><small>Em mg/dL, de preferência em jejum.</small></div>
          <div className="pn-campos um">
            <input className="pn-campo" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="92" aria-label="Glicemia" value={f.gli}
              onChange={(e) => setF((p) => ({ ...p, gli: e.target.value.replace(/\D/g, "") }))} />
          </div>
          <BotaoAjudaComJanela tipo="glicemia" rotulo="Glicemia" escuro={escuro} />
        </div>

        {CAMPOS_NOTA.map(([k, rot]) => (
          <div key={k} className="pn-grupo-notas">
            <div className="pn-notas-cab">
              <span className="pn-notas-tit"><b>{rot}</b><i className="pn-apelido">{SIGNIFICADO[k]!.apelido}</i></span>
              <span className="ml-auto text-[11px]" style={{ color: "var(--pn-mudo)" }}>{notas[k] == null ? "toque na nota" : <>nota <Numeral peso={700}>{String(notas[k])}</Numeral></>}</span>
              <BotaoAjuda aberto={escala === k} onClick={() => setEscala((e) => (e === k ? null : k))} rotulo={rot} />
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
      )}

      <ReguasNiveis mediaPA={m.pa} mediaGlicemia={inteiro(m.g)} nivelPA={m.nPA} nivelGlicemia={m.nG} mediaFC={inteiro(m.fc)} nivelFC={m.nFC} janelaTexto={`${dias} dias`} escuro={escuro} grade={consultorio} />

      <div className={consultorio ? "grid gap-7 xl:grid-cols-2" : "space-y-7"}>
      <GraficoZonas titulo="Pressão máxima (sistólica)" ajuda="pressao" escuro={escuro} unidade="mmHg" referencia={`normal ${P.baixa.s} a ${P.alta.s - 1}`} pontos={serie((d) => d.sis)} zonas={ZONAS_SIS} />
      <GraficoZonas titulo="Pressão mínima (diastólica)" ajuda="pressao" escuro={escuro} unidade="mmHg" referencia={`normal ${P.baixa.d} a ${P.alta.d - 1}`} pontos={serie((d) => d.dias)} zonas={ZONAS_DIA} />
      <GraficoZonas titulo="Glicemia" ajuda="glicemia" escuro={escuro} unidade="mg/dL" referencia={`normal ${G.baixa} a ${G.alta - 1}`} pontos={serie((d) => d.gli)} zonas={ZONAS_GLI} />
      <GraficoZonas titulo="Frequência cardíaca" ajuda="frequencia" escuro={escuro} unidade="bpm" referencia={`normal ${F.baixa} a ${F.alta - 1}`} pontos={serie((d) => d.fc)} zonas={ZONAS_FC} />
      <GraficoZonas titulo="Energia" ajuda="energia" escuro={escuro} unidade="nota 0 a 10" pontos={serie((d) => d.en)} zonas={ZONAS_NOTA} dominioFixo={[0, 10]} />
      <GraficoZonas titulo="Libido" ajuda="libido" escuro={escuro} unidade="nota 0 a 10" pontos={serie((d) => d.li)} zonas={ZONAS_LIBIDO} dominioFixo={[0, 10]} />
      <GraficoZonas titulo="Sono" ajuda="sono" escuro={escuro} unidade="nota 0 a 10" pontos={serie((d) => d.so)} zonas={ZONAS_NOTA} dominioFixo={[0, 10]} />
      </div>

      <PainelPulso titulo={consultorio ? "Registros do cliente" : "Meus registros"} rotulo="Registros"
        canto={<AjudaPainelDialog titulo="Registros" escuro={escuro}>
          <p>Cada dia mostra três linhas: manhã, tarde e noite.</p>
          <p>Em "Sinais vitais" ficam a pressão, a glicemia e a frequência cardíaca. Em "Qualidade de vida" ficam as notas de energia, libido e sono.</p>
          <p>O contorno colorido de um valor indica o nível dele. Traço significa que nada foi registrado naquele período.</p>
        </AjudaPainelDialog>}>
        {historico.length === 0 ? (
          <p className="py-3 text-center text-xs" style={{ color: "var(--pn-mudo)" }}>{consultorio ? "Nenhum registro neste período." : "Nenhum registro neste período. Use \"Registrar agora\" acima."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="pn-tab">
              <colgroup><col style={{ width: "11%" }} /><col style={{ width: "15%" }} /><col style={{ width: "17.5%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10.5%" }} /><col style={{ width: "10.5%" }} /><col style={{ width: "10.5%" }} /></colgroup>
              <thead>
                <tr className="grupo">
                  <th rowSpan={2} className="cab-dia">Dia</th><th rowSpan={2} className="cab-per">Período</th>
                  <th colSpan={3}><span className="bevel-3d pn-grupo-rot">Sinais vitais</span></th>
                  <th colSpan={3}><span className="bevel-3d pn-grupo-rot">Qualidade de vida</span></th>
                </tr>
                <tr className="sub"><th>Pressão</th><th>Glic.</th><th>FC</th><th>Ener.</th><th>Lib.</th><th>Sono</th></tr>
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
                      <td className="per"><span className="pn-per"><Icone size={12} aria-hidden="true" />{nome}</span></td>
                      <td>{r && r.pressaoSistolica != null && r.pressaoDiastolica != null
                        ? <Medida v={`${r.pressaoSistolica} / ${r.pressaoDiastolica}`} nivel={nivelPressao(r.pressaoSistolica, r.pressaoDiastolica)} /> : <span className="vazio">—</span>}</td>
                      <td>{r && r.glicemia != null ? <Medida v={String(r.glicemia)} nivel={nivelGlicemia(r.glicemia)} /> : <span className="vazio">—</span>}</td>
                      <td>{r && r.frequenciaCardiaca != null ? <Medida v={String(r.frequenciaCardiaca)} nivel={nivelFrequencia(r.frequenciaCardiaca)} /> : <span className="vazio">—</span>}</td>
                      <td>{nota(r?.energia)}</td>
                      <td>{nota(r?.libido)}</td>
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
