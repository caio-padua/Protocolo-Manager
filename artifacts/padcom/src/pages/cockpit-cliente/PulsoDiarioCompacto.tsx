import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronDown } from "lucide-react";
import { Numeral } from "@/components/numeral/Numeral";
import { BASE } from "@/pages/comunicacao/_shared";

// Pulso Diário no cockpit: um botão da mesma altura dos demais (médias do último mês)
// e, ao clicar, a tabela com o histórico de dias e períodos. Dado ausente = traço, nunca zero.

export type Pulso = {
  id: number;
  data: string;
  periodo: string;
  energia: number | null;
  disposicao: number | null;
  sono: number | null;
  pressaoSistolica: number | null;
  pressaoDiastolica: number | null;
  frequenciaCardiaca: number | null;
  glicemia: number | null;
  origem: string;
};

const ORDEM_PERIODO: Record<string, number> = { manha: 0, tarde: 1, noite: 2 };
const NOME_PERIODO: Record<string, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };

type Tom = "ok" | "atencao" | "alto" | "neutro";
const tomPressao = (s: number | null, d: number | null): Tom =>
  s == null && d == null ? "neutro" : (s ?? 0) >= 160 || (d ?? 0) >= 100 ? "alto" : (s ?? 0) >= 140 || (d ?? 0) >= 90 ? "atencao" : "ok";
const tomGlicemia = (g: number | null): Tom => (g == null ? "neutro" : g >= 126 ? "alto" : g >= 100 ? "atencao" : "ok");

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (iso: string) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const ptBr = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function media(valores: Array<number | null>, casas: 0 | 1): string | null {
  const v = valores.filter((x): x is number => x != null);
  if (!v.length) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return casas === 0 ? String(Math.round(m)) : ptBr.format(m);
}

export const hojeBrt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export function inicioJanela(dias: number): string {
  const [a, m, d] = hojeBrt().split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d - (dias - 1)));
  return x.toISOString().slice(0, 10);
}
export const noPeriodo = (l: Pulso[], dias: number) => { const ini = inicioJanela(dias); return l.filter((x) => x.data >= ini); };
export function resumo(l: Pulso[]) {
  const sis = media(l.map((x) => x.pressaoSistolica), 0), dia = media(l.map((x) => x.pressaoDiastolica), 0);
  return {
    energia: media(l.map((x) => x.energia), 1), disposicao: media(l.map((x) => x.disposicao), 1), sono: media(l.map((x) => x.sono), 1),
    pa: sis && dia ? `${sis}/${dia}` : null, fc: media(l.map((x) => x.frequenciaCardiaca), 0), glicemia: media(l.map((x) => x.glicemia), 0), n: l.length,
  };
}
export type Janela = "diretriz" | 7 | 15 | 30;
export const DIAS_DIRETRIZ = 7;
export const diasDa = (j: Janela) => (j === "diretriz" ? DIAS_DIRETRIZ : j);
export const rotuloJanela = (j: Janela) => (j === "diretriz" ? "Diretriz" : `${j} dias`);
export const OPCOES: Array<{ valor: Janela; nome: string; desc?: string }> = [
  { valor: "diretriz", nome: "Diretriz · 7 dias", desc: "Padrão das diretrizes médicas para pressão medida em casa: média de 7 dias. Aplicada a todos os indicadores do painel." },
  { valor: 7, nome: "7 dias" },
  { valor: 15, nome: "15 dias" },
  { valor: 30, nome: "30 dias" },
];

export function usePulso30(clientId: number) {
  return useQuery<Pulso[]>({
    queryKey: ["pulso-diario", clientId, 30],
    queryFn: async ({ signal }) => {
      const r = await fetch(`${BASE}/api/pulso-diario/${clientId}?dias=30`, { signal });
      if (!r.ok) throw new Error("Falha ao carregar o pulso diário.");
      return r.json();
    },
    retry: false,
  });
}

function Valor({ v, tom = "neutro" }: { v: string | null; tom?: Tom }) {
  if (v == null) return <span className="cc-pulso-cel cc-pulso-vazio" aria-label="sem registro">—</span>;
  return <span className="cc-pulso-cel" data-tom={tom}><Numeral peso={700}>{v}</Numeral></span>;
}

/** Botão do Pulso Diário (médias) + mini menu da janela, lado a lado e da mesma altura dos demais. */
export function PulsoDiarioBotao({ clientId, aberto, onToggle, janela, onJanela }: {
  clientId: number; aberto: boolean; onToggle: () => void; janela: Janela; onJanela: (j: Janela) => void;
}) {
  const { data, isLoading, isError } = usePulso30(clientId);
  const dias = diasDa(janela);
  const m = useMemo(() => resumo(noPeriodo(data ?? [], dias)), [data, dias]);
  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  // O menu sai do fluxo (portal + posição fixa) para nunca ficar por baixo dos painéis seguintes.
  const alvo = caixa.current?.closest<HTMLElement>(".cc-shell") ?? document.body;
  useEffect(() => {
    if (!menu) return;
    const r = chip.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    const fecha = () => setMenu(false);
    window.addEventListener("scroll", fecha, true);
    window.addEventListener("resize", fecha);
    return () => { window.removeEventListener("scroll", fecha, true); window.removeEventListener("resize", fecha); };
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!caixa.current?.contains(t) && !popup.current?.contains(t)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const itens: Array<[string, string | null]> = [
    ["Energia", m.energia], ["Disposição", m.disposicao], ["Sono", m.sono], ["Pressão", m.pa], ["Freq.", m.fc], ["Glicemia", m.glicemia],
  ];
  return (
    <div className="cc-pulso-wrap" ref={caixa}>
      <button type="button" className="cc-context-button cc-pulso-botao" data-active={aberto}
        aria-expanded={aberto} aria-controls="cc-pulso-historico" onClick={onToggle}>
        <Activity size={15} aria-hidden="true" />
        <span className="cc-pulso-botao-rotulo"><strong>PULSO DIÁRIO</strong>
          <small>{isError ? "Indisponível" : isLoading ? "Carregando" : m.n ? `${dias} dias · ${m.n} ${m.n === 1 ? "registro" : "registros"}` : `Sem registros nos ${dias} dias`}</small></span>
        {!isError && !isLoading && m.n > 0 && (
          <span className="cc-pulso-medias" aria-label={`Médias dos últimos ${dias} dias`}>
            {itens.map(([rot, val]) => (
              <span key={rot} className="cc-pulso-media"><small>{rot}</small><b>{val == null ? "—" : <Numeral peso={700}>{val}</Numeral>}</b></span>
            ))}
          </span>
        )}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <button ref={chip} type="button" className="cc-context-button cc-pulso-chip" aria-haspopup="menu" aria-expanded={menu}
        aria-label={`Janela da média: ${rotuloJanela(janela)}`} onClick={() => setMenu((x) => !x)}>
        <span><strong>{rotuloJanela(janela).toUpperCase()}</strong><small>Janela</small></span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {menu && pos && createPortal(
        <div ref={popup} className="cc-pulso cc-pulso-menu" role="menu" aria-label="Janela da média" style={{ top: pos.top, right: pos.right }}>
          <p className="cc-pulso-menu-titulo">JANELA DA MÉDIA</p>
          {OPCOES.map((o) => (
            <button key={String(o.valor)} type="button" role="menuitemradio" aria-checked={janela === o.valor}
              className="cc-pulso-opcao" title={o.desc}
              onClick={() => { onJanela(o.valor); setMenu(false); }}>
              <span>{o.nome}</span>
              {o.desc && <small className="cc-pulso-opcao-desc">{o.desc}</small>}
            </button>
          ))}
        </div>
      ,
        alvo,
      )}
    </div>
  );
}

/** Tabela do histórico: um dia por bloco, uma linha por período registrado. */
export function PulsoDiarioHistorico({ clientId, janela, naModal = false }: { clientId: number; janela: Janela; naModal?: boolean }) {
  const { data, isLoading, isError, refetch } = usePulso30(clientId);
  const dias = diasDa(janela);
  const linhas = useMemo(
    () => noPeriodo(data ?? [], dias).sort((a, b) => (a.data === b.data ? ORDEM_PERIODO[a.periodo] - ORDEM_PERIODO[b.periodo] : a.data < b.data ? 1 : -1)),
    [data, dias],
  );
  const r = useMemo(() => resumo(linhas), [linhas]);
  // Mês > dia > períodos (mais recente primeiro): cada dia é um bloco só.
  const meses = useMemo(() => {
    const out: Array<{ chave: string; nome: string; dias: Array<{ data: string; itens: Pulso[] }> }> = [];
    for (const l of linhas) {
      const chave = l.data.slice(0, 7);
      let mes = out[out.length - 1];
      if (!mes || mes.chave !== chave) {
        mes = { chave, nome: `${MESES[Number(chave.slice(5)) - 1]} de ${chave.slice(0, 4)}`, dias: [] };
        out.push(mes);
      }
      const dia = mes.dias[mes.dias.length - 1];
      if (dia && dia.data === l.data) dia.itens.push(l); else mes.dias.push({ data: l.data, itens: [l] });
    }
    return out;
  }, [linhas]);
  const demo = linhas.some((l) => l.origem === "demo");
  return (
    <section id="cc-pulso-historico" className={`cc-pulso${naModal ? " cc-pulso-modal" : ""}`} aria-label="Histórico do pulso diário">
      <header className="cc-pulso-topo">
        <span className="cc-pulso-titulo"><Activity size={12} aria-hidden="true" /> HISTÓRICO · {rotuloJanela(janela).toUpperCase()} ({dias} DIAS)</span>
        <span className="cc-pulso-estado">{demo && <em title="Parte dos dados é fictícia">DEMONSTRAÇÃO</em>}{linhas.length} registros</span>
      </header>
      {isError ? (
        <p className="cc-pulso-msg" role="alert">Não foi possível consultar o pulso diário. <button type="button" onClick={() => void refetch()}>Tentar novamente</button></p>
      ) : isLoading ? (
        <p className="cc-pulso-msg" role="status">Carregando…</p>
      ) : !linhas.length ? (
        <p className="cc-pulso-msg">Sem registros nos últimos {dias} dias.</p>
      ) : (
        <div className="cc-pulso-rolagem">
          <table className="cc-pulso-tabela">
            <thead><tr>
              {([["Dia", ""], ["Período", ""], ["Energia", "0 a 10"], ["Disposição", "0 a 10"], ["Sono", "0 a 10"], ["Pressão", "mmHg"], ["Freq. cardíaca", "bpm"], ["Glicemia", "mg/dL"]] as const).map(([t, u]) => (
                <th key={t} scope="col"><span>{t}</span>{u && <small>{u}</small>}</th>
              ))}
            </tr></thead>
            <tbody>
              {meses.map((mes) => (
                <Fragment key={mes.chave}>
                  <tr className="cc-pulso-mes"><th colSpan={8} scope="colgroup">
                    <span>{mes.nome}</span><em>{mes.dias.length} {mes.dias.length === 1 ? "dia" : "dias"} · {mes.dias.reduce((n, d) => n + d.itens.length, 0)} registros</em>
                  </th></tr>
                  {mes.dias.map((dia, di) => dia.itens.map((l, i) => {
                    const pa = l.pressaoSistolica != null || l.pressaoDiastolica != null ? `${l.pressaoSistolica ?? "—"}/${l.pressaoDiastolica ?? "—"}` : null;
                    return (
                      <tr key={l.id} className="cc-pulso-linha" data-zebra={di % 2} data-inicio={i === 0}>
                        {i === 0 && (
                          <th scope="rowgroup" rowSpan={dia.itens.length} className="cc-pulso-dia" title={dataBr(dia.data)}>
                            <b><Numeral peso={800}>{dia.data.slice(8)}</Numeral></b><small>{SEMANA[diaSemana(dia.data)]}</small>
                          </th>
                        )}
                        <td className="cc-pulso-per">{NOME_PERIODO[l.periodo] ?? l.periodo}</td>
                        <td><Valor v={l.energia == null ? null : String(l.energia)} /></td>
                        <td><Valor v={l.disposicao == null ? null : String(l.disposicao)} /></td>
                        <td><Valor v={l.sono == null ? null : String(l.sono)} /></td>
                        <td><Valor v={pa} tom={tomPressao(l.pressaoSistolica, l.pressaoDiastolica)} /></td>
                        <td><Valor v={l.frequenciaCardiaca == null ? null : String(l.frequenciaCardiaca)} /></td>
                        <td><Valor v={l.glicemia == null ? null : String(l.glicemia)} tom={tomGlicemia(l.glicemia)} /></td>
                      </tr>
                    );
                  }))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="cc-pulso-nota">Energia, disposição e sono de 0 a 10 · pressão em mmHg · frequência em bpm · glicemia em mg/dL</p>
    </section>
  );
}
