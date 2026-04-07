import { useState } from "react";
import { Link } from "wouter";
import { useListClients } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, User, Phone, Mail, Activity } from "lucide-react";
import { formatStatus, getStatusColor } from "@/lib/status";

export default function Clients() {
  const [search, setSearch] = useState("");
  const { data: clients, isLoading } = useListClients({ search });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Gerencie os pacientes da clínica e seus protocolos.</p>
        </div>
        <Link href="/clients/new">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Novo Cliente
          </Button>
        </Link>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome ou CPF..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : clients?.length === 0 ? (
        <div className="text-center py-20 border border-dashed rounded-lg bg-card text-card-foreground">
          <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <h3 className="text-lg font-medium">Nenhum cliente encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Tente buscar com outros termos." : "Comece adicionando seu primeiro cliente."}
          </p>
          {!search && (
            <Link href="/clients/new">
              <Button variant="outline" className="mt-4">Adicionar Cliente</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients?.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="hover-elevate cursor-pointer transition-colors hover:bg-muted/50 h-full flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg line-clamp-1">{client.name}</CardTitle>
                      <CardDescription>{client.cpf}</CardDescription>
                    </div>
                    <Badge variant="outline" className={getStatusColor(client.status)}>
                      {formatStatus(client.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end space-y-3">
                  <div className="text-sm space-y-2 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{client.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" />
                      <span className="line-clamp-1">{client.email}</span>
                    </div>
                  </div>
                  
                  {/* Mock data for now since client schema doesn't have activeProtocolCount */}
                  <div className="pt-3 border-t mt-3 flex items-center justify-between text-xs font-medium">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      Protocolos
                    </span>
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      Visualizar
                    </span>
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
