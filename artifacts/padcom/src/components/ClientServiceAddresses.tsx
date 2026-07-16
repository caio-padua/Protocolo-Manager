import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Plus, Pencil, Trash2, Star, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ServiceAddress {
  id: number;
  clientId: number;
  label: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  reference: string | null;
  isDefault: boolean;
  createdAt: string;
}

const EMPTY_FORM = {
  label: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  zipCode: "",
  reference: "",
  isDefault: false,
};

export function ClientServiceAddresses({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const base = `${import.meta.env.BASE_URL}api`;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  const { data: addresses, isLoading } = useQuery<ServiceAddress[]>({
    queryKey: ["client-service-addresses", clientId],
    queryFn: async () => {
      const r = await fetch(`${base}/client-service-addresses?clientId=${clientId}`);
      if (!r.ok) throw new Error("Erro ao buscar endereços");
      return r.json();
    },
    enabled: !!clientId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, clientId };
      if (editingId != null) {
        const r = await fetch(`${base}/client-service-addresses/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      }
      const r = await fetch(`${base}/client-service-addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editingId != null ? "Endereço atualizado!" : "Endereço cadastrado!" });
      qc.invalidateQueries({ queryKey: ["client-service-addresses", clientId] });
      closeDialog();
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${base}/client-service-addresses/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => {
      toast({ title: "Endereço removido." });
      qc.invalidateQueries({ queryKey: ["client-service-addresses", clientId] });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(addr: ServiceAddress) {
    setEditingId(addr.id);
    setForm({
      label: addr.label,
      street: addr.street ?? "",
      number: addr.number ?? "",
      complement: addr.complement ?? "",
      neighborhood: addr.neighborhood ?? "",
      city: addr.city ?? "",
      state: addr.state ?? "",
      zipCode: addr.zipCode ?? "",
      reference: addr.reference ?? "",
      isDefault: addr.isDefault,
    });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  const set = (k: keyof typeof EMPTY_FORM, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  async function handleCepBlur() {
    const cep = form.zipCode.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setForm(f => ({
          ...f,
          street: d.logradouro || f.street,
          neighborhood: d.bairro || f.neighborhood,
          city: d.localidade || f.city,
          state: d.uf || f.state,
        }));
      }
    } catch {}
  }

  function formatLine(addr: ServiceAddress) {
    const parts = [addr.street, addr.number, addr.complement].filter(Boolean).join(", ");
    const tail = [addr.neighborhood && `— ${addr.neighborhood}`, addr.city, addr.state && addr.city ? `/${addr.state}` : addr.state].filter(Boolean).join(", ");
    return [parts, tail].filter(Boolean).join(" ");
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between">
        <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2">
          <MapPin className="h-3 w-3 text-primary" />
          Endereços de Visita Domiciliar
        </div>
        <Button className="btn-3d h-8 text-[10px] font-black" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          NOVO ENDEREÇO
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-md panel-3d-sub animate-pulse" />
          ))}
        </div>
      ) : !addresses?.length ? (
        <div className="panel-3d border-none text-center py-14">
          <Home className="mx-auto h-10 w-10 text-muted-foreground opacity-20 mb-3" />
          <p className="text-muted-foreground uppercase font-bold text-xs tracking-widest">
            Nenhum endereço cadastrado.
          </p>
          <p className="text-muted-foreground text-[10px] font-medium mt-1 uppercase tracking-wide">
            Adicione endereços para visitas Nurse Care Domiciliar.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map(addr => (
            <div
              key={addr.id}
              className={`panel-3d-sub overflow-hidden transition-all ${addr.isDefault ? "ring-1 ring-accent/30" : ""}`}
            >
              <div className="flex h-full">
                <div className={`w-1.5 shrink-0 ${addr.isDefault ? "bg-accent/60" : "bg-primary/20"}`} />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="font-black text-sm uppercase tracking-tight text-foreground"
                          style={{ fontFamily: "'Playfair Display', serif" }}
                        >
                          {addr.label}
                        </span>
                        {addr.isDefault && (
                          <span className="bevel-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-accent flex items-center gap-1">
                            <Star className="h-2.5 w-2.5" />
                            Padrão
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 text-[11px] text-muted-foreground font-medium leading-relaxed">
                        {formatLine(addr)}
                        {addr.zipCode && (
                          <span className="ml-1 tabular-nums">— CEP {addr.zipCode}</span>
                        )}
                      </p>

                      {addr.reference && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground/60 font-medium italic">
                          Ref.: {addr.reference}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(addr)}
                        className="concave-3d p-1.5 text-muted-foreground hover:text-primary transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remover "${addr.label}"?`)) deleteMutation.mutate(addr.id);
                        }}
                        className="concave-3d p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Diálogo de cadastro/edição */}
      <Dialog open={open} onOpenChange={o => (o ? setOpen(true) : closeDialog())}>
        <DialogContent className="panel-3d max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle
              className="text-base font-black tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {editingId != null ? "Editar Endereço" : "Novo Endereço de Visita"}
            </DialogTitle>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Nurse Care Domiciliar — Padcon Conect
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Label / Identificação */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Identificação *
              </Label>
              <Input
                value={form.label}
                onChange={e => set("label", e.target.value)}
                placeholder="Ex.: Residência Principal, Apartamento..."
                className="field-engraved"
              />
            </div>

            {/* CEP + Estado */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  CEP
                </Label>
                <Input
                  value={form.zipCode}
                  onChange={e => set("zipCode", e.target.value)}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  className="field-engraved"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  UF
                </Label>
                <Input
                  value={form.state}
                  onChange={e => set("state", e.target.value.toUpperCase())}
                  placeholder="SP"
                  maxLength={2}
                  className="field-engraved uppercase"
                />
              </div>
            </div>

            {/* Logradouro + Número */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Logradouro
                </Label>
                <Input
                  value={form.street}
                  onChange={e => set("street", e.target.value)}
                  placeholder="Rua, Avenida..."
                  className="field-engraved"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Nº
                </Label>
                <Input
                  value={form.number}
                  onChange={e => set("number", e.target.value)}
                  placeholder="123"
                  className="field-engraved"
                />
              </div>
            </div>

            {/* Complemento + Bairro */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Complemento
                </Label>
                <Input
                  value={form.complement}
                  onChange={e => set("complement", e.target.value)}
                  placeholder="Apto, Bloco..."
                  className="field-engraved"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Bairro
                </Label>
                <Input
                  value={form.neighborhood}
                  onChange={e => set("neighborhood", e.target.value)}
                  placeholder="Bairro"
                  className="field-engraved"
                />
              </div>
            </div>

            {/* Cidade */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Cidade
              </Label>
              <Input
                value={form.city}
                onChange={e => set("city", e.target.value)}
                placeholder="São Paulo"
                className="field-engraved"
              />
            </div>

            {/* Referência */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Referência (portão, interfone...)
              </Label>
              <Input
                value={form.reference}
                onChange={e => set("reference", e.target.value)}
                placeholder="Portão azul, interfone 42B..."
                className="field-engraved"
              />
            </div>

            {/* Switch padrão */}
            <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
              <Switch
                checked={form.isDefault}
                onCheckedChange={v => set("isDefault", v)}
              />
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground cursor-pointer">
                Definir como endereço padrão de visita
              </Label>
            </div>

            {/* Ações */}
            <div className="flex justify-end gap-3 pt-2 border-t border-border/30">
              <Button className="btn-3d-soft" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                className="btn-3d"
                onClick={() => saveMutation.mutate()}
                disabled={!form.label.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending
                  ? "Salvando..."
                  : editingId != null
                  ? "Salvar Alterações"
                  : "Cadastrar Endereço"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
