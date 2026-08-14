/**
 * Painel CEO — Penalidades do Concierge
 *
 * Permite ao CEO visualizar e resetar manualmente clientes bloqueados
 * ou penalizados pelo motor de escassez do Concierge.
 * Exibe histórico de resets (auditoria) por CPF.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  ShieldOff,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  PaxterClientSelector,
  type PaxterClientOption,
} from "@/components/PaxterClientSelector";

interface PenalidadeRow {
  cpf_mascarado: string;
  tentativas_falha: number;
  bloqueado_permanente: boolean;
  ultima_falha_at: string | null;
  criado_at: string;
  atualizado_at: string;
}

interface AuditoriaRow {
  id: number;
  cpf_mascarado: string;
  resetado_por: string;
  resetado_at: string;
  tentativas_anteriores: number;
}

interface ModalState {
  open: boolean;
  mode: "reset" | "historico";
  cpfMascarado: string;
  clienteId: number | null;
  confirmado: boolean;
}

const MODAL_INICIAL: ModalState = {
  open: false,
  mode: "reset",
  cpfMascarado: "",
  clienteId: null,
  confirmado: false,
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function PenalidadeBadge({ row }: { row: PenalidadeRow }) {
  if (row.bloqueado_permanente) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-700 border border-red-300">
        <ShieldOff className="w-3 h-3" />
        BLOQUEADO
      </span>
    );
  }
  if (row.tentativas_falha >= 2) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
        <AlertTriangle className="w-3 h-3" />
        +30 dias
      </span>
    );
  }
  if (row.tentativas_falha === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-yellow-100 text-yellow-700 border border-yellow-300">
        <AlertTriangle className="w-3 h-3" />
        +7 dias
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300">
      <CheckCircle2 className="w-3 h-3" />
      Livre
    </span>
  );
}

function HistoricoResets({
  cpfMascarado,
  cpfCompleto,
  base,
}: {
  cpfMascarado: string;
  cpfCompleto: string;
  base: string;
}) {
  const [rows, setRows] = useState<AuditoriaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErro(null);
    fetch(`${base}/api/admin/concierge-penalidade/${encodeURIComponent(cpfCompleto)}/historico`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error ?? "Erro");
        setRows(j.rows ?? []);
      })
      .catch((e) => {
        if (!cancelled) setErro(e instanceof Error ? e.message : "Erro");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base, cpfCompleto]);

  if (loading) {
    return (
      <tr>
        <td colSpan={6} className="px-6 py-3 bg-muted/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Carregando histórico…
          </div>
        </td>
      </tr>
    );
  }

  if (erro) {
    return (
      <tr>
        <td colSpan={6} className="px-6 py-3 bg-muted/20">
          <p className="text-xs text-red-500">{erro}</p>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={6} className="px-6 py-3 bg-muted/10 border-b border-border/40">
        <div className="flex items-center gap-1.5 mb-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Histórico de resets — {cpfMascarado}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum reset registrado ainda.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground pr-6">
                  Data do reset
                </th>
                <th className="text-left pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground pr-6">
                  Resetado por
                </th>
                <th className="text-left pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Tentativas anteriores
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/20">
                  <td className="py-1 pr-6 tabular-nums text-muted-foreground">
                    {formatDate(r.resetado_at)}
                  </td>
                  <td className="py-1 pr-6 font-medium">{r.resetado_por}</td>
                  <td className="py-1">
                    <span
                      className={`font-bold ${
                        r.tentativas_anteriores >= 3
                          ? "text-red-600"
                          : r.tentativas_anteriores >= 2
                            ? "text-amber-600"
                            : r.tentativas_anteriores === 1
                              ? "text-yellow-600"
                              : "text-emerald-600"
                      }`}
                    >
                      {r.tentativas_anteriores}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

export default function ConciergePenalidades() {
  const [rows, setRows] = useState<PenalidadeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [resetting, setResetting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [modal, setModal] = useState<ModalState>(MODAL_INICIAL);
  // Map of cpfMascarado → cpfCompleto for expanded history rows
  const [expandido, setExpandido] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lista de clientes para o PaxterClientSelector
  const [clientes, setClientes] = useState<PaxterClientOption[]>([]);

  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  // Carrega lista de clientes uma única vez
  useEffect(() => {
    fetch(`${base}/api/clients?limit=5000`)
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d) ? d : (d.clients ?? []);
        setClientes(
          arr.map((c: any) => ({
            id: c.id,
            name: c.name ?? "",
            cpf: c.cpf ?? null,
            phone: c.phone ?? null,
            photoUrl: c.photoUrl ?? null,
            status: c.status ?? "active",
            deletedAt: c.deletedAt ?? null,
          })),
        );
      })
      .catch(() => {
        // falha silenciosa — seletor fica vazio, usuário pode tentar depois
      });
  }, [base]);

  // CPF do cliente selecionado no modal (limpo, 11 dígitos)
  const cpfSelecionado = useMemo(() => {
    if (modal.clienteId === null) return "";
    const c = clientes.find((x) => x.id === modal.clienteId);
    return (c?.cpf ?? "").replace(/\D/g, "");
  }, [modal.clienteId, clientes]);

  const carregar = useCallback(
    async (cpfFiltro: string) => {
      setLoading(true);
      setErro(null);
      try {
        const qs = cpfFiltro.trim() ? `?cpf=${encodeURIComponent(cpfFiltro.trim())}` : "";
        const r = await fetch(`${base}/api/admin/concierge-penalidade${qs}`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        const j = await r.json();
        setRows(j.rows ?? []);
        setTotal(j.total ?? 0);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    },
    [base],
  );

  // Carrega na montagem
  useEffect(() => {
    void carregar("");
  }, [carregar]);

  // Debounce do filtro
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void carregar(filtro);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filtro, carregar]);

  /** Abre o modal de confirmação de reset com seletor de cliente. */
  function abrirModalReset(cpfMascarado: string) {
    setModal({
      open: true,
      mode: "reset",
      cpfMascarado,
      clienteId: null,
      confirmado: false,
    });
  }

  /** Abre o modal para selecionar o cliente e ver o histórico de resets. */
  function abrirModalHistorico(cpfMascarado: string) {
    // Se já está expandido, fecha
    if (expandido[cpfMascarado] !== undefined) {
      setExpandido((prev) => {
        const next = { ...prev };
        delete next[cpfMascarado];
        return next;
      });
      return;
    }
    setModal({
      open: true,
      mode: "historico",
      cpfMascarado,
      clienteId: null,
      confirmado: false,
    });
  }

  /** Executa a ação confirmada no modal (reset ou abrir histórico). */
  async function confirmarAcao() {
    if (cpfSelecionado.length < 11) return;

    if (modal.mode === "historico") {
      setExpandido((prev) => ({ ...prev, [modal.cpfMascarado]: cpfSelecionado }));
      setModal(MODAL_INICIAL);
      return;
    }

    // mode === "reset"
    if (!modal.confirmado) return;
    setModal((m) => ({ ...m, open: false }));
    setResetting(modal.cpfMascarado);
    setFeedback(null);
    try {
      const r = await fetch(
        `${base}/api/admin/concierge-penalidade/${encodeURIComponent(cpfSelecionado)}`,
        { method: "PATCH" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setFeedback({ msg: j.message ?? "Resetado.", ok: true });
      // Fecha histórico expandido para este CPF (CEO pode reabrir para ver o novo registro)
      setExpandido((prev) => {
        const next = { ...prev };
        delete next[modal.cpfMascarado];
        return next;
      });
      void carregar(filtro);
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : "Erro", ok: false });
    } finally {
      setResetting(null);
    }
  }

  const clienteSelecionadoValido = cpfSelecionado.length === 11;
  const podeConfirmar =
    clienteSelecionadoValido && (modal.mode === "historico" || modal.confirmado);

  return (
    <div className="space-y-6">
      {/* Modal — reset e histórico compartilham o mesmo Dialog */}
      <Dialog
        open={modal.open}
        onOpenChange={(open) => !open && setModal(MODAL_INICIAL)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black uppercase tracking-widest">
              {modal.mode === "reset" ? (
                <>
                  <RotateCcw className="w-4 h-4 text-amber-500" />
                  Confirmar reset de penalidade
                </>
              ) : (
                <>
                  <History className="w-4 h-4 text-muted-foreground" />
                  Histórico de resets
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Cliente:{" "}
              <span className="font-mono font-bold text-foreground">
                {modal.cpfMascarado}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Selecionar cliente
              </label>
              <PaxterClientSelector
                clientes={clientes}
                value={modal.clienteId}
                onChange={(id) => setModal((m) => ({ ...m, clienteId: id }))}
                placeholder="Selecionar cliente…"
                variant="popover"
              />
              {modal.clienteId !== null && !clienteSelecionadoValido && (
                <p className="text-[11px] text-amber-600">
                  O cliente selecionado não possui CPF cadastrado.
                </p>
              )}
            </div>

            {modal.mode === "reset" && (
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-amber-500 w-4 h-4 rounded"
                  checked={modal.confirmado}
                  onChange={(e) =>
                    setModal((m) => ({ ...m, confirmado: e.target.checked }))
                  }
                />
                <span className="text-xs text-foreground/80 leading-snug">
                  Confirmo o reset para este cliente — todas as tentativas serão
                  zeradas e o bloqueio removido.
                </span>
              </label>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="btn-3d-soft"
              onClick={() => setModal(MODAL_INICIAL)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className={
                modal.mode === "reset"
                  ? "btn-3d gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                  : "btn-3d gap-1.5"
              }
              disabled={!podeConfirmar}
              onClick={() => void confirmarAcao()}
            >
              {modal.mode === "reset" ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Resetar
                </>
              ) : (
                <>
                  <History className="w-3.5 h-3.5" />
                  Ver histórico
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cabeçalho */}
      <div className="bevel-3d px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldOff className="w-5 h-5 text-red-500" />
          <div>
            <h1 className="text-base font-black uppercase tracking-widest">
              Penalidades do Concierge
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Visualize e redefina clientes bloqueados pelo motor de escassez.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="btn-3d-soft gap-1.5"
          onClick={() => void carregar(filtro)}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Atualizar
        </Button>
      </div>

      {/* Regra de penalidades */}
      <div className="panel-3d-sub px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p className="font-bold text-foreground/80 uppercase tracking-wider mb-1">
          Legenda de penalidades
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <span>
            <span className="font-bold text-emerald-700">0 falhas</span> — acesso normal
          </span>
          <span>
            <span className="font-bold text-yellow-700">1 falha</span> — datas mín. +7 dias
          </span>
          <span>
            <span className="font-bold text-amber-700">2 falhas</span> — datas mín. +30 dias
          </span>
          <span>
            <span className="font-bold text-red-700">≥3 falhas</span> — bloqueado permanente
          </span>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-2 max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Filtrar por CPF (parcial)…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="concave-3d text-sm"
        />
      </div>

      {/* Feedback de reset */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded text-sm font-medium border ${
            feedback.ok
              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
              : "bg-red-50 text-red-700 border-red-300"
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 inline mr-1.5" />
          )}
          {feedback.msg}
        </div>
      )}

      {/* Tabela */}
      {erro ? (
        <div className="panel-3d-sub px-4 py-6 text-center text-red-600 text-sm">
          <AlertTriangle className="w-5 h-5 mx-auto mb-2" />
          {erro}
        </div>
      ) : rows.length === 0 && !loading ? (
        <div className="panel-3d-sub px-4 py-10 text-center text-muted-foreground text-sm">
          <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
          {filtro
            ? "Nenhum CPF encontrado com esse filtro."
            : "Nenhuma penalidade registrada."}
        </div>
      ) : (
        <div className="panel-3d-sub overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  CPF
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Tentativas
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Última falha
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Atualizado
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isExpanded = expandido[row.cpf_mascarado] !== undefined;
                return (
                  <>
                    <tr
                      key={`${row.cpf_mascarado}-${i}`}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs tracking-wider">
                        {row.cpf_mascarado}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-bold tabular-nums ${
                            row.tentativas_falha >= 3
                              ? "text-red-600"
                              : row.tentativas_falha >= 2
                                ? "text-amber-600"
                                : row.tentativas_falha === 1
                                  ? "text-yellow-600"
                                  : "text-emerald-600"
                          }`}
                        >
                          {row.tentativas_falha}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <PenalidadeBadge row={row} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(row.ultima_falha_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(row.atualizado_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="btn-3d-soft gap-1 text-xs h-7 px-2.5"
                            onClick={() => abrirModalHistorico(row.cpf_mascarado)}
                            title="Ver histórico de resets"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                            <History className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="btn-3d-soft gap-1 text-xs h-7 px-2.5"
                            disabled={
                              resetting === row.cpf_mascarado ||
                              row.tentativas_falha === 0
                            }
                            onClick={() => abrirModalReset(row.cpf_mascarado)}
                          >
                            {resetting === row.cpf_mascarado ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                            Resetar
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <HistoricoResets
                        key={`hist-${row.cpf_mascarado}`}
                        cpfMascarado={row.cpf_mascarado}
                        cpfCompleto={expandido[row.cpf_mascarado]}
                        base={base}
                      />
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando…
            </div>
          )}
          <div className="px-4 py-2 text-right text-[10px] text-muted-foreground border-t border-border/30">
            {total} registro{total !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
