import { useRoute, useLocation } from "wouter";
import { useGetProtocol, useValidateProtocol, useGenerateProtocolICS } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus } from "@/lib/status";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Clock, Download, Home, Building2, User, Zap, Printer, Loader2, FileText, Activity, TrendingDown, Calendar, CheckCircle2, ChevronDown, Layers, Hourglass, Mail, Award, Send, History, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const PAST_STATUSES = ["completed", "cancelled", "expired", "refunded"];
const FALLBACK_COLOR = "#94a3b8";

function ColorChip({ color, className = "" }: { color?: string; className?: string }) {
  return <span className={`rounded-[3px] flex-shrink-0 shadow-inner ${className}`} style={{ backgroundColor: color || FALLBACK_COLOR }} aria-hidden="true" />;
}

/** Cartão kanban de substância: quadradinho de cor à esquerda + nome no mesmo tom. */
function SubstanceTile({
  color, name, counter, applied = false, muted = false, extra,
}: {
  color?: string; name: string; counter?: string; applied?: boolean; muted?: boolean; extra?: string;
}) {
  const c = color || FALLBACK_COLOR;
  return (
    <div className={`flex items-center gap-3 p-2.5 panel-3d-sub ${muted ? "opacity-75" : ""}`}>
      <ColorChip color={c} className="w-4 h-9" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {applied && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />}
          <span className="font-bold uppercase tracking-tight text-sm truncate" style={{ color: c }}>{name}</span>
        </div>
        {extra && <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5 truncate">{extra}</p>}
      </div>
      {counter && <span className="concave-3d px-2 py-0.5 text-[10px] font-bold tabular-nums flex-shrink-0">{counter}</span>}
    </div>
  );
}

export default function ProtocolDetail() {
  const [, params] = useRoute("/protocols/:id");
  const [, setLocation] = useLocation();
  const id = params ? parseInt(params.id) : 0;
  const { toast } = useToast();
  const [physicalRasLoading, setPhysicalRasLoading] = useState(false);
  const [reenviarRasLoading, setReenviarRasLoading] = useState(false);
  const [documentPdfLoading, setDocumentPdfLoading] = useState(false);
  const [cartaPdfLoading, setCartaPdfLoading] = useState(false);
  const [emitirLoading, setEmitirLoading] = useState(false);
  const [emitirConfirm, setEmitirConfirm] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showBudget, setShowBudget] = useState(false);

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

  const isPast = PAST_STATUSES.includes(protocol.status);
  const hasSessions = protocol.sessions.length > 0;

  const allApps = protocol.sessions.flatMap(s =>
    s.substanceApplications.map(a => ({ ...a, sessionDate: s.scheduledDate, weekNumber: s.weekNumber }))
  );
  const appliedApps = allApps.filter(a => a.availability === "disp" && a.status === "applied" && a.sessionNumber > 0);
  const pendingApps = allApps.filter(a => a.availability === "disp" && a.status !== "applied" && a.sessionNumber > 0);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* R3 — Barra de identidade persistente (sticky) */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-8 -mt-4 md:-mt-8 px-4 md:px-8 py-2.5 bg-background/95 backdrop-blur border-b border-border/60 flex items-center gap-2.5">
        <Activity className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="font-black uppercase tracking-tight text-sm truncate">{protocol.title}</span>
        {isPast ? (
          <span className="concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground flex-shrink-0">Encerrado</span>
        ) : (
          <span className="bevel-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary inline-flex items-center gap-1.5 flex-shrink-0">
            <span className="paxter-led paxter-led-on" aria-hidden="true" /> Atual
          </span>
        )}
        <span className="ml-auto concave-3d px-2 py-0.5 text-[10px] font-bold tabular-nums flex-shrink-0">{protocol.completedSessions}/{protocol.totalSessions}</span>
      </div>

      {/* R1 — Toolbar alinhada */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" className="btn-3d-soft" onClick={() => setLocation("/protocols")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div className="flex flex-wrap items-center gap-2">
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
                className="btn-3d-soft"
                disabled={reenviarRasLoading}
                onClick={async () => {
                  setReenviarRasLoading(true);
                  try {
                    const resp = await fetch(`${import.meta.env.BASE_URL}api/ras/physical/${id}/reenviar-email`, { method: "POST" });
                    const body = await resp.json().catch(() => null);
                    if (!resp.ok) {
                      throw new Error(body?.error || "Erro ao reenviar RAS FAP");
                    }
                    toast({ title: "RAS FAP reenviado!", description: body?.message ?? "E-mail enviado ao paciente com sucesso." });
                  } catch (err: any) {
                    toast({ title: "Erro ao reenviar", description: err.message, variant: "destructive" });
                  } finally {
                    setReenviarRasLoading(false);
                  }
                }}
              >
                {reenviarRasLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                {reenviarRasLoading ? "Enviando..." : "Reenviar RAS FAP"}
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
              {/* Emitir ao Paciente — ação distinta com efeitos colaterais (Drive + e-mail + cadernos) */}
              {emitirConfirm ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(protocol as any).emissoes?.length > 0 ? (
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Já emitido em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date((protocol as any).emissoes[0].emitidoAt))}. Enviar novamente?
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground font-medium">Enviar e-mail real ao paciente?</span>
                  )}
                  <Button
                    size="sm"
                    className="btn-3d h-8 px-3 text-xs"
                    disabled={emitirLoading}
                    onClick={async () => {
                      setEmitirLoading(true);
                      setEmitirConfirm(false);
                      try {
                        const resp = await fetch(`${import.meta.env.BASE_URL}api/protocols/${id}/emit-document`, { method: "POST" });
                        const body = await resp.json().catch(() => null);
                        if (body?.auditFailed) {
                          // Entrega ocorreu mas registro de auditoria falhou — mostrar aviso específico
                          toast({
                            title: "Entrega concluída — auditoria falhou",
                            description: body?.error ?? "Protocolo entregue, mas o histórico não foi gravado. Acionar suporte.",
                            variant: "destructive",
                          });
                          refetch();
                          return;
                        }
                        if (!resp.ok) {
                          throw new Error(body?.details || body?.error || "Erro ao emitir protocolo");
                        }
                        toast({
                          title: body?.emailSent ? "Protocolo emitido!" : "Protocolo enviado ao Drive",
                          description: body?.message ?? "Concluído.",
                        });
                        refetch();
                      } catch (err: any) {
                        toast({ title: "Erro ao emitir", description: err.message, variant: "destructive" });
                      } finally {
                        setEmitirLoading(false);
                      }
                    }}
                  >
                    {emitirLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirmar"}
                  </Button>
                  <Button size="sm" variant="ghost" className="btn-3d-soft h-8 px-3 text-xs" onClick={() => setEmitirConfirm(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  className="btn-3d"
                  disabled={emitirLoading}
                  onClick={() => setEmitirConfirm(true)}
                >
                  {emitirLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  {emitirLoading ? "Emitindo..." : "Emitir ao Paciente"}
                </Button>
              )}
              <Button
                className="btn-3d"
                disabled={cartaPdfLoading}
                onClick={async () => {
                  setCartaPdfLoading(true);
                  try {
                    const resp = await fetch(`${import.meta.env.BASE_URL}api/protocols/${id}/carta-pdf`);
                    if (!resp.ok) {
                      const err = await resp.json().catch(() => null);
                      throw new Error(err?.details || err?.error || "Erro ao gerar Carta de Tratamento");
                    }
                    const cd = resp.headers.get("Content-Disposition");
                    const m = cd?.match(/filename="(.+)"/);
                    const nomeArquivo = m?.[1] ?? `CARTA_TRATAMENTO_${id}.pdf`;

                    // ABRE EM ABA NOVA, nao baixa. Baixar obriga a procurar o
                    // arquivo na pasta e depender do leitor instalado — e leitor
                    // que nao entende assinatura digital mostra tela em branco.
                    // Em aba nova quem desenha e o proprio Chrome, que le PDF
                    // assinado sem reclamar.
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
                    const aba = window.open(url, "_blank");

                    if (!aba) {
                      // Bloqueador de pop-up ligado: cai para o download, para
                      // o clique nunca terminar em nada.
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = nomeArquivo;
                      a.click();
                      toast({ title: "Carta baixada", description: "O navegador bloqueou a aba nova, entao o arquivo foi baixado." });
                    } else {
                      toast({ title: "Carta de Tratamento aberta em nova aba", description: "PDF premium com capa, mapa de ênfases e assinatura digital." });
                    }

                    // Revogar na hora mataria a aba recem-aberta: ela ainda esta
                    // lendo desta URL. Solta a memoria um minuto depois.
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  } finally {
                    setCartaPdfLoading(false);
                  }
                }}
              >
                {cartaPdfLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Award className="h-4 w-4 mr-1" />}
                {cartaPdfLoading ? "Gerando..." : "Carta Premium"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* R2 — Painel-herói de identidade (ATUAL x PASSADO) */}
      <Card className="panel-3d" style={{ borderLeftWidth: "5px", borderLeftColor: isPast ? "#94a3b8" : "#16294a" }}>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              {isPast ? (
                <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 mb-2 grayscale opacity-90">
                  <Hourglass className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Protocolo Encerrado · {formatStatus(protocol.status)}</span>
                </div>
              ) : (
                <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 mb-2">
                  <span className="paxter-led paxter-led-on" aria-hidden="true" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Protocolo Atual · Em Andamento</span>
                </div>
              )}
              <h1 className="text-2xl font-black uppercase tracking-tight leading-tight">{protocol.title}</h1>
              <p className="text-muted-foreground text-sm uppercase tracking-wide font-medium mt-1">
                {protocol.clientName} — <span className="tabular-nums">CPF: {protocol.clientCpf}</span>
              </p>
            </div>
            <div className="screen-3d px-4 py-2.5 text-center flex-shrink-0">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-black mb-0.5">Progresso</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-3xl font-black tabular-nums text-primary leading-none">{protocol.completedSessions}</span>
                <span className="text-muted-foreground text-sm">/</span>
                <span className="text-lg font-bold text-muted-foreground tabular-nums">{protocol.totalSessions}</span>
              </div>
              <div className="mt-2 h-2 w-28 bg-muted/30 rounded-[2px] shadow-inner overflow-hidden">
                <div className="h-full rounded-[2px]" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, hsl(214 54% 19%) 0%, hsl(39 41% 51%) 100%)" }} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de emissões oficiais */}
      {(protocol as any).emissoes?.length > 0 && (
        <Card className="panel-3d-sub border-l-4" style={{ borderLeftColor: "#16294a" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-widest text-primary">Histórico de Entregas Oficiais</span>
              <span className="ml-auto concave-3d px-2 py-0.5 text-[10px] font-black tabular-nums">{(protocol as any).emissoes.length}</span>
            </div>
            <div className="space-y-2">
              {(protocol as any).emissoes.map((e: any, i: number) => (
                <div key={e.id} className={`flex items-start gap-3 p-2.5 rounded-[6px] ${i === 0 ? "bevel-3d" : "concave-3d opacity-75"}`}>
                  <div className="flex-shrink-0 mt-0.5">
                    {e.emailSent
                      ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      : <Mail className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold tabular-nums">
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(e.emitidoAt))}
                      </span>
                      {i === 0 && (
                        <span className="bevel-3d px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">Mais recente</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] font-bold uppercase tracking-widest">
                      <span className="flex items-center gap-1 text-muted-foreground"><User className="h-3 w-3" /> {e.autorizadoPor}</span>
                      <span className={e.emailSent ? "text-green-600 dark:text-green-400" : "text-rose-500 dark:text-rose-400"}>
                        {e.emailSent ? "E-mail ✓" : e.emailError ? `E-mail ✗ ${e.emailError}` : "E-mail não enviado"}
                      </span>
                      <span className={e.driveUploaded ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                        {e.driveUploaded ? "Drive ✓" : "Drive —"}
                      </span>
                      <span className="text-muted-foreground">
                        {e.cadernosCount > 0 ? `${e.cadernosCount} caderno${e.cadernosCount !== 1 ? "s" : ""}` : "Sem cadernos"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="panel-3d-sub"><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Sessões</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums">{protocol.completedSessions}</span>
            <span className="text-muted-foreground text-sm">/</span>
            <span className="text-lg font-semibold text-muted-foreground tabular-nums">{protocol.totalSessions}</span>
          </div>
          <div className="mt-3 h-2 bg-muted/30 rounded-[2px] shadow-inner overflow-hidden">
            <div className="h-full bg-primary rounded-[2px]" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, hsl(214 54% 19%) 0%, hsl(39 41% 51%) 100%)" }} />
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

      {/* R4 — APLICADAS x A APLICAR (centro do redesign) */}
      {hasSessions && (
        <Card className="panel-3d">
          <CardHeader>
            <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Aplicadas x A Aplicar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Coluna A — APLICADAS */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-green-700 dark:text-green-400 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Aplicadas
                  </span>
                  <span className="concave-3d px-2 py-0.5 text-[10px] font-black tabular-nums">{appliedApps.length}</span>
                </div>
                {appliedApps.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold p-3">Nenhuma aplicação registrada ainda.</p>
                ) : (
                  appliedApps.map(app => (
                    <SubstanceTile
                      key={app.id}
                      color={app.substanceColor}
                      name={app.substanceName}
                      counter={`${app.sessionNumber}/${app.totalSessions}`}
                      applied
                      extra={format(new Date(app.sessionDate), "dd/MM/yyyy", { locale: ptBR })}
                    />
                  ))
                )}
              </div>
              {/* Coluna B — A APLICAR */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
                    <Hourglass className="h-4 w-4" /> A Aplicar
                  </span>
                  <span className="concave-3d px-2 py-0.5 text-[10px] font-black tabular-nums">{pendingApps.length}</span>
                </div>
                {pendingApps.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold p-3">Todas as aplicações foram concluídas.</p>
                ) : (
                  pendingApps.map(app => (
                    <SubstanceTile
                      key={app.id}
                      color={app.substanceColor}
                      name={app.substanceName}
                      counter={`${app.sessionNumber}/${app.totalSessions}`}
                      muted
                      extra={format(new Date(app.sessionDate), "dd/MM/yyyy", { locale: ptBR })}
                    />
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* R8 — Catálogo de substâncias do protocolo (kanban + progresso) */}
      <Card className="panel-3d">
        <CardHeader>
          <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Substâncias do Protocolo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {protocol.items.map(item => {
              const done = item.totalSessions > 0 && item.completedSessions >= item.totalSessions;
              const itemPct = item.totalSessions > 0 ? (item.completedSessions / item.totalSessions) * 100 : 0;
              return (
                <div key={item.id} className="flex items-stretch gap-3 p-4 panel-3d-sub">
                  <ColorChip color={item.substanceColor} className="w-4 self-stretch" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <span className="font-bold uppercase tracking-tight text-lg inline-flex items-center gap-1.5 min-w-0" style={{ color: item.substanceColor || FALLBACK_COLOR }}>
                        {done && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />}
                        <span className="truncate">{item.substanceName}</span>
                      </span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="concave-3d px-2 py-0.5 text-[10px] font-bold tabular-nums">{item.dose}</span>
                        <span className="text-sm font-bold text-primary tabular-nums">{item.completedSessions}/{item.totalSessions} <span className="text-[10px] text-muted-foreground uppercase tracking-widest">sessões</span></span>
                      </div>
                    </div>
                    {item.unitPrice > 0 && (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2 flex-wrap">
                        <span>R$ {item.unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / ampola</span>
                        <span>×</span>
                        <span>{item.totalSessions} sessões</span>
                        <span>=</span>
                        <span className="text-foreground font-extrabold">R$ {item.lineTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="h-2 bg-muted/30 rounded-[2px] overflow-hidden shadow-inner">
                      <div className="h-full rounded-[2px] transition-all" style={{ width: `${itemPct}%`, backgroundColor: item.substanceColor || FALLBACK_COLOR }} />
                    </div>
                    <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-2">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Intervalo: {item.intervalDays}d</span>
                      <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> Freq: {item.frequency}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* R9 — Orçamento (colapsável) */}
      {protocol.items.some(i => i.unitPrice > 0) && (
        <Card className="panel-3d" style={{ borderLeftWidth: "5px", borderLeftColor: "#16294a" }}>
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowBudget(v => !v)}
              className="w-full flex items-center justify-between gap-2 neon-hover rounded-[6px]"
            >
              <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-primary" /> Orçamento — Injetáveis
              </CardTitle>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground pr-1">
                {showBudget ? "Ocultar" : "Ver orçamento"}
                <ChevronDown className={`h-4 w-4 transition-transform ${showBudget ? "rotate-180" : ""}`} />
              </span>
            </button>
          </CardHeader>
          {showBudget && (
            <CardContent>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-3">Valor das ampolas por substância. Visível para a equipe e para o cliente.</p>
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
                            <ColorChip color={item.substanceColor} className="w-3 h-3" />
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
          )}
        </Card>
      )}

      {/* R9/R10 — Linha do tempo das sessões (colapsável) */}
      {protocol.sessions.length > 0 && (
        <Card className="panel-3d">
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowTimeline(v => !v)}
              className="w-full flex items-center justify-between gap-2 neon-hover rounded-[6px]"
            >
              <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Linha do Tempo — Sessões ({protocol.sessions.length})
              </CardTitle>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground pr-1">
                {showTimeline ? "Ocultar" : "Ver sessões"}
                <ChevronDown className={`h-4 w-4 transition-transform ${showTimeline ? "rotate-180" : ""}`} />
              </span>
            </button>
          </CardHeader>
          {showTimeline && (
            <CardContent>
              <div className="space-y-4">
                {protocol.sessions.map(session => (
                  <div key={session.id} className="flex items-start gap-4 p-4 panel-3d-sub">
                    <div className="flex-shrink-0 text-center w-16 concave-3d p-2">
                      <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}</div>
                      <div className="text-2xl font-black leading-none tabular-nums text-primary">{format(new Date(session.scheduledDate), "dd")}</div>
                      <div className="text-[9px] text-muted-foreground font-bold mt-1 uppercase tracking-widest">Semana {session.weekNumber}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <div className="flex items-center gap-1.5 concave-3d px-2 py-1">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-bold tabular-nums">{session.scheduledTime}</span>
                        </div>
                        <span className="concave-3d px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{formatStatus(session.status)}</span>
                        {session.professionalName && (
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest ml-auto flex items-center gap-1">
                            <User className="h-3 w-3" /> {session.professionalName}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {session.substanceApplications.filter(a => a.availability === "disp" && a.sessionNumber > 0).map(app => (
                          <SubstanceTile
                            key={app.id}
                            color={app.substanceColor}
                            name={app.substanceName}
                            counter={`${app.sessionNumber}/${app.totalSessions}`}
                            applied={app.status === "applied"}
                            muted={app.status !== "applied"}
                          />
                        ))}
                        {session.substanceApplications.filter(a => a.availability === "prox").map(app => (
                          <SubstanceTile
                            key={app.id}
                            color={app.substanceColor}
                            name={app.substanceName}
                            extra="Próxima"
                            muted
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
