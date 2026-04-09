import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateClient, getListClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useCallback } from "react";

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
  notes: z.string().optional(),
});

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

export default function NewClient() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createClient = useCreateClient();
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
      notes: "",
    },
  });

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
      toast.success("Endereco preenchido automaticamente!");
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

    createClient.mutate(
      { data: {
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
        notes: values.notes || undefined,
      }},
      {
        onSuccess: (client) => {
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
          toast.success("Cliente cadastrado com sucesso!");
          setLocation(`/clients/${client.id}`);
        },
        onError: () => {
          toast.error("Erro ao cadastrar cliente.");
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation("/clients")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NOVO CLIENTE</h1>
          <p className="text-muted-foreground">Cadastre um novo cliente no sistema.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="uppercase tracking-wider text-sm">Informacoes Pessoais</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase tracking-wider text-xs">Nome Completo *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Joao da Silva" {...field} />
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
                      <FormLabel className="uppercase tracking-wider text-xs">CPF *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="000.000.000-00"
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
                      <FormLabel className="uppercase tracking-wider text-xs">Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="joao@exemplo.com" {...field} />
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
                      <FormLabel className="uppercase tracking-wider text-xs">Celular *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(00) 00000-0000"
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
                      <FormLabel className="uppercase tracking-wider text-xs">Data de Nascimento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
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
                      <FormLabel className="uppercase tracking-wider text-xs">Status *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                          <SelectItem value="pending">Pendente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Endereco</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="cep"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-wider text-xs">CEP</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder="00000-000"
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
                            variant="outline"
                            size="icon"
                            onClick={lookupCep}
                            disabled={loadingCep}
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
                        <FormLabel className="uppercase tracking-wider text-xs">Logradouro</FormLabel>
                        <FormControl>
                          <Input placeholder="Rua, Avenida..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <FormField
                    control={form.control}
                    name="numero"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-wider text-xs">Numero</FormLabel>
                        <FormControl>
                          <Input placeholder="123" {...field} />
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
                        <FormLabel className="uppercase tracking-wider text-xs">Complemento</FormLabel>
                        <FormControl>
                          <Input placeholder="Apto, Sala..." {...field} />
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
                        <FormLabel className="uppercase tracking-wider text-xs">Bairro</FormLabel>
                        <FormControl>
                          <Input placeholder="Bairro" {...field} />
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
                        <FormLabel className="uppercase tracking-wider text-xs">Cidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Sao Paulo" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <FormField
                    control={form.control}
                    name="estado"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-wider text-xs">Estado</FormLabel>
                        <FormControl>
                          <Input placeholder="SP" {...field} />
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
                        <FormLabel className="uppercase tracking-wider text-xs">Pais</FormLabel>
                        <FormControl>
                          <Input placeholder="BRASIL" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider mb-4">Informacoes Adicionais</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="instagram"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="uppercase tracking-wider text-xs">Instagram</FormLabel>
                        <FormControl>
                          <Input placeholder="@usuario" {...field} />
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
                        <FormLabel className="uppercase tracking-wider text-xs">Como nos Conheceu ?</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-wider text-xs">Observacoes Clinicas</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Alergias, condicoes pre-existentes, etc." 
                        className="min-h-[100px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setLocation("/clients")}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createClient.isPending}>
                  {createClient.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  SALVAR CLIENTE
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
