import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Search, Check, Compass, RotateCcw } from "lucide-react";
import { BASE } from "@/pages/comunicacao/_shared";

// ===========================================================================
// FERRAMENTA COMPARTILHADA: FAIXAS POR EXAME (direção + cortes editáveis)
//   Usada em DOIS lugares (decisão do CEO): na página /cadastros/direcao-exames
//   (menu Cadastros) e embutida no Cockpit. Mesma engrenagem, sem duplicar.
//
//   O QUE FAZ: lista TODOS os exames (curadoria + laudos reais), deixa buscar,
//   e edita, por exame: a DIREÇÃO (o que é "excelente") e as 5 FAIXAS com CORTE
//   (De/Até) editável + rótulo livre. Os cortes vêm pré-preenchidos por bom
//   senso médico (semente) — NÃO pelo laudo. A cor de cada faixa é semântica
//   (fixa por severidade e direção). A barra-prévia mostra as faixas na ordem do
//   valor e um "valor de teste" mostra em qual faixa ele cai.
//
//   Fonte da verdade:
//     GET /api/exames-lab/direcoes         -> lista de exames
//     GET /api/exames-lab/faixas?code=...  -> direção + zonas + min/max do laudo
//     PUT /api/exames-lab/faixas?code=...  -> grava direção + zonas
// ===========================================================================

const NAVY = "#16294a";
const GOLD = "#b8924d";
const MUTED = "#647c97";

type Direction = "higher_better" | "lower_better" | "target";

const DIRECTION_ROTULO: Record<Direction, string> = {
  higher_better: "Quanto MAIOR, melhor",
  lower_better: "Quanto MENOR, melhor",
  target: "Melhor no MEIO (alvo)",
};

// Paleta e rótulos-base das 5 zonas (espelha zones.ts do backend).
type ZoneLabel = "ALERTA" | "ATENCAO" | "INSUFICIENTE" | "ACEITAVEL" | "EXCELENTE";
const ZONE_COLOR: Record<ZoneLabel, string> = {
  ALERTA: "#b4413c",
  ATENCAO: "#c17a2b",
  INSUFICIENTE: "#d0a53f",
  ACEITAVEL: "#7a9a4a",
  EXCELENTE: "#3f7a3f",
};
const ZONE_ROTULO: Record<ZoneLabel, string> = {
  ALERTA: "ALERTA",
  ATENCAO: "ATENÇÃO",
  INSUFICIENTE: "INSUFICIENTE",
  ACEITAVEL: "ACEITÁVEL",
  EXCELENTE: "EXCELENTE",
};
// Ordem das 5 posições do MENOR valor ao MAIOR (below → t1 → t2 → t3 → above).
const FAIXAS_POR_DIRECAO: Record<Direction, ZoneLabel[]> = {
  higher_better: ["ALERTA", "INSUFICIENTE", "ACEITAVEL", "EXCELENTE", "ATENCAO"],
  lower_better: ["ATENCAO", "EXCELENTE", "ACEITAVEL", "INSUFICIENTE", "ALERTA"],
  target: ["ALERTA", "ACEITAVEL", "EXCELENTE", "ACEITAVEL", "ATENCAO"],
};

interface DirecaoItem {
  code: string;
  displayName: string;
  direction: Direction;
  grupo: string | null;
  count: number;
  hasDirection: boolean;
}

interface ZonaApi {
  key: string;
  name: string;
  color: string;
  low: number | null;
  high: number | null;
}
interface FaixasResp {
  analyteCode: string;
  displayName: string;
  direction: Direction;
  refLow: number | null;
  refHigh: number | null;
  hasOverride: boolean;
  zones: ZonaApi[] | null;
}

// Faixa editável na tela (5 slots fixos). A cor é derivada da direção+posição.
interface Slot {
  faixaName: string;
  low: number | null;
  high: number | null;
}

// pt-BR: "5,4" -> 5.4 ; "" -> null
function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function fmt(n: number | null): string {
  if (n === null) return "";
  return String(n).replace(".", ",");
}

// Cria 5 slots a partir da resposta da API (ou vazios com rótulo-base).
function slotsFromResp(resp: FaixasResp): Slot[] {
  const labels = FAIXAS_POR_DIRECAO[resp.direction];
  const out: Slot[] = [];
  for (let i = 0; i < 5; i++) {
    const z = resp.zones?.[i];
    out.push({
      faixaName: z?.name ?? ZONE_ROTULO[labels[i]],
      low: z?.low ?? null,
      high: z?.high ?? null,
    });
  }
  return out;
}

// Classifica um valor de teste na faixa (first-match [low,high), topo inclusivo).
function faixaDoValor(v: number | null, slots: Slot[]): number | null {
  if (v === null) return null;
  for (let i = 0; i < slots.length; i++) {
    const z = slots[i];
    const okLow = z.low === null || v >= z.low;
    const isLast = i === slots.length - 1;
    const okHigh = z.high === null || (isLast ? v <= z.high : v < z.high);
    if (okLow && okHigh) return i;
  }
  return null;
}

// Larguras proporcionais da barra-prévia (below/above fixos; meio proporcional).
function largurasPrevia(slots: Slot[]): number[] {
  const c0 = slots[0]?.high;
  const c1 = slots[1]?.high;
  const c2 = slots[2]?.high;
  const c3 = slots[3]?.high;
  const ok = [c0, c1, c2, c3].every((x) => x !== null && Number.isFinite(x));
  if (!ok || c0! >= c1! || c1! >= c2! || c2! >= c3!) {
    return [20, 20, 20, 20, 20];
  }
  const fixo = 12;
  const meio = 100 - 2 * fixo;
  const w1 = c1! - c0!;
  const w2 = c2! - c1!;
  const w3 = c3! - c2!;
  const soma = w1 + w2 + w3;
  return [fixo, (w1 / soma) * meio, (w2 / soma) * meio, (w3 / soma) * meio, fixo];
}

// Barra-prévia + leitura da faixa do valor atual (referência) ou do valor de teste.
function BarraFaixas({
  slots,
  direction,
  valor,
  fonte,
}: {
  slots: Slot[];
  direction: Direction;
  valor: number | null;
  fonte: "teste" | "ref" | "nenhum";
}) {
  const labels = FAIXAS_POR_DIRECAO[direction];
  const larguras = largurasPrevia(slots);
  const idx = faixaDoValor(valor, slots);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
        <span>menor valor</span>
        <span>maior valor</span>
      </div>
      <div className="flex gap-[2px]">
        {slots.map((s, i) => (
          <div
            key={i}
            className="min-w-0 rounded-[4px] px-1 py-2 text-center text-[8px] font-black uppercase leading-tight text-white"
            style={{
              width: `${larguras[i]}%`,
              background: ZONE_COLOR[labels[i]],
              outline: idx === i ? `2px solid ${GOLD}` : "none",
              outlineOffset: idx === i ? "1px" : undefined,
            }}
            title={s.faixaName}
          >
            <span className="block truncate">{s.faixaName}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[10px] font-semibold" style={{ color: MUTED }}>
        {fonte === "nenhum" || valor === null ? (
          <>Sem valor de referência para posicionar.</>
        ) : idx === null ? (
          <>
            {fonte === "ref" ? "O valor de referência" : "O valor de teste"}{" "}
            <b>{fmt(valor)}</b> não caiu em nenhuma faixa.
          </>
        ) : (
          <>
            {fonte === "ref" ? "O valor de referência" : "O valor de teste"}{" "}
            <b>{fmt(valor)}</b> cai na faixa{" "}
            <span
              className="rounded-[3px] px-1.5 py-0.5 text-[9px] font-black uppercase text-white"
              style={{ background: ZONE_COLOR[labels[idx]] }}
            >
              {slots[idx].faixaName}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function DirecaoExamesTool({ titulo }: { titulo?: string }) {
  const [itens, setItens] = useState<DirecaoItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const [direcao, setDirecao] = useState<Direction>("target");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [refLow, setRefLow] = useState<number | null>(null);
  const [refHigh, setRefHigh] = useState<number | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  const [valorTesteRaw, setValorTesteRaw] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(false);
    fetch(`${BASE}/api/exames-lab/direcoes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("direcoes"))))
      .then((d: DirecaoItem[]) => setItens(d))
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtrados = useMemo(() => {
    const q = norm(busca.trim());
    if (!q) return itens;
    return itens.filter((it) => norm(it.displayName).includes(q) || norm(it.grupo ?? "").includes(q));
  }, [itens, busca]);

  const atual = itens.find((it) => it.code === selecionado) ?? null;

  const carregarDetalhe = useCallback((code: string) => {
    setCarregandoDetalhe(true);
    setMsg(null);
    fetch(`${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("faixas"))))
      .then((resp: FaixasResp) => {
        const novos = slotsFromResp(resp);
        setDirecao(resp.direction);
        setSlots(novos);
        setRefLow(resp.refLow);
        setRefHigh(resp.refHigh);
        setSnapshot(JSON.stringify({ direction: resp.direction, slots: novos }));
      })
      .catch(() => setMsg("Falha ao carregar as faixas deste exame."))
      .finally(() => setCarregandoDetalhe(false));
  }, []);

  const escolher = (it: DirecaoItem) => {
    setSelecionado(it.code);
    setValorTesteRaw("");
    carregarDetalhe(it.code);
  };

  // Editar um corte mantém a borda contígua: Até de uma faixa = De da seguinte.
  const editarCorte = (i: number, campo: "low" | "high", valor: string) => {
    const n = parseNum(valor);
    setSlots((prev) => {
      const next = prev.map((s) => ({ ...s }));
      next[i][campo] = n;
      if (campo === "high" && i < 4) next[i + 1].low = n;
      if (campo === "low" && i > 0) next[i - 1].high = n;
      return next;
    });
  };
  const editarRotulo = (i: number, valor: string) => {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, faixaName: valor } : s)));
  };

  const salvar = () => {
    if (!atual) return;
    setSalvando(true);
    setMsg(null);
    const labels = FAIXAS_POR_DIRECAO[direcao];
    const zones = slots.map((s, i) => ({
      faixaName: (s.faixaName || ZONE_ROTULO[labels[i]]).slice(0, 40),
      low: s.low,
      high: s.high,
      color: ZONE_COLOR[labels[i]],
      ordem: i + 1,
    }));
    fetch(`${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(atual.code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: direcao, displayName: atual.displayName, zones }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("save"))))
      .then(() => {
        setItens((prev) =>
          prev.map((it) =>
            it.code === atual.code ? { ...it, direction: direcao, hasDirection: true } : it,
          ),
        );
        setSnapshot(JSON.stringify({ direction: direcao, slots }));
        setMsg("Faixas salvas. O motor já usa os novos cortes (Config e Cockpit).");
      })
      .catch(() => setMsg("Falha ao salvar as faixas."))
      .finally(() => setSalvando(false));
  };

  const restaurar = () => {
    if (!atual) return;
    setSalvando(true);
    setMsg(null);
    fetch(`${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(atual.code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zones: [], resetDirection: true, displayName: atual.displayName }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("reset"))))
      .then(() => {
        carregarDetalhe(atual.code);
        setItens((prev) =>
          prev.map((it) => (it.code === atual.code ? { ...it, hasDirection: false } : it)),
        );
        setMsg("Faixas restauradas para o padrão (bom senso do laudo).");
      })
      .catch(() => setMsg("Falha ao restaurar."))
      .finally(() => setSalvando(false));
  };

  const valorTeste = parseNum(valorTesteRaw);
  // Leitura da prévia: o valor de teste digitado tem prioridade; senão, o valor
  // "atual" derivado da referência do laudo (ponto médio de refLow/refHigh).
  const refMid =
    Number.isFinite(refLow) && Number.isFinite(refHigh)
      ? ((refLow as number) + (refHigh as number)) / 2
      : null;
  const valorLeitura = valorTeste ?? refMid;
  const fonteLeitura: "teste" | "ref" | "nenhum" =
    valorTeste !== null ? "teste" : refMid !== null ? "ref" : "nenhum";
  const mudou = snapshot !== JSON.stringify({ direction: direcao, slots });

  return (
    <section className="panel-3d p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>
        <Compass className="h-4 w-4" style={{ color: GOLD }} /> {titulo ?? "Faixas dos Exames"}
      </div>
      <p className="mb-3 text-[11px]" style={{ color: MUTED }}>
        Para cada exame, ajuste a DIREÇÃO (o que é "excelente") e os CORTES (De/Até) de cada faixa. Os cortes
        vêm pré-preenchidos por bom senso médico — não pelo laudo. A cor de cada faixa é fixa por severidade.
        Vale para todo o sistema (o mesmo cadastro aparece no Cockpit).
      </p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* LISTA + BUSCA */}
        <div>
          <div className="concave-3d mb-2 flex items-center gap-2 rounded-[6px] px-3 py-2">
            <Search className="h-4 w-4" style={{ color: MUTED }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar exame ou grupo…"
              className="w-full bg-transparent text-[13px] font-semibold outline-none"
              style={{ color: NAVY }}
            />
          </div>

          {carregando && (
            <div className="flex items-center gap-2 px-2 py-6 text-[12px]" style={{ color: MUTED }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando exames…
            </div>
          )}
          {erro && (
            <div className="px-2 py-6 text-[12px] font-semibold text-[#b4413c]">
              Não consegui carregar a lista de exames.
            </div>
          )}

          {!carregando && !erro && (
            <div className="max-h-[460px] space-y-1 overflow-y-auto pr-1">
              {filtrados.length === 0 && (
                <div className="px-2 py-4 text-[12px]" style={{ color: MUTED }}>
                  Nenhum exame encontrado para "{busca}".
                </div>
              )}
              {filtrados.map((it) => {
                const ativo = it.code === selecionado;
                return (
                  <button
                    key={it.code}
                    type="button"
                    onClick={() => escolher(it)}
                    className={`flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left ${ativo ? "btn-3d" : "btn-3d-soft"}`}
                    style={ativo ? { background: NAVY } : undefined}
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-[12px] font-bold"
                      style={{ color: ativo ? "#fff" : NAVY }}
                    >
                      {it.displayName}
                    </span>
                    {it.grupo && (
                      <span
                        className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide"
                        style={{
                          background: ativo ? "rgba(255,255,255,0.16)" : "#eef1f6",
                          color: ativo ? "#fff" : MUTED,
                        }}
                      >
                        {it.grupo}
                      </span>
                    )}
                    <span
                      className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide"
                      style={{
                        background: it.direction === "higher_better"
                          ? "#3f7a3f"
                          : it.direction === "lower_better"
                            ? "#b4413c"
                            : GOLD,
                        color: "#fff",
                      }}
                    >
                      {it.direction === "higher_better" ? "↑ maior" : it.direction === "lower_better" ? "↓ menor" : "◎ alvo"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* EDITOR: DIREÇÃO + CORTES */}
        <div>
          {!atual ? (
            <div className="concave-3d flex h-full items-center justify-center rounded-[6px] px-4 py-10 text-center text-[12px]" style={{ color: MUTED }}>
              Escolha um exame na lista ao lado para editar direção e faixas.
            </div>
          ) : (
            <div className="concave-3d rounded-[6px] p-3">
              <div className="mb-1 text-[14px] font-black" style={{ color: NAVY }}>
                {atual.displayName}
              </div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                {atual.grupo ? `${atual.grupo} · ` : ""}
                {atual.count > 0 ? `${atual.count} resultado(s) nos laudos` : "sem resultado em laudo ainda"}
                {refLow !== null && refHigh !== null && (
                  <> · ref. laudo {fmt(refLow)}–{fmt(refHigh)}</>
                )}
              </div>

              {carregandoDetalhe ? (
                <div className="flex items-center gap-2 px-2 py-8 text-[12px]" style={{ color: MUTED }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando faixas…
                </div>
              ) : (
                <>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                    Direção
                  </div>
                  <div className="mb-4 grid gap-2 sm:grid-cols-3">
                    {(["higher_better", "lower_better", "target"] as const).map((d) => {
                      const on = direcao === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDirecao(d)}
                          className={`flex items-center gap-2 rounded-[6px] px-2 py-2 text-[11px] font-bold ${on ? "btn-3d" : "btn-3d-soft"}`}
                          style={on ? { background: NAVY, color: "#fff" } : { color: NAVY }}
                        >
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                            style={{ background: on ? GOLD : "transparent", border: on ? "none" : `2px solid ${MUTED}` }}
                          >
                            {on && <Check className="h-3 w-3 text-white" />}
                          </span>
                          {DIRECTION_ROTULO[d]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                      As 5 faixas (rótulo, De e Até editáveis)
                    </span>
                  </div>
                  <div className="mb-3 space-y-1.5">
                    {slots.map((s, i) => {
                      const cor = ZONE_COLOR[FAIXAS_POR_DIRECAO[direcao][i]];
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="h-6 w-1.5 shrink-0 rounded-[2px]" style={{ background: cor }} />
                          <input
                            value={s.faixaName}
                            onChange={(e) => editarRotulo(i, e.target.value)}
                            className="min-w-0 flex-1 rounded-[4px] border px-2 py-1 text-[11px] font-bold outline-none"
                            style={{ borderColor: "#d5dbe6", color: NAVY }}
                            maxLength={40}
                          />
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>De</span>
                            <input
                              value={fmt(s.low)}
                              onChange={(e) => editarCorte(i, "low", e.target.value)}
                              placeholder={i === 0 ? "—" : ""}
                              inputMode="decimal"
                              className="w-16 rounded-[4px] border px-2 py-1 text-right text-[11px] font-semibold outline-none"
                              style={{ borderColor: "#d5dbe6", color: NAVY }}
                            />
                            <span className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>Até</span>
                            <input
                              value={fmt(s.high)}
                              onChange={(e) => editarCorte(i, "high", e.target.value)}
                              placeholder={i === 4 ? "—" : ""}
                              inputMode="decimal"
                              className="w-16 rounded-[4px] border px-2 py-1 text-right text-[11px] font-semibold outline-none"
                              style={{ borderColor: "#d5dbe6", color: NAVY }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                        Prévia
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>valor de teste</span>
                        <input
                          value={valorTesteRaw}
                          onChange={(e) => setValorTesteRaw(e.target.value)}
                          placeholder="ex.: 32"
                          inputMode="decimal"
                          className="w-20 rounded-[4px] border px-2 py-1 text-right text-[11px] font-semibold outline-none"
                          style={{ borderColor: "#d5dbe6", color: NAVY }}
                        />
                      </div>
                    </div>
                    <BarraFaixas slots={slots} direction={direcao} valor={valorLeitura} fonte={fonteLeitura} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={salvar}
                      disabled={salvando || !mudou}
                      className="btn-3d flex items-center gap-1.5 rounded-[6px] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
                      style={{ background: NAVY }}
                    >
                      {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Salvar faixas
                    </button>
                    <button
                      type="button"
                      onClick={restaurar}
                      disabled={salvando}
                      className="btn-3d-soft flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[11px] font-bold uppercase tracking-wide disabled:opacity-50"
                      style={{ color: NAVY }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                    </button>
                    {!mudou && !msg && (
                      <span className="text-[11px] font-semibold" style={{ color: MUTED }}>
                        Estas já são as faixas salvas.
                      </span>
                    )}
                    {msg && <span className="text-[11px] font-semibold" style={{ color: MUTED }}>{msg}</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default DirecaoExamesTool;
