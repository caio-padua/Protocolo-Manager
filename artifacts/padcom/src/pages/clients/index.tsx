import { useState } from "react";
import { Link } from "wouter";
import { useListClients } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, User, Phone, Mail, Activity } from "lucide-react";
import { formatStatus, getStatusColor } from "@/lib/status";
import { tituloProprio } from "@/lib/utils";

const MAX_RENDER = 60;

export default function Clients() {
  const [search, setSearch] = useState("");
  const { data: clients, isLoading } = useListClients({ search });

  const total = clients?.length ?? 0;
  const visibleClients = clients?.slice(0, MAX_RENDER) ?? [];
  const hiddenCount = total - visibleClients.length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px] mt-1">Gerencie os pacientes da clínica e seus protocolos.</p>
        </div>
        <Link href="/clients/new">
          <Button className="btn-3d w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            NOVO CLIENTE
          </Button>
        </Link>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome ou CPF..."
            className="pl-8 field-engraved"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {!isLoading && total > 0 && (
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
          {hiddenCount > 0 ? (
            <>
              Mostrando os primeiros <span className="text-primary">{visibleClients.length}</span> de{" "}
              <span className="text-primary">{total.toLocaleString("pt-BR")}</span> clientes.
            </>
          ) : (
            <>
              <span className="text-primary">{total.toLocaleString("pt-BR")}</span>{" "}
              {total === 1 ? "cliente encontrado" : "clientes encontrados"}.
            </>
          )}
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg panel-3d-sub" />
          ))}
        </div>
      ) : clients?.length === 0 ? (
        <div className="text-center py-20 panel-3d bg-white/50">
          <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <h3 className="text-lg font-bold uppercase tracking-wide">Nenhum cliente encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Tente buscar com outros termos." : "Comece adicionando seu primeiro cliente."}
          </p>
          {!search && (
            <Link href="/clients/new">
              <Button className="btn-3d-soft mt-6">ADICIONAR CLIENTE</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visibleClients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="panel-3d hover:panel-3d-active neon-hover cursor-pointer transition-all duration-300 h-full flex flex-col border-none">
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold leading-none text-primary tracking-tight line-clamp-1">{tituloProprio(client.name)}</h3>
                      <div className="concave-3d inline-flex px-2 py-0.5 text-[10px] font-bold tabular-nums">
                        {client.cpf}
                      </div>
                    </div>
                    <Badge variant="outline" className={`rounded-[4px] border-none px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(client.status)}`}>
                      {formatStatus(client.status)}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <Phone className="w-3 h-3 text-primary" />
                      <span className="tabular-nums">{client.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <Mail className="w-3 h-3 text-primary" />
                      <span className="line-clamp-1 lowercase">{client.email}</span>
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground/70">
                      <Activity className="w-3 h-3" />
                      Prontuário
                    </div>
                    <div className="screen-3d px-3 py-1 text-[10px] font-bold text-primary uppercase tracking-wider">
                      Visualizar
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Users(props: any) {
  return <User {...props} />;
}
