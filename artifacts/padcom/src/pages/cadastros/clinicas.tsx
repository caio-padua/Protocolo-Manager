import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building2, Plus, Loader2, Search, Save, Pencil, Trash2, Phone, MapPin, CalendarCheck } from "lucide-react";
import { toast } from "sonner";

const apiBase = import.meta.env.VITE_API_URL || "/api";

interface Clinica {
  id: number;
  name: string;
  address: string | null;
  type: string;
  color: string;
  active: boolean;
  googleCalendarId: string | null;
  phone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  zona: string | null;
}

const formSchema = z.object({
  name: z.string().min(2, "Nome obrigatorio"),
  type: z.string(),
  phone: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  zona: z.string().optional(),
  color: z.string().optional(),
  googleCalendarId: z.string().optional(),
  active: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

function formatCEP(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}
function formatPhone(value: string): string {
  const raw = value.startsWith("+") ? value : value.replace(/\D/g, "");
  if (value.startsWith("+")) return "+" + value.slice(1).replace(/\D/g, "").slice(0, 15);
  const d = raw.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const EMPTY: FormValues = {
  name: "", type: "clinic", phone: "", cep: "", logradouro: "", numero: "",
  complemento: "", bairro: "", cidade: "", estado: "", zona: "", color: "#16284a",
  googleCalendarId: "", active: true,
};

export default function CadastroClinicas() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Clinica | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: clinicas = [], isLoading } = useQuery<Clinica[]>({
    queryKey: ["clinicas"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/locations`);
      if (!res.ok) throw new Error("Erro ao carregar clinicas");
      return res.json();
    },
  });

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });

  const lookupCep = useCallback(async () => {
    const cep = form.getValues("cep")?.replace(/\D/g, "");
    if (!cep || cep.length !== 8) {
      toast.error("CEP deve ter 8 digitos");
      return;
    }
    setLoadingCep(true);
    try {
      const res = await fetch(`${apiBase}/cep/${cep}`);
      if (!res.ok) { toast.error("CEP nao encontrado"); return; }
      const data = await res.json();
      form.setValue("logradouro", data.logradouro || "");
      form.setValue("bairro", data.bairro || "");
      form.setValue("cidade", data.localidade || "");
      form.setValue("estado", data.uf || "");
      toast.success("Endereco preenchido!");
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const addressParts = [
        values.logradouro, values.numero, values.complemento, values.bairro,
        values.cidade ? `${values.cidade} - ${values.estado || ""}` : values.estado,
        values.cep ? `CEP ${values.cep}` : "",
      ].filter(Boolean);
      const body = {
        ...values,
        address: addressParts.join(", ") || null,
        googleCalendarId: values.googleCalendarId || null,
      };
      const url = editingId ? `${apiBase}/locations/${editingId}` : `${apiBase}/locations`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicas"] });
      toast.success(editingId ? "Clinica atualizada!" : "Clinica cadastrada!");
      setDialogOpen(false);
    },
    onError: () => toast.error("Erro ao salvar clinica."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${apiBase}/locations/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        const data = await res.json();
        throw new Error(data.error || "Clinica possui sessoes vinculadas.");
      }
      if (!res.ok) throw new Error("Erro ao apagar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicas"] });
      toast.success("Clinica apagada.");
      setDeleteTarget(null);
      setDeleteConfirmText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditingId(null);
    form.reset(EMPTY);
    setDialogOpen(true);
  };
  const openEdit = (c: Clinica) => {
    setEditingId(c.id);
    form.reset({
      name: c.name, type: c.type, phone: c.phone || "", cep: c.cep || "",
      logradouro: c.logradouro || "", numero: c.numero || "", complemento: c.complemento || "",
      bairro: c.bairro || "", cidade: c.cidade || "", estado: c.estado || "",
      zona: c.zona || "",
      color: c.color || "#16284a", googleCalendarId: c.googleCalendarId || "", active: c.active,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bevel-3d p-2.5 shrink-0"><Building2 className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight uppercase truncate">CLINICAS</h1>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-1">
              Enderecos onde voce atende
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="btn-3d px-5 shrink-0">
          <Plus className="w-4 h-4 mr-2" /> NOVA CLINICA
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clinicas.map((c) => (
            <Card key={c.id} className="panel-3d border-none relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: c.color || "#16284a" }} />
              <CardContent className="p-4 pl-5 space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span>#{c.id}</span>
                  <span className={`px-1.5 py-0.5 rounded-[3px] ${c.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {c.active ? "ATIVA" : "INATIVA"}
                  </span>
                  <span className="ml-auto">{c.type === "homecare" ? "DOMICILIAR" : "CLINICA"}</span>
                </div>
                <h3 className="font-bold text-base truncate">{c.name}</h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.cidade ? `${c.cidade}${c.estado ? " - " + c.estado : ""}` : (c.address || "—")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.phone || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate" title={c.googleCalendarId || undefined}>
                      {c.googleCalendarId
                        ? (c.googleCalendarId.includes("@group.calendar.google.com")
                            ? c.googleCalendarId.split("@")[0]
                            : c.googleCalendarId)
                        : "Sem agenda"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="btn-3d-soft flex-1" onClick={() => openEdit(c)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> EDITAR
                  </Button>
                  <Button size="sm" variant="outline" className="btn-3d-soft" onClick={() => { setDeleteTarget(c); setDeleteConfirmText(""); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {clinicas.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground text-sm">
              Nenhuma clinica cadastrada. Clique em NOVA CLINICA.
            </div>
          )}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">{editingId ? "EDITAR CLINICA" : "NOVA CLINICA"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Nome *</FormLabel>
                    <FormControl><Input placeholder="Ex: Instituto Padua" {...field} className="field-engraved" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Tipo</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="clinic">Clinica (endereco fixo)</SelectItem>
                          <SelectItem value="homecare">Domiciliar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Telefone / WhatsApp</FormLabel>
                    <FormControl><Input placeholder="(11) 90000-0000" className="field-engraved" value={field.value} onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="cep" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">CEP</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input placeholder="00000-000" className="field-engraved" value={field.value}
                          onChange={(e) => {
                            const f = formatCEP(e.target.value);
                            field.onChange(f);
                            if (f.replace(/\D/g, "").length === 8) setTimeout(() => lookupCep(), 100);
                          }} />
                      </FormControl>
                      <Button type="button" size="icon" onClick={lookupCep} disabled={loadingCep} className="btn-3d-soft shrink-0">
                        {loadingCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="logradouro" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Logradouro</FormLabel>
                    <FormControl><Input placeholder="Rua, Avenida..." {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="numero" render={({ field }) => (
                  <FormItem><FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Numero</FormLabel>
                    <FormControl><Input placeholder="123" {...field} className="field-engraved" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="complemento" render={({ field }) => (
                  <FormItem><FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Complemento</FormLabel>
                    <FormControl><Input placeholder="Sala..." {...field} className="field-engraved" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem><FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Bairro</FormLabel>
                    <FormControl><Input placeholder="Bairro" {...field} className="field-engraved" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem><FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Cidade</FormLabel>
                    <FormControl><Input placeholder="Sao Paulo" {...field} className="field-engraved" /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="estado" render={({ field }) => (
                  <FormItem><FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Estado (UF)</FormLabel>
                    <FormControl><Input placeholder="SP" maxLength={2} {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="field-engraved" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="zona" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">
                      Zona / Região
                      <span className="ml-2 normal-case font-normal text-muted-foreground/60">— agrupa o painel de vínculos</span>
                    </FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0">
                            <SelectValue placeholder="Selecione ou deixe vazio" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">— Sem zona definida —</SelectItem>
                          <SelectItem value="Centro / Higienópolis">🏙 Centro / Higienópolis</SelectItem>
                          <SelectItem value="Zona Leste">🌅 Zona Leste</SelectItem>
                          <SelectItem value="Zona Oeste / Pinheiros">🌳 Zona Oeste / Pinheiros</SelectItem>
                          <SelectItem value="Zona Sul / Moema">🏡 Zona Sul / Moema</SelectItem>
                          <SelectItem value="Zona Norte">🌄 Zona Norte</SelectItem>
                          <SelectItem value="Grande ABC / ABCD">🏭 Grande ABC / ABCD</SelectItem>
                          <SelectItem value="Domiciliar">🏠 Domiciliar</SelectItem>
                          <SelectItem value="Centro (DF)">🏛 Centro (DF)</SelectItem>
                          <SelectItem value="Plano Piloto">🏛 Plano Piloto</SelectItem>
                          <SelectItem value="Sul (DF)">🌿 Sul (DF)</SelectItem>
                          <SelectItem value="Centro (RJ)">🏖 Centro (RJ)</SelectItem>
                          <SelectItem value="Zona Sul (RJ)">🌊 Zona Sul (RJ)</SelectItem>
                          <SelectItem value="Belo Horizonte Centro">⛏ BH Centro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                      Este campo organiza automaticamente a lista de vínculos do Corpo Clínico por região geográfica.
                    </p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="color" render={({ field }) => (
                  <FormItem><FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Cor</FormLabel>
                    <FormControl><Input type="color" {...field} className="field-engraved h-10 p-1" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="active" render={({ field }) => (
                  <FormItem><FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Status</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={(v) => field.onChange(v === "true")} value={field.value ? "true" : "false"}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="true">Ativa</SelectItem>
                          <SelectItem value="false">Inativa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="googleCalendarId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">ID da Agenda Google (opcional)</FormLabel>
                  <FormControl><Input placeholder="...@group.calendar.google.com" {...field} className="field-engraved" /></FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" className="btn-3d-soft" onClick={() => setDialogOpen(false)}>CANCELAR</Button>
                <Button type="submit" className="btn-3d px-6" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  SALVAR
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog apagar (confirmacao textual) */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide text-destructive">APAGAR CLINICA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta acao e irreversivel. Para confirmar, digite o nome exato da clinica:
            </p>
            <p className="text-sm font-bold">{deleteTarget?.name}</p>
            <Input className="field-engraved" placeholder="Digite o nome da clinica"
              value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
            <DialogFooter>
              <Button type="button" className="btn-3d-soft" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>CANCELAR</Button>
              <Button type="button" variant="destructive" className="btn-3d"
                disabled={deleteConfirmText !== deleteTarget?.name || deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                APAGAR
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
