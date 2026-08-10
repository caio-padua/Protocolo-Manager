import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link } from "wouter";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Plus, User, Phone, Mail,
  CheckSquare, Square, Trash2, UserCheck, UserX,
  RotateCcw, AlertTriangle, Camera, Calendar, MapPin,
} from "lucide-react";
import { formatStatus, getStatusColor } from "@/lib/status";
import { tituloProprio, cn } from "@/lib/utils";

type Tab = "ativos" | "desativados" | "apagados";
type BulkAction = "activate" | "deactivate" | "delete" | "restore";

const TABS: { key: Tab; label: string }[] = [
  { key: "ativos",      label: "ATIVOS" },
  { key: "desativados", label: "DESATIVADOS" },
  { key: "apagados",    label: "APAGADOS" },
];

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const PAGE_SIZE = 100;

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function calcIdade(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const raw = birthDate.includes("T") ? birthDate.split("T")[0] : birthDate;
  const parts = raw.split("-");
  const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (!y || !m || !d) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - y;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) idade--;
  return idade < 0 ? null : idade;
}

function formatBirthDate(birthDate: string | null | undefined): string {
  if (!birthDate) return "—";
  const raw = birthDate.includes("T") ? birthDate.split("T")[0] : birthDate;
  const parts = raw.split("-");
  if (parts.length !== 3) return birthDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

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
  const [tab, setTab]                     = useState<Tab>("ativos");
  const [search, setSearch]               = useState("");
  const [filterLetra, setFilterLetra]     = useState<string | null>(null);
  const [selected, setSelected]           = useState<Set<number>>(new Set());
  const [busy, setBusy]                   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tabClients, setTabClients]       = useState<any[]>([]);
  const [tabLoading, setTabLoading]       = useState(false);
  const [displayCount, setDisplayCount]   = useState(PAGE_SIZE);
  const sentinelRef                       = useRef<HTMLDivElement>(null);
  const abortRef                          = useRef<AbortController | null>(null);

  const loadClients = useCallback((currentTab: Tab, currentSearch: string) => {
    // Cancela qualquer fetch anterior para evitar race condition
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setTabLoading(true);
    const params = new URLSearchParams({ tab: currentTab });
    if (currentSearch) params.set("search", currentSearch);
    fetch(`/api/clients?${params}`, { signal })
      .then((r) => r.json())
      .then((data) => {
        setTabClients(Array.isArray(data) ? data : []);
        setTabLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setTabLoading(false);
      });
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setConfirmDelete(false);
    setDisplayCount(PAGE_SIZE);
    setFilterLetra(null);
    loadClients(tab, search);
  }, [tab, search, loadClients]);

  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [filterLetra]);

  // Scroll infinito: ao ver o sentinel, carrega mais 100
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setDisplayCount((prev) => prev + PAGE_SIZE);
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tabClients, filterLetra]);

  // Ordena tudo alfabeticamente (pt-BR)
  const sorted = useMemo(
    () => [...tabClients].sort((a, b) =>
      tituloProprio(a.name).localeCompare(tituloProprio(b.name), "pt-BR"),
    ),
    [tabClients],
  );

  // Letras disponíveis para a barra A-Z
  const disponíveis = useMemo(() => {
    const s = new Set<string>();
    for (const c of sorted) s.add(norm(c.name).charAt(0) || "#");
    return s;
  }, [sorted]);

  // Filtra por letra selecionada
  const afterLetter = useMemo(
    () => filterLetra
      ? sorted.filter((c) => norm(c.name).charAt(0) === filterLetra)
      : sorted,
    [sorted, filterLetra],
  );

  // Fatia para exibição (scroll infinito)
  const visible  = afterLetter.slice(0, displayCount);
  const hasMore  = visible.length < afterLetter.length;

  // Agrupa visible por letra
  const groups = useMemo(() => {
    const g: { letra: string; clientes: any[] }[] = [];
    for (const c of visible) {
      const l = tituloProprio(c.name).charAt(0).toUpperCase() || "#";
      const last = g[g.length - 1];
      if (last && last.letra === l) last.clientes.push(c);
      else g.push({ letra: l, clientes: [c] });
    }
    return g;
  }, [visible]);

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

  const allSelected  = visible.length > 0 && selected.size === visible.length;
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

      {/* ── Busca + Alfabeto (padrão cockpit) ── */}
      <div className="panel-3d-sub p-3 space-y-2 rounded-lg">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome ou CPF..."
            className="pl-8 field-engraved"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFilterLetra(null);
            }}
          />
        </div>

        {/* Barra A–Z — só aparece quando não há texto de busca ativo */}
        {!search && (
          <div className="flex flex-wrap gap-[3px]">
            <button
              type="button"
              onClick={() => setFilterLetra(null)}
              className={cn(
                "h-6 rounded border px-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
                filterLetra === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              TODOS
            </button>
            {LETRAS.map((l) => {
              const tem   = disponíveis.has(l);
              const ativa = filterLetra === l;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!tem}
                  onClick={() => setFilterLetra(ativa ? null : l)}
                  className={cn(
                    "h-6 w-6 rounded border text-[11px] font-bold transition-colors",
                    ativa
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : tem
                        ? "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                        : "cursor-not-allowed border-transparent text-muted-foreground/25",
                  )}
                >
                  {l}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de seleção em lote */}
      {visible.length > 0 && (
        <div className="panel-3d-sub flex items-center justify-between gap-3 px-3 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            <button onClick={toggleAll} className="flex items-center gap-2 group" title={allSelected ? "Desmarcar todos" : "Selecionar todos"}>
              {allSelected
                ? <CheckSquare className="w-5 h-5 text-accent" />
                : <Square className="w-5 h-5 text-foreground/60 group-hover:text-foreground transition-colors" />
              }
            </button>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-foreground/70">
              {someSelected
                ? <span className="text-accent">{selected.size} SELECIONADO{selected.size > 1 ? "S" : ""}</span>
                : "SELECIONAR TODOS"
              }
            </span>
          </div>
          {someSelected && (
            <div className="flex items-center gap-2 flex-wrap">
              {tab !== "ativos" && tab !== "apagados" && (
                <Button size="sm" className="btn-3d-soft text-[10px] font-bold h-8 px-3" disabled={busy} onClick={() => runBulk("activate")}>
                  <UserCheck className="w-3.5 h-3.5 mr-1.5" /> ATIVAR
                </Button>
              )}
              {tab === "ativos" && (
                <Button size="sm" className="btn-3d-soft text-[10px] font-bold h-8 px-3" disabled={busy} onClick={() => runBulk("deactivate")}>
                  <UserX className="w-3.5 h-3.5 mr-1.5" /> DESATIVAR
                </Button>
              )}
              {tab === "apagados" && (
                <Button size="sm" className="btn-3d-soft text-[10px] font-bold h-8 px-3" disabled={busy} onClick={() => runBulk("restore")}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> RESTAURAR
                </Button>
              )}
              {tab !== "apagados" && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-destructive uppercase tracking-widest">
                      Confirmar apagar {selected.size}?
                    </span>
                    <Button className="bg-destructive text-white text-[10px] font-bold h-8 px-3 hover:bg-destructive/80" disabled={busy} onClick={() => runBulk("delete")}>
                      SIM, APAGAR
                    </Button>
                    <Button className="btn-3d-soft text-[10px] font-bold h-8 px-3" onClick={() => setConfirmDelete(false)}>
                      CANCELAR
                    </Button>
                  </div>
                ) : (
                  <Button className="btn-3d-soft text-[10px] font-bold h-8 px-3 text-destructive border border-destructive/40 hover:bg-destructive/10" disabled={busy} onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> APAGAR
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Contador */}
      {!tabLoading && tabClients.length > 0 && (
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
          Exibindo{" "}
          <span className="text-primary">{visible.length.toLocaleString("pt-BR")}</span> de{" "}
          <span className="text-primary">{afterLetter.length.toLocaleString("pt-BR")}</span>
          {afterLetter.length !== tabClients.length && (
            <> (de {tabClients.length.toLocaleString("pt-BR")} no total)</>
          )}{" "}
          clientes.
        </p>
      )}

      {/* Aviso aba apagados */}
      {tab === "apagados" && !tabLoading && (
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-600 px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Clientes apagados ficam disponíveis para restauração por 5 anos.
        </div>
      )}

      {/* Lista */}
      {tabLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg panel-3d-sub" />
          ))}
        </div>
      ) : tabClients.length === 0 ? (
        <div className="text-center py-20 panel-3d bg-white/50">
          <User className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <h3 className="text-lg font-bold uppercase tracking-wide">
            {tab === "apagados" ? "Nenhum cliente apagado"
              : tab === "desativados" ? "Nenhum cliente desativado"
              : "Nenhum cliente encontrado"}
          </h3>
          {!search && tab === "ativos" && (
            <Link href="/clients/new">
              <Button className="btn-3d-soft mt-6">ADICIONAR CLIENTE</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ letra, clientes: grupo }) => (
            <div key={letra}>
              {/* Divisor de letra */}
              <div className="flex items-center gap-3 mb-3">
                <div className="bevel-3d w-8 h-8 rounded-md flex items-center justify-center text-sm font-extrabold text-primary shrink-0">
                  {letra}
                </div>
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                  {grupo.length} {grupo.length === 1 ? "cliente" : "clientes"}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {grupo.map((client: any) => {
                  const isSelected    = selected.has(client.id);
                  const nomeFormatado = tituloProprio(client.name);
                  const idade         = calcIdade(client.birthDate);
                  const dataNasc      = formatBirthDate(client.birthDate);

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
                      {/* Checkbox */}
                      <div className="absolute top-3 left-3 z-10">
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-accent" />
                          : <Square className="w-4 h-4 text-muted-foreground/40" />
                        }
                      </div>

                      <CardContent className="p-4 flex flex-row gap-3">

                        {/* Foto portrait (64 × 88 px) */}
                        <div className="concave-3d rounded-[6px] p-1 shrink-0 self-start mt-5">
                          <div className="w-16 h-[88px] rounded-[4px] overflow-hidden bg-muted flex items-center justify-center">
                            {client.photoUrl ? (
                              <img src={client.photoUrl} alt="Foto" className="w-full h-full object-cover" />
                            ) : (
                              <Camera className="w-5 h-5 text-muted-foreground/35" />
                            )}
                          </div>
                        </div>

                        {/* Dados — grade alinhada verticalmente */}
                        <div className="flex-1 min-w-0 pl-5 pt-1 space-y-1.5">

                          {/* Nome */}
                          <h3 className="text-sm font-bold leading-tight text-primary tracking-tight line-clamp-2 mb-2">
                            {nomeFormatado}
                          </h3>

                          {/* L1: CPF · STATUS */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="concave-3d inline-flex px-2 py-0.5 text-[10px] font-bold tabular-nums">
                              {client.cpf || "—"}
                            </div>
                            <Badge
                              variant="outline"
                              className={`rounded-[4px] border-none px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(client.status)}`}
                            >
                              {formatStatus(client.status)}
                            </Badge>
                          </div>

                          {/* L2: Idade · Data de nascimento */}
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Calendar className="w-3 h-3 text-primary shrink-0" />
                            <span className="font-semibold text-foreground/80">
                              {idade != null ? `${idade} anos` : "—"}
                            </span>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="tabular-nums">{dataNasc}</span>
                          </div>

                          {/* L3: Endereço */}
                          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                            <MapPin className="w-3 h-3 text-primary shrink-0 mt-px" />
                            <span className="line-clamp-1">{client.address || "—"}</span>
                          </div>

                          {/* L4: Telefone · Email */}
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Phone className="w-3 h-3 text-primary shrink-0" />
                            <span className="tabular-nums shrink-0 max-w-[90px] truncate">{client.phone || "—"}</span>
                            <span className="text-muted-foreground/30 shrink-0">·</span>
                            <Mail className="w-3 h-3 text-primary shrink-0" />
                            <span className="truncate lowercase">{client.email || "—"}</span>
                          </div>

                          {tab === "apagados" && client.deletedAt && (
                            <div className="text-[9px] font-bold text-destructive/70 uppercase tracking-widest">
                              Apagado em {new Date(client.deletedAt).toLocaleDateString("pt-BR")}
                            </div>
                          )}

                          {/* Rodapé */}
                          <div className="pt-2 border-t flex justify-end">
                            <Link
                              href={`/clients/${client.id}`}
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                              <div className="screen-3d px-2 py-1 text-[9px] font-bold text-primary uppercase tracking-wider">
                                Visualizar
                              </div>
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Sentinel para scroll infinito */}
          {hasMore && <div ref={sentinelRef} className="h-16" />}
          {!hasMore && afterLetter.length > 0 && (
            <p className="text-center text-[10px] text-muted-foreground/50 uppercase tracking-widest py-4">
              — Todos os {afterLetter.length.toLocaleString("pt-BR")} clientes exibidos —
            </p>
          )}
        </div>
      )}
    </div>
  );
}
