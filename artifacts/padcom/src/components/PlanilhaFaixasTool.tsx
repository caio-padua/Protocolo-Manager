import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Save, Check, Table2, Pencil, Plus, X } from "lucide-react";
import { BASE } from "@/pages/comunicacao/_shared";
import {
  NAVY,
  GOLD,
  MUTED,
  ZONE_COLOR,
  ZONE_ROTULO,
  FAIXAS_POR_DIRECAO,
  parseNum,
  fmt,
  type Direction,
} from "@/components/exames-faixas-shared";

// ===========================================================================
// PLANILHA GERAL DE FAIXAS + UNIDADE PADRÃO (todos os exames de uma vez)
//   Visão em massa (uma linha por exame) que COMPLEMENTA a DirecaoExamesTool
//   (edição fina de 1 exame). As duas gravam no MESMO backend, pela MESMA
//   chave (nome canônico normalizado). Reaproveita as cores/ordem das 5
//   faixas de exames-faixas-shared (não reimplementa o motor).
//
//   Fonte da verdade:
//     GET /api/exames-lab/catalogo-faixas          -> todos os exames
//     PUT /api/exames-lab/catalogo-faixas          -> unidade padrão (dropdown)
//     PUT /api/exames-lab/faixas?code=...          -> as 5 faixas (De/Até)
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
}

// Editor de unidades (rascunho): rótulo + fator (texto) + marca de padrão.
interface UnitDraft {
  unit: string;
  factor: string;
  isCanonical: boolean;
}

// 5 slots de apelido a partir da linha (apelidos internos além dos 5 ficam de fora).
function aliasSlotsFromRow(row: CatalogoRow): string[] {
  const s = (row.synonyms ?? []).slice(0, 5);
  while (s.length < 5) s.push("");
  return s;
}
// Apelidos internos preservados (além dos 5 curados na tela).
function overflowFromRow(row: CatalogoRow): string[] {
  return (row.synonyms ?? []).slice(5);
}
// Unidades da linha em rascunho editável.
function unitDraftFromRow(row: CatalogoRow): UnitDraft[] {
  return (row.units ?? []).map((u) => ({
    unit: u.unit,
    factor: u.isCanonical ? "1" : u.factorToCanonical != null ? String(u.factorToCanonical) : "",
    isCanonical: u.isCanonical,
  }));
}

interface Slot {
  faixaName: string;
  low: number | null;
  high: number | null;
}

// 5 slots a partir das zonas da API (ou vazios com rótulo-base pela direção).
function slotsFromRow(row: CatalogoRow): Slot[] {
  const labels = FAIXAS_POR_DIRECAO[row.direction];
  const out: Slot[] = [];
  for (let i = 0; i < 5; i++) {
    const z = row.zones?.[i];
    out.push({
      faixaName: z?.faixaName ?? ZONE_ROTULO[labels[i]],
      low: z?.low ?? null,
      high: z?.high ?? null,
    });
  }
  return out;
}

interface Draft {
  canonicalUnit: string | null;
  slots: Slot[];
}

export function PlanilhaFaixasTool({ titulo }: { titulo?: string }) {
  const [rows, setRows] = useState<CatalogoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [somenteQuant, setSomenteQuant] = useState(true);

  // rascunhos por code (só materializa quando o usuário edita a linha)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ code: string; ok: boolean; texto: string } | null>(null);

  // Editor expansível de apelidos + unidades (por code).
  const [expandido, setExpandido] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState<Record<string, string[]>>({});
  const [unitDraft, setUnitDraft] = useState<Record<string, UnitDraft[]>>({});
  const [salvandoExtra, setSalvandoExtra] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(false);
    fetch(`${BASE}/api/exames-lab/catalogo-faixas`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalogo"))))
      .then((d: CatalogoRow[]) => {
        setRows(d);
        const dr: Record<string, Draft> = {};
        const sn: Record<string, string> = {};
        for (const row of d) {
          const slots = slotsFromRow(row);
          dr[row.code] = { canonicalUnit: row.canonicalUnit, slots };
          sn[row.code] = JSON.stringify({ u: row.canonicalUnit, s: slots });
        }
        setDrafts(dr);
        setSnapshots(sn);
      })
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
    return rows.filter((r) => {
      if (somenteQuant && !r.quantitativo) return false;
      if (!q) return true;
      return norm(r.displayName).includes(q) || norm(r.code).includes(q);
    });
  }, [rows, busca, somenteQuant]);

  const setUnit = (code: string, unit: string) => {
    setDrafts((prev) => ({ ...prev, [code]: { ...prev[code], canonicalUnit: unit } }));
  };

  // Editar um corte mantém a borda contígua: Até de uma faixa = De da seguinte.
  const editarCorte = (code: string, i: number, campo: "low" | "high", valor: string) => {
    const n = parseNum(valor);
    setDrafts((prev) => {
      const d = prev[code];
      if (!d) return prev;
      const next = d.slots.map((s) => ({ ...s }));
      next[i][campo] = n;
      if (campo === "high" && i < 4) next[i + 1].low = n;
      if (campo === "low" && i > 0) next[i - 1].high = n;
      return { ...prev, [code]: { ...d, slots: next } };
    });
  };

  const isDirty = (code: string) => {
    const d = drafts[code];
    if (!d) return false;
    return snapshots[code] !== JSON.stringify({ u: d.canonicalUnit, s: d.slots });
  };

  const salvar = async (row: CatalogoRow) => {
    const d = drafts[row.code];
    if (!d) return;
    setSalvando(row.code);
    setMsg(null);
    try {
      // 1) unidade padrão (só se mudou e existe)
      if (d.canonicalUnit && d.canonicalUnit !== row.canonicalUnit) {
        const ru = await fetch(`${BASE}/api/exames-lab/catalogo-faixas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: row.code, canonicalUnit: d.canonicalUnit }),
        });
        if (!ru.ok) throw new Error("unidade");
      }
      // 2) as 5 faixas (De/Até) — direção mantida, cores derivadas da direção
      const labels = FAIXAS_POR_DIRECAO[row.direction];
      const zones = d.slots.map((s, i) => ({
        faixaName: (s.faixaName || ZONE_ROTULO[labels[i]]).slice(0, 40),
        low: s.low,
        high: s.high,
        color: ZONE_COLOR[labels[i]],
        ordem: i + 1,
      }));
      const rf = await fetch(
        `${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(row.code)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction: row.direction, displayName: row.displayName, zones }),
        },
      );
      if (!rf.ok) throw new Error("faixas");

      // Atualiza estado local (linha vira "revisada" e novo snapshot)
      setRows((prev) =>
        prev.map((r) =>
          r.code === row.code
            ? {
                ...r,
                canonicalUnit: d.canonicalUnit,
                hasManualEdit: true,
                units: r.units.map((u) => ({ ...u, isCanonical: u.unit === d.canonicalUnit })),
                zones: zones.map((z) => ({ ...z })),
              }
            : r,
        ),
      );
      setSnapshots((prev) => ({
        ...prev,
        [row.code]: JSON.stringify({ u: d.canonicalUnit, s: d.slots }),
      }));
      setMsg({ code: row.code, ok: true, texto: "Salvo. Evolução e edição fina já usam estes valores." });
    } catch {
      setMsg({ code: row.code, ok: false, texto: "Falha ao salvar esta linha." });
    } finally {
      setSalvando(null);
    }
  };

  // Abre/fecha o editor de apelidos+unidades; materializa rascunho na 1ª abertura.
  const abrirEditor = (row: CatalogoRow) => {
    setExpandido((cur) => (cur === row.code ? null : row.code));
    setAliasDraft((prev) => (prev[row.code] ? prev : { ...prev, [row.code]: aliasSlotsFromRow(row) }));
    setUnitDraft((prev) => (prev[row.code] ? prev : { ...prev, [row.code]: unitDraftFromRow(row) }));
  };

  const setAlias = (code: string, i: number, val: string) =>
    setAliasDraft((prev) => {
      const a = [...(prev[code] ?? ["", "", "", "", ""])];
      a[i] = val;
      return { ...prev, [code]: a };
    });

  const setUnitField = (code: string, i: number, field: "unit" | "factor", val: string) =>
    setUnitDraft((prev) => {
      const arr = (prev[code] ?? []).map((x) => ({ ...x }));
      if (!arr[i]) return prev;
      arr[i][field] = val;
      return { ...prev, [code]: arr };
    });

  const marcarCanonica = (code: string, i: number) =>
    setUnitDraft((prev) => {
      const arr = (prev[code] ?? []).map((x, idx) => ({
        ...x,
        isCanonical: idx === i,
        factor: idx === i ? "1" : x.factor,
      }));
      return { ...prev, [code]: arr };
    });

  const addUnit = (code: string) =>
    setUnitDraft((prev) => {
      const arr = [...(prev[code] ?? [])];
      if (arr.length >= 5) return prev;
      arr.push({ unit: "", factor: "", isCanonical: arr.length === 0 });
      return { ...prev, [code]: arr };
    });

  const removeUnit = (code: string, i: number) =>
    setUnitDraft((prev) => {
      let arr = (prev[code] ?? []).filter((_, idx) => idx !== i);
      if (arr.length > 0 && !arr.some((u) => u.isCanonical)) {
        arr = arr.map((u, idx) => ({ ...u, isCanonical: idx === 0 }));
      }
      return { ...prev, [code]: arr };
    });

  // Remapeia rascunhos/estado quando a gravação PROMOVE o exame e muda o code.
  const remapCode = (oldCode: string, newCode: string) => {
    if (oldCode === newCode) return;
    setAliasDraft((p) => (p[oldCode] ? { ...p, [newCode]: p[oldCode] } : p));
    setUnitDraft((p) => (p[oldCode] ? { ...p, [newCode]: p[oldCode] } : p));
    setDrafts((p) => (p[oldCode] ? { ...p, [newCode]: p[oldCode] } : p));
    setSnapshots((p) => (p[oldCode] ? { ...p, [newCode]: p[oldCode] } : p));
    setExpandido((c) => (c === oldCode ? newCode : c));
  };

  const salvarApelidos = async (row: CatalogoRow) => {
    const lista = (aliasDraft[row.code] ?? []).map((s) => s.trim()).filter(Boolean);
    setSalvandoExtra(`${row.code}:a`);
    setMsg(null);
    try {
      const r = await fetch(`${BASE}/api/exames-lab/catalogo-faixas/aliases`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: row.code, displayName: row.displayName, synonyms: lista }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Falha ao salvar apelidos.");
      const newCode: string = j.code ?? row.code;
      remapCode(row.code, newCode);
      setRows((prev) =>
        prev.map((x) =>
          x.code === row.code
            ? { ...x, code: newCode, synonyms: j.synonyms ?? lista, inCatalog: true }
            : x,
        ),
      );
      setMsg({ code: newCode, ok: true, texto: "Apelidos salvos. A varredura já busca por eles." });
    } catch (e) {
      setMsg({ code: row.code, ok: false, texto: (e as Error).message });
    } finally {
      setSalvandoExtra(null);
    }
  };

  const salvarUnidades = async (row: CatalogoRow) => {
    const lista = (unitDraft[row.code] ?? [])
      .map((u) => ({ ...u, unit: u.unit.trim() }))
      .filter((u) => u.unit);
    if (lista.length === 0) {
      setMsg({ code: row.code, ok: false, texto: "Informe ao menos uma unidade." });
      return;
    }
    let canonIdx = lista.findIndex((u) => u.isCanonical);
    if (canonIdx < 0) canonIdx = 0;
    const units = lista.map((u, idx) => ({
      unit: u.unit,
      factorToCanonical:
        idx === canonIdx ? 1 : Number(String(u.factor).replace(",", ".")),
      isCanonical: idx === canonIdx,
    }));
    for (const u of units) {
      if (!Number.isFinite(u.factorToCanonical) || u.factorToCanonical <= 0) {
        setMsg({ code: row.code, ok: false, texto: `Fator inválido em "${u.unit}". Use número maior que zero.` });
        return;
      }
    }
    setSalvandoExtra(`${row.code}:u`);
    setMsg(null);
    try {
      const r = await fetch(`${BASE}/api/exames-lab/catalogo-faixas/unidades`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: row.code, displayName: row.displayName, units }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Falha ao salvar unidades.");
      const newCode: string = j.code ?? row.code;
      const canonicalUnit: string = j.canonicalUnit ?? units[canonIdx].unit;
      remapCode(row.code, newCode);
      const novasUnits: UnitApi[] = units.map((u) => ({
        unit: u.unit,
        factorToCanonical: u.factorToCanonical,
        isCanonical: u.isCanonical,
        active: true,
      }));
      setRows((prev) =>
        prev.map((x) =>
          x.code === row.code
            ? { ...x, code: newCode, units: novasUnits, canonicalUnit, quantitativo: true, inCatalog: true }
            : x,
        ),
      );
      setDrafts((prev) => {
        const d = prev[newCode] ?? prev[row.code];
        return d ? { ...prev, [newCode]: { ...d, canonicalUnit } } : prev;
      });
      setUnitDraft((prev) => ({
        ...prev,
        [newCode]: novasUnits.map((u) => ({
          unit: u.unit,
          factor: u.isCanonical ? "1" : String(u.factorToCanonical),
          isCanonical: u.isCanonical,
        })),
      }));
      setMsg({ code: newCode, ok: true, texto: "Unidades salvas. Padrão e conversões atualizadas." });
    } catch (e) {
      setMsg({ code: row.code, ok: false, texto: (e as Error).message });
    } finally {
      setSalvandoExtra(null);
    }
  };

  const totalQuant = rows.filter((r) => r.quantitativo).length;
  const totalRevisado = rows.filter((r) => r.quantitativo && r.hasManualEdit).length;

  return (
    <section className="panel-3d p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>
        <Table2 className="h-4 w-4" style={{ color: GOLD }} /> {titulo ?? "Planilha de Faixas e Unidades"}
      </div>
      <p className="mb-3 text-[11px]" style={{ color: MUTED }}>
        Todos os exames de uma vez. Para cada exame escolha a UNIDADE PADRÃO (dropdown com todas as
        unidades daquele exame) e ajuste os CORTES (De/Até) das 5 faixas. Cortes pré-preenchidos por bom
        senso médico — confira e salve por linha. A cor de cada faixa é fixa por severidade. O selo
        <span className="mx-1 inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 align-middle text-[8px] font-black uppercase text-white" style={{ background: GOLD }}>
          <Check className="h-2.5 w-2.5" /> revisado
        </span>
        marca exames já conferidos por um profissional.
      </p>

      {/* BUSCA + FILTRO */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="concave-3d flex min-w-[220px] flex-1 items-center gap-2 rounded-[6px] px-3 py-2">
          <Search className="h-4 w-4" style={{ color: MUTED }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar exame…"
            className="w-full bg-transparent text-[13px] font-semibold outline-none"
            style={{ color: NAVY }}
          />
        </div>
        <button
          type="button"
          onClick={() => setSomenteQuant((v) => !v)}
          className={`flex items-center gap-2 rounded-[6px] px-3 py-2 text-[11px] font-bold ${somenteQuant ? "btn-3d" : "btn-3d-soft"}`}
          style={somenteQuant ? { background: NAVY, color: "#fff" } : { color: NAVY }}
        >
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px]"
            style={{ background: somenteQuant ? GOLD : "transparent", border: somenteQuant ? "none" : `2px solid ${MUTED}` }}
          >
            {somenteQuant && <Check className="h-3 w-3 text-white" />}
          </span>
          Só quantitativos
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
          {totalRevisado}/{totalQuant} revisados
        </span>
      </div>

      {carregando && (
        <div className="flex items-center gap-2 px-2 py-8 text-[12px]" style={{ color: MUTED }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando exames…
        </div>
      )}
      {erro && (
        <div className="px-2 py-8 text-[12px] font-semibold text-[#b4413c]">
          Não consegui carregar a planilha de exames.
        </div>
      )}

      {!carregando && !erro && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-left" style={{ color: MUTED }}>
                <th className="sticky left-0 z-10 bg-white px-2 py-2 text-[9px] font-black uppercase tracking-wide">
                  Exame
                </th>
                <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wide">Direção</th>
                <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wide">Unidade padrão</th>
                {[0, 1, 2, 3, 4].map((i) => (
                  <th key={i} className="px-2 py-2 text-center text-[9px] font-black uppercase tracking-wide">
                    Faixa {i + 1}
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-[9px] font-black uppercase tracking-wide">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-2 py-6 text-[12px]" style={{ color: MUTED }}>
                    Nenhum exame encontrado.
                  </td>
                </tr>
              )}
              {filtrados.map((row) => {
                const d = drafts[row.code];
                const labels = FAIXAS_POR_DIRECAO[row.direction];
                const dirty = isDirty(row.code);
                const linhaMsg = msg && msg.code === row.code ? msg : null;
                return (
                  <Fragment key={row.code}>
                  <tr className="border-t align-top" style={{ borderColor: "#e5e9f0" }}>
                    {/* EXAME (fixo à esquerda) */}
                    <td className="sticky left-0 z-10 bg-white px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold" style={{ color: NAVY }}>{row.displayName}</span>
                        {row.hasManualEdit && (
                          <span className="inline-flex items-center gap-0.5 rounded-[3px] px-1 py-0.5 text-[7px] font-black uppercase text-white" style={{ background: GOLD }} title="Revisado por um profissional">
                            <Check className="h-2.5 w-2.5" /> rev
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => abrirEditor(row)}
                        className="mt-0.5 inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide"
                        style={{ color: expandido === row.code ? GOLD : MUTED }}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        {expandido === row.code ? "fechar" : "apelidos + unidades"}
                      </button>
                      {linhaMsg && (
                        <div className={`mt-0.5 text-[9px] font-semibold ${linhaMsg.ok ? "text-[#3f7a3f]" : "text-[#b4413c]"}`}>
                          {linhaMsg.texto}
                        </div>
                      )}
                    </td>

                    {/* DIREÇÃO (badge, editável na ferramenta fina) */}
                    <td className="px-2 py-2">
                      <span
                        className="inline-block rounded-[4px] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white"
                        style={{
                          background:
                            row.direction === "higher_better" ? "#3f7a3f" : row.direction === "lower_better" ? "#b4413c" : GOLD,
                        }}
                      >
                        {row.direction === "higher_better" ? "↑ maior" : row.direction === "lower_better" ? "↓ menor" : "◎ alvo"}
                      </span>
                    </td>

                    {/* UNIDADE PADRÃO (dropdown) */}
                    <td className="px-2 py-2">
                      {row.quantitativo && row.units.length > 0 ? (
                        <select
                          value={d?.canonicalUnit ?? ""}
                          onChange={(e) => setUnit(row.code, e.target.value)}
                          className="rounded-[4px] border px-1.5 py-1 text-[11px] font-semibold outline-none"
                          style={{ borderColor: "#d5dbe6", color: NAVY }}
                        >
                          {!d?.canonicalUnit && <option value="">—</option>}
                          {row.units.map((u) => (
                            <option key={u.unit} value={u.unit}>
                              {u.unit}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>
                          {row.quantitativo ? "sem unidade" : "não quantitativo"}
                        </span>
                      )}
                    </td>

                    {/* 5 FAIXAS (De/Até) */}
                    {row.quantitativo
                      ? d?.slots.map((s, i) => (
                          <td key={i} className="px-1.5 py-2">
                            <div className="mb-1 flex items-center gap-1">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: ZONE_COLOR[labels[i]] }} />
                              <span className="truncate text-[8px] font-black uppercase" style={{ color: MUTED }} title={s.faixaName}>
                                {s.faixaName}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                value={fmt(s.low)}
                                onChange={(e) => editarCorte(row.code, i, "low", e.target.value)}
                                placeholder={i === 0 ? "—" : ""}
                                inputMode="decimal"
                                aria-label={`${row.displayName} faixa ${i + 1} de`}
                                className="w-12 rounded-[4px] border px-1 py-1 text-right text-[10px] font-semibold outline-none"
                                style={{ borderColor: "#d5dbe6", color: NAVY }}
                              />
                              <span className="text-[8px]" style={{ color: MUTED }}>–</span>
                              <input
                                value={fmt(s.high)}
                                onChange={(e) => editarCorte(row.code, i, "high", e.target.value)}
                                placeholder={i === 4 ? "—" : ""}
                                inputMode="decimal"
                                aria-label={`${row.displayName} faixa ${i + 1} até`}
                                className="w-12 rounded-[4px] border px-1 py-1 text-right text-[10px] font-semibold outline-none"
                                style={{ borderColor: "#d5dbe6", color: NAVY }}
                              />
                            </div>
                          </td>
                        ))
                      : (
                        <td colSpan={5} className="px-2 py-2 text-[9px] font-semibold uppercase" style={{ color: MUTED }}>
                          Exame não quantitativo — sem faixas numéricas.
                        </td>
                      )}

                    {/* AÇÃO */}
                    <td className="px-2 py-2 text-center">
                      {row.quantitativo && (
                        <button
                          type="button"
                          onClick={() => salvar(row)}
                          disabled={!dirty || salvando === row.code}
                          className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10px] font-bold ${dirty ? "btn-3d" : "btn-3d-soft"}`}
                          style={dirty ? { background: NAVY, color: "#fff" } : { color: MUTED }}
                        >
                          {salvando === row.code ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : dirty ? (
                            <Save className="h-3 w-3" />
                          ) : (
                            <Pencil className="h-3 w-3" />
                          )}
                          {dirty ? "Salvar" : "Salvo"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandido === row.code && (
                    <tr style={{ background: "#f7f9fc" }}>
                      <td colSpan={9} className="px-3 py-3">
                        <div className="grid gap-4 md:grid-cols-2">
                          {/* APELIDOS */}
                          <div>
                            <div className="mb-1 text-[9px] font-black uppercase tracking-wide" style={{ color: MUTED }}>
                              Apelidos (até 5 — a varredura já procura por eles)
                            </div>
                            <div className="grid grid-cols-1 gap-1">
                              {(aliasDraft[row.code] ?? ["", "", "", "", ""]).map((a, i) => (
                                <input
                                  key={i}
                                  value={a}
                                  onChange={(e) => setAlias(row.code, i, e.target.value)}
                                  placeholder={`Apelido ${i + 1}`}
                                  className="rounded-[4px] border px-2 py-1 text-[11px] font-semibold outline-none"
                                  style={{ borderColor: "#d5dbe6", color: NAVY }}
                                />
                              ))}
                            </div>
                            {overflowFromRow(row).length > 0 && (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="text-[8px] font-bold uppercase" style={{ color: MUTED }}>
                                  +{overflowFromRow(row).length} internos:
                                </span>
                                {overflowFromRow(row).map((s, i) => (
                                  <span
                                    key={i}
                                    className="rounded-[3px] px-1 py-0.5 text-[9px] font-semibold"
                                    style={{ background: "#e5e9f0", color: NAVY }}
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => salvarApelidos(row)}
                              disabled={salvandoExtra === `${row.code}:a`}
                              className="mt-2 inline-flex items-center gap-1 rounded-[6px] btn-3d px-2 py-1 text-[10px] font-bold"
                              style={{ background: NAVY, color: "#fff" }}
                            >
                              {salvandoExtra === `${row.code}:a` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Save className="h-3 w-3" />
                              )}
                              Salvar apelidos
                            </button>
                          </div>
                          {/* UNIDADES */}
                          <div>
                            <div className="mb-1 text-[9px] font-black uppercase tracking-wide" style={{ color: MUTED }}>
                              Unidades (até 5 — marque a padrão; o fator converte para a padrão)
                            </div>
                            <div className="flex flex-col gap-1">
                              {(unitDraft[row.code] ?? []).map((u, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <input
                                    value={u.unit}
                                    onChange={(e) => setUnitField(row.code, i, "unit", e.target.value)}
                                    placeholder="unidade"
                                    className="w-24 rounded-[4px] border px-1.5 py-1 text-[11px] font-semibold outline-none"
                                    style={{ borderColor: "#d5dbe6", color: NAVY }}
                                  />
                                  <input
                                    value={u.isCanonical ? "1" : u.factor}
                                    onChange={(e) => setUnitField(row.code, i, "factor", e.target.value)}
                                    disabled={u.isCanonical}
                                    inputMode="decimal"
                                    placeholder="fator"
                                    className="w-16 rounded-[4px] border px-1.5 py-1 text-right text-[10px] font-semibold outline-none disabled:opacity-50"
                                    style={{ borderColor: "#d5dbe6", color: NAVY }}
                                  />
                                  <label
                                    className="flex items-center gap-1 text-[9px] font-bold"
                                    style={{ color: u.isCanonical ? GOLD : MUTED }}
                                  >
                                    <input
                                      type="radio"
                                      name={`canon-${row.code}`}
                                      checked={u.isCanonical}
                                      onChange={() => marcarCanonica(row.code, i)}
                                    />
                                    padrão
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => removeUnit(row.code, i)}
                                    className="inline-flex items-center"
                                    style={{ color: "#b4413c" }}
                                    title="Remover unidade"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              {(unitDraft[row.code]?.length ?? 0) < 5 && (
                                <button
                                  type="button"
                                  onClick={() => addUnit(row.code)}
                                  className="inline-flex items-center gap-1 rounded-[6px] btn-3d-soft px-2 py-1 text-[10px] font-bold"
                                  style={{ color: NAVY }}
                                >
                                  <Plus className="h-3 w-3" />
                                  Adicionar unidade
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => salvarUnidades(row)}
                                disabled={salvandoExtra === `${row.code}:u`}
                                className="inline-flex items-center gap-1 rounded-[6px] btn-3d px-2 py-1 text-[10px] font-bold"
                                style={{ background: NAVY, color: "#fff" }}
                              >
                                {salvandoExtra === `${row.code}:u` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3" />
                                )}
                                Salvar unidades
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
