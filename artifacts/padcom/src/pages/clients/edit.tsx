import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetClient, useUpdateClient, getGetClientQueryKey, getListClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, Search, User, MapPin, Plus, Building2 } from "lucide-react";
import { ClientPhotoCard } from "@/components/clients/photo-card";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useCallback, useEffect } from "react";

const formSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  cpf: z.string().min(11, "CPF invalido"),
  email: z.string().email("Email invalido"),
  phone: z.string().min(10, "Telefone invalido"),
  birthDate: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  pais: z.string().optional(),
  instagram: z.string().optional(),
  comoConheceu: z.string().optional(),
  status: z.enum(["active", "inactive", "pending"]),
  locationId: z.string().optional(),
  notes: z.string().optional(),
});

interface LocationOption {
  id: number;
  name: string;
  active: boolean;
}

type FormValues = z.infer<typeof formSchema>;

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCEP(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function parseAddressToFields(address: string | null | undefined): { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string } {
  const result = { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" };
  if (!address) return result;

  const cepMatch = address.match(/CEP\s*([\d\-\.]+)/i) || address.match(/(\d{5}[\-]?\d{3})/);
  if (cepMatch) result.cep = cepMatch[1].replace(/\./g, "");

  const clean = address.replace(/,?\s*CEP\s*[\d\-\.]+/i, "").trim();
  const parts = clean.split(",").map(p => p.trim()).filter(Boolean);

  if (parts.length >= 1) result.logradouro = parts[0];
  if (parts.length >= 2) result.numero = parts[1];
  if (parts.length >= 3) result.complemento = "";
  if (parts.length >= 3) result.bairro = parts[2];
  if (parts.length >= 4) {
    const cidadeEstado = parts[3];
    const ceMatch = cidadeEstado.match(/^(.+?)\s*-\s*(\w{2})$/);
    if (ceMatch) {
      result.cidade = ceMatch[1].trim();
      result.estado = ceMatch[2].trim();
    } else {
      result.cidade = cidadeEstado;
    }
  }

  return result;
}

export default function EditClient() {
  const [, params] = useRoute("/clients/:id/edit");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  const queryClient = useQueryClient();
  const { data: client, isLoading } = useGetClient(id, { query: { enabled: !!id, queryKey: getGetClientQueryKey(id) } });
  const updateClient = useUpdateClient();
  const [loadingCep, setLoadingCep] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      cpf: "",
      email: "",
      phone: "",
      birthDate: "",
      cep: "",
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
      cidade: "",
      estado: "",
      pais: "BRASIL",
      instagram: "",
      comoConheceu: "",
      status: "active",
      locationId: "",
      notes: "",
    },
  });

  const apiBaseLoc = import.meta.env.VITE_API_URL || "/api";
  const { data: locations } = useQuery<LocationOption[]>({
    queryKey: ["locations"],
    queryFn: async () => (await fetch(`${apiBaseLoc}/locations`)).json(),
  });

  useEffect(() => {
    if (client) {
      const addrFields = parseAddressToFields(client.address);
      form.reset({
        name: client.name,
        cpf: client.cpf,
        email: client.email,
        phone: client.phone,
        birthDate: client.birthDate || "",
        cep: addrFields.cep,
        logradouro: addrFields.logradouro,
        numero: addrFields.numero,
        complemento: addrFields.complemento,
        bairro: addrFields.bairro,
        cidade: addrFields.cidade,
        estado: addrFields.estado,
        pais: (client as any).pais || "BRASIL",
        instagram: (client as any).instagram || "",
        comoConheceu: (client as any).comoConheceu || "",
        status: (client.status as "active" | "inactive" | "pending") || "active",
        locationId: (client as any).locationId != null ? String((client as any).locationId) : "8",
        notes: client.notes || "",
      });
    }
  }, [client, form]);

  const apiBase = import.meta.env.VITE_API_URL || "/api";

  const lookupCep = useCallback(async () => {
    const cep = form.getValues("cep")?.replace(/\D/g, "");
    if (!cep || cep.length !== 8) {
      toast.error("CEP deve ter 8 digitos");
      return;
    }
    setLoadingCep(true);
    try {
      const res = await fetch(`${apiBase}/cep/${cep}`);
      if (!res.ok) {
        toast.error("CEP nao encontrado");
        return;
      }
      const data = await res.json();
      form.setValue("logradouro", data.logradouro || "");
      form.setValue("bairro", data.bairro || "");
      form.setValue("cidade", data.localidade || "");
      form.setValue("estado", data.uf || "");
      if (data.complemento) form.setValue("complemento", data.complemento);
      toast.success("Endereco atualizado!");
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  }, [form, apiBase]);

  const onSubmit = (values: FormValues) => {
    const addressParts = [
      values.logradouro,
      values.numero,
      values.complemento,
      values.bairro,
      values.cidade ? `${values.cidade} - ${values.estado || ""}` : values.estado,
      values.cep ? `CEP ${values.cep}` : "",
    ].filter(Boolean);
    const address = addressParts.join(", ");

    updateClient.mutate(
      { id, data: {
        name: values.name,
        cpf: values.cpf,
        email: values.email,
        phone: values.phone,
        birthDate: values.birthDate || undefined,
        address: address || undefined,
        pais: values.pais || "BRASIL",
        instagram: values.instagram || undefined,
        comoConheceu: values.comoConheceu || undefined,
        status: values.status,
        locationId: values.locationId ? Number(values.locationId) : undefined,
        notes: values.notes || undefined,
      }},
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
          toast.success("Cliente atualizado com sucesso!");
          setLocation(`/clients/${id}`);
        },
        onError: () => {
          toast.error("Erro ao atualizar cliente.");
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-64 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!client) return <div className="p-8 text-center font-bold uppercase tracking-widest text-muted-foreground">Cliente nao encontrado.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation(`/clients/${id}`)} className="btn-3d-soft rounded-[4px]">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">EDITAR CLIENTE</h1>
          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-1">{client.name}</p>
        </div>
      </div>

      <Card className="panel-3d border-none">
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="panel-3d-sub p-5 space-y-6 relative overflow-visible">
                <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
                  <User className="h-3 w-3 text-primary" /> Informações Pessoais
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Nome Completo *</FormLabel>
                        <FormControl>
                          <Input {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="cpf"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">CPF *</FormLabel>
                        <FormControl>
                          <Input
                            className="field-engraved"
                            value={field.value}
                            onChange={(e) => field.onChange(formatCPF(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Email *</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Celular *</FormLabel>
                        <FormControl>
                          <Input
                            className="field-engraved"
                            value={field.value}
                            onChange={(e) => field.onChange(formatPhone(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="birthDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Data de Nascimento</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Status *</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Ativo</SelectItem>
                              <SelectItem value="inactive">Inativo</SelectItem>
                              <SelectItem value="pending">Pendente</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="locationId"
                    render={({ field }) => {
                      const list = (locations ?? []).filter(
                        (l) => l.active || String(l.id) === field.value,
                      );
                      return (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground flex items-center gap-1.5">
                            <Building2 className="h-3 w-3 text-primary" /> Clínica de Origem
                          </FormLabel>
                          <div className="concave-3d p-1">
                            <Select onValueChange={(v) => { if (v) field.onChange(v); }} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0">
                                  <SelectValue placeholder="Selecione a clínica..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {list.map((l) => (
                                  <SelectItem key={l.id} value={String(l.id)}>
                                    {l.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </div>

              <ClientPhotoCard
                clientId={id}
                photoUrl={(client as any).photoUrl}
                clientEmail={client.email}
                onUpdated={() => queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) })}
              />

              <div className="panel-3d-sub p-5 space-y-6 relative overflow-visible">
                <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
                  <MapPin className="h-3 w-3 text-primary" /> Endereço
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <FormField
                    control={form.control}
                    name="cep"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">CEP</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder="00000-000"
                              className="field-engraved"
                              value={field.value}
                              onChange={(e) => {
                                const formatted = formatCEP(e.target.value);
                                field.onChange(formatted);
                                if (formatted.replace(/\D/g, "").length === 8) {
                                  setTimeout(() => lookupCep(), 100);
                                }
                              }}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            size="icon"
                            onClick={lookupCep}
                            disabled={loadingCep}
                            className="btn-3d-soft shrink-0"
                          >
                            {loadingCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="logradouro"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Logradouro</FormLabel>
                        <FormControl>
                          <Input placeholder="Rua, Avenida..." {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <FormField
                    control={form.control}
                    name="numero"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Numero</FormLabel>
                        <FormControl>
                          <Input placeholder="123" {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="complemento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Complemento</FormLabel>
                        <FormControl>
                          <Input placeholder="Apto, Sala..." {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bairro"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Bairro</FormLabel>
                        <FormControl>
                          <Input placeholder="Bairro" {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cidade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Cidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Sao Paulo" {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <FormField
                    control={form.control}
                    name="estado"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Estado</FormLabel>
                        <FormControl>
                          <Input placeholder="SP" {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pais"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Pais</FormLabel>
                        <FormControl>
                          <Input placeholder="BRASIL" {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="panel-3d-sub p-5 space-y-6 relative overflow-visible">
                <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
                  <Plus className="h-3 w-3 text-primary" /> Adicionais e Notas
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <FormField
                    control={form.control}
                    name="instagram"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Instagram</FormLabel>
                        <FormControl>
                          <Input placeholder="@usuario" {...field} className="field-engraved" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="comoConheceu"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Como nos Conheceu ?</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="INDICACAO">Indicacao</SelectItem>
                              <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                              <SelectItem value="GOOGLE">Google</SelectItem>
                              <SelectItem value="FACEBOOK">Facebook</SelectItem>
                              <SelectItem value="FORM">Formulario</SelectItem>
                              <SelectItem value="OUTROS">Outros</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Observacoes Clinicas</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Alergias, condicoes pre-existentes, etc." 
                          className="min-h-[100px] field-engraved"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" className="btn-3d-soft" onClick={() => setLocation(`/clients/${id}`)}>
                  CANCELAR
                </Button>
                <Button type="submit" className="btn-3d px-8" disabled={updateClient.isPending}>
                  {updateClient.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  SALVAR ALTERACOES
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
