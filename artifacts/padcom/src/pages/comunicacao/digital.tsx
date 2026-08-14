import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Smartphone, MessageCircle, Send, Save, ShieldCheck, ShieldAlert, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
import {
  ConsoleShell,
  IntegrationCard,
  SlotCampo,
  VaultStatusStrip,
  BASE,
  type SlotEstado,
} from "./_shared";

// ---------------------------------------------------------------------------
// COMUNICACAO DIGITAL — dois canais SIMETRICOS (ordem do CEO, 14/08/2026).
//
// "Se um servico tem um campo, o outro tem que ter o mesmo campo, mesmo que
// nao use — o nao usado aparece em formato visual diferente."
//
// Por isso esta tela NAO sabe quais campos existem: ela varre os slots que o
// servidor devolve em /api/comunicacao/canais. A simetria e garantida la (uma
// tabela unica descreve os dois canais), entao os dois cartoes nao tem como
// divergir — e nao ha nome de bot, rotulo nem chave escrita neste arquivo.
// ---------------------------------------------------------------------------

type Slot = {
  slot: string;
  ordem: number;
  rotulo: string;
  tipo: "texto" | "segredo" | "url";
  aplicavel: boolean;
  editavel: boolean;
  isSet: boolean;
  masked: string | null;
  source: string | null;
  valorPublico: string | null;
  nota: string | null;
  placeholder?: string;
};

type Canal = {
  canal: string;
  label: string;
  provedor: string;
  ativo: boolean;
  statusLabelOn: string;
  statusLabelOff: string;
  avisos: string[];
  slots: Slot[];
};

// Icone e decoracao, nao conteudo: o servidor manda os DADOS, a tela escolhe o
// desenho. Canal sem entrada no mapa cai no icone generico — nunca quebra.
const ICONE_CANAL: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  telegram: Send,
};
const ACENTO_CANAL: Record<string, string> = {
  whatsapp: "text-emerald-600",
  telegram: "text-sky-600",
};

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getCollabToken();
  return { ...(extra ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function useCanais() {
  const [canais, setCanais] = useState<Canal[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return fetch(`${BASE}/api/comunicacao/canais`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setCanais(d.canais as Canal[]);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { canais, loading, error, reload: load, setCanais };
}

// ---------------------------------------------------------------------------
// Cartao de um canal — desenha TODOS os slots que o servidor mandou, na ordem
// que ele mandou. Nenhum slot e pulado: o que nao se aplica vira formato
// distinto dentro do proprio SlotCampo.
// ---------------------------------------------------------------------------
function CartaoCanal({
  canal,
  carregando,
  erro,
  aoSalvar,
}: {
  canal: Canal;
  carregando: boolean;
  erro: boolean;
  aoSalvar: (canalId: string, valores: Record<string, string>) => Promise<void>;
}) {
  const Icone = ICONE_CANAL[canal.canal] ?? Smartphone;
  const acento = ACENTO_CANAL[canal.canal] ?? "text-primary";

  // Valor digitado por slot + o valor com que o campo nasceu (para nao
  // reenviar ao servidor o que ninguem tocou).
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const inicialRef = useRef<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const revelados = useRef<Record<string, string | null> | null>(null);

  useEffect(() => {
    const base: Record<string, string> = {};
    for (const s of canal.slots) {
      if (s.aplicavel && s.editavel) base[s.slot] = s.valorPublico ?? "";
    }
    inicialRef.current = { ...base };
    setRascunho(base);
    revelados.current = null;
  }, [canal]);

  const revelar = useCallback(
    async (slot: string): Promise<string | null> => {
      if (revelados.current) return revelados.current[slot] ?? null;
      const r = await fetch(`${BASE}/api/comunicacao/canais/${canal.canal}/revelar`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
      });
      if (!r.ok) return null;
      const d = (await r.json()) as { valores: Record<string, string | null> };
      revelados.current = d.valores;
      return d.valores[slot] ?? null;
    },
    [canal.canal],
  );

  const alterados = Object.entries(rascunho).filter(
    ([slot, v]) => v.trim() && v !== (inicialRef.current[slot] ?? ""),
  );

  async function salvar() {
    if (!alterados.length) return;
    setSalvando(true);
    try {
      await aoSalvar(canal.canal, Object.fromEntries(alterados));
      revelados.current = null;
    } finally {
      setSalvando(false);
    }
  }

  const editaveis = canal.slots.filter((s) => s.aplicavel && s.editavel);
  const faltando = editaveis.filter((s) => !s.isSet).length;

  return (
    <IntegrationCard
      icon={Icone}
      name={canal.label}
      accent={acento}
      on={canal.ativo}
      pending={carregando}
      error={erro}
      labelOn={canal.statusLabelOn}
      labelOff={canal.statusLabelOff}
    >
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        Provedor: <span className="font-semibold text-foreground/80">{canal.provedor}</span>
      </p>

      <VaultStatusStrip configured={faltando === 0} missingCount={faltando} />

      <div className="space-y-3">
        {canal.slots.map((s) => {
          const estado: SlotEstado = !s.aplicavel
            ? "naoAplicavel"
            : s.editavel
              ? "editavel"
              : "leitura";
          return (
            <SlotCampo
              key={s.slot}
              rotulo={s.rotulo}
              estado={estado}
              isSet={s.isSet}
              masked={s.masked}
              source={s.source}
              valorPublico={s.valorPublico}
              nota={s.nota}
              placeholder={s.placeholder}
              comOlho={s.tipo === "segredo" || s.tipo === "url"}
              value={rascunho[s.slot] ?? ""}
              onChange={(v) => setRascunho((prev) => ({ ...prev, [s.slot]: v }))}
              onReveal={() => revelar(s.slot)}
            />
          );
        })}
      </div>

      {canal.avisos.length > 0 && (
        <div className="concave-3d space-y-1 px-3 py-2">
          {canal.avisos.map((a, i) => (
            <p key={i} className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{a}</span>
            </p>
          ))}
        </div>
      )}

      <Button
        onClick={salvar}
        disabled={salvando || alterados.length === 0}
        className="btn-3d w-full gap-2"
      >
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {alterados.length === 0
          ? "Nada alterado"
          : `Salvar ${alterados.length} campo(s) de ${canal.label}`}
      </Button>
    </IntegrationCard>
  );
}

// ---------------------------------------------------------------------------
// Painel de saúde do webhook Telegram — hook + badge + botão de reativação
// ---------------------------------------------------------------------------

interface WebhookStatus {
  healthy: boolean;
  url: string;
  pendingUpdateCount: number;
  lastErrorMessage?: string;
  mock?: boolean;
  fetchError?: string;
  checkedAt: string;
}

function useTelegramWebhookStatus() {
  const [data, setData] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${BASE}/api/telegram/webhook-status`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        setData(d as WebhookStatus);
        setError(false);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [rev]);

  const refetch = useCallback(() => setRev((v) => v + 1), []);

  return { data, loading, error, refetch };
}

function WebhookBadge({ loading, error, data }: {
  loading: boolean;
  error: boolean;
  data: WebhookStatus | null;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Verificando…
      </span>
    );
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
        <ShieldAlert className="h-3.5 w-3.5" />
        Indisponível
      </span>
    );
  }
  if (!data) return null;
  if (data.mock) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        <ShieldAlert className="h-3.5 w-3.5" />
        Token ausente (MOCK)
      </span>
    );
  }
  if (data.healthy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Webhook Ativo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
      <ShieldAlert className="h-3.5 w-3.5" />
      Webhook Inativo
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------
export default function ComunicacaoDigital() {
  const { canais, loading, error, reload } = useCanais();
  const { toast } = useToast();
  const { data: webhookData, loading: webhookLoading, error: webhookError, refetch: refetchWebhook } = useTelegramWebhookStatus();

  const [reactivating, setReactivating] = useState(false);
  const [reactivateMsg, setReactivateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reactivateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasTelegram = canais?.some((c) => c.canal === "telegram") ?? false;

  async function salvarCanal(canalId: string, valores: Record<string, string>) {
    try {
      const r = await fetch(`${BASE}/api/comunicacao/canais/${canalId}/credenciais`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(valores),
      });
      if (!r.ok) {
        toast({ title: `Falha ao salvar (${r.status})`, variant: "destructive" });
        return;
      }
      const d = (await r.json()) as { salvos: number; erros: string[] };
      if (d.erros?.length) {
        toast({ title: d.erros.join(" · "), variant: "destructive" });
      }
      if (d.salvos > 0) {
        toast({ title: `${d.salvos} campo(s) salvo(s) e já valendo no servidor` });
      }
      await reload();
    } catch {
      toast({ title: "Erro de rede ao salvar", variant: "destructive" });
    }
  }

  async function handleReactivateWebhook() {
    setReactivating(true);
    setReactivateMsg(null);
    try {
      const resp = await fetch(`${BASE}/api/telegram/register-webhook`, {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await resp.json() as { ok: boolean; descricao?: string; error?: string };
      const errorMap: Record<string, string> = {
        token_ausente: "Token do bot não está no cofre. Configure telegram.botToken primeiro.",
        webhook_secret_ausente: "Segredo do webhook ausente no cofre. Configure telegram.webhookSecret primeiro.",
        dominio_publico_ausente: "Domínio público não configurado no servidor (RAILWAY_PUBLIC_DOMAIN ou REPLIT_DEV_DOMAIN).",
      };
      setReactivateMsg({
        ok: body.ok,
        text: body.ok
          ? (body.descricao ?? "Webhook reativado com sucesso!")
          : (errorMap[body.error ?? ""] ?? body.descricao ?? body.error ?? "Falha ao registrar webhook."),
      });
      if (body.ok) {
        reactivateTimerRef.current = setTimeout(() => { refetchWebhook(); }, 1500);
      }
    } catch {
      setReactivateMsg({ ok: false, text: "Erro de rede ao contactar o servidor." });
    } finally {
      setReactivating(false);
    }
  }

  return (
    <ConsoleShell
      icon={Smartphone}
      title="Comunicação Digital"
      subtitle="Mensagens diretas ao cliente — WhatsApp e Telegram, campo a campo, na mesma ordem nos dois."
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Os dois cartões têm os <strong>mesmos campos, na mesma posição</strong>. Onde o canal não
          usa o campo, ele aparece riscado em cinza — nunca some.
        </p>
        <Button variant="outline" size="sm" onClick={() => reload()} className="gap-2 shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="concave-3d mb-3 flex items-start gap-2 px-3 py-2.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[12px]">
            Não foi possível ler o estado dos canais. Faça login como colaborador e use
            "Atualizar".
          </p>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {(canais ?? []).map((c) => (
          <CartaoCanal
            key={c.canal}
            canal={c}
            carregando={loading}
            erro={error}
            aoSalvar={salvarCanal}
          />
        ))}
        {loading && !canais && (
          <p className="text-[12px] text-muted-foreground">Consultando os canais…</p>
        )}
      </section>

      {/* Painel de saúde do webhook — só aparece quando o canal Telegram está presente */}
      {hasTelegram && (
        <div className="concave-3d mt-4 flex items-start justify-between gap-2 px-3 py-2">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Saúde do Webhook Telegram
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              {webhookLoading
                ? "Consultando Telegram…"
                : webhookError
                  ? "Não foi possível verificar"
                  : webhookData?.mock
                    ? "Token ausente — verificação indisponível"
                    : webhookData?.healthy
                      ? `URL registrada · ${webhookData.pendingUpdateCount} updates pendentes`
                      : webhookData?.fetchError
                        ? `Erro de rede: ${webhookData.fetchError}`
                        : "Webhook não registrado — polling pode estar ativo"}
            </p>
            {webhookData?.lastErrorMessage && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                Último erro: {webhookData.lastErrorMessage}
              </p>
            )}
            {!webhookData?.healthy && !webhookLoading && !webhookError && !webhookData?.mock && (
              <p className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">
                Mensagens dos pacientes podem não estar chegando ao CEO.
              </p>
            )}
            {reactivateMsg && (
              <p className={`text-[11px] font-medium ${reactivateMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                {reactivateMsg.text}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <WebhookBadge loading={webhookLoading} error={webhookError} data={webhookData} />
            {!webhookData?.healthy && !webhookLoading && !webhookData?.mock && (
              <button
                onClick={handleReactivateWebhook}
                disabled={reactivating}
                className="btn-3d-soft inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-60"
              >
                {reactivating
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" />}
                {reactivating ? "Registrando…" : "Reativar Webhook"}
              </button>
            )}
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
