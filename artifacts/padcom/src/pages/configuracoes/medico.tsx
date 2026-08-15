// CONFIGURAÇÃO DO MÉDICO RESPONSÁVEL — /configuracoes/medico
// Permite que o CEO edite nome, CRM e especialidade do médico com
// isPrimaryDoctor=true diretamente no painel, sem acesso ao banco.

import { useEffect, useState } from "react";
import { Stethoscope, Save, AlertCircle, ShieldOff, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SettingsPanel, FieldRow } from "@/components/settings/SettingsUI";
import { getCollabToken } from "@/lib/collab-auth";
import { usePermissoes } from "@/lib/permissoes";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PrimaryDoctor {
  id: number;
  name: string;
  crm: string | null;
  specialty: string | null;
  isPrimaryDoctor: boolean;
}

interface Draft {
  name: string;
  crm: string;
  specialty: string;
}

const EMPTY: Draft = { name: "", crm: "", specialty: "" };

function authHeaders(): Record<string, string> {
  const token = getCollabToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ConfigMedico() {
  const { toast } = useToast();
  const { isCeo, loading: permLoading } = usePermissoes();

  const [doctor, setDoctor] = useState<PrimaryDoctor | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Busca o médico principal ao montar (só depois de saber a permissão)
  useEffect(() => {
    if (permLoading) return;
    if (!isCeo) { setLoading(false); return; }

    setLoading(true);
    setFetchError(false);
    fetch(`${BASE}/api/professionals`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) throw new Error("resposta inválida");
        const primary = (data as PrimaryDoctor[]).find((p) => p.isPrimaryDoctor);
        if (primary) {
          setDoctor(primary);
          setDraft({
            name: primary.name ?? "",
            crm: primary.crm ?? "",
            specialty: primary.specialty ?? "",
          });
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, [permLoading, isCeo, retryCount]);

  function setField(k: keyof Draft, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function save() {
    if (!doctor) return;
    if (!draft.name.trim()) {
      toast({ title: "O nome não pode ficar vazio", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/professionals/primary-doctor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: draft.name.trim(),
          crm: draft.crm.trim() || null,
          specialty: draft.specialty.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "erro desconhecido");
      }
      const updated: PrimaryDoctor = await res.json();
      setDoctor(updated);
      setDraft({
        name: updated.name ?? "",
        crm: updated.crm ?? "",
        specialty: updated.specialty ?? "",
      });
      toast({ title: "Médico responsável atualizado" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const fieldCls = "field-engraved";

  // Aguarda resolução de permissão antes de renderizar conteúdo sensível
  if (permLoading) {
    return <Skeleton className="h-64 w-full max-w-2xl mx-auto" />;
  }

  // Acesso restrito ao CEO
  if (!isCeo) {
    return (
      <div className="max-w-2xl mx-auto panel-3d p-6 flex items-start gap-3 text-red-600">
        <ShieldOff className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Acesso restrito</p>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas o médico principal (CEO) pode alterar os dados do médico responsável pelos documentos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Médico Responsável pelos Documentos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Nome e CRM que aparecem nos PDFs emitidos (planos nutricionais, receituários, etc.).
          Qualquer alteração aqui reflete no próximo documento gerado.
        </p>
      </header>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : fetchError ? (
        <div className="panel-3d p-6 flex items-start gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Não foi possível carregar o médico responsável</p>
            <p className="text-sm text-muted-foreground mt-1">
              Verifique sua conexão e tente novamente.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-2"
              onClick={() => setRetryCount((c) => c + 1)}
            >
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : notFound ? (
        <div className="panel-3d p-6 flex items-start gap-3 text-amber-600">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Nenhum médico principal cadastrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Acesse <strong>Corpo Clínico</strong>, abra o perfil do médico responsável e ative
              o campo <em>Médico Principal (isPrimaryDoctor)</em>.
            </p>
          </div>
        </div>
      ) : (
        <SettingsPanel icon={Stethoscope} title="Médico Responsável">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Nome completo">
              <Input
                className={fieldCls}
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Dr. Caio Pádua"
              />
            </FieldRow>

            <FieldRow label="CRM">
              <Input
                className={fieldCls}
                value={draft.crm}
                onChange={(e) => setField("crm", e.target.value)}
                placeholder="CRM/SP 123456"
              />
            </FieldRow>

            <FieldRow label="Especialidade" hint="Exibida abaixo do CRM nos documentos">
              <Input
                className={fieldCls}
                value={draft.specialty}
                onChange={(e) => setField("specialty", e.target.value)}
                placeholder="Nutrologia"
              />
            </FieldRow>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              className="btn-3d gap-2"
              onClick={save}
              disabled={saving}
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </SettingsPanel>
      )}
    </div>
  );
}
