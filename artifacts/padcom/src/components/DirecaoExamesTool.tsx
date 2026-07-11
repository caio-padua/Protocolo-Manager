import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Search, Check, Compass } from "lucide-react";
import { BASE } from "@/pages/comunicacao/_shared";

// ===========================================================================
// FERRAMENTA COMPARTILHADA: CADASTRO DE DIREÇÃO DOS EXAMES
//   Usada em DOIS lugares (decisão do CEO): na página /cadastros/direcao-exames
//   (menu Cadastros) e embutida no Cockpit. Mesma engrenagem, sem duplicar.
//
//   O QUE FAZ: lista TODOS os exames (curadoria + laudos reais), deixa buscar,
//   e edita a DIREÇÃO de cada um (o que é "excelente"): quanto MAIOR melhor,
//   quanto MENOR melhor, ou melhor no MEIO (alvo). Mostra a prévia das 5 faixas
//   naquela direção (do pior ao melhor conforme o valor sobe).
//
//   Fonte da verdade: GET /api/exames-lab/direcoes (lista) e
//   PUT /api/exames-lab/faixas?code=... { direction, displayName } (grava em
//   direcao_favoravel_exame — a tabela que o motor de faixas realmente lê).
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

// Paleta e rótulos das 5 zonas (espelha zones.ts do backend).
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

// Prévia das 5 faixas na direção escolhida (do menor valor ao maior).
function PreviaFaixas({ direction }: { direction: Direction }) {
  const labels = FAIXAS_POR_DIRECAO[direction];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-[#647c97]">
        <span>menor valor</span>
        <span>maior valor</span>
      </div>
      <div className="flex gap-1">
        {labels.map((lab, i) => (
          <div
            key={i}
            className="flex-1 rounded-[4px] px-1 py-2 text-center text-[8px] font-black uppercase leading-tight text-white"
            style={{ background: ZONE_COLOR[lab] }}
            title={ZONE_ROTULO[lab]}
          >
            {ZONE_ROTULO[lab]}
          </div>
        ))}
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

  const escolher = (it: DirecaoItem) => {
    setSelecionado(it.code);
    setDirecao(it.direction);
    setMsg(null);
  };

  const salvar = () => {
    if (!atual) return;
    setSalvando(true);
    setMsg(null);
    fetch(`${BASE}/api/exames-lab/faixas?code=${encodeURIComponent(atual.code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: direcao, displayName: atual.displayName }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("save"))))
      .then(() => {
        setItens((prev) =>
          prev.map((it) =>
            it.code === atual.code ? { ...it, direction: direcao, hasDirection: true } : it,
          ),
        );
        setMsg("Direção salva. O motor de faixas já usa a nova configuração.");
      })
      .catch(() => setMsg("Falha ao salvar a direção."))
      .finally(() => setSalvando(false));
  };

  const mudou = atual ? atual.direction !== direcao : false;

  return (
    <section className="panel-3d p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>
        <Compass className="h-4 w-4" style={{ color: GOLD }} /> {titulo ?? "Direção dos Exames"}
      </div>
      <p className="mb-3 text-[11px]" style={{ color: MUTED }}>
        Para cada exame, diga o que é "excelente": quanto MAIOR melhor, quanto MENOR melhor, ou melhor no MEIO
        (alvo). A prévia mostra as cinco faixas do menor ao maior valor. Isso vale para todo o sistema.
      </p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
            <div className="max-h-[380px] space-y-1 overflow-y-auto pr-1">
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

        {/* EDITOR DA DIREÇÃO */}
        <div>
          {!atual ? (
            <div className="concave-3d flex h-full items-center justify-center rounded-[6px] px-4 py-10 text-center text-[12px]" style={{ color: MUTED }}>
              Escolha um exame na lista ao lado para editar a direção.
            </div>
          ) : (
            <div className="concave-3d rounded-[6px] p-3">
              <div className="mb-1 text-[14px] font-black" style={{ color: NAVY }}>
                {atual.displayName}
              </div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                {atual.grupo ? `${atual.grupo} · ` : ""}
                {atual.count > 0 ? `${atual.count} resultado(s) nos laudos` : "sem resultado em laudo ainda"}
              </div>

              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                Direção
              </div>
              <div className="mb-4 flex flex-col gap-2">
                {(["higher_better", "lower_better", "target"] as const).map((d) => {
                  const on = direcao === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDirecao(d)}
                      className={`flex items-center gap-2 rounded-[6px] px-3 py-2 text-[12px] font-bold ${on ? "btn-3d" : "btn-3d-soft"}`}
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

              <div className="mb-4">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                  Prévia das 5 faixas
                </div>
                <PreviaFaixas direction={direcao} />
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
                  Salvar direção
                </button>
                {!mudou && !msg && (
                  <span className="text-[11px] font-semibold" style={{ color: MUTED }}>
                    Esta já é a direção salva.
                  </span>
                )}
                {msg && <span className="text-[11px] font-semibold" style={{ color: MUTED }}>{msg}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default DirecaoExamesTool;
