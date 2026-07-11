import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Loader2,
  Lock,
  ShieldAlert,
  SkipForward,
  StickyNote,
} from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";

// ===========================================================================
// ANAMNESE PREVIA (Cockpit da Consulta — LEITURA APENAS, sem motor):
// sessoes de anamnese ja respondidas pelo cliente selecionado, com achados,
// recusas, observacoes e as RESPOSTAS cruas agrupadas por bloco.
// Spec: specs/cockpit-cliente-onda2-anamnese-exames.md
// ===========================================================================

const NAVY = "#16294a";
const OURO = "#9a7b32";
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SessionSummary = {
  id: number;
  clientId: number | null;
  clientName: string | null;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  diagnosticado: number;
  suspeito: number;
  temAlarme: boolean;
};

type Resposta = {
  id: number;
  perguntaId: string | null;
  pergunta: string | null;
  bloco: string | null;
  sistema: string | null;
  tipoResposta: string | null;
  valor: unknown;
  respondidoEm: string;
};

type SessionDetail = {
  id: number;
  status: string;
  mode: string;
  startedAt: string;
  completedAt: string | null;
  findings: { id: number; tipo: string; rotulo: string; severidade: string | null }[];
  refusals: { id: number; escopo: string; alvo: string; motivo: string | null }[];
  notes: { id: number; grupo: string; observacao: string }[];
  respostas?: Resposta[];
};

async function authGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Formata o `valor` jsonb (uniao discriminada de anamnese-v2/types.ts:
// boolean/bool, single/opcao, multi/selecionados, escala/escala+max,
// number/numero, texto/texto) de forma TOLERANTE: formas legadas e
// primitivas nunca quebram a tela.
export function formatarValor(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (Array.isArray(v)) return v.map(formatarValor).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    switch (typeof o.tipo === "string" ? o.tipo : null) {
      case "boolean":
      case "bool":
        return o.bool === true ? "Sim" : o.bool === false ? "Não" : "—";
      case "single":
        return formatarValor(o.opcao ?? o.valor);
      case "multi":
        return Array.isArray(o.selecionados) && o.selecionados.length > 0
          ? o.selecionados.map(formatarValor).join(", ")
          : "—";
      case "escala":
        return o.escala != null
          ? `${String(o.escala)}${o.max != null ? ` de ${String(o.max)}` : ""}`
          : "—";
      case "number":
      case "num":
        return o.numero != null ? String(o.numero) : "—";
      case "texto":
        return typeof o.texto === "string" && o.texto.trim() !== "" ? o.texto : "—";
      default: {
        try {
          return JSON.stringify(o);
        } catch {
          return "—";
        }
      }
    }
  }
  return String(v);
}

function SeloStatus({ s }: { s: SessionSummary }) {
  const cor = s.temAlarme
    ? "#dc2626"
    : s.suspeito > 0
      ? "#d97706"
      : s.status === "concluida"
        ? "#16a34a"
        : "#94a3b8";
  const rotulo = s.status === "concluida" ? "Concluída" : "Rascunho";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
      style={{ background: cor }}
    >
      {s.temAlarme && <ShieldAlert className="h-3 w-3" />}
      {rotulo}
    </span>
  );
}

export default function AnamnesePreviaPanel({ clientId }: { clientId: number }) {
  const temToken = Boolean(getCollabToken());
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sessaoId, setSessaoId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const carregar = useCallback(async () => {
    if (!temToken) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const data = await authGet<SessionSummary[]>(
        `/api/collaborator/anamnese/sessions?clientId=${clientId}`,
      );
      setSessions(data);
      // Padrao: a concluida mais recente; senao, a primeira da lista.
      const preferida = data.find((s) => s.status === "concluida") ?? data[0] ?? null;
      setSessaoId(preferida ? preferida.id : null);
    } catch {
      setErro("Não foi possível carregar as anamneses deste cliente.");
    } finally {
      setCarregando(false);
    }
  }, [clientId, temToken]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (sessaoId == null) {
      setDetail(null);
      return;
    }
    let ativo = true;
    setCarregandoDetalhe(true);
    setDetail(null);
    authGet<SessionDetail>(`/api/collaborator/anamnese/sessions/${sessaoId}`)
      .then((d) => {
        if (ativo) setDetail(d);
      })
      .catch(() => {
        if (ativo) setDetail(null);
      })
      .finally(() => {
        if (ativo) setCarregandoDetalhe(false);
      });
    return () => {
      ativo = false;
    };
  }, [sessaoId]);

  const respostasPorBloco = useMemo(() => {
    const mapa = new Map<string, Resposta[]>();
    for (const r of detail?.respostas ?? []) {
      const chave = r.bloco || r.sistema || "Geral";
      const lista = mapa.get(chave) ?? [];
      lista.push(r);
      mapa.set(chave, lista);
    }
    return [...mapa.entries()];
  }, [detail]);

  if (!temToken) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-amber-800">
          <Lock className="h-4 w-4" /> Acesso de colaborador necessário
        </div>
        <p className="mt-1.5 text-sm text-amber-800">
          A anamnese é informação clínica protegida. Entre como colaborador (menu
          Profissionais → Entrar) para ver as respostas do cliente.
        </p>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "#647c97" }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando anamneses…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {erro}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Sem anamnese registrada
        </div>
        <p className="mt-1.5 text-sm text-amber-800">
          Este cliente ainda não respondeu nenhuma anamnese. Use o Cockpit da
          Anamnese para enviar o link de preenchimento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Lista de sessoes (historico) */}
      <div className="rounded-md border bg-white p-4 shadow-sm" style={{ borderColor: "#d8cfbc" }}>
        <div
          className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: NAVY }}
        >
          <ClipboardCheck className="h-4 w-4" style={{ color: OURO }} />
          Anamneses respondidas ({sessions.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {sessions.map((s) => {
            const ativa = s.id === sessaoId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSessaoId(s.id)}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[12px]"
                style={
                  ativa
                    ? { borderColor: OURO, background: "#fdf8ec", color: NAVY }
                    : { borderColor: "#e2dccb", background: "#faf8f3", color: "#4a5d75" }
                }
              >
                <span className="font-semibold">
                  {fmtData(s.completedAt ?? s.startedAt)}
                </span>
                <SeloStatus s={s} />
                <span className="text-[11px] uppercase" style={{ color: "#8a7a55" }}>
                  {s.mode}
                </span>
                <span className="text-[11px]" style={{ color: "#647c97" }}>
                  {s.diagnosticado} diag · {s.suspeito} susp
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {carregandoDetalhe && (
        <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "#647c97" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando respostas…
        </div>
      )}

      {detail && (
        <>
          {/* Achados / Recusas / Observacoes */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div
              className="rounded-md border bg-white p-4 shadow-sm"
              style={{ borderColor: "#d8cfbc" }}
            >
              <div
                className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: NAVY }}
              >
                Achados do motor
              </div>
              {detail.findings.length === 0 ? (
                <p className="text-[12px]" style={{ color: "#647c97" }}>
                  Nenhum achado.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {detail.findings.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-[12px]">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                        style={{
                          background: f.tipo === "diagnosticado" ? "#16a34a" : "#d97706",
                        }}
                      >
                        {f.tipo === "diagnosticado" ? "Diag" : "Susp"}
                      </span>
                      <span style={{ color: NAVY }}>{f.rotulo}</span>
                      {(f.severidade ?? "").toLowerCase() === "alta" && (
                        <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div
              className="rounded-md border bg-white p-4 shadow-sm"
              style={{ borderColor: "#d8cfbc" }}
            >
              <div
                className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: NAVY }}
              >
                <SkipForward className="h-3.5 w-3.5" style={{ color: OURO }} /> Recusas
              </div>
              {detail.refusals.length === 0 ? (
                <p className="text-[12px]" style={{ color: "#647c97" }}>
                  Nenhum bloco recusado.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {detail.refusals.map((r) => (
                    <li key={r.id} className="text-[12px]" style={{ color: NAVY }}>
                      <span className="font-semibold">{r.alvo}</span>
                      {r.motivo ? ` — ${r.motivo}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div
              className="rounded-md border bg-white p-4 shadow-sm"
              style={{ borderColor: "#d8cfbc" }}
            >
              <div
                className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: NAVY }}
              >
                <StickyNote className="h-3.5 w-3.5" style={{ color: OURO }} /> Observações
              </div>
              {detail.notes.length === 0 ? (
                <p className="text-[12px]" style={{ color: "#647c97" }}>
                  Nenhuma observação da equipe.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {detail.notes.map((n) => (
                    <li key={n.id} className="text-[12px]" style={{ color: NAVY }}>
                      <span className="font-semibold">{n.grupo}:</span> {n.observacao}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Respostas por bloco */}
          <div
            className="rounded-md border bg-white p-4 shadow-sm"
            style={{ borderColor: "#d8cfbc" }}
          >
            <div
              className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ color: NAVY }}
            >
              Respostas ({detail.respostas?.length ?? 0})
            </div>
            {respostasPorBloco.length === 0 ? (
              <p className="text-[12px]" style={{ color: "#647c97" }}>
                Nenhuma resposta registrada nesta sessão.
              </p>
            ) : (
              <div className="space-y-4">
                {respostasPorBloco.map(([bloco, itens]) => (
                  <div key={bloco}>
                    <div
                      className="mb-1.5 border-b pb-1 text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: OURO, borderColor: "#eee5d0" }}
                    >
                      {bloco}
                    </div>
                    <table className="w-full text-[12px]">
                      <tbody>
                        {itens.map((r) => (
                          <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "#f3eee1" }}>
                            <td className="w-[55%] py-1.5 pr-3 align-top" style={{ color: "#4a5d75" }}>
                              {r.pergunta ?? r.perguntaId ?? "Pergunta removida do questionário"}
                            </td>
                            <td className="py-1.5 align-top font-semibold" style={{ color: NAVY }}>
                              {formatarValor(r.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
