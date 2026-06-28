import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { KeyRound, Save, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
import {
  IntegrationCard,
  ToggleWell,
  CredentialField,
  VaultStatusStrip,
} from "@/pages/comunicacao/_shared";

// ===========================================================================
// MOTOR UNICO DE TELA (Padrao 18) — consome /api/integrations e monta o card de
// credencial igual ao dos gateways: cabecalho com luz, toggle no topo, faixa de
// status do cofre, campos com olho que revela o valor real e bloco de CAMPO
// PERSONALIZADO (o operador cria chave/valor nova sozinho). Reaproveita os
// primitivos de comunicacao/_shared — UMA fonte visual para todas as telas.
// ===========================================================================

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type IntegrationField = {
  field: string;
  label: string;
  kind: "secret" | "config";
  secret: boolean;
  isSet: boolean;
  value?: string;
  masked?: string | null;
  source?: string | null;
};

export type IntegrationCustom = {
  slug: string;
  label: string;
  isSet: boolean;
  masked?: string | null;
  source?: string | null;
};

export type IntegrationPayload = {
  provider: string;
  label: string;
  hasToggle: boolean;
  enabled: boolean;
  configured: boolean;
  missingCount: number;
  allowCustom: boolean;
  fields: IntegrationField[];
  custom: IntegrationCustom[];
};

type RevealResult = {
  values: Record<string, string | null>;
  custom: Record<string, string | null>;
};

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const t = getCollabToken();
  return { ...(extra ?? {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

export function useIntegration(provider: string) {
  const [data, setData] = useState<IntegrationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return fetch(`${BASE}/api/integrations/${provider}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("integration"))))
      .then((d: IntegrationPayload) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [provider]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (values: Record<string, string>, custom: Record<string, string>) => {
      const r = await fetch(`${BASE}/api/integrations/${provider}/credentials`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ values, custom }),
      });
      if (!r.ok) throw new Error("save");
      await load();
    },
    [provider, load],
  );

  const reveal = useCallback(async (): Promise<RevealResult> => {
    const r = await fetch(`${BASE}/api/integrations/${provider}/reveal`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
    });
    if (!r.ok) throw new Error("reveal");
    const d = await r.json();
    return { values: d.values ?? {}, custom: d.custom ?? {} };
  }, [provider]);

  const toggle = useCallback(
    async (enabled: boolean) => {
      const r = await fetch(`${BASE}/api/integrations/${provider}/toggle`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error("toggle");
      await load();
    },
    [provider, load],
  );

  const addCustom = useCallback(
    async (label: string, value?: string) => {
      const r = await fetch(`${BASE}/api/integrations/${provider}/custom`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ label, value }),
      });
      if (!r.ok) throw new Error("custom");
      await load();
    },
    [provider, load],
  );

  const removeCustom = useCallback(
    async (slug: string) => {
      const r = await fetch(`${BASE}/api/integrations/${provider}/custom/${slug}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error("custom-del");
      await load();
    },
    [provider, load],
  );

  return { data, loading, error, reload: load, save, reveal, toggle, addCustom, removeCustom };
}

// Campo de configuracao (nao-secreto, ex.: URL base) — input simples pre-preenchido
// com o valor atual (em claro). Segue o visual gravado do Padrao 18.
function ConfigFieldRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </label>
      <div className="concave-3d flex h-10 items-center gap-1 px-1">
        <Input
          className="field-engraved h-8 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

export function IntegrationVaultCard({
  provider,
  icon,
  accent = "text-primary",
  description,
  labelOn = "Configurado",
  labelOff = "Sem credenciais",
  toggleLabel = "Integração ativa",
}: {
  provider: string;
  icon: LucideIcon;
  accent?: string;
  description?: React.ReactNode;
  labelOn?: string;
  labelOff?: string;
  toggleLabel?: string;
}) {
  const { toast } = useToast();
  const { data, loading, error, save, reveal, toggle, addCustom, removeCustom } =
    useIntegration(provider);

  const [values, setValues] = useState<Record<string, string>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const revealedRef = useRef<RevealResult | null>(null);

  // Pre-preenche os campos CONFIG (em claro) quando os dados chegam; campos
  // secretos ficam vazios (campo vazio = nao altera).
  useEffect(() => {
    if (!data) return;
    const seed: Record<string, string> = {};
    for (const f of data.fields) {
      if (f.kind === "config") seed[f.field] = f.value ?? "";
    }
    setValues(seed);
    setCustomValues({});
    revealedRef.current = null;
  }, [data]);

  async function revealField(field: string): Promise<string | null> {
    if (!revealedRef.current) revealedRef.current = await reveal();
    return revealedRef.current.values[field] ?? null;
  }

  async function revealCustom(slug: string): Promise<string | null> {
    if (!revealedRef.current) revealedRef.current = await reveal();
    return revealedRef.current.custom[slug] ?? null;
  }

  async function submit() {
    if (!data) return;
    // Campos: envia config sempre (mantem valor) e secretos so quando preenchidos.
    const filledValues: Record<string, string> = {};
    for (const f of data.fields) {
      const v = (values[f.field] ?? "").trim();
      if (v !== "") filledValues[f.field] = v;
    }
    const filledCustom: Record<string, string> = {};
    for (const [slug, v] of Object.entries(customValues)) {
      if (v.trim() !== "") filledCustom[slug] = v.trim();
    }
    if (Object.keys(filledValues).length === 0 && Object.keys(filledCustom).length === 0) {
      toast({ title: "Preencha ao menos um campo para salvar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await save(filledValues, filledCustom);
      toast({ title: `${data.label}: salvo no cofre` });
    } catch {
      toast({ title: "Falha ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    setTogglePending(true);
    try {
      await toggle(enabled);
    } catch {
      toast({ title: "Falha ao alternar", variant: "destructive" });
    } finally {
      setTogglePending(false);
    }
  }

  async function handleAddCustom() {
    if (!newLabel.trim()) {
      toast({ title: "Dê um nome ao campo personalizado", variant: "destructive" });
      return;
    }
    setAddingCustom(true);
    try {
      await addCustom(newLabel.trim());
      toast({ title: "Campo personalizado criado" });
      setNewLabel("");
    } catch {
      toast({ title: "Falha ao criar campo", variant: "destructive" });
    } finally {
      setAddingCustom(false);
    }
  }

  async function handleRemoveCustom(slug: string) {
    try {
      await removeCustom(slug);
      toast({ title: "Campo personalizado removido" });
    } catch {
      toast({ title: "Falha ao remover campo", variant: "destructive" });
    }
  }

  if (loading && !data) return <Skeleton className="h-72 w-full" />;

  const configured = !!data?.configured;
  const fields = data?.fields ?? [];
  const custom = data?.custom ?? [];

  // Estado HONESTO: sem dados por falha de leitura, NUNCA mostrar "Faltam 0" como
  // se estivesse desligado (erro != desligado — diretriz do CEO). Mostra o card
  // com a vela vermelha (Indisponível) e um aviso, sem campos nem botão.
  if (!data) {
    return (
      <IntegrationCard
        icon={icon}
        name={provider}
        accent={accent}
        on={false}
        pending={loading}
        error={error}
        labelOn={labelOn}
        labelOff={labelOff}
      >
        <div className="concave-3d flex items-center gap-2 px-3 py-3 text-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-[12px] font-semibold uppercase tracking-wide">
            Não foi possível ler o cofre — confirme o login do colaborador e recarregue.
          </span>
        </div>
      </IntegrationCard>
    );
  }

  return (
    <IntegrationCard
      icon={icon}
      name={data?.label ?? provider}
      accent={accent}
      on={configured}
      pending={loading}
      error={error}
      labelOn={labelOn}
      labelOff={labelOff}
      toggle={
        data?.hasToggle ? (
          <ToggleWell
            label={toggleLabel}
            hint={data.enabled ? "Ligada pelo operador" : "Desligada"}
          >
            <Switch
              checked={data.enabled}
              disabled={togglePending || loading}
              onCheckedChange={handleToggle}
              aria-label={toggleLabel}
            />
          </ToggleWell>
        ) : undefined
      }
    >
      {description ? (
        <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </div>
      ) : null}

      <VaultStatusStrip configured={configured} missingCount={data?.missingCount ?? 0} />

      <div className="concave-3d space-y-3 px-3 py-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/80">
          <KeyRound className="h-3.5 w-3.5" />
          Credenciais (cofre cifrado)
        </div>

        {fields.map((f) =>
          f.kind === "config" ? (
            <ConfigFieldRow
              key={f.field}
              label={f.label}
              value={values[f.field] ?? ""}
              placeholder={undefined}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.field]: v }))}
            />
          ) : (
            <CredentialField
              key={f.field}
              label={f.label}
              isSet={f.isSet}
              masked={f.masked}
              source={f.source}
              secret={f.secret}
              value={values[f.field] ?? ""}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.field]: v }))}
              onReveal={() => revealField(f.field)}
            />
          ),
        )}

        {custom.map((c) => (
          <div key={c.slug} className="space-y-1">
            <CredentialField
              label={c.label}
              isSet={c.isSet}
              masked={c.masked}
              source={c.source}
              secret
              value={customValues[c.slug] ?? ""}
              onChange={(v) => setCustomValues((prev) => ({ ...prev, [c.slug]: v }))}
              onReveal={() => revealCustom(c.slug)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleRemoveCustom(c.slug)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700 transition-colors hover:text-rose-800 dark:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover campo
              </button>
            </div>
          </div>
        ))}

        <div className="flex justify-end">
          <Button type="button" className="btn-3d" disabled={saving} onClick={submit}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar credenciais"}
          </Button>
        </div>
      </div>

      {data?.allowCustom ? (
        <div className="concave-3d space-y-2 px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/80">
            Campo personalizado
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Precisa guardar outra chave que esta plataforma exija? Crie um campo novo
            aqui — ele entra cifrado no cofre, com olho que revela e botão para salvar.
          </p>
          <div className="flex items-center gap-2">
            <Input
              className="field-engraved h-9 flex-1"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nome do campo (ex.: ID da conta, Chave extra)"
            />
            <Button
              type="button"
              className="btn-3d-soft shrink-0"
              disabled={addingCustom}
              onClick={handleAddCustom}
            >
              <Plus className="mr-1 h-4 w-4" />
              {addingCustom ? "Criando..." : "Adicionar campo"}
            </Button>
          </div>
        </div>
      ) : null}
    </IntegrationCard>
  );
}
