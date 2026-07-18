import { useState, useEffect, useCallback } from "react";
import { Globe, Search, Plus, Trash2, CheckCircle, XCircle, Loader2, RefreshCw, AtSign, ChevronDown, ChevronUp, AlertCircle, Settings } from "lucide-react";
import { ConsoleShell, BASE } from "./_shared";

// ── tipos ─────────────────────────────────────────────────────────────────

type StatusRdap = "disponivel" | "registrado" | "erro" | "verificando";

type CheckResult = { dominio: string; status: StatusRdap };

type Dominio = {
  id: number;
  dominio: string;
  registrador: string | null;
  status: string;
  expira_em: string | null;
  auto_renovar: boolean;
  notas: string | null;
  criado_em: string;
};

// ── helpers visuais ───────────────────────────────────────────────────────

function StatusBadgeRdap({ status }: { status: StatusRdap }) {
  if (status === "disponivel") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
      <CheckCircle className="h-3.5 w-3.5" /> DISPONÍVEL
    </span>
  );
  if (status === "registrado") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-950/40 px-3 py-1 text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
      <XCircle className="h-3.5 w-3.5" /> REGISTRADO
    </span>
  );
  if (status === "verificando") return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> VERIFICANDO
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950/40 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
      <AlertCircle className="h-3.5 w-3.5" /> ERRO
    </span>
  );
}

function StatusBadgeDominio({ status }: { status: string }) {
  const map: Record<string, string> = {
    ativo: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
    expirado: "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400",
    pendente: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
    cancelado: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ── BLOCO 1 — Verificador de Disponibilidade ─────────────────────────────

function BlocoVerificador({ onSelectForControl }: { onSelectForControl: (dominio: string) => void }) {
  const [base, setBase] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [erro, setErro] = useState("");

  async function verificar() {
    const b = base.trim().toLowerCase().replace(/\..+$/, ""); // remove extensão se digitou
    if (!b) { setErro("Digite o nome base do domínio (ex.: pawards)"); return; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(b)) { setErro("Use apenas letras, números e hífens"); return; }
    setErro(""); setLoading(true);
    setResults([
      { dominio: `${b}.com.br`, status: "verificando" },
      { dominio: `${b}.com`, status: "verificando" },
      { dominio: `${b}.net.br`, status: "verificando" },
      { dominio: `${b}.net`, status: "verificando" },
      { dominio: `${b}.org.br`, status: "verificando" },
    ]);
    try {
      const r = await fetch(`${BASE}/api/dominios/check?base=${encodeURIComponent(b)}`);
      if (r.ok) {
        const d = await r.json();
        setResults(d.resultados);
      } else {
        setErro("Erro ao verificar disponibilidade");
        setResults([]);
      }
    } catch {
      setErro("Falha de rede ao verificar");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel-3d space-y-4 p-5">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Search className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bloco 1 — Verificador de Disponibilidade</span>
      </div>

      <p className="text-sm text-muted-foreground">
        Digite o nome base (sem extensão) para verificar disponibilidade em tempo real via <strong>Registro.br RDAP</strong> e <strong>Verisign</strong>.
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={base}
            onChange={e => setBase(e.target.value)}
            onKeyDown={e => e.key === "Enter" && verificar()}
            placeholder="ex.: pawards  (sem .com.br)"
            className="w-full rounded border border-border bg-background pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button onClick={verificar} disabled={loading}
          className="btn-3d inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Verificar
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      {results.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {results.map(r => (
            <div key={r.dominio} className="flex items-center justify-between rounded border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="font-mono text-sm font-semibold">{r.dominio}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadgeRdap status={r.status} />
                {r.status === "disponivel" && (
                  <button onClick={() => onSelectForControl(r.dominio)}
                    className="text-[10px] text-primary underline-offset-2 hover:underline font-semibold mt-0.5">
                    + Adicionar ao controle
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Verificação via API pública RDAP — sem custo, sem autenticação. Registro de novos domínios: escolha o registrador nas configurações.
      </p>
    </div>
  );
}

// ── BLOCO 2 — Domínios Sob Controle ──────────────────────────────────────

function BlocoControle({
  dominios,
  loading,
  onRefresh,
  selecionados,
  onToggle,
  onAdd,
  onDelete,
}: {
  dominios: Dominio[];
  loading: boolean;
  onRefresh: () => void;
  selecionados: Set<number>;
  onToggle: (id: number) => void;
  onAdd: (dominio: string, registrador: string) => Promise<void>;
  onDelete: (id: number, dominio: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [novoDominio, setNovoDominio] = useState("");
  const [novoRegistrador, setNovoRegistrador] = useState("manual");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!novoDominio.trim()) return;
    setSaving(true);
    await onAdd(novoDominio.trim(), novoRegistrador);
    setNovoDominio(""); setShowAdd(false);
    setSaving(false);
  }

  return (
    <div className="panel-3d space-y-4 p-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Bloco 2 — Domínios Sob Controle ({dominios.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAdd(v => !v)}
            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors">
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
          <button onClick={onRefresh} disabled={loading}
            className="rounded border border-border p-1.5 hover:bg-muted transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adicionar domínio manualmente</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Domínio</label>
              <input value={novoDominio} onChange={e => setNovoDominio(e.target.value)}
                placeholder="ex.: pawards.com.br"
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Registrador</label>
              <select value={novoRegistrador} onChange={e => setNovoRegistrador(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="manual">Manual (já tenho, só registrar)</option>
                <option value="registro.br">Registro.br</option>
                <option value="namecheap">Namecheap</option>
                <option value="godaddy">GoDaddy</option>
                <option value="cloudflare">Cloudflare</option>
                <option value="locaweb">Locaweb</option>
                <option value="outros">Outros</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !novoDominio.trim()}
              className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Salvar
            </button>
            <button onClick={() => setShowAdd(false)}
              className="rounded border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {selecionados.size > 0 && (
        <div className="rounded border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-semibold text-primary">
          {selecionados.size} domínio{selecionados.size > 1 ? "s" : ""} selecionado{selecionados.size > 1 ? "s" : ""} — role para baixo para criar aliases
        </div>
      )}

      {dominios.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
          <Globe className="h-8 w-8 opacity-20" />
          <p className="text-sm">Nenhum domínio cadastrado. Adicione manualmente ou use o verificador acima.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2.5 w-10"></th>
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Domínio</th>
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Registrador</th>
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Expira em</th>
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Notas</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dominios.map(d => (
                <tr key={d.id} className={`transition-colors ${selecionados.has(d.id) ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selecionados.has(d.id)} onChange={() => onToggle(d.id)}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer" />
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono font-semibold text-foreground">{d.dominio}</span>
                  </td>
                  <td className="px-3 py-3"><StatusBadgeDominio status={d.status} /></td>
                  <td className="px-3 py-3 text-muted-foreground capitalize">{d.registrador ?? "—"}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">
                    {d.expira_em ? new Date(d.expira_em).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-3 py-3 max-w-[180px] truncate text-muted-foreground">{d.notas ?? "—"}</td>
                  <td className="px-2 py-3">
                    <button onClick={() => onDelete(d.id, d.dominio)}
                      className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── BLOCO 3 — Criador de Aliases ──────────────────────────────────────────

function BlocoAliases({ dominiosSelecionados }: { dominiosSelecionados: Dominio[] }) {
  const [prefixo, setPrefixo] = useState("");
  const [conta, setConta] = useState("");
  const previews = dominiosSelecionados.map(d => `${prefixo || "alias"}@${d.dominio}`);

  return (
    <div className="panel-3d space-y-4 p-5">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <AtSign className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Bloco 3 — Criador de Aliases ({dominiosSelecionados.length} domínio{dominiosSelecionados.length > 1 ? "s" : ""} selecionado{dominiosSelecionados.length > 1 ? "s" : ""})
        </span>
      </div>

      <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-2">
        <Settings className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Aguardando credenciais Zoho Admin</p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
            Para criar aliases automaticamente, forneça: <strong>ZOHO_ORG_ID</strong> + <strong>ZOHO_ADMIN_TOKEN</strong> (OAuth2 com scope <code>ZohoMail.organization.accounts.ALL</code>).
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prefixo do alias</label>
          <div className="mt-1 relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" value={prefixo} onChange={e => setPrefixo(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
              placeholder="ex.: ceo, clinica, atendimento"
              className="w-full rounded border border-border bg-background pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Conta de destino (Zoho)</label>
          <input type="text" value={conta} onChange={e => setConta(e.target.value)}
            placeholder="ex.: caio@pawards.com.br"
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
      </div>

      {prefixo && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prévia dos aliases a criar:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {previews.map(p => (
              <div key={p} className="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2">
                <AtSign className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className="font-mono text-sm font-semibold">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button disabled
        className="btn-3d inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold opacity-40 cursor-not-allowed">
        <AtSign className="h-4 w-4" />
        Criar aliases automaticamente
      </button>

      <p className="text-[11px] text-muted-foreground">
        Após configurar as credenciais Zoho, este botão criará os aliases via Zoho Admin API em todos os domínios selecionados simultaneamente.
      </p>
    </div>
  );
}

// ── TELA PRINCIPAL ────────────────────────────────────────────────────────

export default function PainelDominios() {
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [loadingDom, setLoadingDom] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const fetchDominios = useCallback(async () => {
    setLoadingDom(true);
    try {
      const r = await fetch(`${BASE}/api/dominios`);
      if (r.ok) { const d = await r.json(); setDominios(d.items ?? []); }
    } catch { /* silencioso */ }
    finally { setLoadingDom(false); }
  }, []);

  useEffect(() => { fetchDominios(); }, [fetchDominios]);

  function toggleSelect(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleAdd(dominio: string, registrador: string) {
    await fetch(`${BASE}/api/dominios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dominio, registrador }),
    });
    await fetchDominios();
  }

  async function handleDelete(id: number, dominio: string) {
    if (!window.confirm(`Remover "${dominio}" do painel? O domínio em si não será cancelado.`)) return;
    await fetch(`${BASE}/api/dominios/${id}`, { method: "DELETE" });
    setSelecionados(prev => { const n = new Set(prev); n.delete(id); return n; });
    await fetchDominios();
  }

  function handleSelectForControl(dominio: string) {
    // pré-preenche o modal de adicionar com o domínio verificado
    handleAdd(dominio, "manual").then(() => fetchDominios());
  }

  const dominiosSelecionados = dominios.filter(d => selecionados.has(d.id));

  return (
    <ConsoleShell
      icon={Globe}
      title="Painel de Domínios & Aliases"
      subtitle="Verifique disponibilidade, gerencie domínios sob controle e crie aliases de e-mail automaticamente."
    >
      {/* Bloco 1 — Verificador */}
      <BlocoVerificador onSelectForControl={handleSelectForControl} />

      {/* Bloco 2 — Domínios Sob Controle */}
      <BlocoControle
        dominios={dominios}
        loading={loadingDom}
        onRefresh={fetchDominios}
        selecionados={selecionados}
        onToggle={toggleSelect}
        onAdd={handleAdd}
        onDelete={handleDelete}
      />

      {/* Bloco 3 — Criador de Aliases (aparece ao selecionar) */}
      {selecionados.size > 0 && (
        <BlocoAliases dominiosSelecionados={dominiosSelecionados} />
      )}
    </ConsoleShell>
  );
}
