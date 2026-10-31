import { useState } from "react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Users, Plus, Loader2, Save, Pencil, Trash2, Phone, Mail, Stethoscope,
  Building2, Link2, CalendarDays, X,
} from "lucide-react";
import { toast } from "sonner";

const apiBase = import.meta.env.VITE_API_URL || "/api";

interface Professional {
  id: number;
  name: string;
  crm: string | null;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  unit: string | null;
  serviceTypes: string[];
  category: string;
  role: string;
  active: boolean;
  createdAt: string;
}
interface Clinica { id: number; name: string }
interface AgendaCal { id: number; name: string; locationId: number | null; active: boolean }
interface Vinculo { id: number; locationId: number; professionalId: number; role: string; agendaCalendarId: number | null }

const CATEGORIES = [
  { value: "medico", label: "Médicos" },
  { value: "enfermagem", label: "Enfermagem" },
  { value: "recepcao", label: "Recepção" },
  { value: "administrativo", label: "Administrativo" },
  { value: "financeiro", label: "Financeiro" },
  { value: "outro", label: "Outros" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

interface FormState {
  name: string;
  crm: string;
  specialty: string;
  phone: string;
  email: string;
  unit: string;
  category: string;
  active: boolean;
}
const EMPTY: FormState = {
  name: "", crm: "", specialty: "", phone: "", email: "", unit: "", category: "outro", active: true,
};

export default function CadastroEquipe() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Professional | null>(null);
  const [vinculoTarget, setVinculoTarget] = useState<Professional | null>(null);

  const { data: professionals = [], isLoading } = useQuery<Professional[]>({
    queryKey: ["professionals"],
    queryFn: async () => (await fetch(`${apiBase}/professionals`, { headers: collabAuthHeaders() })).json(),
  });

  const setField = (k: keyof FormState, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        crm: form.crm || null,
        specialty: form.specialty || null,
        phone: form.phone || null,
        email: form.email || null,
        unit: form.unit || null,
        category: form.category,
        active: form.active,
        serviceTypes: ["clinic"],
      };
      const url = editingId ? `${apiBase}/professionals/${editingId}` : `${apiBase}/professionals`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao salvar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      toast.success(editingId ? "Profissional atualizado!" : "Profissional cadastrado!");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (p: Professional) => {
      const res = await fetch(`${apiBase}/professionals/${p.id}`, {
        method: "DELETE",
        headers: collabAuthHeaders(),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao apagar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      toast.success("Profissional desativado; histórico preservado.");
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteTarget(null);
    },
  });

  const openNew = () => { setEditingId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (p: Professional) => {
    setEditingId(p.id);
    setForm({
      name: p.name, crm: p.crm ?? "", specialty: p.specialty ?? "", phone: p.phone ?? "",
      email: p.email ?? "", unit: p.unit ?? "", category: p.category || "outro", active: p.active,
    });
    setDialogOpen(true);
  };

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    people: professionals.filter((p) => (p.category || "outro") === cat.value),
  })).filter((g) => g.people.length > 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bevel-3d p-2.5 shrink-0"><Users className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight uppercase truncate">EQUIPE</h1>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-1">
              Profissionais por categoria, vínculos e agendas
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="btn-3d px-5 shrink-0">
          <Plus className="w-4 h-4 mr-2" /> NOVO PROFISSIONAL
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : professionals.length === 0 ? (
        <Card className="panel-3d border-none">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="concave-3d p-6 mb-4"><Users className="h-10 w-10 text-muted-foreground opacity-30" /></div>
            <p className="text-base font-black uppercase tracking-tight text-primary">Nenhum profissional cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((g) => (
            <div key={g.value} className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-primary border-b border-border/50 pb-1.5">
                {g.label} <span className="text-muted-foreground">({g.people.length})</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.people.map((p) => (
                  <Card key={p.id} className="panel-3d border-none relative overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 bevel-3d w-10 h-10 flex items-center justify-center">
                          <Stethoscope className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            <span>#{p.id}</span>
                            {!p.active && <span className="px-1.5 py-0.5 rounded-[3px] bg-destructive/15 text-destructive">INATIVO</span>}
                          </div>
                          <p className="font-black uppercase tracking-tight text-foreground leading-tight truncate" title={p.name}>{p.name}</p>
                          {p.specialty && (
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mt-0.5 truncate">{p.specialty}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {p.crm && (
                          <span className="concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">{p.crm}</span>
                        )}
                        {p.unit && (
                          <span className="concave-3d px-2 py-0.5 text-[9px] font-bold text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3 w-3" />{p.unit}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {p.phone && (
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                            <Phone className="h-3 w-3 text-primary" />{p.phone}
                          </div>
                        )}
                        {p.email && (
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                            <Mail className="h-3 w-3 text-primary" /><span className="truncate">{p.email}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="btn-3d-soft flex-1" onClick={() => openEdit(p)}>
                          <Pencil className="w-3.5 h-3.5 mr-1.5" /> EDITAR
                        </Button>
                        <Button size="sm" variant="outline" className="btn-3d-soft" title="Vínculos com clínicas e agendas" onClick={() => setVinculoTarget(p)}>
                          <Link2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="btn-3d-soft" title="Apagar profissional" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">{editingId ? "EDITAR PROFISSIONAL" : "NOVO PROFISSIONAL"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome *</Label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nome completo" className="field-engraved" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoria</Label>
                <div className="concave-3d p-1">
                  <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                    <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</Label>
                <div className="concave-3d p-1">
                  <Select value={form.active ? "true" : "false"} onValueChange={(v) => setField("active", v === "true")}>
                    <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Ativo</SelectItem>
                      <SelectItem value="false">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CRM / COREN</Label>
                <Input value={form.crm} onChange={(e) => setField("crm", e.target.value)} placeholder="CRM/SP 123456" className="field-engraved" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Especialidade</Label>
                <Input value={form.specialty} onChange={(e) => setField("specialty", e.target.value)} placeholder="Medicina Estética" className="field-engraved" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Telefone</Label>
                <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="(11) 99999-9999" className="field-engraved" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="nome@clinica.com.br" className="field-engraved" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidade (texto livre)</Label>
              <Input value={form.unit} onChange={(e) => setField("unit", e.target.value)} placeholder="Clínica Principal" className="field-engraved" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" className="btn-3d-soft" onClick={() => setDialogOpen(false)}>CANCELAR</Button>
            <Button type="button" className="btn-3d px-6" disabled={saveMutation.isPending || !form.name.trim()} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editingId ? "SALVAR" : "CADASTRAR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog vínculos */}
      <VinculosDialog professional={vinculoTarget} onClose={() => setVinculoTarget(null)} />

      {/* Dialog apagar */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">APAGAR PROFISSIONAL</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Apagar <strong className="text-foreground">{deleteTarget?.name}</strong>? Se houver sessões vinculadas, o sistema bloqueia e pede para apenas desativar.
          </p>
          <DialogFooter>
            <Button type="button" className="btn-3d-soft" onClick={() => setDeleteTarget(null)}>CANCELAR</Button>
            <Button type="button" variant="outline" className="btn-3d-soft" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              APAGAR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VinculosDialog({ professional, onClose }: { professional: Professional | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const open = !!professional;

  const { data: clinicas = [] } = useQuery<Clinica[]>({
    queryKey: ["clinicas"],
    queryFn: async () => (await fetch(`${apiBase}/locations`)).json(),
    enabled: open,
  });
  const { data: agendas } = useQuery<{ calendars: AgendaCal[] }>({
    queryKey: ["agenda-calendars"],
    queryFn: async () => (await fetch(`${apiBase}/agenda-calendars`)).json(),
    enabled: open,
  });
  const { data: vinculos = [] } = useQuery<Vinculo[]>({
    queryKey: ["professional-locations", professional?.id],
    queryFn: async () => (await fetch(
      `${apiBase}/professionals/${professional!.id}/locations`,
      { headers: collabAuthHeaders() },
    )).json(),
    enabled: open,
  });

  const agendaCals = agendas?.calendars ?? [];

  const upsertMutation = useMutation({
    mutationFn: async ({ locationId, agendaCalendarId }: { locationId: number; agendaCalendarId: number | null }) => {
      const res = await fetch(`${apiBase}/professionals/${professional!.id}/locations`, {
        method: "POST",
        headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ locationId, agendaCalendarId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao salvar vínculo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professional-locations", professional?.id] });
      toast.success("Vínculo salvo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (locationId: number) => {
      const res = await fetch(`${apiBase}/professionals/${professional!.id}/locations/${locationId}`, {
        method: "DELETE",
        headers: collabAuthHeaders(),
      });
      if (!res.ok) throw new Error("Erro ao remover vínculo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professional-locations", professional?.id] });
      toast.success("Vínculo removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vinculoFor = (locationId: number) => vinculos.find((v) => v.locationId === locationId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wide">VÍNCULOS — {professional?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">
          Marque as clínicas onde o profissional atende e escolha a agenda Google preferida do par. O evento da sessão cai nessa agenda.
        </p>
        <div className="space-y-3 py-1">
          {clinicas.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma clínica cadastrada.</p>
          )}
          {clinicas.map((c) => {
            const v = vinculoFor(c.id);
            const linked = !!v;
            const clinicAgendas = agendaCals.filter((a) => a.active && (a.locationId === c.id || a.locationId === null));
            return (
              <Card key={c.id} className="panel-3d-sub border-none">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-bold text-sm truncate">{c.name}</span>
                    </div>
                    {linked ? (
                      <Button size="sm" variant="outline" className="btn-3d-soft shrink-0" onClick={() => removeMutation.mutate(c.id)} disabled={removeMutation.isPending}>
                        <X className="w-3.5 h-3.5 mr-1" /> DESVINCULAR
                      </Button>
                    ) : (
                      <Button size="sm" className="btn-3d-soft shrink-0" onClick={() => upsertMutation.mutate({ locationId: c.id, agendaCalendarId: null })} disabled={upsertMutation.isPending}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> VINCULAR
                      </Button>
                    )}
                  </div>
                  {linked && (
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="concave-3d p-1 flex-1">
                        <Select
                          value={v?.agendaCalendarId ? String(v.agendaCalendarId) : "none"}
                          onValueChange={(val) => upsertMutation.mutate({ locationId: c.id, agendaCalendarId: val === "none" ? null : Number(val) })}
                        >
                          <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 h-8 text-xs"><SelectValue placeholder="Agenda preferida" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem agenda específica (usa a da clínica)</SelectItem>
                            {clinicAgendas.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" className="btn-3d px-6" onClick={onClose}>FECHAR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
