import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateProtocol, useListClients, useListSubstances, useListProfessionals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProtocolItemInput {
  substanceId: number;
  dose: string;
  totalSessions: number;
  intervalDays: number;
  frequency: string;
}

export default function NewProtocol() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: clients } = useListClients();
  const { data: substances } = useListSubstances();
  const { data: professionals } = useListProfessionals();

  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [serviceType, setServiceType] = useState<"clinic" | "homecare">("clinic");
  const [professionalId, setProfessionalId] = useState("");
  const [unit, setUnit] = useState("Clínica Principal");
  const [totalValue, setTotalValue] = useState("");
  const [items, setItems] = useState<ProtocolItemInput[]>([
    { substanceId: 0, dose: "", totalSessions: 8, intervalDays: 7, frequency: "weekly" }
  ]);

  const createMutation = useCreateProtocol({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Protocolo criado!", description: "Redirecionando para o protocolo..." });
        setLocation(`/protocols/${data.id}`);
      },
      onError: () => {
        toast({ title: "Erro ao criar protocolo", variant: "destructive" });
      }
    }
  });

  const addItem = () => {
    setItems(prev => [...prev, { substanceId: 0, dose: "", totalSessions: 8, intervalDays: 7, frequency: "weekly" }]);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof ProtocolItemInput, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSubmit = () => {
    if (!clientId || !title || !startDate || items.some(i => !i.substanceId || !i.dose)) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        clientId: parseInt(clientId),
        title,
        status: "suggested",
        startDate,
        serviceType,
        professionalId: professionalId ? parseInt(professionalId) : null,
        unit: unit || null,
        totalValue: parseFloat(totalValue) || 0,
        notes: null,
        items: items.filter(i => i.substanceId > 0).map(i => ({
          substanceId: i.substanceId,
          dose: i.dose,
          totalSessions: i.totalSessions,
          intervalDays: i.intervalDays,
          frequency: i.frequency,
        })),
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/protocols")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold">Novo Protocolo</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Informações Gerais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clients?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name} — {c.cpf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Título do Protocolo *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Protocolo Anti-Aging Premium" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início *</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valor Total (R$)</Label>
              <Input type="number" value={totalValue} onChange={e => setTotalValue(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Atendimento</Label>
              <Select value={serviceType} onValueChange={(v: "clinic" | "homecare") => setServiceType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">Clínica</SelectItem>
                  <SelectItem value="homecare">Nurse Care Domiciliar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Clínica Principal" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Profissional Responsável</Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
              <SelectContent>
                {professionals?.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.crm ? ` — ${p.crm}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Substâncias</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Substância
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Substância {idx + 1}</span>
                {items.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label>Substância *</Label>
                <Select value={String(item.substanceId || "")} onValueChange={v => updateItem(idx, "substanceId", parseInt(v))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a substância" /></SelectTrigger>
                  <SelectContent>
                    {substances?.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Dose *</Label>
                  <Input value={item.dose} onChange={e => updateItem(idx, "dose", e.target.value)} placeholder="Ex: 600mg" />
                </div>
                <div className="space-y-2">
                  <Label>Total de Sessões</Label>
                  <Input type="number" value={item.totalSessions} onChange={e => updateItem(idx, "totalSessions", parseInt(e.target.value))} min={1} />
                </div>
                <div className="space-y-2">
                  <Label>Intervalo (dias)</Label>
                  <Input type="number" value={item.intervalDays} onChange={e => updateItem(idx, "intervalDays", parseInt(e.target.value))} min={1} />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setLocation("/protocols")}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Criando..." : "Criar Protocolo"}
        </Button>
      </div>
    </div>
  );
}
