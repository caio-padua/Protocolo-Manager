import {
  useListProfessionals,
  useCreateProfessional,
  useUpdateProfessional,
  useListProfessionalAreas,
  useListProfessionalSpecialties,
} from "@workspace/api-client-react";
import type { Professional } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  User,
  Plus,
  Phone,
  Mail,
  Stethoscope,
  Building2,
  Pencil,
  BadgeCheck,
  ShieldCheck,
  HeartPulse,
  PenLine,
  UploadCloud,
  Camera,
  Link2,
  FileText,
  MapPin,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Foto de Perfil (circular) ───────────────────────────────────────────────
function PhotoUpload({
  professionalId,
  currentUrl,
  onUploaded,
}: {
  professionalId: number;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function handleFile(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast({ title: "Use PNG ou JPEG", variant: "destructive" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Imagem acima de 4 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const t = getCollabToken();
      const r = await fetch(`${BASE}/api/professionals/${professionalId}/photo`, {
        method: "POST",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      if (!r.ok) throw new Error("upload");
      const d = (await r.json()) as { photoUrl?: string };
      const url = d.photoUrl ?? null;
      setPreview(url);
      if (url) onUploaded(url);
      toast({ title: "Foto enviada com sucesso" });
    } catch {
      toast({ title: "Falha ao enviar a foto", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div
        className="relative group cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img
            src={`${BASE}${preview}`}
            alt="Foto"
            className="w-28 h-28 rounded-full object-cover ring-4 ring-primary/20 shadow-lg"
          />
        ) : (
          <div className="w-28 h-28 rounded-full bg-[hsl(220,40%,13%)] ring-4 ring-primary/20 shadow-lg flex items-center justify-center">
            <User className="h-10 w-10 text-primary/40" />
          </div>
        )}
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera className="h-6 w-6 text-white" />
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <Button
        type="button"
        className="btn-3d-soft text-[10px]"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
        {uploading ? "Enviando..." : preview ? "Trocar Foto" : "Enviar Foto"}
      </Button>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        PNG ou JPEG · Máx. 4 MB
      </p>
    </div>
  );
}

// ─── Assinatura / Rubrica ─────────────────────────────────────────────────────
function SignatureUpload({
  professionalId,
  currentUrl,
  onUploaded,
}: {
  professionalId: number;
  currentUrl: string | null;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function handleFile(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast({ title: "Use PNG ou JPEG", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem acima de 2 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const t = getCollabToken();
      const r = await fetch(`${BASE}/api/professionals/${professionalId}/signature`, {
        method: "POST",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      if (!r.ok) throw new Error("upload");
      const d = (await r.json()) as { signatureUrl?: string };
      setPreview(d.signatureUrl ?? null);
      toast({ title: "Assinatura enviada" });
      onUploaded();
    } catch {
      toast({ title: "Falha ao enviar a assinatura", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <PenLine className="h-3 w-3" /> Assinatura / Rubrica
      </Label>
      <div className="concave-3d flex items-center gap-4 px-4 py-4">
        <div className="bevel-3d flex h-16 w-36 flex-shrink-0 items-center justify-center overflow-hidden bg-white">
          {preview ? (
            <img src={`${BASE}${preview}`} alt="Assinatura" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Sem assinatura</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button type="button" className="btn-3d-soft text-[10px]" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
            {uploading ? "Enviando..." : preview ? "Trocar Assinatura" : "Enviar Assinatura"}
          </Button>
          <p className="text-[10px] font-semibold text-muted-foreground">Fundo branco · PNG ou JPEG · Máx. 2 MB</p>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Vínculos (clínicas) ────────────────────────────────────────────
type LinkRow = { id: number; locationId: number; role: string; agendaCalendarId: number | null };

function VinculosPanel({ professionalId }: { professionalId: number }) {
  const { toast } = useToast();
  const [locations, setLocations] = useState<Array<{ id: number; name: string; type: string; address: string | null }>>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);

  const fetchLinks = useCallback(async () => {
    const [locRes, lnkRes] = await Promise.all([
      fetch(`${BASE}/api/locations`),
      fetch(`${BASE}/api/professionals/${professionalId}/links`),
    ]);
    const [locs, lnks] = await Promise.all([locRes.json(), lnkRes.json()]);
    setLocations(locs ?? []);
    setLinks(lnks ?? []);
    setLoading(false);
  }, [professionalId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const isLinked = (locationId: number) => links.some((l) => l.locationId === locationId);

  async function toggle(locationId: number) {
    setToggling(locationId);
    try {
      const linked = isLinked(locationId);
      const t = getCollabToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (t) headers.Authorization = `Bearer ${t}`;
      if (linked) {
        await fetch(`${BASE}/api/professionals/${professionalId}/links/${locationId}`, {
          method: "DELETE", headers,
        });
        setLinks((prev) => prev.filter((l) => l.locationId !== locationId));
        toast({ title: "Vínculo removido" });
      } else {
        const r = await fetch(`${BASE}/api/professionals/${professionalId}/links/${locationId}`, {
          method: "POST", headers, body: JSON.stringify({ role: "executor" }),
        });
        if (!r.ok) throw new Error("link");
        const row = await r.json() as LinkRow;
        setLinks((prev) => [...prev, row]);
        toast({ title: "Vínculo adicionado" });
      }
    } catch {
      toast({ title: "Falha ao alterar vínculo", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 py-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg panel-3d-sub" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Selecione as unidades onde este profissional atua. O vínculo é salvo imediatamente ao tocar no switch.
      </p>
      {locations.map((loc) => {
        const linked = isLinked(loc.id);
        const busy = toggling === loc.id;
        return (
          <div
            key={loc.id}
            className={`flex items-center gap-4 px-4 py-3 transition-all ${linked ? "bevel-3d" : "concave-3d"}`}
          >
            <div className="flex-shrink-0">
              {linked ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm uppercase tracking-wide leading-tight text-foreground">{loc.name}</p>
              <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-2.5 w-2.5" />
                {loc.address ?? loc.type}
              </p>
            </div>
            <Switch
              checked={linked}
              disabled={busy}
              onCheckedChange={() => toggle(loc.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Constantes ───────────────────────────────────────────────────────────────
type ProfType = "medico" | "nao_medico";

const CATEGORY_OPTIONS = [
  { value: "medico", label: "Médico(a)" },
  { value: "enfermagem", label: "Enfermagem" },
  { value: "recepcao", label: "Recepção" },
  { value: "administrativo", label: "Administrativo" },
  { value: "financeiro", label: "Financeiro" },
  { value: "outro", label: "Outro" },
];

const SERVICE_OPTIONS = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online" },
];

const EMPTY_FORM = {
  name: "",
  professionalType: "medico" as ProfType,
  category: "medico" as string,
  role: "",
  areaId: "" as string,
  specialtyId: "" as string,
  registrationCouncil: "",
  registrationNumber: "",
  phone: "",
  email: "",
  unit: "",
  serviceTypes: ["presencial"] as string[],
  active: true,
  nurseType: "" as string,
  cpf: "",
  cnpj: "",
  homeServiceFeePerVisit: "" as string,
  contractType: "" as string,
};

type FormState = typeof EMPTY_FORM;

// ─── Utilitário: iniciais do nome ─────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Professionals() {
  const { data: professionals, isLoading, refetch } = useListProfessionals();
  const { data: areas } = useListProfessionalAreas();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSignatureUrl, setEditingSignatureUrl] = useState<string | null>(null);
  const [editingPhotoUrl, setEditingPhotoUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("dados");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const areasForType = useMemo(
    () => (areas ?? []).filter((a) => a.professionalType === form.professionalType),
    [areas, form.professionalType],
  );

  const { data: allSpecialties } = useListProfessionalSpecialties();
  const areaIdNum = form.areaId ? Number(form.areaId) : undefined;
  const specialties = useMemo(
    () => (allSpecialties ?? []).filter((s) => s.areaId === areaIdNum),
    [allSpecialties, areaIdNum],
  );

  useEffect(() => {
    if (!open) return;
    if (form.areaId && !areasForType.some((a) => String(a.id) === form.areaId)) {
      setForm((f) => ({ ...f, areaId: "", specialtyId: "" }));
    }
  }, [open, form.professionalType, areasForType, form.areaId]);

  const createMutation = useCreateProfessional({
    mutation: {
      onSuccess: () => {
        toast({ title: "Profissional cadastrado!" });
        closeDialog();
        refetch();
      },
      onError: () => toast({ title: "Erro ao cadastrar", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateProfessional({
    mutation: {
      onSuccess: () => {
        toast({ title: "Alterações salvas!" });
        closeDialog();
        refetch();
      },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setEditingSignatureUrl(null);
    setEditingPhotoUrl(null);
    setActiveTab("dados");
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingId(null);
    setActiveTab("dados");
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (pro: Professional) => {
    setEditingId(pro.id);
    setActiveTab("dados");
    const p = pro as Professional & {
      nurseType?: string | null;
      cpf?: string | null;
      cnpj?: string | null;
      homeServiceFeePerVisit?: number | null;
      contractType?: string | null;
      signatureUrl?: string | null;
      photoUrl?: string | null;
    };
    setEditingSignatureUrl(p.signatureUrl ?? null);
    setEditingPhotoUrl(p.photoUrl ?? null);
    setForm({
      name: pro.name ?? "",
      professionalType: (pro.professionalType as ProfType) || "medico",
      category: (pro as Professional & { category?: string | null }).category ?? "medico",
      role: (pro as Professional & { role?: string | null }).role ?? "",
      areaId: pro.areaId ? String(pro.areaId) : "",
      specialtyId: pro.specialtyId ? String(pro.specialtyId) : "",
      registrationCouncil: pro.registrationCouncil ?? "",
      registrationNumber: pro.registrationNumber ?? "",
      phone: pro.phone ?? "",
      email: pro.email ?? "",
      unit: pro.unit ?? "",
      serviceTypes: pro.serviceTypes?.length ? pro.serviceTypes : ["presencial"],
      active: pro.active ?? true,
      nurseType: p.nurseType ?? "",
      cpf: p.cpf ?? "",
      cnpj: p.cnpj ?? "",
      homeServiceFeePerVisit: p.homeServiceFeePerVisit != null ? String(p.homeServiceFeePerVisit) : "",
      contractType: p.contractType ?? "",
    });
    setOpen(true);
  };

  const toggleService = (value: string) => {
    setForm((f) => {
      const has = f.serviceTypes.includes(value);
      const next = has ? f.serviceTypes.filter((s) => s !== value) : [...f.serviceTypes, value];
      return { ...f, serviceTypes: next.length ? next : f.serviceTypes };
    });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (!form.areaId) {
      toast({ title: "Área é obrigatória", variant: "destructive" });
      return;
    }
    if (!form.specialtyId) {
      toast({ title: form.professionalType === "medico" ? "Especialidade é obrigatória" : "Especialização é obrigatória", variant: "destructive" });
      return;
    }

    const isNurse = form.category === "enfermagem";
    const body = {
      name: form.name.trim(),
      professionalType: form.professionalType,
      category: form.category,
      role: form.role.trim() || null,
      areaId: Number(form.areaId),
      specialtyId: Number(form.specialtyId),
      registrationCouncil: form.registrationCouncil.trim() || null,
      registrationNumber: form.registrationNumber.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      unit: form.unit.trim() || null,
      serviceTypes: form.serviceTypes,
      active: form.active,
      ...(isNurse ? {
        nurseType: form.nurseType || null,
        cpf: form.cpf.trim() || null,
        cnpj: form.cnpj.trim() || null,
        homeServiceFeePerVisit: form.homeServiceFeePerVisit ? Number(form.homeServiceFeePerVisit) : null,
        contractType: form.contractType || null,
      } : {
        nurseType: null, cpf: null, cnpj: null,
        homeServiceFeePerVisit: null, contractType: null,
      }),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: body });
    } else {
      createMutation.mutate({ data: body });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const councilPlaceholder = form.professionalType === "medico" ? "CRM" : "COREN / CRP / CRN";

  // Agrupamento por categoria para exibição
  const grouped = useMemo(() => {
    if (!professionals) return [];
    const order = ["medico", "enfermagem", "recepcao", "administrativo", "financeiro", "outro"];
    const map = new Map<string, typeof professionals>();
    for (const p of professionals) {
      const cat = (p as typeof p & { category?: string }).category ?? "outro";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return order.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [professionals]);

  const catLabel = (c: string) => CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ─── Cabeçalho ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: "'Playfair Display', 'Georgia', serif" }}
          >
            Corpo Clínico
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mt-1">
            Profissionais · Vínculos · Agendas
          </p>
        </div>

        {/* ─── Dialog de Cadastro / Edição ─── */}
        <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button className="btn-3d" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Profissional
            </Button>
          </DialogTrigger>

          <DialogContent className="panel-3d max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogHeader className="pb-2 border-b border-border/30">
              <DialogTitle
                className="text-base font-bold tracking-wide text-foreground"
                style={{ fontFamily: "'Playfair Display', 'Georgia', serif" }}
              >
                {editingId ? "Editar Profissional" : "Cadastrar Profissional"}
              </DialogTitle>
              {editingId && (
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {form.name}
                </p>
              )}
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
              <TabsList className="w-full justify-start border-none rounded-none h-auto p-0 bg-transparent flex gap-2 mb-4">
                <TabsTrigger
                  value="dados"
                  className="bevel-3d rounded-none data-[state=active]:panel-3d-active data-[state=active]:text-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest shadow-none flex items-center gap-1.5"
                >
                  <User className="h-3 w-3" /> Dados
                </TabsTrigger>
                <TabsTrigger
                  value="vinculos"
                  className="bevel-3d rounded-none data-[state=active]:panel-3d-active data-[state=active]:text-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest shadow-none flex items-center gap-1.5"
                  disabled={!editingId}
                >
                  <Link2 className="h-3 w-3" /> Vínculos
                </TabsTrigger>
                <TabsTrigger
                  value="documentos"
                  className="bevel-3d rounded-none data-[state=active]:panel-3d-active data-[state=active]:text-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest shadow-none flex items-center gap-1.5"
                  disabled={!editingId}
                >
                  <FileText className="h-3 w-3" /> Documentos
                </TabsTrigger>
              </TabsList>

              {/* ── Aba: Dados ── */}
              <TabsContent value="dados" className="space-y-5 focus:outline-none">

                {/* Identidade */}
                <div className="space-y-1 mb-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 flex items-center gap-1.5">
                    <span className="inline-block w-4 h-px bg-primary/30" /> Identidade
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome Completo *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Nome completo do profissional"
                    className="field-engraved text-base"
                    style={{ fontFamily: "'Playfair Display', 'Georgia', serif" }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoria funcional</Label>
                    <Select value={form.category} onValueChange={(v) => v && set("category", v)}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cargo / Título</Label>
                    <Input
                      value={form.role}
                      onChange={(e) => set("role", e.target.value)}
                      placeholder="Ex.: Recepcionista, Gerente"
                      className="field-engraved"
                    />
                  </div>
                </div>

                {/* Tipo profissional */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["medico", "nao_medico"] as ProfType[]).map((t) => {
                      const active = form.professionalType === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, professionalType: t, areaId: "", specialtyId: "" }))}
                          className={`${active ? "bevel-3d text-primary" : "concave-3d text-muted-foreground"} flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all`}
                        >
                          {t === "medico" ? <Stethoscope className="h-3.5 w-3.5" /> : <HeartPulse className="h-3.5 w-3.5" />}
                          {t === "medico" ? "Médico(a)" : "Não-médico"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Registro profissional */}
                <div className="space-y-1 pt-2 mb-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 flex items-center gap-1.5">
                    <span className="inline-block w-4 h-px bg-primary/30" /> Registro Profissional
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Área *</Label>
                    <Select value={form.areaId} onValueChange={(v) => setForm((f) => ({ ...f, areaId: v, specialtyId: "" }))}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {areasForType.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {form.professionalType === "medico" ? "Especialidade *" : "Especialização *"}
                    </Label>
                    <Select value={form.specialtyId} onValueChange={(v) => set("specialtyId", v)} disabled={!form.areaId}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder={form.areaId ? "Selecione" : "Escolha a área"} /></SelectTrigger>
                      <SelectContent>
                        {(specialties ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Conselho</Label>
                    <Input
                      value={form.registrationCouncil}
                      onChange={(e) => set("registrationCouncil", e.target.value)}
                      placeholder={councilPlaceholder}
                      className="field-engraved"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Número de registro</Label>
                    <Input
                      value={form.registrationNumber}
                      onChange={(e) => set("registrationNumber", e.target.value)}
                      placeholder="SP 123456"
                      className="field-engraved"
                    />
                  </div>
                </div>

                {/* Contato */}
                <div className="space-y-1 pt-2 mb-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 flex items-center gap-1.5">
                    <span className="inline-block w-4 h-px bg-primary/30" /> Contato
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Telefone / WhatsApp</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="field-engraved"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail profissional</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="nome@clinica.com.br"
                      className="field-engraved"
                    />
                  </div>
                </div>

                {/* Localização */}
                <div className="space-y-1 pt-2 mb-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 flex items-center gap-1.5">
                    <span className="inline-block w-4 h-px bg-primary/30" /> Localização &amp; Atendimento
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidade principal</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => set("unit", e.target.value)}
                    placeholder="Clínica Principal"
                    className="field-engraved"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipos de atendimento</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {SERVICE_OPTIONS.map((opt) => (
                      <div key={opt.value} className="concave-3d flex items-center gap-3 px-3 py-2.5">
                        <Switch checked={form.serviceTypes.includes(opt.value)} onCheckedChange={() => toggleService(opt.value)} />
                        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dados de Enfermagem */}
                {form.category === "enfermagem" && (
                  <>
                    <div className="space-y-1 pt-2 mb-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-accent/70 flex items-center gap-1.5">
                        <span className="inline-block w-4 h-px bg-accent/30" /> Dados de Enfermagem
                      </p>
                    </div>

                    <div className="space-y-4 p-4 bevel-3d" style={{ borderLeft: "3px solid hsl(187 72% 44%)" }}>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Regime de atuação</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: "fisica", label: "Física (fixa na clínica)" },
                            { value: "home", label: "Home / Itinerante" },
                          ] as const).map((opt) => {
                            const active = form.nurseType === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => set("nurseType", opt.value)}
                                className={`${active ? "bevel-3d text-primary" : "concave-3d text-muted-foreground"} px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all text-left`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CPF (contratos / NF)</Label>
                        <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" className="field-engraved" />
                      </div>

                      {form.nurseType === "home" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CNPJ MEI (opcional)</Label>
                            <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0001-00" className="field-engraved" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Taxa por visita (R$)</Label>
                            <Input type="number" min="0" step="0.01" value={form.homeServiceFeePerVisit} onChange={(e) => set("homeServiceFeePerVisit", e.target.value)} placeholder="250,00" className="field-engraved" />
                          </div>
                        </div>
                      )}

                      {(form.nurseType === "home" || form.nurseType === "fisica") && (
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo de contrato</Label>
                          <div className="grid grid-cols-3 gap-2">
                            {([{ value: "clt", label: "CLT" }, { value: "pj", label: "PJ" }, { value: "mei", label: "MEI" }] as const).map((opt) => {
                              const active = form.contractType === opt.value;
                              return (
                                <button key={opt.value} type="button" onClick={() => set("contractType", opt.value)}
                                  className={`${active ? "bevel-3d text-primary" : "concave-3d text-muted-foreground"} px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all`}>
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Status */}
                <div className="concave-3d flex items-center gap-3 px-4 py-3">
                  <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                      {form.active ? "Profissional Ativo" : "Profissional Inativo"}
                    </Label>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {form.active ? "Disponível para protocolos e agenda" : "Não aparece na agenda"}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button className="btn-3d-soft" onClick={closeDialog}>Cancelar</Button>
                  <Button className="btn-3d" onClick={handleSubmit} disabled={isPending}>
                    {isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Cadastrar"}
                  </Button>
                </div>

                {!editingId && (
                  <p className="text-[10px] text-muted-foreground font-medium text-center">
                    Após salvar, as abas <strong>Vínculos</strong> e <strong>Documentos</strong> serão liberadas.
                  </p>
                )}
              </TabsContent>

              {/* ── Aba: Vínculos ── */}
              <TabsContent value="vinculos" className="focus:outline-none">
                {editingId ? (
                  <VinculosPanel professionalId={editingId} />
                ) : (
                  <div className="concave-3d px-4 py-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Salve o profissional primeiro para gerenciar os vínculos.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ── Aba: Documentos ── */}
              <TabsContent value="documentos" className="space-y-6 focus:outline-none">
                {editingId ? (
                  <>
                    {/* Foto de perfil */}
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Camera className="h-3 w-3" /> Foto de Perfil
                      </Label>
                      <div className="bevel-3d px-4 py-2">
                        <PhotoUpload
                          professionalId={editingId}
                          currentUrl={editingPhotoUrl}
                          onUploaded={(url) => { setEditingPhotoUrl(url); refetch(); }}
                        />
                      </div>
                    </div>

                    {/* Assinatura */}
                    <SignatureUpload
                      professionalId={editingId}
                      currentUrl={editingSignatureUrl}
                      onUploaded={() => refetch()}
                    />
                  </>
                ) : (
                  <div className="concave-3d px-4 py-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Salve o profissional primeiro para enviar documentos.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* ─── Grid de profissionais agrupados por categoria ─── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 panel-3d-sub" />)}
        </div>
      ) : !professionals?.length ? (
        <Card className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="concave-3d p-6">
              <User className="h-10 w-10 text-muted-foreground opacity-30" />
            </div>
            <p className="text-base font-black uppercase tracking-tight text-primary">Nenhum profissional cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, items }) => (
            <div key={category}>
              {/* Cabeçalho de categoria */}
              <div className="flex items-center gap-3 mb-4">
                <p
                  className="text-xs font-bold uppercase tracking-[0.22em] text-foreground"
                  style={{ fontFamily: "'Cinzel', 'Georgia', serif" }}
                >
                  {catLabel(category)}
                </p>
                <span className="concave-3d px-2 py-0.5 text-[9px] font-black text-muted-foreground tabular-nums">
                  {items.length}
                </span>
                <div className="flex-1 h-px bg-border/40" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((pro) => {
                  const p = pro as typeof pro & {
                    nurseType?: string | null;
                    photoUrl?: string | null;
                  };
                  const isMedico = (pro.professionalType ?? "medico") === "medico";
                  const specialtyLabel = pro.specialtyName ?? pro.specialty ?? "";
                  const registro = [pro.registrationCouncil, pro.registrationNumber].filter(Boolean).join(" ") || pro.crm || "";
                  const isActive = pro.active ?? true;
                  const ini = initials(pro.name ?? "?");
                  const hasPhoto = !!p.photoUrl;

                  return (
                    <Card key={pro.id} className="panel-3d overflow-hidden group hover:shadow-xl transition-all duration-300">
                      <CardContent className="p-0">

                        {/* ── Faixa mastro (navy) ── */}
                        <div className="bg-[hsl(220,40%,13%)] px-5 py-4 relative">
                          <div className="flex items-start gap-4">

                            {/* Avatar / foto */}
                            <div className="flex-shrink-0">
                              {hasPhoto ? (
                                <img
                                  src={`${BASE}${p.photoUrl}`}
                                  alt={pro.name ?? ""}
                                  className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/30 shadow-lg"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-full bg-[hsl(220,30%,20%)] ring-2 ring-primary/20 shadow-lg flex items-center justify-center">
                                  <span
                                    className="text-primary font-bold text-lg leading-none"
                                    style={{ fontFamily: "'Cinzel', 'Georgia', serif" }}
                                  >
                                    {ini}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Nome + especialidade */}
                            <div className="flex-1 min-w-0 pt-0.5">
                              <p
                                className="text-white font-bold text-base leading-tight truncate"
                                style={{ fontFamily: "'Playfair Display', 'Georgia', serif" }}
                              >
                                {pro.name}
                              </p>
                              {specialtyLabel && (
                                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary/70 mt-0.5 truncate">
                                  {specialtyLabel}
                                </p>
                              )}
                              {/* badges */}
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {p.nurseType === "home" && (
                                  <span className="bg-accent/20 text-accent px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-sm">
                                    Home Nurse
                                  </span>
                                )}
                                <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-sm ${isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                                  {isActive ? "Ativo" : "Inativo"}
                                </span>
                              </div>
                            </div>

                            {/* Botão editar */}
                            <button
                              type="button"
                              onClick={() => openEdit(pro)}
                              className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                              aria-label={`Editar ${pro.name}`}
                            >
                              <Pencil className="h-3 w-3 text-white/70" />
                            </button>
                          </div>
                        </div>

                        {/* ── Corpo do card ── */}
                        <div className="px-5 py-4 space-y-2.5">
                          {registro && (
                            <div className="flex items-center gap-2">
                              <BadgeCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">{registro}</span>
                            </div>
                          )}
                          {pro.unit && (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-[10px] font-semibold text-muted-foreground truncate">{pro.unit}</span>
                            </div>
                          )}
                          {pro.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-[10px] font-semibold text-muted-foreground truncate">{pro.phone}</span>
                            </div>
                          )}
                          {pro.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-[10px] font-semibold text-muted-foreground truncate">{pro.email}</span>
                            </div>
                          )}
                          {!registro && !pro.unit && !pro.phone && !pro.email && (
                            <p className="text-[10px] font-semibold text-muted-foreground/50 italic">
                              Dados de contato não cadastrados
                            </p>
                          )}
                        </div>

                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
