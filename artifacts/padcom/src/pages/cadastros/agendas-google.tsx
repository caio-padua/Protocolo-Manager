import { useState } from "react";
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
import { CalendarDays, Plus, Loader2, Save, Pencil, Trash2, Link2, Link2Off, Unlock, Download, MapPin, CloudOff } from "lucide-react";
import { toast } from "sonner";

const apiBase = import.meta.env.VITE_API_URL || "/api";

interface AgendaCal {
  id: number;
  googleCalendarId: string;
  name: string;
  kind: string;
  locationId: number | null;
  managedBySystem: boolean;
  color: string;
  active: boolean;
  status: "synced" | "orphan_db" | "unknown";
  googleSummary: string | null;
  primary: boolean;
}
interface GoogleOnly {
  googleCalendarId: string;
  name: string;
  primary: boolean;
  accessRole: string | null;
}
interface AgendasResponse {
  connected: boolean;
  calendars: AgendaCal[];
  googleOnly: GoogleOnly[];
}
interface Clinica { id: number; name: string }

const KIND_LABEL: Record<string, string> = {
  geral: "Geral", medico: "Médico", enfermagem: "Enfermagem", outro: "Outro",
};

const formSchema = z.object({
  name: z.string().min(2, "Nome obrigatorio"),
  kind: z.string(),
  locationId: z.string().optional(),
  color: z.string().optional(),
  share: z.string().optional(),
  active: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = { name: "", kind: "geral", locationId: "none", color: "#16284a", share: "", active: true };

const importSchema = z.object({ googleCalendarId: z.string().min(1), kind: z.string(), locationId: z.string().optional() });
type ImportValues = z.infer<typeof importSchema>;

function shortId(gid: string): string {
  return gid.includes("@group.calendar.google.com") ? gid.split("@")[0].slice(0, 12) + "…" : gid;
}

export default function CadastroAgendasGoogle() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgendaCal | null>(null);
  const [deleteMode, setDeleteMode] = useState<"delete" | "unlink">("delete");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data, isLoading } = useQuery<AgendasResponse>({
    queryKey: ["agenda-calendars"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/agenda-calendars`);
      if (!res.ok) throw new Error("Erro ao carregar agendas");
      return res.json();
    },
  });
  const { data: clinicas = [] } = useQuery<Clinica[]>({
    queryKey: ["clinicas"],
    queryFn: async () => (await fetch(`${apiBase}/locations`)).json(),
  });

  const calendars = data?.calendars ?? [];
  const googleOnly = data?.googleOnly ?? [];
  const connected = data?.connected ?? false;
  const clinicaName = (id: number | null) => clinicas.find((c) => c.id === id)?.name ?? null;

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const importForm = useForm<ImportValues>({ resolver: zodResolver(importSchema), defaultValues: { googleCalendarId: "", kind: "outro", locationId: "none" } });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = {
        name: values.name,
        kind: values.kind,
        locationId: values.locationId && values.locationId !== "none" ? Number(values.locationId) : null,
        color: values.color,
        active: values.active,
        ...(editingId ? {} : { share: values.share || undefined }),
      };
      const url = editingId ? `${apiBase}/agenda-calendars/${editingId}` : `${apiBase}/agenda-calendars`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao salvar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-calendars"] });
      toast.success(editingId ? "Agenda atualizada!" : "Agenda criada no Google!");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMutation = useMutation({
    mutationFn: async (values: ImportValues) => {
      const res = await fetch(`${apiBase}/agenda-calendars/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleCalendarId: values.googleCalendarId,
          kind: values.kind,
          locationId: values.locationId && values.locationId !== "none" ? Number(values.locationId) : null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao importar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-calendars"] });
      toast.success("Agenda importada!");
      setImportOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ cal, mode }: { cal: AgendaCal; mode: "delete" | "unlink" }) => {
      const qs = mode === "unlink" ? "?keepGoogle=1" : "";
      const res = await fetch(`${apiBase}/agenda-calendars/${cal.id}${qs}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao apagar");
      }
      return res.json();
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["agenda-calendars"] });
      toast.success(r.deletedGoogle ? "Agenda apagada do Google e do sistema." : "Vínculo removido (agenda mantida no Google).");
      setDeleteTarget(null);
      setDeleteConfirmText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // "Liberar gestão": ação consciente que assume o controle de uma agenda importada,
  // habilitando o apagar de verdade (no Google) a partir daí.
  const releaseMutation = useMutation({
    mutationFn: async (cal: AgendaCal) => {
      const res = await fetch(`${apiBase}/agenda-calendars/${cal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managedBySystem: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao liberar gestão");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-calendars"] });
      toast.success("Gestão liberada. Agora a agenda pode ser apagada do Google.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDelete = (c: AgendaCal, mode: "delete" | "unlink") => {
    setDeleteTarget(c);
    setDeleteMode(mode);
    setDeleteConfirmText("");
  };

  const openNew = () => { setEditingId(null); form.reset(EMPTY); setDialogOpen(true); };
  const openEdit = (c: AgendaCal) => {
    setEditingId(c.id);
    form.reset({
      name: c.name, kind: c.kind, locationId: c.locationId ? String(c.locationId) : "none",
      color: c.color || "#16284a", share: "", active: c.active,
    });
    setDialogOpen(true);
  };
  const openImport = (gid?: string) => {
    importForm.reset({ googleCalendarId: gid || "", kind: "outro", locationId: "none" });
    setImportOpen(true);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bevel-3d p-2.5 shrink-0"><CalendarDays className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight uppercase truncate">AGENDAS GOOGLE</h1>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-1">
              Calendários da conta da clínica
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => openImport()} variant="outline" className="btn-3d-soft" disabled={!connected}>
            <Download className="w-4 h-4 mr-2" /> IMPORTAR
          </Button>
          <Button onClick={openNew} className="btn-3d px-5" disabled={!connected}>
            <Plus className="w-4 h-4 mr-2" /> NOVA AGENDA
          </Button>
        </div>
      </div>

      {!connected && !isLoading && (
        <Card className="panel-3d border-none">
          <CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
            <CloudOff className="w-5 h-5 text-destructive shrink-0" />
            Conta Google não conectada. As agendas não podem ser lidas nem criadas agora.
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calendars.map((c) => (
              <Card key={c.id} className="panel-3d border-none relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: c.color || "#16284a" }} />
                <CardContent className="p-4 pl-5 space-y-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <span>#{c.id}</span>
                    <span className={`px-1.5 py-0.5 rounded-[3px] ${c.status === "synced" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                      {c.status === "synced" ? "SINCRONIZADA" : c.status === "orphan_db" ? "SUMIU DO GOOGLE" : "?"}
                    </span>
                    <span className="ml-auto">{KIND_LABEL[c.kind] ?? c.kind}</span>
                  </div>
                  <h3 className="font-bold text-base truncate" title={c.name}>{c.name}</h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate" title={c.googleCalendarId}>{shortId(c.googleCalendarId)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{clinicaName(c.locationId) || "Sem clínica vinculada"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                      <span className={c.managedBySystem ? "text-primary" : "text-muted-foreground"}>
                        {c.managedBySystem ? "GERIDA PELO SISTEMA" : "IMPORTADA"}
                      </span>
                      {!c.active && <span className="text-muted-foreground">· INATIVA</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="btn-3d-soft flex-1" onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> EDITAR
                    </Button>
                    {c.managedBySystem ? (
                      <Button size="sm" variant="outline" className="btn-3d-soft" title="Apagar do Google e do sistema" onClick={() => openDelete(c, "delete")}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="btn-3d-soft" title="Liberar gestão (assumir controle para poder apagar)" onClick={() => releaseMutation.mutate(c)} disabled={releaseMutation.isPending}>
                          <Unlock className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="btn-3d-soft" title="Remover vínculo (mantém a agenda no Google)" onClick={() => openDelete(c, "unlink")}>
                          <Link2Off className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {calendars.length === 0 && connected && (
              <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
                Nenhuma agenda registrada. Clique em NOVA AGENDA ou IMPORTAR uma existente.
              </div>
            )}
          </div>

          {googleOnly.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Agendas na conta Google ainda não registradas ({googleOnly.length})
              </p>
              <Card className="panel-3d border-none">
                <CardContent className="p-3 space-y-2">
                  {googleOnly.map((g) => (
                    <div key={g.googleCalendarId} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
                      <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1" title={g.googleCalendarId}>{g.name}</span>
                      {g.primary && <span className="text-[10px] font-bold uppercase text-muted-foreground">PRIMÁRIA</span>}
                      <Button size="sm" variant="outline" className="btn-3d-soft shrink-0" onClick={() => openImport(g.googleCalendarId)}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> REGISTRAR
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">{editingId ? "EDITAR AGENDA" : "NOVA AGENDA"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-5">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Nome *</FormLabel>
                  <FormControl><Input placeholder="Ex: AGENDA ENFERMAGEM TATUAPE" {...field} className="field-engraved" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="kind" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Tipo</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="geral">Geral</SelectItem>
                          <SelectItem value="medico">Médico</SelectItem>
                          <SelectItem value="enfermagem">Enfermagem</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="locationId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Clínica vinculada</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue placeholder="Nenhuma" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {clinicas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {!editingId && (
                <FormField control={form.control} name="share" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Compartilhar com e-mail (opcional)</FormLabel>
                    <FormControl><Input placeholder="pessoa@gmail.com" {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
              )}
              <DialogFooter>
                <Button type="button" className="btn-3d-soft" onClick={() => setDialogOpen(false)}>CANCELAR</Button>
                <Button type="submit" className="btn-3d px-6" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {editingId ? "SALVAR" : "CRIAR NO GOOGLE"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog importar */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">IMPORTAR AGENDA EXISTENTE</DialogTitle>
          </DialogHeader>
          <Form {...importForm}>
            <form onSubmit={importForm.handleSubmit((v) => importMutation.mutate(v))} className="space-y-5">
              <FormField control={importForm.control} name="googleCalendarId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Agenda Google</FormLabel>
                  <div className="concave-3d p-1">
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue placeholder="Escolha uma agenda" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {googleOnly.map((g) => <SelectItem key={g.googleCalendarId} value={g.googleCalendarId}>{g.name}{g.primary ? " (primária)" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={importForm.control} name="kind" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Tipo</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="geral">Geral</SelectItem>
                          <SelectItem value="medico">Médico</SelectItem>
                          <SelectItem value="enfermagem">Enfermagem</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
                <FormField control={importForm.control} name="locationId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Clínica vinculada</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue placeholder="Nenhuma" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {clinicas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" className="btn-3d-soft" onClick={() => setImportOpen(false)}>CANCELAR</Button>
                <Button type="submit" className="btn-3d px-6" disabled={importMutation.isPending}>
                  {importMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  REGISTRAR
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog apagar */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide text-destructive">
              {deleteMode === "delete" ? "APAGAR AGENDA" : "REMOVER VÍNCULO"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {deleteMode === "delete"
                ? "Apagar de verdade: o calendário será removido do Google (todos os eventos dentro dela são perdidos) e o registro aqui também."
                : "Remover vínculo: aqui só apagamos o registro no sistema; o calendário continua intacto no Google."}
            </p>
            <p className="text-sm">Para confirmar, digite o nome exato da agenda:</p>
            <p className="text-sm font-bold">{deleteTarget?.name}</p>
            <Input className="field-engraved" placeholder="Digite o nome da agenda"
              value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
            <DialogFooter>
              <Button type="button" className="btn-3d-soft" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>CANCELAR</Button>
              <Button type="button" variant="destructive" className="btn-3d"
                disabled={deleteConfirmText !== deleteTarget?.name || deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate({ cal: deleteTarget, mode: deleteMode })}>
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : deleteMode === "delete" ? <Trash2 className="w-4 h-4 mr-2" /> : <Link2Off className="w-4 h-4 mr-2" />}
                {deleteMode === "delete" ? "APAGAR DO GOOGLE" : "REMOVER VÍNCULO"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
