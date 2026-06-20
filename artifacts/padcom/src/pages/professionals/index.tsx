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
          <h1 className="text-3xl font-black tracking-tight uppercase">Profissionais</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            Equipe responsável pelos protocolos injetáveis.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="btn-3d">
              <Plus className="h-4 w-4 mr-2" />
              NOVO PROFISSIONAL
            </Button>
          </DialogTrigger>
          <DialogContent className="panel-3d">
            <DialogHeader>
              <DialogTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Cadastrar Profissional
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" className="field-engraved" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CRM / COREN</Label>
                  <Input value={crm} onChange={e => setCrm(e.target.value)} placeholder="CRM/SP 123456" className="field-engraved" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Especialidade</Label>
                  <Input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Medicina Estética" className="field-engraved" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Telefone</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="field-engraved" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@clinica.com.br" className="field-engraved" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidade</Label>
                <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Clínica Principal" className="field-engraved" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button className="btn-3d-soft" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button className="btn-3d" onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Cadastrando..." : "Cadastrar"}
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
          {professionals.map(pro => (
            <Card key={pro.id} className="panel-3d-sub neon-hover transition-all">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 bevel-3d w-10 h-10 flex items-center justify-center">
                    <Stethoscope className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black uppercase tracking-tight text-foreground leading-tight">{pro.name}</p>
                    {pro.specialty && (
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mt-0.5">{pro.specialty}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {pro.crm && (
                        <span className="concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                          {pro.crm}
                        </span>
                      )}
                      {pro.unit && (
                        <span className="concave-3d px-2 py-0.5 text-[9px] font-bold text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {pro.unit}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 mt-2">
                      {pro.phone && (
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                          <Phone className="h-3 w-3 text-primary" />
                          {pro.phone}
                        </div>
                      )}
                      {pro.email && (
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                          <Mail className="h-3 w-3 text-primary" />
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
