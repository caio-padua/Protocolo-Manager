import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Gauge, LineChart as IconeGrafico, Maximize2, Minimize2, Table2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PulsoNiveisDialog } from "./PulsoNiveisDialog";
import { nivelGlicemia, nivelPressao } from "./pulso-faixas";
import { Numeral } from "@/components/numeral/Numeral";
import {
  OPCOES, PulsoDiarioHistorico, diasDa, inicioJanela, noPeriodo, resumo, rotuloJanela, usePulso30,
  type Janela, type Pulso,
} from "./PulsoDiarioCompacto";

// Pulso Diário em janela ancorada no topo (mesmo padrão das avaliações): altura fixa, maximizável.
// Duas abas: Gráficos (para mostrar ao cliente na consulta) e Tabela (dia a dia).

const mediaDe = (v: Array<number | null>): number | null => {
  const x = v.filter((n): n is number => n != null);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

function diasDaJanela(dias: number): string[] {
  const [a, m, d] = inicioJanela(dias).split("-").map(Number);
  return Array.from({ length: dias }, (_, i) => new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10));
}

type Linha = { key: string; nome: string; cor: string; corEscura: string };
type Grafico = {
  id: string; titulo: string; unidade: string; dominio: [number | "auto", number | "auto"]; linhas: Linha[];
  refs: Array<{ y: number; rotulo: string }>; nota?: string;
};
const GRAFICOS: Grafico[] = [
  { id: "pressao", titulo: "Pressão arterial", unidade: "mmHg", dominio: [50, "auto"],
    linhas: [{ key: "sis", nome: "Sistólica", cor: "#16294a", corEscura: "#9db8e6" }, { key: "dia", nome: "Diastólica", cor: "#b8924d", corEscura: "#e0c47a" }],
    refs: [{ y: 130, rotulo: "130" }, { y: 80, rotulo: "80" }], nota: "Tracejadas: meta de 130/80 da medida em casa" },
  { id: "glicemia", titulo: "Glicemia de jejum", unidade: "mg/dL", dominio: ["auto", "auto"],
    linhas: [{ key: "glicemia", nome: "Glicemia", cor: "#a5702f", corEscura: "#e6b072" }],
    refs: [{ y: 100, rotulo: "100" }, { y: 126, rotulo: "126" }], nota: "Tracejadas: 100 (nível alto) e 126 (nível muito alto)" },
  { id: "bem", titulo: "Energia, disposição e sono", unidade: "0 a 10", dominio: [0, 10],
    linhas: [{ key: "energia", nome: "Energia", cor: "#b8924d", corEscura: "#e0c47a" }, { key: "disposicao", nome: "Disposição", cor: "#2f7a45", corEscura: "#6fcf8f" }, { key: "sono", nome: "Sono", cor: "#16294a", corEscura: "#9db8e6" }],
    refs: [] },
  { id: "fc", titulo: "Frequência cardíaca", unidade: "bpm", dominio: [40, "auto"],
    linhas: [{ key: "fc", nome: "Frequência", cor: "#b4413c", corEscura: "#f0877f" }],
    refs: [{ y: 60, rotulo: "60" }, { y: 100, rotulo: "100" }], nota: "Tracejadas: faixa de repouso de 60 a 100" },
];

function Grafico({ g, dados, escuro }: { g: Grafico; dados: Array<Record<string, number | string | null>>; escuro: boolean }) {
  const tinta = escuro ? "#f7eedb" : "#16294a";
  const grade = escuro ? "rgba(224,196,122,.18)" : "rgba(184,146,77,.28)";
  const tem = g.linhas.some((l) => dados.some((d) => d[l.key] != null));
  return (
    <section className="panel-3d-sub p-3" aria-label={g.titulo}>
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="bevel-3d inline-block px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">{g.titulo}</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.unidade}</span>
      </header>
      {tem ? (
        <div className="h-[190px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados} margin={{ top: 8, right: 14, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={grade} strokeDasharray="2 4" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: tinta }} stroke={grade} interval="preserveStartEnd" minTickGap={18} />
              <YAxis domain={g.dominio} tick={{ fontSize: 10, fill: tinta }} stroke={grade} width={44} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: escuro ? "#101f39" : "#f7f0df", border: `1px solid ${grade}`, borderRadius: 4, fontSize: 12, color: tinta }}
                labelStyle={{ fontWeight: 700 }}
                formatter={(v: number, nome: string) => [Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }), nome]} />
              {g.refs.map((r) => <ReferenceLine key={r.y} y={r.y} stroke={tinta} strokeOpacity={0.45} strokeDasharray="5 4" />)}
              {g.linhas.map((l) => (
                <Line key={l.key} type="monotone" dataKey={l.key} name={l.nome} stroke={escuro ? l.corEscura : l.cor}
                  strokeWidth={2.4} dot={{ r: 2.6 }} activeDot={{ r: 4.5 }} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="concave-3d flex h-[190px] items-center justify-center text-sm text-muted-foreground">Sem registros nesta janela.</div>
      )}
      {g.linhas.length > 1 && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold" aria-label="Legenda">
          {g.linhas.map((l) => (
            <li key={l.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-[3px] w-4 rounded-sm" style={{ background: escuro ? l.corEscura : l.cor }} />{l.nome}
            </li>
          ))}
        </ul>
      )}
      {g.nota && <p className="mt-1 text-[10px] text-muted-foreground">{g.nota}</p>}
    </section>
  );
}

export function PulsoDiarioModal({ clientId, clienteNome, aberto, janela, onJanela, escuro, onClose }: {
  clientId: number; clienteNome: string; aberto: boolean; janela: Janela; onJanela: (j: Janela) => void; escuro: boolean; onClose: () => void;
}) {
  const [aba, setAba] = useState<"graficos" | "tabela">("graficos");
  const [maximizado, setMaximizado] = useState(false);
  const [niveis, setNiveis] = useState(false);
  const { data } = usePulso30(clientId);
  const dias = diasDa(janela);

  const dados = useMemo(() => {
    const lista = noPeriodo(data ?? [], dias);
    const porDia = new Map<string, Pulso[]>();
    for (const x of lista) porDia.set(x.data, [...(porDia.get(x.data) ?? []), x]);
    return diasDaJanela(dias).map((dia) => {
      const l = porDia.get(dia) ?? [];
      return {
        rotulo: dataCurta(dia),
        sis: mediaDe(l.map((x) => x.pressaoSistolica)), dia: mediaDe(l.map((x) => x.pressaoDiastolica)),
        glicemia: mediaDe(l.map((x) => x.glicemia)), energia: mediaDe(l.map((x) => x.energia)),
        disposicao: mediaDe(l.map((x) => x.disposicao)), sono: mediaDe(l.map((x) => x.sono)), fc: mediaDe(l.map((x) => x.frequenciaCardiaca)),
      };
    });
  }, [data, dias]);
  const r = useMemo(() => resumo(noPeriodo(data ?? [], dias)), [data, dias]);
  const nums = useMemo(() => {
    const l = noPeriodo(data ?? [], dias);
    return { s: mediaDe(l.map((x) => x.pressaoSistolica)), d: mediaDe(l.map((x) => x.pressaoDiastolica)), g: mediaDe(l.map((x) => x.glicemia)) };
  }, [data, dias]);
  const medias: Array<[string, string, string | null]> = [
    ["Energia", "0 a 10", r.energia], ["Disposição", "0 a 10", r.disposicao], ["Sono", "0 a 10", r.sono],
    ["Pressão", "mmHg", r.pa], ["Freq. cardíaca", "bpm", r.fc], ["Glicemia", "mg/dL", r.glicemia],
  ];
  const botao = (v: "graficos" | "tabela", rotulo: string, I: typeof Table2) => (
    <button type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
      className={`${aba === v ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/70"} inline-flex h-9 items-center gap-1.5 px-4 text-[10px] font-black uppercase tracking-widest`}>
      <I className="h-3.5 w-3.5" /> {rotulo}
    </button>
  );
  if (!aberto) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setMaximizado(false); onClose(); } }}>
      <DialogContent
        className={`${escuro ? "dark " : ""}panel-3d !top-[3vh] !translate-y-0 flex flex-col gap-0 overflow-hidden border-none p-0 text-foreground transition-[width,max-width,height] duration-200 ${
          maximizado ? "h-[94vh] w-[98vw] max-w-none" : "h-[min(92vh,820px)] w-[min(96vw,1040px)] max-w-none"
        }`}
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 pl-5 pr-24">
          <span className="concave-3d flex h-10 w-10 shrink-0 items-center justify-center text-primary"><Activity className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black uppercase leading-tight tracking-wide">Pulso diário</DialogTitle>
            <DialogDescription className="truncate text-xs text-muted-foreground">
              {clienteNome} · Como o cliente se sente e o que mede em casa, dia a dia.
            </DialogDescription>
          </div>
          <button type="button" onClick={() => setMaximizado((m) => !m)} aria-pressed={maximizado}
            aria-label={maximizado ? "Restaurar tamanho" : "Maximizar"} title={maximizado ? "Restaurar tamanho" : "Maximizar"}
            className="btn-3d-soft absolute right-12 top-3 flex h-8 w-8 items-center justify-center">
            {maximizado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
          <div role="tablist" className="flex gap-2">
            {botao("graficos", "Gráficos", IconeGrafico)}
            {botao("tabela", "Tabela", Table2)}
            <button type="button" onClick={() => setNiveis(true)} title="Mostrar os níveis de pressão e glicemia ao cliente"
              className="btn-3d-soft inline-flex h-9 items-center gap-1.5 px-4 text-[10px] font-black uppercase tracking-widest">
              <Gauge className="h-3.5 w-3.5" /> Níveis
            </button>
          </div>
          <div role="radiogroup" aria-label="Janela da média" className="flex flex-wrap gap-2">
            {OPCOES.map((o) => (
              <button key={String(o.valor)} type="button" role="radio" aria-checked={janela === o.valor} title={o.desc}
                onClick={() => onJanela(o.valor)}
                className={`${janela === o.valor ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/70"} h-9 px-3 text-[10px] font-black uppercase tracking-widest`}>
                {o.valor === "diretriz" ? "Diretriz · 7 dias" : rotuloJanela(o.valor)}
              </button>
            ))}
          </div>
        </div>
        <section className="mx-5 mt-3 panel-3d-sub px-4 py-3" aria-label={`Médias dos últimos ${dias} dias`}>
          <header className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-[11px] font-black uppercase tracking-[.16em] text-primary">Média dos últimos {dias} dias</h3>
            <p className="text-[11px] text-muted-foreground">
              {r.n} {r.n === 1 ? "registro" : "registros"} somados
              {janela === "diretriz" ? " · padrão das diretrizes para pressão medida em casa" : ""}
            </p>
          </header>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {medias.map(([rot, un, val]) => (
              <div key={rot} className="text-center">
                <p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-foreground/80">{rot}</p>
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{un}</p>
                <p className="concave-3d py-1.5 text-lg font-bold">{val == null ? "—" : <Numeral peso={700}>{val}</Numeral>}</p>
              </div>
            ))}
          </div>
        </section>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
          {aba === "graficos" ? (
            <div className={`grid gap-4 ${maximizado ? "lg:grid-cols-2" : "md:grid-cols-2"}`}>
              {GRAFICOS.map((g) => <Grafico key={g.id} g={g} dados={dados} escuro={escuro} />)}
            </div>
          ) : (
            <PulsoDiarioHistorico clientId={clientId} janela={janela} naModal onNiveis={() => setNiveis(true)} />
          )}
        </div>
      </DialogContent>
      <PulsoNiveisDialog aberto={niveis} escuro={escuro} onClose={() => setNiveis(false)}
        mediaPA={r.pa} mediaGlicemia={r.glicemia} janelaTexto={`${dias} dias`}
        nivelPA={nivelPressao(nums.s, nums.d)} nivelGlicemia={nivelGlicemia(nums.g)} />
    </Dialog>
  );
}
