import { useRoute, useLocation } from "wouter";
import { useGetProtocol, useValidateProtocol, useGenerateProtocolICS } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus, getStatusColor } from "@/lib/status";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Clock, Download, Home, Building2, User, Zap, Printer, Loader2, FileText, Activity, TrendingDown, Calendar } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ProtocolDetail() {
  const [, params] = useRoute("/protocols/:id");
  const [, setLocation] = useLocation();
  const id = params ? parseInt(params.id) : 0;
  const { toast } = useToast();
  const [physicalRasLoading, setPhysicalRasLoading] = useState(false);
  const [documentPdfLoading, setDocumentPdfLoading] = useState(false);

  const { data: protocol, isLoading, refetch } = useGetProtocol(id, {
    query: { enabled: !!id, queryKey: ["protocol", id] }
  });

  const validateMutation = useValidateProtocol({
    mutation: {
      onSuccess: () => {
        toast({ title: "Protocolo validado!", description: "Sessões geradas com consolidação semanal." });
        refetch();
      },
      onError: () => {
        toast({ title: "Erro ao validar protocolo", variant: "destructive" });
      }
    }
  });

  const icsMutation = useGenerateProtocolICS({
    mutation: {
      onSuccess: (data) => {
        const blob = new Blob([data.icsContent], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "ICS gerado!", description: `Arquivo ${data.filename} baixado.` });
      }
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!protocol) return <div className="p-8 text-muted-foreground">Protocolo não encontrado.</div>;

  const progressPct = protocol.totalSessions > 0
    ? (protocol.completedSessions / protocol.totalSessions) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" className="btn-3d-soft" onClick={() => setLocation("/protocols")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold uppercase tracking-tight">{protocol.title}</h1>
            <Badge className={`text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(protocol.status)}`}>
              {formatStatus(protocol.status)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm uppercase tracking-wide font-medium">{protocol.clientName} — <span className="tabular-nums">CPF: {protocol.clientCpf}</span></p>
        </div>
        <div className="flex gap-2">
          {(protocol.status === "suggested" || protocol.status === "validated") && (
            <Button className="btn-3d" onClick={() => validateMutation.mutate({ id })} disabled={validateMutation.isPending}>
              <Zap className="h-4 w-4 mr-1" />
              {validateMutation.isPending ? "Validando..." : "Validar e Gerar Sessões"}
            </Button>
          )}
          {protocol.sessions.length > 0 && (
            <>
              <Button className="btn-3d-soft" onClick={() => icsMutation.mutate({ id })} disabled={icsMutation.isPending}>
                <Download className="h-4 w-4 mr-1" />
                Baixar ICS
              </Button>
              <Button
                className="btn-3d-soft"
                disabled={physicalRasLoading}
                onClick={async () => {
                  setPhysicalRasLoading(true);
                  try {
                    const resp = await fetch(`${import.meta.env.BASE_URL}api/ras/physical/${id}`);
                    if (!resp.ok) {
                      const err = await resp.json().catch(() => null);
                      throw new Error(err?.details || "Erro ao gerar RAS FAP");
                    }
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    const cd = resp.headers.get("Content-Disposition");
                    const m = cd?.match(/filename="(.+)"/);
                    a.download = m?.[1] ?? `RAS_FAP_${id}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ title: "RAS FAP baixado!", description: "Documento para impressao e controle manual." });
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  } finally {
                    setPhysicalRasLoading(false);
                  }
                }}
              >
                {physicalRasLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
                {physicalRasLoading ? "Gerando..." : "RAS FAP (Imprimir)"}
              </Button>
              <Button
                className="btn-3d"
                disabled={documentPdfLoading}
                onClick={async () => {
                  setDocumentPdfLoading(true);
                  try {
                    const resp = await fetch(`${import.meta.env.BASE_URL}api/protocols/${id}/document-pdf`);
                    if (!resp.ok) {
                      const err = await resp.json().catch(() => null);
                      throw new Error(err?.details || "Erro ao gerar documento");
                    }
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    const cd = resp.headers.get("Content-Disposition");
                    const m = cd?.match(/filename="(.+)"/);
                    a.download = m?.[1] ?? `PROTOCOLO_${id}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ title: "Protocolo completo gerado!", description: "PDF com capa, beneficios, TCLE, cronograma e financeiro." });
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  } finally {
                    setDocumentPdfLoading(false);
                  }
                }}
              >
                {documentPdfLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                {documentPdfLoading ? "Gerando..." : "Protocolo Completo (PDF)"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="panel-3d-sub"><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Sessões</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums">{protocol.completedSessions}</span>
            <span className="text-muted-foreground text-sm">/</span>
            <span className="text-lg font-semibold text-muted-foreground tabular-nums">{protocol.totalSessions}</span>
          </div>
          <div className="mt-3 h-2 bg-muted/30 rounded-full shadow-inner overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, hsl(180 30% 28%) 0%, hsl(187 72% 48%) 100%)" }} />
          </div>
        </CardContent></Card>
        <Card className="panel-3d-sub"><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Valor Total</p>
          <div className="screen-3d px-3 py-1 mt-1 inline-block">
            <p className="text-xl font-bold tabular-nums">R$ {protocol.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </div>
        </CardContent></Card>
        <Card className="panel-3d-sub"><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Atendimento</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="concave-3d p-1.5">
              {protocol.serviceType === "homecare" ? <Home className="h-4 w-4 text-primary" /> : <Building2 className="h-4 w-4 text-primary" />}
            </div>
            <p className="font-bold uppercase tracking-wide text-xs">{protocol.serviceType === "homecare" ? "Nurse Care" : "Clínica"}</p>
          </div>
          {protocol.unit && <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wide font-medium">{protocol.unit}</p>}
        </CardContent></Card>
        <Card className="panel-3d-sub"><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Início</p>
          <div className="concave-3d px-3 py-1.5 mt-1 inline-block">
            <p className="font-bold tabular-nums text-sm">{format(new Date(protocol.startDate), "dd/MM/yyyy", { locale: ptBR })}</p>
          </div>
          {protocol.professionalName && (
            <div className="flex items-center gap-1.5 mt-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{protocol.professionalName}</p>
            </div>
          )}
        </CardContent></Card>
      </div>

      <Card className="panel-3d">
        <CardHeader>
          <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Substâncias do Protocolo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {protocol.items.map(item => (
              <div key={item.id} className="flex items-center gap-4 p-4 panel-3d-sub">
                <div className="w-1.5 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: item.substanceColor }} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold uppercase tracking-tight text-lg">{item.substanceName}</span>
                    <div className="flex items-center gap-3">
                      <span className="concave-3d px-2 py-0.5 text-[10px] font-bold tabular-nums">{item.dose}</span>
                      <span className="text-sm font-bold text-primary tabular-nums">{item.completedSessions}/{item.totalSessions} <span className="text-[10px] text-muted-foreground uppercase tracking-widest">sessões</span></span>
                    </div>
                  </div>
                  {item.unitPrice > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2">
                      <span>R$ {item.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / ampola</span>
                      <span>×</span>
                      <span>{item.totalSessions} sessões</span>
                      <span>=</span>
                      <span className="text-foreground font-extrabold">R$ {item.lineTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all" style={{ width: `${item.totalSessions > 0 ? (item.completedSessions / item.totalSessions) * 100 : 0}%`, backgroundColor: item.substanceColor }} />
                  </div>
                  <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-2">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Intervalo: {item.intervalDays}d</span>
                    <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> Freq: {item.frequency}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {protocol.items.some(i => i.unitPrice > 0) && (
        <Card className="panel-3d" style={{ borderLeftWidth: "5px", borderLeftColor: "#3D7A7A" }}>
          <CardHeader>
            <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" /> Orçamento — Injetáveis
            </CardTitle>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-2">Valor das ampolas por substância. Visível para a equipe e para o cliente.</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted/50 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    <th className="py-3 pr-3">Substância</th>
                    <th className="py-3 px-3 text-right">Valor Ampola</th>
                    <th className="py-3 px-3 text-center">Sessões</th>
                    <th className="py-3 pl-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted/30">
                  {protocol.items.map(item => (
                    <tr key={item.id} className="neon-hover transition-all">
                      <td className="py-3 pr-3">
                        <span className="inline-flex items-center gap-2 font-bold uppercase tracking-tight">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.substanceColor }} />
                          {item.substanceName}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold tabular-nums">R$ {item.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 px-3 text-center font-bold tabular-nums">{item.totalSessions}</td>
                      <td className="py-3 pl-3 text-right font-bold tabular-nums text-primary">R$ {item.lineTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-primary/20 bg-muted/5">
                    <td className="py-4 pr-3 font-extrabold uppercase tracking-widest text-xs" colSpan={3}>Total do orçamento</td>
                    <td className="py-4 pl-3 text-right">
                      <div className="screen-3d px-3 py-1.5 inline-block">
                        <span className="text-xl font-extrabold tabular-nums text-primary">
                          R$ {protocol.items.reduce((sum, i) => sum + i.lineTotal, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {protocol.sessions.length > 0 && (
        <Card className="panel-3d">
          <CardHeader>
            <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Sessões ({protocol.sessions.length} semanas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {protocol.sessions.map(session => (
                <div key={session.id} className="paxter-underglow flex items-start gap-4 p-4 panel-3d-sub hover:panel-3d-active transition-all">
                  <div className="flex-shrink-0 text-center w-16 concave-3d p-2">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}</div>
                    <div className="text-2xl font-black leading-none tabular-nums text-primary">{format(new Date(session.scheduledDate), "dd")}</div>
                    <div className="text-[9px] text-muted-foreground font-bold mt-1 uppercase tracking-widest">Semana {session.weekNumber}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-1.5 concave-3d px-2 py-1">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-bold tabular-nums">{session.scheduledTime}</span>
                      </div>
                      <Badge className={`text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(session.status)}`}>{formatStatus(session.status)}</Badge>
                      {session.professionalName && (
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest ml-auto flex items-center gap-1">
                          <User className="h-3 w-3" /> {session.professionalName}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {session.substanceApplications.filter(a => a.availability === "disp" && a.sessionNumber > 0).map(app => (
                        <span
                          key={app.id}
                          className="inline-flex items-center text-[10px] px-2.5 py-1 rounded-full text-white font-extrabold uppercase tracking-tight shadow-sm"
                          style={{ backgroundColor: app.status === "applied" ? "#2563eb" : app.substanceColor }}
                        >
                          {app.substanceName} {app.sessionNumber}/{app.totalSessions} {app.status === "applied" ? "(APLICADA)" : "(DISP)"}
                        </span>
                      ))}
                      {session.substanceApplications.filter(a => a.availability === "prox").map(app => (
                        <span key={app.id} className="concave-3d inline-flex items-center text-[10px] px-2.5 py-1 text-muted-foreground font-extrabold uppercase tracking-tight">
                          {app.substanceName} (PROX)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
