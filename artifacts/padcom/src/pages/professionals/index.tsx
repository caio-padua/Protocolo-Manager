import { useListProfessionals, useCreateProfessional } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { User, Plus, Phone, Mail, Stethoscope, Building2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Professionals() {
  const { data: professionals, isLoading, refetch } = useListProfessionals();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [crm, setCrm] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [unit, setUnit] = useState("");

  const createMutation = useCreateProfessional({
    mutation: {
      onSuccess: () => {
        toast({ title: "Profissional cadastrado!" });
        setOpen(false);
        setName(""); setCrm(""); setSpecialty(""); setPhone(""); setEmail(""); setUnit("");
        refetch();
      },
      onError: () => {
        toast({ title: "Erro ao cadastrar profissional", variant: "destructive" });
      }
    }
  });

  const handleCreate = () => {
    if (!name) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        name,
        crm: crm || null,
        specialty: specialty || null,
        phone: phone || null,
        email: email || null,
        unit: unit || null,
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profissionais</h1>
          <p className="text-muted-foreground">Equipe responsável pelos protocolos injetáveis.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Profissional
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Profissional</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CRM / COREN</Label>
                  <Input value={crm} onChange={e => setCrm(e.target.value)} placeholder="CRM/SP 123456" />
                </div>
                <div className="space-y-2">
                  <Label>Especialidade</Label>
                  <Input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Medicina Estética" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@clinica.com.br" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Clínica Principal" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Cadastrando..." : "Cadastrar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : !professionals?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum profissional cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {professionals.map(pro => (
            <Card key={pro.id}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Stethoscope className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold leading-tight">{pro.name}</p>
                    {pro.specialty && (
                      <p className="text-sm text-muted-foreground mt-0.5">{pro.specialty}</p>
                    )}
                    <div className="space-y-1 mt-3">
                      {pro.crm && (
                        <p className="text-xs text-muted-foreground font-medium">{pro.crm}</p>
                      )}
                      {pro.unit && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {pro.unit}
                        </div>
                      )}
                      {pro.phone && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {pro.phone}
                        </div>
                      )}
                      {pro.email && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{pro.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
