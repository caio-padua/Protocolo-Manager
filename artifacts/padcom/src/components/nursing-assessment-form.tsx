import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Loader2, CircleAlert, CircleCheck, AlertTriangle, Phone,
} from "lucide-react";

interface NursingAssessmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    id: number;
    clientId: number;
    clientName: string;
    protocolId: number;
    professionalId: number | null;
    scheduledDate: string;
    scheduledTime: string;
    weekNumber: number;
  } | null;
  onSuccess?: () => void;
}

const ALERT_COLORS = [
  { value: "green", label: "BEM", icon: CircleCheck, color: "bg-green-500", textColor: "text-green-700", borderColor: "border-green-500", description: "Cliente está bem, sem intercorrências" },
  { value: "yellow", label: "ATENÇÃO", icon: AlertTriangle, color: "bg-amber-500", textColor: "text-amber-700", borderColor: "border-amber-500", description: "Requer acompanhamento da enfermeira 02" },
  { value: "red", label: "ALERTA", icon: CircleAlert, color: "bg-red-500", textColor: "text-red-700", borderColor: "border-red-500", description: "Gera alerta para enfermeira 02 e médico" },
];

const ADHERENCE_LEVELS = [
  { value: "alta", label: "ALTA" },
  { value: "media", label: "MÉDIA" },
  { value: "baixa", label: "BAIXA" },
];

const TOLERANCE_LEVELS = [
  { value: "excelente", label: "EXCELENTE" },
  { value: "boa", label: "BOA" },
  { value: "regular", label: "REGULAR" },
  { value: "ruim", label: "RUIM" },
];

export function NursingAssessmentForm({ open, onOpenChange, session, onSuccess }: NursingAssessmentFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [existingAssessment, setExistingAssessment] = useState<any>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const [weeklyQuestion, setWeeklyQuestion] = useState("");
  const [alertColor, setAlertColor] = useState("green");
  const [observation, setObservation] = useState("");
  const [adherenceLevel, setAdherenceLevel] = useState("alta");
  const [tolerance, setTolerance] = useState("excelente");
  const [symptoms, setSymptoms] = useState("");
  const [needsTeamContact, setNeedsTeamContact] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (open && session) {
      setCheckingExisting(true);
      fetch(`/api/nursing-assessments/by-session/${session.id}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.id) {
            setExistingAssessment(data);
            setWeeklyQuestion(data.weeklyQuestion);
            setAlertColor(data.alertColor);
            setObservation(data.observation ?? "");
            setAdherenceLevel(data.adherenceLevel);
            setTolerance(data.tolerance);
            setSymptoms(data.symptoms ?? "");
            setNeedsTeamContact(data.needsTeamContact);
            setStartTime(data.startTime ?? "");
            setEndTime(data.endTime ?? "");
          } else {
            resetForm();
          }
        })
        .catch(() => resetForm())
        .finally(() => setCheckingExisting(false));
    }
  }, [open, session?.id]);

  function resetForm() {
    setExistingAssessment(null);
    setWeeklyQuestion("");
    setAlertColor("green");
    setObservation("");
    setAdherenceLevel("alta");
    setTolerance("excelente");
    setSymptoms("");
    setNeedsTeamContact(false);
    setStartTime("");
    setEndTime("");
  }

  async function handleSubmit() {
    if (!session) return;
    if (!weeklyQuestion.trim()) {
      toast({ title: "Preencha o campo obrigatório", description: "A pergunta semanal é obrigatória.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/nursing-assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          clientId: session.clientId,
          protocolId: session.protocolId,
          professionalId: session.professionalId ?? 1,
          weeklyQuestion,
          alertColor,
          observation: observation || null,
          adherenceLevel,
          tolerance,
          symptoms: symptoms || null,
          needsTeamContact,
          startTime: startTime || null,
          endTime: endTime || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const colorLabel = alertColor === "green" ? "BEM" : alertColor === "yellow" ? "ATENÇÃO" : "ALERTA";
        const cardsMsg = data.cardsGenerated > 0 ? ` ${data.cardsGenerated} card(s) gerado(s).` : "";
        toast({
          title: `Avaliação registrada — ${colorLabel}`,
          description: `${session.clientName}.${cardsMsg}`,
        });
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const selectedColor = ALERT_COLORS.find(c => c.value === alertColor)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-teal-600" />
            AVALIAÇÃO DE ENFERMAGEM
          </DialogTitle>
          <DialogDescription>
            {session ? `${session.clientName} — Semana ${session.weekNumber}` : ""}
          </DialogDescription>
        </DialogHeader>

        {checkingExisting ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          </div>
        ) : existingAssessment ? (
          <div className="space-y-4">
            <div className={`rounded-lg p-4 border-2 ${
              existingAssessment.alertColor === "green" ? "border-green-500 bg-green-50" :
              existingAssessment.alertColor === "yellow" ? "border-amber-500 bg-amber-50" :
              "border-red-500 bg-red-50"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {existingAssessment.alertColor === "green" && <CircleCheck className="h-5 w-5 text-green-600" />}
                {existingAssessment.alertColor === "yellow" && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                {existingAssessment.alertColor === "red" && <CircleAlert className="h-5 w-5 text-red-600" />}
                <span className="font-bold uppercase tracking-wider text-sm">
                  Avaliação já registrada — {
                    existingAssessment.alertColor === "green" ? "BEM" :
                    existingAssessment.alertColor === "yellow" ? "ATENÇÃO" : "ALERTA"
                  }
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Semana:</span> {existingAssessment.weeklyQuestion}</p>
                {existingAssessment.observation && <p><span className="font-medium">Observação:</span> {existingAssessment.observation}</p>}
                <p><span className="font-medium">Adesão:</span> {existingAssessment.adherenceLevel?.toUpperCase()}</p>
                <p><span className="font-medium">Tolerância:</span> {existingAssessment.tolerance?.toUpperCase()}</p>
                {existingAssessment.symptoms && <p><span className="font-medium">Sintomas:</span> {existingAssessment.symptoms}</p>}
                {existingAssessment.startTime && <p><span className="font-medium">Horário:</span> {existingAssessment.startTime} — {existingAssessment.endTime}</p>}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">
                COMO FOI SUA ÚLTIMA SEMANA? *
              </Label>
              <Textarea
                value={weeklyQuestion}
                onChange={e => setWeeklyQuestion(e.target.value)}
                placeholder="Relate como o cliente passou a última semana: sono, energia, humor, apetite, dores..."
                className="min-h-[80px] resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider mb-3 block">
                STATUS DO CLIENTE
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {ALERT_COLORS.map(color => {
                  const Icon = color.icon;
                  const isSelected = alertColor === color.value;
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setAlertColor(color.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? `${color.borderColor} ${color.value === "green" ? "bg-green-50" : color.value === "yellow" ? "bg-amber-50" : "bg-red-50"} shadow-md`
                          : "border-muted hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full ${color.color} flex items-center justify-center`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <span className={`text-xs font-bold tracking-wider ${isSelected ? color.textColor : "text-muted-foreground"}`}>
                        {color.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{selectedColor.description}</p>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">
                OBSERVAÇÃO DA ENFERMEIRA
              </Label>
              <Textarea
                value={observation}
                onChange={e => setObservation(e.target.value)}
                placeholder="Observações adicionais sobre o estado do cliente..."
                className="min-h-[60px] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">
                  TOLERÂNCIA
                </Label>
                <Select value={tolerance} onValueChange={setTolerance}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOLERANCE_LEVELS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">
                  ADESÃO
                </Label>
                <Select value={adherenceLevel} onValueChange={setAdherenceLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADHERENCE_LEVELS.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">
                SINTOMAS RELATADOS
              </Label>
              <Textarea
                value={symptoms}
                onChange={e => setSymptoms(e.target.value)}
                placeholder="Dor de cabeça, náusea, cansaço, insônia..."
                className="min-h-[50px] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">
                  INÍCIO DA APLICAÇÃO
                </Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider mb-2 block">
                  FIM DA APLICAÇÃO
                </Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Precisa contato da equipe?</Label>
              </div>
              <Switch
                checked={needsTeamContact}
                onCheckedChange={setNeedsTeamContact}
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={loading || !weeklyQuestion.trim()}
              className={`w-full h-12 text-sm font-bold uppercase tracking-wider gap-2 ${
                alertColor === "green" ? "bg-green-600 hover:bg-green-700" :
                alertColor === "yellow" ? "bg-amber-600 hover:bg-amber-700" :
                "bg-red-600 hover:bg-red-700"
              }`}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              REGISTRAR AVALIAÇÃO — {selectedColor.label}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
