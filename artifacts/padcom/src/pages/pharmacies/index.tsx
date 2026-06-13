import {
  useListPharmacies,
  useCreatePharmacy,
  useUpdatePharmacy,
  useDeletePharmacy,
  useSendPharmacyBatch,
} from "@workspace/api-client-react";
import type { Pharmacy } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2, Plus, Phone, Mail, MessageSquare, Pencil, Trash2, Send, ShieldAlert, FlaskConical,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { PHARMACY_TYPES, pharmacyTypeLabel, ANVISA_CONTROLLED_CLASSES } from "@/lib/anvisa";

const inputCls =
  "px-3 py-2 border border-border rounded-md text-sm focus:ring-2 focus:ring-accent/40 focus:border-accent outline-none bg-card text-foreground w-full";

interface FormState {
  name: string;
  type: string;
  cnpj: string;
  phone: string;
  email: string;
  whatsapp: string;
  notes: string;
  controlledTypes: string[];
}

const EMPTY: FormState = {
  name: "", type: "farma.manip", cnpj: "", phone: "", email: "", whatsapp: "", notes: "", controlledTypes: [],
};

export default function Pharmacies() {
  const { data: pharmacies, isLoading, refetch } = useListPharmacies();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const createMutation = useCreatePharmacy({
    mutation: {
      onSuccess: () => { toast({ title: "Farmácia cadastrada!" }); closeDialog(); refetch(); },
      onError: () => toast({ title: "Erro ao cadastrar farmácia", variant: "destructive" }),
    },
  });
  const updateMutation = useUpdatePharmacy({
    mutation: {
      onSuccess: () => { toast({ title: "Farmácia atualizada!" }); closeDialog(); refetch(); },
      onError: () => toast({ title: "Erro ao atualizar farmácia", variant: "destructive" }),
    },
  });
  const deleteMutation = useDeletePharmacy({
    mutation: {
      onSuccess: () => { toast({ title: "Farmácia removida." }); refetch(); },
      onError: () => toast({ title: "Erro ao remover farmácia", variant: "destructive" }),
    },
  });
  const batchMutation = useSendPharmacyBatch({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Lote enviado!",
          description: `${res.emailsSent} e-mail(s) para ${res.pharmacies} farmácia(s), ${res.recipesSent} receita(s).`,
        });
        refetch();
      },
      onError: () => toast({ title: "Erro ao enviar lote", variant: "destructive" }),
    },
  });

  function closeDialog() {
    setOpen(false);
    setEditId(null);
    setForm(EMPTY);
  }

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(p: Pharmacy) {
    setEditId(p.id);
    setForm({
      name: p.name,
      type: p.type || "farma.manip",
      cnpj: p.cnpj || "",
      phone: p.phone || "",
      email: p.email || "",
      whatsapp: p.whatsapp || "",
      notes: p.notes || "",
      controlledTypes: p.controlledTypes || [],
    });
    setOpen(true);
  }

  function toggleControlled(value: string) {
    setForm((f) => ({
      ...f,
      controlledTypes: f.controlledTypes.includes(value)
        ? f.controlledTypes.filter((v) => v !== value)
        : [...f.controlledTypes, value],
    }));
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    const data = {
      name: form.name.trim(),
      type: form.type,
      cnpj: form.cnpj || null,
      phone: form.phone || null,
      email: form.email || null,
      whatsapp: form.whatsapp || null,
      notes: form.notes || null,
      controlledTypes: form.controlledTypes,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, data });
    } else {
      createMutation.mutate({ data });
    }
  }

  function handleDelete(p: Pharmacy) {
    if (window.confirm(`Remover a farmácia "${p.name}"?`)) {
      deleteMutation.mutate({ id: p.id });
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Farmácias</h1>
          <p className="text-muted-foreground">
            Destinos das receitas — manipulação, drogaria e laboratório de injetáveis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => batchMutation.mutate({ data: {} })}
            disabled={batchMutation.isPending}
            title="Envia agora o lote de receitas pendentes por e-mail (mesmo conteúdo do envio noturno automático das 22h)."
          >
            <Send className="h-4 w-4 mr-2" />
            {batchMutation.isPending ? "Enviando..." : "Enviar lote agora"}
          </Button>
          <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Farmácia
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editId ? "Editar Farmácia" : "Cadastrar Farmácia"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Razão social ou nome fantasia" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                      {PHARMACY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 0000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp</Label>
                    <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="11999990000" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>E-mail (recebe o lote noturno)</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contato@farmacia.com.br" />
                </div>
                <div className="space-y-2">
                  <Label>Tipos controlados que esta farmácia atende</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ANVISA_CONTROLLED_CLASSES.map((c) => {
                      const checked = form.controlledTypes.includes(c.value);
                      return (
                        <button
                          type="button"
                          key={c.value}
                          onClick={() => toggleControlled(c.value)}
                          className={`text-left text-xs px-2.5 py-2 rounded-md border transition ${checked ? "bg-primary text-primary-foreground border-primary font-semibold" : "bg-card hover:bg-muted border-border text-foreground"}`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <textarea
                    className={`${inputCls} resize-y`}
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Prazos de entrega, contato preferencial, etc."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : !pharmacies?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma farmácia cadastrada</p>
            <p className="text-sm text-muted-foreground">Cadastre a primeira para rotear as receitas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pharmacies.map((p) => (
            <Card key={p.id} className="border-l-4 border-l-primary">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <FlaskConical className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight truncate">{p.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-primary font-semibold mt-0.5">
                        {pharmacyTypeLabel(p.type)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(p)} className="p-1.5 text-destructive hover:opacity-80" title="Remover">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 mt-3">
                  {p.email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /><span className="truncate">{p.email}</span>
                    </div>
                  )}
                  {p.whatsapp && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />{p.whatsapp}
                    </div>
                  )}
                  {p.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />{p.phone}
                    </div>
                  )}
                  {p.cnpj && (
                    <div className="text-xs text-muted-foreground">CNPJ: {p.cnpj}</div>
                  )}
                </div>

                {p.controlledTypes?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1.5">
                      <ShieldAlert className="h-3 w-3" />Controlados atendidos
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.controlledTypes.map((t) => (
                        <span key={t} className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-amber-50 border border-amber-200 text-amber-800">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
