import { Link } from "wouter";
import { format } from "date-fns";
import { useGetClient } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Pencil, FileText, FolderOpen, Phone, Mail, Calendar, MapPin, Home, User } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import ClientServiceAddresses from "@/components/ClientServiceAddresses";

const API = import.meta.env.VITE_API_URL || "/api";

interface Props { clientId: number; }

export default function CadastroPanel({ clientId }: Props) {
  const { toast } = useToast();
  const { data: client, isLoading } = useGetClient(clientId, {
    query: { enabled: !!clientId },
  });

  const driveSetup = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/google-drive/setup-client/${clientId}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => toast({ title: "Drive configurado!" }),
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-64 panel-3d-sub" />;
  if (!client) return null;

  return (
    <div className="space-y-6">
      {/* Ações rápidas */}
      <div className="panel-3d border-none p-5">
        <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 mb-4">
          <User className="h-3 w-3 text-primary" /> Ações Rápidas
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/clients/${client.id}/edit`}>
            <Button className="btn-3d-soft"><Pencil className="w-4 h-4 mr-2" /> EDITAR CADASTRO</Button>
          </Link>
          <Link href={`/clients/${client.id}/prontuario`}>
            <Button className="btn-3d-soft"><FileText className="w-4 h-4 mr-2" /> PRONTUÁRIO</Button>
          </Link>
          <Button
            className="btn-3d-soft"
            onClick={() => driveSetup.mutate()}
            disabled={driveSetup.isPending}
          >
            {driveSetup.isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <FolderOpen className="w-4 h-4 mr-2" />}
            CONFIGURAR DRIVE
          </Button>
        </div>
      </div>

      {/* Info pessoal + locais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="panel-3d border-none relative overflow-visible">
          <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 absolute -top-3 left-4">
            <Phone className="h-3 w-3 text-primary" /> Contato
          </div>
          <CardContent className="pt-8 space-y-4">
            {[
              { icon: Phone,    label: "Celular",     value: client.phone },
              { icon: Mail,     label: "E-mail",      value: client.email },
              { icon: Calendar, label: "Nascimento",  value: client.birthDate ? format(new Date(client.birthDate), "dd/MM/yyyy") : null },
            ].map(row => row.value ? (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <row.icon className="w-3 h-3 text-primary" /> {row.label}
                </span>
                <span className="font-bold text-sm text-right truncate max-w-[180px]">{row.value}</span>
              </div>
            ) : null)}
            {client.address && (
              <div className="pt-3 border-t">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                  <MapPin className="w-3 h-3 text-primary" /> Endereço
                </span>
                <p className="text-xs font-semibold leading-relaxed text-foreground/80 concave-3d p-2">
                  {client.address}
                </p>
              </div>
            )}
            {client.notes && (
              <div className="pt-3 border-t">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                  <FileText className="w-3 h-3 text-primary" /> Observações Clínicas
                </span>
                <div className="concave-3d p-3 text-xs font-medium leading-relaxed whitespace-pre-wrap">
                  {client.notes}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel-3d border-none relative overflow-visible">
          <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 absolute -top-3 left-4">
            <Home className="h-3 w-3 text-primary" /> Locais de Atendimento
          </div>
          <CardContent className="pt-8">
            <ClientServiceAddresses clientId={clientId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
