import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SkipForward,
  StickyNote,
  X,
} from "lucide-react";
import { useListClients } from "@workspace/api-client-react";
import { getCollabToken } from "@/lib/collab-auth";

const NAVY = "#16284a";

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

type Finding = {
  id: number;
  tipo: string;
  rotulo: string;
  severidade: string | null;
  origemPerguntaId: string;
};
type Refusal = { id: number; escopo: string; alvo: string; motivo: string | null };
type Note = { id: number; grupo: string; observacao: string };
type SessionDetail = {
  id: number;
  clientId: number | null;
  clientName: string | null;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  findings: Finding[];
  refusals: Refusal[];
  notes: Note[];
};

async function authGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function fmtDate(iso: string | null): string {
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

// cor do quadradinho de alerta (Grade Imaginaria: a cor pertence ao item)
function alertColor(s: SessionSummary): string {
  if (s.temAlarme) return "#dc2626"; // vermelho — achado grave
  if (s.suspeito > 0) return "#d97706"; // ambar — ha suspeitos
  if (s.status === "concluida") return "#16a34a"; // verde — concluida sem alarme
  return "#94a3b8"; // cinza — rascunho/sem achados
}

export default function AnamneseRevisao() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authGet<SessionSummary[]>("/api/collaborator/anamnese/sessions");
      setSessions(data);
    } catch {
      setError("Não foi possível carregar as anamneses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const openDetail = useCallback(async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await authGet<SessionDetail>(`/api/collaborator/anamnese/sessions/${id}`);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  return (
    <div className="space-y-5" style={{ ["--brand" as never]: NAVY }}>
      {/* Cabecalho da pagina */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-black uppercase tracking-wide text-primary">
              Revisão de Anamneses
            </h1>
            <p className="text-xs text-muted-foreground">
              Achados de cada ficha de saúde — acesso da equipe clínica
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="btn-3d flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white"
          >
            <MessageCircle className="h-4 w-4" /> Enviar Anamnese (WhatsApp)
          </button>
          <button
            type="button"
            onClick={() => void loadSessions()}
            className="btn-3d-soft flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-600">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.1fr]">
        {/* LISTA (Grade Imaginaria) */}
        <div className="panel-3d rounded-md p-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              Nenhuma anamnese registrada ainda.
            </div>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => void openDetail(s.id)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition ${
                      selectedId === s.id ? "bevel-3d" : "btn-3d-soft"
                    }`}
                  >
                    {/* quadradinho de cor por alerta */}
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-sm"
                      style={{ background: alertColor(s) }}
                      title={
                        s.temAlarme ? "Achado grave" : s.suspeito > 0 ? "Há suspeitos" : "Sem alarme"
                      }
                    />
                    {/* ID + status (status ao lado do ID, nunca do nome) */}
                    <span className="flex w-20 flex-shrink-0 items-center gap-1.5">
                      <span className="font-mono text-xs text-gray-400">#{s.id}</span>
                      <StatusChip status={s.status} />
                    </span>
                    {/* nome do cliente */}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                      {s.clientName ?? "—"}
                    </span>
                    {/* meta grid fixo: contagens + data */}
                    <span className="flex flex-shrink-0 items-center gap-3 text-xs">
                      <span className="text-red-600" title="Diagnosticados">
                        {s.diagnosticado} dx
                      </span>
                      <span className="text-amber-600" title="Suspeitos">
                        {s.suspeito} sus
                      </span>
                      <span className="hidden w-24 text-right text-gray-400 sm:inline">
                        {fmtDate(s.completedAt ?? s.startedAt)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* DETALHE */}
        <div className="panel-3d min-h-[300px] rounded-md p-4">
          {!selectedId ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
              <ClipboardList className="h-8 w-8 text-gray-300" />
              Selecione uma anamnese à esquerda para ver os achados.
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando achados...
            </div>
          ) : !detail ? (
            <div className="py-12 text-center text-sm text-red-500">
              Não foi possível carregar o detalhe.
            </div>
          ) : (
            <DetailView detail={detail} />
          )}
        </div>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const concluida = status === "concluida";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        concluida ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {concluida ? "OK" : "Rasc."}
    </span>
  );
}

function DetailView({ detail }: { detail: SessionDetail }) {
  const dx = detail.findings.filter((f) => f.tipo === "diagnosticado");
  const sus = detail.findings.filter((f) => f.tipo === "suspeito");
  return (
    <div className="space-y-4">
      {/* identidade da sessao */}
      <div className="bevel-3d rounded-md px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-primary">
            {detail.clientName ?? "Demonstração (sem cliente)"}
          </span>
          <span className="font-mono text-xs text-gray-400">#{detail.id}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-500">
          <span>Modo: {detail.mode}</span>
          <span>Início: {fmtDate(detail.startedAt)}</span>
          <span>Conclusão: {fmtDate(detail.completedAt)}</span>
        </div>
      </div>

      {/* ACHADOS — conclusao primeiro */}
      <Section icon={<ShieldCheck className="h-4 w-4" />} title="Achados">
        {detail.findings.length === 0 ? (
          <Empty>Nenhum achado registrado.</Empty>
        ) : (
          <div className="space-y-3">
            <FindingList title="Diagnosticados" items={dx} color="#dc2626" />
            <FindingList title="Suspeitos" items={sus} color="#d97706" />
          </div>
        )}
      </Section>

      {/* RECUSAS */}
      <Section icon={<SkipForward className="h-4 w-4" />} title="Recusas registradas">
        {detail.refusals.length === 0 ? (
          <Empty>Nada foi pulado.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {detail.refusals.map((r) => (
              <li
                key={r.id}
                className="concave-3d rounded-md px-3 py-1.5 text-xs text-gray-600"
              >
                <span className="font-semibold">{r.alvo}</span>
                <span className="text-gray-400"> ({r.escopo})</span>
                {r.motivo ? <span className="text-gray-500"> — {r.motivo}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* OBSERVACOES */}
      <Section icon={<StickyNote className="h-4 w-4" />} title="Observações da equipe">
        {detail.notes.length === 0 ? (
          <Empty>Sem observações.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {detail.notes.map((n) => (
              <li key={n.id} className="concave-3d rounded-md px-3 py-1.5 text-xs text-gray-600">
                <span className="font-semibold uppercase tracking-wide text-gray-400">
                  {n.grupo}:
                </span>{" "}
                {n.observacao}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function FindingList({ title, items, color }: { title: string; items: Finding[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
        {title} ({items.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((f) => (
          <span
            key={f.id}
            className="rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: color, color }}
          >
            {f.rotulo}
            {f.severidade ? <span className="opacity-60"> · {f.severidade}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400">{children}</p>;
}

// ---------------------------------------------------------------------------
// Opcao A (distribuicao) — escolher cliente e gerar link wa.me da anamnese.
// ---------------------------------------------------------------------------
function InviteModal({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const { data: clients, isLoading } = useListClients({ search });

  const anamneseUrl = useMemo(() => {
    const base = import.meta.env.BASE_URL; // ja termina com "/"
    return `${window.location.origin}${base}anamnese/v2`;
  }, []);

  const buildWa = useCallback(
    (name: string, phone: string | null | undefined) => {
      const digits = (phone ?? "").replace(/\D/g, "");
      if (!digits) return null;
      const withDdi = digits.startsWith("55") ? digits : `55${digits}`;
      const firstName = name.split(" ")[0] || name;
      const msg =
        `Olá, ${firstName}! Aqui é do Instituto Pádua (Paxter). ` +
        `Antes da sua sessão, preencha sua ficha de saúde (anamnese) neste link: ` +
        `${anamneseUrl}\n\n` +
        `Você vai se identificar com CPF e data de nascimento. Leva poucos minutos. Obrigado!`;
      return `https://wa.me/${withDdi}?text=${encodeURIComponent(msg)}`;
    },
    [anamneseUrl],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16">
      <div className="panel-3d w-full max-w-md rounded-lg bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
            <MessageCircle className="h-4 w-4" /> Enviar Anamnese
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="concave-3d mb-3 flex items-center gap-2 rounded-md px-3">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente pelo nome..."
            className="h-10 w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          />
        </div>

        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </div>
          ) : !clients || clients.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nenhum cliente encontrado.</p>
          ) : (
            clients.map((c) => {
              const wa = buildWa(c.name, c.phone);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-gray-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-400">
                      {c.phone ? c.phone : "sem telefone cadastrado"}
                    </p>
                  </div>
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-3d flex flex-shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-white"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Enviar
                    </a>
                  ) : (
                    <span className="flex-shrink-0 text-[11px] uppercase tracking-wide text-gray-300">
                      sem telefone
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
