import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft, Save, Loader2, Globe, Server, Mail, CreditCard, FileText,
  Building2, Calendar, Shield, AtSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BASE } from "./_shared";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type DominioData = {
  id: number; dominio: string; registrador: string | null; status: string;
  expira_em: string | null; data_registro: string | null; auto_renovar: boolean;
  notas: string | null; titular_nome: string | null; titular_documento: string | null;
  modulo_pago: boolean; valor_mensal_centavos: number | null;
  ns1: string | null; ns2: string | null; ns3: string | null; ns4: string | null;
  dns_provider: string | null; cloudflare_zone_id: string | null;
  zoho_verificado: boolean; zoho_metodo_verificacao: string | null;
  zoho_conta_admin: string | null; zoho_auto_alias: boolean;
};

type FormState = {
  registrador: string; status: string;
  data_registro: string; expira_em: string; auto_renovar: boolean;
  titular_nome: string; titular_documento: string;
  ns1: string; ns2: string; ns3: string; ns4: string;
  dns_provider: string; cloudflare_zone_id: string;
  zoho_verificado: boolean; zoho_metodo_verificacao: string;
  zoho_conta_admin: string; zoho_auto_alias: boolean;
  modulo_pago: boolean; valor_mensal_centavos: string;
  notas: string;
};

const FORM_DEFAULT: FormState = {
  registrador: "manual", status: "ativo",
  data_registro: "", expira_em: "", auto_renovar: true,
  titular_nome: "", titular_documento: "",
  ns1: "", ns2: "", ns3: "", ns4: "",
  dns_provider: "outro", cloudflare_zone_id: "",
  zoho_verificado: false, zoho_metodo_verificacao: "txt",
  zoho_conta_admin: "", zoho_auto_alias: false,
  modulo_pago: false, valor_mensal_centavos: "",
  notas: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes de campo — idênticos ao padrão clientes/edit
// ─────────────────────────────────────────────────────────────────────────────

function FLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground mb-1.5">
      {children}
    </label>
  );
}

function FInput({
  value, onChange, type = "text", placeholder = "", disabled = false, readOnly = false,
}: {
  value: string; onChange?: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean; readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      className="field-engraved w-full h-11 rounded-[6px] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed read-only:opacity-60 read-only:cursor-default"
    />
  );
}

function FSelect({
  value, onChange, options,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="field-engraved w-full h-11 rounded-[6px] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function FToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        className={`bevel-3d h-8 min-w-[90px] px-4 rounded-[6px] text-[10px] font-extrabold uppercase tracking-[0.14em] transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          value
            ? "text-primary ring-1 ring-primary/40"
            : "text-muted-foreground opacity-60"
        }`}
      >
        {value ? "Ativo" : "Inativo"}
      </button>
    </div>
  );
}

function SectionPanel({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="panel-3d-sub p-5 space-y-5 relative overflow-visible">
      <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
        <Icon className="h-3 w-3 text-primary" />
        {label}
      </div>
      <div className="pt-3">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function DominioEditPage() {
  const [, paramsEdit] = useRoute("/comunicacao/dominios/:id/edit");
  const [, paramsNew] = useRoute("/comunicacao/dominios/new");
  const [, setLocation] = useLocation();
  const isNew = paramsNew !== null || paramsEdit?.id === "new";
  const id = isNew ? 0 : parseInt(paramsEdit?.id ?? "0", 10);
  const prefillDominio = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("dominio") ?? ""
    : "";

  const [dominio, setDominio] = useState<DominioData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_DEFAULT);
  const [dominioNome, setDominioNome] = useState(prefillDominio);

  function f<K extends keyof FormState>(field: K) {
    return (v: FormState[K]) => setForm(p => ({ ...p, [field]: v }));
  }

  useEffect(() => {
    if (isNew) {
      setForm(p => ({ ...p, ...(prefillDominio ? {} : {}) }));
      setLoading(false);
      return;
    }
    if (!id) return;
    setLoading(true);
    fetch(`${BASE}/api/dominios/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject("Não encontrado"))
      .then((d: DominioData) => {
        setDominio(d);
        setForm({
          registrador: d.registrador ?? "manual",
          status: d.status ?? "ativo",
          data_registro: d.data_registro?.slice(0, 10) ?? "",
          expira_em: d.expira_em?.slice(0, 10) ?? "",
          auto_renovar: d.auto_renovar ?? true,
          titular_nome: d.titular_nome ?? "",
          titular_documento: d.titular_documento ?? "",
          ns1: d.ns1 ?? "", ns2: d.ns2 ?? "", ns3: d.ns3 ?? "", ns4: d.ns4 ?? "",
          dns_provider: d.dns_provider ?? "outro",
          cloudflare_zone_id: d.cloudflare_zone_id ?? "",
          zoho_verificado: d.zoho_verificado ?? false,
          zoho_metodo_verificacao: d.zoho_metodo_verificacao ?? "txt",
          zoho_conta_admin: d.zoho_conta_admin ?? "",
          zoho_auto_alias: d.zoho_auto_alias ?? false,
          modulo_pago: d.modulo_pago ?? false,
          valor_mensal_centavos: d.valor_mensal_centavos ? String(d.valor_mensal_centavos) : "",
          notas: d.notas ?? "",
        });
      })
      .catch(() => toast.error("Domínio não encontrado"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  async function handleSalvar() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        valor_mensal_centavos: form.valor_mensal_centavos ? parseInt(form.valor_mensal_centavos) : null,
        expira_em: form.expira_em || null,
        data_registro: form.data_registro || null,
        ns3: form.ns3 || null,
        ns4: form.ns4 || null,
        cloudflare_zone_id: form.cloudflare_zone_id || null,
        zoho_conta_admin: form.zoho_conta_admin || null,
        notas: form.notas || null,
      };
      const r = await fetch(
        isNew ? `${BASE}/api/dominios` : `${BASE}/api/dominios/${id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isNew ? { ...payload, dominio: dominioNome } : payload),
        }
      );
      if (r.ok) {
        toast.success("Domínio salvo com sucesso!");
        setLocation("/comunicacao/dominios");
      } else {
        const d = await r.json();
        toast.error(d.error ?? "Erro ao salvar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-64 rounded-lg" />
        <Skeleton className="h-[480px] w-full rounded-xl" />
      </div>
    );
  }

  if (!isNew && !dominio && !loading) {
    return (
      <div className="p-12 text-center font-bold uppercase tracking-widest text-muted-foreground">
        Domínio não encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLocation("/comunicacao/dominios")}
          className="btn-3d-soft rounded-[4px]"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">
            {isNew ? "NOVO DOMÍNIO" : "EDITAR DOMÍNIO"}
          </h1>
          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-1">
            {isNew ? (dominioNome || "Preencha o nome abaixo") : dominio?.dominio}
          </p>
        </div>
      </div>

      <Card className="panel-3d border-none">
        <CardContent className="p-6 space-y-8">

          {/* ── Domínio ──────────────────────────────────────────────────── */}
          <SectionPanel icon={Globe} label="Domínio">
            <div>
              <FLabel>Domínio completo</FLabel>
              {isNew ? (
                <FInput
                  value={dominioNome}
                  onChange={setDominioNome}
                  placeholder="ex.: pawards.com.br"
                />
              ) : (
                <>
                  <FInput value={dominio?.dominio ?? ""} readOnly placeholder="" />
                  <p className="mt-1.5 text-[10px] text-muted-foreground italic">
                    O nome do domínio não pode ser alterado após o cadastro.
                  </p>
                </>
              )}
            </div>
          </SectionPanel>

          {/* ── Identificação ──────────────────────────────────────────────── */}
          <SectionPanel icon={Building2} label="Identificação">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <FLabel>Registrador</FLabel>
                <FSelect value={form.registrador} onChange={f("registrador")} options={[
                  { value: "manual",     label: "Manual (já tenho)" },
                  { value: "registrobr", label: "Registro.br / UOL Host" },
                  { value: "namecheap",  label: "Namecheap" },
                  { value: "godaddy",    label: "GoDaddy" },
                  { value: "cloudflare", label: "Cloudflare" },
                  { value: "locaweb",    label: "Locaweb" },
                ]} />
              </div>
              <div>
                <FLabel>Status</FLabel>
                <FSelect value={form.status} onChange={f("status")} options={[
                  { value: "ativo",     label: "Ativo" },
                  { value: "pendente",  label: "Pendente" },
                  { value: "expirado",  label: "Expirado" },
                  { value: "cancelado", label: "Cancelado" },
                ]} />
              </div>
              <div>
                <FLabel>Data de Registro</FLabel>
                <FInput type="date" value={form.data_registro} onChange={f("data_registro")} />
              </div>
              <div>
                <FLabel>Data de Expiração</FLabel>
                <FInput type="date" value={form.expira_em} onChange={f("expira_em")} />
              </div>
              <div>
                <FLabel>Titular</FLabel>
                <FInput value={form.titular_nome} onChange={f("titular_nome")} placeholder="ex.: PADCOM Ltda" />
              </div>
              <div>
                <FLabel>CPF / CNPJ</FLabel>
                <FInput value={form.titular_documento} onChange={f("titular_documento")} placeholder="ex.: 00.000.000/0001-00" />
              </div>
            </div>
            <div className="border-t border-border/50 mt-4 pt-4">
              <FToggle label="Auto-renovar" value={form.auto_renovar} onChange={f("auto_renovar")} />
            </div>
          </SectionPanel>

          {/* ── DNS ───────────────────────────────────────────────────────────── */}
          <SectionPanel icon={Server} label="Configuração de DNS">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <FLabel>NS1 — Nameserver 1</FLabel>
                <FInput value={form.ns1} onChange={f("ns1")} placeholder="ex.: ivan.ns.cloudflare.com" />
              </div>
              <div>
                <FLabel>NS2 — Nameserver 2</FLabel>
                <FInput value={form.ns2} onChange={f("ns2")} placeholder="ex.: uma.ns.cloudflare.com" />
              </div>
              <div>
                <FLabel>NS3 — Nameserver 3 (opcional)</FLabel>
                <FInput value={form.ns3} onChange={f("ns3")} placeholder="ex.: ns3.exemplo.com" />
              </div>
              <div>
                <FLabel>NS4 — Nameserver 4 (opcional)</FLabel>
                <FInput value={form.ns4} onChange={f("ns4")} placeholder="ex.: ns4.exemplo.com" />
              </div>
            </div>
            <div className="mt-5">
              <FLabel>Provedor DNS</FLabel>
              <FSelect value={form.dns_provider} onChange={f("dns_provider")} options={[
                { value: "cloudflare", label: "Cloudflare (recomendado)" },
                { value: "registrobr", label: "Registro.br DNS" },
                { value: "godaddy",    label: "GoDaddy DNS" },
                { value: "outro",      label: "Outro" },
              ]} />
            </div>
            {form.dns_provider === "cloudflare" && (
              <div className="mt-5">
                <FLabel>Cloudflare Zone ID</FLabel>
                <FInput
                  value={form.cloudflare_zone_id}
                  onChange={f("cloudflare_zone_id")}
                  placeholder="ex.: a1b2c3d4e5f6a7b8c9d0e1f2"
                />
              </div>
            )}
          </SectionPanel>

          {/* ── E-mail Zoho ───────────────────────────────────────────────────── */}
          <SectionPanel icon={Mail} label="E-mail Zoho">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <FLabel>Conta admin Zoho</FLabel>
                <FInput
                  type="email"
                  value={form.zoho_conta_admin}
                  onChange={f("zoho_conta_admin")}
                  placeholder={`ex.: admin@${(dominio?.dominio ?? dominioNome) || "seudominio.com.br"}`}
                />
              </div>
              <div>
                <FLabel>Método de verificação</FLabel>
                <FSelect value={form.zoho_metodo_verificacao} onChange={f("zoho_metodo_verificacao")} options={[
                  { value: "txt",   label: "Registro TXT (recomendado)" },
                  { value: "cname", label: "Registro CNAME" },
                  { value: "html",  label: "Arquivo HTML" },
                ]} />
              </div>
            </div>
            <div className="border-t border-border/50 mt-4 pt-2 space-y-1">
              <FToggle label="Domínio já verificado no Zoho?" value={form.zoho_verificado} onChange={f("zoho_verificado")} />
              <FToggle label="Criar aliases automaticamente via Zoho?" value={form.zoho_auto_alias} onChange={f("zoho_auto_alias")} />
            </div>
          </SectionPanel>

          {/* ── Módulo Pago ───────────────────────────────────────────────────── */}
          <SectionPanel icon={CreditCard} label="Módulo Pago — Clínicas Parceiras">
            <FToggle label="Ativar módulo pago para clínicas licenciadas?" value={form.modulo_pago} onChange={f("modulo_pago")} />
            {form.modulo_pago && (
              <div className="mt-4">
                <FLabel>Valor mensal (em centavos — ex.: 19900 = R$ 199,00)</FLabel>
                <FInput
                  type="number"
                  value={form.valor_mensal_centavos}
                  onChange={f("valor_mensal_centavos")}
                  placeholder="ex.: 19900"
                />
              </div>
            )}
          </SectionPanel>

          {/* ── Notas ─────────────────────────────────────────────────────────── */}
          <SectionPanel icon={FileText} label="Notas">
            <div>
              <FLabel>Observações internas</FLabel>
              <textarea
                value={form.notas}
                onChange={e => f("notas")(e.target.value)}
                placeholder="Anotações sobre este domínio, histórico, contatos do registrador..."
                rows={4}
                className="field-engraved w-full rounded-[6px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none min-h-[100px]"
              />
            </div>
          </SectionPanel>

          {/* ── Botões ────────────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-4 pt-2">
            <Button
              type="button"
              className="btn-3d-soft"
              onClick={() => setLocation("/comunicacao/dominios")}
            >
              CANCELAR
            </Button>
            <Button
              type="button"
              className="btn-3d px-8"
              disabled={saving}
              onClick={handleSalvar}
            >
              {saving
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Save className="w-4 h-4 mr-2" />
              }
              SALVAR ALTERAÇÕES
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
