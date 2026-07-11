import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Save, Check, Table2, Pencil } from "lucide-react";
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
  units: UnitApi[];
  zones: ZoneApi[];
  quantitativo: boolean;
  hasManualEdit: boolean;
  inCatalog: boolean;
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
                  <tr key={row.code} className="border-t align-top" style={{ borderColor: "#e5e9f0" }}>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
