import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Plus, User, Phone, Mail, Activity,
  CheckSquare, Square, Trash2, UserCheck, UserX,
  RotateCcw, AlertTriangle,
} from "lucide-react";
import { formatStatus, getStatusColor } from "@/lib/status";
import { tituloProprio } from "@/lib/utils";

type Tab = "ativos" | "desativados" | "apagados";
type BulkAction = "activate" | "deactivate" | "delete" | "restore";

const TABS: { key: Tab; label: string; badge?: string }[] = [
  { key: "ativos",      label: "ATIVOS" },
  { key: "desativados", label: "DESATIVADOS" },
  { key: "apagados",    label: "APAGADOS" },
];

const MAX_RENDER = 60;

async function bulkAction(ids: number[], action: BulkAction): Promise<void> {
  const res = await fetch("/api/clients/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Erro ao executar ação em lote");
  }
}

export default function Clients() {
  const [tab, setTab]         = useState<Tab>("ativos");
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [tabClients, setTabClients] = useState<any[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const loadClients = useCallback((currentTab: Tab, currentSearch: string) => {
    setTabLoading(true);
    const params = new URLSearchParams({ tab: currentTab });
    if (currentSearch) params.set("search", currentSearch);
    fetch(`/api/clients?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setTabClients(Array.isArray(data) ? data : []);
        setTabLoading(false);
      })
      .catch(() => setTabLoading(false));
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setConfirmDelete(false);
    loadClients(tab, search);
  }, [tab, search, loadClients]);

  const visible = tabClients.slice(0, MAX_RENDER);
  const hiddenCount = tabClients.length - visible.length;

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((c: any) => c.id)));
    }
  }

  async function runBulk(action: BulkAction) {
    if (selected.size === 0) return;
    setBusy(true);
    setConfirmDelete(false);
    try {
      await bulkAction(Array.from(selected), action);
      setSelected(new Set());
      loadClients(tab, search);
    } catch (err: any) {
      alert(err.message ?? "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  const allSelected = visible.length > 0 && selected.size === visible.length;
  const someSelected = selected.size > 0;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px] mt-1">
            Gerencie os pacientes da clínica e seus protocolos.
          </p>
        </div>
        <Link href="/clients/new">
          <Button className="btn-3d w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            NOVO CLIENTE
          </Button>
        </Link>
      </div>

      {/* Sub-abas */}
      <div className="flex gap-1 border-b border-border/40 pb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-colors rounded-t-md border-b-2 ${
              tab === t.key
                ? "border-accent text-accent bg-accent/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome ou CPF..."
            className="pl-8 field-engraved"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
        </div>
      </div>

      {/* Barra de seleção em lote */}
      {visible.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected
              ? <CheckSquare className="w-4 h-4 text-accent" />
              : <Square className="w-4 h-4" />
            }
            {allSelected ? "DESMARCAR TODOS" : "SELECIONAR TODOS"}
          </button>

          {someSelected && (
            <>
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">
                {selected.size} SELECIONADO{selected.size > 1 ? "S" : ""}
              </span>

              <div className="flex gap-2 flex-wrap ml-auto">
                {tab !== "ativos" && tab !== "apagados" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-3d-soft text-[9px] h-7"
                    disabled={busy}
                    onClick={() => runBulk("activate")}
                  >
                    <UserCheck className="w-3 h-3 mr-1" />
                    ATIVAR
                  </Button>
                )}
                {tab === "ativos" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-3d-soft text-[9px] h-7"
                    disabled={busy}
                    onClick={() => runBulk("deactivate")}
                  >
                    <UserX className="w-3 h-3 mr-1" />
                    DESATIVAR
                  </Button>
                )}
                {tab === "apagados" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-3d-soft text-[9px] h-7"
                    disabled={busy}
                    onClick={() => runBulk("restore")}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    RESTAURAR
                  </Button>
                )}
                {tab !== "apagados" && (
                  confirmDelete ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-destructive uppercase">
                        Confirma apagar {selected.size}?
                      </span>
                      <Button
                        size="sm"
                        className="bg-destructive text-white text-[9px] h-7 hover:bg-destructive/80"
                        disabled={busy}
                        onClick={() => runBulk("delete")}
                      >
                        SIM, APAGAR
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="btn-3d-soft text-[9px] h-7"
                        onClick={() => setConfirmDelete(false)}
                      >
                        CANCELAR
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="btn-3d-soft text-[9px] h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      APAGAR
                    </Button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Contador */}
      {!tabLoading && tabClients.length > 0 && (
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
          {hiddenCount > 0 ? (
            <>
              Mostrando os primeiros <span className="text-primary">{visible.length}</span> de{" "}
              <span className="text-primary">{tabClients.length.toLocaleString("pt-BR")}</span> clientes.
            </>
          ) : (
            <>
              <span className="text-primary">{tabClients.length.toLocaleString("pt-BR")}</span>{" "}
              {tabClients.length === 1 ? "cliente encontrado" : "clientes encontrados"}.
            </>
          )}
        </p>
      )}

      {/* Aviso aba apagados */}
      {tab === "apagados" && !tabLoading && (
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Clientes apagados ficam disponíveis para restauração por 5 anos.
        </div>
      )}

      {/* Lista */}
      {tabLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg panel-3d-sub" />
          ))}
        </div>
      ) : tabClients.length === 0 ? (
        <div className="text-center py-20 panel-3d bg-white/50">
          <User className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <h3 className="text-lg font-bold uppercase tracking-wide">
            {tab === "apagados"
              ? "Nenhum cliente apagado"
              : tab === "desativados"
              ? "Nenhum cliente desativado"
              : "Nenhum cliente encontrado"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Tente buscar com outros termos." : ""}
          </p>
          {!search && tab === "ativos" && (
            <Link href="/clients/new">
              <Button className="btn-3d-soft mt-6">ADICIONAR CLIENTE</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((client: any) => {
            const isSelected = selected.has(client.id);
            return (
              <div
                key={client.id}
                className={`relative panel-3d transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "ring-2 ring-accent ring-offset-1 ring-offset-background"
                    : "hover:panel-3d-active neon-hover"
                }`}
                onClick={() => toggleSelect(client.id)}
              >
                {/* Checkbox de seleção */}
                <div className="absolute top-3 left-3 z-10">
                  {isSelected
                    ? <CheckSquare className="w-4 h-4 text-accent" />
                    : <Square className="w-4 h-4 text-muted-foreground/40 hover:text-muted-foreground" />
                  }
                </div>

                {/* Link para o prontuário — clique no botão, não no card inteiro */}
                <CardContent className="p-5 flex flex-col">
                  <div className="flex justify-between items-start mb-4 pl-6">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold leading-none text-primary tracking-tight line-clamp-1">
                        {tituloProprio(client.name)}
                      </h3>
                      <div className="concave-3d inline-flex px-2 py-0.5 text-[10px] font-bold tabular-nums">
                        {client.cpf}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`rounded-[4px] border-none px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(client.status)}`}
                    >
                      {formatStatus(client.status)}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <Phone className="w-3 h-3 text-primary" />
                      <span className="tabular-nums">{client.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <Mail className="w-3 h-3 text-primary" />
                      <span className="line-clamp-1 lowercase">{client.email}</span>
                    </div>
                  </div>

                  {tab === "apagados" && client.deletedAt && (
                    <div className="text-[10px] font-bold text-destructive/70 uppercase tracking-widest mb-2">
                      Apagado em {new Date(client.deletedAt).toLocaleDateString("pt-BR")}
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground/70">
                      <Activity className="w-3 h-3" />
                      Prontuário
                    </div>
                    <Link
                      href={`/clients/${client.id}`}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      <div className="screen-3d px-3 py-1 text-[10px] font-bold text-primary uppercase tracking-wider">
                        Visualizar
                      </div>
                    </Link>
                  </div>
                </CardContent>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
