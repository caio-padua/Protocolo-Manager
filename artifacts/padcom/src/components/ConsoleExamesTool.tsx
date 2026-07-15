import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MapPin,
  ExternalLink,
  Download,
  FileText,
  Combine,
  ArrowLeftRight,
  Undo2,
  History,
  ListChecks,
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
  type ZoneLabel,
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

// Demanda 2: procedência — de onde veio a grafia (cliente + arquivo de laudo).
interface ProcedenciaItem {
  examDocumentId: number;
  clientId: number;
  clientName: string;
  fileName: string;
  sourcePdfDriveId: string | null;
  sourcePath: string | null;
  valueRaw: string | null;
  unitRaw: string | null;
  grafiaCrua: string | null;
  collectionDate: string | null;
  createdAt: string;
  driveUrl: string | null;
}
// Curadoria: lote (batch) de uma operação englobar/transferir, para listar e desfazer.
interface LoteResumo {
  batchId: string;
  operation: "englobar" | "transferir";
  sourceCode: string | null;
  targetCode: string;
  resultados: number;
  createdAt: string | null;
  undone: boolean;
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
  sexDependent?: boolean;
  zonesMale?: ZonaDetalhe[] | null;
  zonesFemale?: ZonaDetalhe[] | null;
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
const MAX_APELIDOS = 12;
function aliasSlots(synonyms: string[]): string[] {
  const s = (synonyms ?? []).slice(0, MAX_APELIDOS);
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
  // Filtro da Sala de Triagem: qual visão a lista de exames mostra.
  // "todos" = catálogo inteiro; "nao_cadastrados" = origin='descoberto';
  // "a_conferir" e "ignorados" = itens da fila de triagem (por kind).
  const [filtroTriagem, setFiltroTriagem] = useState<"todos" | "nao_cadastrados" | "a_conferir" | "ignorados">("todos");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  // Detalhe (faixas)
  const [direcao, setDirecao] = useState<Direction>("target");
  const [slots, setSlots] = useState<Slot[]>(slotsFromZones(null, "target"));
  // Faixa por sexo: quando ligado, edita dois conjuntos (masculino/feminino).
  const [sexDependent, setSexDependent] = useState(false);
  const [slotsMale, setSlotsMale] = useState<Slot[]>(slotsFromZones(null, "target"));
  const [slotsFemale, setSlotsFemale] = useState<Slot[]>(slotsFromZones(null, "target"));
  const [refLow, setRefLow] = useState<number | null>(null);
  const [refHigh, setRefHigh] = useState<number | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [snapshot, setSnapshot] = useState("");
  const [valorTesteRaw, setValorTesteRaw] = useState("");

  // Rascunhos IDENTIDADE / MEDIDA
  const [nomeDraft, setNomeDraft] = useState("");
  const [aliasDraft, setAliasDraft] = useState<string[]>(["", "", "", "", ""]);
  const [aliasOverflow, setAliasOverflow] = useState<string[]>([]);
  const [unitDraft, setUnitDraft] = useState<UnitDraft[]>([]);

  const detalheReqRef = useRef(0);
  const [salvandoFaixas, setSalvandoFaixas] = useState(false);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [salvandoApelidos, setSalvandoApelidos] = useState(false);
  const [salvandoUnidades, setSalvandoUnidades] = useState(false);
  const [msg, setMsg] = useState<{ kind: "faixas" | "nome" | "apelidos" | "unidades"; ok: boolean; texto: string } | null>(null);

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
  // Demanda 1: revelar editores de unidade/faixa em exame "não quantitativo" (Opção A).
  const [revelarQuant, setRevelarQuant] = useState<string | null>(null);
  // Demanda 2: procedência aberta (por card da triagem ou por exame do catálogo).
  const [proc, setProc] = useState<{ key: string; loading: boolean; itens: ProcedenciaItem[] } | null>(null);
  // Guard de corrida: clique rápido A→B não deixa a resposta lenta de A sobrescrever B.
  const procReqRef = useRef(0);

  // ---- Curadoria: ENGLOBAR / TRANSFERIR / DESFAZER ----
  const [impacto, setImpacto] = useState<{ resultados: number; clientes: number; documentos: number } | null>(null);
  const impactoReqRef = useRef(0);
  const traProcReqRef = useRef(0);
  // Englobar (este exame vira apelido de outro).
  const [engTarget, setEngTarget] = useState<string>("");
  const [engBusca, setEngBusca] = useState("");
  const [engConfirmOficial, setEngConfirmOficial] = useState(false);
  const [engBusy, setEngBusy] = useState(false);
  // Opção B do CEO (15/07/2026): antes de englobar, escolher QUAL nome vence como
  // PADRÃO — o exame aberto ("atual") ou o escolhido na lista ("destino").
  const [engVencedor, setEngVencedor] = useState<"" | "destino" | "atual">("");
  // Transferir (mover resultados deste exame para outro).
  const [traTarget, setTraTarget] = useState<string>("");
  const [traBusca, setTraBusca] = useState("");
  const [traTodas, setTraTodas] = useState(true);
  const [traSel, setTraSel] = useState<Record<number, number>>({}); // examDocumentId -> clientId
  const [traProc, setTraProc] = useState<{ loading: boolean; itens: ProcedenciaItem[] } | null>(null);
  const [traBusy, setTraBusy] = useState(false);
  // Operações recentes + desfazer.
  const [lotes, setLotes] = useState<LoteResumo[]>([]);
  const [undoBusy, setUndoBusy] = useState<string | null>(null);
  const [curMsg, setCurMsg] = useState<{ kind: "eng" | "tra" | "undo"; ok: boolean; texto: string } | null>(null);
  const abrirProcedencia = (key: string, url: string) => {
    if (proc && proc.key === key) {
      setProc(null);
      return;
    }
    const reqId = ++procReqRef.current;
    setProc({ key, loading: true, itens: [] });
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("proc"))))
      .then((d: { itens?: ProcedenciaItem[] }) => {
        if (procReqRef.current === reqId) setProc({ key, loading: false, itens: d.itens ?? [] });
      })
      .catch(() => {
        if (procReqRef.current === reqId) setProc({ key, loading: false, itens: [] });
      });
  };
  const renderProcPanel = (key: string) => {
    if (!proc || proc.key !== key) return null;
    return (
      <div className="panel-3d-sub mt-1.5 w-full rounded-[6px] p-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: NAVY }}>
          <MapPin className="h-3 w-3" style={{ color: GOLD }} /> Procedência — de onde veio esta grafia
        </div>
        {proc.loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-[11px]" style={{ color: MUTED }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando origem…
          </div>
        ) : proc.itens.length === 0 ? (
          <div className="px-2 py-2 text-[10px] font-semibold" style={{ color: MUTED }}>
            Nenhuma origem encontrada para esta grafia.
          </div>
        ) : (
          <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
            {proc.itens.map((p) => (
              <div key={p.examDocumentId} className="concave-3d rounded-[6px] px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: NAVY }}>
                  <FileText className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
                  <span className="truncate">{p.clientName}</span>
                </div>
                <div className="mt-0.5 truncate text-[9px] font-semibold" style={{ color: MUTED }} title={p.fileName}>
                  {p.fileName}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px]" style={{ color: MUTED }}>
                  {(p.valueRaw || p.unitRaw) && (
                    <span>
                      Valor: <b style={{ color: NAVY }}>{[p.valueRaw, p.unitRaw].filter(Boolean).join(" ")}</b>
                    </span>
                  )}
                  {p.collectionDate && <span>Coleta: {p.collectionDate.split("-").reverse().join("/")}</span>}
                  {p.grafiaCrua && <span className="truncate">Grafia: “{p.grafiaCrua}”</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {p.sourcePdfDriveId ? (
                    <>
                      {p.driveUrl && (
                        <a
                          href={p.driveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide"
                          style={{ color: NAVY }}
                        >
                          <ExternalLink className="h-3 w-3" /> Abrir no Drive
                        </a>
                      )}
                      <a
                        href={`${BASE}/api/exames-lab/documento/${p.examDocumentId}/arquivo`}
                        className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide"
                        style={{ color: GOLD }}
                      >
                        <Download className="h-3 w-3" /> Baixar
                      </a>
                    </>
                  ) : (
                    <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                      arquivo não está no Drive
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ---- Curadoria: cargas + ações ----
  const carregarLotes = useCallback(() => {
    fetch(`${BASE}/api/exames-lab/reassignments?limit=20`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("lotes"))))
      .then((d: { lotes?: LoteResumo[] }) => setLotes(d.lotes ?? []))
      .catch(() => {
        /* silencioso: painel auxiliar */
      });
  }, []);

  const carregarTraProc = () => {
    const alvo = selecionado;
    if (!alvo) return;
    // Guard de corrida: troca rápida A→B não pode deixar a resposta lenta de A
    // sobrescrever os laudos de B. Só aplica se o pedido ainda for o vigente E
    // o exame selecionado ainda for o mesmo de quando a busca começou.
    const reqId = ++traProcReqRef.current;
    setTraProc({ loading: true, itens: [] });
    fetch(`${BASE}/api/exames-lab/catalogo/${encodeURIComponent(alvo)}/procedencia`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("proc"))))
      .then((d: { itens?: ProcedenciaItem[] }) => {
        if (traProcReqRef.current !== reqId) return;
        setTraProc({ loading: false, itens: d.itens ?? [] });
      })
      .catch(() => {
        if (traProcReqRef.current !== reqId) return;
        setTraProc({ loading: false, itens: [] });
      });
  };

  const executarEnglobar = () => {
    if (!selecionado || !engTarget || !engVencedor) return;
    // O VENCEDOR (escolhido na pergunta "qual nome fica como padrão?") é sempre o
    // destino da fusão; o outro é absorvido e vira apelido.
    const src = engVencedor === "destino" ? selecionado : engTarget;
    const tgt = engVencedor === "destino" ? engTarget : selecionado;
    setEngBusy(true);
    setCurMsg(null);
    fetch(`${BASE}/api/exames-lab/exames/englobar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceCode: src, targetCode: tgt, confirmOficial: engConfirmOficial }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Falha ao englobar.");
        return d as { moved: number; aliasesAdded: string[]; sourceDeactivated: boolean };
      })
      .then((d) => {
        setCurMsg({
          kind: "eng",
          ok: true,
          texto: `Englobado: ${d.moved} resultado(s) movido(s)${d.aliasesAdded.length ? `, ${d.aliasesAdded.length} apelido(s) absorvido(s)` : ""}${d.sourceDeactivated ? ", origem desativada" : ""}.`,
        });
        setEngTarget("");
        setEngBusca("");
        setEngConfirmOficial(false);
        setEngVencedor("");
        setSelecionado(tgt); // vai para o exame VENCEDOR (o que ficou como padrão)
        carregar();
        carregarLotes();
      })
      .catch((e) => setCurMsg({ kind: "eng", ok: false, texto: (e as Error).message }))
      .finally(() => setEngBusy(false));
  };

  const executarTransferir = async () => {
    const src = selecionado;
    const tgt = traTarget;
    if (!src || !tgt) return;
    setTraBusy(true);
    setCurMsg(null);
    try {
      let moved = 0;
      const post = async (body: Record<string, unknown>) => {
        const r = await fetch(`${BASE}/api/exames-lab/exames/transferir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { error?: string }).error || "Falha ao transferir.");
        return (d as { moved: number }).moved;
      };
      const sel = Object.entries(traSel);
      if (traTodas || sel.length === 0) {
        moved = await post({ targetCode: tgt, sourceCode: src });
      } else {
        // Por documento: um lote por laudo escolhido (cada um desfaz-se em separado).
        for (const [docId, clientId] of sel) {
          moved += await post({ targetCode: tgt, sourceCode: src, examDocumentId: Number(docId), clientId });
        }
      }
      setCurMsg({ kind: "tra", ok: true, texto: `Transferido: ${moved} resultado(s).` });
      setTraTarget("");
      setTraBusca("");
      setTraSel({});
      setTraTodas(true);
      setTraProc(null);
      carregar();
      carregarLotes();
    } catch (e) {
      setCurMsg({ kind: "tra", ok: false, texto: (e as Error).message });
    } finally {
      setTraBusy(false);
    }
  };

  const executarDesfazer = (batchId: string) => {
    setUndoBusy(batchId);
    setCurMsg(null);
    fetch(`${BASE}/api/exames-lab/reassignments/${batchId}/desfazer`, { method: "POST" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Falha ao desfazer.");
        return d as { undone: number; reactivatedSource: boolean; aliasesRemoved: string[] };
      })
      .then((d) => {
        setCurMsg({
          kind: "undo",
          ok: true,
          texto: `Desfeito: ${d.undone} resultado(s) restaurado(s)${d.reactivatedSource ? ", origem reativada" : ""}.`,
        });
        carregar();
        carregarLotes();
      })
      .catch((e) => setCurMsg({ kind: "undo", ok: false, texto: (e as Error).message }))
      .finally(() => setUndoBusy(null));
  };

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

  useEffect(() => {
    carregarLotes();
  }, [carregarLotes]);

  // Ao trocar o exame selecionado: buscar a prévia de impacto e zerar os rascunhos
  // de englobar/transferir (evita vazar o alvo de um exame para o próximo).
  useEffect(() => {
    setEngTarget("");
    setEngBusca("");
    setEngConfirmOficial(false);
    setEngVencedor("");
    setTraTarget("");
    setTraBusca("");
    setTraTodas(true);
    setTraSel({});
    setTraProc(null);
    // Invalida qualquer busca de laudos em voo do exame anterior (guard de corrida).
    traProcReqRef.current++;
    setCurMsg(null);
    if (!selecionado) {
      setImpacto(null);
      return;
    }
    const reqId = ++impactoReqRef.current;
    fetch(`${BASE}/api/exames-lab/exames/${encodeURIComponent(selecionado)}/impacto`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("impacto"))))
      .then((d: { resultados: number; clientes: number; documentos: number }) => {
        if (impactoReqRef.current === reqId) {
          setImpacto({ resultados: d.resultados, clientes: d.clientes, documentos: d.documentos });
        }
      })
      .catch(() => {
        if (impactoReqRef.current === reqId) setImpacto(null);
      });
  }, [selecionado]);

  const rodarFaxina = useCallback(() => {
    setTriFaxinando(true);
    setTriResumo(null);
    fetch(`${BASE}/api/exames-lab/triagem/backfill`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("backfill"))))
      .then((d: { apelidos: number; novos: number; ambiguos: number; naoExames: number; linhasCarimbadas: number }) => {
        setTriResumo(
          `Faxina concluída: ${d.apelidos} apelido(s) absorvido(s), ${d.novos} exame(s) novo(s) criado(s) marcado(s) NÃO CADASTRADO, ` +
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
    let base = rows.filter((r) => r.inCatalog);
    if (filtroTriagem === "nao_cadastrados") base = base.filter((r) => r.origin === "descoberto");
    const q = norm(busca.trim());
    if (!q) return base;
    return base.filter(
      (r) =>
        norm(r.displayName).includes(q) ||
        norm(r.grupo ?? "").includes(q) ||
        (r.synonyms ?? []).some((s) => norm(s).includes(q)),
    );
  }, [rows, busca, filtroTriagem]);

  const atual = rows.find((r) => r.code === selecionado) ?? null;

  // Busca de exame DESTINO (para englobar/transferir): lista rolável de exames
  // do catálogo, exceto o próprio exame de origem.
  const renderExamPicker = (value: string, onPick: (code: string) => void, texto: string, setTexto: (s: string) => void) => {
    const q = norm(texto.trim());
    const opts = rows
      .filter((r) => r.inCatalog && r.code !== selecionado)
      .filter((r) => !q || norm(r.displayName).includes(q) || (r.synonyms ?? []).some((s) => norm(s).includes(q)))
      .slice(0, 40);
    const picked = rows.find((r) => r.code === value) ?? null;
    return (
      <div>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar exame destino…"
          className="w-full rounded-[4px] border px-2 py-1 text-[11px] font-semibold outline-none"
          style={{ borderColor: "#d5dbe6", color: NAVY }}
        />
        {picked && (
          <div className="mt-1 text-[10px] font-bold" style={{ color: GOLD }}>
            Destino: {picked.displayName}
          </div>
        )}
        <div className="concave-3d mt-1.5 max-h-[160px] space-y-1 overflow-y-auto rounded-[6px] p-1">
          {opts.length === 0 ? (
            <div className="px-2 py-2 text-[10px] font-semibold" style={{ color: MUTED }}>
              Nenhum exame encontrado.
            </div>
          ) : (
            opts.map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => onPick(o.code)}
                className={`flex w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1 text-left text-[11px] font-semibold ${o.code === value ? "btn-3d" : "btn-3d-soft"}`}
                style={o.code === value ? { background: NAVY, color: "#fff" } : { color: NAVY }}
              >
                <span className="truncate">{o.displayName}</span>
                <span className="shrink-0 text-[9px]" style={{ color: o.code === value ? "#fff" : MUTED }}>
                  {o.count}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  };

  const carregarDetalhe = useCallback((row: FusedRow) => {
    // Guard de corrida: clique A→B rápido não pode deixar a resposta lenta de A
    // sobrescrever o detalhe de B. Só aplica se este ainda for o pedido vigente.
    const reqId = ++detalheReqRef.current;
    const vigente = () => detalheReqRef.current === reqId;
    setCarregandoDetalhe(true);
    setMsg(null);
    setRevelarQuant(null);
    setProc(null);
    // rascunhos de identidade/medida vêm da linha do catálogo (já em memória)
    setNomeDraft(row.displayName);
    setAliasDraft(aliasSlots(row.synonyms));
    setAliasOverflow((row.synonyms ?? []).slice(MAX_APELIDOS));
    setUnitDraft(unitDraftFrom(row.units));
    // faixas: detalhe autoritativo (traz refLow/refHigh p/ a prévia)
    fetch(`${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(row.code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("faixas"))))
      .then((resp: FaixasResp) => {
        if (!vigente()) return;
        const dir = resp.direction ?? row.direction;
        const novos = slotsFromZones(resp.zones ?? row.zones, dir);
        // Cada sexo cai no conjunto geral ('any') quando ainda não foi curado.
        const male = slotsFromZones(resp.zonesMale ?? resp.zones ?? row.zones, dir);
        const female = slotsFromZones(resp.zonesFemale ?? resp.zones ?? row.zones, dir);
        const sd = resp.sexDependent ?? false;
        setDirecao(dir);
        setSlots(novos);
        setSlotsMale(male);
        setSlotsFemale(female);
        setSexDependent(sd);
        setRefLow(resp.refLow);
        setRefHigh(resp.refHigh);
        setSnapshot(JSON.stringify({ direction: dir, slots: novos, sexDependent: sd, male, female }));
      })
      .catch(() => {
        if (!vigente()) return;
        // fallback: usa as zonas já vindas do catálogo
        const novos = slotsFromZones(row.zones, row.direction);
        setDirecao(row.direction);
        setSlots(novos);
        setSlotsMale(novos);
        setSlotsFemale(novos);
        setSexDependent(false);
        setRefLow(null);
        setRefHigh(null);
        setSnapshot(JSON.stringify({ direction: row.direction, slots: novos, sexDependent: false, male: novos, female: novos }));
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
  // Editores genéricos: recebem o setter do conjunto (geral, masculino ou feminino).
  const editarCorteEm = (setter: Dispatch<SetStateAction<Slot[]>>, i: number, campo: "low" | "high", valor: string) => {
    const n = parseNum(valor);
    setter((prev) => {
      const next = prev.map((s) => ({ ...s }));
      next[i][campo] = n;
      if (campo === "high" && i < 4) next[i + 1].low = n;
      if (campo === "low" && i > 0) next[i - 1].high = n;
      return next;
    });
  };
  // Rótulo livre por faixa, independente por exame (backend aceita até 40 chars).
  const editarRotuloEm = (setter: Dispatch<SetStateAction<Slot[]>>, i: number, valor: string) => {
    setter((prev) => prev.map((s, j) => (j === i ? { ...s, faixaName: valor } : s)));
  };

  // Monta as 5 zonas de um conjunto de slots, com rótulo e cor por posição/direção.
  const zonesDeSlots = (src: Slot[], labels: readonly ZoneLabel[]) =>
    src.map((s, i) => ({
      faixaName: (s.faixaName.trim() || ZONE_ROTULO[labels[i]]).slice(0, 40),
      low: s.low,
      high: s.high,
      color: ZONE_COLOR[labels[i]],
      ordem: i + 1,
    }));

  const salvarFaixas = async () => {
    if (!atual) return;
    setSalvandoFaixas(true);
    setMsg(null);
    const labels = FAIXAS_POR_DIRECAO[direcao];
    const put = (body: Record<string, unknown>) =>
      fetch(`${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(atual.code)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("save"))));
    try {
      if (sexDependent) {
        // Dois conjuntos: masculino e feminino. A flag sexDependent viaja no 1º PUT.
        await put({
          direction: direcao,
          displayName: atual.displayName,
          sex: "male",
          sexDependent: true,
          zones: zonesDeSlots(slotsMale, labels),
        });
        await put({
          direction: direcao,
          displayName: atual.displayName,
          sex: "female",
          zones: zonesDeSlots(slotsFemale, labels),
        });
      } else {
        await put({
          direction: direcao,
          displayName: atual.displayName,
          sex: "any",
          sexDependent: false,
          zones: zonesDeSlots(slots, labels),
        });
      }
      const zonesGeral = zonesDeSlots(slots, labels);
      setRows((prev) =>
        prev.map((r) =>
          r.code === atual.code
            ? { ...r, direction: direcao, hasManualEdit: true, quantitativo: true, zones: zonesGeral.map((z) => ({ ...z })) }
            : r,
        ),
      );
      setSnapshot(JSON.stringify({ direction: direcao, slots, sexDependent, male: slotsMale, female: slotsFemale }));
      setMsg({ kind: "faixas", ok: true, texto: "Faixas salvas. O motor já usa os novos cortes (Cockpit)." });
    } catch {
      setMsg({ kind: "faixas", ok: false, texto: "Falha ao salvar as faixas." });
    } finally {
      setSalvandoFaixas(false);
    }
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

  // Renomeia o NOME PADRAO. O code (identidade) fica fixo; o nome anterior vira
  // apelido automatico no backend — zero perda.
  const salvarNome = () => {
    if (!atual) return;
    const nome = nomeDraft.trim();
    if (!nome || nome === atual.displayName) return;
    setSalvandoNome(true);
    setMsg(null);
    fetch(`${BASE}/api/exames-lab/catalogo/renomear`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: atual.code, novoNome: nome, nomeAtual: atual.displayName }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Falha ao salvar o nome.");
        return j;
      })
      .then((j) => {
        const displayName: string = j.displayName ?? nome;
        const synonyms: string[] = j.synonyms ?? [];
        setRows((prev) =>
          prev.map((x) =>
            x.code === atual.code ? { ...x, displayName, synonyms, inCatalog: true } : x,
          ),
        );
        setNomeDraft(displayName);
        setAliasDraft(aliasSlots(synonyms));
        setAliasOverflow(synonyms.slice(MAX_APELIDOS));
        setMsg({
          kind: "nome",
          ok: true,
          texto: "Nome salvo. O nome anterior virou apelido — nada se perdeu.",
        });
      })
      .catch((e) => setMsg({ kind: "nome", ok: false, texto: (e as Error).message }))
      .finally(() => setSalvandoNome(false));
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
        setAliasOverflow(synonyms.slice(MAX_APELIDOS));
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
  const faixasMudou =
    snapshot !== JSON.stringify({ direction: direcao, slots, sexDependent, male: slotsMale, female: slotsFemale });

  // Renderiza um conjunto editável de 5 faixas + a prévia. Reusado pela coluna
  // única (geral) e pelas duas colunas (masculino/feminino) quando varia por sexo.
  const colunaFaixas = (colSlots: Slot[], setter: Dispatch<SetStateAction<Slot[]>>, kp: string) => (
    <>
      <div className="mb-3 space-y-1.5">
        {colSlots.map((s, i) => {
          const label = FAIXAS_POR_DIRECAO[direcao][i];
          const cor = ZONE_COLOR[label];
          return (
            <div key={`${kp}-${i}`} className="flex items-center gap-2">
              <span className="h-6 w-1.5 shrink-0 rounded-[2px]" style={{ background: cor }} />
              <input
                value={s.faixaName}
                onChange={(e) => editarRotuloEm(setter, i, e.target.value)}
                maxLength={40}
                aria-label={`${atual?.displayName ?? ""} ${kp} faixa ${i + 1} rótulo`}
                placeholder={ZONE_ROTULO[label]}
                className="min-w-0 flex-1 rounded-[4px] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white outline-none placeholder:text-white/70"
                style={{ background: cor, border: "none" }}
              />
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>De</span>
                <input
                  value={fmt(s.low)}
                  onChange={(e) => editarCorteEm(setter, i, "low", e.target.value)}
                  placeholder={i === 0 ? "—" : ""}
                  inputMode="decimal"
                  aria-label={`${atual?.displayName ?? ""} ${kp} faixa ${i + 1} de`}
                  className="w-16 rounded-[4px] border px-2 py-1 text-right text-[11px] font-semibold outline-none"
                  style={{ borderColor: "#d5dbe6", color: NAVY }}
                />
                <span className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>Até</span>
                <input
                  value={fmt(s.high)}
                  onChange={(e) => editarCorteEm(setter, i, "high", e.target.value)}
                  placeholder={i === 4 ? "—" : ""}
                  inputMode="decimal"
                  aria-label={`${atual?.displayName ?? ""} ${kp} faixa ${i + 1} até`}
                  className="w-16 rounded-[4px] border px-2 py-1 text-right text-[11px] font-semibold outline-none"
                  style={{ borderColor: "#d5dbe6", color: NAVY }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <BarraFaixas slots={colSlots} direction={direcao} valor={valorLeitura} fonte={fonteLeitura} />
    </>
  );

  const totalRevisado = rows.filter((r) => r.quantitativo && r.hasManualEdit).length;
  const totalQuant = rows.filter((r) => r.quantitativo).length;
  const naoQuant = atual != null && !atual.quantitativo;
  // Demanda 1: editores liberados quando o exame já é quantitativo OU quando o usuário revelou.
  const editorLiberado = !naoQuant || (atual != null && revelarQuant === atual.code);
  const tornarQuant = () => {
    if (!atual) return;
    setRevelarQuant(atual.code);
    setUnitDraft((prev) => (prev.length === 0 ? [{ unit: "", factor: "", isCanonical: true }] : prev));
  };

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
        <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
          <Wand2 className="h-4 w-4" style={{ color: GOLD }} /> Sala de Triagem
        </div>

        <div className="flex flex-wrap items-start gap-4">
          {/* Coluna de botões-filtro à ESQUERDA: largura FIXA, empilhados — as bordas
              formam as linhas verticais imaginárias (Padrão 12 / grade imaginária).
              Cada linha: ícone | rótulo | contagem em slot fixo à direita.
              Não selecionado = Saliente (up bevel); SELECIONADO = AFUNDADO (concave-3d,
              impressão de pressionado) + neon RESPIRANDO (paxter-neon-breathe). */}
          <div className="flex w-[220px] shrink-0 flex-col gap-1.5">
            {(
              [
                { id: "todos", rotulo: "Todos os exames", Icone: ListChecks, cor: NAVY, glow: "hsl(187 72% 48% / 0.55)", n: null as number | null },
                { id: "nao_cadastrados", rotulo: "Não cadastrados", Icone: Sparkles, cor: GOLD, glow: "hsl(42 65% 52% / 0.6)", n: triTot.descobertos },
                { id: "a_conferir", rotulo: "A conferir", Icone: AlertTriangle, cor: "#b4413c", glow: "hsl(0 70% 55% / 0.55)", n: triTot.ambiguos },
                { id: "ignorados", rotulo: "Ignorados", Icone: Ban, cor: MUTED, glow: "hsl(200 10% 55% / 0.5)", n: triTot.naoExames },
              ] as const
            ).map((f) => {
              const ativo = filtroTriagem === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroTriagem(f.id)}
                  aria-pressed={ativo}
                  className={`${ativo ? "concave-3d paxter-neon-breathe" : "btn-3d-soft"} grid grid-cols-[16px_minmax(0,1fr)_2.5rem] items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-left text-[9px] font-black uppercase tracking-wide`}
                  style={{ color: f.cor, ...(ativo ? ({ "--neon-glow": f.glow } as React.CSSProperties) : null) }}
                  title={`Mostrar na lista: ${f.rotulo}`}
                >
                  <f.Icone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{f.rotulo}</span>
                  <span className="text-right tabular-nums">{f.n === null ? "—" : f.n}</span>
                </button>
              );
            })}
          </div>

          {/* COMO FUNCIONA — passo a passo em degraus numerados (TDAH/TOC-friendly):
              cada passo é UMA linha curta com número em medalha e resultado em cor
              semântica; substitui o parágrafo linear cansativo. */}
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <div className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
              Como funciona
            </div>
            {(
              [
                { n: 1, texto: "O laudo chega e a FAXINA lê cada grafia de exame.", cor: NAVY },
                { n: 2, texto: "Grafia conhecida → vira apelido sozinha. Nada a fazer.", cor: "#3f7a3f" },
                { n: 3, texto: "Exame novo → entra ativo como NÃO CADASTRADO (confira quando puder).", cor: GOLD },
                { n: 4, texto: "Dúvida → fica em quarentena em A CONFERIR (você decide aqui).", cor: "#b4413c" },
                { n: 5, texto: "Não é exame → vai para IGNORADOS. Nada se perde.", cor: MUTED },
              ] as const
            ).map((p) => (
              <div key={p.n} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-1.5">
                <span
                  className="concave-3d inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black tabular-nums"
                  style={{ color: p.cor }}
                >
                  {p.n}
                </span>
                <span className="pt-0.5 text-[10px] font-semibold leading-snug" style={{ color: NAVY }}>
                  {p.texto}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
                    title="Criar como exame novo (entra marcado NÃO CADASTRADO)"
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
                  <button
                    type="button"
                    onClick={() => abrirProcedencia(`triagem:${t.id}`, `${BASE}/api/exames-lab/triagem/${t.id}/procedencia`)}
                    className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide"
                    style={{ color: proc?.key === `triagem:${t.id}` ? GOLD : MUTED }}
                    title="Ver de onde veio esta grafia (cliente e arquivo de laudo)"
                  >
                    <MapPin className="h-3 w-3" /> Procedência
                  </button>
                </div>

                {triErro && triErro.id === t.id && (
                  <div className="w-full rounded-[6px] px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: "#f7e4e2", color: "#b4413c" }}>
                    {triErro.texto}
                  </div>
                )}

                {renderProcPanel(`triagem:${t.id}`)}

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
                                não cadastrado
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
                  title="Abrir exame NÃO CADASTRADO"
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
          {/* Título da lista em placa Saliente (Padrão 3): muda conforme o botão-filtro selecionado. */}
          <div
            className="bevel-3d mb-2 inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em]"
            style={{
              color:
                filtroTriagem === "nao_cadastrados"
                  ? GOLD
                  : filtroTriagem === "a_conferir"
                    ? "#b4413c"
                    : filtroTriagem === "ignorados"
                      ? MUTED
                      : NAVY,
            }}
          >
            {filtroTriagem === "todos" && (
              <>
                <ListChecks className="h-3.5 w-3.5" /> Todos os exames
              </>
            )}
            {filtroTriagem === "nao_cadastrados" && (
              <>
                <Sparkles className="h-3.5 w-3.5" /> Exames não cadastrados
              </>
            )}
            {filtroTriagem === "a_conferir" && (
              <>
                <AlertTriangle className="h-3.5 w-3.5" /> Fila a conferir
              </>
            )}
            {filtroTriagem === "ignorados" && (
              <>
                <Ban className="h-3.5 w-3.5" /> Ignorados (não são exame)
              </>
            )}
          </div>
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

          {!carregando && !erro && (filtroTriagem === "a_conferir" || filtroTriagem === "ignorados") && (
            <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
              {(() => {
                const kindAlvo = filtroTriagem === "a_conferir" ? "ambiguo" : "nao_exame";
                const q = norm(busca.trim());
                const itens = triPend
                  .filter((t) => t.kind === kindAlvo)
                  .filter((t) => !q || norm(t.sampleName).includes(q));
                if (itens.length === 0) {
                  return (
                    <div className="px-2 py-4 text-[12px]" style={{ color: MUTED }}>
                      {filtroTriagem === "a_conferir"
                        ? "Nenhuma grafia aguardando conferência."
                        : "Nenhuma grafia ignorada."}
                    </div>
                  );
                }
                return itens.map((t, idx) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTriAberta(true)}
                    className="btn-3d-soft grid w-full grid-cols-[2.25rem_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-[6px] px-3 py-2 text-left"
                    title="Abrir a fila da Sala de Triagem para decidir esta grafia"
                  >
                    <span className="text-right text-[10px] font-black tabular-nums" style={{ color: MUTED }}>
                      {idx + 1}.
                    </span>
                    <span className="min-w-0 truncate text-[12px] font-bold" style={{ color: NAVY }}>
                      {t.sampleName}
                    </span>
                    <span className="text-right text-[9px] font-black uppercase tabular-nums" style={{ color: MUTED }}>
                      {t.occurrences}×
                    </span>
                  </button>
                ));
              })()}
            </div>
          )}

          {!carregando && !erro && filtroTriagem !== "a_conferir" && filtroTriagem !== "ignorados" && (
            <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
              {filtrados.length === 0 && (
                <div className="px-2 py-4 text-[12px]" style={{ color: MUTED }}>
                  Nenhum exame encontrado para "{busca}".
                </div>
              )}
              {filtrados.map((it, idx) => {
                const ativo = it.code === selecionado;
                return (
                  <button
                    key={it.code}
                    type="button"
                    onClick={() => escolher(it)}
                    className={`flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left ${ativo ? "btn-3d" : "btn-3d-soft"}`}
                    style={ativo ? { background: NAVY } : undefined}
                  >
                    <span className="w-9 shrink-0 text-right text-[10px] font-black tabular-nums" style={{ color: ativo ? "rgba(255,255,255,0.7)" : MUTED }}>
                      {idx + 1}.
                    </span>
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
                      {atual.origin === "descoberto" ? "Não cadastrado" : "Catálogo"}
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
                <BlockTitle icon={Tags}>Identidade · Nome e Apelidos</BlockTitle>
                <div className="mb-3">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                    Nome padrão (como aparece nas telas e laudos)
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={nomeDraft}
                      onChange={(e) => setNomeDraft(e.target.value)}
                      placeholder="Nome padrão do exame"
                      className="min-w-0 flex-1 rounded-[4px] border px-2 py-1 text-[12px] font-semibold outline-none"
                      style={{ borderColor: "#d5dbe6", color: NAVY }}
                    />
                    <button
                      type="button"
                      onClick={salvarNome}
                      disabled={
                        salvandoNome || !nomeDraft.trim() || nomeDraft.trim() === (atual?.displayName ?? "")
                      }
                      className="btn-3d inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
                      style={{ background: NAVY }}
                    >
                      {salvandoNome ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Salvar nome
                    </button>
                  </div>
                  <div className="mt-1 text-[9px]" style={{ color: MUTED }}>
                    Ao renomear, o nome anterior vira apelido automático. Nada se perde.
                  </div>
                  {msg?.kind === "nome" && (
                    <span className={`mt-0.5 block text-[10px] font-semibold ${msg.ok ? "text-[#3f7a3f]" : "text-[#b4413c]"}`}>
                      {msg.texto}
                    </span>
                  )}
                </div>
                <div className="mb-2 text-[10px]" style={{ color: MUTED }}>
                  Até {MAX_APELIDOS} apelidos (como o laudo pode escrever este exame). A varredura já procura por eles.
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
                {aliasDraft.length < MAX_APELIDOS && (
                  <button
                    type="button"
                    onClick={() => setAliasDraft((d) => (d.length < MAX_APELIDOS ? [...d, ""] : d))}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-[4px] border px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                    style={{ borderColor: "#d5dbe6", color: NAVY }}
                  >
                    + Apelido ({aliasDraft.length}/{MAX_APELIDOS})
                  </button>
                )}
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
                {!editorLiberado ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-semibold uppercase" style={{ color: MUTED }}>
                      Exame não quantitativo — sem unidade numérica.
                    </div>
                    <button
                      type="button"
                      onClick={tornarQuant}
                      className="btn-3d-soft inline-flex items-center gap-1 self-start rounded-[6px] px-2 py-1.5 text-[10px] font-bold"
                      style={{ color: NAVY }}
                    >
                      <Plus className="h-3 w-3" /> Tornar quantitativo (cadastrar unidade e faixas)
                    </button>
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
                {!editorLiberado ? (
                  <div className="text-[10px] font-semibold uppercase" style={{ color: MUTED }}>
                    Exame não quantitativo — cadastre a unidade acima para liberar as faixas.
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

                    {/* Toggle: varia por sexo? Liga as duas colunas (masc/fem). */}
                    <div className="mb-3 flex items-center justify-between rounded-[6px] px-2 py-2" style={{ background: "#f3f6fb" }}>
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: NAVY }}>
                          Varia por sexo?
                        </div>
                        <div className="text-[9px] font-semibold" style={{ color: MUTED }}>
                          Ligue para curar faixas distintas para masculino e feminino (ex.: hormônios).
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={sexDependent}
                        aria-label="Varia por sexo"
                        onClick={() =>
                          setSexDependent((on) => {
                            const novo = !on;
                            // Ao ligar, semeia os dois lados a partir do conjunto geral atual.
                            if (novo) {
                              setSlotsMale((m) => (m.length ? m : slots.map((s) => ({ ...s }))));
                              setSlotsFemale((f) => (f.length ? f : slots.map((s) => ({ ...s }))));
                            }
                            return novo;
                          })
                        }
                        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                        style={{ background: sexDependent ? GOLD : "#c2cdde" }}
                      >
                        <span
                          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                          style={{ left: sexDependent ? "1.375rem" : "0.125rem" }}
                        />
                      </button>
                    </div>

                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                        As 5 faixas (rótulo, De e Até editáveis por exame)
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

                    {sexDependent ? (
                      <div className="mb-3 grid gap-3 lg:grid-cols-2">
                        <div className="panel-3d-sub rounded-[6px] p-2">
                          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em]" style={{ color: NAVY }}>
                            Masculino
                          </div>
                          {colunaFaixas(slotsMale, setSlotsMale, "masc")}
                        </div>
                        <div className="panel-3d-sub rounded-[6px] p-2">
                          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em]" style={{ color: NAVY }}>
                            Feminino
                          </div>
                          {colunaFaixas(slotsFemale, setSlotsFemale, "fem")}
                        </div>
                      </div>
                    ) : (
                      <div className="mb-3">{colunaFaixas(slots, setSlots, "geral")}</div>
                    )}

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

              {/* ---------- PROCEDÊNCIA (de onde vieram os resultados) ---------- */}
              <div className="panel-3d-sub rounded-[6px] p-3">
                <BlockTitle icon={MapPin}>Procedência · de onde vieram os resultados</BlockTitle>
                <div className="mb-2 text-[10px]" style={{ color: MUTED }}>
                  Clientes e arquivos de laudo que originaram este exame. Abra no Drive ou baixe pelo sistema para conferir a fonte.
                </div>
                <button
                  type="button"
                  onClick={() =>
                    abrirProcedencia(
                      `code:${atual.code}`,
                      `${BASE}/api/exames-lab/catalogo/${encodeURIComponent(atual.code)}/procedencia`,
                    )
                  }
                  className="btn-3d-soft inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: proc?.key === `code:${atual.code}` ? GOLD : NAVY }}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {proc?.key === `code:${atual.code}` ? "Ocultar procedência" : "Ver procedência"}
                </button>
                {renderProcPanel(`code:${atual.code}`)}
              </div>

              {/* ---------- ENGLOBAR (este exame vira apelido de outro) ---------- */}
              <div className="panel-3d-sub rounded-[6px] p-3">
                <BlockTitle icon={Combine}>Englobar neste padrão</BlockTitle>
                <div className="mb-2 text-[10px]" style={{ color: MUTED }}>
                  Funde <b style={{ color: NAVY }}>{atual.displayName}</b> com outro exame do catálogo: você escolhe
                  qual nome fica como PADRÃO; o outro é absorvido (resultados movidos, grafias viram apelidos) e
                  <b> desativado</b>. Reversível pelo botão Desfazer.
                </div>
                <div className="concave-3d mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[6px] px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: NAVY }}>
                  <span>Impacto:</span>
                  <span>{impacto?.resultados ?? atual.count} resultado(s)</span>
                  <span style={{ color: MUTED }}>·</span>
                  <span>{impacto?.clientes ?? "—"} cliente(s)</span>
                  <span style={{ color: MUTED }}>·</span>
                  <span>{impacto?.documentos ?? "—"} laudo(s)</span>
                </div>
                {renderExamPicker(
                  engTarget,
                  (code) => {
                    setEngTarget(code);
                    setEngVencedor("");
                    setEngConfirmOficial(false);
                  },
                  engBusca,
                  setEngBusca,
                )}
                {(() => {
                  const destinoRow = rows.find((r) => r.code === engTarget) ?? null;
                  const absorvido = engVencedor === "destino" ? atual : engVencedor === "atual" ? destinoRow : null;
                  const precisaConfirm = absorvido?.origin === "catalogo";
                  return (
                    <>
                      {engTarget && destinoRow && (
                        <div className="concave-3d mt-2 rounded-[6px] px-3 py-2">
                          <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide" style={{ color: NAVY }}>
                            Qual nome fica como PADRÃO?
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEngVencedor("atual")}
                              className={`${engVencedor === "atual" ? "concave-3d" : "bevel-3d"} rounded-[6px] px-3 py-1.5 text-left text-[10px] font-bold`}
                              style={{ color: NAVY }}
                            >
                              {atual.displayName} <span className="font-black uppercase">vira o padrão</span>
                              <span style={{ color: MUTED }}> · {destinoRow.displayName} vira apelido</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEngVencedor("destino")}
                              className={`${engVencedor === "destino" ? "concave-3d" : "bevel-3d"} rounded-[6px] px-3 py-1.5 text-left text-[10px] font-bold`}
                              style={{ color: NAVY }}
                            >
                              {destinoRow.displayName} <span className="font-black uppercase">vira o padrão</span>
                              <span style={{ color: MUTED }}> · {atual.displayName} vira apelido</span>
                            </button>
                          </div>
                        </div>
                      )}
                      {precisaConfirm && absorvido && (
                        <label className="mt-2 flex items-start gap-1.5 text-[10px] font-semibold" style={{ color: "#b4413c" }}>
                          <input
                            type="checkbox"
                            checked={engConfirmOficial}
                            onChange={(e) => setEngConfirmOficial(e.target.checked)}
                            className="mt-0.5"
                          />
                          {absorvido.displayName} é um exame OFICIAL do catálogo. Confirmo que quero englobá-lo mesmo assim.
                        </label>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={executarEnglobar}
                          disabled={engBusy || !engTarget || !engVencedor || (precisaConfirm && !engConfirmOficial)}
                          className="btn-3d inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
                          style={{ background: NAVY }}
                        >
                          {engBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Combine className="h-3.5 w-3.5" />}
                          Englobar
                        </button>
                        {curMsg?.kind === "eng" && (
                          <span className={`text-[10px] font-semibold ${curMsg.ok ? "text-[#3f7a3f]" : "text-[#b4413c]"}`}>{curMsg.texto}</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* ---------- TRANSFERIR RESULTADO(S) ---------- */}
              <div className="panel-3d-sub rounded-[6px] p-3">
                <BlockTitle icon={ArrowLeftRight}>Transferir resultado(s)</BlockTitle>
                <div className="mb-2 text-[10px]" style={{ color: MUTED }}>
                  Move resultados alocados por engano deste exame para outro. Não desativa nada; é no nível do resultado.
                  Reversível pelo botão Desfazer.
                </div>
                {renderExamPicker(traTarget, setTraTarget, traBusca, setTraBusca)}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: traTodas ? GOLD : MUTED }}>
                    <input type="radio" name={`tra-modo-${atual.code}`} checked={traTodas} onChange={() => { setTraTodas(true); setTraSel({}); }} />
                    Todos os {impacto?.resultados ?? atual.count} resultado(s)
                  </label>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: !traTodas ? GOLD : MUTED }}>
                    <input
                      type="radio"
                      name={`tra-modo-${atual.code}`}
                      checked={!traTodas}
                      onChange={() => { setTraTodas(false); if (!traProc) carregarTraProc(); }}
                    />
                    Escolher por laudo
                  </label>
                </div>
                {!traTodas && (
                  <div className="panel-3d-sub mt-2 rounded-[6px] p-2">
                    {traProc?.loading ? (
                      <div className="flex items-center gap-2 px-2 py-3 text-[11px]" style={{ color: MUTED }}>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando laudos…
                      </div>
                    ) : !traProc || traProc.itens.length === 0 ? (
                      <div className="px-2 py-2 text-[10px] font-semibold" style={{ color: MUTED }}>
                        Nenhum laudo encontrado para este exame.
                      </div>
                    ) : (
                      <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                        {traProc.itens.map((p) => {
                          const marcado = p.examDocumentId in traSel;
                          return (
                            <label key={p.examDocumentId} className="concave-3d flex cursor-pointer items-start gap-2 rounded-[6px] px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={(e) =>
                                  setTraSel((prev) => {
                                    const next = { ...prev };
                                    if (e.target.checked) next[p.examDocumentId] = p.clientId;
                                    else delete next[p.examDocumentId];
                                    return next;
                                  })
                                }
                                className="mt-0.5"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: NAVY }}>
                                  <FileText className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
                                  <span className="truncate">{p.clientName}</span>
                                </span>
                                <span className="mt-0.5 block truncate text-[9px] font-semibold" style={{ color: MUTED }} title={p.fileName}>
                                  {p.fileName}
                                  {(p.valueRaw || p.unitRaw) && <> · {[p.valueRaw, p.unitRaw].filter(Boolean).join(" ")}</>}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={executarTransferir}
                    disabled={traBusy || !traTarget || (!traTodas && Object.keys(traSel).length === 0)}
                    className="btn-3d inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white disabled:opacity-50"
                    style={{ background: NAVY }}
                  >
                    {traBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
                    Transferir
                  </button>
                  {curMsg?.kind === "tra" && (
                    <span className={`text-[10px] font-semibold ${curMsg.ok ? "text-[#3f7a3f]" : "text-[#b4413c]"}`}>{curMsg.texto}</span>
                  )}
                </div>
              </div>

              {/* ---------- OPERAÇÕES RECENTES / DESFAZER ---------- */}
              <div className="panel-3d-sub rounded-[6px] p-3">
                <BlockTitle icon={History}>Operações recentes · desfazer</BlockTitle>
                <div className="mb-2 text-[10px]" style={{ color: MUTED }}>
                  Últimos englobamentos e transferências. Cada lote pode ser desfeito, restaurando o estado anterior.
                </div>
                {lotes.length === 0 ? (
                  <div className="concave-3d rounded-[6px] px-3 py-2 text-[10px] font-semibold" style={{ color: MUTED }}>
                    Nenhuma operação registrada ainda.
                  </div>
                ) : (
                  <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                    {lotes.map((l) => (
                      <div key={l.batchId} className="concave-3d flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[6px] px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide" style={{ color: l.operation === "englobar" ? NAVY : GOLD }}>
                          {l.operation === "englobar" ? <Combine className="h-3 w-3" /> : <ArrowLeftRight className="h-3 w-3" />}
                          {l.operation}
                        </span>
                        <span className="text-[10px] font-semibold" style={{ color: NAVY }}>
                          {l.sourceCode ? `${l.sourceCode} → ` : ""}
                          {l.targetCode} · {l.resultados} resultado(s)
                        </span>
                        {l.createdAt && (
                          <span className="text-[9px] font-semibold" style={{ color: MUTED }}>
                            {new Date(l.createdAt).toLocaleString("pt-BR")}
                          </span>
                        )}
                        <div className="ml-auto">
                          {l.undone ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide" style={{ color: MUTED }}>
                              <Check className="h-3 w-3" /> Desfeito
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => executarDesfazer(l.batchId)}
                              disabled={undoBusy === l.batchId}
                              className="btn-3d-soft inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[9px] font-black uppercase tracking-wide disabled:opacity-50"
                              style={{ color: "#b4413c" }}
                            >
                              {undoBusy === l.batchId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                              Desfazer
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {curMsg?.kind === "undo" && (
                  <div className={`mt-2 text-[10px] font-semibold ${curMsg.ok ? "text-[#3f7a3f]" : "text-[#b4413c]"}`}>{curMsg.texto}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
