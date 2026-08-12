/**
 * Painel CEO — Penalidades do Concierge
 *
 * Permite ao CEO visualizar e resetar manualmente clientes bloqueados
 * ou penalizados pelo motor de escassez do Concierge.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ShieldOff,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PenalidadeRow {
  cpf_mascarado: string;
  tentativas_falha: number;
  bloqueado_permanente: boolean;
  ultima_falha_at: string | null;
  criado_at: string;
  atualizado_at: string;
}

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

export default function ConciergePenalidades() {
  const [rows, setRows] = useState<PenalidadeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [resetting, setResetting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

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

  async function resetar(cpfMascarado: string) {
    // Para o reset precisamos do CPF completo — como o CEO filtra por CPF e a
    // rota aceita dígitos parciais, pedimos confirmação e usamos o filtro atual.
    // Internamente o backend normaliza e faz o match exato.
    const cpfCompleto = prompt(
      `Digite o CPF completo (somente números) do cliente ${cpfMascarado} para confirmar o reset:`,
    );
    if (!cpfCompleto || cpfCompleto.replace(/\D/g, "").length < 11) return;

    setResetting(cpfMascarado);
    setFeedback(null);
    try {
      const r = await fetch(
        `${base}/api/admin/concierge-penalidade/${encodeURIComponent(cpfCompleto.replace(/\D/g, ""))}`,
        { method: "PATCH" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setFeedback({ msg: j.message ?? "Resetado.", ok: true });
      void carregar(filtro);
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : "Erro", ok: false });
    } finally {
      setResetting(null);
    }
  }

  return (
    <div className="space-y-6">
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
        <p className="font-bold text-foreground/80 uppercase tracking-wider mb-1">Legenda de penalidades</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <span><span className="font-bold text-emerald-700">0 falhas</span> — acesso normal</span>
          <span><span className="font-bold text-yellow-700">1 falha</span> — datas mín. +7 dias</span>
          <span><span className="font-bold text-amber-700">2 falhas</span> — datas mín. +30 dias</span>
          <span><span className="font-bold text-red-700">≥3 falhas</span> — bloqueado permanente</span>
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
          {filtro ? "Nenhum CPF encontrado com esse filtro." : "Nenhuma penalidade registrada."}
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
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="btn-3d-soft gap-1 text-xs h-7 px-2.5"
                      disabled={resetting === row.cpf_mascarado || row.tentativas_falha === 0}
                      onClick={() => void resetar(row.cpf_mascarado)}
                    >
                      {resetting === row.cpf_mascarado ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      Resetar
                    </Button>
                  </td>
                </tr>
              ))}
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
