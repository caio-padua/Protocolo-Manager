import { useEffect, useState } from "react";
import {
  useGetCompanySettings,
  useUpdateCompanySettings,
  useGetClinicsSettings,
  useUpdateClinicsSettings,
  type CompanySettings,
  type ClinicConfig,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save, Plus, Trash2, MapPin, Hospital } from "lucide-react";
import { SettingsPanel, FieldRow } from "@/components/settings/SettingsUI";

type CompanyDraft = Required<{ [K in keyof CompanySettings]: string }>;

const EMPTY_COMPANY: CompanyDraft = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  email: "",
  phone: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  responsavelTecnico: "",
  conselhoRT: "",
  logoUrl: "",
};

function toDraft(s: CompanySettings | undefined): CompanyDraft {
  if (!s) return { ...EMPTY_COMPANY };
  const out = { ...EMPTY_COMPANY };
  (Object.keys(EMPTY_COMPANY) as (keyof CompanyDraft)[]).forEach((k) => {
    out[k] = (s[k] ?? "") as string;
  });
  return out;
}

function newClinicId(): string {
  return `cl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export default function ConfigEmpresa() {
  const { toast } = useToast();
  const company = useGetCompanySettings();
  const clinics = useGetClinicsSettings();

  const [draft, setDraft] = useState<CompanyDraft>(EMPTY_COMPANY);
  const [clinicList, setClinicList] = useState<ClinicConfig[]>([]);

  useEffect(() => {
    if (company.data) setDraft(toDraft(company.data));
  }, [company.data]);
  useEffect(() => {
    if (clinics.data) setClinicList(clinics.data.clinics ?? []);
  }, [clinics.data]);

  const saveCompany = useUpdateCompanySettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Dados da empresa salvos" });
        company.refetch();
      },
      onError: () => toast({ title: "Erro ao salvar empresa", variant: "destructive" }),
    },
  });
  const saveClinics = useUpdateClinicsSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Clinicas salvas" });
        clinics.refetch();
      },
      onError: () => toast({ title: "Erro ao salvar clinicas", variant: "destructive" }),
    },
  });

  function setField<K extends keyof CompanyDraft>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  function setClinic(id: string, patch: Partial<ClinicConfig>) {
    setClinicList((arr) => arr.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function addClinic() {
    setClinicList((arr) => [...arr, { id: newClinicId(), name: "", cnpj: "", phone: "", endereco: "", active: true }]);
  }
  function removeClinic(id: string) {
    setClinicList((arr) => arr.filter((c) => c.id !== id));
  }

  function persistCompany() {
    const payload: CompanySettings = {};
    (Object.keys(draft) as (keyof CompanyDraft)[]).forEach((k) => {
      payload[k] = draft[k].trim() === "" ? null : draft[k].trim();
    });
    saveCompany.mutate({ data: payload });
  }
  function persistClinics() {
    const cleaned = clinicList
      .map((c) => ({ ...c, name: c.name.trim() }))
      .filter((c) => c.name !== "");
    saveClinics.mutate({ data: { clinics: cleaned } });
  }

  const loading = company.isLoading || clinics.isLoading;

  const fieldCls = "field-engraved";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Empresa & Clinicas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dados institucionais usados em documentos, e-mails e cabecalhos. Tudo editavel — nada cravado no codigo.
        </p>
      </header>

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <SettingsPanel icon={Building2} title="Dados da Empresa">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldRow label="Razao Social">
                <Input className={fieldCls} value={draft.razaoSocial} onChange={(e) => setField("razaoSocial", e.target.value)} />
              </FieldRow>
              <FieldRow label="Nome Fantasia">
                <Input className={fieldCls} value={draft.nomeFantasia} onChange={(e) => setField("nomeFantasia", e.target.value)} />
              </FieldRow>
              <FieldRow label="CNPJ">
                <Input className={fieldCls} value={draft.cnpj} onChange={(e) => setField("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </FieldRow>
              <FieldRow label="E-mail">
                <Input className={fieldCls} type="email" value={draft.email} onChange={(e) => setField("email", e.target.value)} />
              </FieldRow>
              <FieldRow label="Telefone">
                <Input className={fieldCls} value={draft.phone} onChange={(e) => setField("phone", e.target.value)} />
              </FieldRow>
              <FieldRow label="Responsavel Tecnico">
                <Input className={fieldCls} value={draft.responsavelTecnico} onChange={(e) => setField("responsavelTecnico", e.target.value)} />
              </FieldRow>
              <FieldRow label="Conselho do RT (CRM/COREN)">
                <Input className={fieldCls} value={draft.conselhoRT} onChange={(e) => setField("conselhoRT", e.target.value)} />
              </FieldRow>
              <FieldRow label="Logo (URL)">
                <Input className={fieldCls} value={draft.logoUrl} onChange={(e) => setField("logoUrl", e.target.value)} />
              </FieldRow>
            </div>

            <div className="mt-5 panel-3d-sub p-4">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Endereco</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FieldRow label="CEP">
                  <Input className={fieldCls} value={draft.cep} onChange={(e) => setField("cep", e.target.value)} />
                </FieldRow>
                <FieldRow label="Logradouro">
                  <Input className={fieldCls} value={draft.logradouro} onChange={(e) => setField("logradouro", e.target.value)} />
                </FieldRow>
                <FieldRow label="Numero">
                  <Input className={fieldCls} value={draft.numero} onChange={(e) => setField("numero", e.target.value)} />
                </FieldRow>
                <FieldRow label="Complemento">
                  <Input className={fieldCls} value={draft.complemento} onChange={(e) => setField("complemento", e.target.value)} />
                </FieldRow>
                <FieldRow label="Bairro">
                  <Input className={fieldCls} value={draft.bairro} onChange={(e) => setField("bairro", e.target.value)} />
                </FieldRow>
                <FieldRow label="Cidade">
                  <Input className={fieldCls} value={draft.cidade} onChange={(e) => setField("cidade", e.target.value)} />
                </FieldRow>
                <FieldRow label="Estado (UF)">
                  <Input className={fieldCls} value={draft.estado} onChange={(e) => setField("estado", e.target.value)} maxLength={2} />
                </FieldRow>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button className="btn-3d" onClick={persistCompany} disabled={saveCompany.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {saveCompany.isPending ? "Salvando..." : "Salvar Empresa"}
              </Button>
            </div>
          </SettingsPanel>

          <SettingsPanel icon={Hospital} title="Clinicas / Unidades" color="cyan">
            <div className="space-y-4">
              {clinicList.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma clinica cadastrada. Adicione a primeira unidade.</p>
              )}
              {clinicList.map((c) => (
                <div key={c.id} className="panel-3d-sub p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FieldRow label="Nome da Unidade">
                      <Input className={fieldCls} value={c.name} onChange={(e) => setClinic(c.id, { name: e.target.value })} />
                    </FieldRow>
                    <FieldRow label="CNPJ">
                      <Input className={fieldCls} value={c.cnpj ?? ""} onChange={(e) => setClinic(c.id, { cnpj: e.target.value })} />
                    </FieldRow>
                    <FieldRow label="Telefone">
                      <Input className={fieldCls} value={c.phone ?? ""} onChange={(e) => setClinic(c.id, { phone: e.target.value })} />
                    </FieldRow>
                    <FieldRow label="Endereco">
                      <Input className={fieldCls} value={c.endereco ?? ""} onChange={(e) => setClinic(c.id, { endereco: e.target.value })} />
                    </FieldRow>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="concave-3d inline-flex items-center gap-3 px-3 py-2">
                      <Switch checked={c.active ?? true} onCheckedChange={(v) => setClinic(c.id, { active: v })} />
                      <span className="text-[12px] font-medium uppercase tracking-wide">{c.active ?? true ? "Ativa" : "Inativa"}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => removeClinic(c.id)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Button variant="outline" className="btn-3d-soft" onClick={addClinic}>
                <Plus className="w-4 h-4 mr-2" /> Adicionar Clinica
              </Button>
              <Button className="btn-3d" onClick={persistClinics} disabled={saveClinics.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {saveClinics.isPending ? "Salvando..." : "Salvar Clinicas"}
              </Button>
            </div>
          </SettingsPanel>
        </>
      )}
    </div>
  );
}
