import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlanoPitStop } from "./PlanoPitStop";

/** Tela de gerenciamento do agendamento que o médico vê logo após lançar. O plano já está na fila do Pit Stop. */
export function PlanoPitStopDialog({ planoId, open, onOpenChange }: { planoId: number | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open && planoId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agendamento do protocolo (Pit Stop)</DialogTitle>
          <DialogDescription>
            O plano já está na fila do Pit Stop. Se fechar agora, a recepção ou a enfermagem continua de onde você parou; nada é reservado sem confirmação.
          </DialogDescription>
        </DialogHeader>
        {planoId !== null && <PlanoPitStop planoId={planoId} onFechar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
