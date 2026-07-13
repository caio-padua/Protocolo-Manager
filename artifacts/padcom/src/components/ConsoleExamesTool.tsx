import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Save,
  Search,
  Check,
  Compass,
  RotateCcw,
  Plus,
  X,
  Tags,
  Ruler,
  Wand2,
  AlertTriangle,
  Sparkles,
  Ban,
} from "lucide-react";
import { BASE } from "@/pages/comunicacao/_shared";
import {
  NAVY,
  GOLD,
  MUTED,
  DIRECTION_ROTULO,
  ZONE_COLOR,
  ZONE_ROTULO,
  FAIXAS_POR_DIRECAO,
  parseNum,
  fmt,
  type Direction,
} from "@/components/exames-faixas-shared";

// ===========================================================================
// CONSOLE DE EXAMES — tela ÚNICA que funde as DUAS ferramentas antigas:
//   • Direção dos Exames  (direção + 5 faixas com cortes De/Até + prévia)
//   • Planilha de Faixas  (apelidos + unidades)
// Mesmo universo de exames, campos DISJUNTOS -> encaixe sem perda.
//
// Layout mestre-detalhe (design Paxter 3D). O detalhe tem TRÊS sub-painéis:
//   IDENTIDADE (nome + apelidos) · MEDIDA (unidades) · SIGNIFICADO (direção+faixas)
//
// Rótulos das 5 faixas TRAVADOS nas 5 nomenclaturas oficiais (ALERTA / ATENÇÃO /
// INSUFICIENTE / ACEITÁVEL / EXCELENTE); só os CORTES De/Até são editáveis.
//
// Só CONSOME os contratos existentes (não altera o motor):
//   GET  /api/exames-lab/catalogo-faixas            -> lista rica
//   GET  /api/exames-lab/direcoes                   -> grupo + contagem de laudos
//   GET  /api/exames-lab/faixas?code=               -> detalhe (refLow/refHigh)
//   PUT  /api/exames-lab/faixas?code=               -> direção + zonas / restaurar
//   PUT  /api/exames-lab/catalogo-faixas/aliases    -> apelidos
//   PUT  /api/exames-lab/catalogo-faixas/unidades   -> unidades
// ===========================================================================

interface UnitApi {
  unit: string;
  factorToCanonical: number;
  isCanonical: boolean;
  active: boolean;
}
interface ZoneApi {
  faixaName: string;
  low: number | null;
  high: number | null;
  color: string;
  ordem: number;
}
interface CatalogoRow {
  code: string;
  displayName: string;
  direction: Direction;
  canonicalUnit: string | null;
  synonyms: string[];
  units: UnitApi[];
  zones: ZoneApi[];
  quantitativo: boolean;
  hasManualEdit: boolean;
  inCatalog: boolean;
  origin: "catalogo" | "descoberto" | null;
}
interface FusedRow extends CatalogoRow {
  grupo: string | null;
  count: number;
}

// Sala de Triagem: grafias que NÃO foram absorvidas sozinhas na faxina.
interface TriagemItem {
  id: number;
  sampleName: string;
  occurrences: number;
  kind: "ambiguo" | "nao_exame";
  suggestedCode: string | null;
  suggestedName?: string | null;
  reason: string | null;
}
interface TriagemTotais {
  ambiguos: number;
  naoExames: number;
  descobertos: number;
}

interface DirecaoItem {
  code: string;
  displayName: string;
  direction: Direction;
  grupo: string | null;
  count: number;
  hasDirection: boolean;
}

interface ZonaDetalhe {
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
  zones: ZonaDetalhe[] | null;
}

// Faixa editável na tela: rótulo (nome livre por exame) + cortes De/Até.
// A COR não é editável — vem sempre por severidade/posição (ZONE_COLOR).
interface Slot {
  low: number | null;
  high: number | null;
  faixaName: string;
}
interface UnitDraft {
  unit: string;
  factor: string;
  isCanonical: boolean;
}

// 5 cortes + rótulo a partir das zonas (detalhe da API ou linha do catálogo).
// O rótulo é livre por exame; se vier vazio, cai no nome-base da posição/direção.
function slotsFromZones(
  zones: { low: number | null; high: number | null; faixaName?: string; name?: string }[] | null | undefined,
  direction: Direction,
): Slot[] {
  const labels = FAIXAS_POR_DIRECAO[direction];
  const out: Slot[] = [];
  for (let i = 0; i < 5; i++) {
    const z = zones?.[i];
    const nome = (z?.faixaName ?? z?.name ?? "").trim() || ZONE_ROTULO[labels[i]];
    out.push({ low: z?.low ?? null, high: z?.high ?? null, faixaName: nome });
  }
  return out;
}
function aliasSlots(synonyms: string[]): string[] {
  const s = (synonyms ?? []).slice(0, 5);
  while (s.length < 5) s.push("");
  return s;
}
function unitDraftFrom(units: UnitApi[]): UnitDraft[] {
  return (units ?? []).map((u) => ({
    unit: u.unit,
    factor: u.isCanonical ? "1" : u.factorToCanonical != null ? String(u.factorToCanonical) : "",
    isCanonical: u.isCanonical,
  }));
}

// Classifica um valor na faixa (first-match [low,high), topo inclusivo).
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
// Larguras proporcionais da barra-prévia (extremos fixos; meio proporcional).
function largurasPrevia(slots: Slot[]): number[] {
  const c0 = slots[0]?.high;
  const c1 = slots[1]?.high;
  const c2 = slots[2]?.high;
  const c3 = slots[3]?.high;
  const ok = [c0, c1, c2, c3].every((x) => x !== null && Number.isFinite(x));
  if (!ok || c0! >= c1! || c1! >= c2! || c2! >= c3!) return [20, 20, 20, 20, 20];
  const fixo = 12;
  const meio = 100 - 2 * fixo;
  const w1 = c1! - c0!;
  const w2 = c2! - c1!;
  const w3 = c3! - c2!;
  const soma = w1 + w2 + w3;
  return [fixo, (w1 / soma) * meio, (w2 / soma) * meio, (w3 / soma) * meio, fixo];
}

// Placa de título de sub-painel (Padrão 3 — BlockTitle em bevel).
function BlockTitle({ icon: Icon, children }: { icon: typeof Compass; children: React.ReactNode }) {
  return (
    <div
      className="bevel-3d mb-3 inline-flex items-center gap-2 rounded-[6px] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]"
      style={{ color: NAVY }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} />
      {children}
    </div>
  );
}

// Barra-prévia + leitura da faixa do valor atual (rótulo livre por exame; cor por severidade).
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
            title={s.faixaName || ZONE_ROTULO[labels[i]]}
          >
            <span className="block truncate">{s.faixaName || ZONE_ROTULO[labels[i]]}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[10px] font-semibold" style={{ color: MUTED }}>
        {fonte === "nenhum" || valor === null ? (
          <>Sem valor de referência para posicionar.</>
        ) : idx === null ? (
          <>
            {fonte === "ref" ? "O valor de referência" : "O valor de teste"} <b>{fmt(valor)}</b> não caiu em nenhuma faixa.
          </>
        ) : (
          <>
            {fonte === "ref" ? "O valor de referência" : "O valor de teste"} <b>{fmt(valor)}</b> cai na faixa{" "}
            <span className="rounded-[3px] px-1.5 py-0.5 text-[9px] font-black uppercase text-white" style={{ background: ZONE_COLOR[labels[idx]] }}>
              {slots[idx].faixaName || ZONE_ROTULO[labels[idx]]}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function ConsoleExamesTool({ titulo }: { titulo?: string }) {
  const [rows, setRows] = useState<FusedRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  // Detalhe (faixas)
  const [direcao, setDirecao] = useState<Direction>("target");
  const [slots, setSlots] = useState<Slot[]>(slotsFromZones(null, "target"));
  const [refLow, setRefLow] = useState<number | null>(null);
  const [refHigh, setRefHigh] = useState<number | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [snapshot, setSnapshot] = useState("");
  const [valorTesteRaw, setValorTesteRaw] = useState("");

  // Rascunhos IDENTIDADE / MEDIDA
  const [aliasDraft, setAliasDraft] = useState<string[]>(["", "", "", "", ""]);
  const [aliasOverflow, setAliasOverflow] = useState<string[]>([]);
  const [unitDraft, setUnitDraft] = useState<UnitDraft[]>([]);

  const detalheReqRef = useRef(0);
  const [salvandoFaixas, setSalvandoFaixas] = useState(false);
  const [salvandoApelidos, setSalvandoApelidos] = useState(false);
  const [salvandoUnidades, setSalvandoUnidades] = useState(false);
  const [msg, setMsg] = useState<{ kind: "faixas" | "apelidos" | "unidades"; ok: boolean; texto: string } | null>(null);

  // ---- Sala de Triagem (faxina em massa + fila de conferência humana) ----
  const [triPend, setTriPend] = useState<TriagemItem[]>([]);
  const [triDesc, setTriDesc] = useState<{ code: string; displayName: string }[]>([]);
  const [triTot, setTriTot] = useState<TriagemTotais>({ ambiguos: 0, naoExames: 0, descobertos: 0 });
  const [triFaxinando, setTriFaxinando] = useState(false);
  const [triResumo, setTriResumo] = useState<string | null>(null);
  const [triResolvendo, setTriResolvendo] = useState<number | null>(null);
  // Seletor manual: virar apelido de OUTRO exame do catálogo (não só o sugerido).
  const [triApelidoAberto, setTriApelidoAberto] = useState<number | null>(null);
  const [triApelidoBusca, setTriApelidoBusca] = useState("");
  const [triErro, setTriErro] = useState<{ id: number; texto: string } | null>(null);
  const [triAberta, setTriAberta] = useState(false);

  const carregarTriagem = useCallback(() => {
    fetch(`${BASE}/api/exames-lab/triagem`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("triagem"))))
      .then((d: { pendentes: TriagemItem[]; descobertos?: { code: string; displayName: string }[]; totais: TriagemTotais }) => {
        setTriPend(d.pendentes ?? []);
        setTriDesc(d.descobertos ?? []);
        setTriTot(d.totais ?? { ambiguos: 0, naoExames: 0, descobertos: 0 });
      })
      .catch(() => {
        /* silencioso: a triagem é auxiliar, não derruba a tela */
      });
  }, []);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(false);
    Promise.all([
      fetch(`${BASE}/api/exames-lab/catalogo-faixas`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalogo")))),
      fetch(`${BASE}/api/exames-lab/direcoes`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("direcoes"))))
        .catch(() => [] as DirecaoItem[]),
    ])
      .then(([cat, dir]: [CatalogoRow[], DirecaoItem[]]) => {
        const metaByCode = new Map<string, { grupo: string | null; count: number }>();
        for (const d of dir) metaByCode.set(d.code, { grupo: d.grupo, count: d.count });
        const merged: FusedRow[] = cat.map((c) => ({
          ...c,
          grupo: metaByCode.get(c.code)?.grupo ?? null,
          count: metaByCode.get(c.code)?.count ?? 0,
        }));
        // União sem perda: exames que só existem em /direcoes entram como linha
        // de fallback (ainda sem apelidos/unidades no catálogo).
        const catCodes = new Set(cat.map((c) => c.code));
        for (const d of dir) {
          if (catCodes.has(d.code)) continue;
          merged.push({
            code: d.code,
            displayName: d.displayName,
            direction: d.direction,
            canonicalUnit: null,
            synonyms: [],
            units: [],
            zones: [],
            quantitativo: true,
            hasManualEdit: d.hasDirection,
            inCatalog: false,
            origin: null,
            grupo: d.grupo,
            count: d.count,
          });
        }
        setRows(merged);
      })
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarTriagem();
  }, [carregarTriagem]);

  const rodarFaxina = useCallback(() => {
    setTriFaxinando(true);
    setTriResumo(null);
    fetch(`${BASE}/api/exames-lab/triagem/backfill`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("backfill"))))
      .then((d: { apelidos: number; novos: number; ambiguos: number; naoExames: number; linhasCarimbadas: number }) => {
        setTriResumo(
          `Faxina concluída: ${d.apelidos} apelido(s) absorvido(s), ${d.novos} exame(s) DESCOBERTO criado(s), ` +
            `${d.ambiguos} a conferir, ${d.naoExames} ignorado(s) · ${d.linhasCarimbadas} resultado(s) carimbado(s).`,
        );
        carregarTriagem();
        carregar();
      })
      .catch(() => setTriResumo("Não consegui rodar a faxina agora."))
      .finally(() => setTriFaxinando(false));
  }, [carregarTriagem, carregar]);

  const resolverTriagem = useCallback(
    (id: number, acao: "apelido" | "novo" | "ignorar", targetCode?: string) => {
      setTriResolvendo(id);
      setTriErro(null);
      fetch(`${BASE}/api/exames-lab/triagem/${id}/resolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, targetCode }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = (await r.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? "Falha ao resolver o item.");
          }
          return r.json();
        })
        .then(() => {
          setTriApelidoAberto(null);
          setTriApelidoBusca("");
          setTriPend((prev) => prev.filter((x) => x.id !== id));
          carregarTriagem();
          if (acao !== "ignorar") carregar();
        })
        .catch((e: unknown) => {
          // mantém na fila e explica o motivo (ex.: 409 grafia já pertence a outro exame)
          setTriErro({ id, texto: e instanceof Error ? e.message : "Falha ao resolver o item." });
        })
        .finally(() => setTriResolvendo(null));
    },
    [carregarTriagem, carregar],
  );

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtrados = useMemo(() => {
    // R13 da spec: o bloco de CADASTRO mostra só cadastros reais (inCatalog=true).
    // Grafias cruas/fallback ficam fora daqui — vivem na Sala de Triagem.
    const base = rows.filter((r) => r.inCatalog);
    const q = norm(busca.trim());
    if (!q) return base;
    return base.filter(
      (r) =>
        norm(r.displayName).includes(q) ||
        norm(r.grupo ?? "").includes(q) ||
        (r.synonyms ?? []).some((s) => norm(s).includes(q)),
    );
  }, [rows, busca]);

  const atual = rows.find((r) => r.code === selecionado) ?? null;

  const carregarDetalhe = useCallback((row: FusedRow) => {
    // Guard de corrida: clique A→B rápido não pode deixar a resposta lenta de A
    // sobrescrever o detalhe de B. Só aplica se este ainda for o pedido vigente.
    const reqId = ++detalheReqRef.current;
    const vigente = () => detalheReqRef.current === reqId;
    setCarregandoDetalhe(true);
    setMsg(null);
    // rascunhos de identidade/medida vêm da linha do catálogo (já em memória)
    setAliasDraft(aliasSlots(row.synonyms));
    setAliasOverflow((row.synonyms ?? []).slice(5));
    setUnitDraft(unitDraftFrom(row.units));
    // faixas: detalhe autoritativo (traz refLow/refHigh p/ a prévia)
    fetch(`${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(row.code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("faixas"))))
      .then((resp: FaixasResp) => {
        if (!vigente()) return;
        const novos = slotsFromZones(resp.zones ?? row.zones, resp.direction ?? row.direction);
        setDirecao(resp.direction ?? row.direction);
        setSlots(novos);
        setRefLow(resp.refLow);
        setRefHigh(resp.refHigh);
        setSnapshot(JSON.stringify({ direction: resp.direction ?? row.direction, slots: novos }));
      })
      .catch(() => {
        if (!vigente()) return;
        // fallback: usa as zonas já vindas do catálogo
        const novos = slotsFromZones(row.zones, row.direction);
        setDirecao(row.direction);
        setSlots(novos);
        setRefLow(null);
        setRefHigh(null);
        setSnapshot(JSON.stringify({ direction: row.direction, slots: novos }));
      })
      .finally(() => {
        if (vigente()) setCarregandoDetalhe(false);
      });
  }, []);

  const escolher = (row: FusedRow) => {
    setSelecionado(row.code);
    setValorTesteRaw("");
    carregarDetalhe(row);
  };

  // === FAIXAS (SIGNIFICADO) ===
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

  // Rótulo livre por faixa, independente por exame (backend aceita até 40 chars).
  const editarRotulo = (i: number, valor: string) => {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, faixaName: valor } : s)));
  };

  const salvarFaixas = () => {
    if (!atual) return;
    setSalvandoFaixas(true);
    setMsg(null);
    const labels = FAIXAS_POR_DIRECAO[direcao];
    const zones = slots.map((s, i) => ({
      faixaName: (s.faixaName.trim() || ZONE_ROTULO[labels[i]]).slice(0, 40),
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
        setRows((prev) =>
          prev.map((r) =>
            r.code === atual.code
              ? { ...r, direction: direcao, hasManualEdit: true, zones: zones.map((z) => ({ ...z })) }
              : r,
          ),
        );
        setSnapshot(JSON.stringify({ direction: direcao, slots }));
        setMsg({ kind: "faixas", ok: true, texto: "Faixas salvas. O motor já usa os novos cortes (Cockpit)." });
      })
      .catch(() => setMsg({ kind: "faixas", ok: false, texto: "Falha ao salvar as faixas." }))
      .finally(() => setSalvandoFaixas(false));
  };

  const restaurar = () => {
    if (!atual) return;
    setSalvandoFaixas(true);
    setMsg(null);
    fetch(`${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(atual.code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zones: [], resetDirection: true, displayName: atual.displayName }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("reset"))))
      .then(() => {
        setRows((prev) => prev.map((r) => (r.code === atual.code ? { ...r, hasManualEdit: false } : r)));
        carregarDetalhe(atual);
        setMsg({ kind: "faixas", ok: true, texto: "Faixas restauradas para o padrão." });
      })
      .catch(() => setMsg({ kind: "faixas", ok: false, texto: "Falha ao restaurar." }))
      .finally(() => setSalvandoFaixas(false));
  };

  // === IDENTIDADE (apelidos) ===
  const setAlias = (i: number, val: string) =>
    setAliasDraft((prev) => {
      const a = [...prev];
      a[i] = val;
      return a;
    });

  // Promoção pode mudar o code — remapeia a seleção.
  const aplicarNovoCode = (oldCode: string, newCode: string) => {
    if (oldCode !== newCode) setSelecionado((c) => (c === oldCode ? newCode : c));
  };

  const salvarApelidos = () => {
    if (!atual) return;
    const lista = aliasDraft.map((s) => s.trim()).filter(Boolean);
    setSalvandoApelidos(true);
    setMsg(null);
    fetch(`${BASE}/api/exames-lab/catalogo-faixas/aliases`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: atual.code, displayName: atual.displayName, synonyms: lista }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Falha ao salvar apelidos.");
        return j;
      })
      .then((j) => {
        const newCode: string = j.code ?? atual.code;
        const synonyms: string[] = j.synonyms ?? lista;
        setRows((prev) =>
          prev.map((x) => (x.code === atual.code ? { ...x, code: newCode, synonyms, inCatalog: true } : x)),
        );
        aplicarNovoCode(atual.code, newCode);
        setAliasDraft(aliasSlots(synonyms));
        setAliasOverflow(synonyms.slice(5));
        setMsg({ kind: "apelidos", ok: true, texto: "Apelidos salvos. A varredura já busca por eles." });
      })
      .catch((e) => setMsg({ kind: "apelidos", ok: false, texto: (e as Error).message }))
      .finally(() => setSalvandoApelidos(false));
  };

  // === MEDIDA (unidades) ===
  const setUnitField = (i: number, field: "unit" | "factor", val: string) =>
    setUnitDraft((prev) => {
      const arr = prev.map((x) => ({ ...x }));
      if (!arr[i]) return prev;
      arr[i][field] = val;
      return arr;
    });
  const marcarCanonica = (i: number) =>
    setUnitDraft((prev) => prev.map((x, idx) => ({ ...x, isCanonical: idx === i, factor: idx === i ? "1" : x.factor })));
  const addUnit = () =>
    setUnitDraft((prev) => (prev.length >= 5 ? prev : [...prev, { unit: "", factor: "", isCanonical: prev.length === 0 }]));
  const removeUnit = (i: number) =>
    setUnitDraft((prev) => {
      let arr = prev.filter((_, idx) => idx !== i);
      if (arr.length > 0 && !arr.some((u) => u.isCanonical)) arr = arr.map((u, idx) => ({ ...u, isCanonical: idx === 0 }));
      return arr;
    });

  const salvarUnidades = () => {
    if (!atual) return;
    const lista = unitDraft.map((u) => ({ ...u, unit: u.unit.trim() })).filter((u) => u.unit);
    if (lista.length === 0) {
      setMsg({ kind: "unidades", ok: false, texto: "Informe ao menos uma unidade." });
      return;
    }
    let canonIdx = lista.findIndex((u) => u.isCanonical);
    if (canonIdx < 0) canonIdx = 0;
    const units = lista.map((u, idx) => ({
      unit: u.unit,
      factorToCanonical: idx === canonIdx ? 1 : Number(String(u.factor).replace(",", ".")),
      isCanonical: idx === canonIdx,
    }));
    for (const u of units) {
      if (!Number.isFinite(u.factorToCanonical) || u.factorToCanonical <= 0) {
        setMsg({ kind: "unidades", ok: false, texto: `Fator inválido em "${u.unit}". Use número maior que zero.` });
        return;
      }
    }
    setSalvandoUnidades(true);
    setMsg(null);
    fetch(`${BASE}/api/exames-lab/catalogo-faixas/unidades`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: atual.code, displayName: atual.displayName, units }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Falha ao salvar unidades.");
        return j;
      })
      .then((j) => {
        const newCode: string = j.code ?? atual.code;
        const canonicalUnit: string = j.canonicalUnit ?? units[canonIdx].unit;
        const novasUnits: UnitApi[] = units.map((u) => ({
          unit: u.unit,
          factorToCanonical: u.factorToCanonical,
          isCanonical: u.isCanonical,
          active: true,
        }));
        setRows((prev) =>
          prev.map((x) =>
            x.code === atual.code
              ? { ...x, code: newCode, units: novasUnits, canonicalUnit, quantitativo: true, inCatalog: true }
              : x,
          ),
        );
        aplicarNovoCode(atual.code, newCode);
        setUnitDraft(unitDraftFrom(novasUnits));
        setMsg({ kind: "unidades", ok: true, texto: "Unidades salvas. Padrão e conversões atualizadas." });
      })
      .catch((e) => setMsg({ kind: "unidades", ok: false, texto: (e as Error).message }))
      .finally(() => setSalvandoUnidades(false));
  };

  // Prévia
  const valorTeste = parseNum(valorTesteRaw);
  const refMid =
    Number.isFinite(refLow) && Number.isFinite(refHigh) ? ((refLow as number) + (refHigh as number)) / 2 : null;
  const valorLeitura = valorTeste ?? refMid;
  const fonteLeitura: "teste" | "ref" | "nenhum" = valorTeste !== null ? "teste" : refMid !== null ? "ref" : "nenhum";
  const faixasMudou = snapshot !== JSON.stringify({ direction: direcao, slots });

  const totalRevisado = rows.filter((r) => r.quantitativo && r.hasManualEdit).length;
  const totalQuant = rows.filter((r) => r.quantitativo).length;
  const naoQuant = atual != null && !atual.quantitativo;

  return (
    <section className="panel-3d p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>
        <Compass className="h-4 w-4" style={{ color: GOLD }} /> {titulo ?? "Console de Exames"}
      </div>
      <p className="mb-3 text-[11px]" style={{ color: MUTED }}>
        Tudo de um exame numa tela só: <b>apelidos</b> (como o laudo escreve), <b>unidades</b> (com a padrão e o
        fator de conversão), a <b>direção</b> (o que é "excelente") e os <b>cortes De/Até</b> das 5 faixas. O
        rótulo de cada faixa é editável por exame; a cor é fixa por severidade.{" "}
        <span className="mx-0.5 inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 align-middle text-[8px] font-black uppercase text-white" style={{ background: GOLD }}>
          <Check className="h-2.5 w-2.5" /> rev
        </span>
        marca exames já conferidos por um profissional.
      </p>

      {/* ===================== SALA DE TRIAGEM ===================== */}
      <div className="panel-3d-sub mb-4 rounded-[6px] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
            <Wand2 className="h-4 w-4" style={{ color: GOLD }} /> Sala de Triagem
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="concave-3d inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide" style={{ color: GOLD }}>
              <Sparkles className="h-3 w-3" /> {triTot.descobertos} descobertos
            </span>
            <span className="concave-3d inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide" style={{ color: "#b4413c" }}>
              <AlertTriangle className="h-3 w-3" /> {triTot.ambiguos} a conferir
            </span>
            <span className="concave-3d inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide" style={{ color: MUTED }}>
              <Ban className="h-3 w-3" /> {triTot.naoExames} ignorados
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-[10px]" style={{ color: MUTED }}>
            A <b>faxina</b> varre toda grafia de laudo: apelido de alta confiança é absorvido sozinho, exame novo
            vira cadastro <b>DESCOBERTO</b> ativo, e o que ficou <b>ambíguo</b> espera sua decisão aqui — em
            quarentena, fora do motor. Nada é perdido.
          </p>
          <button
            type="button"
            onClick={rodarFaxina}
            disabled={triFaxinando}
            className="btn-3d inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-60"
            style={{ background: NAVY }}
          >
            {triFaxinando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {triFaxinando ? "Rodando faxina…" : "Rodar faxina"}
          </button>
          {triPend.length > 0 && (
            <button
              type="button"
              onClick={() => setTriAberta((v) => !v)}
              className="btn-3d-soft inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-2 text-[11px] font-bold uppercase tracking-wide"
              style={{ color: NAVY }}
            >
              {triAberta ? "Fechar fila" : `Abrir fila (${triPend.length})`}
            </button>
          )}
        </div>

        {triResumo && (
          <div className="concave-3d mt-2 rounded-[6px] px-3 py-2 text-[10px] font-semibold" style={{ color: NAVY }}>
            {triResumo}
          </div>
        )}

        {triAberta && triPend.length > 0 && (
          <div className="mt-3 max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
            {triPend.map((t) => (
              <div key={t.id} className="concave-3d flex flex-wrap items-center gap-2 rounded-[6px] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-bold" style={{ color: NAVY }}>
                    {t.sampleName}
                    <span className="ml-1.5 text-[9px] font-semibold" style={{ color: MUTED }}>
                      {t.occurrences}×
                    </span>
                  </div>
                  {t.reason && (
                    <div className="truncate text-[9px] font-semibold uppercase tracking-wide" style={{ color: t.kind === "ambiguo" ? "#b4413c" : MUTED }}>
                      {t.reason}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {t.suggestedCode && (
                    <button
                      type="button"
                      onClick={() => resolverTriagem(t.id, "apelido", t.suggestedCode ?? undefined)}
                      disabled={triResolvendo === t.id}
                      className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide disabled:opacity-60"
                      style={{ color: NAVY }}
                      title={t.suggestedName ? `Virar apelido de ${t.suggestedName} (sugerido pelo sistema)` : "Virar apelido do exame sugerido"}
                    >
                      <Tags className="h-3 w-3" /> {t.suggestedName ? `Apelido de ${t.suggestedName}` : "Virar apelido"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setTriErro(null);
                      setTriApelidoBusca("");
                      setTriApelidoAberto((cur) => (cur === t.id ? null : t.id));
                    }}
                    disabled={triResolvendo === t.id}
                    className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide disabled:opacity-60"
                    style={{ color: NAVY }}
                    title="Virar apelido de OUTRO exame já cadastrado (você escolhe qual)"
                  >
                    <Search className="h-3 w-3" /> Apelido de outro…
                  </button>
                  <button
                    type="button"
                    onClick={() => resolverTriagem(t.id, "novo")}
                    disabled={triResolvendo === t.id}
                    className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide disabled:opacity-60"
                    style={{ color: GOLD }}
                    title="Criar como exame novo (DESCOBERTO)"
                  >
                    <Sparkles className="h-3 w-3" /> Criar novo
                  </button>
                  <button
                    type="button"
                    onClick={() => resolverTriagem(t.id, "ignorar")}
                    disabled={triResolvendo === t.id}
                    className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide disabled:opacity-60"
                    style={{ color: MUTED }}
                    title="Ignorar (não é exame)"
                  >
                    {triResolvendo === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />} Ignorar
                  </button>
                </div>

                {triErro && triErro.id === t.id && (
                  <div className="w-full rounded-[6px] px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: "#f7e4e2", color: "#b4413c" }}>
                    {triErro.texto}
                  </div>
                )}

                {triApelidoAberto === t.id && (
                  <div className="panel-3d-sub w-full rounded-[6px] p-2">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: NAVY }}>
                      <Tags className="h-3 w-3" style={{ color: GOLD }} /> Escolha o exame já cadastrado que recebe "{t.sampleName}" como apelido
                    </div>
                    <div className="concave-3d mb-1.5 flex items-center gap-1.5 rounded-[6px] px-2 py-1">
                      <Search className="h-3 w-3 shrink-0" style={{ color: MUTED }} />
                      <input
                        type="text"
                        value={triApelidoBusca}
                        onChange={(e) => setTriApelidoBusca(e.target.value)}
                        placeholder="Buscar exame do cadastro…"
                        autoFocus
                        className="w-full bg-transparent text-[11px] outline-none"
                        style={{ color: NAVY }}
                      />
                    </div>
                    <div className="max-h-[180px] space-y-1 overflow-y-auto pr-1">
                      {(() => {
                        const q = norm(triApelidoBusca.trim());
                        const lista = rows
                          .filter((r) => r.inCatalog)
                          .filter(
                            (r) =>
                              !q ||
                              norm(r.displayName).includes(q) ||
                              norm(r.grupo ?? "").includes(q) ||
                              (r.synonyms ?? []).some((s) => norm(s).includes(q)),
                          )
                          .slice(0, 40);
                        if (lista.length === 0) {
                          return (
                            <div className="px-2 py-2 text-[10px] font-semibold" style={{ color: MUTED }}>
                              Nenhum exame do cadastro encontrado.
                            </div>
                          );
                        }
                        return lista.map((r) => (
                          <button
                            key={r.code}
                            type="button"
                            onClick={() => resolverTriagem(t.id, "apelido", r.code)}
                            disabled={triResolvendo === t.id}
                            className="btn-3d-soft flex w-full items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11px] font-semibold disabled:opacity-60"
                            style={{ color: NAVY }}
                            title={`Virar apelido de ${r.displayName}`}
                          >
                            <span className="truncate">{r.displayName}</span>
                            {r.origin === "descoberto" && (
                              <span className="shrink-0 text-[8px] font-black uppercase tracking-wide" style={{ color: GOLD }}>
                                descoberto
                              </span>
                            )}
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {triAberta && triDesc.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: GOLD }}>
              <Sparkles className="h-3 w-3" /> Achados recentes ({triDesc.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {triDesc.map((d) => (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => setSelecionado(d.code)}
                  className="concave-3d inline-flex items-center rounded-[6px] px-2 py-1 text-[10px] font-semibold"
                  style={{ color: NAVY }}
                  title="Abrir cadastro DESCOBERTO"
                >
                  {d.displayName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        {/* ===================== MESTRE (lista) ===================== */}
        <div>
          <div className="concave-3d mb-2 flex items-center gap-2 rounded-[6px] px-3 py-2">
            <Search className="h-4 w-4" style={{ color: MUTED }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar exame, grupo ou apelido…"
              className="w-full bg-transparent text-[13px] font-semibold outline-none"
              style={{ color: NAVY }}
            />
          </div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
            {totalRevisado}/{totalQuant} revisados
          </div>

          {carregando && (
            <div className="flex items-center gap-2 px-2 py-6 text-[12px]" style={{ color: MUTED }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando exames…
            </div>
          )}
          {erro && (
            <div className="px-2 py-6 text-[12px] font-semibold text-[#b4413c]">Não consegui carregar os exames.</div>
          )}

          {!carregando && !erro && (
            <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
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
                    <span className="min-w-0 flex-1 truncate text-[12px] font-bold" style={{ color: ativo ? "#fff" : NAVY }}>
                      {it.displayName}
                    </span>
                    {it.hasManualEdit && (
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-[3px] px-1 py-0.5 text-[7px] font-black uppercase"
                        style={{ background: ativo ? "rgba(255,255,255,0.18)" : "#eef1f6", color: ativo ? "#fff" : GOLD }}
                        title="Revisado por um profissional"
                      >
                        <Check className="h-2.5 w-2.5" /> rev
                      </span>
                    )}
                    <span
                      className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white"
                      style={{
                        background:
                          it.direction === "higher_better" ? "#3f7a3f" : it.direction === "lower_better" ? "#b4413c" : GOLD,
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

        {/* ===================== DETALHE ===================== */}
        <div>
          {!atual ? (
            <div className="concave-3d flex h-full items-center justify-center rounded-[6px] px-4 py-10 text-center text-[12px]" style={{ color: MUTED }}>
              Escolha um exame na lista ao lado para editar apelidos, unidades, direção e faixas.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cabeçalho do exame */}
              <div className="concave-3d rounded-[6px] p-3">
                <div className="text-[15px] font-black" style={{ color: NAVY }}>
                  {atual.displayName}
                </div>
                {atual.origin && (
                  <div className="mt-1">
                    <span
                      className="concave-3d inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em]"
                      style={{ color: atual.origin === "descoberto" ? GOLD : NAVY }}
                      title={
                        atual.origin === "descoberto"
                          ? "Exame criado automaticamente pela faxina (grafia nova encontrada nos laudos)"
                          : "Exame do catálogo original (57 exames-base)"
                      }
                    >
                      {atual.origin === "descoberto" ? <Sparkles className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
                      {atual.origin === "descoberto" ? "Descoberto" : "Catálogo"}
                    </span>
                  </div>
                )}
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                  {atual.grupo ? `${atual.grupo} · ` : ""}
                  {atual.count > 0 ? `${atual.count} resultado(s) nos laudos` : "sem resultado em laudo ainda"}
                  {refLow !== null && refHigh !== null && (
                    <> · ref. laudo {fmt(refLow)}–{fmt(refHigh)}</>
                  )}
                  {!atual.quantitativo && <> · não quantitativo</>}
                </div>
              </div>

              {/* ---------- IDENTIDADE (apelidos) ---------- */}
              <div className="panel-3d-sub rounded-[6px] p-3">
                <BlockTitle icon={Tags}>Identidade · Apelidos</BlockTitle>
                <div className="mb-2 text-[10px]" style={{ color: MUTED }}>
                  Até 5 apelidos (como o laudo pode escrever este exame). A varredura já procura por eles.
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {aliasDraft.map((a, i) => (
                    <input
                      key={i}
                      value={a}
                      onChange={(e) => setAlias(i, e.target.value)}
                      placeholder={`Apelido ${i + 1}`}
                      className="rounded-[4px] border px-2 py-1 text-[11px] font-semibold outline-none"
                      style={{ borderColor: "#d5dbe6", color: NAVY }}
                    />
                  ))}
                </div>
                {aliasOverflow.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[8px] font-bold uppercase" style={{ color: MUTED }}>
                      +{aliasOverflow.length} internos:
                    </span>
                    {aliasOverflow.map((s, i) => (
                      <span key={i} className="rounded-[3px] px-1 py-0.5 text-[9px] font-semibold" style={{ background: "#e5e9f0", color: NAVY }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={salvarApelidos}
                    disabled={salvandoApelidos}
                    className="btn-3d inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
                    style={{ background: NAVY }}
                  >
                    {salvandoApelidos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar apelidos
                  </button>
                  {msg?.kind === "apelidos" && (
                    <span className={`text-[10px] font-semibold ${msg.ok ? "text-[#3f7a3f]" : "text-[#b4413c]"}`}>{msg.texto}</span>
                  )}
                </div>
              </div>

              {/* ---------- MEDIDA (unidades) ---------- */}
              <div className="panel-3d-sub rounded-[6px] p-3">
                <BlockTitle icon={Ruler}>Medida · Unidades</BlockTitle>
                {naoQuant ? (
                  <div className="text-[10px] font-semibold uppercase" style={{ color: MUTED }}>
                    Exame não quantitativo — sem unidade numérica.
                  </div>
                ) : (
                  <>
                    <div className="mb-2 text-[10px]" style={{ color: MUTED }}>
                      Até 5 unidades. Marque a PADRÃO; o fator converte cada unidade para a padrão (a padrão tem fator 1).
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {unitDraft.map((u, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <input
                            value={u.unit}
                            onChange={(e) => setUnitField(i, "unit", e.target.value)}
                            placeholder="unidade"
                            className="w-28 rounded-[4px] border px-1.5 py-1 text-[11px] font-semibold outline-none"
                            style={{ borderColor: "#d5dbe6", color: NAVY }}
                          />
                          <input
                            value={u.isCanonical ? "1" : u.factor}
                            onChange={(e) => setUnitField(i, "factor", e.target.value)}
                            disabled={u.isCanonical}
                            inputMode="decimal"
                            placeholder="fator"
                            className="w-16 rounded-[4px] border px-1.5 py-1 text-right text-[10px] font-semibold outline-none disabled:opacity-50"
                            style={{ borderColor: "#d5dbe6", color: NAVY }}
                          />
                          <label className="flex items-center gap-1 text-[9px] font-bold" style={{ color: u.isCanonical ? GOLD : MUTED }}>
                            <input type="radio" name={`canon-${atual.code}`} checked={u.isCanonical} onChange={() => marcarCanonica(i)} />
                            padrão
                          </label>
                          <button type="button" onClick={() => removeUnit(i)} className="inline-flex items-center" style={{ color: "#b4413c" }} title="Remover unidade">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {unitDraft.length < 5 && (
                        <button type="button" onClick={addUnit} className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[10px] font-bold" style={{ color: NAVY }}>
                          <Plus className="h-3 w-3" /> Adicionar unidade
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={salvarUnidades}
                        disabled={salvandoUnidades}
                        className="btn-3d inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
                        style={{ background: NAVY }}
                      >
                        {salvandoUnidades ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar unidades
                      </button>
                      {msg?.kind === "unidades" && (
                        <span className={`text-[10px] font-semibold ${msg.ok ? "text-[#3f7a3f]" : "text-[#b4413c]"}`}>{msg.texto}</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* ---------- SIGNIFICADO CLÍNICO (direção + faixas) ---------- */}
              <div className="panel-3d-sub rounded-[6px] p-3">
                <BlockTitle icon={Compass}>Significado clínico · Direção &amp; Faixas</BlockTitle>
                {naoQuant ? (
                  <div className="text-[10px] font-semibold uppercase" style={{ color: MUTED }}>
                    Exame não quantitativo — sem faixas numéricas.
                  </div>
                ) : carregandoDetalhe ? (
                  <div className="flex items-center gap-2 px-2 py-6 text-[12px]" style={{ color: MUTED }}>
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando faixas…
                  </div>
                ) : (
                  <>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                      Direção (o que é "excelente")
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

                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                      As 5 faixas (rótulo, De e Até editáveis por exame)
                    </div>
                    <div className="mb-3 space-y-1.5">
                      {slots.map((s, i) => {
                        const label = FAIXAS_POR_DIRECAO[direcao][i];
                        const cor = ZONE_COLOR[label];
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="h-6 w-1.5 shrink-0 rounded-[2px]" style={{ background: cor }} />
                            <input
                              value={s.faixaName}
                              onChange={(e) => editarRotulo(i, e.target.value)}
                              maxLength={40}
                              aria-label={`${atual.displayName} faixa ${i + 1} rótulo`}
                              placeholder={ZONE_ROTULO[label]}
                              className="min-w-0 flex-1 rounded-[4px] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white outline-none placeholder:text-white/70"
                              style={{ background: cor, border: "none" }}
                            />
                            <div className="flex shrink-0 items-center gap-1">
                              <span className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>De</span>
                              <input
                                value={fmt(s.low)}
                                onChange={(e) => editarCorte(i, "low", e.target.value)}
                                placeholder={i === 0 ? "—" : ""}
                                inputMode="decimal"
                                aria-label={`${atual.displayName} faixa ${i + 1} de`}
                                className="w-16 rounded-[4px] border px-2 py-1 text-right text-[11px] font-semibold outline-none"
                                style={{ borderColor: "#d5dbe6", color: NAVY }}
                              />
                              <span className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>Até</span>
                              <input
                                value={fmt(s.high)}
                                onChange={(e) => editarCorte(i, "high", e.target.value)}
                                placeholder={i === 4 ? "—" : ""}
                                inputMode="decimal"
                                aria-label={`${atual.displayName} faixa ${i + 1} até`}
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
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Prévia</span>
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
                        onClick={salvarFaixas}
                        disabled={salvandoFaixas || !faixasMudou}
                        className="btn-3d flex items-center gap-1.5 rounded-[6px] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
                        style={{ background: NAVY }}
                      >
                        {salvandoFaixas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar faixas
                      </button>
                      <button
                        type="button"
                        onClick={restaurar}
                        disabled={salvandoFaixas}
                        className="btn-3d-soft flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[11px] font-bold uppercase tracking-wide disabled:opacity-50"
                        style={{ color: NAVY }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                      </button>
                      {msg?.kind === "faixas" && (
                        <span className={`text-[10px] font-semibold ${msg.ok ? "text-[#3f7a3f]" : "text-[#b4413c]"}`}>{msg.texto}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
