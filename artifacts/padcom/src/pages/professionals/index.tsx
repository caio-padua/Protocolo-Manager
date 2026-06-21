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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { User, Plus, Phone, Mail, Stethoscope, Building2, Pencil, BadgeCheck, ShieldCheck, HeartPulse } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

type ProfType = "medico" | "nao_medico";

const SERVICE_OPTIONS = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online" },
];

const EMPTY_FORM = {
  name: "",
  professionalType: "medico" as ProfType,
  areaId: "" as string,
  specialtyId: "" as string,
  registrationCouncil: "",
  registrationNumber: "",
  phone: "",
  email: "",
  unit: "",
  serviceTypes: ["presencial"] as string[],
  active: true,
};

type FormState = typeof EMPTY_FORM;

export default function Professionals() {
  const { data: professionals, isLoading, refetch } = useListProfessionals();
  const { data: areas } = useListProfessionalAreas();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
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
      onError: () => toast({ title: "Erro ao cadastrar profissional", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateProfessional({
    mutation: {
      onSuccess: () => {
        toast({ title: "Profissional atualizado!" });
        closeDialog();
        refetch();
      },
      onError: () => toast({ title: "Erro ao atualizar profissional", variant: "destructive" }),
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (pro: Professional) => {
    setEditingId(pro.id);
    setForm({
      name: pro.name ?? "",
      professionalType: (pro.professionalType as ProfType) || "medico",
      areaId: pro.areaId ? String(pro.areaId) : "",
      specialtyId: pro.specialtyId ? String(pro.specialtyId) : "",
      registrationCouncil: pro.registrationCouncil ?? "",
      registrationNumber: pro.registrationNumber ?? "",
      phone: pro.phone ?? "",
      email: pro.email ?? "",
      unit: pro.unit ?? "",
      serviceTypes: pro.serviceTypes?.length ? pro.serviceTypes : ["presencial"],
      active: pro.active ?? true,
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

    const body = {
      name: form.name.trim(),
      professionalType: form.professionalType,
      areaId: Number(form.areaId),
      specialtyId: Number(form.specialtyId),
      registrationCouncil: form.registrationCouncil.trim() || null,
      registrationNumber: form.registrationNumber.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      unit: form.unit.trim() || null,
      serviceTypes: form.serviceTypes,
      active: form.active,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: body });
    } else {
      createMutation.mutate({ data: body });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const councilPlaceholder = form.professionalType === "medico" ? "CRM" : "COREN / CRP / CRN";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Corpo Clínico</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            Profissionais responsáveis pelos protocolos injetáveis.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button className="btn-3d" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              NOVO PROFISSIONAL
            </Button>
          </DialogTrigger>
          <DialogContent className="panel-3d max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                {editingId ? "Editar Profissional" : "Cadastrar Profissional"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome completo" className="field-engraved" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo *</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(["medico", "nao_medico"] as ProfType[]).map((t) => {
                    const activeBtn = form.professionalType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, professionalType: t, areaId: "", specialtyId: "" }))}
                        className={`${activeBtn ? "bevel-3d" : "concave-3d"} flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all ${activeBtn ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {t === "medico" ? <Stethoscope className="h-3.5 w-3.5" /> : <HeartPulse className="h-3.5 w-3.5" />}
                        {t === "medico" ? "Médico" : "Não-médico"}
                      </button>
                    );
                  })}
                </div>
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
                  <Input value={form.registrationCouncil} onChange={(e) => set("registrationCouncil", e.target.value)} placeholder={councilPlaceholder} className="field-engraved" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Número do registro</Label>
                  <Input value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} placeholder="SP 123456" className="field-engraved" />
                </div>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Telefone</Label>
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" className="field-engraved" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="nome@clinica.com.br" className="field-engraved" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidade</Label>
                <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="Clínica Principal" className="field-engraved" />
              </div>

              <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
                <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
                <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ativo (disponível para agenda)</Label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button className="btn-3d-soft" onClick={closeDialog}>Cancelar</Button>
                <Button className="btn-3d" onClick={handleSubmit} disabled={isPending}>
                  {isPending ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 panel-3d-sub" />)}
        </div>
      ) : !professionals?.length ? (
        <Card className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="concave-3d p-6 mb-4">
              <User className="h-10 w-10 text-muted-foreground opacity-30" />
            </div>
            <p className="text-base font-black uppercase tracking-tight text-primary">Nenhum profissional cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {professionals.map((pro) => {
            const isMedico = (pro.professionalType ?? "medico") === "medico";
            const areaLabel = pro.areaName ?? "—";
            const specialtyLabel = pro.specialtyName ?? pro.specialty ?? "—";
            const registro = [pro.registrationCouncil, pro.registrationNumber].filter(Boolean).join(" ") || pro.crm || "—";
            const isActive = pro.active ?? true;
            return (
              <Card key={pro.id} className="panel-3d-sub neon-hover transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 bevel-3d w-10 h-10 flex items-center justify-center">
                      {isMedico ? <Stethoscope className="h-5 w-5 text-primary" /> : <HeartPulse className="h-5 w-5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black uppercase tracking-tight text-foreground leading-tight">{pro.name}</p>
                        <button
                          type="button"
                          onClick={() => openEdit(pro)}
                          className="concave-3d flex-shrink-0 p-1.5 text-muted-foreground hover:text-primary transition-colors"
                          aria-label={`Editar ${pro.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${isMedico ? "text-primary" : "text-cyan-600"}`}>
                          {isMedico ? "Médico" : "Não-médico"}
                        </span>
                        <span className="concave-3d px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                          {areaLabel}
                        </span>
                        <span className={`concave-3d px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${isActive ? "text-emerald-600" : "text-rose-500"}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
                          {isActive ? "Ativo" : "Inativo"}
                        </span>
                      </div>

                      <div className="space-y-1.5 mt-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                          <BadgeCheck className="h-3 w-3 text-primary" />
                          <span className="truncate">{specialtyLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                          <ShieldCheck className="h-3 w-3 text-primary" />
                          <span className="truncate">{registro}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                          <Building2 className="h-3 w-3 text-primary" />
                          <span className="truncate">{pro.unit ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                          <Phone className="h-3 w-3 text-primary" />
                          <span className="truncate">{pro.phone ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                          <Mail className="h-3 w-3 text-primary" />
                          <span className="truncate">{pro.email ?? "—"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
